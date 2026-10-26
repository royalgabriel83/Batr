-- Milestone 1, unit 04: the only write path for offers and photos.
--
-- Every function (state-model.md §1; milestone-1.md, Idempotency and
-- Concurrency):
--   1. requires a signed-in caller and an idempotency key, and records
--      the key first, so a completed retry returns the stored response
--      and a concurrent retry waits on the key row;
--   2. locks the offer row (SELECT … FOR UPDATE) before reading it;
--   3. checks the caller is the owner, then expected_status, then
--      expected_revision, then the transition table;
--   4. writes the change, increases `revision` by one (and
--      `content_version` for material changes), and re-checks the
--      publish rules for active and paused offers;
--   5. writes exactly one audit event and stores the response with the
--      key, all in the same transaction.
--
-- Errors are raised with SQLSTATE PTxxx, which PostgREST returns as
-- HTTP status xxx. The message is the API error code; the detail is a
-- JSON object (reason, current_status, current_revision, fields, ...).

-- Helpers -----------------------------------------------------------

create function private.fail(p_code text, p_status integer, p_detail jsonb default '{}'::jsonb) returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'PT' || p_status::text, message = p_code, detail = p_detail::text;
end;
$$;

create function private.require_actor() returns uuid
language plpgsql stable
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    perform private.fail('UNAUTHENTICATED', 401);
  end if;
  return v_actor;
end;
$$;

-- SHA-256 of the request body as canonical JSON (jsonb text output has
-- a fixed key order).
create function private.request_hash(p_body jsonb) returns text
language sql immutable
set search_path = ''
as $$ select encode(sha256(convert_to(p_body::text, 'UTF8')), 'hex') $$;

-- Records the key at the start of the transaction. Returns the stored
-- response when the same request already completed, null when this
-- request should run. A concurrent request with the same key blocks on
-- the insert until the first commits (then gets its response) or rolls
-- back (then runs normally).
create function private.idempotency_begin(
  p_actor uuid, p_key uuid, p_endpoint text, p_resource_id uuid, p_request_hash text
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_row private.idempotency_keys;
begin
  if p_key is null then
    perform private.fail('IDEMPOTENCY_KEY_REQUIRED', 400);
  end if;
  -- An expired key is a new request (the revision check still applies).
  delete from private.idempotency_keys k where k.actor_id = p_actor and k.key = p_key and k.expires_at <= now();
  insert into private.idempotency_keys (actor_id, key, endpoint, resource_id, request_hash)
  values (p_actor, p_key, p_endpoint, p_resource_id, p_request_hash)
  on conflict (actor_id, key) do nothing;
  if found then
    return null;
  end if;
  select * into v_row from private.idempotency_keys k where k.actor_id = p_actor and k.key = p_key;
  if v_row.endpoint <> p_endpoint
    or (p_resource_id is not null and v_row.resource_id is distinct from p_resource_id)
    or v_row.request_hash <> p_request_hash then
    perform private.fail('IDEMPOTENCY_KEY_REUSED', 422);
  end if;
  return v_row.response_body;
end;
$$;

create function private.idempotency_finish(
  p_actor uuid, p_key uuid, p_status integer, p_body jsonb, p_resource_id uuid
) returns void
language sql
set search_path = ''
as $$
  update private.idempotency_keys
  set response_status = p_status, response_body = p_body, resource_id = coalesce(resource_id, p_resource_id)
  where actor_id = p_actor and key = p_key
$$;

-- The offer as the API returns it, photos in order.
create function private.offer_json(p_offer_id uuid) returns jsonb
language sql stable
set search_path = ''
as $$
  select to_jsonb(o) || jsonb_build_object(
    'photos',
    coalesce(
      (select jsonb_agg(to_jsonb(p) - 'offer_id' order by p.position) from public.offer_photos p where p.offer_id = o.id),
      '[]'::jsonb
    )
  )
  from public.offers o
  where o.id = p_offer_id
$$;

-- Locks the offer and runs the checks every write shares, in the order
-- packages/shared `transitionOffer` reports them.
create function private.lock_offer(
  p_offer_id uuid, p_actor uuid, p_expected_status public.offer_status, p_expected_revision integer
) returns public.offers
language plpgsql
set search_path = ''
as $$
declare
  v_offer public.offers;
begin
  select * into v_offer from public.offers o where o.id = p_offer_id for update;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_offer.owner_id <> p_actor then
    if v_offer.status = 'active' then
      perform private.fail('FORBIDDEN', 403);
    end if;
    perform private.fail('NOT_FOUND', 404);
  end if;
  if p_expected_status is null or p_expected_revision is null then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object(
      'expected_status', 'required', 'expected_revision', 'required')));
  end if;
  if v_offer.status <> p_expected_status then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', v_offer.status));
  end if;
  if v_offer.revision <> p_expected_revision then
    perform private.fail('CONFLICT', 409, jsonb_build_object(
      'reason', 'stale_revision', 'current_revision', v_offer.revision, 'offer', private.offer_json(v_offer.id)));
  end if;
  return v_offer;
