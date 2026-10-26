-- Milestone 5, units 21–22: messages and in-app notifications
-- (specs/milestone-5.md, with N1–N8 as approved by the owner on
-- 2026-10-20).
--
-- One thread per proposal, carried on into its agreement. Members read
-- through row-level security (only the two parties) and write only
-- through the functions below. System lines and notifications are
-- written by triggers on proposal_events and agreement_events, so every
-- recorded event writes them in the same transaction (N7).
-- Limits mirror packages/shared/src/messages (parity.db.test.ts).

-- Reference data ----------------------------------------------------

create table private.message_limits (name text primary key, value integer not null);
insert into private.message_limits (name, value) values
  ('bodyMax', 2000),
  ('perMinute', 30),
  ('closedThreadDays', 30);

create function private.message_limit(p_name text) returns integer
language sql stable
set search_path = ''
as $$ select l.value from private.message_limits l where l.name = p_name $$;

-- What a system line or notification is about: `proposal.<action>` or
-- `agreement.<action>` from the event tables, `agreement.completed` for
-- the handover that completes an agreement, and `message`.
create function private.event_kinds() returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    'proposal.create', 'proposal.counter', 'proposal.accept', 'proposal.decline',
    'proposal.withdraw', 'proposal.auto_decline', 'proposal.expire',
    'agreement.handover', 'agreement.completed', 'agreement.propose_change',
    'agreement.accept_change', 'agreement.reject_change', 'agreement.withdraw_change',
    'agreement.request_cancel', 'agreement.accept_cancel', 'agreement.reject_cancel',
    'agreement.withdraw_cancel']
$$;

-- Tables ------------------------------------------------------------

-- N6: append-only. A text message has a sender and a body; a system
-- line has an event and the member who caused it (null: BATR).
create table public.messages (
  id bigint generated always as identity primary key,
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  kind text not null check (kind in ('text', 'system')),
  sender_id uuid references public.profiles (id) on delete cascade,
  body text,
  system_event text check (system_event = any (private.event_kinds())),
  actor_id uuid references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint messages_shape check (
    (kind = 'text' and sender_id is not null and body is not null and system_event is null and actor_id is null)
    or (kind = 'system' and sender_id is null and body is null and system_event is not null))
);

create index messages_by_proposal on public.messages (proposal_id, id);
create index messages_by_sender on public.messages (sender_id, created_at) where kind = 'text';

-- How far each member has read a thread.
create table public.thread_reads (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  member_id uuid not null references public.profiles (id) on delete cascade,
  last_read_id bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (proposal_id, member_id)
);

-- One per event for its recipient. New messages group into one unread
-- notification per thread, counting them (N7). The page it opens is
-- worked out when read: the agreement, once there is one, for messages
-- and agreement events.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind = 'message' or kind = any (private.event_kinds())),
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  count integer not null default 1 check (count >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  read_at timestamptz
);

create unique index notifications_one_unread_thread on public.notifications (recipient_id, proposal_id)
  where kind = 'message' and read_at is null;
create index notifications_by_recipient on public.notifications (recipient_id, updated_at desc, id desc);
create index notifications_unread on public.notifications (recipient_id) where read_at is null;

-- Backstops ---------------------------------------------------------

-- N6: messages are never edited.
create trigger messages_fixed
before update on public.messages
for each row execute function private.reject_revision_change();

-- Row-level security ------------------------------------------------

alter table public.messages enable row level security;
alter table public.thread_reads enable row level security;
alter table public.notifications enable row level security;
alter table private.message_limits enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.messages, public.thread_reads, public.notifications
  from anon, authenticated;
revoke all on private.message_limits from public, anon, authenticated;

create policy "messages: when the proposal is readable" on public.messages
for select to authenticated
using (exists (select 1 from public.proposals p where p.id = messages.proposal_id));

create policy "thread reads: own" on public.thread_reads
for select to authenticated
using (member_id = (select auth.uid()));

create policy "notifications: own" on public.notifications
for select to authenticated
using (recipient_id = (select auth.uid()));

-- Writing ------------------------------------------------------------

create function private.notify(p_recipient uuid, p_kind text, p_proposal_id uuid, p_actor uuid) returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, proposal_id, actor_id)
  values (p_recipient, p_kind, p_proposal_id, p_actor)
$$;

