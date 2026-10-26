-- Milestone 4, unit 18: agreements (specs/milestone-4.md;
-- specs/state-model.md §1, §4 and §6, with D4 and A1–A6 as approved by
-- the owner on 2026-10-20).
--
-- Accepting a proposal (Milestone 3) creates the agreement row; here
-- it gains versions, handover confirmations and cancellation
-- requests. Members read through row-level security (only the two
-- parties) and write only through the functions below. Every write
-- function:
--   1. requires a signed-in caller and an idempotency key, recorded
--      first;
--   2. locks the agreement (FOR UPDATE), then any offer it names
--      (FOR SHARE);
--   3. checks, in order: the caller is a party (404 otherwise), the
--      agreement's status, the exact version or request the caller
--      saw (409 otherwise), then who may act (403 otherwise);
--   4. writes the change and exactly one agreement event, and stores
--      the response with the key, in the same transaction.
-- Limits mirror packages/shared/src/agreements (parity.db.test.ts).
-- A1: no fee liability or payment is created here.

-- Reference data ----------------------------------------------------

create table private.agreement_limits (name text primary key, value integer not null);
insert into private.agreement_limits (name, value) values
  ('cancelReasonMin', 3),
  ('cancelReasonMax', 500);

create function private.agreement_limit(p_name text) returns integer
language sql stable
set search_path = ''
as $$ select l.value from private.agreement_limits l where l.name = p_name $$;

-- Tables ------------------------------------------------------------

alter table public.agreements drop constraint agreements_status_check;
alter table public.agreements
  add constraint agreements_status_check
    check (status in ('active', 'amendment_pending', 'cancellation_requested', 'completed', 'cancelled')),
  -- Counts every change, so a page can tell it is out of date.
  add column revision integer not null default 1 check (revision >= 1),
  -- The latest version both parties accepted (state-model.md §6).
  add column binding_version_id uuid,
  add column updated_at timestamptz not null default now(),
  add column completed_at timestamptz,
  add column cancelled_at timestamptz,
  add constraint agreements_two_members check (proposer_id <> owner_id),
  add constraint agreements_completed_at check ((status = 'completed') = (completed_at is not null)),
  add constraint agreements_cancelled_at check ((status = 'cancelled') = (cancelled_at is not null));

create index agreements_by_proposer on public.agreements (proposer_id, updated_at desc, id desc);
create index agreements_by_owner on public.agreements (owner_id, updated_at desc, id desc);

-- Terms as in proposal_revisions, with the same snapshots. Version 1
-- is the accepted revision. Only `outcome` and `resolved_at` ever
-- change, and only forward (backstops below).
create table public.agreement_versions (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  number integer not null check (number >= 1),
  proposed_by uuid not null,
  gives jsonb not null check (jsonb_typeof(gives) = 'array'),
  gets jsonb not null check (jsonb_typeof(gets) = 'array'),
  cash_naira integer check (cash_naira between 1 and 100000000),
  cash_payer text check (cash_payer in ('proposer', 'owner')),
  note text not null default '' check (char_length(note) <= 1000 and note = private.trim_text(note)),
  outcome text not null check (outcome in ('binding', 'pending', 'rejected', 'withdrawn', 'superseded')),
  created_at timestamptz not null default now(),
  -- When it became binding, or was rejected or withdrawn.
  resolved_at timestamptz,
  constraint agreement_versions_number unique (agreement_id, number),
  constraint agreement_versions_cash check ((cash_naira is null) = (cash_payer is null)),
  constraint agreement_versions_resolved check ((outcome = 'pending') = (resolved_at is null))
);

-- At most one pending version and exactly one binding version (§6.2).
create unique index agreement_versions_one_pending on public.agreement_versions (agreement_id) where outcome = 'pending';
create unique index agreement_versions_one_binding on public.agreement_versions (agreement_id) where outcome = 'binding';

alter table public.agreements
  add constraint agreements_binding_version foreign key (binding_version_id)
  references public.agreement_versions (id) deferrable initially deferred;

-- §6.1: one row per party, ever, recording the version confirmed.
create table public.handover_confirmations (
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  party_id uuid not null,
  version_id uuid not null references public.agreement_versions (id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (agreement_id, party_id)
);

create table public.cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  requested_by uuid not null,
  reason text not null check (char_length(reason) between 3 and 500 and reason = private.trim_text(reason)),
  created_at timestamptz not null default now(),
  outcome text check (outcome in ('accepted', 'rejected', 'withdrawn')),
  resolved_by uuid,
  resolved_at timestamptz,
  constraint cancellation_requests_resolved check ((outcome is null) = (resolved_at is null) and (outcome is null) = (resolved_by is null))
);

create unique index cancellation_requests_one_open on public.cancellation_requests (agreement_id) where outcome is null;
create index cancellation_requests_by_agreement on public.cancellation_requests (agreement_id, created_at desc);