end;
$$;

-- The status after `p_action`, or 409 when the table has no such
-- transition. Returns null for delete.
create function private.next_status(p_action text, p_from public.offer_status) returns public.offer_status
language plpgsql stable
set search_path = ''
as $$
declare
  v_to public.offer_status;
begin
  select t.to_status into v_to from private.offer_transitions t where t.action = p_action and t.from_status is not distinct from p_from;
  if not found then
    perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'status_changed', 'current_status', p_from));
  end if;
  return v_to;
end;
$$;

create function private.assert_publishable(p_offer_id uuid) returns void
language plpgsql
set search_path = ''
as $$
declare
  v_failures text[] := private.offer_publish_failures(p_offer_id);
begin
  if cardinality(v_failures) > 0 then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', to_jsonb(v_failures)));
  end if;
end;
$$;

create function private.audit(
  p_actor uuid, p_offer public.offers, p_action text, p_from public.offer_status, p_to public.offer_status
) returns void
language sql
set search_path = ''
as $$
  insert into public.audit_events (actor_id, entity_type, entity_id, action, from_state, to_state, content_version, revision)
  values (p_actor, 'offer', p_offer.id, p_action, p_from, p_to, p_offer.content_version, p_offer.revision)
$$;

-- Validates and trims offer fields from a request (draft rules; the
-- publish rules are checked after the change). Returns only the keys
-- given. Unknown keys, wrong types and values over the limits are 422.
create function private.clean_offer_fields(p_fields jsonb) returns jsonb
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
    elsif v_key in ('category', 'condition') then
      if jsonb_typeof(v_value) = 'null' then
        v_clean := v_clean || jsonb_build_object(v_key, null);
      elsif jsonb_typeof(v_value) = 'string' and (
        (v_key = 'category' and exists (select 1 from private.offer_categories c where c.id = v_value #>> '{}'))
        or (v_key = 'condition' and exists (select 1 from private.offer_conditions c where c.id = v_value #>> '{}'))
      ) then
        v_clean := v_clean || jsonb_build_object(v_key, v_value);
      else
        v_errors := v_errors || jsonb_build_object(v_key, 'invalid');
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

create function private.clean_alt_text(p_alt_text text) returns text
language plpgsql stable
set search_path = ''
as $$
declare
  v_text text := coalesce(private.trim_text(p_alt_text), '');
begin
  if char_length(v_text) > 200 then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('alt_text', 'too_long')));
  end if;
  return v_text;
end;
$$;

-- Increases revision by one (every write) and content_version by one
-- when the write is material. Returns the updated row.
create function private.bump_offer(p_offer_id uuid, p_material boolean) returns public.offers
language sql
set search_path = ''
as $$
  update public.offers
  set revision = revision + 1,
      content_version = content_version + case when p_material then 1 else 0 end,
      updated_at = now()
  where id = p_offer_id
  returning *
$$;

create function private.photo_paths(p_owner uuid, p_offer_id uuid, p_photo_id uuid) returns text[]
language sql immutable
set search_path = ''
as $$
  select array[
    p_owner || '/' || p_offer_id || '/' || p_photo_id || '-display.webp',
    p_owner || '/' || p_offer_id || '/' || p_photo_id || '-thumb.webp'
  ]
$$;

create function private.queue_cleanup(p_paths text[], p_reason text) returns void
language sql
set search_path = ''
as $$
  insert into private.storage_cleanup_queue (path, reason) select unnest(p_paths), p_reason
$$;

-- Create and edit ---------------------------------------------------

create function public.offer_create(p_fields jsonb default '{}', p_idempotency_key uuid default null) returns jsonb
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
  insert into public.offers (owner_id, title, description, category, condition, offering_text, wants_text)
  values (
    v_actor,
    coalesce(v_fields ->> 'title', ''),
    coalesce(v_fields ->> 'description', ''),
    v_fields ->> 'category',
    v_fields ->> 'condition',
    coalesce(v_fields ->> 'offering_text', ''),
    coalesce(v_fields ->> 'wants_text', '')
  )
  returning * into v_offer;
  perform private.audit(v_actor, v_offer, 'create', null, 'draft');
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_offer.id);
  return v_response;
end;
$$;

create function public.offer_edit(
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
      wants_text = coalesce(v_fields ->> 'wants_text', o.wants_text)
  where o.id = v_offer.id;
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

-- Photos ------------------------------------------------------------

-- Adds the row for a photo whose two processed files the API has
-- already uploaded with the owner's session. `p_request_hash` is the
-- SHA-256 the API computed from the file bytes and fields.
create function public.offer_photo_add(
  p_offer_id uuid,
  p_expected_status public.offer_status,
  p_expected_revision integer,
  p_photo_id uuid,
  p_width integer,
  p_height integer,
  p_request_hash text,
  p_alt_text text default '',
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_paths text[] := private.photo_paths(v_actor, p_offer_id, p_photo_id);
  v_stored jsonb;
  v_offer public.offers;
  v_count integer;
  v_response jsonb;
begin
  if p_request_hash is null or p_request_hash !~ '^[0-9a-f]{64}$' then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('request_hash', 'invalid')));
  end if;
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/offers/:id/photos', p_offer_id, p_request_hash);
  if v_stored is not null then
    -- Already added by an earlier attempt: this attempt's files are spare.
    if not exists (select 1 from public.offer_photos p where p.display_path = v_paths[1]) then
      perform private.queue_cleanup(v_paths, 'upload_replayed');
    end if;
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  perform private.next_status('edit', v_offer.status);
  if p_width is null or p_width <= 0 or p_height is null or p_height <= 0 then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('photo', 'invalid_size')));
  end if;
  select count(*) into v_count from public.offer_photos p where p.offer_id = v_offer.id;
  if v_count >= 8 then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('photos', 'too_many')));
  end if;
  if (select count(*) from storage.objects s where s.bucket_id = 'offer-photos' and s.name = any (v_paths)) <> 2 then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('photo', 'file_missing')));
  end if;
  insert into public.offer_photos (id, offer_id, display_path, thumb_path, position, width, height, alt_text)
  values (p_photo_id, v_offer.id, v_paths[1], v_paths[2], v_count + 1, p_width, p_height, private.clean_alt_text(p_alt_text));
  v_offer := private.bump_offer(v_offer.id, true);
  perform private.audit(v_actor, v_offer, 'photo_add', v_offer.status, v_offer.status);
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 201, v_response, v_offer.id);
  return v_response;
