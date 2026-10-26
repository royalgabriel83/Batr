-- Milestone 3, unit 13: proposals, their revisions and agreement
-- records (specs/milestone-3.md; specs/state-model.md §1, §3–5, with
-- D1–D3 as decided by the owner on 2026-10-20 and P1–P6 as approved).
--
-- Members read through row-level security (only the two parties) and
-- write only through the functions below. Every write function:
--   1. requires a signed-in caller and an idempotency key, recorded
--      first (as for offers);
--   2. locks the target offer (FOR SHARE), then the proposal
--      (FOR UPDATE), in that order everywhere, so closing an offer and
--      acting on its proposals never interleave;
--   3. checks, in order: the caller is a party (404 otherwise), the
--      proposal is open and unexpired, the revision the caller last
--      saw, then whose turn it is;
--   4. writes the change and exactly one proposal event, and stores
--      the response with the key, in the same transaction.
-- Limits mirror packages/shared/src/proposals (parity.db.test.ts).

-- Reference data ----------------------------------------------------

create type public.proposal_status as enum ('open', 'accepted', 'declined', 'withdrawn', 'expired');

create table private.proposal_limits (name text primary key, value integer not null);
insert into private.proposal_limits (name, value) values
  ('itemsPerSideMax', 3),
  ('textItemMin', 3),
  ('textItemMax', 200),
  ('noteMax', 1000),
  ('cashNairaMin', 1),
  ('cashNairaMax', 100000000),
  ('expiryDays', 14);

create function private.proposal_limit(p_name text) returns integer
language sql stable
set search_path = ''
as $$ select l.value from private.proposal_limits l where l.name = p_name $$;

-- Tables ------------------------------------------------------------

create table public.proposals (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  status public.proposal_status not null default 'open',
  -- The latest revision's number, id and author. The turn party is the
  -- other member.
  revision integer not null check (revision >= 1),
  latest_revision_id uuid not null,
  latest_author_id uuid not null,
  -- P3: 14 days after the latest revision.
  expires_at timestamptz not null,
  -- Set when the system closed it: the offer was closed (D2).
  close_reason text check (close_reason in ('offer_closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint proposals_two_members check (proposer_id <> owner_id),
  constraint proposals_author_is_party check (latest_author_id in (proposer_id, owner_id)),
  constraint proposals_closed_at check ((status = 'open') = (closed_at is null))
);

-- One open proposal per member and offer (milestone-3.md, Create).
create unique index proposals_one_open on public.proposals (offer_id, proposer_id) where status = 'open';
create index proposals_by_proposer on public.proposals (proposer_id, updated_at desc, id desc);
create index proposals_by_owner on public.proposals (owner_id, updated_at desc, id desc);
create index proposals_open_by_offer on public.proposals (offer_id) where status = 'open';
create index proposals_open_expiry on public.proposals (expires_at) where status = 'open';

-- Append-only. Each item in `gives` and `gets` is
--   {"kind": "offer", "offer_id", "content_version", "snapshot": {...}}
--   {"kind": "text", "description"}
-- and the snapshot is written once, here (state-model.md §3).
create table public.proposal_revisions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  number integer not null check (number >= 1),
  author_id uuid not null,
  gives jsonb not null check (jsonb_typeof(gives) = 'array'),
  gets jsonb not null check (jsonb_typeof(gets) = 'array'),
  cash_naira integer check (cash_naira between 1 and 100000000),
  cash_payer text check (cash_payer in ('proposer', 'owner')),
  note text not null default '' check (char_length(note) <= 1000 and note = private.trim_text(note)),
  created_at timestamptz not null default now(),
  constraint proposal_revisions_number unique (proposal_id, number),
  constraint proposal_revisions_cash check ((cash_naira is null) = (cash_payer is null))
);

alter table public.proposals
  add constraint proposals_latest_revision foreign key (latest_revision_id)
  references public.proposal_revisions (id) deferrable initially deferred;

-- P4: what accepting creates. Handover, amendments and cancellation
-- come with Milestone 4.
create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null unique references public.proposals (id) on delete cascade,
  revision_id uuid not null references public.proposal_revisions (id) on delete cascade,
  offer_id uuid not null,
  proposer_id uuid not null,
  owner_id uuid not null,
  status text not null default 'active' check (status in ('active')),
  created_at timestamptz not null default now()
);

