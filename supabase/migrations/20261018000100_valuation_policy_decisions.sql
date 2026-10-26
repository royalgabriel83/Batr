-- Approved valuation and fee policies (owner, 2026-10-18; see
-- specs/valuation-and-fees.md). Changes to the valuation built in
-- 20261017000400_valuation.sql:
--
-- 1. Up to two appeals per valuation; the second is final. The limit
--    is part of the valuation policy (new version valuation-2026-10-18)
--    and the database holds it three ways: the appeal function, a
--    trigger on insert and a check on the appeal number.
-- 2. Conflict of interest: whoever made the decision being appealed
--    never handles that appeal, and every reviewer whose decision was
--    appealed has read-only access to that valuation from then on.
--    Triggers on the tables enforce this whichever function writes.
-- 3. The assessed value is for signed-in members only. Signed-out
--    visitors get, at most, the fact that BATR assessed an offer.
-- 4. Staff role grants and removals are recorded in an append-only log.
--
-- The fee rules are unchanged (fees-2026-10-17): the owner approved
-- them as built, including the offer owner bearing an odd kobo.

-- 1. Appeal limit -----------------------------------------------------------

alter table private.valuation_policies
  add column appeals_max integer not null default 1 check (appeals_max between 1 and 2);
alter table private.valuation_policies alter column appeals_max drop default;
insert into private.valuation_policies (version, inspection_threshold_kobo, appeals_max, effective_from)
values ('valuation-2026-10-18', null, 2, now());

create function private.appeal_limit() returns integer
language sql stable
set search_path = ''
as $$ select (private.current_valuation_policy()).appeals_max $$;

-- A valuation can now be appealed again after an appeal upheld its
-- assessment, so one assessment may have two appeals.
alter table public.valuation_appeals drop constraint valuation_appeals_assessment_id_key;
alter table public.valuation_appeals add column appeal_number integer;
update public.valuation_appeals p set appeal_number = n.number
from (select id, row_number() over (partition by submission_id order by created_at, id) as number from public.valuation_appeals) n
where n.id = p.id;
alter table public.valuation_appeals
  alter column appeal_number set not null,
  add constraint valuation_appeals_number check (appeal_number between 1 and 2),
  add constraint valuation_appeals_one_per_number unique (submission_id, appeal_number);

-- Holds the limit for any insert, whichever function makes it.
create function private.guard_appeal_limit() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count from public.valuation_appeals p where p.submission_id = new.submission_id;
  if v_count >= private.appeal_limit() then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'appeal_limit_reached'));
  end if;
  if new.appeal_number <> v_count + 1 then
    raise exception 'appeal % of submission % must be number %', new.appeal_number, new.submission_id, v_count + 1;
  end if;
  return new;
end;
$$;
create trigger valuation_appeals_limit before insert on public.valuation_appeals
for each row execute function private.guard_appeal_limit();

-- 2. Conflict of interest ---------------------------------------------------

create function private.is_appealed_reviewer(p_submission_id uuid, p_member uuid) returns boolean
language sql stable
set search_path = ''
as $$
  select exists (select 1 from public.valuation_appeals p where p.submission_id = p_submission_id and p.excluded_reviewer_id = p_member)
$$;

-- An appeal is only ever taken by a reviewer who did not make an
-- appealed decision on this valuation and did not submit it.
create function private.guard_appeal_assignment() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.assigned_reviewer_id is null then
    return new;
  end if;
  if new.assigned_reviewer_id = new.excluded_reviewer_id
    or private.is_appealed_reviewer(new.submission_id, new.assigned_reviewer_id)
    or exists (select 1 from public.valuation_submissions s where s.id = new.submission_id and s.submitter_id = new.assigned_reviewer_id)
    or not private.has_role(new.assigned_reviewer_id, 'valuation_reviewer')
  then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'appealed_reviewer'));
  end if;
  return new;
end;
$$;
create trigger valuation_appeals_assignment before insert or update of assigned_reviewer_id on public.valuation_appeals
for each row execute function private.guard_appeal_assignment();

-- Reviewers whose decision was appealed read the valuation but change
-- nothing on it: no comparisons, notes, requests, inspections or
-- assessments. Writes made by the signed-in caller are checked;
-- service-role maintenance (no caller) is not.
create function private.guard_appealed_reviewer() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null and private.is_appealed_reviewer(new.submission_id, auth.uid()) then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'appealed_reviewer'));
  end if;
  return new;
end;
$$;
create trigger valuation_comparisons_appealed_reviewer before insert or update on public.valuation_comparisons
for each row execute function private.guard_appealed_reviewer();
create trigger valuation_notes_appealed_reviewer before insert or update on public.valuation_notes
for each row execute function private.guard_appealed_reviewer();
create trigger valuation_requests_appealed_reviewer before insert on public.valuation_requests
for each row execute function private.guard_appealed_reviewer();
create trigger valuation_inspections_appealed_reviewer before insert or update on public.valuation_inspections
for each row execute function private.guard_appealed_reviewer();
create trigger valuation_assessments_appealed_reviewer before insert on public.valuation_assessments
for each row execute function private.guard_appealed_reviewer();

