-- Milestone 6, units 24–26: blocking, reports and moderation
-- (specs/milestone-6.md, with S1–S10 as approved by the owner on
-- 2026-10-20).
--
-- Members write only through the functions below. Blocking and
-- suspension are enforced here, by triggers on the tables every
-- proposal, revision, agreement, message and publication goes through,
-- and by a restrictive policy on offers, so no route around the UI
-- skips them. Moderators are staff with the `moderator` role, granted
-- only with SQL like the valuation roles (and logged the same way).
-- Limits and reasons mirror packages/shared/src/safety
-- (parity.db.test.ts).

-- Reference data ----------------------------------------------------

create table private.safety_limits (name text primary key, value integer not null);
insert into private.safety_limits (name, value) values
  ('reportsPerDay', 10),
  ('detailsMax', 1000),
  ('otherDetailsMin', 10),
  ('noteMin', 10),
  ('noteMax', 1000),
  ('contextMessages', 10);

create function private.safety_limit(p_name text) returns integer
language sql stable
set search_path = ''
as $$ select l.value from private.safety_limits l where l.name = p_name $$;

create function private.report_reasons() returns text[]
language sql immutable
set search_path = ''
as $$ select array['prohibited_item', 'scam', 'harassment', 'misleading', 'spam', 'other'] $$;

alter table private.staff_roles drop constraint staff_roles_role_check;
alter table private.staff_roles add constraint staff_roles_role_check
  check (role in ('valuation_reviewer', 'valuation_inspector', 'moderator'));

-- Tables ------------------------------------------------------------

-- S1: one row per member who blocked another. Only the blocker can
-- read it; the blocked member is never told.
create table public.blocks (
  id uuid primary key default gen_random_uuid(),
  blocker_id uuid not null references public.profiles (id) on delete cascade,
  blocked_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint blocks_two_members check (blocker_id <> blocked_id),
  constraint blocks_once unique (blocker_id, blocked_id)
);

create index blocks_by_blocked on public.blocks (blocked_id, blocker_id);

-- S3: what a member reported. `member_id` is the member it is about
-- (the offer's owner, the message's sender, or the member themselves).
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles (id) on delete cascade,
  subject_type text not null check (subject_type in ('offer', 'member', 'message')),
  offer_id uuid references public.offers (id) on delete cascade,
  message_id bigint references public.messages (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null check (reason = any (private.report_reasons())),
  details text not null default '',
  status text not null default 'open' check (status in ('open', 'reviewed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint reports_subject check (
    (subject_type = 'offer' and offer_id is not null and message_id is null)
    or (subject_type = 'member' and offer_id is null and message_id is null)
    or (subject_type = 'message' and message_id is not null and offer_id is null)),
  constraint reports_not_own check (reporter_id <> member_id),
  constraint reports_reviewed_at check ((status = 'reviewed') = (reviewed_at is not null))
);

-- S10: one open report per member and subject.
create unique index reports_one_open_offer on public.reports (reporter_id, offer_id) where status = 'open' and subject_type = 'offer';
create unique index reports_one_open_member on public.reports (reporter_id, member_id) where status = 'open' and subject_type = 'member';
create unique index reports_one_open_message on public.reports (reporter_id, message_id) where status = 'open' and subject_type = 'message';
create index reports_queue on public.reports (created_at, id) where status = 'open';
create index reports_by_reporter on public.reports (reporter_id, created_at desc);

-- S5: a suspension and when it was lifted. One in force per member.
create table public.member_suspensions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.profiles (id) on delete cascade,
  suspended_by uuid not null references public.profiles (id),
  report_id uuid references public.reports (id) on delete set null,
  created_at timestamptz not null default now(),
  lifted_at timestamptz,
  lifted_by uuid references public.profiles (id)
);

create unique index member_suspensions_one_in_force on public.member_suspensions (member_id) where lifted_at is null;

-- S5: every moderator action, append-only.
create table public.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid not null references public.profiles (id),
  action text not null check (action in ('dismiss', 'remove_offer', 'suspend', 'unsuspend')),
  report_id uuid references public.reports (id) on delete set null,
  offer_id uuid,
  member_id uuid,
  note text not null,
  created_at timestamptz not null default now()
);

