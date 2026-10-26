-- Unit 06: small additions the offer API needs.

-- Uploads check their idempotency key before processing the image
-- (milestone-1.md, Idempotency). This only reads: it returns the stored
-- response of a completed request with the same key, or null when the
-- request should go ahead. A key used for a different request is 422.
-- offer_photo_add still records and checks the key in its transaction.
create function public.offer_idempotent_response(
  p_key uuid, p_endpoint text, p_resource_id uuid, p_request_hash text
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_row private.idempotency_keys;
begin
  if p_key is null then
    perform private.fail('IDEMPOTENCY_KEY_REQUIRED', 400);
  end if;
  select * into v_row from private.idempotency_keys k
  where k.actor_id = v_actor and k.key = p_key and k.expires_at > now();
  if not found then
    return null;
  end if;
  if v_row.endpoint <> p_endpoint
    or (p_resource_id is not null and v_row.resource_id is distinct from p_resource_id)
    or v_row.request_hash <> p_request_hash then
    perform private.fail('IDEMPOTENCY_KEY_REUSED', 422);
  end if;
  return v_row.response_body;
end;
$$;

-- The server deletes queued files right after a commit (service key,
-- server only), then reports the outcome here. A failure stays queued
-- with its error and attempt count for the cleanup job (unit 08).
create function public.storage_cleanup_complete(p_paths text[]) returns integer
language sql security definer
set search_path = ''
as $$
  with removed as (delete from private.storage_cleanup_queue q where q.path = any (p_paths) returning 1)
  select count(*)::integer from removed
$$;

create function public.storage_cleanup_failed(p_paths text[], p_error text) returns integer
language sql security definer
set search_path = ''
as $$
  with updated as (
    update private.storage_cleanup_queue q
    set attempts = q.attempts + 1, last_error = left(p_error, 500)
    where q.path = any (p_paths)
    returning 1
  )
  select count(*)::integer from updated
$$;

revoke execute on function
  public.offer_idempotent_response(uuid, text, uuid, text),
  public.storage_cleanup_complete(text[]),
  public.storage_cleanup_failed(text[], text)
from public, anon, authenticated;
grant execute on function public.offer_idempotent_response(uuid, text, uuid, text) to authenticated;
grant execute on function public.storage_cleanup_complete(text[]), public.storage_cleanup_failed(text[], text) to service_role;