create or replace function public.valuation_appeal(
  p_submission_id uuid, p_expected_revision integer, p_reason text, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_assessment public.valuation_assessments;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_number integer;
  v_decided_by uuid;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/valuations/:id/appeal', p_submission_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision, 'reason', p_reason)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_own_submission(p_submission_id, v_actor, p_expected_revision, array['assessed', 'not_approved']);
  if length(v_reason) < 20 or length(v_reason) > private.valuation_limit('long_text_max') then
    perform private.validation_failed('{"reason": "invalid"}');
  end if;
  select * into v_assessment from public.valuation_assessments a where a.submission_id = v_sub.id order by a.version desc limit 1;
  if not found then
    -- A cash-only quote has no assessment to appeal.
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'nothing_to_appeal'));
  end if;
  -- At most private.appeal_limit() appeals per valuation (two at launch);
  -- the last one's decision is final. New evidence after that means
  -- withdrawing and asking for a new valuation. Rows are locked with the
  -- submission, and a trigger and a check on the table hold the limit too.
  select count(*) + 1 into v_number from public.valuation_appeals p where p.submission_id = v_sub.id;
  if v_number > private.appeal_limit() then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'appeal_limit_reached'));
  end if;
  -- A refused valuation reopens while the appeal runs; only one may be open per offer.
  if v_sub.status = 'not_approved' and exists (
    select 1 from public.valuation_submissions s
    where s.offer_id = v_sub.offer_id and s.id <> v_sub.id and s.status not in ('withdrawn', 'not_approved')
  ) then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'valuation_open'));
  end if;
  -- The decision being appealed: the latest assessment, or a later
  -- appeal decision that upheld it. Whoever made it never handles this
  -- appeal (nor anything else on this valuation from now on).
  select p.assigned_reviewer_id into v_decided_by from public.valuation_appeals p
  where p.submission_id = v_sub.id and p.status = 'decided' and p.outcome = 'upheld' and p.decided_at >= v_assessment.created_at
  order by p.decided_at desc limit 1;
  insert into public.valuation_appeals (submission_id, assessment_id, appellant_id, reason, excluded_reviewer_id, appeal_number)
  values (v_sub.id, v_assessment.id, v_actor, v_reason, coalesce(v_decided_by, v_assessment.reviewer_id), v_number);
  perform private.set_submission_status(v_sub.id, 'appealed');
  perform private.valuation_event(v_sub.id, v_actor, 'member', 'appealed', v_sub.status, 'appealed',
    jsonb_build_object('appeal_number', v_number));
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Members see each appeal's number and how many appeals remain.
create or replace function private.valuation_member_json(p_submission_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'offer_id', s.offer_id,
    'offer', (select jsonb_build_object('title', o.title, 'status', o.status) from public.offers o where o.id = s.offer_id),
    'exchange_type', s.exchange_type,
    'cash_component_kobo', s.cash_component_kobo,
    'status', s.status,
    'revision', s.revision,
    'declaration_accepted_at', s.declaration_accepted_at,
    'submitted_at', s.submitted_at,
    'policy_version', s.policy_version,
    'created_at', s.created_at,
    'updated_at', s.updated_at,
    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'category', c.category, 'subcategory', c.subcategory, 'description', c.description,
        'quantity', c.quantity, 'unit', c.unit, 'proposed_value_kobo', c.proposed_value_kobo, 'details', c.details
      ) order by c.position)
      from public.valuation_components c where c.submission_id = s.id), '[]'::jsonb),
    'evidence', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'kind', e.kind, 'component_id', e.component_id, 'mime', e.mime, 'size_bytes', e.size_bytes,
        'sensitive', e.sensitive, 'created_at', e.created_at
      ) order by e.created_at, e.id)
      from public.valuation_evidence e where e.submission_id = s.id), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'message', r.message, 'created_at', r.created_at, 'responded_at', r.responded_at, 'response_note', r.response_note
      ) order by r.created_at)
      from public.valuation_requests r where r.submission_id = s.id), '[]'::jsonb),
    'inspections', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id, 'status', i.status, 'reason', i.reason, 'scheduled_for', i.scheduled_for, 'arrangements', i.arrangements,
        'findings', i.findings, 'condition_confirmed', i.condition_confirmed, 'completed_at', i.completed_at,
        'cancelled_reason', i.cancelled_reason, 'created_at', i.created_at
      ) order by i.created_at)
      from public.valuation_inspections i where i.submission_id = s.id), '[]'::jsonb),
    'comparisons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'component_id', m.component_id, 'source', m.source, 'url', m.url, 'observed_on', m.observed_on,
        'price_kind', m.price_kind, 'price_kobo', m.price_kobo, 'adjustments', m.adjustments, 'adjusted_kobo', m.adjusted_kobo,
        'condition', m.condition, 'characteristics', m.characteristics
      ) order by m.created_at)
      from public.valuation_comparisons m
      where m.submission_id = s.id and not m.excluded
        and exists (select 1 from public.valuation_assessments a where a.submission_id = s.id)), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'version', a.version, 'outcome', a.outcome, 'components', a.components,
        'total_noncash_kobo', a.total_noncash_kobo, 'rationale', a.rationale, 'confidence', a.confidence,
        'limitations', a.limitations, 'message', a.message, 'appeal_id', a.appeal_id,
        'inspected', a.inspection_id is not null, 'policy_version', a.policy_version, 'created_at', a.created_at
      ) order by a.version)
      from public.valuation_assessments a where a.submission_id = s.id), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'number', p.appeal_number, 'assessment_id', p.assessment_id, 'reason', p.reason,
        'status', case when p.status = 'assigned' then 'open' else p.status end,
        'outcome', p.outcome, 'decision_rationale', p.decision_rationale, 'decided_at', p.decided_at, 'created_at', p.created_at
      ) order by p.created_at)
      from public.valuation_appeals p where p.submission_id = s.id), '[]'::jsonb),
    'appeal_limit', private.appeal_limit(),
    'appeals_remaining', greatest(private.appeal_limit() - (select count(*) from public.valuation_appeals p where p.submission_id = s.id), 0),
    'fee_quote', (select private.quote_json(q) from public.fee_quotes q where q.submission_id = s.id and q.status = 'current'),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', v.action, 'from_status', v.from_status, 'to_status', v.to_status,
        'by', case when v.actor_id = s.submitter_id then 'you' else 'batr' end, 'created_at', v.created_at
      ) order by v.id)
      from public.valuation_events v where v.submission_id = s.id and not v.internal), '[]'::jsonb)
  )
  from public.valuation_submissions s
  where s.id = p_submission_id