create index moderation_actions_by_member on public.moderation_actions (member_id, id);
create index moderation_actions_by_offer on public.moderation_actions (offer_id, id);

-- S5: "Removed by BATR".
alter table public.offers add column removed_at timestamptz;

-- S1: proposals BATR closes because one member blocked the other.
alter table public.proposals drop constraint proposals_close_reason_check;
alter table public.proposals add constraint proposals_close_reason_check
  check (close_reason in ('offer_closed', 'blocked'));
alter table public.proposal_events drop constraint proposal_events_action_check;
alter table public.proposal_events add constraint proposal_events_action_check
  check (action in ('create', 'counter', 'accept', 'decline', 'withdraw', 'auto_decline', 'expire', 'block_decline'));

create or replace function private.event_kinds() returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    'proposal.create', 'proposal.counter', 'proposal.accept', 'proposal.decline',
    'proposal.withdraw', 'proposal.auto_decline', 'proposal.expire', 'proposal.block_decline',
    'agreement.handover', 'agreement.completed', 'agreement.propose_change',
    'agreement.accept_change', 'agreement.reject_change', 'agreement.withdraw_change',
    'agreement.request_cancel', 'agreement.accept_cancel', 'agreement.reject_cancel',
    'agreement.withdraw_cancel']
$$;

-- Backstops ---------------------------------------------------------

create trigger moderation_actions_fixed
before update on public.moderation_actions
for each row execute function private.reject_revision_change();

-- Row-level security ------------------------------------------------

alter table public.blocks enable row level security;
alter table public.reports enable row level security;
alter table public.member_suspensions enable row level security;
alter table public.moderation_actions enable row level security;
alter table private.safety_limits enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.blocks, public.reports, public.member_suspensions, public.moderation_actions
  from anon, authenticated;
revoke all on private.safety_limits from public, anon, authenticated;

create policy "blocks: own" on public.blocks
for select to authenticated
using (blocker_id = (select auth.uid()));

-- S7: the reporter sees their report, never the action taken. Members
-- have no policy on suspensions or moderation actions.
create policy "reports: own" on public.reports
for select to authenticated
using (reporter_id = (select auth.uid()));

-- Checks ------------------------------------------------------------