-- The audit trail for agreements. A null actor is the system.
create table public.agreement_events (
  id bigint generated always as identity primary key,
  agreement_id uuid not null,
  actor_id uuid,
  action text not null check (action in (
    'create', 'handover', 'propose_change', 'accept_change', 'reject_change', 'withdraw_change',
    'request_cancel', 'accept_cancel', 'reject_cancel', 'withdraw_cancel')),
  from_status text,
  to_status text not null,
  -- The binding version's number after the event.
  version integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index agreement_events_by_agreement on public.agreement_events (agreement_id, id);

-- Photo files a version's snapshots point to, kept as for proposals.
create table public.agreement_snapshot_photos (
  version_id uuid not null references public.agreement_versions (id) on delete cascade,
  agreement_id uuid not null references public.agreements (id) on delete cascade,
  path text not null,
  primary key (version_id, path)
);

create index agreement_snapshot_photos_by_path on public.agreement_snapshot_photos (path);

-- Backstops ---------------------------------------------------------

-- The transitions of state-model.md §6. `completed` needs both
-- confirmations (§6.1); `completed` and `cancelled` are final.
create function private.check_agreement_status_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    if (old.status, new.status) not in (
      ('active', 'amendment_pending'), ('active', 'cancellation_requested'), ('active', 'completed'),
      ('amendment_pending', 'active'), ('cancellation_requested', 'active'), ('cancellation_requested', 'cancelled')
    ) then
      raise exception using errcode = '23514', message = format('Agreement status change %s -> %s is not allowed.', old.status, new.status);
    end if;
    if new.status = 'completed'
      and (select count(*) from public.handover_confirmations h where h.agreement_id = new.id) <> 2 then
      raise exception using errcode = '23514', message = 'An agreement completes only when both parties have confirmed handover.';
    end if;
  end if;
  return new;
end;
$$;

create trigger agreements_status_change_allowed
before update of status on public.agreements
for each row execute function private.check_agreement_status_change();

-- Accepted versions are never edited: only the outcome moves forward.
create function private.check_agreement_version_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.id, new.agreement_id, new.number, new.proposed_by, new.gives, new.gets, new.cash_naira, new.cash_payer, new.note, new.created_at)
     is distinct from
     (old.id, old.agreement_id, old.number, old.proposed_by, old.gives, old.gets, old.cash_naira, old.cash_payer, old.note, old.created_at)
    or (old.outcome, new.outcome) not in (
      ('pending', 'binding'), ('pending', 'rejected'), ('pending', 'withdrawn'), ('binding', 'superseded'))
    or (old.outcome = 'binding' and new.resolved_at is distinct from old.resolved_at) then
    raise exception using errcode = '23514', message = 'Agreement versions cannot be changed.';
  end if;
  return new;
end;
$$;

create trigger agreement_versions_forward_only
before update on public.agreement_versions
for each row execute function private.check_agreement_version_change();

-- Confirmations cannot be undone or edited (D4); snapshots are fixed.
create trigger handover_confirmations_fixed
before update on public.handover_confirmations
for each row execute function private.reject_revision_change();

create trigger agreement_snapshot_photos_fixed
before update on public.agreement_snapshot_photos
for each row execute function private.reject_revision_change();

-- A request is answered once; its reason never changes.
create function private.check_cancellation_request_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.outcome is not null
    or (new.id, new.agreement_id, new.requested_by, new.reason, new.created_at)
       is distinct from (old.id, old.agreement_id, old.requested_by, old.reason, old.created_at) then
    raise exception using errcode = '23514', message = 'Cancellation requests cannot be changed once answered.';
  end if;
  return new;
end;
$$;

create trigger cancellation_requests_answer_once
before update on public.cancellation_requests
for each row execute function private.check_cancellation_request_change();

-- Row-level security ------------------------------------------------

alter table public.agreement_versions enable row level security;
alter table public.handover_confirmations enable row level security;
alter table public.cancellation_requests enable row level security;
alter table public.agreement_events enable row level security;
alter table public.agreement_snapshot_photos enable row level security;
alter table private.agreement_limits enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.agreement_versions, public.handover_confirmations, public.cancellation_requests,
     public.agreement_events, public.agreement_snapshot_photos
  from anon, authenticated;
revoke all on private.agreement_limits from public, anon, authenticated;

create policy "agreement versions: when the agreement is readable" on public.agreement_versions
for select to authenticated
using (exists (select 1 from public.agreements a where a.id = agreement_versions.agreement_id));

create policy "handover confirmations: when the agreement is readable" on public.handover_confirmations
for select to authenticated
using (exists (select 1 from public.agreements a where a.id = handover_confirmations.agreement_id));

create policy "cancellation requests: when the agreement is readable" on public.cancellation_requests
for select to authenticated
using (exists (select 1 from public.agreements a where a.id = cancellation_requests.agreement_id));

create policy "agreement events: when the agreement is readable" on public.agreement_events
for select to authenticated
using (exists (select 1 from public.agreements a where a.id = agreement_events.agreement_id));

create policy "agreement snapshot photos: when the agreement is readable" on public.agreement_snapshot_photos
for select to authenticated
using (exists (select 1 from public.agreements a where a.id = agreement_snapshot_photos.agreement_id));

create policy "offer photos: readable in an agreement the viewer is party to" on storage.objects
for select to authenticated
using (
  bucket_id = 'offer-photos'
  and exists (select 1 from public.agreement_snapshot_photos s where s.path = objects.name)
);

-- Keeping snapshot files ---------------------------------------------

create or replace function private.skip_retained_cleanup() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.proposal_snapshot_photos s where s.path = new.path)
    or exists (select 1 from public.agreement_snapshot_photos s where s.path = new.path) then
    return null;
  end if;
  return new;
end;
$$;

create or replace function public.storage_orphaned_files(
  p_older_than interval default interval '24 hours',
  p_limit integer default 500
) returns table (path text)
language sql stable security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'offer-photos'
    and o.created_at < now() - p_older_than
    and not exists (
      select 1 from public.offer_photos p where p.display_path = o.name or p.thumb_path = o.name
    )
    and not exists (select 1 from public.proposal_snapshot_photos s where s.path = o.name)
    and not exists (select 1 from public.agreement_snapshot_photos s where s.path = o.name)
    and not exists (select 1 from private.storage_cleanup_queue q where q.path = o.name)
  order by o.created_at, o.name
  limit greatest(p_limit, 0)
$$;

-- Terms -------------------------------------------------------------