-- A new message: one more on the thread's unread notification, or a
-- new one.
create function private.notify_message(p_recipient uuid, p_proposal_id uuid, p_actor uuid) returns void
language sql
set search_path = ''
as $$
  insert into public.notifications (recipient_id, kind, proposal_id, actor_id)
  values (p_recipient, 'message', p_proposal_id, p_actor)
  on conflict (recipient_id, proposal_id) where kind = 'message' and read_at is null
  do update set count = public.notifications.count + 1, actor_id = excluded.actor_id, updated_at = now()
$$;

-- N7: one system line, and a notification for each member who didn't
-- act. Events BATR causes (expiry, the offer closing) have no actor.
create function private.proposal_event_written() returns trigger
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

create trigger proposal_events_messages
after insert on public.proposal_events
for each row execute function private.proposal_event_written();

-- The agreement's `create` event comes with the proposal's `accept`,
-- which already wrote the line and notification.
create function private.agreement_event_written() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_agreement public.agreements;
  v_kind text := case when new.to_status = 'completed' then 'agreement.completed' else 'agreement.' || new.action end;
  v_member uuid;
begin
  if new.action = 'create' then
    return null;
  end if;
  select * into v_agreement from public.agreements a where a.id = new.agreement_id;
  insert into public.messages (proposal_id, kind, system_event, actor_id)
  values (v_agreement.proposal_id, 'system', v_kind, new.actor_id);
  foreach v_member in array array[v_agreement.proposer_id, v_agreement.owner_id] loop
    if v_member is distinct from new.actor_id then
      perform private.notify(v_member, v_kind, v_agreement.proposal_id, new.actor_id);
    end if;
  end loop;
  return null;
end;
$$;

create trigger agreement_events_messages
after insert on public.agreement_events
for each row execute function private.agreement_event_written();

-- Threads -----------------------------------------------------------

-- N5: closed when the proposal ended without agreement, and 30 days
-- after the agreement completed or was cancelled.
create function private.thread_closed(p_proposal public.proposals) returns boolean
language sql stable
set search_path = ''
as $$
  select case private.effective_proposal_status(p_proposal.status, p_proposal.expires_at)
    when 'open' then false
    when 'accepted' then coalesce((
      select coalesce(a.completed_at, a.cancelled_at)
               < now() - make_interval(days => private.message_limit('closedThreadDays'))
      from public.agreements a where a.proposal_id = p_proposal.id), false)
    else true
  end
$$;

-- Who a message or line is from, as the viewer reads it.
create function private.party_word(p_member uuid, p_viewer uuid) returns text
language sql immutable
set search_path = ''
as $$ select case when p_member is null then null when p_member = p_viewer then 'you' else 'them' end $$;

create function private.message_json(p_message public.messages, p_viewer uuid) returns jsonb
language sql immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_message.id,
    'kind', p_message.kind,
    'from', private.party_word(p_message.sender_id, p_viewer),
    'body', p_message.body,
    'event', p_message.system_event,
    'actor', private.party_word(p_message.actor_id, p_viewer),
    'created_at', p_message.created_at)
$$;

create function private.thread_proposal(p_proposal_id uuid, p_actor uuid) returns public.proposals
language plpgsql stable
set search_path = ''
as $$
declare
  v_proposal public.proposals;
begin
  select * into v_proposal from public.proposals p
  where p.id = p_proposal_id and p_actor in (p.proposer_id, p.owner_id);
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return v_proposal;
end;
$$;

-- Messages the viewer hasn't read: after their read marker, not their
-- own, and not lines for something they did.
create function private.unread_messages(p_proposal_id uuid, p_viewer uuid) returns integer
language sql stable
set search_path = ''
as $$
  select count(*)::integer from public.messages m
  where m.proposal_id = p_proposal_id
    and m.id > coalesce((select r.last_read_id from public.thread_reads r
                         where r.proposal_id = p_proposal_id and r.member_id = p_viewer), 0)
    and coalesce(m.sender_id, m.actor_id) is distinct from p_viewer
$$;