-- The audit trail for proposals (state-model.md §1, step 4). No
-- foreign key, as for offer audit events. A null actor is the system.
create table public.proposal_events (
  id bigint generated always as identity primary key,
  proposal_id uuid not null,
  actor_id uuid,
  action text not null check (action in ('create', 'counter', 'accept', 'decline', 'withdraw', 'auto_decline', 'expire')),
  from_status public.proposal_status,
  to_status public.proposal_status not null,
  revision integer not null,
  note text,
  created_at timestamptz not null default now()
);

create index proposal_events_by_proposal on public.proposal_events (proposal_id, id);

-- Photo files a snapshot points to. They stay in storage, readable by
-- both parties, after the owner removes the photo from the live offer
-- (milestone-3.md, In scope).
create table public.proposal_snapshot_photos (
  revision_id uuid not null references public.proposal_revisions (id) on delete cascade,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  path text not null,
  primary key (revision_id, path)
);

create index proposal_snapshot_photos_by_path on public.proposal_snapshot_photos (path);

-- Backstops ---------------------------------------------------------

-- Every status other than open is final (state-model.md §5).
create function private.check_proposal_status_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status and old.status <> 'open' then
    raise exception using errcode = '23514', message = format('Proposal status change %s -> %s is not allowed.', old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger proposals_status_change_allowed
before update of status on public.proposals
for each row execute function private.check_proposal_status_change();

create function private.reject_revision_change() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '23514', message = 'Proposal revisions and snapshots cannot be changed.';
end;
$$;

create trigger proposal_revisions_append_only
before update on public.proposal_revisions
for each row execute function private.reject_revision_change();

create trigger proposal_snapshot_photos_append_only
before update on public.proposal_snapshot_photos
for each row execute function private.reject_revision_change();

-- Row-level security ------------------------------------------------

alter table public.proposals enable row level security;
alter table public.proposal_revisions enable row level security;
alter table public.agreements enable row level security;
alter table public.proposal_events enable row level security;
alter table public.proposal_snapshot_photos enable row level security;
alter table private.proposal_limits enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.proposals, public.proposal_revisions, public.agreements, public.proposal_events, public.proposal_snapshot_photos
  from anon, authenticated;
revoke all on private.proposal_limits from public, anon, authenticated;

-- P6 and Privacy: only the two members. Everyone else sees nothing.
create policy "proposals: the two members" on public.proposals
for select to authenticated
using ((select auth.uid()) in (proposer_id, owner_id));

create policy "proposal revisions: when the proposal is readable" on public.proposal_revisions
for select to authenticated
using (exists (select 1 from public.proposals p where p.id = proposal_revisions.proposal_id));

create policy "proposal events: when the proposal is readable" on public.proposal_events
for select to authenticated
using (exists (select 1 from public.proposals p where p.id = proposal_events.proposal_id));

create policy "proposal snapshot photos: when the proposal is readable" on public.proposal_snapshot_photos
for select to authenticated
using (exists (select 1 from public.proposals p where p.id = proposal_snapshot_photos.proposal_id));

create policy "agreements: the two members" on public.agreements
for select to authenticated
using ((select auth.uid()) in (proposer_id, owner_id));

-- Snapshot photos: readable (and so signable) by either party.
create policy "offer photos: readable in a snapshot the viewer is party to" on storage.objects
for select to authenticated
using (
  bucket_id = 'offer-photos'
  and exists (select 1 from public.proposal_snapshot_photos s where s.path = objects.name)
);

-- Keeping snapshot files ---------------------------------------------

-- A file a snapshot points to is never queued for deletion.
create function private.skip_retained_cleanup() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.proposal_snapshot_photos s where s.path = new.path) then
    return null;
  end if;
  return new;
