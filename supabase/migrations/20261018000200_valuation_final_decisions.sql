-- Final valuation decisions (owner, 2026-10-18 00:36; see
-- specs/valuation-and-fees.md):
--
-- 1. PDF uploads are off until malware scanning is integrated and
--    tested: the valuation policy says so (valuation-2026-10-18b), a
--    trigger refuses PDF evidence rows, and the storage bucket accepts
--    WebP only. Images keep their existing checks.
-- 2. A repeat valuation (a new valuation of an offer BATR already
--    decided, or one reusing files from another decided valuation of
--    the same member) must bring genuinely new evidence or a material
--    change, and say what is new. Otherwise sending it is refused.
--    A genuine repeat gets its own two appeals; reviewers whose
--    decisions were appealed on the earlier valuation stay read-only on
--    the repeat; a repeat's first fee quote needs both parties'
--    reconfirmation when the earlier valuation had a quote.
-- The visitor indicator and the members-only assessed value
-- (20261018000100) are unchanged.

-- 1. PDF uploads off ------------------------------------------------------

alter table private.valuation_policies add column pdf_uploads_enabled boolean not null default true;
alter table private.valuation_policies alter column pdf_uploads_enabled drop default;
insert into private.valuation_policies (version, inspection_threshold_kobo, appeals_max, pdf_uploads_enabled, effective_from)
values ('valuation-2026-10-18b', null, 2, false, now());

update storage.buckets set allowed_mime_types = array['image/webp'] where id = 'valuation-evidence';

create function private.guard_pdf_evidence() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.mime = 'application/pdf' and not (private.current_valuation_policy()).pdf_uploads_enabled then
    perform private.fail('UNSUPPORTED_FORMAT', 422, jsonb_build_object('reason', 'pdf_disabled'));
  end if;
  return new;
end;
$$;
create trigger valuation_evidence_pdf before insert on public.valuation_evidence
for each row execute function private.guard_pdf_evidence();

-- 2. Repeat valuations ------------------------------------------------------

alter table public.valuation_submissions
  add column repeat_of uuid references public.valuation_submissions (id) on delete set null,
  add column repeat_reason text,
  add constraint valuation_submissions_repeat_not_self check (repeat_of is distinct from id);

-- The storage fingerprint of a file (the MD5 eTag storage records for a
-- single-part upload). The server re-encodes images the same way every
-- time, so the same original gives the same fingerprint.
create function private.evidence_fingerprint(p_path text) returns text
language sql stable
set search_path = ''
as $$ select o.metadata ->> 'eTag' from storage.objects o where o.bucket_id = 'valuation-evidence' and o.name = p_path $$;

-- What a valuation says, without ids, order or the values proposed:
-- the facts a material change must alter.
create function private.valuation_facts(p_submission_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'exchange_type', s.exchange_type,
    'cash_component_kobo', s.cash_component_kobo,
    'components', coalesce((
      select jsonb_agg(x order by x::text) from (
        select jsonb_build_object('kind', c.kind, 'category', c.category, 'subcategory', c.subcategory,
          'description', lower(regexp_replace(btrim(c.description), '\s+', ' ', 'g')),
          'quantity', c.quantity, 'unit', c.unit, 'details', c.details) as x
        from public.valuation_components c where c.submission_id = s.id
      ) f), '[]'::jsonb)
  )
  from public.valuation_submissions s where s.id = p_submission_id
$$;

-- What a member is told about the earlier valuation a repeat follows.
create function private.valuation_previous_json(p_previous uuid, p_offer_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id,
    'status', s.status,
    'same_offer', s.offer_id = p_offer_id,
    'outcome', (select a.outcome from public.valuation_assessments a where a.submission_id = s.id order by a.version desc limit 1),
    'appeals_used', (select count(*) from public.valuation_appeals p where p.submission_id = s.id),
    'final', (select count(*) from public.valuation_appeals p where p.submission_id = s.id and p.status = 'decided') >= private.appeal_limit()
  )
  from public.valuation_submissions s where s.id = p_previous
$$;

