-- Milestone 9: services as first-class offers
-- (specs/milestone-9-services.md, V1–V8). An offer is an item or a
-- service. A service has its own categories, no condition, and only the
-- service handover methods; an item can't use those. Existing offers
-- are items and are left as they are.

-- V1 ----------------------------------------------------------------

alter table public.offers
  add column offer_type text not null default 'item' check (offer_type in ('item', 'service'));

-- V2: service categories, and which type each category belongs to.
alter table private.offer_categories
  add column offer_type text not null default 'item' check (offer_type in ('item', 'service'));
insert into private.offer_categories (id, offer_type) values
  ('lessons_tutoring', 'service'),
  ('beauty_hair', 'service'),
  ('repairs', 'service'),
  ('design_digital', 'service'),
  ('cleaning_home', 'service'),
  ('events', 'service'),
  ('other_services', 'service');

-- V6: the methods a service uses; an item uses the others.
alter table private.offer_handover_methods add column for_service boolean not null default false;
update private.offer_handover_methods set for_service = true where id in ('on_site_service', 'remote_service');

-- V7: switching type is a material change.
insert into private.offer_field_groups (field, field_group) values ('offer_type', 'material');

-- Valuation's goods list stays the item categories.
create or replace function private.is_option(p_list text, p_id text) returns boolean
language sql stable
set search_path = ''
as $$
  select case
    when p_list = 'goods_category' then exists (select 1 from private.offer_categories c where c.id = p_id and c.offer_type = 'item')
    else exists (select 1 from private.valuation_options o where o.list = p_list and o.id = p_id)
  end
$$;

-- The type rules (V2, V3, V6). Field => reason, empty when fine.
-- Mirrors packages/shared `offerTypeProblems`.
create function private.offer_type_problems(p_type text, p_category text, p_condition text, p_methods text[]) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'category', case
      when p_category is not null and not exists (
        select 1 from private.offer_categories c where c.id = p_category and c.offer_type = p_type)
      then case when p_type = 'service' then 'service_category' else 'item_category' end end,
    'condition', case when p_type = 'service' and p_condition is not null then 'service_condition' end,
    'handover_methods', case
      when exists (
        select 1 from private.offer_handover_methods m
        where m.id = any (p_methods) and m.for_service <> (p_type = 'service'))
      then case when p_type = 'service' then 'service_method' else 'item_method' end end))
$$;

-- After every create and edit: the logistics rule first (its message
-- says more), then the type rules for the other fields.
create or replace function private.assert_logistics(p_offer_id uuid) returns void
language plpgsql stable
set search_path = ''
as $$
declare
  v_offer public.offers;
  v_problems jsonb;
  v_field text;
begin
  select * into v_offer from public.offers o where o.id = p_offer_id;
  v_problems := private.offer_type_problems(v_offer.offer_type, v_offer.category, v_offer.condition, v_offer.handover_methods);
  v_field := private.logistics_problem(v_offer.exchange_mode, v_offer.handover_methods);
  if v_field is not null then
    v_problems := v_problems || jsonb_build_object(v_field, 'invalid');
  end if;
  if v_problems <> '{}' then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', v_problems));
  end if;
end;
$$;

-- V3: a service is published without a condition.
create or replace function private.offer_publish_failures(p_offer_id uuid) returns text[]
language sql stable
set search_path = ''
as $$
  select array_remove(
    private.publish_rule_failures(
      o.title, o.category, o.condition, o.offering_text, o.wants_text,
      (select count(*)::integer from public.offer_photos p where p.offer_id = o.id)
    ),
    case when o.offer_type = 'service' then 'condition' end)
  from public.offers o
  where o.id = p_offer_id
$$;

