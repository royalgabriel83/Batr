-- Milestone 1, unit 04: the private photo bucket and its policies
-- (milestone-1.md, Photos: Storage and access).

-- Only processed WebP files of at most 2 MB are accepted.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('offer-photos', 'offer-photos', false, 2097152, array['image/webp']);

-- Insert: a signed-in member, into their own folder, for an offer they
-- own that is draft, active or paused, with a name matching
-- {owner_id}/{offer_id}/{photo_id}-{display|thumb}.webp. There is no
-- update policy, so existing files cannot be overwritten.
create policy "offer photos: owners add files to their open offers" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'offer-photos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}-(display|thumb)\.webp$'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1 from public.offers o
    where o.id::text = split_part(objects.name, '/', 2)
      and o.owner_id = (select auth.uid())
      and o.status in ('draft', 'active', 'paused')
  )
);

-- Read, and therefore signing: only a file a photo row points to, and
-- only while the viewer may read that photo row (the owner always,
-- anyone else while the offer is active; the offer_photos and offers
-- policies apply inside the subquery).
create policy "offer photos: readable with a visible photo row" on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'offer-photos'
  and exists (
    select 1 from public.offer_photos p
    where p.display_path = objects.name or p.thumb_path = objects.name
  )
);

-- No delete policy: members cannot delete files. The server deletes
-- them from the cleanup queue with the server-only key.