create function public.message_send(p_proposal_id uuid, p_body text, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_proposal public.proposals;
  v_body text := private.trim_text(coalesce(p_body, ''));
  v_message public.messages;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/proposals/:id/messages', p_proposal_id,
    private.request_hash(jsonb_build_object('body', p_body)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_proposal := private.thread_proposal(p_proposal_id, v_actor);
  if private.thread_closed(v_proposal) then
    perform private.fail('CONFLICT', 409, '{"reason": "thread_closed"}');
  end if;
  if char_length(v_body) not between 1 and private.message_limit('bodyMax') then
    perform private.fail('VALIDATION_FAILED', 422, '{"fields": {"body": "length"}}');
  end if;
  -- N4. Serialised per member so two sends at once can't both pass.
  perform pg_advisory_xact_lock(hashtextextended('message_send:' || v_actor::text, 0));
  if (select count(*) from public.messages m
      where m.sender_id = v_actor and m.kind = 'text' and m.created_at > now() - interval '1 minute')
     >= private.message_limit('perMinute') then
    perform private.fail('RATE_LIMITED', 429);
  end if;
  insert into public.messages (proposal_id, kind, sender_id, body)
  values (v_proposal.id, 'text', v_actor, v_body)
  returning * into v_message;
  perform private.notify_message(
    case when v_actor = v_proposal.owner_id then v_proposal.proposer_id else v_proposal.owner_id end,
    v_proposal.id, v_actor);
  v_response := private.message_json(v_message, v_actor);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_proposal.id);
  return v_response;
end;
$$;

-- The newest page (older ones with `p_before`), or everything after
-- `p_after` for an open page checking for new messages (N1). Items are
-- oldest first.
create function public.message_list(
  p_proposal_id uuid, p_after bigint default null, p_before bigint default null, p_limit integer default 50
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_proposal public.proposals := private.thread_proposal(p_proposal_id, v_actor);
  v_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_rows public.messages[];
  v_more boolean;
begin
  if p_after is not null then
    select coalesce(array_agg(x.m order by (x.m).id), '{}') into v_rows
    from (select m from public.messages m
          where m.proposal_id = v_proposal.id and m.id > p_after
          order by m.id limit v_limit + 1) x;
    v_more := cardinality(v_rows) > v_limit;
    v_rows := v_rows[1:v_limit];
  else
    select coalesce(array_agg(x.m order by (x.m).id desc), '{}') into v_rows
    from (select m from public.messages m
          where m.proposal_id = v_proposal.id and (p_before is null or m.id < p_before)
          order by m.id desc limit v_limit + 1) x;
    v_more := cardinality(v_rows) > v_limit;
    select coalesce(array_agg(r order by r.id), '{}') into v_rows
    from unnest(v_rows[1:v_limit]) r;
  end if;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(private.message_json(r, v_actor) order by r.id), '[]') from unnest(v_rows) r),
    'more', v_more,
    'closed', private.thread_closed(v_proposal),
    'unread', private.unread_messages(v_proposal.id, v_actor));
end;
$$;

-- Marks the thread read up to `p_up_to` (default: everything), and its
-- message notifications with it. Never moves the marker back.
create function public.message_read(p_proposal_id uuid, p_up_to bigint default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_proposal public.proposals := private.thread_proposal(p_proposal_id, v_actor);
  v_last bigint;
begin
  select coalesce(max(m.id), 0) into v_last from public.messages m
  where m.proposal_id = v_proposal.id and (p_up_to is null or m.id <= p_up_to);
  insert into public.thread_reads (proposal_id, member_id, last_read_id)
  values (v_proposal.id, v_actor, v_last)
  on conflict (proposal_id, member_id) do update
  set last_read_id = greatest(public.thread_reads.last_read_id, excluded.last_read_id), updated_at = now();
  if private.unread_messages(v_proposal.id, v_actor) = 0 then
    update public.notifications n set read_at = now()
    where n.recipient_id = v_actor and n.proposal_id = v_proposal.id and n.kind = 'message' and n.read_at is null;
  end if;
  return jsonb_build_object('unread', private.unread_messages(v_proposal.id, v_actor));
end;
$$;

-- N2: unread counts for the Exchanges rows, by proposal.
create function public.message_unread_counts() returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.id, x.unread), '{}')
  from (
    select p.id, private.unread_messages(p.id, (select auth.uid())) as unread
    from public.proposals p
    where (select auth.uid()) in (p.proposer_id, p.owner_id)
  ) x
  where x.unread > 0
$$;

-- N2: the Messages page. Every thread of the viewer's, latest message
-- first, paged by that message's id: the other member, the offer, the
-- last line, the unread count, and the agreement once there is one.
create function public.message_threads(p_before bigint default null, p_limit integer default 20) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_items jsonb;
  v_count integer;
  v_last bigint;
