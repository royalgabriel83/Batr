-- Structured valuation, assessment, appeals and the 3% platform fee
-- (owner, 2026-10-17; specs/valuation-and-fees.md).
--
-- A member asks BATR to value what they offer: goods, services, skills
-- or a mix, with the exchange type (pure barter, barter plus cash, cash
-- only). They answer category-specific questions, upload private
-- evidence and declare it accurate. BATR reviewers compare the market,
-- ask for more evidence or a physical inspection, and record an
-- assessment. The member can appeal once per assessment; a different
-- reviewer decides. An approved assessment produces a fee quote: 3% of
-- the fee basis, split equally between the two parties.
--
-- Rules shared by everything here:
-- - Money is bigint kobo (NGN minor units). No floating point.
-- - Members and reviewers never touch tables directly: every table has
--   row-level security and no policies, and every read and write goes
--   through the functions below, which check who is acting.
-- - Reviewers and inspectors are BATR staff, listed in
--   private.staff_roles. Only SQL run by the service role adds them.
--   Nobody reviews or inspects their own submission.
-- - Assessments, appeals, requests, inspections and events are never
--   edited away: a change is a new row, so the history is kept.
-- - Errors use private.fail (SQLSTATE PTxxx) like the offer functions.

-- Staff roles ---------------------------------------------------------

create table private.staff_roles (
  member_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('valuation_reviewer', 'valuation_inspector')),
  granted_at timestamptz not null default now(),
  primary key (member_id, role)
);

create function private.has_role(p_member uuid, p_role text) returns boolean
language sql stable
set search_path = ''
as $$ select exists (select 1 from private.staff_roles r where r.member_id = p_member and r.role = p_role) $$;

-- The signed-in caller, who must hold one of the roles (403 otherwise).
create function private.require_staff(p_roles text[]) returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not exists (select 1 from private.staff_roles r where r.member_id = v_actor and r.role = any (p_roles)) then
    perform private.fail('FORBIDDEN', 403);
  end if;
  return v_actor;
end;
$$;

-- Policies --------------------------------------------------------------

-- A policy version is added, never edited, so every quote keeps the
-- terms it was calculated under. The latest effective version applies.
create table private.fee_policies (
  version text primary key,
  fee_bp integer not null check (fee_bp between 0 and 10000),
  party_share_bp integer not null check (party_share_bp = 5000),
  currency text not null check (currency = 'NGN'),
  effective_from timestamptz not null default now()
);
insert into private.fee_policies (version, fee_bp, party_share_bp, currency, effective_from)
values ('fees-2026-10-17', 300, 5000, 'NGN', '2026-10-17T00:00:00Z');

-- inspection_threshold_kobo: when set, approving a value at or above it
-- needs a completed physical inspection. Null until the owner decides
-- a threshold; reviewers then decide case by case.
create table private.valuation_policies (
  version text primary key,
  inspection_threshold_kobo bigint check (inspection_threshold_kobo > 0),
  effective_from timestamptz not null default now()
);
insert into private.valuation_policies (version, inspection_threshold_kobo, effective_from)
values ('valuation-2026-10-17', null, '2026-10-17T00:00:00Z');

create function private.current_fee_policy() returns private.fee_policies
language sql stable
set search_path = ''
as $$ select * from private.fee_policies p where p.effective_from <= now() order by p.effective_from desc limit 1 $$;

create function private.current_valuation_policy() returns private.valuation_policies
language sql stable
set search_path = ''
as $$ select * from private.valuation_policies p where p.effective_from <= now() order by p.effective_from desc limit 1 $$;

-- Reference lists (equal to packages/shared/src/valuation; parity test) --

create table private.valuation_options (
  list text not null,
  id text not null,
  primary key (list, id)
);
insert into private.valuation_options (list, id)
select 'exchange_type', unnest(array['pure_barter', 'cash_plus_barter', 'cash_only'])
union all select 'component_kind', unnest(array['goods', 'service', 'skill'])
union all select 'service_category', unnest(array['home_repair', 'beauty_wellness', 'tutoring', 'design_creative', 'tech_digital', 'events', 'transport', 'professional', 'other'])
union all select 'condition', unnest(array['new_unused', 'excellent', 'good', 'fair', 'poor', 'for_parts', 'unknown'])
union all select 'goods_status', unnest(array['new', 'used', 'refurbished', 'repaired'])
union all select 'functional_status', unnest(array['working', 'partly_working', 'not_working', 'untested'])
union all select 'complexity', unnest(array['basic', 'standard', 'complex'])
union all select 'recurrence', unnest(array['one_off', 'weekly', 'fortnightly', 'monthly'])
union all select 'evidence_kind', unnest(array['photo', 'receipt', 'invoice', 'warranty', 'repair_record', 'portfolio', 'supporting_document'])
union all select 'sensitive_evidence_kind', unnest(array['receipt', 'invoice', 'warranty', 'repair_record', 'supporting_document'])
union all select 'comparison_price_kind', unnest(array['asking', 'sold', 'quoted_rate', 'other'])
union all select 'adjustment_factor', unnest(array['age', 'condition', 'defects', 'quantity', 'completeness', 'scope', 'other'])
union all select 'assessment_outcome', unnest(array['approved', 'evidence_required', 'inspection_required', 'not_approved'])
union all select 'appeal_outcome', unnest(array['upheld', 'revised', 'evidence_required', 'inspection_required', 'not_approved'])
union all select 'confidence', unnest(array['low', 'medium', 'high']);

create function private.is_option(p_list text, p_id text) returns boolean
language sql stable
set search_path = ''
as $$
  select case
    when p_list = 'goods_category' then exists (select 1 from private.offer_categories c where c.id = p_id)
    else exists (select 1 from private.valuation_options o where o.list = p_list and o.id = p_id)
  end
$$;

-- The category-specific questions (packages/shared details.ts).
create table private.valuation_detail_fields (
  kind_group text not null check (kind_group in ('goods', 'service')),
  key text not null,
  position integer not null,
  type text not null check (type in ('text', 'long_text', 'boolean', 'integer', 'kobo', 'date', 'enum')),
  options text,
  required boolean not null default false,
  required_when text,
  required_unless text,
  primary key (kind_group, key)
);
insert into private.valuation_detail_fields (kind_group, key, position, type, options, required, required_when, required_unless) values
  ('goods', 'product_name', 1, 'text', null, true, null, null),
  ('goods', 'brand', 2, 'text', null, false, null, null),
  ('goods', 'model', 3, 'text', null, false, null, null),
  ('goods', 'model_number', 4, 'text', null, false, null, null),
  ('goods', 'identifiers', 5, 'text', null, false, null, null),
  ('goods', 'purchase_date', 6, 'date', null, false, null, null),
  ('goods', 'estimated_age_months', 7, 'integer', null, false, null, 'purchase_date'),
  ('goods', 'goods_status', 8, 'enum', 'goods_status', true, null, null),
  ('goods', 'condition', 9, 'enum', 'condition', true, null, null),
  ('goods', 'condition_notes', 10, 'long_text', null, false, null, null),
  ('goods', 'functional_status', 11, 'enum', 'functional_status', true, null, null),
  ('goods', 'test_results', 12, 'long_text', null, false, null, null),
  ('goods', 'has_known_defects', 13, 'boolean', null, true, null, null),
  ('goods', 'defects', 14, 'long_text', null, false, 'has_known_defects', null),
  ('goods', 'missing_parts', 15, 'long_text', null, false, null, null),
  ('goods', 'previous_repairs', 16, 'long_text', null, false, null, null),
  ('goods', 'accessories', 17, 'long_text', null, false, null, null),
  ('goods', 'specifications', 18, 'long_text', null, false, null, null),
  ('goods', 'dimensions', 19, 'text', null, false, null, null),
  ('goods', 'warranty', 20, 'text', null, false, null, null),
  ('goods', 'authenticity_notes', 21, 'long_text', null, false, null, null),
  ('goods', 'usage_history', 22, 'long_text', null, false, null, null),
  ('goods', 'purchase_price_kobo', 23, 'kobo', null, false, null, null),
  ('goods', 'user_comparables', 24, 'long_text', null, false, null, null),
  ('service', 'service_type', 1, 'text', null, true, null, null),
  ('service', 'scope', 2, 'long_text', null, true, null, null),
  ('service', 'deliverables', 3, 'long_text', null, true, null, null),
  ('service', 'acceptance_criteria', 4, 'long_text', null, true, null, null),
  ('service', 'estimated_hours', 5, 'integer', null, true, null, null),
  ('service', 'complexity', 6, 'enum', 'complexity', true, null, null),
  ('service', 'schedule', 7, 'text', null, false, null, null),
  ('service', 'recurrence', 8, 'enum', 'recurrence', false, null, null),
  ('service', 'sessions', 9, 'integer', null, false, null, null),
  ('service', 'materials', 10, 'long_text', null, false, null, null),
  ('service', 'travel', 11, 'text', null, false, null, null),
  ('service', 'extra_expenses_kobo', 12, 'kobo', null, false, null, null),
  ('service', 'experience', 13, 'long_text', null, true, null, null),
  ('service', 'qualifications', 14, 'long_text', null, false, null, null),
  ('service', 'revisions_included', 15, 'integer', null, false, null, null),
  ('service', 'exclusions', 16, 'long_text', null, false, null, null),
  ('service', 'dependencies', 17, 'long_text', null, false, null, null),
  ('service', 'limitations', 18, 'long_text', null, false, null, null),
  ('service', 'comparable_rates', 19, 'long_text', null, false, null, null);

-- Limits (packages/shared VALUATION_LIMITS, DETAIL_LIMITS, EVIDENCE_LIMITS).
create function private.valuation_limit(p_name text) returns bigint
language sql immutable
set search_path = ''
as $$
  select case p_name
    when 'kobo_max' then 100000000000000
    when 'components_max' then 10
    when 'description_min' then 10
    when 'text_max' then 200
    when 'long_text_max' then 2000
    when 'integer_max' then 100000
    when 'evidence_max' then 30
    when 'evidence_bytes_max' then 10485760
    when 'min_photos_per_goods' then 2
  end