create function private.blocked_between(p_one uuid, p_two uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select p_one is not null and p_two is not null and exists (
    select 1 from public.blocks b
    where (b.blocker_id = p_one and b.blocked_id = p_two) or (b.blocker_id = p_two and b.blocked_id = p_one))
$$;

create function private.is_suspended(p_member uuid) returns boolean
language sql stable
set search_path = ''
as $$ select exists (select 1 from public.member_suspensions s where s.member_id = p_member and s.lifted_at is null) $$;

-- Used by the offers policy below, so callable by every reader. It says
-- only whether this owner's offers are hidden from the caller.
create function public.offer_owner_visible(p_owner uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$ select not private.is_suspended(p_owner) and not private.blocked_between(p_owner, (select auth.uid())) $$;

revoke execute on function public.offer_owner_visible(uuid) from public;
grant execute on function public.offer_owner_visible(uuid) to anon, authenticated;

-- S1 and S5: a suspended member's offers, and offers between members
-- who blocked each other, are hidden from Explore, search, the offer
-- page and photos (their policies read offers). Owners always see their
-- own.
create policy "offers: hidden by blocks and suspensions" on public.offers
as restrictive
for select to anon, authenticated
using (owner_id = (select auth.uid()) or public.offer_owner_visible(owner_id));

-- Starting a proposal, or a new revision of one: neither member
-- suspended or blocked by the other.
create function private.guard_proposal_members() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_proposer uuid;
  v_owner uuid;
  v_actor uuid;
begin
  if tg_table_name = 'proposals' then
    v_proposer := new.proposer_id;
    v_owner := new.owner_id;
    v_actor := new.proposer_id;
  else
    select p.proposer_id, p.owner_id into v_proposer, v_owner from public.proposals p where p.id = new.proposal_id;
    v_actor := new.author_id;
  end if;
  if private.is_suspended(v_actor) then
    perform private.fail('FORBIDDEN', 403, '{"reason": "suspended"}');
  end if;
  if private.blocked_between(v_proposer, v_owner)
     or private.is_suspended(case when v_actor = v_proposer then v_owner else v_proposer end) then
    perform private.fail('FORBIDDEN', 403, '{"reason": "member_unavailable"}');
  end if;
  return new;
end;
$$;

create trigger proposals_members_allowed
before insert on public.proposals
for each row execute function private.guard_proposal_members();

create trigger proposal_revisions_members_allowed
before insert on public.proposal_revisions
for each row execute function private.guard_proposal_members();

-- Accepting: the member accepting isn't suspended, and the other member
-- isn't suspended or blocked.
create function private.guard_agreement_members() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if private.is_suspended(v_actor) then
    perform private.fail('FORBIDDEN', 403, '{"reason": "suspended"}');
  end if;
  if private.blocked_between(new.proposer_id, new.owner_id)
     or private.is_suspended(case when v_actor = new.owner_id then new.proposer_id else new.owner_id end) then
    perform private.fail('FORBIDDEN', 403, '{"reason": "member_unavailable"}');
  end if;
  return new;
end;
$$;

create trigger agreements_members_allowed
before insert on public.agreements
for each row execute function private.guard_agreement_members();

create function private.guard_message_sender() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind = 'text' and private.is_suspended(new.sender_id) then
    perform private.fail('FORBIDDEN', 403, '{"reason": "suspended"}');
  end if;
  return new;
end;
$$;

create trigger messages_sender_allowed
before insert on public.messages
for each row execute function private.guard_message_sender();

-- Publishing or resuming an offer.
create function private.guard_offer_publish() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_suspended(new.owner_id) then
    perform private.fail('FORBIDDEN', 403, '{"reason": "suspended"}');
  end if;
  return new;
end;
$$;

create trigger offers_publish_allowed
before update of status on public.offers
for each row
when (new.status = 'active' and old.status is distinct from 'active')
execute function private.guard_offer_publish();

-- S1: a conversation between members who blocked each other is closed.
create or replace function private.thread_closed(p_proposal public.proposals) returns boolean
language sql stable
set search_path = ''
as $$
  select private.blocked_between(p_proposal.proposer_id, p_proposal.owner_id)
    or case private.effective_proposal_status(p_proposal.status, p_proposal.expires_at)
      when 'open' then false
      when 'accepted' then coalesce((
        select coalesce(a.completed_at, a.cancelled_at)
                 < now() - make_interval(days => private.message_limit('closedThreadDays'))
        from public.agreements a where a.proposal_id = p_proposal.id), false)
      else true
    end
$$;

-- S1: closing proposals because of a block writes a neutral line and
-- tells nobody, so the blocked member isn't told.
create or replace function private.proposal_event_written() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_proposal public.proposals;
  v_kind text := 'proposal.' || new.action;
  v_member uuid;
begin
  select * into v_proposal from public.proposals p where p.id = new.proposal_id;
  insert into public.messages (proposal_id, kind, system_event, actor_id)
  values (new.proposal_id, 'system', v_kind, new.actor_id);
  if new.action = 'block_decline' then
    return null;
  end if;
  foreach v_member in array array[v_proposal.proposer_id, v_proposal.owner_id] loop
    if v_member is distinct from new.actor_id
      -- BATR declined it because the owner closed the offer: only the
      -- proposer needs telling.
      and not (new.action = 'auto_decline' and v_member = v_proposal.owner_id) then
      perform private.notify(v_member, v_kind, new.proposal_id, new.actor_id);
    end if;
  end loop;
  return null;
end;
$$;

-- Blocking ----------------------------------------------------------

-- The other member: an offer's owner, or the other member of a
-- proposal the caller is in. 404 when the caller can't see it.
create function private.other_member(p_actor uuid, p_offer_id uuid, p_proposal_id uuid) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_member uuid;
begin
  if (p_offer_id is null) = (p_proposal_id is null) then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"subject": "invalid"}}');
  end if;
  if p_offer_id is not null then
    select o.owner_id into v_member from public.offers o
    where o.id = p_offer_id and (o.status = 'active' or o.owner_id = p_actor or exists (
      select 1 from public.proposals p where p.offer_id = o.id and p_actor in (p.proposer_id, p.owner_id)));
  else
    select case when p.proposer_id = p_actor then p.owner_id else p.proposer_id end into v_member
    from public.proposals p where p.id = p_proposal_id and p_actor in (p.proposer_id, p.owner_id);
  end if;
  if v_member is null then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_member = p_actor then
    perform private.fail('FORBIDDEN', 403, '{"reason": "own"}');
  end if;
  return v_member;
