-- Likes and saved offers (owner, 2026-10-17: heart and bookmark on
-- offer photos, as in the approved reference). Both are private to the
-- member: nobody else, the offer's owner included, can see who liked or
-- saved an offer, and no counts are shown. A like or save is never a
-- proposal, reservation or commitment, and it notifies no one.
--
-- Rules:
-- - Only a signed-in member can like or save, only an offer they can
--   read that is active, and never their own (404 otherwise, 403 on
--   their own offer).
-- - Doing it twice changes nothing; undoing something not done also
--   succeeds. Repeating a request is harmless, so these two functions
--   need no idempotency key.
-- - Undoing always works, even after the offer stops being available.
-- - Rows go when the member's account or the offer is deleted.
-- - Members read only their own rows and never write tables directly.

create table public.offer_saves (
  member_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, offer_id)
);
create index offer_saves_by_member on public.offer_saves (member_id, created_at desc, offer_id);

create table public.offer_likes (
  member_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid not null references public.offers (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (member_id, offer_id)
);
create index offer_likes_by_offer on public.offer_likes (offer_id);

alter table public.offer_saves enable row level security;
alter table public.offer_likes enable row level security;
revoke insert, update, delete, truncate, references, trigger on public.offer_saves, public.offer_likes from anon, authenticated;
revoke all on public.offer_saves, public.offer_likes from anon;

create policy "offer saves: own" on public.offer_saves
for select to authenticated
using (member_id = (select auth.uid()));

create policy "offer likes: own" on public.offer_likes
for select to authenticated
using (member_id = (select auth.uid()));

-- Until rate limiting exists, a member can keep at most this many saved
-- offers (likes have the same cap).
create function private.mark_limit() returns integer
language sql immutable
set search_path = ''
as $$ select 1000 $$;

-- Sets or clears the member's like or save on an offer.
create function private.set_offer_mark(p_kind text, p_offer_id uuid, p_on boolean) returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_offer public.offers;
  v_count integer;
begin
  if p_offer_id is null or p_on is null then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('offer_id', 'required')));
  end if;
  if not p_on then
    if p_kind = 'save' then
      delete from public.offer_saves s where s.member_id = v_actor and s.offer_id = p_offer_id;
    else
      delete from public.offer_likes l where l.member_id = v_actor and l.offer_id = p_offer_id;
    end if;
    return jsonb_build_object('offer_id', p_offer_id, 'on', false);
  end if;
  select * into v_offer from public.offers o where o.id = p_offer_id;
  if not found or (v_offer.status <> 'active' and v_offer.owner_id <> v_actor) then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if v_offer.owner_id = v_actor then
    perform private.fail('FORBIDDEN', 403);
  end if;
  if v_offer.status <> 'active' then
    perform private.fail('NOT_FOUND', 404);
  end if;
  if p_kind = 'save' then
    select count(*) into v_count from public.offer_saves s where s.member_id = v_actor;
    if v_count >= private.mark_limit()
      and not exists (select 1 from public.offer_saves s where s.member_id = v_actor and s.offer_id = p_offer_id)
    then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'limit_reached'));
    end if;
    insert into public.offer_saves (member_id, offer_id) values (v_actor, p_offer_id) on conflict do nothing;
  else
    select count(*) into v_count from public.offer_likes l where l.member_id = v_actor;
    if v_count >= private.mark_limit()
      and not exists (select 1 from public.offer_likes l where l.member_id = v_actor and l.offer_id = p_offer_id)
    then
      perform private.fail('CONFLICT', 409, jsonb_build_object('reason', 'limit_reached'));
    end if;
    insert into public.offer_likes (member_id, offer_id) values (v_actor, p_offer_id) on conflict do nothing;
  end if;
  return jsonb_build_object('offer_id', p_offer_id, 'on', true);
end;
$$;

create function public.offer_set_saved(p_offer_id uuid, p_saved boolean) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.set_offer_mark('save', p_offer_id, p_saved) $$;

create function public.offer_set_liked(p_offer_id uuid, p_liked boolean) returns jsonb
language sql security definer
set search_path = ''
as $$ select private.set_offer_mark('like', p_offer_id, p_liked) $$;

revoke execute on all functions in schema private from public, anon, authenticated;
revoke execute on function public.offer_set_saved(uuid, boolean), public.offer_set_liked(uuid, boolean) from public, anon;
grant execute on function public.offer_set_saved(uuid, boolean), public.offer_set_liked(uuid, boolean) to authenticated;
