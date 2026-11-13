-- Consent logging, the "every booking" agreement checkboxes, and the additional-animal charge.
--
-- WHAT THIS ADDS
--  * porchlight_legal_docs      one row per published version of each agreement (fingerprint = SHA-256 of its text).
--  * porchlight_consents        an append-only record of every box a person checked: who, which document and version,
--                               the words next to the box, when, from what IP address and browser, and for which booking.
--  * porchlight_book_with_consent / porchlight_submit_intake_consent / porchlight_apply_sitter_consent
--                               the front end calls these instead of the original functions. They do the original job
--                               AND save the consents in the same transaction, so there is never a booking without a record.
--  * porchlight_consent_status  tells the portal which agreements a signed-in person still needs to accept.
--  * Additional animals         every animal in the home beyond the first is charged per night on overnights, and on
--                               walks/drop-ins/check-ins only when it needs care from us. Fish and reptiles that need
--                               no care are never charged (porchlight_pay_settings.extra_animal_cents, default $5),
--                               see policy "Animals in the Home".
--
-- ORDER: apply this, then 20261118_legal_doc_versions.sql (generated), then deploy the site, then 20261119_require_consent.sql.

-- ---------------------------------------------------------------- legal documents

create table if not exists public.porchlight_legal_docs (
  doc_key text not null,
  version text not null,
  title text not null,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  url text not null,
  published_at timestamptz not null default now(),
  primary key (doc_key, version)
);
alter table public.porchlight_legal_docs enable row level security;
revoke all on public.porchlight_legal_docs from anon, authenticated;
grant select on public.porchlight_legal_docs to anon, authenticated;
drop policy if exists "anyone reads legal docs" on public.porchlight_legal_docs;
create policy "anyone reads legal docs" on public.porchlight_legal_docs for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- consents (append only)

create table if not exists public.porchlight_consents (
  id uuid primary key default gen_random_uuid(),
  accepted_at timestamptz not null default now(),
  email text not null,
  context text not null check (context in ('intake', 'booking', 'sitter_application', 'portal')),
  doc_key text not null,
  doc_version text not null,
  doc_sha256 text not null,
  checkbox_text text not null,
  details jsonb not null default '{}'::jsonb,
  booking_group_id uuid,
  client_id uuid,
  sitter_id uuid,
  user_id uuid,
  ip inet,
  user_agent text,
  foreign key (doc_key, doc_version) references public.porchlight_legal_docs (doc_key, version)
);
create index if not exists porchlight_consents_email_idx on public.porchlight_consents (lower(email), doc_key, accepted_at desc);
create index if not exists porchlight_consents_group_idx on public.porchlight_consents (booking_group_id) where booking_group_id is not null;

alter table public.porchlight_consents enable row level security;
revoke all on public.porchlight_consents from anon, authenticated;
grant select on public.porchlight_consents to authenticated;
drop policy if exists "staff read consents" on public.porchlight_consents;
create policy "staff read consents" on public.porchlight_consents for select to authenticated using (public.porchlight_is_staff());
drop policy if exists "people read own consents" on public.porchlight_consents;
create policy "people read own consents" on public.porchlight_consents for select to authenticated
  using (public.porchlight_my_email() <> '' and lower(email) = public.porchlight_my_email());

-- Nobody edits or deletes a consent record. (To remove personal data, staff use a documented process.)
create or replace function public.porchlight_consents_immutable() returns trigger language plpgsql as $$
begin raise exception 'Consent records cannot be changed or deleted.'; end $$;
drop trigger if exists porchlight_consents_no_change on public.porchlight_consents;
create trigger porchlight_consents_no_change before update or delete on public.porchlight_consents
  for each row execute function public.porchlight_consents_immutable();

-- ---------------------------------------------------------------- booking columns and the extra-animal rate

alter table public.porchlight_pay_settings add column if not exists extra_animal_cents int not null default 500 check (extra_animal_cents between 0 and 5000);