-- As private.clean_terms (Milestone 3), plus `p_keep`: offer items
-- already in the binding version ({gives, gets}). A kept item stays
-- exactly as agreed, snapshot and all, whatever the live offer has
-- done since (state-model.md §4), so a change can keep an item whose
-- listing was closed after agreeing. Every other offer item follows
-- the counter rules.
create function private.clean_terms(p_terms jsonb, p_target public.offers, p_proposer uuid, p_new boolean, p_keep jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_allowed public.offer_status[] := case when p_new then array['active']::public.offer_status[] else array['active', 'paused']::public.offer_status[] end;
  v_max integer := private.proposal_limit('itemsPerSideMax');
  v_text_min integer := private.proposal_limit('textItemMin');
  v_text_max integer := private.proposal_limit('textItemMax');
  v_side text;
  v_items jsonb;
  v_item jsonb;
  v_kept jsonb;
  v_out jsonb;
  v_result jsonb := '{}';
  v_seen uuid[] := '{}';
  v_offer_id uuid;
  v_offer public.offers;
  v_description text;
  v_target_count integer;
  v_cash jsonb := p_terms -> 'cash';
  v_cash_naira integer;
  v_cash_payer text;
  v_note text;
begin
  if jsonb_typeof(p_terms) is distinct from 'object'
    or exists (select 1 from jsonb_object_keys(p_terms) k where k not in ('gives', 'gets', 'cash', 'note')) then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"terms": "invalid"}}');
  end if;
  foreach v_side in array array['gives', 'gets'] loop
    v_items := p_terms -> v_side;
    if jsonb_typeof(v_items) is distinct from 'array' or jsonb_array_length(v_items) not between 1 and v_max then
      perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_side, 'count')));
    end if;
    v_out := '[]';
    v_target_count := 0;
    for v_item in select value from jsonb_array_elements(v_items) loop
      if jsonb_typeof(v_item) <> 'object' then
        perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_side, 'invalid')));
      end if;
      if v_item ->> 'kind' = 'offer'
        and (select array_agg(k order by k) from jsonb_object_keys(v_item) k) = array['kind', 'offer_id'] then
        v_offer_id := private.uuid_or_null(v_item ->> 'offer_id');
        if v_offer_id is null then
          perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_side, 'invalid')));
        end if;
        if v_offer_id = any (v_seen) then
          perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_side, 'duplicate')));
        end if;
        v_seen := v_seen || v_offer_id;
        if v_side = 'gets' and v_offer_id <> p_target.id then
          perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"gets": "target"}}');
        end if;
        if v_offer_id = p_target.id then
          v_target_count := v_target_count + 1;
        end if;
        select k into v_kept from jsonb_array_elements(coalesce(p_keep -> v_side, '[]')) k
        where k ->> 'kind' = 'offer' and k ->> 'offer_id' = v_offer_id::text;
        if v_kept is not null then
          v_out := v_out || jsonb_build_array(v_kept);
          v_kept := null;
          continue;
        end if;
        if v_side = 'gets' then
          v_offer := p_target;
        else
          select * into v_offer from public.offers o where o.id = v_offer_id for share;
          if not found or v_offer.owner_id <> p_proposer or not (v_offer.status = any (v_allowed)) then
            perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"gives": "offer_unavailable"}}');
          end if;
        end if;
        v_out := v_out || jsonb_build_array(jsonb_build_object(
          'kind', 'offer', 'offer_id', v_offer.id, 'content_version', v_offer.content_version,
          'snapshot', private.offer_snapshot(v_offer.id)));
      elsif v_item ->> 'kind' = 'text'
        and (select array_agg(k order by k) from jsonb_object_keys(v_item) k) = array['description', 'kind']
        and jsonb_typeof(v_item -> 'description') = 'string' then
        v_description := private.trim_text(v_item ->> 'description');
        if char_length(v_description) not between v_text_min and v_text_max then
          perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_side, 'text_length')));
        end if;
        v_out := v_out || jsonb_build_array(jsonb_build_object('kind', 'text', 'description', v_description));
      else
        perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_side, 'invalid')));
      end if;
    end loop;
    if v_side = 'gets' and v_target_count <> 1 then
      perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"gets": "target"}}');
    end if;
    if v_side = 'gives' and v_target_count <> 0 then
      perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"gives": "offer_unavailable"}}');
    end if;
    v_result := v_result || jsonb_build_object(v_side, v_out);
  end loop;
  if v_cash is not null and jsonb_typeof(v_cash) <> 'null' then
    if jsonb_typeof(v_cash) = 'object'
      and (select array_agg(k order by k) from jsonb_object_keys(v_cash) k) = array['amount_naira', 'payer']
      and jsonb_typeof(v_cash -> 'amount_naira') = 'number' then
      v_cash_payer := v_cash ->> 'payer';
      if (v_cash ->> 'amount_naira') ~ '^\d{1,9}$' then
        v_cash_naira := (v_cash ->> 'amount_naira')::integer;
      end if;
    end if;
    if v_cash_naira is null or v_cash_payer is null
      or v_cash_naira not between private.proposal_limit('cashNairaMin') and private.proposal_limit('cashNairaMax')
      or v_cash_payer not in ('proposer', 'owner') then
      perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"cash": "invalid"}}');
    end if;
  end if;
  if p_terms ? 'note' and jsonb_typeof(p_terms -> 'note') not in ('string', 'null') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"note": "invalid"}}');
  end if;
  v_note := private.trim_text(coalesce(p_terms ->> 'note', ''));
  if char_length(v_note) > private.proposal_limit('noteMax') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"note": "too_long"}}');
  end if;
  return v_result || jsonb_build_object('cash_naira', v_cash_naira, 'cash_payer', v_cash_payer, 'note', v_note);