$$;

-- Tables --------------------------------------------------------------

create table public.valuation_submissions (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  submitter_id uuid not null references public.profiles (id) on delete cascade,
  exchange_type text not null default 'pure_barter',
  cash_component_kobo bigint not null default 0 check (cash_component_kobo >= 0),
  status text not null default 'draft' check (
    status in ('draft', 'submitted', 'evidence_requested', 'inspection_required', 'assessed', 'appealed', 'not_approved', 'withdrawn')
  ),
  revision integer not null default 1,
  declaration_accepted_at timestamptz,
  submitted_at timestamptz,
  policy_version text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- One open valuation per offer. A withdrawn or refused one is history.
create unique index valuation_submissions_one_open on public.valuation_submissions (offer_id)
where status not in ('withdrawn', 'not_approved');
create index valuation_submissions_by_status on public.valuation_submissions (status, submitted_at);
create index valuation_submissions_by_submitter on public.valuation_submissions (submitter_id, created_at desc);

create table public.valuation_components (
  id uuid primary key,
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  position integer not null,
  kind text not null,
  category text,
  subcategory text not null default '',
  description text not null default '',
  quantity integer not null default 1 check (quantity between 1 and 10000),
  unit text not null default '',
  proposed_value_kobo bigint check (proposed_value_kobo >= 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index valuation_components_by_submission on public.valuation_components (submission_id, position);

create table public.valuation_requests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  message text not null,
  requested_by uuid not null,
  appeal_id uuid,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  response_note text
);
create index valuation_requests_by_submission on public.valuation_requests (submission_id, created_at);

create table public.valuation_appeals (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  assessment_id uuid not null,
  appellant_id uuid not null,
  reason text not null,
  status text not null default 'open' check (status in ('open', 'assigned', 'decided', 'withdrawn')),
  -- The reviewer whose assessment is appealed: never decides the appeal.
  excluded_reviewer_id uuid not null,
  assigned_reviewer_id uuid,
  outcome text,
  decision_rationale text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assessment_id),
  check (assigned_reviewer_id is distinct from excluded_reviewer_id)
);
create index valuation_appeals_by_status on public.valuation_appeals (status, created_at);

create table public.valuation_evidence (
  id uuid primary key,
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  component_id uuid references public.valuation_components (id) on delete set null,
  uploader_id uuid not null,
  kind text not null,
  storage_path text not null unique,
  mime text not null check (mime in ('image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0),
  sensitive boolean not null,
  request_id uuid references public.valuation_requests (id) on delete set null,
  appeal_id uuid references public.valuation_appeals (id) on delete set null,
  created_at timestamptz not null default now()
);
create index valuation_evidence_by_submission on public.valuation_evidence (submission_id, created_at);

create table public.valuation_inspections (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  status text not null default 'requested' check (status in ('requested', 'scheduled', 'completed', 'cancelled')),
  reason text not null,
  requested_by uuid not null,
  appeal_id uuid references public.valuation_appeals (id) on delete set null,
  inspector_id uuid,
  scheduled_for timestamptz,
  arrangements text not null default '',
  findings text not null default '',
  condition_confirmed text,
  completed_at timestamptz,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or (inspector_id is not null and completed_at is not null and length(findings) > 0))
);
create index valuation_inspections_by_submission on public.valuation_inspections (submission_id, created_at);

create table public.valuation_comparisons (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  component_id uuid references public.valuation_components (id) on delete set null,
  reviewer_id uuid not null,
  source text not null,
  url text not null default '',
  observed_on date not null,
  price_kind text not null,
  price_kobo bigint not null check (price_kobo > 0),
  condition text not null default '',
  characteristics text not null default '',
  adjustments jsonb not null default '[]'::jsonb,
  adjusted_kobo bigint not null check (adjusted_kobo >= 0),
  excluded boolean not null default false,
  exclusion_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not excluded or length(coalesce(exclusion_reason, '')) > 0)
);
create index valuation_comparisons_by_submission on public.valuation_comparisons (submission_id, created_at);

create table public.valuation_assessments (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  version integer not null,
  reviewer_id uuid not null,
  appeal_id uuid references public.valuation_appeals (id) on delete set null,
  outcome text not null check (outcome in ('approved', 'not_approved')),
  components jsonb not null default '[]'::jsonb,
  total_noncash_kobo bigint not null check (total_noncash_kobo >= 0),
  rationale text not null,
  confidence text not null,
  limitations text not null default '',
  message text not null default '',
  inspection_id uuid references public.valuation_inspections (id) on delete set null,
  policy_version text not null,
  created_at timestamptz not null default now(),
  unique (submission_id, version),
  check (outcome <> 'approved' or total_noncash_kobo > 0)
);

alter table public.valuation_appeals
  add constraint valuation_appeals_assessment_fk foreign key (assessment_id) references public.valuation_assessments (id) on delete cascade;
alter table public.valuation_requests
  add constraint valuation_requests_appeal_fk foreign key (appeal_id) references public.valuation_appeals (id) on delete set null;

-- Internal notes: reviewers and inspectors only, never shown to members.
create table public.valuation_notes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  author_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- The audit trail. `internal` events are shown only to staff.
create table public.valuation_events (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  actor_id uuid not null,
  actor_role text not null check (actor_role in ('member', 'reviewer', 'inspector', 'system')),
  action text not null,
  from_status text,
  to_status text,
  detail jsonb not null default '{}'::jsonb,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index valuation_events_by_submission on public.valuation_events (submission_id, id);

-- Fee quotes: what the 3% fee would be on this valuation. A quote is
-- not money owed: a liability exists only once both parties agree an
-- exchange (agreements are not built yet). When the basis changes, the
-- old quote is superseded and the new one needs both parties to
-- confirm again.
create table public.fee_quotes (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.valuation_submissions (id) on delete cascade,
  assessment_id uuid references public.valuation_assessments (id) on delete set null,
  exchange_type text not null,
  assessed_noncash_kobo bigint not null check (assessed_noncash_kobo >= 0),
  cash_kobo bigint not null check (cash_kobo >= 0),
  fee_basis_kobo bigint not null check (fee_basis_kobo > 0),
  fee_bp integer not null,
  total_fee_kobo bigint not null check (total_fee_kobo >= 0),
  party_a_share_kobo bigint not null,
  party_b_share_kobo bigint not null,
  currency text not null default 'NGN',
  policy_version text not null,
  status text not null default 'current' check (status in ('current', 'superseded', 'void')),
  superseded_by uuid references public.fee_quotes (id),
  requires_reconfirmation boolean not null default false,
  created_at timestamptz not null default now(),
  check (party_a_share_kobo + party_b_share_kobo = total_fee_kobo),
  check (party_a_share_kobo - party_b_share_kobo in (0, 1))
);
create unique index fee_quotes_one_current on public.fee_quotes (submission_id) where status = 'current';

-- The fee ledger. Kept apart from any cash the members exchange with
-- each other, which BATR never holds. Each party's share is its own
-- liability; attempts, verified payments, refunds and adjustments are
-- separate records, and provider charges and taxes are their own
-- columns, never mixed into the fee. Nothing writes refunds or
-- adjustments yet: those policies are not decided. No payment provider
-- is configured, so no payment is ever recorded as made.
create table public.fee_liabilities (
  id uuid primary key default gen_random_uuid(),
  fee_quote_id uuid not null references public.fee_quotes (id) on delete restrict,
  agreement_id uuid not null,
  party_role text not null check (party_role in ('party_a', 'party_b')),
  member_id uuid not null references public.profiles (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo >= 0),
  currency text not null default 'NGN',
  status text not null default 'outstanding' check (status in ('outstanding', 'paid', 'superseded')),
  created_at timestamptz not null default now(),
  unique (agreement_id, fee_quote_id, party_role)
);

create table public.fee_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  liability_id uuid not null references public.fee_liabilities (id) on delete restrict,
  provider text not null check (provider in ('flutterwave')),
  tx_ref text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  status text not null default 'initiated' check (status in ('initiated', 'pending', 'failed', 'succeeded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  liability_id uuid not null references public.fee_liabilities (id) on delete restrict,
  attempt_id uuid references public.fee_payment_attempts (id) on delete restrict,
  provider text not null,
  provider_transaction_id text not null,
  amount_kobo bigint not null check (amount_kobo > 0),
  provider_charge_kobo bigint check (provider_charge_kobo >= 0),
  tax_kobo bigint check (tax_kobo >= 0),
  currency text not null default 'NGN',
  verified_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create table public.fee_refunds (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.fee_payments (id) on delete restrict,
  amount_kobo bigint not null check (amount_kobo > 0),
  reason text not null,
  status text not null check (status in ('requested', 'processing', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create table public.fee_adjustments (
  id uuid primary key default gen_random_uuid(),
  liability_id uuid not null references public.fee_liabilities (id) on delete restrict,
  amount_kobo bigint not null,
  reason text not null,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

-- Every provider notification, stored once per provider event id.
-- `signature_valid` records the server's check of the shared secret;
-- events are not applied to payments until the provider's own
-- verification call is implemented and configured.
create table private.payment_provider_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  payload jsonb not null,
  signature_valid boolean not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (provider, event_id)
);

-- Assessments, events and verified payments are append-only.
create function private.refuse_update() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append-only table: % cannot be updated', tg_table_name;
end;
$$;
create trigger valuation_assessments_append_only before update on public.valuation_assessments
for each row execute function private.refuse_update();
create trigger valuation_events_append_only before update on public.valuation_events
for each row execute function private.refuse_update();
create trigger fee_payments_append_only before update on public.fee_payments
for each row execute function private.refuse_update();

do $$
declare
  t text;
begin
  foreach t in array array[
    'valuation_submissions', 'valuation_components', 'valuation_requests', 'valuation_appeals', 'valuation_evidence',
    'valuation_inspections', 'valuation_comparisons', 'valuation_assessments', 'valuation_notes', 'valuation_events',
    'fee_quotes', 'fee_liabilities', 'fee_payment_attempts', 'fee_payments', 'fee_refunds', 'fee_adjustments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end;
$$;

-- Fee calculation (packages/shared calculatePlatformFee) ---------------

-- 3% of the basis, rounded half up to the kobo; party A (the offer
-- owner) bears an odd kobo so the shares add up exactly.
create function private.platform_fee(
  p_exchange_type text, p_noncash bigint, p_cash bigint, p_fee_bp integer default null
) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_policy private.fee_policies := private.current_fee_policy();
  v_bp integer := coalesce(p_fee_bp, v_policy.fee_bp);
  v_basis bigint;
  v_total bigint;
  v_b bigint;
begin
  if not private.is_option('exchange_type', p_exchange_type) then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('exchange_type', 'invalid')));
  end if;
  if p_noncash is null or p_noncash < 0 or p_noncash > private.valuation_limit('kobo_max') then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('assessed_noncash', 'invalid')));
  end if;
  if p_cash is null or p_cash < 0 or p_cash > private.valuation_limit('kobo_max') then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('cash_component_kobo', 'invalid')));
  end if;
  if (p_exchange_type = 'pure_barter' and p_cash <> 0)
    or (p_exchange_type = 'cash_plus_barter' and p_cash = 0)
    or (p_exchange_type = 'cash_only' and p_cash = 0) then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('cash_component_kobo', 'invalid')));
  end if;
  if (p_exchange_type in ('pure_barter', 'cash_plus_barter') and p_noncash = 0)
    or (p_exchange_type = 'cash_only' and p_noncash <> 0) then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('assessed_noncash', 'invalid')));
  end if;
  v_basis := case when p_exchange_type = 'cash_only' then p_cash else p_noncash + p_cash end;
  v_total := (v_basis * v_bp + 5000) / 10000;
  v_b := v_total / 2;
  return jsonb_build_object(
    'exchange_type', p_exchange_type,
    'assessed_noncash_kobo', p_noncash,
    'cash_kobo', p_cash,
    'fee_basis_kobo', v_basis,
    'fee_bp', v_bp,
    'total_fee_kobo', v_total,
    'party_a_share_kobo', v_total - v_b,
    'party_b_share_kobo', v_b,
    'policy_version', v_policy.version
  );
