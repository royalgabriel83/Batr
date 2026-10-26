-- Milestone 1, unit 04: offer tables, reference data and commit-time
-- checks. Rules come from specs/milestone-1.md (Data, Validation,
-- Concurrency) and specs/state-model.md §1–2. The reference tables
-- below mirror packages/shared; supabase/tests/parity.db.test.ts keeps
-- them identical.

create schema private;
revoke all on schema private from public, anon, authenticated;

-- Whitespace at either end is trimmed before storage (unit 03 rule).
create function private.trim_text(value text) returns text
language sql immutable strict
set search_path = ''
as $$ select regexp_replace(value, '^\s+|\s+$', '', 'g') $$;

-- Reference data ----------------------------------------------------

create type public.offer_status as enum ('draft', 'active', 'paused', 'closed');

create table private.offer_categories (id text primary key);
insert into private.offer_categories (id) values
  ('electronics'), ('clothing_accessories'), ('home_garden'), ('books_media'),
  ('sports_outdoors'), ('baby_kids'), ('other');

create table private.offer_conditions (id text primary key);
insert into private.offer_conditions (id) values ('new'), ('like_new'), ('good'), ('fair');

-- The allowed-transition table (state-model.md §2). `from_status` null
-- means the offer does not exist yet; `to_status` null means removed.
create table private.offer_transitions (
  action text not null,
  from_status public.offer_status,
  to_status public.offer_status,
  constraint offer_transitions_unique unique nulls not distinct (action, from_status)
);
insert into private.offer_transitions (action, from_status, to_status) values
  ('create', null, 'draft'),
  ('edit', 'draft', 'draft'),
  ('edit', 'active', 'active'),
  ('edit', 'paused', 'paused'),
  ('publish', 'draft', 'active'),
  ('pause', 'active', 'paused'),
  ('resume', 'paused', 'active'),
  ('close', 'active', 'closed'),
  ('close', 'paused', 'closed'),
  ('delete', 'draft', null);

-- Field classification (milestone-1.md, Offer fields: three groups).
create table private.offer_field_groups (
  field text primary key,
  field_group text not null check (field_group in ('material', 'preference', 'discovery'))
);
insert into private.offer_field_groups (field, field_group) values
  ('title', 'material'),
  ('description', 'material'),
  ('condition', 'material'),
  ('offering_text', 'material'),
  ('photo_set', 'material'),
  ('wants_text', 'preference'),
  ('category', 'discovery'),
  ('photo_order', 'discovery'),
  ('photo_alt_text', 'discovery');

-- Members -----------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (
    display_name is null
    or (char_length(display_name) between 2 and 40 and display_name = private.trim_text(display_name))
  ),
  created_at timestamptz not null default now()
);

-- Every new account gets a profile. The display name comes from sign-up
-- metadata when it is valid; otherwise it is set later (unit 05).
create function private.create_profile_for_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_name text := private.trim_text(new.raw_user_meta_data ->> 'display_name');
begin
  insert into public.profiles (id, display_name)
  values (new.id, case when char_length(v_name) between 2 and 40 then v_name end);
  return new;
end;
$$;

create trigger create_profile_for_new_user
after insert on auth.users
for each row execute function private.create_profile_for_new_user();

-- Offers ------------------------------------------------------------

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 80 and title = private.trim_text(title)),
  description text not null default ''
    check (char_length(description) <= 2000 and description = private.trim_text(description)),
  category text references private.offer_categories (id),
  condition text references private.offer_conditions (id),
  offering_text text not null default ''
    check (char_length(offering_text) <= 200 and offering_text = private.trim_text(offering_text)),
  wants_text text not null default ''
    check (char_length(wants_text) <= 200 and wants_text = private.trim_text(wants_text)),
  status public.offer_status not null default 'draft',
  content_version integer not null default 1 check (content_version >= 1),
  revision integer not null default 1 check (revision >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  closed_at timestamptz
);

create index offers_marketplace on public.offers (published_at desc, id desc) where status = 'active';
create index offers_by_owner on public.offers (owner_id, updated_at desc);

create table public.offer_photos (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references public.offers (id) on delete cascade,
  display_path text not null unique,
  thumb_path text not null unique,
  position smallint not null check (position between 1 and 8),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt_text text not null default '' check (char_length(alt_text) <= 200 and alt_text = private.trim_text(alt_text)),
  created_at timestamptz not null default now(),
  -- Checked at commit, so a reorder can swap positions in one statement.
  constraint offer_photos_position_unique unique (offer_id, position) deferrable initially deferred,
  -- {owner_id}/{offer_id}/{photo_id}-{display|thumb}.webp
  constraint offer_photos_paths check (
    display_path ~ ('^[0-9a-f-]{36}/' || offer_id || '/' || id || '-display\.webp$')
    and thumb_path ~ ('^[0-9a-f-]{36}/' || offer_id || '/' || id || '-thumb\.webp$')
    and split_part(display_path, '/', 1) = split_part(thumb_path, '/', 1)
  )
);

create index offer_photos_by_offer on public.offer_photos (offer_id, position);

-- Audit, idempotency and cleanup ------------------------------------

-- `entity_id` has no foreign key, so a draft's delete event survives
-- the offer row. No offer content is copied here.
create table public.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  entity_type text not null check (entity_type in ('offer')),
  entity_id uuid not null,
  action text not null,
  from_state public.offer_status,
  to_state public.offer_status,
  content_version integer not null,
  revision integer not null,
  created_at timestamptz not null default now()
);

create index audit_events_by_entity on public.audit_events (entity_id, id);
create index audit_events_by_actor on public.audit_events (actor_id, id);