end;
$$;

-- Offer items whose live offer is gone, not active or paused, or at a
-- different content version than the item.
create function private.changed_items(p_items jsonb) returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(i ->> 'offer_id' order by i ->> 'offer_id'), '[]')
  from jsonb_array_elements(p_items) i
  left join public.offers o on o.id = (i ->> 'offer_id')::uuid
  where i ->> 'kind' = 'offer'
    and (o.id is null or o.status not in ('active', 'paused') or o.content_version <> (i ->> 'content_version')::integer)
$$;

-- The offer items a pending change adds: not in the binding version at
-- the same content version. Only these must still match their listing
-- when the change is accepted.
create function private.new_items(p_pending public.agreement_versions, p_binding public.agreement_versions) returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(i), '[]')
  from jsonb_array_elements(p_pending.gives || p_pending.gets) i
  where i ->> 'kind' = 'offer'
    and not exists (
      select 1 from jsonb_array_elements(p_binding.gives || p_binding.gets) b
      where b ->> 'offer_id' = i ->> 'offer_id' and b ->> 'content_version' = i ->> 'content_version')
$$;

create function private.insert_agreement_version(
  p_id uuid, p_agreement_id uuid, p_number integer, p_by uuid, p_terms jsonb, p_outcome text
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.agreement_versions (id, agreement_id, number, proposed_by, gives, gets, cash_naira, cash_payer, note, outcome, resolved_at)
  values (
    p_id, p_agreement_id, p_number, p_by, p_terms -> 'gives', p_terms -> 'gets',
    (p_terms ->> 'cash_naira')::integer, p_terms ->> 'cash_payer', coalesce(p_terms ->> 'note', ''),
    p_outcome, case when p_outcome = 'pending' then null else now() end
  );
  insert into public.agreement_snapshot_photos (version_id, agreement_id, path)
  select distinct p_id, p_agreement_id, x
  from jsonb_array_elements((p_terms -> 'gives') || (p_terms -> 'gets')) i,
       lateral (values (i #>> '{snapshot,photo,display_path}'), (i #>> '{snapshot,photo,thumb_path}')) v (x)
  where x is not null;
end;
$$;

create function private.agreement_event(
  p_agreement public.agreements, p_actor uuid, p_action text, p_from text, p_note text default null
) returns void
language sql
set search_path = ''
as $$
  insert into public.agreement_events (agreement_id, actor_id, action, from_status, to_status, version, note)
  values (
    p_agreement.id, p_actor, p_action, p_from, p_agreement.status,
    (select v.number from public.agreement_versions v where v.id = p_agreement.binding_version_id), p_note)
$$;

-- Version 1 ---------------------------------------------------------

-- Accepting a proposal inserts the agreement (proposal_accept); its
-- version 1 is the accepted revision, accepted by both (§6).
create function private.agreement_binding_id() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.binding_version_id := coalesce(new.binding_version_id, gen_random_uuid());
  return new;
end;
$$;

create function private.agreement_version_one() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_revision public.proposal_revisions;
begin
  select * into v_revision from public.proposal_revisions r where r.id = new.revision_id;
  perform private.insert_agreement_version(
    new.binding_version_id, new.id, 1, v_revision.author_id,
    jsonb_build_object('gives', v_revision.gives, 'gets', v_revision.gets, 'cash_naira', v_revision.cash_naira,
                       'cash_payer', v_revision.cash_payer, 'note', v_revision.note),
    'binding');
  perform private.agreement_event(new, (select auth.uid()), 'create', null);
  return null;
end;
$$;

create trigger agreements_binding_id
before insert on public.agreements
for each row execute function private.agreement_binding_id();

create trigger agreements_version_one
after insert on public.agreements
for each row execute function private.agreement_version_one();

-- Agreements made before this migration get their version 1 too.
do $$
declare
  v_agreement public.agreements;
  v_revision public.proposal_revisions;
begin
  for v_agreement in
    update public.agreements set binding_version_id = gen_random_uuid() where binding_version_id is null returning *
  loop
    select * into v_revision from public.proposal_revisions r where r.id = v_agreement.revision_id;
    perform private.insert_agreement_version(
      v_agreement.binding_version_id, v_agreement.id, 1, v_revision.author_id,
      jsonb_build_object('gives', v_revision.gives, 'gets', v_revision.gets, 'cash_naira', v_revision.cash_naira,
                         'cash_payer', v_revision.cash_payer, 'note', v_revision.note),
      'binding');
    perform private.agreement_event(v_agreement, null, 'create', null);
  end loop;
end;
$$;

alter table public.agreements alter column binding_version_id set not null;

-- Views -------------------------------------------------------------

create function private.agreement_version_json(p_version public.agreement_versions) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_version.id,
    'number', p_version.number,
    'proposed_by', p_version.proposed_by,
    'outcome', p_version.outcome,
    'gives', p_version.gives,
    'gets', p_version.gets,
    'cash', case when p_version.cash_naira is null then null
                 else jsonb_build_object('amount_naira', p_version.cash_naira, 'payer', p_version.cash_payer) end,
    'note', p_version.note,
    'created_at', p_version.created_at,
    'resolved_at', p_version.resolved_at
  )
$$;

create function private.cancellation_request_json(p_request public.cancellation_requests) returns jsonb
language sql stable
set search_path = ''
as $$
  select case when p_request.id is null then null else jsonb_build_object(
    'id', p_request.id,
    'requested_by', p_request.requested_by,
    'reason', p_request.reason,
    'created_at', p_request.created_at,
    'outcome', p_request.outcome,
    'resolved_at', p_request.resolved_at
  ) end
$$;

-- A1: the fee shares, as information only, from the target offer's
-- current fee quote. The offer's owner is party A.
create function private.agreement_fee_json(p_offer_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total_kobo', q.total_fee_kobo,
    'owner_share_kobo', q.party_a_share_kobo,
    'proposer_share_kobo', q.party_b_share_kobo,
    'requires_reconfirmation', q.requires_reconfirmation
  )
  from public.fee_quotes q
  join public.valuation_submissions s on s.id = q.submission_id
  where s.offer_id = p_offer_id and q.status = 'current'
  order by q.created_at desc
  limit 1
$$;

-- The parts every view of an agreement shares.
create function private.agreement_core_json(p_agreement public.agreements, p_viewer uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_agreement.id,
    'proposal_id', p_agreement.proposal_id,
    'offer_id', p_agreement.offer_id,
    'status', p_agreement.status,
    'revision', p_agreement.revision,
    'created_at', p_agreement.created_at,
    'updated_at', p_agreement.updated_at,
    'completed_at', p_agreement.completed_at,
    'cancelled_at', p_agreement.cancelled_at,
    'viewer_role', case when p_viewer = p_agreement.owner_id then 'owner' else 'proposer' end,
    'proposer', private.member_json(p_agreement.proposer_id),
    'owner', private.member_json(p_agreement.owner_id),
    'offer', (select jsonb_build_object('id', o.id, 'title', o.title, 'status', o.status)
              from public.offers o where o.id = p_agreement.offer_id),
    'binding_version_id', p_agreement.binding_version_id,
    'confirmed_by', (select coalesce(jsonb_agg(h.party_id order by h.confirmed_at), '[]')
                     from public.handover_confirmations h where h.agreement_id = p_agreement.id),
    'pending_by', (select v.proposed_by from public.agreement_versions v
                   where v.agreement_id = p_agreement.id and v.outcome = 'pending'),
    'cancel_requested_by', (select c.requested_by from public.cancellation_requests c
                            where c.agreement_id = p_agreement.id and c.outcome is null)
  )
$$;

-- An agreement as either party reads it, every version included.
create function private.agreement_json(p_agreement_id uuid, p_viewer uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select private.agreement_core_json(a, p_viewer) || jsonb_build_object(
    'versions', (select jsonb_agg(private.agreement_version_json(v) order by v.number)
                 from public.agreement_versions v where v.agreement_id = a.id),
    'confirmations', (select coalesce(jsonb_agg(jsonb_build_object(
                        'party_id', h.party_id, 'version_id', h.version_id, 'confirmed_at', h.confirmed_at)
                        order by h.confirmed_at), '[]')
                      from public.handover_confirmations h where h.agreement_id = a.id),
    -- The latest request, answered or not: a cancelled agreement shows its reason.
    'cancellation', (select private.cancellation_request_json(c) from public.cancellation_requests c
                     where c.agreement_id = a.id order by c.created_at desc limit 1),
    -- "The listing has changed since you agreed" (state-model.md §4).
    'listing_changed', (select jsonb_array_length(private.changed_items(v.gives || v.gets)) > 0
                        from public.agreement_versions v where v.id = a.binding_version_id),
    -- Items a pending change adds whose listing changed since: accepting it is TERMS_CHANGED.
    'pending_changed_offer_ids', coalesce((
      select private.changed_items(private.new_items(p, b))
      from public.agreement_versions p, public.agreement_versions b
      where p.agreement_id = a.id and p.outcome = 'pending' and b.id = a.binding_version_id), '[]'),
    'fee', private.agreement_fee_json(a.offer_id),
    -- A2: the viewer's own offers in the agreed terms that are still
    -- listed, to prompt closing them once the agreement completes.
    'my_listed_offers', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title) order by o.title), '[]')
      from public.agreement_versions v
      cross join lateral jsonb_array_elements(v.gives || v.gets) i
      join public.offers o on o.id = (i ->> 'offer_id')::uuid
      where v.id = a.binding_version_id and i ->> 'kind' = 'offer'
        and o.owner_id = p_viewer and o.status in ('active', 'paused')
    ),
    -- What the proposer can give in a change: their active offers.
    'gives_choices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title,
        'thumb_path', (select ph.thumb_path from public.offer_photos ph where ph.offer_id = o.id order by ph.position limit 1)
      ) order by o.published_at desc), '[]')
      from public.offers o
      where o.owner_id = a.proposer_id and o.status = 'active' and a.status = 'active'
    )
  )
  from public.agreements a
  where a.id = p_agreement_id