end;
$$;

-- Price × (100% + the adjustments), rounded half up (shared adjustedPrice).
create function private.comparison_adjusted_kobo(p_price bigint, p_adjustments jsonb) returns bigint
language sql immutable
set search_path = ''
as $$
  select (p_price * greatest(0, 10000 + coalesce(sum((a ->> 'percent_bp')::numeric::integer), 0)) + 5000) / 10000
  from jsonb_array_elements(coalesce(p_adjustments, '[]'::jsonb)) a
$$;

-- Helpers ---------------------------------------------------------------

create function private.detail_filled(p_value jsonb) returns boolean
language sql immutable
set search_path = ''
as $$
  select p_value is not null and p_value <> 'null'::jsonb
    and not (jsonb_typeof(p_value) = 'string' and btrim(p_value #>> '{}') = '')
$$;

create function private.safe_date(p_text text) returns date
language plpgsql immutable
set search_path = ''
as $$
begin
  if p_text is null or p_text !~ '^\d{4}-\d{2}-\d{2}$' then
    return null;
  end if;
  return p_text::date;
exception when others then
  return null;
end;
$$;

create function private.safe_timestamp(p_text text) returns timestamptz
language plpgsql stable
set search_path = ''
as $$
begin
  return p_text::timestamptz;
exception when others then
  return null;
end;
$$;

create function private.is_whole(p_value jsonb, p_min bigint, p_max bigint) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if jsonb_typeof(p_value) <> 'number' then
    return false;
  end if;
  v := (p_value #>> '{}')::numeric;
  return v = trunc(v) and v between p_min and p_max;
end;
$$;

create function private.text_ok(p_value jsonb, p_max bigint) returns boolean
language sql immutable
set search_path = ''
as $$ select jsonb_typeof(p_value) = 'string' and length(btrim(p_value #>> '{}')) <= p_max $$;

-- One detail value against its question (shared detailValueProblem).
create function private.detail_value_ok(p_field private.valuation_detail_fields, p_value jsonb) returns boolean
language plpgsql stable
set search_path = ''
as $$
declare
  v_date date;
begin
  case p_field.type
    when 'text' then return private.text_ok(p_value, private.valuation_limit('text_max'));
    when 'long_text' then return private.text_ok(p_value, private.valuation_limit('long_text_max'));
    when 'boolean' then return jsonb_typeof(p_value) = 'boolean';
    when 'integer' then return private.is_whole(p_value, 0, private.valuation_limit('integer_max'));
    when 'kobo' then return private.is_whole(p_value, 0, private.valuation_limit('kobo_max'));
    when 'date' then
      if jsonb_typeof(p_value) <> 'string' or (p_value #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then
        return false;
      end if;
      begin
        v_date := (p_value #>> '{}')::date;
      exception when others then
        return false;
      end;
      return v_date <= current_date;
    when 'enum' then return jsonb_typeof(p_value) = 'string' and private.is_option(p_field.options, p_value #>> '{}');
  end case;
  return false;
end;
$$;

create function private.validation_failed(p_fields jsonb) returns void
language sql
set search_path = ''
as $$ select private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', p_fields)) $$;

-- Checks a component and returns its details without blank answers,
-- with text trimmed. Fails with `{componentId}.{field}` keys.
create function private.clean_component(p_component jsonb) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_id text := p_component ->> 'id';
  v_kind text := p_component ->> 'kind';
  v_group text;
  v_details jsonb := coalesce(p_component -> 'details', '{}'::jsonb);
  v_clean jsonb := '{}'::jsonb;
  v_field private.valuation_detail_fields;
  v_entry record;
  v_problems jsonb := '{}'::jsonb;
begin
  if jsonb_typeof(p_component) <> 'object' or v_id is null or v_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    perform private.validation_failed(jsonb_build_object('components', 'invalid'));
  end if;
  if not private.is_option('component_kind', v_kind) then
    perform private.validation_failed(jsonb_build_object(v_id || '.kind', 'invalid'));
  end if;
  v_group := case when v_kind = 'goods' then 'goods' else 'service' end;
  if private.detail_filled(p_component -> 'category')
    and not private.is_option(case when v_group = 'goods' then 'goods_category' else 'service_category' end, p_component ->> 'category') then
    v_problems := v_problems || jsonb_build_object(v_id || '.category', 'invalid');
  end if;
  if not private.text_ok(coalesce(p_component -> 'subcategory', '""'), 80) then
    v_problems := v_problems || jsonb_build_object(v_id || '.subcategory', 'too_long');
  end if;
  if not private.text_ok(coalesce(p_component -> 'description', '""'), private.valuation_limit('long_text_max')) then
    v_problems := v_problems || jsonb_build_object(v_id || '.description', 'too_long');
  end if;
  if not private.text_ok(coalesce(p_component -> 'unit', '""'), 40) then
    v_problems := v_problems || jsonb_build_object(v_id || '.unit', 'too_long');
  end if;
  if not private.is_whole(coalesce(p_component -> 'quantity', '1'), 1, 10000) then
    v_problems := v_problems || jsonb_build_object(v_id || '.quantity', 'invalid');
  end if;
  if private.detail_filled(p_component -> 'proposed_value_kobo')
    and not private.is_whole(p_component -> 'proposed_value_kobo', 0, private.valuation_limit('kobo_max')) then
    v_problems := v_problems || jsonb_build_object(v_id || '.proposed_value_kobo', 'invalid');
  end if;
  if jsonb_typeof(v_details) <> 'object' then
    perform private.validation_failed(jsonb_build_object(v_id || '.details', 'invalid'));
  end if;
  for v_entry in select key, value from jsonb_each(v_details) loop
    select * into v_field from private.valuation_detail_fields f where f.kind_group = v_group and f.key = v_entry.key;
    if not found then
      v_problems := v_problems || jsonb_build_object(v_id || '.' || v_entry.key, 'not_applicable');
    elsif private.detail_filled(v_entry.value) then
      if jsonb_typeof(v_entry.value) = 'string' then
        v_entry.value := to_jsonb(btrim(v_entry.value #>> '{}'));
      end if;
      if private.detail_value_ok(v_field, v_entry.value) then
        v_clean := v_clean || jsonb_build_object(v_entry.key, v_entry.value);
      else
        v_problems := v_problems || jsonb_build_object(v_id || '.' || v_entry.key, 'invalid');
      end if;
    end if;
  end loop;
  if v_problems <> '{}'::jsonb then
    perform private.validation_failed(v_problems);
  end if;
  return v_clean;
end;
$$;

-- Everything that stops a submission being sent for review (shared
-- submitProblems), as `{field: reason}`.
create function private.valuation_problems(p_submission_id uuid) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_sub public.valuation_submissions;
  v_component public.valuation_components;
  v_field private.valuation_detail_fields;
  v_problems jsonb := '{}'::jsonb;
  v_photos integer;
begin
  select * into v_sub from public.valuation_submissions s where s.id = p_submission_id;
  if v_sub.exchange_type = 'cash_only' then
    if exists (select 1 from public.valuation_components c where c.submission_id = v_sub.id) then
      v_problems := v_problems || '{"components": "not_allowed"}';
    end if;
    if v_sub.cash_component_kobo = 0 then
      v_problems := v_problems || '{"cash_component_kobo": "required"}';
    end if;
    return v_problems;
  end if;
  if not exists (select 1 from public.valuation_components c where c.submission_id = v_sub.id) then
    v_problems := v_problems || '{"components": "required"}';
  end if;
  if v_sub.exchange_type = 'pure_barter' and v_sub.cash_component_kobo <> 0 then
    v_problems := v_problems || '{"cash_component_kobo": "not_allowed"}';
  end if;
  if v_sub.exchange_type = 'cash_plus_barter' and v_sub.cash_component_kobo = 0 then
    v_problems := v_problems || '{"cash_component_kobo": "required"}';
  end if;
  for v_component in select * from public.valuation_components c where c.submission_id = v_sub.id order by c.position loop
    if v_component.category is null then
      v_problems := v_problems || jsonb_build_object(v_component.id || '.category', 'required');
    end if;
    if length(btrim(v_component.description)) < private.valuation_limit('description_min') then
      v_problems := v_problems || jsonb_build_object(v_component.id || '.description', 'too_short');
    end if;
    if coalesce(v_component.proposed_value_kobo, 0) = 0 then
      v_problems := v_problems || jsonb_build_object(v_component.id || '.proposed_value_kobo', 'required');
    end if;
    for v_field in
      select * from private.valuation_detail_fields f
      where f.kind_group = case when v_component.kind = 'goods' then 'goods' else 'service' end
    loop
      if not private.detail_filled(v_component.details -> v_field.key) and (
        v_field.required
        or (v_field.required_when is not null and v_component.details -> v_field.required_when = 'true'::jsonb)
        or (v_field.required_unless is not null and not private.detail_filled(v_component.details -> v_field.required_unless))
      ) then
        v_problems := v_problems || jsonb_build_object(v_component.id || '.' || v_field.key, 'required');
      end if;
    end loop;
    if v_component.kind = 'goods' then
      select count(*) into v_photos from public.valuation_evidence e
      where e.component_id = v_component.id and e.kind = 'photo';
      if v_photos < private.valuation_limit('min_photos_per_goods') then
        v_problems := v_problems || jsonb_build_object(v_component.id || '.photos', 'too_few');
      end if;
    end if;
  end loop;
  return v_problems;
end;
$$;

create function private.valuation_event(
  p_submission_id uuid, p_actor uuid, p_role text, p_action text, p_from text, p_to text,
  p_detail jsonb default '{}'::jsonb, p_internal boolean default false
) returns void
language sql
set search_path = ''
as $$
  insert into public.valuation_events (submission_id, actor_id, actor_role, action, from_status, to_status, detail, internal)
  values (p_submission_id, p_actor, p_role, p_action, p_from, p_to, p_detail, p_internal)
$$;

-- Locks a submission for the member who owns it (404 for anyone else),
-- then checks the revision they last saw and the allowed statuses.
create function private.lock_own_submission(
  p_submission_id uuid, p_actor uuid, p_expected_revision integer, p_statuses text[]
) returns public.valuation_submissions
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.valuation_submissions;
begin
  select * into v_sub from public.valuation_submissions s where s.id = p_submission_id for update;
  if not found or v_sub.submitter_id <> p_actor then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if p_expected_revision is not null and v_sub.revision <> p_expected_revision then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'stale_revision', 'current_revision', v_sub.revision));
  end if;
  if p_statuses is not null and not (v_sub.status = any (p_statuses)) then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_sub.status));
  end if;
  return v_sub;
end;
$$;

-- Locks a submission for a staff member, who may never act on their own.
create function private.lock_review_submission(
  p_submission_id uuid, p_actor uuid, p_expected_revision integer, p_statuses text[]
) returns public.valuation_submissions
language plpgsql
set search_path = ''
as $$
declare
  v_sub public.valuation_submissions;
begin
  select * into v_sub from public.valuation_submissions s where s.id = p_submission_id for update;
  if not found or v_sub.status = 'draft' then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_sub.submitter_id = p_actor then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'own_submission'));
  end if;
  if p_expected_revision is not null and v_sub.revision <> p_expected_revision then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'stale_revision', 'current_revision', v_sub.revision));
  end if;
  if p_statuses is not null and not (v_sub.status = any (p_statuses)) then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_sub.status));
  end if;
  return v_sub;