create table private.idempotency_keys (
  actor_id uuid not null,
  key uuid not null,
  endpoint text not null,
  resource_id uuid,
  request_hash text not null,
  response_status smallint,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  primary key (actor_id, key)
);

create index idempotency_keys_expiry on private.idempotency_keys (expires_at);

create table private.storage_cleanup_queue (
  id bigint generated always as identity primary key,
  path text not null,
  reason text not null check (reason in ('photo_removed', 'draft_deleted', 'upload_abandoned', 'upload_replayed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now()
);

-- Publish rules (milestone-1.md, Validation) --------------------------

-- Names of the fields that fail the publish rules. Same limits as
-- packages/shared (checkOfferFields with "publish").
create function private.publish_rule_failures(
  p_title text, p_category text, p_condition text, p_offering_text text, p_wants_text text, p_photo_count integer
) returns text[]
language sql immutable
set search_path = ''
as $$
  select array_remove(array[
    case when coalesce(char_length(p_title), 0) < 5 then 'title' end,
    case when p_category is null then 'category' end,
    case when p_condition is null then 'condition' end,
    case when coalesce(char_length(p_offering_text), 0) < 3 then 'offering_text' end,
    case when coalesce(char_length(p_wants_text), 0) < 3 then 'wants_text' end,
    case when p_photo_count not between 1 and 8 then 'photos' end
  ], null)
$$;

create function private.offer_publish_failures(p_offer_id uuid) returns text[]
language sql stable
set search_path = ''
as $$
  select private.publish_rule_failures(
    o.title, o.category, o.condition, o.offering_text, o.wants_text,
    (select count(*)::integer from public.offer_photos p where p.offer_id = o.id)
  )
  from public.offers o
  where o.id = p_offer_id
$$;

-- Commit-time backstops (milestone-1.md, Concurrency 4) ----------------
-- These hold even if a write function has a bug or a row is written
-- directly by the database owner. They run at COMMIT as the caller's
-- role, so they are security definer to read the private tables.

create function private.check_offer_status_change() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (
      select 1 from private.offer_transitions t where t.from_status is null and t.to_status = new.status
    ) then
      raise exception using errcode = '23514', message = format('A new offer must start as draft, not %s.', new.status);
    end if;
  elsif new.status is distinct from old.status and not exists (
    select 1 from private.offer_transitions t where t.from_status = old.status and t.to_status = new.status
  ) then
    raise exception using errcode = '23514', message = format('Offer status change %s -> %s is not allowed.', old.status, new.status);
  end if;
  return null;
end;
$$;

create constraint trigger offers_status_change_allowed
after insert or update of status on public.offers
deferrable initially deferred
for each row execute function private.check_offer_status_change();

create function private.check_offer_valid_at_commit() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_offer_id uuid := (coalesce(to_jsonb(new), to_jsonb(old)) ->> case when tg_table_name = 'offers' then 'id' else 'offer_id' end)::uuid;
  v_status public.offer_status;
  v_failures text[];
begin
  select o.status into v_status from public.offers o where o.id = v_offer_id;
  if not found then
    return null; -- the offer was deleted in this transaction
  end if;
  if exists (
    select 1
    from (select p.position, row_number() over (order by p.position) as expected from public.offer_photos p where p.offer_id = v_offer_id) s
    where s.position <> s.expected
  ) then
    raise exception using errcode = '23514', message = format('Photo positions of offer %s are not 1..n.', v_offer_id);
  end if;
  if v_status in ('active', 'paused') then
    v_failures := private.offer_publish_failures(v_offer_id);
    if cardinality(v_failures) > 0 then
      raise exception using errcode = '23514',
        message = format('Offer %s is %s but fails the publish rules: %s.', v_offer_id, v_status, array_to_string(v_failures, ', '));
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger offers_valid_at_commit
after insert or update on public.offers
deferrable initially deferred
for each row execute function private.check_offer_valid_at_commit();

create constraint trigger offer_photos_valid_at_commit
after insert or update or delete on public.offer_photos
deferrable initially deferred
for each row execute function private.check_offer_valid_at_commit();

-- Row-level security: members read through policies and write only
-- through the functions in the next migration.

alter table public.profiles enable row level security;
alter table public.offers enable row level security;
alter table public.offer_photos enable row level security;
alter table public.audit_events enable row level security;
alter table private.idempotency_keys enable row level security;
alter table private.storage_cleanup_queue enable row level security;
alter table private.offer_categories enable row level security;
alter table private.offer_conditions enable row level security;
alter table private.offer_transitions enable row level security;
alter table private.offer_field_groups enable row level security;

revoke insert, update, delete, truncate, references, trigger
  on public.profiles, public.offers, public.offer_photos, public.audit_events
  from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;

-- Anyone may read an active offer; other states only their owner.
create policy "offers: active, or own" on public.offers
for select to anon, authenticated
using (status = 'active' or owner_id = (select auth.uid()));

-- A photo row is visible exactly when its offer is (the offers policy
-- applies inside the subquery).
create policy "offer photos: when the offer is readable" on public.offer_photos
for select to anon, authenticated
using (exists (select 1 from public.offers o where o.id = offer_photos.offer_id));

-- Own profile, or the owner of an active offer (display name and
-- "Member since" on public pages).
create policy "profiles: own, or owner of an active offer" on public.profiles
for select to anon, authenticated
using (
  id = (select auth.uid())
  or exists (select 1 from public.offers o where o.owner_id = profiles.id and o.status = 'active')
);

create policy "audit events: own actions" on public.audit_events
for select to authenticated
using (actor_id = (select auth.uid()));

revoke execute on all functions in schema private from public, anon, authenticated;