-- Is this valuation a repeat, and if so, of which earlier one and with
-- what change? Null when it is not a repeat. A repeat follows a
-- valuation BATR already decided (it has an assessment) by the same
-- member, of the same offer or sharing a file with this one. New
-- evidence means a file whose fingerprint is in none of the member's
-- earlier valuations; a material change means different facts from
-- the earlier valuation.
create function private.valuation_repeat_check(p_submission_id uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_sub public.valuation_submissions;
  v_prev public.valuation_submissions;
  v_new_evidence boolean;
begin
  select * into v_sub from public.valuation_submissions s where s.id = p_submission_id;
  select s.* into v_prev
  from public.valuation_submissions s
  where s.id <> v_sub.id
    and s.submitter_id = v_sub.submitter_id
    and s.created_at <= v_sub.created_at
    and exists (select 1 from public.valuation_assessments a where a.submission_id = s.id)
    and (
      s.offer_id = v_sub.offer_id
      or exists (
        select 1 from public.valuation_evidence mine join public.valuation_evidence theirs
          on private.evidence_fingerprint(theirs.storage_path) = private.evidence_fingerprint(mine.storage_path)
        where mine.submission_id = v_sub.id and theirs.submission_id = s.id
      )
    )
  order by s.created_at desc
  limit 1;
  if v_prev.id is null then
    return null;
  end if;
  -- A file with no fingerprint never counts as new.
  select exists (
    select 1 from public.valuation_evidence mine
    where mine.submission_id = v_sub.id
      and private.evidence_fingerprint(mine.storage_path) is not null
      and not exists (
        select 1 from public.valuation_evidence theirs join public.valuation_submissions o on o.id = theirs.submission_id
        where o.submitter_id = v_sub.submitter_id and o.id <> v_sub.id
          and private.evidence_fingerprint(theirs.storage_path) = private.evidence_fingerprint(mine.storage_path)
      )
  ) into v_new_evidence;
  return jsonb_build_object(
    'repeat_of', v_prev.id,
    'new_evidence', v_new_evidence,
    'material_change', private.valuation_facts(v_sub.id) is distinct from private.valuation_facts(v_prev.id),
    'previous', private.valuation_previous_json(v_prev.id, v_sub.offer_id)
  );
end;
$$;

-- Reviewers whose decision was appealed stay read-only on a repeat of
-- that valuation too (and on repeats of repeats).
create or replace function private.is_appealed_reviewer(p_submission_id uuid, p_member uuid) returns boolean
language sql stable
set search_path = ''
as $$
  with recursive chain(id, depth) as (
    select p_submission_id, 0
    union all
    select s.repeat_of, c.depth + 1 from chain c join public.valuation_submissions s on s.id = c.id
    where s.repeat_of is not null and c.depth < 20
  )
  select exists (
    select 1 from public.valuation_appeals p join chain c on c.id = p.submission_id where p.excluded_reviewer_id = p_member
  )
$$;

create or replace function public.valuation_submit(
  p_submission_id uuid, p_expected_revision integer, p_declaration boolean, p_note text default '', p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_problems jsonb;
  v_to text;
  v_note text := btrim(coalesce(p_note, ''));
  v_repeat jsonb;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/valuations/:id/submit', p_submission_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision, 'declaration', p_declaration, 'note', p_note)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_own_submission(p_submission_id, v_actor, p_expected_revision, array['draft', 'evidence_requested']);
  if length(v_note) > private.valuation_limit('long_text_max') then
    perform private.validation_failed('{"note": "too_long"}');
  end if;
  v_problems := private.valuation_problems(v_sub.id);
  if p_declaration is distinct from true then
    v_problems := v_problems || '{"declaration": "required"}';
  end if;
  -- A repeat of a valuation BATR already decided (same offer, or the
  -- same files on another offer) must bring new evidence or a material
  -- change, and say what is new. Checked when first sent.
  if v_sub.status = 'draft' then
    v_repeat := private.valuation_repeat_check(v_sub.id);
    if v_repeat is not null then
      if not (v_repeat ->> 'new_evidence')::boolean and not (v_repeat ->> 'material_change')::boolean then
        perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'repeat_without_change', 'repeat_of', v_repeat ->> 'repeat_of'));
      end if;
      if length(v_note) < 20 then
        v_problems := v_problems || '{"note": "repeat_reason_required"}';
      end if;
    end if;
  end if;
  if v_problems <> '{}'::jsonb then
    perform private.validation_failed(v_problems);
  end if;
  v_to := case when v_sub.exchange_type = 'cash_only' then 'assessed' else 'submitted' end;
  update public.valuation_requests set responded_at = now(), response_note = v_note
  where submission_id = v_sub.id and responded_at is null;
  update public.valuation_submissions
  set status = v_to, revision = revision + 1, declaration_accepted_at = now(),
      submitted_at = coalesce(submitted_at, now()), updated_at = now(),
      repeat_of = coalesce((v_repeat ->> 'repeat_of')::uuid, repeat_of),
      repeat_reason = case when v_repeat is null then repeat_reason else v_note end
  where id = v_sub.id;
  perform private.valuation_event(v_sub.id, v_actor, 'member', case when v_sub.status = 'draft' then 'submitted' else 'resubmitted' end,
    v_sub.status, v_to, case when v_note = '' then '{}'::jsonb else jsonb_build_object('note', v_note) end
      || case when v_repeat is null then '{}'::jsonb else jsonb_build_object('repeat', v_repeat) end);
  if v_to = 'assessed' then
    perform private.issue_fee_quote(v_sub.id, null);
  end if;
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