end;
$$;

create function private.set_submission_status(p_submission_id uuid, p_status text) returns public.valuation_submissions
language sql
set search_path = ''
as $$
  update public.valuation_submissions
  set status = p_status, revision = revision + 1, updated_at = now()
  where id = p_submission_id
  returning *
$$;

-- Supersedes the current quote (if any) with one for the latest basis.
create function private.issue_fee_quote(p_submission_id uuid, p_assessment_id uuid) returns uuid
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
    v_fee ->> 'policy_version', v_old is not null
  ) returning id into v_new;
  if v_old is not null then
    update public.fee_quotes set superseded_by = v_new where id = v_old;
  end if;
  return v_new;
end;
$$;

create function private.void_fee_quote(p_submission_id uuid) returns void
language sql
set search_path = ''
as $$ update public.fee_quotes set status = 'void' where submission_id = p_submission_id and status = 'current' $$;

create function private.quote_json(p_quote public.fee_quotes) returns jsonb
language sql stable
set search_path = ''
as $$
  select case when p_quote.id is null then null else jsonb_build_object(
    'id', p_quote.id,
    'exchange_type', p_quote.exchange_type,
    'assessed_noncash_kobo', p_quote.assessed_noncash_kobo,
    'cash_kobo', p_quote.cash_kobo,
    'fee_basis_kobo', p_quote.fee_basis_kobo,
    'fee_bp', p_quote.fee_bp,
    'total_fee_kobo', p_quote.total_fee_kobo,
    'party_a_share_kobo', p_quote.party_a_share_kobo,
    'party_b_share_kobo', p_quote.party_b_share_kobo,
    'currency', p_quote.currency,
    'policy_version', p_quote.policy_version,
    'requires_reconfirmation', p_quote.requires_reconfirmation,
    'created_at', p_quote.created_at
  ) end
$$;

-- Views as JSON ---------------------------------------------------------

-- What the submitting member sees: never internal notes, internal
-- events, excluded comparisons or which staff member acted.
create function private.valuation_member_json(p_submission_id uuid) returns jsonb
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
        'id', p.id, 'assessment_id', p.assessment_id, 'reason', p.reason,
        'status', case when p.status = 'assigned' then 'open' else p.status end,
        'outcome', p.outcome, 'decision_rationale', p.decision_rationale, 'decided_at', p.decided_at, 'created_at', p.created_at
      ) order by p.created_at)
      from public.valuation_appeals p where p.submission_id = s.id), '[]'::jsonb),
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

create function private.display_name(p_member uuid) returns text
language sql stable
set search_path = ''
as $$ select coalesce((select p.display_name from public.profiles p where p.id = p_member), 'BATR member') $$;

-- What staff see: everything, with who did what.
create function private.valuation_review_json(p_submission_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select private.valuation_member_json(s.id) || jsonb_build_object(
    'submitter', jsonb_build_object('id', s.submitter_id, 'display_name', private.display_name(s.submitter_id)),
    'offer', (
      select jsonb_build_object('title', o.title, 'status', o.status, 'description', o.description,
        'offering_text', o.offering_text, 'wants_text', o.wants_text, 'category', o.category, 'condition', o.condition)
      from public.offers o where o.id = s.offer_id),
    'comparisons', coalesce((
      select jsonb_agg(to_jsonb(m) - 'submission_id' || jsonb_build_object('reviewer_name', private.display_name(m.reviewer_id)) order by m.created_at)
      from public.valuation_comparisons m where m.submission_id = s.id), '[]'::jsonb),
    'assessments', coalesce((
      select jsonb_agg(to_jsonb(a) - 'submission_id' || jsonb_build_object('reviewer_name', private.display_name(a.reviewer_id)) order by a.version)
      from public.valuation_assessments a where a.submission_id = s.id), '[]'::jsonb),
    'appeals', coalesce((
      select jsonb_agg(to_jsonb(p) - 'submission_id' || jsonb_build_object(
        'assigned_reviewer_name', case when p.assigned_reviewer_id is null then null else private.display_name(p.assigned_reviewer_id) end
      ) order by p.created_at)
      from public.valuation_appeals p where p.submission_id = s.id), '[]'::jsonb),
    'inspections', coalesce((
      select jsonb_agg(to_jsonb(i) - 'submission_id' || jsonb_build_object(
        'inspector_name', case when i.inspector_id is null then null else private.display_name(i.inspector_id) end
      ) order by i.created_at)
      from public.valuation_inspections i where i.submission_id = s.id), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'body', n.body, 'author_name', private.display_name(n.author_id), 'created_at', n.created_at) order by n.created_at)
      from public.valuation_notes n where n.submission_id = s.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'action', v.action, 'from_status', v.from_status, 'to_status', v.to_status, 'actor_role', v.actor_role,
        'actor_name', private.display_name(v.actor_id), 'detail', v.detail, 'internal', v.internal, 'created_at', v.created_at
      ) order by v.id)
      from public.valuation_events v where v.submission_id = s.id), '[]'::jsonb),
    'fee_quotes', coalesce((
      select jsonb_agg(private.quote_json(q) || jsonb_build_object('status', q.status) order by q.created_at)
      from public.fee_quotes q where q.submission_id = s.id), '[]'::jsonb),
    'inspection_threshold_kobo', (private.current_valuation_policy()).inspection_threshold_kobo
  )
  from public.valuation_submissions s
  where s.id = p_submission_id
$$;

-- Member functions ------------------------------------------------------

-- Starts a valuation of one of the member's own offers.
create function public.valuation_create(p_offer_id uuid, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_id uuid;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/offers/:id/valuation', p_offer_id, private.request_hash('{}'::jsonb));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_offer from public.offers o where o.id = p_offer_id for update;
  if not found or v_offer.owner_id <> v_actor then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_offer.status = 'closed' then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_offer.status));
  end if;
  if exists (select 1 from public.valuation_submissions s where s.offer_id = p_offer_id and s.status not in ('withdrawn', 'not_approved')) then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'valuation_open'));
  end if;
  insert into public.valuation_submissions (offer_id, submitter_id, policy_version)
  values (p_offer_id, v_actor, (private.current_valuation_policy()).version)
  returning id into v_id;
  perform private.valuation_event(v_id, v_actor, 'member', 'created', null, 'draft');
  v_response := private.valuation_member_json(v_id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_id);
  return v_response;
end;
$$;