alter table public.porchlight_bookings add column if not exists animals_in_home int check (animals_in_home between 0 and 30);
alter table public.porchlight_bookings add column if not exists animals_note text;
alter table public.porchlight_bookings add column if not exists animals_no_care_fr int check (animals_no_care_fr between 0 and 30);
alter table public.porchlight_bookings add column if not exists animals_extra_care boolean;
alter table public.porchlight_bookings add column if not exists extra_animal_cents int not null default 0 check (extra_animal_cents >= 0);
alter table public.porchlight_bookings add column if not exists cameras_status text check (cameras_status in ('none', 'disclosed'));
alter table public.porchlight_bookings add column if not exists cameras_note text;
alter table public.porchlight_bookings add column if not exists people_in_home text;

-- The booking page shows the additional-animal rate before anyone signs in.
create or replace function public.porchlight_public_rates()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('extra_animal_cents', coalesce((select extra_animal_cents from public.porchlight_pay_settings where id = 'main'), 500))
$$;
revoke all on function public.porchlight_public_rates() from public;
grant execute on function public.porchlight_public_rates() to anon, authenticated;

-- ---------------------------------------------------------------- which documents each role must accept

create or replace function public.porchlight_required_docs(p_role text)
returns text[] language sql immutable as $$
  select case p_role
    when 'owner'  then array['terms', 'privacy', 'owner', 'animals', 'home-safety']
    when 'sitter' then array['terms', 'privacy', 'sitter', 'animals', 'home-safety', 'overnight']
    when 'booking' then array['terms', 'privacy', 'owner', 'animals', 'home-safety']
    when 'sitter_application' then array['terms', 'privacy', 'bgcheck']
    else array[]::text[] end
$$;

-- Services where the sitter is inside the home. Overnight stays always charge for each additional animal.
-- Walks, drop-ins and home check-ins charge for an additional animal only when it needs a service from the sitter
-- (feeding, water, litter, medication, letting out). Fish and reptiles that need no care are never charged.
create or replace function public.porchlight_extra_animal_services()
returns text[] language sql immutable as $$ select array['walk', 'visit', 'overnight', 'home'] $$;

-- ---------------------------------------------------------------- core recorder (not callable from the web)

create or replace function public.porchlight_record_consents_core(
  p_email text, p_context text, p_items jsonb, p_group uuid, p_details jsonb,
  p_client uuid, p_sitter uuid, p_user uuid)
returns int
language plpgsql security definer set search_path to 'public' as $$
declare
  it jsonb; d public.porchlight_legal_docs; n int := 0;
  v_email text := lower(trim(coalesce(p_email, '')));
  hdr json; ip_txt text; v_ip inet; ua text; seen text[] := '{}';
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please check the email address'; end if;
  if p_context not in ('intake', 'booking', 'sitter_application', 'portal') then raise exception 'Unknown context'; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 12 then
    raise exception 'Please check the agreement boxes to continue';
  end if;
  if (select count(*) from public.porchlight_consents where lower(email) = v_email and accepted_at > now() - interval '1 hour') > 200 then
    raise exception 'Too many requests. Please try again shortly.';
  end if;

  begin hdr := current_setting('request.headers', true)::json; exception when others then hdr := null; end;
  ip_txt := trim(split_part(coalesce(hdr->>'x-forwarded-for', hdr->>'cf-connecting-ip', hdr->>'x-real-ip', ''), ',', 1));
  begin v_ip := nullif(ip_txt, '')::inet; exception when others then v_ip := null; end;
  ua := nullif(left(coalesce(hdr->>'user-agent', ''), 300), '');

  for it in select * from jsonb_array_elements(p_items) loop
    if it->>'doc_key' = any (seen) then continue; end if;
    select * into d from public.porchlight_legal_docs where doc_key = it->>'doc_key' order by published_at desc, version desc limit 1;
    if not found then raise exception 'Unknown document'; end if;
    -- Only the current version can be accepted, and only if the person was shown that exact text.
    if d.version <> coalesce(it->>'version', '') or d.sha256 <> coalesce(it->>'sha256', '') then
      raise exception 'The % was updated. Please reload the page and review it again.', d.title;
    end if;
    if length(trim(coalesce(it->>'text', ''))) < 10 or length(it->>'text') > 1000 then raise exception 'Please check the agreement boxes to continue'; end if;
    insert into public.porchlight_consents
      (email, context, doc_key, doc_version, doc_sha256, checkbox_text, details, booking_group_id, client_id, sitter_id, user_id, ip, user_agent)
    values (v_email, p_context, d.doc_key, d.version, d.sha256, trim(it->>'text'), coalesce(p_details, '{}'::jsonb),
            p_group, p_client, p_sitter, p_user, v_ip, ua);
    seen := seen || d.doc_key;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.porchlight_record_consents_core(text, text, jsonb, uuid, jsonb, uuid, uuid, uuid) from public, anon, authenticated;