$$;

-- 3. Assessed value for signed-in members only -----------------------------

-- The summary on an offer page (exact value, confidence, inspection,
-- date) now needs a signed-in caller, in the grant and in the function.
create or replace function public.offer_valuation_summary(p_offer_id uuid) returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total_noncash_kobo', a.total_noncash_kobo,
    'confidence', a.confidence,
    'inspected', a.inspection_id is not null,
    'assessed_at', a.created_at,
    'policy_version', a.policy_version
  )
  from public.offers o
  join public.valuation_submissions s on s.offer_id = o.id and s.status = 'assessed'
  join lateral (
    select * from public.valuation_assessments x where x.submission_id = s.id order by x.version desc limit 1
  ) a on a.outcome = 'approved'
  where auth.uid() is not null and o.id = p_offer_id and (o.status = 'active' or o.owner_id = auth.uid())
$$;
revoke execute on function public.offer_valuation_summary(uuid) from public, anon;
grant execute on function public.offer_valuation_summary(uuid) to authenticated;

-- For signed-out visitors: only whether an active offer has a value
-- assessed by BATR. No amount, confidence, date or other detail.
create function public.offer_assessment_indicator(p_offer_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.offers o
    join public.valuation_submissions s on s.offer_id = o.id and s.status = 'assessed'
    join lateral (
      select x.outcome from public.valuation_assessments x where x.submission_id = s.id order by x.version desc limit 1
    ) a on a.outcome = 'approved'
    where o.id = p_offer_id and o.status = 'active'
  )
$$;
revoke execute on function public.offer_assessment_indicator(uuid) from public;
grant execute on function public.offer_assessment_indicator(uuid) to anon, authenticated;

-- 4. Staff role audit -------------------------------------------------------

-- Every grant, change and removal of a staff role, never edited or
-- deleted. Kept without a foreign key so the record outlives the account.
create table private.staff_role_events (
  id bigint generated always as identity primary key,
  member_id uuid not null,
  role text not null,
  action text not null check (action in ('granted', 'changed', 'revoked')),
  database_role text not null default current_user,
  acted_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create function private.record_staff_role_event() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into private.staff_role_events (member_id, role, action) values (new.member_id, new.role, 'granted');
  elsif tg_op = 'UPDATE' then
    insert into private.staff_role_events (member_id, role, action) values (new.member_id, new.role, 'changed');
  else
    insert into private.staff_role_events (member_id, role, action) values (old.member_id, old.role, 'revoked');
  end if;
  return null;
end;
$$;
create trigger staff_roles_audit after insert or update or delete on private.staff_roles
for each row execute function private.record_staff_role_event();
create trigger staff_role_events_append_only before update or delete on private.staff_role_events
for each row execute function private.refuse_update();

revoke all on private.staff_role_events from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