-- Saves the whole editable draft: exchange type, cash and items. Items
-- not in the list are removed; their evidence stays, unlinked.
create function public.valuation_save(
  p_submission_id uuid, p_expected_revision integer, p_draft jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_components jsonb := coalesce(p_draft -> 'components', '[]'::jsonb);
  v_component jsonb;
  v_ids uuid[] := '{}';
  v_position integer := 0;
  v_details jsonb;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'PATCH /api/v1/valuations/:id', p_submission_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision, 'draft', p_draft)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_own_submission(p_submission_id, v_actor, p_expected_revision, array['draft', 'evidence_requested']);
  if p_draft is null or jsonb_typeof(p_draft) <> 'object' then
    perform private.validation_failed('{"draft": "required"}');
  end if;
  if not private.is_option('exchange_type', p_draft ->> 'exchange_type') then
    perform private.validation_failed('{"exchange_type": "invalid"}');
  end if;
  if not private.is_whole(coalesce(p_draft -> 'cash_component_kobo', '0'), 0, private.valuation_limit('kobo_max')) then
    perform private.validation_failed('{"cash_component_kobo": "invalid"}');
  end if;
  if jsonb_typeof(v_components) <> 'array' or jsonb_array_length(v_components) > private.valuation_limit('components_max') then
    perform private.validation_failed('{"components": "too_many"}');
  end if;
  -- An item id must be new or already belong to this submission.
  if exists (
    select 1 from jsonb_array_elements(v_components) c
    join public.valuation_components existing on existing.id::text = lower(c ->> 'id')
    where existing.submission_id <> v_sub.id
  ) then
    perform private.validation_failed('{"components": "invalid"}');
  end if;
  if (select count(distinct lower(c ->> 'id')) from jsonb_array_elements(v_components) c) <> jsonb_array_length(v_components) then
    perform private.validation_failed('{"components": "duplicate"}');
  end if;
  for v_component in select value from jsonb_array_elements(v_components) loop
    v_details := private.clean_component(v_component);
    v_position := v_position + 1;
    v_ids := v_ids || (v_component ->> 'id')::uuid;
    insert into public.valuation_components (
      id, submission_id, position, kind, category, subcategory, description, quantity, unit, proposed_value_kobo, details
    ) values (
      (v_component ->> 'id')::uuid, v_sub.id, v_position, v_component ->> 'kind',
      nullif(btrim(coalesce(v_component ->> 'category', '')), ''),
      btrim(coalesce(v_component ->> 'subcategory', '')), btrim(coalesce(v_component ->> 'description', '')),
      coalesce((v_component ->> 'quantity')::numeric::integer, 1), btrim(coalesce(v_component ->> 'unit', '')),
      (v_component ->> 'proposed_value_kobo')::numeric::bigint, v_details
    )
    on conflict (id) do update set
      position = excluded.position, kind = excluded.kind, category = excluded.category, subcategory = excluded.subcategory,
      description = excluded.description, quantity = excluded.quantity, unit = excluded.unit,
      proposed_value_kobo = excluded.proposed_value_kobo, details = excluded.details, updated_at = now();
  end loop;
  delete from public.valuation_components c where c.submission_id = v_sub.id and not (c.id = any (v_ids));
  update public.valuation_submissions
  set exchange_type = p_draft ->> 'exchange_type',
      cash_component_kobo = coalesce((p_draft ->> 'cash_component_kobo')::numeric::bigint, 0),
      revision = revision + 1, updated_at = now()
  where id = v_sub.id;
  perform private.valuation_event(v_sub.id, v_actor, 'member', 'edited', v_sub.status, v_sub.status, '{}'::jsonb, v_sub.status = 'draft');
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Records evidence whose file the API has already uploaded with the
-- member's session to {member}/{submission}/{evidence}.{webp|pdf}.
create function public.valuation_evidence_add(
  p_submission_id uuid, p_evidence_id uuid, p_kind text, p_component_id uuid, p_mime text, p_size_bytes integer,
  p_request_hash text, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_path text;
  v_request uuid;
  v_appeal uuid;
  v_response jsonb;
begin
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    perform private.validation_failed('{"request_hash": "invalid"}');
  end if;
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/valuations/:id/evidence', p_submission_id, p_request_hash);
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_own_submission(p_submission_id, v_actor, null, array['draft', 'evidence_requested', 'appealed']);
  if not private.is_option('evidence_kind', p_kind) then
    perform private.validation_failed('{"kind": "invalid"}');
  end if;
  if p_mime not in ('image/webp', 'application/pdf') or (p_kind = 'photo' and p_mime <> 'image/webp') then
    perform private.fail('UNSUPPORTED_FORMAT', 422);
  end if;
  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > private.valuation_limit('evidence_bytes_max') then
    perform private.validation_failed('{"file": "too_large"}');
  end if;
  if p_component_id is not null
    and not exists (select 1 from public.valuation_components c where c.id = p_component_id and c.submission_id = v_sub.id) then
    perform private.validation_failed('{"component_id": "invalid"}');
  end if;
  if (select count(*) from public.valuation_evidence e where e.submission_id = v_sub.id) >= private.valuation_limit('evidence_max') then
    perform private.validation_failed('{"file": "too_many"}');
  end if;
  v_path := v_actor || '/' || v_sub.id || '/' || p_evidence_id || case when p_mime = 'application/pdf' then '.pdf' else '.webp' end;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'valuation-evidence' and o.name = v_path) then
    perform private.validation_failed('{"file": "file_missing"}');
  end if;
  -- Evidence sent in answer to an open request, or with an open appeal, is linked to it.
  select r.id into v_request from public.valuation_requests r
  where r.submission_id = v_sub.id and r.responded_at is null order by r.created_at desc limit 1;
  select p.id into v_appeal from public.valuation_appeals p
  where p.submission_id = v_sub.id and p.status in ('open', 'assigned') limit 1;
  insert into public.valuation_evidence (id, submission_id, component_id, uploader_id, kind, storage_path, mime, size_bytes, sensitive, request_id, appeal_id)
  values (p_evidence_id, v_sub.id, p_component_id, v_actor, p_kind, v_path, p_mime, p_size_bytes,
    private.is_option('sensitive_evidence_kind', p_kind), v_request, v_appeal);
  perform private.valuation_event(v_sub.id, v_actor, 'member', 'evidence_added', v_sub.status, v_sub.status,
    jsonb_build_object('evidence_id', p_evidence_id, 'kind', p_kind), v_sub.status = 'draft');
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Removes evidence, only from a draft that was never sent: once BATR
-- has seen evidence it is kept with the submission's history. Returns
-- the file path for the API to delete.
create function public.valuation_evidence_remove(
  p_submission_id uuid, p_evidence_id uuid, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_path text;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'DELETE /api/v1/valuations/:id/evidence/:evidenceId', p_evidence_id,
    private.request_hash(jsonb_build_object('submission_id', p_submission_id)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_own_submission(p_submission_id, v_actor, null, array['draft']);
  if v_sub.submitted_at is not null then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'evidence_kept'));
  end if;
  delete from public.valuation_evidence e where e.id = p_evidence_id and e.submission_id = v_sub.id returning e.storage_path into v_path;
  if v_path is null then
    perform private.fail('NOT_FOUND', 404);
  end if;
  v_response := private.valuation_member_json(v_sub.id) || jsonb_build_object('cleanup_paths', jsonb_build_array(v_path));
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Sends the submission for review (or back for review after BATR asked
-- for more). Needs the accuracy declaration and every submit rule. A
-- cash-only exchange has nothing to assess: its fee quote is issued on
-- the agreed cash straight away.
create function public.valuation_submit(
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
  if v_problems <> '{}'::jsonb then
    perform private.validation_failed(v_problems);
  end if;
  v_to := case when v_sub.exchange_type = 'cash_only' then 'assessed' else 'submitted' end;
  update public.valuation_requests set responded_at = now(), response_note = v_note
  where submission_id = v_sub.id and responded_at is null;
  update public.valuation_submissions
  set status = v_to, revision = revision + 1, declaration_accepted_at = now(),
      submitted_at = coalesce(submitted_at, now()), updated_at = now()
  where id = v_sub.id;
  perform private.valuation_event(v_sub.id, v_actor, 'member', case when v_sub.status = 'draft' then 'submitted' else 'resubmitted' end,
    v_sub.status, v_to, case when v_note = '' then '{}'::jsonb else jsonb_build_object('note', v_note) end);
  if v_to = 'assessed' then
    perform private.issue_fee_quote(v_sub.id, null);
  end if;
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

create function public.valuation_withdraw(
  p_submission_id uuid, p_expected_revision integer, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/valuations/:id/withdraw', p_submission_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_own_submission(p_submission_id, v_actor, p_expected_revision,
    array['draft', 'submitted', 'evidence_requested', 'inspection_required', 'assessed', 'appealed']);
  update public.valuation_appeals set status = 'withdrawn' where submission_id = v_sub.id and status in ('open', 'assigned');
  update public.valuation_inspections set status = 'cancelled', cancelled_reason = 'Valuation withdrawn by the member.', updated_at = now()
  where submission_id = v_sub.id and status in ('requested', 'scheduled');
  perform private.void_fee_quote(v_sub.id);
  perform private.set_submission_status(v_sub.id, 'withdrawn');
  perform private.valuation_event(v_sub.id, v_actor, 'member', 'withdrawn', v_sub.status, 'withdrawn');
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Appeals the latest assessment (approved or not approved). One appeal
-- per valuation.
create function public.valuation_appeal(
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
  -- One appeal per valuation: its decision is final. New evidence after
  -- that means withdrawing and asking for a new valuation.
  if exists (select 1 from public.valuation_appeals p where p.submission_id = v_sub.id and p.status <> 'withdrawn') then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'already_appealed'));
  end if;
  -- A refused valuation reopens while the appeal runs; only one may be open per offer.
  if v_sub.status = 'not_approved' and exists (
    select 1 from public.valuation_submissions s
    where s.offer_id = v_sub.offer_id and s.id <> v_sub.id and s.status not in ('withdrawn', 'not_approved')
  ) then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'valuation_open'));
  end if;
  insert into public.valuation_appeals (submission_id, assessment_id, appellant_id, reason, excluded_reviewer_id)
  values (v_sub.id, v_assessment.id, v_actor, v_reason, v_assessment.reviewer_id);
  perform private.set_submission_status(v_sub.id, 'appealed');
  perform private.valuation_event(v_sub.id, v_actor, 'member', 'appealed', v_sub.status, 'appealed');
  v_response := private.valuation_member_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