$$;

-- One row of a list: the other member and the binding terms.
create function private.agreement_summary_json(p_agreement_id uuid, p_viewer uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select private.agreement_core_json(a, p_viewer) || jsonb_build_object(
    'terms', (select private.agreement_version_json(v) from public.agreement_versions v where v.id = a.binding_version_id)
  )
  from public.agreements a
  where a.id = p_agreement_id
$$;

-- Locks ---------------------------------------------------------------

-- Locks the agreement for a write by `p_actor` and checks it is theirs
-- (404 otherwise). With `p_open`, a completed or cancelled agreement is
-- a CONFLICT.
create function private.lock_agreement(p_agreement_id uuid, p_actor uuid, p_open boolean default true) returns public.agreements
language plpgsql
set search_path = ''
as $$
declare
  v_agreement public.agreements;
begin
  select * into v_agreement from public.agreements a
  where a.id = p_agreement_id and p_actor in (a.proposer_id, a.owner_id)
  for update;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if p_open and v_agreement.status in ('completed', 'cancelled') then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_agreement.status));
  end if;
  return v_agreement;
end;
$$;

create function private.require_agreement_status(p_agreement public.agreements, p_status text) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_agreement.status <> p_status then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', p_agreement.status));
  end if;
end;
$$;

-- Moves the agreement to `p_status` and counts the change.
create function private.agreement_set(p_agreement_id uuid, p_status text) returns public.agreements
language sql
set search_path = ''
as $$
  update public.agreements a
  set status = p_status,
      revision = a.revision + 1,
      updated_at = now(),
      completed_at = case when p_status = 'completed' then now() else a.completed_at end,
      cancelled_at = case when p_status = 'cancelled' then now() else a.cancelled_at end
  where a.id = p_agreement_id
  returning *
