-- Vaccination records: per-pet rabies expiration, uploaded documents, vet permission.
alter table public.porchlight_pets add column if not exists rabies_expires_on date;
alter table public.porchlight_clients add column if not exists vet_records_ok boolean;

create table if not exists public.porchlight_pet_docs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.porchlight_clients(id) on delete cascade,
  pet_id uuid not null references public.porchlight_pets(id) on delete cascade,
  kind text not null default 'rabies' check (kind in ('rabies','other')),
  path text not null unique,
  file_name text,
  created_at timestamptz not null default now()
);
create index if not exists porchlight_pet_docs_pet_idx on public.porchlight_pet_docs (pet_id);
create index if not exists porchlight_pet_docs_client_idx on public.porchlight_pet_docs (client_id);

alter table public.porchlight_pet_docs enable row level security;
revoke all on public.porchlight_pet_docs from anon;
revoke all on public.porchlight_pet_docs from authenticated;
grant select, insert, delete on public.porchlight_pet_docs to authenticated;

create policy "staff manage pet docs" on public.porchlight_pet_docs for all to authenticated
  using (public.porchlight_is_staff()) with check (public.porchlight_is_staff());
create policy "client reads own pet docs" on public.porchlight_pet_docs for select to authenticated
  using (client_id in (select public.porchlight_my_client_ids()));
create policy "client adds own pet docs" on public.porchlight_pet_docs for insert to authenticated
  with check (
    client_id in (select public.porchlight_my_client_ids())
    and path like client_id::text || '/records/%'
    and exists (select 1 from public.porchlight_pets p where p.id = pet_id and p.client_id = porchlight_pet_docs.client_id));
create policy "client removes own pet docs" on public.porchlight_pet_docs for delete to authenticated
  using (client_id in (select public.porchlight_my_client_ids()));

-- Private bucket for the files themselves (PDFs and photos of certificates, 10 MB each).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porchlight-records', 'porchlight-records', false, 10485760,
  array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

-- The new client form is filled out before anyone has a login, so it may add files
-- under intake/<form id>/ only. It can never read, list, replace or delete them.
create or replace function public.porchlight_intake_upload_ok()
returns boolean language sql stable security definer set search_path to 'public'
as $$ select count(*) < 60 from storage.objects
      where bucket_id = 'porchlight-records' and name like 'intake/%' and created_at > now() - interval '1 hour' $$;
revoke all on function public.porchlight_intake_upload_ok() from public;
grant execute on function public.porchlight_intake_upload_ok() to anon, authenticated;

create policy "porchlight intake record uploads" on storage.objects for insert to anon, authenticated
  with check (
    bucket_id = 'porchlight-records'
    and name ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp|heic)$'
    and public.porchlight_intake_upload_ok());

create policy "porchlight staff records" on storage.objects for all to authenticated
  using (bucket_id = 'porchlight-records' and public.porchlight_is_staff())
  with check (bucket_id = 'porchlight-records' and public.porchlight_is_staff());

create policy "porchlight client reads own records" on storage.objects for select to authenticated
  using (bucket_id = 'porchlight-records' and (
    (storage.foldername(name))[1] in (select id::text from public.porchlight_my_client_ids() id)
    or exists (select 1 from public.porchlight_pet_docs d
               where d.path = objects.name and d.client_id in (select public.porchlight_my_client_ids()))));

create policy "porchlight client uploads own records" on storage.objects for insert to authenticated
  with check (bucket_id = 'porchlight-records'
    and (storage.foldername(name))[1] in (select id::text from public.porchlight_my_client_ids() id));

create policy "porchlight client deletes own records" on storage.objects for delete to authenticated
  using (bucket_id = 'porchlight-records' and (
    (storage.foldername(name))[1] in (select id::text from public.porchlight_my_client_ids() id)
    or exists (select 1 from public.porchlight_pet_docs d
               where d.path = objects.name and d.client_id in (select public.porchlight_my_client_ids()))));