create function public.valuation_get(p_submission_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if not exists (select 1 from public.valuation_submissions s where s.id = p_submission_id and s.submitter_id = v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return private.valuation_member_json(p_submission_id);
end;
$$;

-- The member's latest valuation of their own offer, or null.
create function public.valuation_for_offer(p_offer_id uuid) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_id uuid;
begin
  if not exists (select 1 from public.offers o where o.id = p_offer_id and o.owner_id = v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  select s.id into v_id from public.valuation_submissions s
  where s.offer_id = p_offer_id and s.submitter_id = v_actor
  order by (s.status not in ('withdrawn', 'not_approved')) desc, s.created_at desc
  limit 1;
  return case when v_id is null then null else private.valuation_member_json(v_id) end;
end;
$$;

-- The public summary on an offer page: BATR's latest approved value,
-- its confidence and date. Only for offers the caller can see.
create function public.offer_valuation_summary(p_offer_id uuid) returns jsonb
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
  where o.id = p_offer_id and (o.status = 'active' or o.owner_id = auth.uid())
$$;

-- Evidence storage --------------------------------------------------------

-- WebP photos (metadata removed by the server) and checked PDFs, 10 MB each.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('valuation-evidence', 'valuation-evidence', false, 10485760, array['image/webp', 'application/pdf']);

-- May the signed-in member upload this file? Their own folder, for
-- their own submission while they can still add evidence.
create function public.valuation_evidence_uploadable(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(webp|pdf)$'
    and split_part(p_name, '/', 1) = auth.uid()::text
    and exists (
      select 1 from public.valuation_submissions s
      where s.id::text = split_part(p_name, '/', 2)
        and s.submitter_id = auth.uid()
        and s.status in ('draft', 'evidence_requested', 'appealed')
    )
$$;

-- May the signed-in member read (and so sign a link to) this file? The
-- member who uploaded it and BATR staff, never the other party or the
-- public, and staff only once the member has sent it for review. Only
-- while an evidence row points to it.
create function public.valuation_evidence_readable(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.valuation_evidence e
    join public.valuation_submissions s on s.id = e.submission_id
    where e.storage_path = p_name
      and (
        e.uploader_id = auth.uid()
        or (s.submitter_id <> auth.uid() and s.status <> 'draft' and (
          private.has_role(auth.uid(), 'valuation_reviewer') or private.has_role(auth.uid(), 'valuation_inspector')))
      )
  )
$$;

create policy "valuation evidence: members add files to their own submissions" on storage.objects
for insert to authenticated
with check (bucket_id = 'valuation-evidence' and public.valuation_evidence_uploadable(name));

create policy "valuation evidence: readable by the uploader and BATR staff" on storage.objects
for select to authenticated
using (bucket_id = 'valuation-evidence' and public.valuation_evidence_readable(name));

-- Staff functions ---------------------------------------------------------

-- Submissions waiting for staff, oldest first. Staff never see their own.
create function public.review_queue(p_status text default null) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer', 'valuation_inspector']);
begin
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'status', s.status, 'exchange_type', s.exchange_type, 'submitted_at', s.submitted_at,
      'updated_at', s.updated_at, 'offer_title', o.title, 'submitter_name', private.display_name(s.submitter_id),
      'components', (select count(*) from public.valuation_components c where c.submission_id = s.id),
      'proposed_total_kobo', (select coalesce(sum(c.proposed_value_kobo), 0) from public.valuation_components c where c.submission_id = s.id),
      'open_appeal', exists (select 1 from public.valuation_appeals p where p.submission_id = s.id and p.status in ('open', 'assigned')),
      'appeal_assigned_to_me', exists (select 1 from public.valuation_appeals p where p.submission_id = s.id and p.status = 'assigned' and p.assigned_reviewer_id = v_actor),
      'open_inspection', exists (select 1 from public.valuation_inspections i where i.submission_id = s.id and i.status in ('requested', 'scheduled'))
    ) order by s.submitted_at, s.id)
    from public.valuation_submissions s
    join public.offers o on o.id = s.offer_id
    where s.submitter_id <> v_actor
      and s.status <> 'draft'
      and (p_status is null and s.status in ('submitted', 'inspection_required', 'appealed', 'evidence_requested')
        or s.status = p_status)
  ), '[]'::jsonb);
end;
$$;

create function public.review_get(p_submission_id uuid) returns jsonb
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
      -- Reviewers whose assessment was appealed make no later decision on it.
      'excluded', exists (select 1 from public.valuation_appeals p where p.submission_id = v_sub.id and p.excluded_reviewer_id = v_actor)
    ));
end;
$$;