end;
$$;

create function public.member_block(p_offer_id uuid default null, p_proposal_id uuid default null, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_member uuid;
  v_proposal public.proposals;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/blocks', coalesce(p_offer_id, p_proposal_id),
    private.request_hash(jsonb_build_object('offer_id', p_offer_id, 'proposal_id', p_proposal_id)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_member := private.other_member(v_actor, p_offer_id, p_proposal_id);
  insert into public.blocks (blocker_id, blocked_id) values (v_actor, v_member)
  on conflict (blocker_id, blocked_id) do nothing;
  -- S1: open proposals between them end. Agreements are left alone.
  for v_proposal in
    update public.proposals p
    set status = case when p.expires_at <= now() then 'expired'::public.proposal_status else 'declined'::public.proposal_status end,
        close_reason = case when p.expires_at <= now() then null else 'blocked' end,
        closed_at = now(),
        updated_at = now()
    where p.status = 'open'
      and ((p.proposer_id = v_actor and p.owner_id = v_member) or (p.proposer_id = v_member and p.owner_id = v_actor))
    returning *
  loop
    perform private.proposal_event(v_proposal, null, case when v_proposal.status = 'expired' then 'expire' else 'block_decline' end, 'open');
  end loop;
  v_response := jsonb_build_object('blocked', true, 'display_name', private.display_name(v_member));
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, null);
  return v_response;
end;
$$;

create function public.member_unblock(p_block_id uuid) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  delete from public.blocks b where b.id = p_block_id and b.blocker_id = v_actor;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return jsonb_build_object('unblocked', true);
end;
$$;

-- S2: Account → Blocked members.
create function public.member_blocks() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', b.id, 'display_name', private.display_name(b.blocked_id), 'created_at', b.created_at)
    order by b.created_at desc), '[]')
  from public.blocks b
  where b.blocker_id = (select auth.uid())
$$;

-- Reports -----------------------------------------------------------