end;
$$;

create trigger storage_cleanup_queue_skip_retained
before insert on private.storage_cleanup_queue
for each row execute function private.skip_retained_cleanup();

-- The server deletes only paths still queued (server/storage/deleter.ts),
-- so a retained snapshot file that a function also returned is kept.
create function public.storage_cleanup_queued(p_paths text[]) returns text[]
language sql stable security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct q.path), '{}') from private.storage_cleanup_queue q where q.path = any (p_paths)
$$;

-- As before, and a file a snapshot points to is not an orphan.
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
    and not exists (select 1 from private.storage_cleanup_queue q where q.path = o.name)
  order by o.created_at, o.name
  limit greatest(p_limit, 0)
$$;

-- Helpers -----------------------------------------------------------

create function private.uuid_or_null(p_value text) returns uuid
language sql immutable
set search_path = ''
as $$
  select case when p_value ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid end
$$;

-- What a snapshot copies (state-model.md §3): every material field and
-- the cover photo.
create function private.offer_snapshot(p_offer_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'title', o.title,
    'description', o.description,
    'condition', o.condition,
    'category', o.category,
    'offering_text', o.offering_text,
    'wants_text', o.wants_text,
    'photo', (
      select jsonb_build_object(
        'display_path', p.display_path, 'thumb_path', p.thumb_path,
        'width', p.width, 'height', p.height, 'alt_text', p.alt_text)
      from public.offer_photos p where p.offer_id = o.id order by p.position limit 1
    )
  )
  from public.offers o
  where o.id = p_offer_id
$$;

-- Checks terms from a request and returns them with snapshots:
-- {gives, gets, cash_naira, cash_payer, note}. `p_new` is true for a
-- new proposal (every offer active); counters accept paused offers too
-- (D3). Rules as packages/shared TermsInputSchema, plus who owns each
-- offer. Offers named are locked FOR SHARE until commit.
create function private.clean_terms(p_terms jsonb, p_target public.offers, p_proposer uuid, p_new boolean) returns jsonb
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
        if v_side = 'gets' then
          -- You get: this offer, plus described items.
          if v_offer_id <> p_target.id then
            perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"gets": "target"}}');
          end if;
          v_target_count := v_target_count + 1;
          v_offer := p_target;
        else
          -- You give: the proposer's own active (or, in a counter, paused) offers.
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
    v_result := v_result || jsonb_build_object(v_side, v_out);
  end loop;
  if v_cash is not null and jsonb_typeof(v_cash) <> 'null' then
    -- Checked step by step: SQL does not promise to stop at the first false.
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

-- What makes terms the same terms: the items on each side (an offer at
-- its content version, or the exact description), in any order, and
-- the cash. The note is not material (state-model.md §3).
create function private.terms_key(p_gives jsonb, p_gets jsonb, p_cash_naira integer, p_cash_payer text) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'gives', (
      select coalesce(jsonb_agg(k order by k), '[]')
      from (
        select case when i ->> 'kind' = 'offer' then 'offer:' || (i ->> 'offer_id') || '@' || (i ->> 'content_version')
                    else 'text:' || (i ->> 'description') end as k
        from jsonb_array_elements(p_gives) i
      ) s
    ),
    'gets', (
      select coalesce(jsonb_agg(k order by k), '[]')
      from (
        select case when i ->> 'kind' = 'offer' then 'offer:' || (i ->> 'offer_id') || '@' || (i ->> 'content_version')
                    else 'text:' || (i ->> 'description') end as k
        from jsonb_array_elements(p_gets) i
      ) s
    ),
    'cash_naira', p_cash_naira,
    'cash_payer', p_cash_payer
  )
$$;