-- Errors if the checked boxes do not cover every document in the list.
create or replace function public.porchlight_assert_docs(p_items jsonb, p_required text[])
returns void language plpgsql immutable as $$
declare k text;
begin
  foreach k in array p_required loop
    if not exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) x where x->>'doc_key' = k) then
      raise exception 'Please check the agreement boxes to continue';
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------- signed-in people accept or re-accept documents

create or replace function public.porchlight_record_consents(p_items jsonb, p_details jsonb default '{}'::jsonb)
returns int language plpgsql security definer set search_path to 'public' as $$
declare e text := public.porchlight_my_email();
begin
  if coalesce(e, '') = '' then raise exception 'Please sign in first'; end if;
  return public.porchlight_record_consents_core(e, 'portal', p_items, null, p_details,
    (select id from public.porchlight_clients where lower(email) = e limit 1), public.porchlight_my_sitter_id(), auth.uid());
end $$;
revoke all on function public.porchlight_record_consents(jsonb, jsonb) from public, anon;
grant execute on function public.porchlight_record_consents(jsonb, jsonb) to authenticated;

-- What does this signed-in person still have to accept? (latest version of each required document)
create or replace function public.porchlight_consent_status()
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare
  e text := public.porchlight_my_email();
  is_client boolean; is_sitter boolean; need text[] := '{}';
begin
  if coalesce(e, '') = '' then return jsonb_build_object('roles', '[]'::jsonb, 'missing', '[]'::jsonb); end if;
  is_client := exists (select 1 from public.porchlight_clients where lower(email) = e);
  is_sitter := public.porchlight_my_sitter_id() is not null;
  if is_client then need := need || public.porchlight_required_docs('owner'); end if;
  if is_sitter then need := need || public.porchlight_required_docs('sitter'); end if;
  return jsonb_build_object(
    'roles', to_jsonb(array_remove(array[case when is_client then 'owner' end, case when is_sitter then 'sitter' end], null)),
    'missing', coalesce((
      select jsonb_agg(jsonb_build_object('doc_key', d.doc_key, 'title', d.title, 'version', d.version, 'sha256', d.sha256, 'url', d.url) order by d.doc_key)
        from (select distinct on (doc_key) * from public.porchlight_legal_docs
               where doc_key = any (need) order by doc_key, published_at desc, version desc) d
       where not exists (select 1 from public.porchlight_consents c
                          where lower(c.email) = e and c.doc_key = d.doc_key and c.doc_version = d.version)), '[]'::jsonb));
end $$;
revoke all on function public.porchlight_consent_status() from public, anon;
grant execute on function public.porchlight_consent_status() to authenticated;

-- ---------------------------------------------------------------- new client form