create function public.report_create(
  p_subject_type text,
  p_offer_id uuid default null,
  p_proposal_id uuid default null,
  p_message_id bigint default null,
  p_reason text default null,
  p_details text default '',
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_details text := private.trim_text(coalesce(p_details, ''));
  v_member uuid;
  v_offer uuid;
  v_message public.messages;
  v_report public.reports;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/reports', null,
    private.request_hash(jsonb_build_object(
      'subject_type', p_subject_type, 'offer_id', p_offer_id, 'proposal_id', p_proposal_id,
      'message_id', p_message_id, 'reason', p_reason, 'details', p_details)));
  if v_stored is not null then
    return v_stored;
  end if;
  if p_reason is null or not (p_reason = any (private.report_reasons())) then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"reason": "invalid"}}');
  end if;
  if char_length(v_details) > private.safety_limit('detailsMax')
     or (p_reason = 'other' and char_length(v_details) < private.safety_limit('otherDetailsMin')) then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"details": "length"}}');
  end if;
  case p_subject_type
    when 'offer' then
      if p_offer_id is null or p_proposal_id is not null or p_message_id is not null then
        perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"subject": "invalid"}}');
      end if;
      v_member := private.other_member(v_actor, p_offer_id, null);
      v_offer := p_offer_id;
    when 'member' then
      if p_message_id is not null then
        perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"subject": "invalid"}}');
      end if;
      v_member := private.other_member(v_actor, p_offer_id, p_proposal_id);
    when 'message' then
      if p_message_id is null or p_offer_id is not null or p_proposal_id is not null then
        perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"subject": "invalid"}}');
      end if;
      select m.* into v_message from public.messages m
      join public.proposals p on p.id = m.proposal_id
      where m.id = p_message_id and m.kind = 'text' and v_actor in (p.proposer_id, p.owner_id);
      if not found then
        perform private.fail('NOT_FOUND', 404);
      end if;
      if v_message.sender_id = v_actor then
        perform private.fail('FORBIDDEN', 403, '{"reason": "own"}');
      end if;
      v_member := v_message.sender_id;
    else
      perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"subject_type": "invalid"}}');
  end case;
  -- S10. Serialised per member so two at once can't both pass.
  perform pg_advisory_xact_lock(hashtextextended('report_create:' || v_actor::text, 0));
  if (select count(*) from public.reports r where r.reporter_id = v_actor and r.created_at > now() - interval '1 day')
     >= private.safety_limit('reportsPerDay') then
    perform private.fail('RATE_LIMITED', 429);
  end if;
  insert into public.reports (reporter_id, subject_type, offer_id, message_id, member_id, reason, details)
  values (v_actor, p_subject_type, v_offer, v_message.id, v_member, p_reason, v_details)
  on conflict do nothing
  returning * into v_report;
  if v_report.id is null then
    perform private.fail('CONFLICT', 409, '{"reason": "already_reported"}');
  end if;
  v_response := jsonb_build_object('id', v_report.id, 'status', 'received');
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_report.id);
  return v_response;
end;
$$;

-- What a report is about, in a few words for the reporter's list and
-- the moderation queue.
create function private.report_label(p_report public.reports) returns text
language sql stable
set search_path = ''
as $$
  select case p_report.subject_type
    when 'offer' then coalesce((select o.title from public.offers o where o.id = p_report.offer_id), 'An offer')
    when 'member' then private.display_name(p_report.member_id)
    else 'A message from ' || private.display_name(p_report.member_id)
  end
$$;

-- S7: Account → My reports. Received, then Reviewed; never the outcome.
create function public.my_reports() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'subject_type', r.subject_type, 'label', private.report_label(r), 'reason', r.reason,
    'status', case r.status when 'open' then 'received' else 'reviewed' end, 'created_at', r.created_at)
    order by r.created_at desc), '[]')
  from public.reports r
  where r.reporter_id = (select auth.uid())
$$;

-- S8: the banner for a suspended member, and whether to show the
-- moderation link.
create function public.my_safety_status() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'suspended', private.is_suspended((select auth.uid())),
    'moderator', private.has_role((select auth.uid()), 'moderator'))
$$;

-- Moderation --------------------------------------------------------

-- Everyone but a moderator gets 404 (milestone-6.md, Acceptance).
create function private.require_moderator() returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not private.has_role(v_actor, 'moderator') then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return v_actor;
end;
$$;

-- S4: a moderator never handles a report they made or one about them.
create function private.report_involves(p_report public.reports, p_member uuid) returns boolean
language sql stable
set search_path = ''
as $$ select p_member in (p_report.reporter_id, p_report.member_id) $$;

create function private.moderation_summary_json(p_report public.reports) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_report.id,
    'subject_type', p_report.subject_type,
    'label', private.report_label(p_report),
    'reason', p_report.reason,
    'details', p_report.details,
    'status', p_report.status,
    'reporter_name', private.display_name(p_report.reporter_id),
    'member_name', private.display_name(p_report.member_id),
    'created_at', p_report.created_at,
    'reviewed_at', p_report.reviewed_at)
$$;

-- Open reports, oldest first.
create function public.moderation_queue() returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_moderator();
begin
  return coalesce((
    select jsonb_agg(private.moderation_summary_json(r) order by r.created_at, r.id)
    from public.reports r
    where r.status = 'open' and not private.report_involves(r, v_actor)), '[]');
end;
$$;

