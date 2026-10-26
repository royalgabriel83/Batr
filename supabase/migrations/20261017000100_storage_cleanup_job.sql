-- Unit 08: what the storage cleanup job reads and clears
-- (milestone-1.md, Cleanup). The job runs on the server with the
-- server-only service key; members and visitors cannot call any of
-- these functions.

-- Queued paths to retry, oldest first. A path queued twice is returned
-- once; storage_cleanup_complete clears every entry for it.
create function public.storage_cleanup_pending(p_limit integer default 500)
returns table (path text, attempts integer)
language sql stable security definer
set search_path = ''
as $$
  select q.path, max(q.attempts)::integer
  from private.storage_cleanup_queue q
  group by q.path
  order by min(q.id)
  limit greatest(p_limit, 0)
$$;

-- Files in the photo bucket that no photo row points to, stored longer
-- ago than p_older_than: an upload whose database step never ran, or a
-- file a member put straight into their own folder. Nobody can read or
-- sign such a file (the read policy needs a photo row). Paths already
-- queued are left to the queue.
create function public.storage_orphaned_files(
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
    and not exists (select 1 from private.storage_cleanup_queue q where q.path = o.name)
  order by o.created_at, o.name
  limit greatest(p_limit, 0)
$$;

-- Removes idempotency keys past their expiry. Expired keys are already
-- ignored by every check; this only frees the space.
create function public.idempotency_keys_purge() returns integer
language sql security definer
set search_path = ''
as $$
  with removed as (delete from private.idempotency_keys k where k.expires_at <= now() returning 1)
  select count(*)::integer from removed
$$;

revoke execute on function
  public.storage_cleanup_pending(integer),
  public.storage_orphaned_files(interval, integer),
  public.idempotency_keys_purge()
from public, anon, authenticated;
grant execute on function
  public.storage_cleanup_pending(integer),
  public.storage_orphaned_files(interval, integer),
  public.idempotency_keys_purge()
to service_role;