-- Writes one revision and keeps its snapshot photo files.
create function private.insert_revision(
  p_id uuid, p_proposal_id uuid, p_number integer, p_author uuid, p_terms jsonb
) returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.proposal_revisions (id, proposal_id, number, author_id, gives, gets, cash_naira, cash_payer, note)
  values (
    p_id, p_proposal_id, p_number, p_author, p_terms -> 'gives', p_terms -> 'gets',
    (p_terms ->> 'cash_naira')::integer, p_terms ->> 'cash_payer', p_terms ->> 'note'
  );
  insert into public.proposal_snapshot_photos (revision_id, proposal_id, path)
  select distinct p_id, p_proposal_id, x
  from jsonb_array_elements((p_terms -> 'gives') || (p_terms -> 'gets')) i,
       lateral (values (i #>> '{snapshot,photo,display_path}'), (i #>> '{snapshot,photo,thumb_path}')) v (x)
  where x is not null;
end;
$$;

create function private.proposal_event(
  p_proposal public.proposals, p_actor uuid, p_action text, p_from public.proposal_status, p_note text default null
) returns void
language sql
set search_path = ''
as $$
  insert into public.proposal_events (proposal_id, actor_id, action, from_status, to_status, revision, note)
  values (p_proposal.id, p_actor, p_action, p_from, p_proposal.status, p_proposal.revision, p_note)
$$;

create function private.effective_proposal_status(p_status public.proposal_status, p_expires_at timestamptz)
returns public.proposal_status
language sql stable
set search_path = ''
as $$ select case when p_status = 'open' and p_expires_at <= now() then 'expired'::public.proposal_status else p_status end $$;

create function private.member_json(p_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$ select jsonb_build_object('id', p.id, 'display_name', p.display_name) from public.profiles p where p.id = p_id $$;

create function private.revision_json(p_revision public.proposal_revisions) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_revision.id,
    'number', p_revision.number,
    'author_id', p_revision.author_id,
    'gives', p_revision.gives,
    'gets', p_revision.gets,
    'cash', case when p_revision.cash_naira is null then null
                 else jsonb_build_object('amount_naira', p_revision.cash_naira, 'payer', p_revision.cash_payer) end,
    'note', p_revision.note,
    'created_at', p_revision.created_at
  )
$$;

-- Offers in a revision that changed since it was written, or are no
-- longer active or paused: accepting it would be TERMS_CHANGED.
create function private.changed_offer_ids(p_revision public.proposal_revisions) returns jsonb
language sql stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(i ->> 'offer_id' order by i ->> 'offer_id'), '[]')
  from jsonb_array_elements(p_revision.gives || p_revision.gets) i
  left join public.offers o on o.id = (i ->> 'offer_id')::uuid
  where i ->> 'kind' = 'offer'
    and (o.id is null or o.status not in ('active', 'paused') or o.content_version <> (i ->> 'content_version')::integer)
$$;

-- A proposal as either party reads it, every revision included.
create function private.proposal_json(p_proposal_id uuid, p_viewer uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'offer_id', p.offer_id,
    'status', private.effective_proposal_status(p.status, p.expires_at),
    'close_reason', p.close_reason,
    'revision', p.revision,
    'latest_revision_id', p.latest_revision_id,
    'latest_author_id', p.latest_author_id,
    'expires_at', p.expires_at,
    'created_at', p.created_at,
    'updated_at', p.updated_at,
    'closed_at', p.closed_at,
    'viewer_role', case when p_viewer = p.owner_id then 'owner' else 'proposer' end,
    'proposer', private.member_json(p.proposer_id),
    'owner', private.member_json(p.owner_id),
    'offer', (select jsonb_build_object('id', o.id, 'title', o.title, 'status', o.status) from public.offers o where o.id = p.offer_id),
    'agreement_id', (select a.id from public.agreements a where a.proposal_id = p.id),
    'changed_offer_ids', (select private.changed_offer_ids(r) from public.proposal_revisions r where r.id = p.latest_revision_id),
    -- What the proposer can give in a counter: their active offers.
    'gives_choices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title,
        'thumb_path', (select ph.thumb_path from public.offer_photos ph where ph.offer_id = o.id order by ph.position limit 1)
      ) order by o.published_at desc), '[]')
      from public.offers o
      where o.owner_id = p.proposer_id and o.status = 'active' and p.status = 'open'
    ),
    'revisions', (
      select jsonb_agg(private.revision_json(r) order by r.number) from public.proposal_revisions r where r.proposal_id = p.id
    )
  )
  from public.proposals p
  where p.id = p_proposal_id
