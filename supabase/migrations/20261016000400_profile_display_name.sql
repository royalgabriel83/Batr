-- Unit 05: display-name rules in the database, and the one write path
-- members use to change their own display name. The rules mirror
-- packages/shared/src/auth/schemas.ts (DisplayNameSchema); the parity
-- test in supabase/tests/parity.db.test.ts compares them.

-- Must equal DISPLAY_NAME_LINK_PATTERN in packages/shared.
create function private.display_name_link_pattern() returns text
language sql immutable
set search_path = ''
as $$ select '(https?:|://|www\.|\.(com|net|org|io|co|uk|app|dev|xyz|info|me|ly|gg|link|shop|site|online)([^a-z0-9]|$))' $$;

-- True for an already-trimmed name that passes every rule.
create function private.valid_display_name(p_name text) returns boolean
language sql immutable
set search_path = ''
as $$
  select p_name is not null
    and p_name = private.trim_text(p_name)
    and char_length(p_name) between 2 and 40
    and p_name !~* private.display_name_link_pattern()
$$;

alter table public.profiles drop constraint profiles_display_name_check;
alter table public.profiles add constraint profiles_display_name_check
  check (display_name is null or private.valid_display_name(display_name));

-- Sign-up metadata is client-supplied: an invalid name is dropped and
-- the member is asked for one on their account page.
create or replace function private.create_profile_for_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := private.trim_text(new.raw_user_meta_data ->> 'display_name');
begin
  insert into public.profiles (id, display_name)
  values (new.id, case when private.valid_display_name(v_name) then v_name end);
  return new;
end;
$$;

-- Sets the caller's own display name. Setting the same name twice has
-- the same result, so no idempotency key is needed.
create function public.profile_set_display_name(p_display_name text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_name text := private.trim_text(p_display_name);
  v_profile public.profiles;
begin
  if not coalesce(private.valid_display_name(v_name), false) then
    perform private.fail('VALIDATION_FAILED', 422, jsonb_build_object('fields', jsonb_build_object('display_name', 'invalid')));
  end if;
  update public.profiles set display_name = v_name where id = v_actor returning * into v_profile;
  if not found then
    perform private.fail('NOT_FOUND', 404);
  end if;
  return jsonb_build_object('id', v_profile.id, 'display_name', v_profile.display_name);
end;
$$;

revoke execute on function private.display_name_link_pattern(), private.valid_display_name(text)
  from public, anon, authenticated;
revoke execute on function public.profile_set_display_name(text) from public, anon;
grant execute on function public.profile_set_display_name(text) to authenticated;