-- S6: one report with only what it points to.
create function public.moderation_report(p_report_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_moderator();
  v_report public.reports;
  v_message public.messages;
  v_context integer := private.safety_limit('contextMessages');
  v_subject jsonb;
  v_offer public.offers;
begin
  select * into v_report from public.reports r where r.id = p_report_id;
  if not found or private.report_involves(v_report, v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  case v_report.subject_type
    when 'offer' then
      select * into v_offer from public.offers o where o.id = v_report.offer_id;
      v_subject := jsonb_build_object('offer', private.offer_json(v_report.offer_id) - 'owner_id');
    when 'member' then
      v_subject := jsonb_build_object('offers', coalesce((
        select jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'status', o.status, 'removed_at', o.removed_at)
                         order by o.updated_at desc)
        from public.offers o where o.owner_id = v_report.member_id and o.status <> 'draft'), '[]'));
    else
      select * into v_message from public.messages m where m.id = v_report.message_id;
      v_subject := jsonb_build_object('messages', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', m.id, 'kind', m.kind, 'body', m.body, 'event', m.system_event,
          'from', case when m.sender_id = v_report.member_id then 'reported'
                       when m.sender_id is null then null else 'other' end,
          'reported', m.id = v_message.id, 'created_at', m.created_at) order by m.id), '[]')
        from (
          (select * from public.messages m where m.proposal_id = v_message.proposal_id and m.id < v_message.id order by m.id desc limit v_context)
          union all
          (select * from public.messages m where m.id = v_message.id)
          union all
          (select * from public.messages m where m.proposal_id = v_message.proposal_id and m.id > v_message.id order by m.id limit v_context)
        ) m),
        'other_name', (select private.display_name(case when p.proposer_id = v_report.member_id then p.owner_id else p.proposer_id end)
                       from public.proposals p where p.id = v_message.proposal_id));
  end case;
  return private.moderation_summary_json(v_report) || jsonb_build_object(
    'subject', v_subject,
    'member_suspended', private.is_suspended(v_report.member_id),
    'member_reports', (select count(*) from public.reports r where r.member_id = v_report.member_id),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', a.action, 'note', a.note, 'moderator_name', private.display_name(a.moderator_id), 'created_at', a.created_at)
        order by a.id desc)
      from public.moderation_actions a
      where a.member_id = v_report.member_id or (v_report.offer_id is not null and a.offer_id = v_report.offer_id)), '[]'),
    'actions', jsonb_build_object(
      'dismiss', v_report.status = 'open',
      'remove_offer', v_report.status = 'open' and v_report.subject_type = 'offer' and v_offer.status is distinct from 'closed',
      'suspend', v_report.status = 'open' and not private.is_suspended(v_report.member_id)));
end;
$$;

-- S6: a moderator may read (and so sign) the photos of an offer
-- reported to them, even when it is closed or hidden.
create function public.offer_photo_moderator_readable(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select private.has_role((select auth.uid()), 'moderator') and exists (
    select 1
    from public.offer_photos p
    join public.reports r on r.offer_id = p.offer_id and r.subject_type = 'offer'
    where (p.display_path = p_name or p.thumb_path = p_name)
      and not private.report_involves(r, (select auth.uid())))
$$;

create policy "offer photos: readable by a moderator for a reported offer" on storage.objects
for select to authenticated
using (bucket_id = 'offer-photos' and public.offer_photo_moderator_readable(name));

create function private.check_note(p_note text) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_note text := private.trim_text(coalesce(p_note, ''));
begin
  if char_length(v_note) not between private.safety_limit('noteMin') and private.safety_limit('noteMax') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"note": "length"}}');
  end if;
  return v_note;
end;
$$;