-- Records a market comparison (asking or sold price, adjustments).
create function public.review_comparison_add(
  p_submission_id uuid, p_comparison jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer']);
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_c jsonb := p_comparison;
  v_adjustment jsonb;
  v_problems jsonb := '{}'::jsonb;
  v_component uuid;
  v_id uuid;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/review/valuations/:id/comparisons', p_submission_id,
    private.request_hash(coalesce(p_comparison, 'null'::jsonb)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_review_submission(p_submission_id, v_actor, null,
    array['submitted', 'evidence_requested', 'inspection_required', 'appealed']);
  if v_c is null or jsonb_typeof(v_c) <> 'object' then
    perform private.validation_failed('{"comparison": "required"}');
  end if;
  if not private.text_ok(v_c -> 'source', 200) or length(btrim(v_c ->> 'source')) < 2 then
    v_problems := v_problems || '{"source": "required"}';
  end if;
  if not (private.text_ok(coalesce(v_c -> 'url', '""'), 2000) and coalesce(v_c ->> 'url', '') ~ '^($|https?://)') then
    v_problems := v_problems || '{"url": "invalid"}';
  end if;
  if private.safe_date(v_c ->> 'observed_on') is null or private.safe_date(v_c ->> 'observed_on') > current_date then
    v_problems := v_problems || '{"observed_on": "invalid"}';
  end if;
  if not private.is_option('comparison_price_kind', v_c ->> 'price_kind') then
    v_problems := v_problems || '{"price_kind": "invalid"}';
  end if;
  if not private.is_whole(v_c -> 'price_kobo', 1, private.valuation_limit('kobo_max')) then
    v_problems := v_problems || '{"price_kobo": "invalid"}';
  end if;
  if not private.text_ok(coalesce(v_c -> 'condition', '""'), 200) then
    v_problems := v_problems || '{"condition": "too_long"}';
  end if;
  if not private.text_ok(coalesce(v_c -> 'characteristics', '""'), private.valuation_limit('long_text_max')) then
    v_problems := v_problems || '{"characteristics": "too_long"}';
  end if;
  if jsonb_typeof(coalesce(v_c -> 'adjustments', '[]')) <> 'array' or jsonb_array_length(coalesce(v_c -> 'adjustments', '[]')) > 10 then
    v_problems := v_problems || '{"adjustments": "invalid"}';
  else
    for v_adjustment in select value from jsonb_array_elements(coalesce(v_c -> 'adjustments', '[]')) loop
      if not private.is_option('adjustment_factor', v_adjustment ->> 'factor')
        or not private.is_whole(v_adjustment -> 'percent_bp', -9000, 9000)
        or not private.text_ok(coalesce(v_adjustment -> 'note', '""'), 200) then
        v_problems := v_problems || '{"adjustments": "invalid"}';
      end if;
    end loop;
  end if;
  if private.detail_filled(v_c -> 'component_id') then
    select c.id into v_component from public.valuation_components c
    where c.id::text = lower(v_c ->> 'component_id') and c.submission_id = v_sub.id;
    if v_component is null then
      v_problems := v_problems || '{"component_id": "invalid"}';
    end if;
  end if;
  if v_problems <> '{}'::jsonb then
    perform private.validation_failed(v_problems);
  end if;
  insert into public.valuation_comparisons (
    submission_id, component_id, reviewer_id, source, url, observed_on, price_kind, price_kobo, condition, characteristics,
    adjustments, adjusted_kobo
  ) values (
    v_sub.id, v_component, v_actor, btrim(v_c ->> 'source'), btrim(coalesce(v_c ->> 'url', '')), private.safe_date(v_c ->> 'observed_on'),
    v_c ->> 'price_kind', (v_c ->> 'price_kobo')::numeric::bigint, btrim(coalesce(v_c ->> 'condition', '')),
    btrim(coalesce(v_c ->> 'characteristics', '')),
    (select coalesce(jsonb_agg(jsonb_build_object('factor', a.value ->> 'factor', 'percent_bp', (a.value ->> 'percent_bp')::numeric::integer,
      'note', btrim(coalesce(a.value ->> 'note', ''))) order by a.ordinality), '[]'::jsonb)
     from jsonb_array_elements(coalesce(v_c -> 'adjustments', '[]')) with ordinality as a (value, ordinality)),
    private.comparison_adjusted_kobo((v_c ->> 'price_kobo')::numeric::bigint, coalesce(v_c -> 'adjustments', '[]'))
  ) returning id into v_id;
  perform private.valuation_event(v_sub.id, v_actor, 'reviewer', 'comparison_added', v_sub.status, v_sub.status,
    jsonb_build_object('comparison_id', v_id), true);
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Excludes a comparison (with a reason) or includes it again.
create function public.review_comparison_exclude(
  p_submission_id uuid, p_comparison_id uuid, p_excluded boolean, p_reason text default '', p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer']);
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_reason text := btrim(coalesce(p_reason, ''));
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'PATCH /api/v1/review/valuations/:id/comparisons/:cid', p_comparison_id,
    private.request_hash(jsonb_build_object('excluded', p_excluded, 'reason', p_reason)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_review_submission(p_submission_id, v_actor, null,
    array['submitted', 'evidence_requested', 'inspection_required', 'appealed']);
  if p_excluded is null or (p_excluded and (length(v_reason) < 5 or length(v_reason) > 500)) then
    perform private.validation_failed('{"exclusion_reason": "required"}');
  end if;
  update public.valuation_comparisons
  set excluded = p_excluded, exclusion_reason = case when p_excluded then v_reason else null end, updated_at = now()
  where id = p_comparison_id and submission_id = v_sub.id;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  perform private.valuation_event(v_sub.id, v_actor, 'reviewer', case when p_excluded then 'comparison_excluded' else 'comparison_included' end,
    v_sub.status, v_sub.status, jsonb_build_object('comparison_id', p_comparison_id, 'reason', nullif(v_reason, '')), true);
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

create function public.review_note_add(p_submission_id uuid, p_body text, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer', 'valuation_inspector']);
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_body text := btrim(coalesce(p_body, ''));
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/review/valuations/:id/notes', p_submission_id,
    private.request_hash(jsonb_build_object('body', p_body)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_review_submission(p_submission_id, v_actor, null, null);
  if length(v_body) < 1 or length(v_body) > private.valuation_limit('long_text_max') then
    perform private.validation_failed('{"body": "required"}');
  end if;
  insert into public.valuation_notes (submission_id, author_id, body) values (v_sub.id, v_actor, v_body);
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Checks a decision's text fields and returns the trimmed message.
create function private.check_decision_text(p_decision jsonb) returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_problems jsonb := '{}'::jsonb;
begin
  if p_decision is null or jsonb_typeof(p_decision) <> 'object' then
    perform private.validation_failed('{"decision": "required"}');
  end if;
  if not private.text_ok(p_decision -> 'rationale', private.valuation_limit('long_text_max')) or length(btrim(p_decision ->> 'rationale')) < 20 then
    v_problems := v_problems || '{"rationale": "required"}';
  end if;
  if not private.is_option('confidence', p_decision ->> 'confidence') then
    v_problems := v_problems || '{"confidence": "required"}';
  end if;
  if not private.text_ok(coalesce(p_decision -> 'limitations', '""'), private.valuation_limit('long_text_max')) then
    v_problems := v_problems || '{"limitations": "too_long"}';
  end if;
  if not private.text_ok(coalesce(p_decision -> 'message', '""'), private.valuation_limit('long_text_max')) then
    v_problems := v_problems || '{"message": "too_long"}';
  end if;
  if v_problems <> '{}'::jsonb then
    perform private.validation_failed(v_problems);
  end if;
end;
$$;

-- Applies one decision outcome to a locked submission. Used by first
-- decisions and appeal decisions alike. Returns the new status.
create function private.apply_decision(
  p_sub public.valuation_submissions, p_actor uuid, p_outcome text, p_decision jsonb, p_appeal_id uuid
) returns text
language plpgsql
set search_path = ''
as $$
declare
  v_components jsonb := coalesce(p_decision -> 'components', '[]'::jsonb);
  v_message text := btrim(coalesce(p_decision ->> 'message', ''));
  v_total bigint;
  v_version integer;
  v_inspection uuid;
  v_threshold bigint := (private.current_valuation_policy()).inspection_threshold_kobo;
  v_assessment uuid;
  v_to text;
begin
  if p_outcome in ('evidence_required') then
    if length(v_message) < 10 then
      perform private.validation_failed('{"message": "required"}');
    end if;
    insert into public.valuation_requests (submission_id, message, requested_by, appeal_id) values (p_sub.id, v_message, p_actor, p_appeal_id);
    v_to := 'evidence_requested';
  elsif p_outcome = 'inspection_required' then
    if length(v_message) < 10 then
      perform private.validation_failed('{"message": "required"}');
    end if;
    insert into public.valuation_inspections (submission_id, reason, requested_by, appeal_id) values (p_sub.id, v_message, p_actor, p_appeal_id);
    v_to := 'inspection_required';
  elsif p_outcome in ('approved', 'revised') then
    -- One value for every item, each a whole number of kobo.
    if jsonb_typeof(v_components) <> 'array'
      or (select count(*) from public.valuation_components c where c.submission_id = p_sub.id) <> jsonb_array_length(v_components)
      or exists (
        select 1 from jsonb_array_elements(v_components) x
        where not private.is_whole(x -> 'value_kobo', 0, private.valuation_limit('kobo_max'))
          or not exists (select 1 from public.valuation_components c where c.submission_id = p_sub.id and c.id::text = lower(x ->> 'component_id'))
      )
      or (select count(distinct lower(x ->> 'component_id')) from jsonb_array_elements(v_components) x) <> jsonb_array_length(v_components)
    then
      perform private.validation_failed('{"components": "invalid"}');
    end if;
    select coalesce(sum((x ->> 'value_kobo')::numeric::bigint), 0) into v_total from jsonb_array_elements(v_components) x;
    if v_total <= 0 or v_total > private.valuation_limit('kobo_max') then
      perform private.validation_failed('{"components": "invalid"}');
    end if;
    select i.id into v_inspection from public.valuation_inspections i
    where i.submission_id = p_sub.id and i.status = 'completed' order by i.completed_at desc limit 1;
    -- An inspection that was asked for must be completed before a value is approved.
    if p_sub.status = 'inspection_required' and v_inspection is null then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'inspection_pending'));
    end if;
    if v_threshold is not null and v_total >= v_threshold and v_inspection is null then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'inspection_required_by_policy'));
    end if;
    select coalesce(max(a.version), 0) + 1 into v_version from public.valuation_assessments a where a.submission_id = p_sub.id;
    insert into public.valuation_assessments (
      submission_id, version, reviewer_id, appeal_id, outcome, components, total_noncash_kobo, rationale, confidence, limitations,
      message, inspection_id, policy_version
    ) values (
      p_sub.id, v_version, p_actor, p_appeal_id, 'approved',
      (select jsonb_agg(jsonb_build_object('component_id', lower(x ->> 'component_id'), 'value_kobo', (x ->> 'value_kobo')::numeric::bigint)) from jsonb_array_elements(v_components) x),
      v_total, btrim(p_decision ->> 'rationale'), p_decision ->> 'confidence', btrim(coalesce(p_decision ->> 'limitations', '')),
      v_message, v_inspection, p_sub.policy_version
    ) returning id into v_assessment;
    perform private.issue_fee_quote(p_sub.id, v_assessment);
    v_to := 'assessed';
  elsif p_outcome = 'not_approved' then
    select coalesce(max(a.version), 0) + 1 into v_version from public.valuation_assessments a where a.submission_id = p_sub.id;
    insert into public.valuation_assessments (
      submission_id, version, reviewer_id, appeal_id, outcome, total_noncash_kobo, rationale, confidence, limitations, message, policy_version
    ) values (
      p_sub.id, v_version, p_actor, p_appeal_id, 'not_approved', 0, btrim(p_decision ->> 'rationale'), p_decision ->> 'confidence',
      btrim(coalesce(p_decision ->> 'limitations', '')), v_message, p_sub.policy_version
    );
    perform private.void_fee_quote(p_sub.id);
    v_to := 'not_approved';
  else
    perform private.validation_failed('{"outcome": "invalid"}');
  end if;
  return v_to;
end;
$$;

-- A reviewer's decision on a submission waiting for review: approve a
-- value, ask for evidence, require an inspection, or refuse.
create function public.review_decide(
  p_submission_id uuid, p_expected_revision integer, p_decision jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer']);
  v_stored jsonb;
  v_sub public.valuation_submissions;
  v_outcome text := p_decision ->> 'outcome';
  v_to text;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/review/valuations/:id/decision', p_submission_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision, 'decision', p_decision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_sub := private.lock_review_submission(p_submission_id, v_actor, p_expected_revision, array['submitted', 'inspection_required']);
  if exists (select 1 from public.valuation_appeals p where p.submission_id = v_sub.id and p.excluded_reviewer_id = v_actor) then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'appealed_reviewer'));
  end if;
  if not private.is_option('assessment_outcome', v_outcome) then
    perform private.validation_failed('{"outcome": "invalid"}');
  end if;
  perform private.check_decision_text(p_decision);
  v_to := private.apply_decision(v_sub, v_actor, v_outcome, p_decision, null);
  perform private.set_submission_status(v_sub.id, v_to);
  perform private.valuation_event(v_sub.id, v_actor, 'reviewer', 'decided', v_sub.status, v_to,
    jsonb_build_object('outcome', v_outcome, 'rationale', btrim(p_decision ->> 'rationale'), 'confidence', p_decision ->> 'confidence'), false);
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Schedules, completes or cancels a requested inspection.
create function public.review_inspection_update(
  p_inspection_id uuid, p_action text, p_data jsonb default '{}'::jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer', 'valuation_inspector']);
  v_stored jsonb;
  v_inspection public.valuation_inspections;
  v_sub public.valuation_submissions;
  v_data jsonb := coalesce(p_data, '{}'::jsonb);
  v_role text := case when private.has_role(v_actor, 'valuation_inspector') then 'inspector' else 'reviewer' end;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'PATCH /api/v1/review/inspections/:id', p_inspection_id,
    private.request_hash(jsonb_build_object('action', p_action, 'data', p_data)));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_inspection from public.valuation_inspections i where i.id = p_inspection_id;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  v_sub := private.lock_review_submission(v_inspection.submission_id, v_actor, null, null);
  select * into v_inspection from public.valuation_inspections i where i.id = p_inspection_id for update;
  if p_action = 'schedule' then
    if v_inspection.status not in ('requested', 'scheduled') then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_inspection.status));
    end if;
    if private.safe_timestamp(v_data ->> 'scheduled_for') is null or not private.text_ok(coalesce(v_data -> 'arrangements', '""'), 500) then
      perform private.validation_failed('{"scheduled_for": "required"}');
    end if;
    update public.valuation_inspections
    set status = 'scheduled', scheduled_for = (v_data ->> 'scheduled_for')::timestamptz, inspector_id = v_actor,
        arrangements = btrim(coalesce(v_data ->> 'arrangements', '')), updated_at = now()
    where id = v_inspection.id;
  elsif p_action = 'complete' then
    if v_inspection.status not in ('requested', 'scheduled') then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_inspection.status));
    end if;
    if not private.text_ok(v_data -> 'findings', private.valuation_limit('long_text_max')) or length(btrim(v_data ->> 'findings')) < 20 then
      perform private.validation_failed('{"findings": "required"}');
    end if;
    if private.detail_filled(v_data -> 'condition_confirmed') and not private.is_option('condition', v_data ->> 'condition_confirmed') then
      perform private.validation_failed('{"condition_confirmed": "invalid"}');
    end if;
    update public.valuation_inspections
    set status = 'completed', inspector_id = v_actor, findings = btrim(v_data ->> 'findings'),
        condition_confirmed = nullif(v_data ->> 'condition_confirmed', ''), completed_at = now(), updated_at = now()
    where id = v_inspection.id;
  elsif p_action = 'cancel' then
    if v_inspection.status not in ('requested', 'scheduled') then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_inspection.status));
    end if;
    if not private.text_ok(v_data -> 'reason', 500) or length(btrim(v_data ->> 'reason')) < 5 then
      perform private.validation_failed('{"reason": "required"}');
    end if;
    update public.valuation_inspections
    set status = 'cancelled', cancelled_reason = btrim(v_data ->> 'reason'), updated_at = now()
    where id = v_inspection.id;
  else
    perform private.validation_failed('{"action": "invalid"}');
  end if;
  update public.valuation_submissions set revision = revision + 1, updated_at = now() where id = v_sub.id;
  perform private.valuation_event(v_sub.id, v_actor, v_role, 'inspection_' || p_action, v_sub.status, v_sub.status,
    jsonb_build_object('inspection_id', v_inspection.id));
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- A reviewer takes an open appeal. Never the reviewer whose assessment
-- is appealed, and never on their own submission.
create function public.review_appeal_claim(p_appeal_id uuid, p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer']);
  v_stored jsonb;
  v_appeal public.valuation_appeals;
  v_sub public.valuation_submissions;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/review/appeals/:id/claim', p_appeal_id, private.request_hash('{}'::jsonb));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_appeal from public.valuation_appeals p where p.id = p_appeal_id;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  v_sub := private.lock_review_submission(v_appeal.submission_id, v_actor, null, array['appealed']);
  select * into v_appeal from public.valuation_appeals p where p.id = p_appeal_id for update;
  if v_appeal.excluded_reviewer_id = v_actor then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'appealed_reviewer'));
  end if;
  if v_appeal.status <> 'open' then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_appeal.status));
  end if;
  update public.valuation_appeals set status = 'assigned', assigned_reviewer_id = v_actor where id = v_appeal.id;
  update public.valuation_submissions set revision = revision + 1, updated_at = now() where id = v_sub.id;
  perform private.valuation_event(v_sub.id, v_actor, 'reviewer', 'appeal_assigned', v_sub.status, v_sub.status,
    jsonb_build_object('appeal_id', v_appeal.id), true);
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- The assigned reviewer decides an appeal: upheld, revised, more
-- evidence, an inspection, or not approved.
create function public.review_appeal_decide(
  p_appeal_id uuid, p_expected_revision integer, p_decision jsonb, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_staff(array['valuation_reviewer']);
  v_stored jsonb;
  v_appeal public.valuation_appeals;
  v_sub public.valuation_submissions;
  v_appealed public.valuation_assessments;
  v_outcome text := p_decision ->> 'outcome';
  v_to text;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(v_actor, p_idempotency_key, 'POST /api/v1/review/appeals/:id/decision', p_appeal_id,
    private.request_hash(jsonb_build_object('expected_revision', p_expected_revision, 'decision', p_decision)));
  if v_stored is not null then
    return v_stored;
  end if;
  select * into v_appeal from public.valuation_appeals p where p.id = p_appeal_id;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  v_sub := private.lock_review_submission(v_appeal.submission_id, v_actor, p_expected_revision, array['appealed']);
  select * into v_appeal from public.valuation_appeals p where p.id = p_appeal_id for update;
  if v_appeal.status <> 'assigned' or v_appeal.assigned_reviewer_id is distinct from v_actor then
    perform private.fail('FORBIDDEN', 403, jsonb_build_object('reason', 'not_assigned'));
  end if;
  if not private.is_option('appeal_outcome', v_outcome) then
    perform private.validation_failed('{"outcome": "invalid"}');
  end if;
  perform private.check_decision_text(p_decision);
  if v_outcome = 'upheld' then
    select * into v_appealed from public.valuation_assessments a where a.id = v_appeal.assessment_id;
    v_to := case when v_appealed.outcome = 'approved' then 'assessed' else 'not_approved' end;
  else
    v_to := private.apply_decision(v_sub, v_actor, v_outcome, p_decision, v_appeal.id);
  end if;
  update public.valuation_appeals
  set status = 'decided', outcome = v_outcome, decision_rationale = btrim(p_decision ->> 'rationale'), decided_at = now()
  where id = v_appeal.id;
  perform private.set_submission_status(v_sub.id, v_to);
  perform private.valuation_event(v_sub.id, v_actor, 'reviewer', 'appeal_decided', v_sub.status, v_to,
    jsonb_build_object('appeal_id', v_appeal.id, 'outcome', v_outcome, 'rationale', btrim(p_decision ->> 'rationale')));
  v_response := private.valuation_review_json(v_sub.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_sub.id);
  return v_response;
end;
$$;

-- Fee ledger hooks (server only) -------------------------------------------

-- Creates the two parties' fee liabilities from a current quote once an
-- agreement exists. Agreements are not built yet, so nothing calls this
-- outside tests; it is here so the ledger's rules are fixed now.
create function private.create_fee_liabilities(
  p_quote_id uuid, p_agreement_id uuid, p_party_a uuid, p_party_b uuid
) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_quote public.fee_quotes;
begin
  select * into v_quote from public.fee_quotes q where q.id = p_quote_id for update;
  if not found or v_quote.status <> 'current' then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'quote_not_current'));
  end if;
  if p_party_a is null or p_party_b is null or p_party_a = p_party_b then
    perform private.validation_failed('{"parties": "invalid"}');
  end if;
  insert into public.fee_liabilities (fee_quote_id, agreement_id, party_role, member_id, amount_kobo, currency)
  values
    (v_quote.id, p_agreement_id, 'party_a', p_party_a, v_quote.party_a_share_kobo, v_quote.currency),
    (v_quote.id, p_agreement_id, 'party_b', p_party_b, v_quote.party_b_share_kobo, v_quote.currency)
  on conflict (agreement_id, fee_quote_id, party_role) do nothing;