create or replace function public.review_get(p_submission_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer', 'valuation_inspector']);
  v_sub public.valuation_submissions;
begin
  select * into v_sub from public.valuation_submissions s where s.id = p_submission_id;
  if not found or v_sub.status = 'draft' then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_sub.submitter_id = v_actor then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'own_submission'));
  end if;
  return private.valuation_review_json(p_submission_id) || jsonb_build_object(
    'viewer', jsonb_build_object(
      'id', v_actor,
      'reviewer', private.has_role(v_actor, 'valuation_reviewer'),
      'inspector', private.has_role(v_actor, 'valuation_inspector'),
      -- Reviewers whose decision was appealed, here or on the valuation
      -- this one repeats, only read it.
      'excluded', private.is_appealed_reviewer(v_sub.id, v_actor)
    ));
end;
$$;

create or replace function private.issue_fee_quote(p_submission_id uuid, p_assessment_id uuid) returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.valuation_submissions;
  v_noncash bigint := 0;
  v_fee jsonb;
  v_old uuid;
  v_new uuid;
begin
  select * into v_sub from public.valuation_submissions s where s.id = p_submission_id;
  if p_assessment_id is not null then
    select a.total_noncash_kobo into v_noncash from public.valuation_assessments a where a.id = p_assessment_id;
  end if;
  v_fee := private.platform_fee(v_sub.exchange_type, v_noncash, v_sub.cash_component_kobo);
  select q.id into v_old from public.fee_quotes q where q.submission_id = p_submission_id and q.status = 'current' for update;
  if v_old is not null then
    update public.fee_quotes set status = 'superseded' where id = v_old;
  end if;
  insert into public.fee_quotes (
    submission_id, assessment_id, exchange_type, assessed_noncash_kobo, cash_kobo, fee_basis_kobo, fee_bp,
    total_fee_kobo, party_a_share_kobo, party_b_share_kobo, policy_version, requires_reconfirmation
  ) values (
    p_submission_id, p_assessment_id, v_fee ->> 'exchange_type', (v_fee ->> 'assessed_noncash_kobo')::numeric::bigint,
    (v_fee ->> 'cash_kobo')::numeric::bigint, (v_fee ->> 'fee_basis_kobo')::numeric::bigint, (v_fee ->> 'fee_bp')::numeric::integer,
    (v_fee ->> 'total_fee_kobo')::numeric::bigint, (v_fee ->> 'party_a_share_kobo')::numeric::bigint, (v_fee ->> 'party_b_share_kobo')::numeric::bigint,
    v_fee ->> 'policy_version',
    -- A revised value needs both parties to confirm the new fee: a later
    -- quote on this valuation, or the first quote of a repeat valuation
    -- whose earlier valuation had one.
    v_old is not null or exists (select 1 from public.fee_quotes q where q.submission_id = v_sub.repeat_of)
  ) returning id into v_new;
  if v_old is not null then
    update public.fee_quotes set superseded_by = v_new where id = v_old;
  end if;
  return v_new;
end;
$$;

-- Members see whether a draft or sent valuation repeats an earlier one.
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
    'repeat_of', case when s.status = 'draft' then (private.valuation_repeat_check(s.id)) -> 'previous'
      else private.valuation_previous_json(s.repeat_of, s.offer_id) end,
    'repeat_reason', s.repeat_reason,
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


revoke execute on all functions in schema private from public, anon, authenticated;