-- S5: dismiss, remove the offer, or suspend the member; the report is
-- then reviewed. One action row each.
create function public.moderation_act(p_report_id uuid, p_action text, p_note text, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_moderator();
  v_stored jsonb;
  v_report public.reports;
  v_note text;
  v_offer public.offers;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/moderation/reports/:id/actions', p_report_id,
    private.request_hash(jsonb_build_object('action', p_action, 'note', p_note)));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_report from public.reports r where r.id = p_report_id for update;
  if not found or private.report_involves(v_report, v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_report.status <> 'open' then
    perform private.fail('CONFLICT', 409, '{"reason": "already_reviewed"}');
  end if;
  if p_action is null or p_action not in ('dismiss', 'remove_offer', 'suspend') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"action": "invalid"}}');
  end if;
  v_note := private.check_note(p_note);
  if p_action = 'remove_offer' then
    if v_report.subject_type <> 'offer' then
      perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"action": "invalid"}}');
    end if;
    select * into v_offer from public.offers o where o.id = v_report.offer_id for update;
    if v_offer.status = 'closed' then
      perform private.fail('CONFLICT', 409, '{"reason": "offer_closed"}');
    end if;
    -- Closing declines its open proposals (D2 trigger).
    update public.offers o set status = 'closed', closed_at = now(), removed_at = now() where o.id = v_offer.id;
    perform private.audit(v_actor, private.bump_offer(v_offer.id, false), 'remove', v_offer.status, 'closed');
  elsif p_action = 'suspend' then
    if private.is_suspended(v_report.member_id) then
      perform private.fail('CONFLICT', 409, '{"reason": "already_suspended"}');
    end if;
    insert into public.member_suspensions (member_id, suspended_by, report_id) values (v_report.member_id, v_actor, v_report.id);
  end if;
  insert into public.moderation_actions (moderator_id, action, report_id, offer_id, member_id, note)
  values (v_actor, p_action, v_report.id, v_report.offer_id, v_report.member_id, v_note);
  update public.reports r set status = 'reviewed', reviewed_at = now() where r.id = v_report.id;
  v_response := public.moderation_report(v_report.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_report.id);
  return v_response;
end;
$$;

-- Suspensions in force, newest first, for lifting.
create function public.moderation_suspensions() returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_moderator();
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'member_name', private.display_name(s.member_id), 'created_at', s.created_at,
      'note', (select a.note from public.moderation_actions a where a.report_id = s.report_id and a.action = 'suspend' order by a.id desc limit 1))
      order by s.created_at desc)
    from public.member_suspensions s
    where s.lifted_at is null and s.member_id <> v_actor), '[]');
end;
$$;

create function public.moderation_unsuspend(p_suspension_id uuid, p_note text, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_moderator();
  v_stored jsonb;
  v_suspension public.member_suspensions;
  v_note text;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/moderation/suspensions/:id/lift', p_suspension_id,
    private.request_hash(jsonb_build_object('note', p_note)));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_suspension from public.member_suspensions s where s.id = p_suspension_id for update;
  if not found or v_suspension.member_id = v_actor then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_suspension.lifted_at is not null then
    perform private.fail('CONFLICT', 409, '{"reason": "already_lifted"}');
  end if;
  v_note := private.check_note(p_note);
  update public.member_suspensions s set lifted_at = now(), lifted_by = v_actor where s.id = v_suspension.id;
  insert into public.moderation_actions (moderator_id, action, member_id, note)
  values (v_actor, 'unsuspend', v_suspension.member_id, v_note);
  v_response := jsonb_build_object('lifted', true);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_suspension.id);
  return v_response;
end;
$$;

-- Privileges --------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.member_block(uuid, uuid, uuid),
  public.member_unblock(uuid),
  public.member_blocks(),
  public.report_create(text, uuid, uuid, bigint, text, text, uuid),
  public.my_reports(),
  public.my_safety_status(),
  public.moderation_queue(),
  public.moderation_report(uuid),
  public.moderation_act(uuid, text, text, uuid),
  public.moderation_suspensions(),
  public.moderation_unsuspend(uuid, text, uuid),
  public.offer_photo_moderator_readable(text)
from public, anon, authenticated;

grant execute on function
  public.member_block(uuid, uuid, uuid),
  public.member_unblock(uuid),
  public.member_blocks(),
  public.report_create(text, uuid, uuid, bigint, text, text, uuid),
  public.my_reports(),
  public.my_safety_status(),
  public.moderation_queue(),
  public.moderation_report(uuid),
  public.moderation_act(uuid, text, text, uuid),
  public.moderation_suspensions(),
  public.moderation_unsuspend(uuid, text, uuid),
  public.offer_photo_moderator_readable(text)
to authenticated;