$$;

-- One row of a list: the other member, the latest terms and the time.
create function private.proposal_summary_json(p_proposal_id uuid, p_viewer uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'offer_id', p.offer_id,
    'status', private.effective_proposal_status(p.status, p.expires_at),
    'close_reason', p.close_reason,
    'revision', p.revision,
    'latest_author_id', p.latest_author_id,
    'expires_at', p.expires_at,
    'updated_at', p.updated_at,
    'viewer_role', case when p_viewer = p.owner_id then 'owner' else 'proposer' end,
    'proposer', private.member_json(p.proposer_id),
    'owner', private.member_json(p.owner_id),
    'latest', (select private.revision_json(r) from public.proposal_revisions r where r.id = p.latest_revision_id)
  )
  from public.proposals p
  where p.id = p_proposal_id
$$;

-- Locks the proposal for a write by `p_actor` (target offer first, then
-- the proposal) and checks it is theirs, open and unexpired. Revision
-- and turn checks are the caller's.
create function private.lock_proposal(p_proposal_id uuid, p_actor uuid) returns public.proposals
language plpgsql
set search_path = ''
as $$
declare
  v_offer_id uuid;
  v_proposal public.proposals;
begin
  select p.offer_id into v_offer_id from public.proposals p
  where p.id = p_proposal_id and p_actor in (p.proposer_id, p.owner_id);
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  perform 1 from public.offers o where o.id = v_offer_id for share;
  select * into v_proposal from public.proposals p where p.id = p_proposal_id for update;
  if v_proposal.status <> 'open' then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_proposal.status));
  end if;
  if v_proposal.expires_at <= now() then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'expired', 'current_status', 'expired'));
  end if;
  return v_proposal;
end;
$$;

-- The revision the member last saw must still be the latest.
create function private.check_revision(p_proposal public.proposals, p_expected_revision integer) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_expected_revision is null then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"expected_revision": "required"}}');
  end if;
  if p_proposal.revision <> p_expected_revision then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'stale_revision', 'current_revision', p_proposal.revision));
  end if;
end;
$$;

create function private.require_turn(p_proposal public.proposals, p_actor uuid) returns void
language plpgsql
set search_path = ''
as $$
begin
  if p_proposal.latest_author_id = p_actor then
    perform private.fail('FORBIDDEN', 403, '{"reason": "not_your_turn"}');
  end if;
end;
$$;

-- Create ------------------------------------------------------------