create or replace function public.porchlight_submit_intake_consent(p jsonb, p_consents jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  perform public.porchlight_assert_docs(p_consents, public.porchlight_required_docs('owner'));
  v_id := public.porchlight_submit_intake(p);
  perform public.porchlight_record_consents_core(p->>'email', 'intake', p_consents, null,
    jsonb_build_object('animals_listed', jsonb_array_length(coalesce(p->'pets', '[]'::jsonb))), v_id, null, null);
  return v_id;
end $$;
revoke all on function public.porchlight_submit_intake_consent(jsonb, jsonb) from public;
grant execute on function public.porchlight_submit_intake_consent(jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- sitter application

create or replace function public.porchlight_apply_sitter_consent(p jsonb, p_consents jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare res jsonb;
begin
  -- A bot that fills the hidden field gets the usual pretend-success from the original function and records nothing.
  if coalesce(trim(p->>'website'), '') <> '' then return public.porchlight_apply_sitter(p); end if;
  perform public.porchlight_assert_docs(p_consents, public.porchlight_required_docs('sitter_application'));
  res := public.porchlight_apply_sitter(p);
  perform public.porchlight_record_consents_core(p->>'email', 'sitter_application', p_consents, null,
    jsonb_build_object('application_id', res->>'id'), null, null, null);
  return res;
end $$;
revoke all on function public.porchlight_apply_sitter_consent(jsonb, jsonb) from public;
grant execute on function public.porchlight_apply_sitter_consent(jsonb, jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- booking: every transaction carries its own acknowledgments

-- p keys: town, items, name, email, phone, address, pets, notes, new_client, lat, lng, dropoff, trip_miles, trip_minutes, tip_cents
--         animals  { total: number of animals in the home (all of them), others: text about animals not being booked }
--         safety   { cameras: 'none' | 'disclosed', camera_notes, no_hidden_cameras: true, people_in_home }   (required for overnights)
--         consents [ { doc_key, version, sha256, text } ... ]
create or replace function public.porchlight_book_with_consent(p jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  res jsonb; gid uuid;
  items jsonb := p->'items';
  v_total int; v_fr int; v_extra int; v_extra_visit int; v_care boolean; v_rate int;
  has_overnight boolean; needs_animals boolean;
  svcs text[] := public.porchlight_extra_animal_services();
  v_cam text; v_cam_note text; v_people text; v_others text;
begin
  if jsonb_typeof(items) is distinct from 'array' or jsonb_array_length(items) = 0 then raise exception 'Pick at least one visit'; end if;
  has_overnight := exists (select 1 from jsonb_array_elements(items) x where x->>'service' = 'overnight');
  needs_animals := exists (select 1 from jsonb_array_elements(items) x where (x->>'service') = any (svcs));

  -- Every booking needs its own checked boxes. Overnights add the overnight terms.
  perform public.porchlight_assert_docs(p->'consents',
    public.porchlight_required_docs('booking') || case when has_overnight then array['overnight'] else array[]::text[] end);

  -- Animal count: every animal in the home, whether or not it is being booked.
  if coalesce(p#>>'{animals,total}', '') !~ '^[0-9]{1,2}$' then raise exception 'Tell us how many animals will be in the home, counting every animal'; end if;
  v_total := (p#>>'{animals,total}')::int;
  if v_total > 30 then raise exception 'That is a lot of animals. Please call us.'; end if;
  if needs_animals and v_total < 1 then raise exception 'Tell us how many animals will be in the home. It is at least one for a visit or stay.'; end if;
  v_others := nullif(left(trim(coalesce(p#>>'{animals,others}', '')), 500), '');
  if v_total > 1 and v_others is null and length(coalesce(p->>'pets', '')) < 2 then
    raise exception 'Please list each animal in the home so your sitter knows who to look for';
  end if;

  -- Overnight attestation about cameras and other people in the home.
  v_cam := nullif(p#>>'{safety,cameras}', '');
  v_cam_note := nullif(left(trim(coalesce(p#>>'{safety,camera_notes}', '')), 500), '');
  v_people := nullif(left(trim(coalesce(p#>>'{safety,people_in_home}', '')), 300), '');
  if has_overnight then
    if v_cam not in ('none', 'disclosed') then raise exception 'Please tell us whether there are any cameras in or around the home'; end if;
    if v_cam = 'disclosed' and v_cam_note is null then raise exception 'Please say where each camera is and what it looks at'; end if;
    if coalesce(p#>>'{safety,no_hidden_cameras}', '') <> 'true' then raise exception 'Please confirm there are no hidden cameras or recording devices'; end if;
  end if;
  if v_cam is not null and v_cam not in ('none', 'disclosed') then v_cam := null; end if;

  -- Fish tanks and reptile enclosures that need no care from us are disclosed but never charged.
  if coalesce(p#>>'{animals,no_care_fr}', '0') !~ '^[0-9]{1,2}$' then raise exception 'Tell us how many fish tanks or reptile enclosures need no care from us'; end if;
  v_fr := coalesce(nullif(p#>>'{animals,no_care_fr}', ''), '0')::int;
  if v_fr > v_total then raise exception 'You listed more fish tanks or reptile enclosures than animals in the home'; end if;
  v_extra := greatest(v_total - v_fr - 1, 0);

  -- On walks, drop-ins and home check-ins, an additional animal is charged only if it needs care from us.
  if exists (select 1 from jsonb_array_elements(items) x where x->>'service' in ('walk', 'visit', 'home')) and v_extra > 0 then
    if jsonb_typeof(p#>'{animals,extra_care}') is distinct from 'boolean' then
      raise exception 'Tell us whether your additional animals need any care from us on walks, drop-ins and check-ins';
    end if;
    v_care := (p#>>'{animals,extra_care}')::boolean;
  else
    v_care := coalesce((p#>>'{animals,extra_care}') = 'true', false);
  end if;
  v_extra_visit := case when v_care then v_extra else 0 end;

  select coalesce(extra_animal_cents, 500) into v_rate from public.porchlight_pay_settings where id = 'main';
  v_rate := coalesce(v_rate, 500);

  res := public.porchlight_request_bookings(
    p_town := p->>'town', p_items := items, p_name := p->>'name', p_email := p->>'email', p_phone := p->>'phone',
    p_address := p->>'address', p_pets := p->>'pets', p_notes := p->>'notes',
    p_new_client := coalesce((p->>'new_client')::boolean, true),
    p_lat := nullif(p->>'lat', '')::float8, p_lng := nullif(p->>'lng', '')::float8,
    p_dropoff := nullif(p->>'dropoff', ''), p_trip_miles := nullif(p->>'trip_miles', '')::numeric,
    p_trip_minutes := nullif(p->>'trip_minutes', '')::int, p_tip_cents := coalesce(nullif(p->>'tip_cents', '')::int, 0));
  gid := (res->>'group_id')::uuid;

  -- Record the animal count and, for in-home services, the additional-animal charge. fare_cents is the amount due
  -- for the visit (the same field the card checkout and the client portal already use), so the extra animals are
  -- billed everywhere the visit is billed.
  update public.porchlight_bookings b
     set animals_in_home = v_total,
         animals_note = v_others,
         animals_no_care_fr = v_fr,
         animals_extra_care = v_care,
         cameras_status = v_cam, cameras_note = v_cam_note, people_in_home = v_people,
         extra_animal_cents = case b.service_id when 'overnight' then v_extra * v_rate when 'walk' then v_extra_visit * v_rate when 'visit' then v_extra_visit * v_rate when 'home' then v_extra_visit * v_rate else 0 end,
         fare_cents = case when b.service_id = any (svcs) and (case when b.service_id = 'overnight' then v_extra else v_extra_visit end) > 0
                           then sv.price_cents + (case when b.service_id = 'overnight' then v_extra else v_extra_visit end) * v_rate
                           else b.fare_cents end
    from public.porchlight_services sv
   where b.group_id = gid and sv.id = b.service_id;

  perform public.porchlight_record_consents_core(p->>'email', 'booking', p->'consents', gid,
    jsonb_build_object('animals_total', v_total, 'fish_reptiles_no_care', v_fr, 'extra_animals', v_extra, 'extra_animals_care_needed_on_visits', v_care,
                       'extra_animal_rate_cents', v_rate,
                       'cameras', v_cam, 'camera_notes', v_cam_note, 'people_in_home', v_people,
                       'no_hidden_cameras', (p#>>'{safety,no_hidden_cameras}') = 'true', 'overnight', has_overnight),
    null, null, null);

  return res || jsonb_build_object('animals_in_home', v_total, 'extra_animals', v_extra, 'extra_animals_visits', v_extra_visit,
    'extra_animal_cents_per_night', v_extra * v_rate, 'extra_animal_cents_per_visit', v_extra_visit * v_rate,
    'extra_cents_by_service', jsonb_build_object('overnight', v_extra * v_rate, 'walk', v_extra_visit * v_rate, 'visit', v_extra_visit * v_rate, 'home', v_extra_visit * v_rate));
end $$;
revoke all on function public.porchlight_book_with_consent(jsonb) from public;
grant execute on function public.porchlight_book_with_consent(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------- sitters see the real price for the work (extra animals included)

-- Estimated take-home on open requests now uses the amount due for the visit (fare_cents when set).
do $do$
declare def text;
begin
  select pg_get_functiondef('public.porchlight_open_requests()'::regprocedure) into def;
  if def like '%else sv.price_cents end as price%' then
    execute replace(def, 'else sv.price_cents end as price', 'else coalesce(b.fare_cents, sv.price_cents) end as price');
  end if;
end $do$;
