-- Location visibility, phase 1 (owner, 2026-10-17): a general area and
-- the exchange logistics on each offer. Only general values are stored:
-- an area from a fixed list (Ibadan only for now), whether the exchange
-- is in person, remote or either, and how it happens. No address,
-- coordinates or free-text location is collected, so nothing private
-- can be returned to anyone. Precise meeting details belong to a later
-- phase with agreements (specs/state-model.md §6). All three fields are
-- optional: older offers have none, and nothing is invented for them.
-- The reference table below mirrors packages/shared (OFFER_AREAS);
-- supabase/tests/parity.db.test.ts keeps them identical.

create table private.offer_areas (id text primary key);
insert into private.offer_areas (id) values
  ('ibadan'),
  ('ibadan_agbowo'), ('ibadan_agodi'), ('ibadan_akobo'), ('ibadan_apata'), ('ibadan_bodija'),
  ('ibadan_challenge'), ('ibadan_dugbe'), ('ibadan_eleyele'), ('ibadan_felele'), ('ibadan_gate'),
  ('ibadan_iwo_road'), ('ibadan_iyaganku'), ('ibadan_jericho'), ('ibadan_mokola'), ('ibadan_molete'),
  ('ibadan_moniya'), ('ibadan_odo_ona'), ('ibadan_ojoo'), ('ibadan_oke_ado'), ('ibadan_oluyole'),
  ('ibadan_ring_road'), ('ibadan_samonda'), ('ibadan_sango'), ('ibadan_ui');
alter table private.offer_areas enable row level security;

create table private.offer_exchange_modes (id text primary key);
insert into private.offer_exchange_modes (id) values ('in_person'), ('remote'), ('either');
alter table private.offer_exchange_modes enable row level security;

create table private.offer_handover_methods (id text primary key, in_person boolean not null);
insert into private.offer_handover_methods (id, in_person) values
  ('collection', true), ('delivery', true), ('public_meetup', true), ('on_site_service', true),
  ('remote_service', false);
alter table private.offer_handover_methods enable row level security;

alter table public.offers
  add column area text references private.offer_areas (id),
  add column exchange_mode text references private.offer_exchange_modes (id),
  add column handover_methods text[] not null default '{}';

-- Logistics are preferences: changing them does not change what is
-- being offered, so content_version stays the same.
insert into private.offer_field_groups (field, field_group) values
  ('area', 'preference'),
  ('exchange_mode', 'preference'),
  ('handover_methods', 'preference');

-- The combination rules, checked after every create and edit (single
-- fields are checked in clean_offer_fields). Returns the failing field,
-- or null. Mirrors packages/shared `logisticsProblem`.
create function private.logistics_problem(p_mode text, p_methods text[]) returns text
language sql stable
set search_path = ''
as $$
  select case
    when p_mode = 'remote' and exists (
      select 1 from private.offer_handover_methods m where m.id = any (p_methods) and m.in_person
    ) then 'handover_methods'
    when p_mode = 'in_person' and exists (
      select 1 from private.offer_handover_methods m where m.id = any (p_methods) and not m.in_person
    ) then 'handover_methods'
    else null
  end
$$;

create function private.assert_logistics(p_offer_id uuid) returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_field text;
begin
  select private.logistics_problem(o.exchange_mode, o.handover_methods) into v_field
  from public.offers o where o.id = p_offer_id;
  if v_field is not null then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(v_field, 'invalid')));
  end if;
end;
$$;