create function public.proposal_create(p_offer_id uuid, p_terms jsonb, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_terms jsonb;
  v_proposal public.proposals;
  v_expired public.proposals;
  v_proposal_id uuid := gen_random_uuid();
  v_revision_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/proposals', null,
    private.request_hash(jsonb_build_object('offer_id', p_offer_id, 'terms', p_terms)));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_offer from public.offers o where o.id = p_offer_id for share;
  if not found or (v_offer.status <> 'active' and v_offer.owner_id <> v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_offer.owner_id = v_actor then
    perform private.fail('FORBIDDEN', 403, '{"reason": "own_offer"}');
  end if;
  -- An earlier proposal past its expiry no longer blocks a new one (P3).
  for v_expired in
    update public.proposals p set status = 'expired', closed_at = now(), updated_at = now()
    where p.offer_id = v_offer.id and p.proposer_id = v_actor and p.status = 'open' and p.expires_at <= now()
    returning *
  loop
    perform private.proposal_event(v_expired, null, 'expire', 'open');
  end loop;
  if exists (select 1 from public.proposals p where p.offer_id = v_offer.id and p.proposer_id = v_actor and p.status = 'open') then
    perform private.fail('CONFLICT', 409, jsonb_build_object(
      'reason', 'already_open',
      'proposal_id', (select p.id from public.proposals p where p.offer_id = v_offer.id and p.proposer_id = v_actor and p.status = 'open')));
  end if;
  v_terms := private.clean_terms(p_terms, v_offer, v_actor, true);
  begin
    insert into public.proposals (id, offer_id, proposer_id, owner_id, revision, latest_revision_id, latest_author_id, expires_at)
    values (
      v_proposal_id, v_offer.id, v_actor, v_offer.owner_id, 1, v_revision_id, v_actor,
      now() + make_interval(days => private.proposal_limit('expiryDays')))
    returning * into v_proposal;
  exception when unique_violation then
    -- A concurrent request opened one first.
    perform private.fail('CONFLICT', 409, '{"reason": "already_open"}');
  end;
  perform private.insert_revision(v_revision_id, v_proposal.id, 1, v_actor, v_terms);
  perform private.proposal_event(v_proposal, v_actor, 'create', null);
  v_response := private.proposal_json(v_proposal.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_proposal.id);
  return v_response;
end;
$$;

-- Counter -----------------------------------------------------------

create function public.proposal_counter(
  p_proposal_id uuid, p_expected_revision integer, p_terms jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_proposal public.proposals;
  v_offer public.offers;
  v_latest public.proposal_revisions;
  v_terms jsonb;
  v_revision_id uuid := gen_random_uuid();
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/proposals/:id/counter', p_proposal_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision, 'terms', p_terms)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_proposal := private.lock_proposal(p_proposal_id, v_actor);
  perform private.check_revision(v_proposal, p_expected_revision);
  perform private.require_turn(v_proposal, v_actor);
  select * into v_offer from public.offers o where o.id = v_proposal.offer_id;
  if v_offer.status not in ('active', 'paused') then
    perform private.fail('CONFLICT', 409, '{"reason": "offer_unavailable"}');
  end if;
  v_terms := private.clean_terms(p_terms, v_offer, v_proposal.proposer_id, false);
  select * into v_latest from public.proposal_revisions r where r.id = v_proposal.latest_revision_id;
  if private.terms_key(v_terms -> 'gives', v_terms -> 'gets', (v_terms ->> 'cash_naira')::integer, v_terms ->> 'cash_payer')
     = private.terms_key(v_latest.gives, v_latest.gets, v_latest.cash_naira, v_latest.cash_payer) then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"terms": "unchanged"}}');
  end if;
  perform private.insert_revision(v_revision_id, v_proposal.id, v_proposal.revision + 1, v_actor, v_terms);
  update public.proposals p
  set revision = p.revision + 1,
      latest_revision_id = v_revision_id,
      latest_author_id = v_actor,
      expires_at = now() + make_interval(days => private.proposal_limit('expiryDays')),
      updated_at = now()
  where p.id = v_proposal.id
  returning * into v_proposal;
  perform private.proposal_event(v_proposal, v_actor, 'counter', 'open');
  v_response := private.proposal_json(v_proposal.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_proposal.id);
  return v_response;
end;
$$;

-- Accept ------------------------------------------------------------

create function public.proposal_accept(p_proposal_id uuid, p_revision_id uuid, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_proposal public.proposals;
  v_latest public.proposal_revisions;
  v_changed jsonb;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/proposals/:id/accept', p_proposal_id,
    private.request_hash(jsonb_build_object('revision_id', p_revision_id)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_proposal := private.lock_proposal(p_proposal_id, v_actor);
  -- Accepting applies to one exact revision: the latest.
  if p_revision_id is distinct from v_proposal.latest_revision_id then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'stale_revision', 'current_revision', v_proposal.revision));
  end if;
  perform private.require_turn(v_proposal, v_actor);
  select * into v_latest from public.proposal_revisions r where r.id = v_proposal.latest_revision_id;
  -- Every referenced offer still active or paused (D3) and unchanged.
  perform 1 from public.offers o
  where o.id in (select (i ->> 'offer_id')::uuid from jsonb_array_elements(v_latest.gives || v_latest.gets) i where i ->> 'kind' = 'offer')
  order by o.id
  for share;
  v_changed := private.changed_offer_ids(v_latest);
  if jsonb_array_length(v_changed) > 0 then
    perform private.fail('TERMS_CHANGED', 409, jsonb_build_object('reason', 'terms_changed', 'offer_ids', v_changed));
  end if;
  update public.proposals p set status = 'accepted', closed_at = now(), updated_at = now()
  where p.id = v_proposal.id
  returning * into v_proposal;
  insert into public.agreements (proposal_id, revision_id, offer_id, proposer_id, owner_id)
  values (v_proposal.id, v_latest.id, v_proposal.offer_id, v_proposal.proposer_id, v_proposal.owner_id);
  perform private.proposal_event(v_proposal, v_actor, 'accept', 'open');
  v_response := private.proposal_json(v_proposal.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_proposal.id);
  return v_response;