$$;

-- Handover (§6.1) -----------------------------------------------------

create function public.agreement_handover(p_agreement_id uuid, p_version_id uuid, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_agreement public.agreements;
  v_from text;
  v_count integer;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/agreements/:id/handover', p_agreement_id,
    private.request_hash(jsonb_build_object('version_id', p_version_id)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_agreement := private.lock_agreement(p_agreement_id, v_actor, false);
  -- Already confirmed: the existing confirmation, no new row or event.
  if exists (select 1 from public.handover_confirmations h where h.agreement_id = v_agreement.id and h.party_id = v_actor) then
    v_response := private.agreement_json(v_agreement.id, v_actor);
    perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_agreement.id);
    return v_response;
  end if;
  if v_agreement.status in ('completed', 'cancelled') then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_agreement.status));
  end if;
  perform private.require_agreement_status(v_agreement, 'active');
  -- Confirming applies to the terms the member saw: the binding version.
  if p_version_id is distinct from v_agreement.binding_version_id then
    perform private.fail('CONFLICT', 409, '{"reason": "stale_version"}');
  end if;
  insert into public.handover_confirmations (agreement_id, party_id, version_id)
  values (v_agreement.id, v_actor, v_agreement.binding_version_id);
  select count(*) into v_count from public.handover_confirmations h where h.agreement_id = v_agreement.id;
  v_from := v_agreement.status;
  v_agreement := private.agreement_set(v_agreement.id, case when v_count = 2 then 'completed' else 'active' end);
  perform private.agreement_event(v_agreement, v_actor, 'handover', v_from);
  v_response := private.agreement_json(v_agreement.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_agreement.id);
  return v_response;
end;
$$;

-- Changes (§6.2) ------------------------------------------------------

create function public.agreement_change_propose(
  p_agreement_id uuid, p_expected_version integer, p_terms jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_agreement public.agreements;
  v_binding public.agreement_versions;
  v_target public.offers;
  v_terms jsonb;
  v_number integer;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/agreements/:id/changes', p_agreement_id,
    private.request_hash(jsonb_build_object('expected_version', p_expected_version, 'terms', p_terms)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_agreement := private.lock_agreement(p_agreement_id, v_actor);
  perform private.require_agreement_status(v_agreement, 'active');
  select * into v_binding from public.agreement_versions v where v.id = v_agreement.binding_version_id;
  if p_expected_version is null then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"expected_version": "required"}}');
  end if;
  if v_binding.number <> p_expected_version then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'stale_version', 'current_version', v_binding.number));
  end if;
  -- D4: changes only before any handover is confirmed.
  if exists (select 1 from public.handover_confirmations h where h.agreement_id = v_agreement.id) then
    perform private.fail('CONFLICT', 409, '{"reason": "handover_started"}');
  end if;
  select * into v_target from public.offers o where o.id = v_agreement.offer_id for share;
  v_terms := private.clean_terms(p_terms, v_target, v_agreement.proposer_id, false,
    jsonb_build_object('gives', v_binding.gives, 'gets', v_binding.gets));
  if private.terms_key(v_terms -> 'gives', v_terms -> 'gets', (v_terms ->> 'cash_naira')::integer, v_terms ->> 'cash_payer')
     = private.terms_key(v_binding.gives, v_binding.gets, v_binding.cash_naira, v_binding.cash_payer) then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"terms": "unchanged"}}');
  end if;
  select max(v.number) + 1 into v_number from public.agreement_versions v where v.agreement_id = v_agreement.id;
  perform private.insert_agreement_version(gen_random_uuid(), v_agreement.id, v_number, v_actor, v_terms, 'pending');
  v_agreement := private.agreement_set(v_agreement.id, 'amendment_pending');
  perform private.agreement_event(v_agreement, v_actor, 'propose_change', 'active');
  v_response := private.agreement_json(v_agreement.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_agreement.id);
  return v_response;
end;
$$;