-- Validates and trims offer fields from a request, now including the
-- three logistics fields. Same contract as before (unit 04).
create or replace function private.clean_offer_fields(p_fields jsonb) returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_limits constant jsonb := '{"title": 80, "description": 2000, "offering_text": 200, "wants_text": 200}';
  v_key text;
  v_value jsonb;
  v_text text;
  v_errors jsonb := '{}';
  v_clean jsonb := '{}';
  v_methods text[];
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'object' then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('fields', 'invalid')));
  end if;
  for v_key, v_value in select * from jsonb_each(p_fields) loop
    if v_limits ? v_key then
      if jsonb_typeof(v_value) <> 'string' then
        v_errors := v_errors || jsonb_build_object(v_key, 'invalid');
        continue;
      end if;
      v_text := private.trim_text(v_value #>> '{}');
      if char_length(v_text) > (v_limits ->> v_key)::integer then
        v_errors := v_errors || jsonb_build_object(v_key, 'too_long');
      else
        v_clean := v_clean || jsonb_build_object(v_key, v_text);
      end if;
    elsif v_key in ('category', 'condition', 'area', 'exchange_mode') then
      if jsonb_typeof(v_value) = 'null' then
        v_clean := v_clean || jsonb_build_object(v_key, null);
      elsif jsonb_typeof(v_value) = 'string' and (
        (v_key = 'category' and exists (select 1 from private.offer_categories c where c.id = v_value #>> '{}'))
        or (v_key = 'condition' and exists (select 1 from private.offer_conditions c where c.id = v_value #>> '{}'))
        or (v_key = 'area' and exists (select 1 from private.offer_areas a where a.id = v_value #>> '{}'))
        or (v_key = 'exchange_mode' and exists (select 1 from private.offer_exchange_modes m where m.id = v_value #>> '{}'))
      ) then
        v_clean := v_clean || jsonb_build_object(v_key, v_value);
      else
        v_errors := v_errors || jsonb_build_object(v_key, 'invalid');
      end if;
    elsif v_key = 'handover_methods' then
      if jsonb_typeof(v_value) <> 'array'
        or exists (select 1 from jsonb_array_elements(v_value) e where jsonb_typeof(e) <> 'string')
      then
        v_errors := v_errors || jsonb_build_object(v_key, 'invalid');
        continue;
      end if;
      select coalesce(array_agg(distinct e order by e), '{}') into v_methods from jsonb_array_elements_text(v_value) e;
      if exists (
        select 1 from unnest(v_methods) m where not exists (select 1 from private.offer_handover_methods h where h.id = m)
      ) then
        v_errors := v_errors || jsonb_build_object(v_key, 'invalid');
      else
        v_clean := v_clean || jsonb_build_object(v_key, to_jsonb(v_methods));
      end if;
    else
      v_errors := v_errors || jsonb_build_object(v_key, 'unknown_field');
    end if;
  end loop;
  if v_errors <> '{}' then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', v_errors));
  end if;
  return v_clean;
end;
$$;

create or replace function public.offer_create(p_fields jsonb default '{}', p_idempotency_key uuid default null) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_fields jsonb;
  v_offer public.offers;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/offers', null, private.request_hash(jsonb_build_object('fields', p_fields)));
  if v_stored is not null then
    return v_stored;
  end if;
  perform private.next_status('create', null);
  v_fields := private.clean_offer_fields(p_fields);
  insert into public.offers (
    owner_id, title, description, category, condition, offering_text, wants_text, area, exchange_mode, handover_methods
  )
  values (
    v_actor,
    coalesce(v_fields ->> 'title', ''),
    coalesce(v_fields ->> 'description', ''),
    v_fields ->> 'category',
    v_fields ->> 'condition',
    coalesce(v_fields ->> 'offering_text', ''),
    coalesce(v_fields ->> 'wants_text', ''),
    v_fields ->> 'area',
    v_fields ->> 'exchange_mode',
    coalesce(array(select jsonb_array_elements_text(v_fields -> 'handover_methods')), '{}')
  )
  returning * into v_offer;
  perform private.assert_logistics(v_offer.id);
  perform private.audit(v_actor, v_offer, 'create', null, 'draft');
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_offer.id);
  return v_response;
end;
$$;

create or replace function public.offer_edit(
  p_offer_id uuid,
  p_expected_status public.offer_status,
  p_expected_revision integer,
  p_fields jsonb,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_fields jsonb;
  v_material boolean;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'PATCH /api/v1/offers/:id', p_offer_id,
    private.request_hash(jsonb_build_object(
      'expected_status', p_expected_status, 'expected_revision', p_expected_revision, 'fields', p_fields)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  perform private.next_status('edit', v_offer.status);
  v_fields := private.clean_offer_fields(p_fields);
  if v_fields = '{}' then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('fields', 'required')));
  end if;
  -- One content_version increase if any material field actually changes.
  select exists (
    select 1
    from jsonb_each(v_fields) f
    join private.offer_field_groups g on g.field = f.key and g.field_group = 'material'
    where f.value is distinct from to_jsonb(v_offer) -> f.key
  ) into v_material;
  update public.offers o
  set title = coalesce(v_fields ->> 'title', o.title),
      description = coalesce(v_fields ->> 'description', o.description),
      category = case when v_fields ? 'category' then v_fields ->> 'category' else o.category end,
      condition = case when v_fields ? 'condition' then v_fields ->> 'condition' else o.condition end,
      offering_text = coalesce(v_fields ->> 'offering_text', o.offering_text),
      wants_text = coalesce(v_fields ->> 'wants_text', o.wants_text),
      area = case when v_fields ? 'area' then v_fields ->> 'area' else o.area end,
      exchange_mode = case when v_fields ? 'exchange_mode' then v_fields ->> 'exchange_mode' else o.exchange_mode end,
      handover_methods = case
        when v_fields ? 'handover_methods' then array(select jsonb_array_elements_text(v_fields -> 'handover_methods'))
        else o.handover_methods
      end
  where o.id = v_offer.id;
  perform private.assert_logistics(v_offer.id);
  v_offer := private.bump_offer(v_offer.id, v_material);
  if v_offer.status in ('active', 'paused') then
    perform private.assert_publishable(v_offer.id);
  end if;
  perform private.audit(v_actor, v_offer, 'edit', v_offer.status, v_offer.status);
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_offer.id);
  return v_response;
end;
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