end;
$$;

-- Removes a photo, renumbers the rest and queues its files. The
-- response's `cleanup_paths` tells the API which files to delete now.
create function public.offer_photo_remove(
  p_offer_id uuid,
  p_photo_id uuid,
  p_expected_status public.offer_status,
  p_expected_revision integer,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_photo public.offer_photos;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'DELETE /api/v1/offers/:id/photos/:photoId', p_photo_id,
    private.request_hash(jsonb_build_object(
      'offer_id', p_offer_id, 'expected_status', p_expected_status, 'expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  perform private.next_status('edit', v_offer.status);
  delete from public.offer_photos p where p.id = p_photo_id and p.offer_id = v_offer.id returning * into v_photo;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  perform private.queue_cleanup(array[v_photo.display_path, v_photo.thumb_path], 'photo_removed');
  update public.offer_photos p
  set position = s.position
  from (select q.id, row_number() over (order by q.position) as position from public.offer_photos q where q.offer_id = v_offer.id) s
  where p.id = s.id and p.position <> s.position;
  v_offer := private.bump_offer(v_offer.id, true);
  if v_offer.status in ('active', 'paused') then
    perform private.assert_publishable(v_offer.id);
  end if;
  perform private.audit(v_actor, v_offer, 'photo_remove', v_offer.status, v_offer.status);
  v_response := private.offer_json(v_offer.id)
    || jsonb_build_object('cleanup_paths', jsonb_build_array(v_photo.display_path, v_photo.thumb_path));
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, p_photo_id);
  return v_response;
end;
$$;

-- Sets every position from the complete ordered list in one statement
-- (the unique constraint is checked at commit). Discovery metadata: no
-- content_version change.
create function public.offer_photo_reorder(
  p_offer_id uuid,
  p_photo_ids uuid[],
  p_expected_status public.offer_status,
  p_expected_revision integer,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'PUT /api/v1/offers/:id/photos/order', p_offer_id,
    private.request_hash(jsonb_build_object(
      'photo_ids', to_jsonb(p_photo_ids), 'expected_status', p_expected_status, 'expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  perform private.next_status('edit', v_offer.status);
  -- The list must be exactly the current set of photos, each once.
  if p_photo_ids is null
    or cardinality(p_photo_ids) <> (select count(distinct x) from unnest(p_photo_ids) x)
    or array(select x from unnest(p_photo_ids) x order by x)
       is distinct from array(select p.id from public.offer_photos p where p.offer_id = v_offer.id order by p.id) then
    perform private.fail('CONFLICT', 409, jsonb_build_object(
      'reason', 'stale_revision', 'current_revision', v_offer.revision, 'offer', private.offer_json(v_offer.id)));
  end if;
  update public.offer_photos p
  set position = s.ord
  from unnest(p_photo_ids) with ordinality as s(id, ord)
  where p.id = s.id and p.offer_id = v_offer.id;
  v_offer := private.bump_offer(v_offer.id, false);
  perform private.audit(v_actor, v_offer, 'photo_reorder', v_offer.status, v_offer.status);
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_offer.id);
  return v_response;
end;
$$;

create function public.offer_photo_set_alt_text(
  p_offer_id uuid,
  p_photo_id uuid,
  p_alt_text text,
  p_expected_status public.offer_status,
  p_expected_revision integer,
  p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'PATCH /api/v1/offers/:id/photos/:photoId', p_photo_id,
    private.request_hash(jsonb_build_object(
      'offer_id', p_offer_id, 'alt_text', p_alt_text,
      'expected_status', p_expected_status, 'expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  perform private.next_status('edit', v_offer.status);
  update public.offer_photos p set alt_text = private.clean_alt_text(p_alt_text)
  where p.id = p_photo_id and p.offer_id = v_offer.id;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  v_offer := private.bump_offer(v_offer.id, false);
  perform private.audit(v_actor, v_offer, 'photo_alt_text', v_offer.status, v_offer.status);
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, p_photo_id);
  return v_response;
end;
$$;

-- Lets the API queue processed files it uploaded when the database step
-- then failed. Only paths in the caller's own folder that no photo row
-- uses are accepted.
create function public.offer_photo_files_abandon(p_paths text[]) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
begin
  if p_paths is null or cardinality(p_paths) = 0 or cardinality(p_paths) > 2 or exists (
    select 1 from unnest(p_paths) x
    where x !~ ('^' || v_actor || '/[0-9a-f-]{36}/[0-9a-f-]{36}-(display|thumb)\.webp$')
      or exists (select 1 from public.offer_photos p where p.display_path = x or p.thumb_path = x)
  ) then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('paths', 'invalid')));
  end if;
  perform private.queue_cleanup(p_paths, 'upload_abandoned');
end;
$$;

-- Transitions -------------------------------------------------------

create function private.offer_transition(
  p_action text,
  p_offer_id uuid,
  p_expected_status public.offer_status,
  p_expected_revision integer,
  p_idempotency_key uuid
) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_from public.offer_status;
  v_to public.offer_status;
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'POST /api/v1/offers/:id/' || p_action, p_offer_id,
    private.request_hash(jsonb_build_object('expected_status', p_expected_status, 'expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  v_from := v_offer.status;
  v_to := private.next_status(p_action, v_from);
  update public.offers o
  set status = v_to,
      published_at = case when p_action = 'publish' then now() else o.published_at end,
      closed_at = case when v_to = 'closed' then now() else o.closed_at end
  where o.id = v_offer.id;
  v_offer := private.bump_offer(v_offer.id, false);
  if p_action in ('publish', 'resume') then
    perform private.assert_publishable(v_offer.id);
  end if;
  perform private.audit(v_actor, v_offer, p_action, v_from, v_to);
  v_response := private.offer_json(v_offer.id);
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_offer.id);
  return v_response;
end;
$$;

create function public.offer_publish(
  p_offer_id uuid, p_expected_status public.offer_status, p_expected_revision integer, p_idempotency_key uuid default null
) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.offer_transition('publish', p_offer_id, p_expected_status, p_expected_revision, p_idempotency_key) $$;

create function public.offer_pause(
  p_offer_id uuid, p_expected_status public.offer_status, p_expected_revision integer, p_idempotency_key uuid default null
) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.offer_transition('pause', p_offer_id, p_expected_status, p_expected_revision, p_idempotency_key) $$;

create function public.offer_resume(
  p_offer_id uuid, p_expected_status public.offer_status, p_expected_revision integer, p_idempotency_key uuid default null
) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.offer_transition('resume', p_offer_id, p_expected_status, p_expected_revision, p_idempotency_key) $$;

create function public.offer_close(
  p_offer_id uuid, p_expected_status public.offer_status, p_expected_revision integer, p_idempotency_key uuid default null
) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.offer_transition('close', p_offer_id, p_expected_status, p_expected_revision, p_idempotency_key) $$;

-- Deletes a draft: audit event (kept), files queued, rows deleted, in
-- one transaction.
create function public.offer_delete_draft(
  p_offer_id uuid, p_expected_status public.offer_status, p_expected_revision integer, p_idempotency_key uuid default null
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_stored jsonb;
  v_offer public.offers;
  v_paths text[];
  v_response jsonb;
begin
  v_stored := private.idempotency_begin(
    v_actor, p_idempotency_key, 'DELETE /api/v1/offers/:id', p_offer_id,
    private.request_hash(jsonb_build_object('expected_status', p_expected_status, 'expected_revision', p_expected_revision)));
  if v_stored is not null then
    return v_stored;
  end if;
  v_offer := private.lock_offer(p_offer_id, v_actor, p_expected_status, p_expected_revision);
  perform private.next_status('delete', v_offer.status);
  select coalesce(array_agg(x order by x), '{}') into v_paths
  from public.offer_photos p, unnest(array[p.display_path, p.thumb_path]) x
  where p.offer_id = v_offer.id;
  perform private.queue_cleanup(v_paths, 'draft_deleted');
  v_offer.revision := v_offer.revision + 1;
  perform private.audit(v_actor, v_offer, 'delete', 'draft', null);
  delete from public.offers o where o.id = v_offer.id;
  v_response := jsonb_build_object('id', v_offer.id, 'deleted', true, 'cleanup_paths', to_jsonb(v_paths));
  perform private.idempotency_finish(v_actor, p_idempotency_key, 200, v_response, v_offer.id);
  return v_response;
end;
$$;

-- Privileges --------------------------------------------------------

revoke execute on all functions in schema private from public, anon, authenticated;

revoke execute on function
  public.offer_create(jsonb, uuid),
  public.offer_edit(uuid, public.offer_status, integer, jsonb, uuid),
  public.offer_photo_add(uuid, public.offer_status, integer, uuid, integer, integer, text, text, uuid),
  public.offer_photo_remove(uuid, uuid, public.offer_status, integer, uuid),
  public.offer_photo_reorder(uuid, uuid[], public.offer_status, integer, uuid),
  public.offer_photo_set_alt_text(uuid, uuid, text, public.offer_status, integer, uuid),
  public.offer_photo_files_abandon(text[]),
  public.offer_publish(uuid, public.offer_status, integer, uuid),
  public.offer_pause(uuid, public.offer_status, integer, uuid),
  public.offer_resume(uuid, public.offer_status, integer, uuid),
  public.offer_close(uuid, public.offer_status, integer, uuid),
  public.offer_delete_draft(uuid, public.offer_status, integer, uuid)
from public, anon;

grant execute on function
  public.offer_create(jsonb, uuid),
  public.offer_edit(uuid, public.offer_status, integer, jsonb, uuid),
  public.offer_photo_add(uuid, public.offer_status, integer, uuid, integer, integer, text, text, uuid),
  public.offer_photo_remove(uuid, uuid, public.offer_status, integer, uuid),
  public.offer_photo_reorder(uuid, uuid[], public.offer_status, integer, uuid),
  public.offer_photo_set_alt_text(uuid, uuid, text, public.offer_status, integer, uuid),
  public.offer_photo_files_abandon(text[]),
  public.offer_publish(uuid, public.offer_status, integer, uuid),
  public.offer_pause(uuid, public.offer_status, integer, uuid),
  public.offer_resume(uuid, public.offer_status, integer, uuid),
  public.offer_close(uuid, public.offer_status, integer, uuid),
  public.offer_delete_draft(uuid, public.offer_status, integer, uuid)
to authenticated;