-- New client form: also saves rabies expiration, vet permission and the uploaded records.
create or replace function public.porchlight_submit_intake(p jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  new_id uuid;
  pet jsonb;
  doc jsonb;
  v_pet_id uuid;
  v_docs int;
  i int := 0;
  v_email text := lower(trim(p->>'email'));
begin
  if coalesce(trim(p->>'name'),'') = '' or coalesce(v_email,'') = '' or coalesce(trim(p->>'phone'),'') = ''
     or coalesce(trim(p->>'address'),'') = '' then
    raise exception 'Name, email, phone and address are required';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please check the email address'; end if;
  if coalesce((p->>'agreed')::boolean, false) is not true then raise exception 'Please agree to the service terms'; end if;
  if length(p::text) > 40000 then raise exception 'The form is too long'; end if;
  if jsonb_typeof(p->'pets') is distinct from 'array' or jsonb_array_length(p->'pets') = 0 then
    if coalesce(p->>'access_method','') = '' then raise exception 'Please add at least one pet, or tell us about home-only care'; end if;
  end if;
  if jsonb_array_length(coalesce(p->'pets','[]'::jsonb)) > 10 then raise exception 'Too many pets for one form; call us'; end if;
  if exists (select 1 from public.porchlight_clients where lower(email) = v_email) then
    raise exception 'We already have a file for this email. Sign in to the client portal to update it.';
  end if;
  if (select count(*) from public.porchlight_clients where created_at > now() - interval '1 hour') > 20 then
    raise exception 'Too many forms right now. Please try again shortly.';
  end if;
  if (p->>'town_id') is not null and not exists (select 1 from public.porchlight_towns where id = p->>'town_id') then
    raise exception 'Unknown town';
  end if;

  if ((p->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (p->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$')
     and not public.porchlight_in_area((p->>'lat')::float8, (p->>'lng')::float8) then
    raise exception 'That address is outside our service area. Call us and we will see what we can do.';
  end if;

  insert into public.porchlight_clients (
    name, email, phone, address, town_id, alt_contact_name, alt_contact_phone,
    vet_clinic, vet_phone, emergency_clinic, vet_spend_limit, vet_records_ok,
    access_method, lockbox_code, door_code, alarm_code, key_notes, wifi, parking,
    home_notes, house_rules, how_heard, agreed_at, lat, lng)
  values (
    trim(p->>'name'), v_email, trim(p->>'phone'), trim(p->>'address'), nullif(p->>'town_id',''),
    nullif(trim(p->>'alt_contact_name'),''), nullif(trim(p->>'alt_contact_phone'),''),
    nullif(trim(p->>'vet_clinic'),''), nullif(trim(p->>'vet_phone'),''), nullif(trim(p->>'emergency_clinic'),''),
    nullif(trim(p->>'vet_spend_limit'),''),
    case when (p->>'vet_records_ok') in ('true','false') then (p->>'vet_records_ok')::boolean end,
    nullif(trim(p->>'access_method'),''), nullif(trim(p->>'lockbox_code'),''), nullif(trim(p->>'door_code'),''),
    nullif(trim(p->>'alarm_code'),''), nullif(trim(p->>'key_notes'),''), nullif(trim(p->>'wifi'),''),
    nullif(trim(p->>'parking'),''), nullif(trim(p->>'home_notes'),''), nullif(trim(p->>'house_rules'),''),
    nullif(trim(p->>'how_heard'),''), now(),
    case when ((p->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (p->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' and (p->>'lat')::float8 between 34 and 37 and (p->>'lng')::float8 between -83 and -79) then (p->>'lat')::float8 end,
    case when ((p->>'lat') ~ '^-?[0-9]+(\.[0-9]+)?$' and (p->>'lng') ~ '^-?[0-9]+(\.[0-9]+)?$' and (p->>'lat')::float8 between 34 and 37 and (p->>'lng')::float8 between -83 and -79) then (p->>'lng')::float8 end)
  returning id into new_id;

  for pet in select * from jsonb_array_elements(coalesce(p->'pets','[]'::jsonb)) loop
    if coalesce(trim(pet->>'name'),'') <> '' then
      insert into public.porchlight_pets (
        client_id, name, species, breed, age, weight_lbs, sex, spayed_neutered,
        food, food_amount, feeding_times, treats, medications, medical_notes, vaccinations_current,
        rabies_expires_on, behavior, walk_notes, quirks, sort_order)
      values (
        new_id, trim(pet->>'name'), coalesce(nullif(trim(pet->>'species'),''),'Dog'),
        nullif(trim(pet->>'breed'),''), nullif(trim(pet->>'age'),''),
        nullif(regexp_replace(coalesce(pet->>'weight_lbs',''), '[^0-9.]', '', 'g'),'')::numeric,
        nullif(trim(pet->>'sex'),''), (nullif(pet->>'spayed_neutered',''))::boolean,
        nullif(trim(pet->>'food'),''), nullif(trim(pet->>'food_amount'),''), nullif(trim(pet->>'feeding_times'),''),
        nullif(trim(pet->>'treats'),''), nullif(trim(pet->>'medications'),''), nullif(trim(pet->>'medical_notes'),''),
        (nullif(pet->>'vaccinations_current',''))::boolean,
        case when (pet->>'rabies_expires_on') ~ '^(19|20)[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'
             then to_date(pet->>'rabies_expires_on', 'YYYY-MM-DD') end,
        nullif(trim(pet->>'behavior'),''), nullif(trim(pet->>'walk_notes'),''), nullif(trim(pet->>'quirks'),''), i)
      returning id into v_pet_id;
      i := i + 1;

      -- Records uploaded with the form. Only files that really were just uploaded by a form are attached.
      v_docs := 0;
      if jsonb_typeof(pet->'docs') = 'array' then
        for doc in select * from jsonb_array_elements(pet->'docs') loop
          exit when v_docs >= 8;
          if (doc->>'path') ~ '^intake/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|png|webp|heic)$'
             and exists (select 1 from storage.objects o where o.bucket_id = 'porchlight-records'
                         and o.name = doc->>'path' and o.created_at > now() - interval '2 days') then
            insert into public.porchlight_pet_docs (client_id, pet_id, kind, path, file_name)
            values (new_id, v_pet_id, case when doc->>'kind' = 'other' then 'other' else 'rabies' end,
                    doc->>'path', nullif(left(trim(coalesce(doc->>'file_name','')), 200), ''))
            on conflict (path) do nothing;
            v_docs := v_docs + 1;
          end if;
        end loop;
      end if;
    end if;
  end loop;

  -- Link any booking requests already made with this email.
  update public.porchlight_bookings set client_id = new_id where client_id is null and lower(client_email) = v_email;
  return new_id;
end $function$;