end;
$$;

-- Decline and withdraw ----------------------------------------------

create function private.proposal_close(
  p_action text, p_proposal_id uuid, p_expected_revision integer, p_idempotency_key uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_proposal public.proposals;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/proposals/:id/' || p_action, p_proposal_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_proposal := private.lock_proposal(p_proposal_id, v_actor);
  perform private.check_revision(v_proposal, p_expected_revision);
  if p_action = 'decline' then
    perform private.require_turn(v_proposal, v_actor);
  elsif v_proposal.latest_author_id <> v_actor then
    -- Only the author of the latest terms can withdraw them.
    perform private.fail('FORBIDDEN', 403, '{"reason": "not_author"}');
  end if;
  update public.proposals p
  set status = case when p_action = 'decline' then 'declined'::public.proposal_status else 'withdrawn'::public.proposal_status end,
      closed_at = now(),
      updated_at = now()
  where p.id = v_proposal.id
  returning * into v_proposal;
  perform private.proposal_event(v_proposal, v_actor, p_action, 'open');
  v_response := private.proposal_json(v_proposal.id, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_proposal.id);
  return v_response;
end;
$$;

create function public.proposal_decline(p_proposal_id uuid, p_expected_revision integer, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.proposal_close('decline', p_proposal_id, p_expected_revision, p_idempotency_key) $$;

create function public.proposal_withdraw(p_proposal_id uuid, p_expected_revision integer, p_idempotency_key uuid default null) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.proposal_close('withdraw', p_proposal_id, p_expected_revision, p_idempotency_key) $$;

-- D2: closing an offer declines its open proposals ------------------

create function private.decline_proposals_on_offer_close() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
begin
  for v_proposal in
    update public.proposals p
    set status = case when p.expires_at <= now() then 'expired'::public.proposal_status else 'declined'::public.proposal_status end,
        close_reason = case when p.expires_at <= now() then null else 'offer_closed' end,
        closed_at = now(),
        updated_at = now()
    where p.offer_id = new.id and p.status = 'open'
    returning *
  loop
    if v_proposal.status = 'expired' then
      perform private.proposal_event(v_proposal, null, 'expire', 'open');
    else
      perform private.proposal_event(v_proposal, null, 'auto_decline', 'open', 'The offer was closed.');
    end if;
  end loop;
  return null;
end;
$$;

create trigger offers_close_declines_proposals
after update of status on public.offers
for each row
when (new.status = 'closed' and old.status is distinct from 'closed')
execute function private.decline_proposals_on_offer_close();

-- Reads -------------------------------------------------------------

create function public.proposal_get(p_proposal_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not exists (select 1 from public.proposals p where p.id = p_proposal_id and v_actor in (p.proposer_id, p.owner_id)) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return private.proposal_json(p_proposal_id, v_actor);
end;
$$;

-- The viewer's proposals in one Exchanges tab, newest activity first.
-- Paged by (updated_at, id) of the last row.
create function public.proposal_list(
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
        else p.status <> 'open' or p.expires_at <= now()
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

-- P5: how many proposals wait on the viewer.
create function public.proposal_counts() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('turn', count(*))
  from public.proposals p
  where (select auth.uid()) in (p.proposer_id, p.owner_id)
    and p.status = 'open' and p.expires_at > now() and p.latest_author_id <> (select auth.uid())
$$;

-- P6: the owner sees every proposal on their offer.
create function public.offer_proposals(p_offer_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_offer public.offers;
begin
  select * into v_offer from public.offers o where o.id = p_offer_id;
  if not found or (v_offer.owner_id <> v_actor and v_offer.status <> 'active') then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_offer.owner_id <> v_actor then
    perform private.fail('FORBIDDEN', 403, '{"reason": "not_owner"}');
  end if;
  return (
    select coalesce(jsonb_agg(private.proposal_summary_json(p.id, v_actor) order by p.updated_at desc, p.id desc), '[]')
    from (select * from public.proposals p where p.offer_id = v_offer.id order by p.updated_at desc, p.id desc limit 200) p
  );
end;
$$;

create function public.agreement_get(p_agreement_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_agreement public.agreements;
  v_revision public.proposal_revisions;
begin
  select * into v_agreement from public.agreements a where a.id = p_agreement_id and v_actor in (a.proposer_id, a.owner_id);
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  select * into v_revision from public.proposal_revisions r where r.id = v_agreement.revision_id;
  return jsonb_build_object(
    'id', v_agreement.id,
    'proposal_id', v_agreement.proposal_id,
    'status', v_agreement.status,
    'created_at', v_agreement.created_at,
    'viewer_role', case when v_actor = v_agreement.owner_id then 'owner' else 'proposer' end,
    'proposer', private.member_json(v_agreement.proposer_id),
    'owner', private.member_json(v_agreement.owner_id),
    'offer', (select jsonb_build_object('id', o.id, 'title', o.title, 'status', o.status, 'revision', o.revision)
              from public.offers o where o.id = v_agreement.offer_id),
    'terms', private.revision_json(v_revision),
    -- "The listing has changed since you agreed" (state-model.md §4).
    'listing_changed', jsonb_array_length(private.changed_offer_ids(v_revision)) > 0
  );
end;
$$;

-- P3: records `expired` for proposals past their expiry. Run by the
-- cleanup job with the server-only key; every read and action already
-- treats them as expired.
create function public.proposal_expire_due(p_limit integer default 500) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_count integer := 0;
begin
  for v_proposal in
    update public.proposals p set status = 'expired', closed_at = now(), updated_at = now()
    where p.id in (
      select q.id from public.proposals q
      where q.status = 'open' and q.expires_at <= now()
      order by q.expires_at
      limit greatest(p_limit, 0)
      for update skip locked
    )
    returning *
  loop
    perform private.proposal_event(v_proposal, null, 'expire', 'open');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Privileges --------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.proposal_create(uuid, jsonb, uuid),
  public.proposal_counter(uuid, integer, jsonb, uuid),
  public.proposal_accept(uuid, uuid, uuid),
  public.proposal_decline(uuid, integer, uuid),
  public.proposal_withdraw(uuid, integer, uuid),
  public.proposal_get(uuid),
  public.proposal_list(text, timestamptz, uuid, integer),
  public.proposal_counts(),
  public.offer_proposals(uuid),
  public.agreement_get(uuid),
  public.proposal_expire_due(integer),
  public.storage_cleanup_queued(text[])
from public, anon, authenticated;

grant execute on function
  public.proposal_create(uuid, jsonb, uuid),
  public.proposal_counter(uuid, integer, jsonb, uuid),
  public.proposal_accept(uuid, uuid, uuid),
  public.proposal_decline(uuid, integer, uuid),
  public.proposal_withdraw(uuid, integer, uuid),
  public.proposal_get(uuid),
  public.proposal_list(text, timestamptz, uuid, integer),
  public.proposal_counts(),
  public.offer_proposals(uuid),
  public.agreement_get(uuid)
to authenticated;

grant execute on function public.proposal_expire_due(integer), public.storage_cleanup_queued(text[]) to service_role;
