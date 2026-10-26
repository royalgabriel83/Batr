-- Milestone 7: keeping contact details in BATR
-- (specs/milestone-7-contact-details.md, C1–C9 as approved by the owner
-- on 2026-10-23).
--
-- One check, private.contact_check, run by triggers on every table that
-- holds text a member writes for another member to read, so no function
-- or route skips it. High-confidence contact details are refused with
-- CONTACT_DETAILS (422) and nothing is saved. Ambiguous text is saved;
-- the API asks contact_warning for the sender's warning. Attempts are
-- counted in private.contact_attempts without the text (C6), and the
-- third refusal in 24 hours opens an automatic report (C7).

-- C3: digit words, separators between digits, "at" and "dot".
create function private.contact_normalise(p_text text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := lower(normalize(coalesce(p_text, ''), NFKC));
  v_words text[] := array['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
  i integer;
begin
  for i in 1 .. 10 loop
    v := regexp_replace(v, '\m' || v_words[i] || '\M', (i - 1)::text, 'g');
  end loop;
  -- "oh" or "o" between digits is a zero.
  v := regexp_replace(v, '(\d)[\s.\-]*(?:oh|o)(?=[\s.\-]*\d)', '\10', 'g');
  v := regexp_replace(v, '(\d)[\s.\-]*(?:oh|o)(?=[\s.\-]*\d)', '\10', 'g');
  -- Spaces, dots, dashes, brackets, slashes and underscores between digits.
  v := regexp_replace(v, '(\d)[\s.\-()/_\\]+(?=[(+]?\d)', '\1', 'g');
  v := regexp_replace(v, '(\d)[\s.\-()/_\\]+(?=[(+]?\d)', '\1', 'g');
  -- "dot" before a common ending, and "at" before a domain.
  v := regexp_replace(v, '\s*[(\[{]?\s*dot\s*[)\]}]?\s*(?=(com|ng|net|org|co|io|me|info|edu|uk)\M)', '.', 'g');
  -- Spaces around a dot before a common ending ("hotmail . com").
  v := regexp_replace(v, '([a-z0-9])\s*\.\s+(?=(com|ng|net|org|co|io|me|info|edu|uk)\M)', '\1.', 'g');
  v := regexp_replace(v, '([a-z0-9])\s+\.\s*(?=(com|ng|net|org|co|io|me|info|edu|uk)\M)', '\1.', 'g');
  v := regexp_replace(v, '\s*[(\[{]\s*at\s*[)\]}]\s*', '@', 'g');
  -- A plain "at" only before a mail provider, so "same price at
  -- jumia.com" stays ordinary.
  v := regexp_replace(v, '\s+at\s+(?=(gmail|googlemail|yahoo|ymail|hotmail|outlook|live|icloud|me|aol|proton|protonmail)\.)', '@', 'g');
  -- Spaces around @ only when a domain follows, so "@handle" stays a handle.
  v := regexp_replace(v, '([a-z0-9._%+\-])\s*@\s*(?=[a-z0-9\-]+(\.[a-z0-9\-]+)*\.(com|ng|net|org|co|io|me|info|edu|uk)\M)', '\1@', 'g');
  return v;
end;
$$;

-- C2 and C4: 'link', 'email' or 'phone' (high confidence), 'ambiguous'
-- or 'none'.
create function private.contact_check(p_text text) returns text
language plpgsql immutable
set search_path = ''
as $$
declare
  v text := private.contact_normalise(p_text);
  v_run integer;
begin
  if v ~ '(wa\.me|whatsapp\.com|chat\.whatsapp|api\.whatsapp|t\.me/|telegram\.(me|org|dog)|signal\.(me|group)|instagram\.com|instagr\.am|facebook\.com|fb\.(me|com)|m\.me/|tiktok\.com|snapchat\.com|twitter\.com|\mx\.com/)' then
    return 'link';
  end if;
  if v ~ '[a-z0-9._%+\-]+@[a-z0-9\-]+(\.[a-z0-9\-]+)*\.[a-z]{2,}' then
    return 'email';
  end if;
  -- A Nigerian mobile number (with 0, 234 or no prefix), or any run of
  -- 12 or more digits. Other runs of 7 to 11 digits (sizes in a row,
  -- dates, big amounts) are only ambiguous.
  if exists (select 1 from regexp_matches(v, '(\d+)', 'g') as m
             where m[1] ~ '^(0|234)?[789][01]\d{8}$' or char_length(m[1]) >= 12) then
    return 'phone';
  end if;
  select coalesce(max(char_length(m[1])), 0) into v_run from regexp_matches(v, '(\d+)', 'g') as m;
  if v_run between 7 and 11
     or v ~ '(^|[^a-z0-9.])@[a-z0-9_.]{2,}'
     or v ~ '(https?://|www\.|\m[a-z0-9\-]+\.(com|ng|net|org|io|co|me|info)\M)' then
    return 'ambiguous';
  end if;
  return 'none';
end;
$$;

-- C6: one row per refused or warned attempt; never the text or the
-- matched detail. Kept 180 days (contact_attempts_purge).
create table private.contact_attempts (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.profiles (id) on delete cascade,
  location text not null check (location in ('message', 'note', 'terms', 'reason', 'offer', 'display_name')),
  kind text not null check (kind in ('phone', 'email', 'link', 'ambiguous')),
  outcome text not null check (outcome in ('refused', 'warned')),
  created_at timestamptz not null default now()
);

create index contact_attempts_recent on private.contact_attempts (member_id, created_at) where outcome = 'refused';
revoke all on private.contact_attempts from public, anon, authenticated;

-- C7: automatic reports. They have no reporter and a reason members
-- can't choose.
alter table public.reports alter column reporter_id drop not null;
alter table public.reports drop constraint reports_reason_check;
alter table public.reports add constraint reports_reason_check
  check (reason = any (private.report_reasons()) or (reason = 'contact_details' and reporter_id is null));
alter table public.reports add constraint reports_automatic_reason
  check (reporter_id is not null or reason = 'contact_details');
create unique index reports_one_open_automatic on public.reports (member_id, reason)
  where status = 'open' and reporter_id is null;

create function private.contact_attempts_limit() returns integer
language sql immutable
set search_path = ''
as $$ select 3 $$;

-- The trigger behind every write (C1, C9). Arguments name the columns
-- to check; on update only changed columns are checked. Terms (gives
-- and gets) are checked item by item.
create function private.contact_details_guard() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  v_column text;
  v_text text;
  v_kind text;
  v_location text;
begin
  if tg_table_name = 'messages' and v_new ->> 'kind' <> 'text' then
    return new;
  end if;
  foreach v_column in array tg_argv loop
    if v_old is not null and v_old -> v_column is not distinct from v_new -> v_column then
      continue;
    end if;
    if v_column in ('gives', 'gets') then
      select string_agg(i ->> 'description', E'\n') into v_text
      from jsonb_array_elements(v_new -> v_column) i where i ->> 'kind' = 'text';
    else
      v_text := v_new ->> v_column;
    end if;
    v_kind := private.contact_check(v_text);
    if v_kind in ('phone', 'email', 'link') then
      if tg_table_name = 'profiles' and tg_op = 'INSERT' then
        -- A name from sign-up is dropped, not refused, so sign-up works;
        -- the member is asked for a name later.
        new.display_name := null;
        return new;
      end if;
      v_location := case
        when tg_table_name = 'messages' then 'message'
        when tg_table_name = 'offers' then 'offer'
        when tg_table_name = 'profiles' then 'display_name'
        when tg_table_name = 'cancellation_requests' then 'reason'
        when v_column in ('gives', 'gets') then 'terms'
        else 'note' end;
      perform private.fail('CONTACT_DETAILS', 422, jsonb_build_object(
        'kind', v_kind,
        'field', case when v_column in ('gives', 'gets') then 'terms' else v_column end,
        'location', v_location));
    end if;
  end loop;
  return new;
end;
$$;

create trigger messages_contact_details before insert or update on public.messages
for each row execute function private.contact_details_guard('body');
create trigger proposal_revisions_contact_details before insert or update on public.proposal_revisions
for each row execute function private.contact_details_guard('note', 'gives', 'gets');
create trigger agreement_versions_contact_details before insert or update on public.agreement_versions
for each row execute function private.contact_details_guard('note', 'gives', 'gets');
create trigger cancellation_requests_contact_details before insert or update on public.cancellation_requests
for each row execute function private.contact_details_guard('reason');
create trigger offers_contact_details before insert or update on public.offers
for each row execute function private.contact_details_guard('title', 'description', 'offering_text', 'wants_text');
create trigger profiles_contact_details before insert or update on public.profiles
for each row execute function private.contact_details_guard('display_name');

-- Called by the API after a CONTACT_DETAILS refusal (the refusal itself
-- rolls back everything in its transaction). Records the attempt and,
-- on the third refusal in 24 hours, opens one automatic report (C7).
-- A member calling it directly can only count against themselves.
create function public.contact_attempt_record(p_location text, p_kind text) returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_recent jsonb;
begin
  if p_location not in ('message', 'note', 'terms', 'reason', 'offer', 'display_name')
     or p_kind not in ('phone', 'email', 'link') then
    perform private.fail('VALIDATION_FAILED', 422);
  end if;
  insert into private.contact_attempts (member_id, location, kind, outcome)
  values (v_actor, p_location, p_kind, 'refused');
  select jsonb_object_agg(a.kind, a.n) into v_recent
  from (select c.kind, count(*) as n from private.contact_attempts c
        where c.member_id = v_actor and c.outcome = 'refused' and c.created_at > now() - interval '24 hours'
        group by c.kind) a;
  if (select sum(value::integer) from jsonb_each_text(v_recent)) >= private.contact_attempts_limit() then
    insert into public.reports (reporter_id, subject_type, member_id, reason, details)
    values (null, 'member', v_actor, 'contact_details',
            'Refused attempts to share contact details in the last 24 hours: '
            || (select string_agg(key || ' ' || value, ', ' order by key) from jsonb_each_text(v_recent)) || '.')
    on conflict do nothing;
  end if;
end;
$$;

-- C4: the check for a saved text, so the API can warn the sender. An
-- ambiguous result is counted.
create function public.contact_warning(p_location text, p_text text) returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.require_actor();
  v_kind text := private.contact_check(p_text);
begin
  if v_kind = 'ambiguous' and p_location in ('message', 'note', 'terms', 'reason', 'offer', 'display_name') then
    insert into private.contact_attempts (member_id, location, kind, outcome)
    values (v_actor, p_location, 'ambiguous', 'warned');
  end if;
  return v_kind;
end;
$$;

-- C6: 180 days, from the storage-cleanup job.
create function public.contact_attempts_purge() returns integer
language sql security definer
set search_path = ''
as $$
  with removed as (delete from private.contact_attempts c where c.created_at <= now() - interval '180 days' returning 1)
  select count(*)::integer from removed
$$;

-- Automatic reports read "BATR (automatic check)" to moderators.
create or replace function private.moderation_summary_json(p_report public.reports) returns jsonb
language sql stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_report.id,
    'subject_type', p_report.subject_type,
    'label', private.report_label(p_report),
    'reason', p_report.reason,
    'details', p_report.details,
    'status', p_report.status,
    'reporter_name', case when p_report.reporter_id is null then 'BATR (automatic check)' else private.display_name(p_report.reporter_id) end,
    'automatic', p_report.reporter_id is null,
    'member_name', private.display_name(p_report.member_id),
    'created_at', p_report.created_at,
    'reviewed_at', p_report.reviewed_at)
$$;

revoke execute on function private.contact_normalise(text), private.contact_check(text),
  private.contact_details_guard(), private.contact_attempts_limit()
from public, anon, authenticated;
revoke execute on function public.contact_attempt_record(text, text), public.contact_warning(text, text),
  public.contact_attempts_purge()
from public, anon;
grant execute on function public.contact_attempt_record(text, text), public.contact_warning(text, text) to authenticated;
revoke execute on function public.contact_attempts_purge() from authenticated;
grant execute on function public.contact_attempts_purge() to service_role;