begin
  with threads as (
    select p.id, p.offer_id, case when p.proposer_id = v_actor then p.owner_id else p.proposer_id end as other_id,
           (select max(m.id) from public.messages m where m.proposal_id = p.id) as last_id
    from public.proposals p
    where v_actor in (p.proposer_id, p.owner_id)
  ), page as (
    select t.* from threads t
    where t.last_id is not null and (p_before is null or t.last_id < p_before)
    order by t.last_id desc
    limit v_limit + 1
  ), shown as (
    select * from page order by last_id desc limit v_limit
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'proposal_id', s.id,
      'agreement_id', (select a.id from public.agreements a where a.proposal_id = s.id),
      'other_name', (select pr.display_name from public.profiles pr where pr.id = s.other_id),
      'offer_title', (select o.title from public.offers o where o.id = s.offer_id),
      'last', (select private.message_json(m, v_actor) from public.messages m where m.id = s.last_id),
      'unread', private.unread_messages(s.id, v_actor),
      'closed', (select private.thread_closed(p) from public.proposals p where p.id = s.id)
    ) order by s.last_id desc), '[]'),
    (select count(*) from page),
    min(s.last_id)
  into v_items, v_count, v_last
  from shown s;
  return jsonb_build_object('items', v_items, 'next', case when v_count > v_limit then v_last end);
end;
$$;

-- Notifications -----------------------------------------------------

create function private.notification_json(p_notification public.notifications) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_notification.id,
    'kind', p_notification.kind,
    'count', p_notification.count,
    'actor_name', (select pr.display_name from public.profiles pr where pr.id = p_notification.actor_id),
    'offer_title', o.title,
    'proposal_id', p_notification.proposal_id,
    'agreement_id', case when p_notification.kind = 'message'
                           or p_notification.kind = 'proposal.accept'
                           or p_notification.kind like 'agreement.%'
                         then a.id end,
    'read', p_notification.read_at is not null,
    'created_at', p_notification.created_at,
    'updated_at', p_notification.updated_at)
  from public.proposals p
  join public.offers o on o.id = p.offer_id
  left join public.agreements a on a.proposal_id = p.id
  where p.id = p_notification.proposal_id
$$;

-- The viewer's notifications, newest activity first, paged by
-- (updated_at, id).
create function public.notification_list(
  p_before_updated_at timestamptz default null, p_before_id uuid default null, p_limit integer default 20
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_rows public.notifications[];
begin
  select coalesce(array_agg(x.n order by (x.n).updated_at desc, (x.n).id desc), '{}') into v_rows
  from (
    select n from public.notifications n
    where n.recipient_id = v_actor
      and (p_before_updated_at is null or p_before_id is null or (n.updated_at, n.id) < (p_before_updated_at, p_before_id))
    order by n.updated_at desc, n.id desc
    limit v_limit + 1
  ) x;
  return jsonb_build_object(
    'items', (select coalesce(jsonb_agg(private.notification_json(r) order by r.updated_at desc, r.id desc), '[]')
              from unnest(v_rows[1:v_limit]) r),
    'next', case when cardinality(v_rows) > v_limit
                 then jsonb_build_object('updated_at', v_rows[v_limit].updated_at, 'id', v_rows[v_limit].id) end,
    'unread', (select count(*) from public.notifications n where n.recipient_id = v_actor and n.read_at is null));
end;
$$;

create function public.notification_count() returns integer
language sql stable security definer
set search_path = ''
as $$
  select count(*)::integer from public.notifications n
  where n.recipient_id = (select auth.uid()) and n.read_at is null
$$;

create function public.notification_read(p_notification_id uuid) returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not exists (select 1 from public.notifications n where n.id = p_notification_id and n.recipient_id = v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  update public.notifications n set read_at = now()
  where n.id = p_notification_id and n.read_at is null;
  return public.notification_count();
end;
$$;

create function public.notification_read_all() returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  update public.notifications n set read_at = now()
  where n.recipient_id = v_actor and n.read_at is null;
  return 0;
end;
$$;

-- Privileges --------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.message_send(uuid, text, uuid),
  public.message_list(uuid, bigint, bigint, integer),
  public.message_read(uuid, bigint),
  public.message_unread_counts(),
  public.message_threads(bigint, integer),
  public.notification_list(timestamptz, uuid, integer),
  public.notification_count(),
  public.notification_read(uuid),
  public.notification_read_all()
from public, anon, authenticated;

grant execute on function
  public.message_send(uuid, text, uuid),
  public.message_list(uuid, bigint, bigint, integer),
  public.message_read(uuid, bigint),
  public.message_unread_counts(),
  public.message_threads(bigint, integer),
  public.notification_list(timestamptz, uuid, integer),
  public.notification_count(),
  public.notification_read(uuid),
  public.notification_read_all()
to authenticated;