create function private.agreement_change_resolve(
  p_action text, p_agreement_id uuid, p_version_id uuid, p_idempotency_key uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_agreement public.agreements;
  v_pending public.agreement_versions;
  v_binding public.agreement_versions;
  v_new jsonb;
  v_changed jsonb;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/agreements/:id/changes/:version_id/' || p_action, p_agreement_id,
    private.request_hash(jsonb_build_object('version_id', p_version_id)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_agreement := private.lock_agreement(p_agreement_id, v_actor);
  perform private.require_agreement_status(v_agreement, 'amendment_pending');
  select * into v_pending from public.agreement_versions v
  where v.agreement_id = v_agreement.id and v.outcome = 'pending'
  for update;
  -- It must be the exact pending version the member saw.
  if p_version_id is distinct from v_pending.id then
    perform private.fail('CONFLICT', 409, '{"reason": "stale_version"}');
  end if;
  if p_action = 'withdraw' then
    if v_pending.proposed_by <> v_actor then
      perform private.fail('FORBIDDEN', 403, '{"reason": "not_proposer"}');
    end if;
  elsif v_pending.proposed_by = v_actor then
    perform private.fail('FORBIDDEN', 403, '{"reason": "own_change"}');
  end if;
  if p_action = 'accept' then
    select * into v_binding from public.agreement_versions v where v.id = v_agreement.binding_version_id for update;
    v_new := private.new_items(v_pending, v_binding);
    perform 1 from public.offers o
    where o.id in (select (i ->> 'offer_id')::uuid from jsonb_array_elements(v_new) i)
    order by o.id
    for share;
    v_changed := private.changed_items(v_new);
    if jsonb_array_length(v_changed) > 0 then
      perform private.fail('TERMS_CHANGED', 409, jsonb_build_object('reason', 'terms_changed', 'offer_ids', v_changed));
    end if;
    update public.agreement_versions set outcome = 'superseded' where id = v_binding.id;
    update public.agreement_versions set outcome = 'binding', resolved_at = now() where id = v_pending.id;
    update public.agreements set binding_version_id = v_pending.id where id = v_agreement.id;
  else
    update public.agreement_versions
    set outcome = case when p_action = 'reject' then 'rejected' else 'withdrawn' end, resolved_at = now()
    where id = v_pending.id;
  end if;
  v_agreement := private.agreement_set(v_agreement.id, 'active');
  perform private.agreement_event(v_agreement, v_actor, p_action || '_change', 'amendment_pending');
  v_response := private.agreement_json(v_agreement.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_agreement.id);
  return v_response;
end;
$$;

create function public.agreement_change_accept(p_agreement_id uuid, p_version_id uuid, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.agreement_change_resolve('accept', p_agreement_id, p_version_id, p_idempotency_key) $$;

create function public.agreement_change_reject(p_agreement_id uuid, p_version_id uuid, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.agreement_change_resolve('reject', p_agreement_id, p_version_id, p_idempotency_key) $$;

create function public.agreement_change_withdraw(p_agreement_id uuid, p_version_id uuid, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.agreement_change_resolve('withdraw', p_agreement_id, p_version_id, p_idempotency_key) $$;

-- Cancellation ------------------------------------------------------

create function public.agreement_cancel_request(p_agreement_id uuid, p_reason text, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_agreement public.agreements;
  v_reason text := private.trim_text(coalesce(p_reason, ''));
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/agreements/:id/cancellation', p_agreement_id,
    private.request_hash(jsonb_build_object('reason', p_reason)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_agreement := private.lock_agreement(p_agreement_id, v_actor);
  -- A3: allowed after a handover; only from active (§6).
  perform private.require_agreement_status(v_agreement, 'active');
  if char_length(v_reason) not between private.agreement_limit('cancelReasonMin') and private.agreement_limit('cancelReasonMax') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"reason": "length"}}');
  end if;
  insert into public.cancellation_requests (agreement_id, requested_by, reason) values (v_agreement.id, v_actor, v_reason);
  v_agreement := private.agreement_set(v_agreement.id, 'cancellation_requested');
  perform private.agreement_event(v_agreement, v_actor, 'request_cancel', 'active', v_reason);
  v_response := private.agreement_json(v_agreement.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_agreement.id);
  return v_response;
end;
$$;

create function private.agreement_cancel_resolve(
  p_action text, p_agreement_id uuid, p_request_id uuid, p_idempotency_key uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_agreement public.agreements;
  v_request public.cancellation_requests;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/agreements/:id/cancellation/' || p_action, p_agreement_id,
    private.request_hash(jsonb_build_object('request_id', p_request_id)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_agreement := private.lock_agreement(p_agreement_id, v_actor);
  perform private.require_agreement_status(v_agreement, 'cancellation_requested');
  select * into v_request from public.cancellation_requests c
  where c.agreement_id = v_agreement.id and c.outcome is null
  for update;
  if p_request_id is distinct from v_request.id then
    perform private.fail('CONFLICT', 409, '{"reason": "stale_request"}');
  end if;
  if p_action = 'withdraw' then
    if v_request.requested_by <> v_actor then
      perform private.fail('FORBIDDEN', 403, '{"reason": "not_requester"}');
    end if;
  elsif v_request.requested_by = v_actor then
    perform private.fail('FORBIDDEN', 403, '{"reason": "own_request"}');
  end if;
  update public.cancellation_requests
  set outcome = case p_action when 'accept' then 'accepted' when 'reject' then 'rejected' else 'withdrawn' end,
      resolved_by = v_actor,
      resolved_at = now()
  where id = v_request.id;
  v_agreement := private.agreement_set(v_agreement.id, case when p_action = 'accept' then 'cancelled' else 'active' end);
  perform private.agreement_event(v_agreement, v_actor, p_action || '_cancel', 'cancellation_requested');
  v_response := private.agreement_json(v_agreement.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_agreement.id);
  return v_response;
end;
$$;

create function public.agreement_cancel_accept(p_agreement_id uuid, p_request_id uuid, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.agreement_cancel_resolve('accept', p_agreement_id, p_request_id, p_idempotency_key) $$;

create function public.agreement_cancel_reject(p_agreement_id uuid, p_request_id uuid, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.agreement_cancel_resolve('reject', p_agreement_id, p_request_id, p_idempotency_key) $$;

create function public.agreement_cancel_withdraw(p_agreement_id uuid, p_request_id uuid, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.agreement_cancel_resolve('withdraw', p_agreement_id, p_request_id, p_idempotency_key) $$;

-- Reads -------------------------------------------------------------

create or replace function public.agreement_get(p_agreement_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not exists (select 1 from public.agreements a where a.id = p_agreement_id and v_actor in (a.proposer_id, a.owner_id)) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return private.agreement_json(p_agreement_id, v_actor);
end;
$$;

-- A6: the viewer's agreements, `active` (Agreed tab: active, change
-- proposed, cancellation requested) or `closed` (completed and
-- cancelled), newest activity first, paged by (updated_at, id).
create function public.agreement_list(
  p_box text, p_before_updated_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_ids uuid[];
  v_updated timestamptz[];
  v_items jsonb;
begin
  if p_box is null or p_box not in ('active', 'closed') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"box": "invalid"}}');
  end if;
  select coalesce(array_agg(a.id order by a.updated_at desc, a.id desc), '{}'),
         coalesce(array_agg(a.updated_at order by a.updated_at desc, a.id desc), '{}')
  into v_ids, v_updated
  from (
    select a.id, a.updated_at from public.agreements a
    where v_actor in (a.proposer_id, a.owner_id)
      and (a.status in ('completed', 'cancelled')) = (p_box = 'closed')
      and (p_before_updated_at is null or p_before_id is null or (a.updated_at, a.id) < (p_before_updated_at, p_before_id))
    order by a.updated_at desc, a.id desc
    limit v_limit + 1
  ) a;
  select coalesce(jsonb_agg(private.agreement_summary_json(x.id, v_actor) order by x.n), '[]') into v_items
  from unnest(v_ids[1:v_limit]) with ordinality as x (id, n);
  return jsonb_build_object(
    'items', v_items,
    'next', case when cardinality(v_ids) > v_limit
                 then jsonb_build_object('updated_at', v_updated[v_limit], 'id', v_ids[v_limit]) end);
end;
$$;

-- A6: accepted proposals now live under their agreement, so Closed
-- lists only proposals that ended without one.
create or replace function public.proposal_list(
  p_box text, p_before_updated_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_ids uuid[];
  v_updated timestamptz[];
  v_items jsonb;
begin
  if p_box is null or p_box not in ('turn', 'waiting', 'closed') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"box": "invalid"}}');
  end if;
  select coalesce(array_agg(p.id order by p.updated_at desc, p.id desc), '{}'),
         coalesce(array_agg(p.updated_at order by p.updated_at desc, p.id desc), '{}')
  into v_ids, v_updated
  from (
    select p.id, p.updated_at from public.proposals p
    where v_actor in (p.proposer_id, p.owner_id)
      and case p_box
        when 'turn' then p.status = 'open' and p.expires_at > now() and p.latest_author_id <> v_actor
        when 'waiting' then p.status = 'open' and p.expires_at > now() and p.latest_author_id = v_actor
        else p.status not in ('open', 'accepted') or (p.status = 'open' and p.expires_at <= now())
      end
      and (p_before_updated_at is null or p_before_id is null or (p.updated_at, p.id) < (p_before_updated_at, p_before_id))
    order by p.updated_at desc, p.id desc
    limit v_limit + 1
  ) p;
  select coalesce(jsonb_agg(private.proposal_summary_json(x.id, v_actor) order by x.n), '[]') into v_items
  from unnest(v_ids[1:v_limit]) with ordinality as x (id, n);
  return jsonb_build_object(
    'items', v_items,
    'next', case when cardinality(v_ids) > v_limit
                 then jsonb_build_object('updated_at', v_updated[v_limit], 'id', v_ids[v_limit]) end);
end;
$$;

-- P5 and A5: what waits on the viewer. `turn`: proposals; `agreements`:
-- a change or cancellation to answer, or a handover to confirm after
-- the other party has.
create or replace function public.proposal_counts() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'turn', (
      select count(*) from public.proposals p
      where (select auth.uid()) in (p.proposer_id, p.owner_id)
        and p.status = 'open' and p.expires_at > now() and p.latest_author_id <> (select auth.uid())),
    'agreements', (
      select count(*) from public.agreements a
      where (select auth.uid()) in (a.proposer_id, a.owner_id)
        and case a.status
          when 'amendment_pending' then exists (
            select 1 from public.agreement_versions v
            where v.agreement_id = a.id and v.outcome = 'pending' and v.proposed_by <> (select auth.uid()))
          when 'cancellation_requested' then exists (
            select 1 from public.cancellation_requests c
            where c.agreement_id = a.id and c.outcome is null and c.requested_by <> (select auth.uid()))
          when 'active' then
            exists (select 1 from public.handover_confirmations h where h.agreement_id = a.id and h.party_id <> (select auth.uid()))
            and not exists (select 1 from public.handover_confirmations h where h.agreement_id = a.id and h.party_id = (select auth.uid()))
          else false
        end)
  )
$$;

-- Privileges --------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.agreement_handover(uuid, uuid, uuid),
  public.agreement_change_propose(uuid, integer, jsonb, uuid),
  public.agreement_change_accept(uuid, uuid, uuid),
  public.agreement_change_reject(uuid, uuid, uuid),
  public.agreement_change_withdraw(uuid, uuid, uuid),
  public.agreement_cancel_request(uuid, text, uuid),
  public.agreement_cancel_accept(uuid, uuid, uuid),
  public.agreement_cancel_reject(uuid, uuid, uuid),
  public.agreement_cancel_withdraw(uuid, uuid, uuid),
  public.agreement_list(text, timestamptz, uuid, integer)
from public, anon, authenticated;

grant execute on function
  public.agreement_handover(uuid, uuid, uuid),
  public.agreement_change_propose(uuid, integer, jsonb, uuid),
  public.agreement_change_accept(uuid, uuid, uuid),
  public.agreement_change_reject(uuid, uuid, uuid),
  public.agreement_change_withdraw(uuid, uuid, uuid),
  public.agreement_cancel_request(uuid, text, uuid),
  public.agreement_cancel_accept(uuid, uuid, uuid),
  public.agreement_cancel_reject(uuid, uuid, uuid),
  public.agreement_cancel_withdraw(uuid, uuid, uuid),
  public.agreement_list(text, timestamptz, uuid, integer)
to authenticated;