end;
$$;

-- Stores a provider notification once (duplicates are reported, not
-- stored again). Called by the server's webhook route with the service
-- role after it has checked the provider's signature.
create function public.payment_provider_event_record(
  p_provider text, p_event_id text, p_event_type text, p_payload jsonb, p_signature_valid boolean
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id bigint;
begin
  if p_provider is distinct from 'flutterwave' or coalesce(p_event_id, '') = '' or length(p_event_id) > 200 then
    perform private.validation_failed('{"event": "invalid"}');
  end if;
  insert into private.payment_provider_events (provider, event_id, event_type, payload, signature_valid)
  values (p_provider, p_event_id, left(coalesce(p_event_type, ''), 100), coalesce(p_payload, '{}'::jsonb), coalesce(p_signature_valid, false))
  on conflict (provider, event_id) do nothing
  returning id into v_id;
  return jsonb_build_object('duplicate', v_id is null);
end;
$$;

-- Grants --------------------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function
  public.valuation_create(uuid, uuid),
  public.valuation_save(uuid, integer, jsonb, uuid),
  public.valuation_evidence_add(uuid, uuid, text, uuid, text, integer, text, uuid),
  public.valuation_evidence_remove(uuid, uuid, uuid),
  public.valuation_submit(uuid, integer, boolean, text, uuid),
  public.valuation_withdraw(uuid, integer, uuid),
  public.valuation_appeal(uuid, integer, text, uuid),
  public.valuation_get(uuid),
  public.valuation_for_offer(uuid),
  public.offer_valuation_summary(uuid),
  public.valuation_evidence_uploadable(text),
  public.valuation_evidence_readable(text),
  public.review_queue(text),
  public.review_get(uuid),
  public.review_comparison_add(uuid, jsonb, uuid),
  public.review_comparison_exclude(uuid, uuid, boolean, text, uuid),
  public.review_note_add(uuid, text, uuid),
  public.review_decide(uuid, integer, jsonb, uuid),
  public.review_inspection_update(uuid, text, jsonb, uuid),
  public.review_appeal_claim(uuid, uuid),
  public.review_appeal_decide(uuid, integer, jsonb, uuid),
  public.payment_provider_event_record(text, text, text, jsonb, boolean)
from public, anon;
grant execute on function
  public.valuation_create(uuid, uuid),
  public.valuation_save(uuid, integer, jsonb, uuid),
  public.valuation_evidence_add(uuid, uuid, text, uuid, text, integer, text, uuid),
  public.valuation_evidence_remove(uuid, uuid, uuid),
  public.valuation_submit(uuid, integer, boolean, text, uuid),
  public.valuation_withdraw(uuid, integer, uuid),
  public.valuation_appeal(uuid, integer, text, uuid),
  public.valuation_get(uuid),
  public.valuation_for_offer(uuid),
  public.valuation_evidence_uploadable(text),
  public.valuation_evidence_readable(text),
  public.review_queue(text),
  public.review_get(uuid),
  public.review_comparison_add(uuid, jsonb, uuid),
  public.review_comparison_exclude(uuid, uuid, boolean, text, uuid),
  public.review_note_add(uuid, text, uuid),
  public.review_decide(uuid, integer, jsonb, uuid),
  public.review_inspection_update(uuid, text, jsonb, uuid),
  public.review_appeal_claim(uuid, uuid),
  public.review_appeal_decide(uuid, integer, jsonb, uuid)
to authenticated;
grant execute on function public.offer_valuation_summary(uuid) to anon, authenticated;
revoke execute on function public.payment_provider_event_record(text, text, text, jsonb, boolean) from authenticated;
grant execute on function public.payment_provider_event_record(text, text, text, jsonb, boolean) to service_role;