-- Snapshots carry the type, so proposals and agreements word a
-- service as a service. Older snapshots have none and read as items.
create or replace function private.offer_snapshot(p_offer_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'offer_type', o.offer_type,
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

-- Request fields, now with `offer_type`. Same contract as before.
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
    elsif v_key = 'offer_type' then
      if v_value in ('"item"', '"service"') then
        v_clean := v_clean || jsonb_build_object(v_key, v_value);
      else
        v_errors := v_errors || jsonb_build_object(v_key, 'invalid');
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
    owner_id, offer_type, title, description, category, condition, offering_text, wants_text, area, exchange_mode, handover_methods
  )
  values (
    v_actor,
    coalesce(v_fields ->> 'offer_type', 'item'),
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

-- Switching type without naming the other fields clears what doesn't
-- fit the new type (a category of the other list, the condition for a
-- service, and handover methods of the other type), as the form does.
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
  v_type text;
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
  v_type := coalesce(v_fields ->> 'offer_type', v_offer.offer_type);
  -- One content_version increase if any material field actually changes.
  select exists (
    select 1
    from jsonb_each(v_fields) f
    join private.offer_field_groups g on g.field = f.key and g.field_group = 'material'
    where f.value is distinct from to_jsonb(v_offer) -> f.key
  ) into v_material;
  update public.offers o
  set offer_type = v_type,
      title = coalesce(v_fields ->> 'title', o.title),
      description = coalesce(v_fields ->> 'description', o.description),
      category = case
        when v_fields ? 'category' then v_fields ->> 'category'
        when exists (select 1 from private.offer_categories c where c.id = o.category and c.offer_type = v_type) then o.category
        else null
      end,
      condition = case
        when v_fields ? 'condition' then v_fields ->> 'condition'
        when v_type = 'service' then null
        else o.condition
      end,
      offering_text = coalesce(v_fields ->> 'offering_text', o.offering_text),
      wants_text = coalesce(v_fields ->> 'wants_text', o.wants_text),
      area = case when v_fields ? 'area' then v_fields ->> 'area' else o.area end,
      exchange_mode = case when v_fields ? 'exchange_mode' then v_fields ->> 'exchange_mode' else o.exchange_mode end,
      handover_methods = case
        when v_fields ? 'handover_methods' then array(select jsonb_array_elements_text(v_fields -> 'handover_methods'))
        when v_type <> o.offer_type then array(
          select m.id from private.offer_handover_methods m
          where m.id = any (o.handover_methods) and m.for_service = (v_type = 'service') order by m.id)
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

-- V8: the completion prompt words services differently, so listed
-- offers carry their type. Otherwise as in 20261023000200.
create or replace function private.agreement_json(p_agreement_id uuid, p_viewer uuid) returns jsonb
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
    'cancellation', (select private.cancellation_request_json(c) from public.cancellation_requests c
                     where c.agreement_id = a.id order by c.created_at desc limit 1),
    'listing_changed', (select jsonb_array_length(private.changed_items(v.gives || v.gets)) > 0
                        from public.agreement_versions v where v.id = a.binding_version_id),
    'pending_changed_offer_ids', coalesce((
      select private.changed_items(private.new_items(p, b))
      from public.agreement_versions p, public.agreement_versions b
      where p.agreement_id = a.id and p.outcome = 'pending' and b.id = a.binding_version_id), '[]'),
    'fee', private.agreement_fee_json(a.offer_id),
    'my_listed_offers', (
      select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'title', o.title, 'offer_type', o.offer_type) order by o.title), '[]')
      from public.agreement_versions v
      cross join lateral jsonb_array_elements(v.gives || v.gets) i
      join public.offers o on o.id = (i ->> 'offer_id')::uuid
      where v.id = a.binding_version_id and i ->> 'kind' = 'offer'
        and o.owner_id = p_viewer and o.status in ('active', 'paused')
    ),
    'gives_choices', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', o.id, 'title', o.title,
        'thumb_path', (select ph.thumb_path from public.offer_photos ph where ph.offer_id = o.id order by ph.position limit 1)
      ) order by o.published_at desc), '[]')
      from public.offers o
      where o.owner_id = a.proposer_id and o.status = 'active' and a.status = 'active'
    ),
    'problem', private.agreement_problem_json(a, p_viewer)
  )
  from public.agreements a
  where a.id = p_agreement_id
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
