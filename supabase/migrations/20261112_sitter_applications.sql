-- Sitter applications: people who want to work with Porchlight as independent pet sitters.
-- The public form (/sitter-application) calls porchlight_apply_sitter(); only staff can read or change rows.

create table if not exists public.porchlight_sitter_applications (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text not null,
  town text not null,
  services text[] not null default '{}',
  animals text[] not null default '{}',
  availability text[] not null default '{}',
  years_experience text,
  experience text not null,
  has_vehicle boolean not null default false,
  is_adult boolean not null,
  background_check_ok boolean not null default false,
  other_platforms text,
  how_heard text,
  notes text,
  status text not null default 'new'
    check (status in ('new', 'contacted', 'interviewing', 'approved', 'declined', 'withdrawn')),
  staff_notes text,
  updated_at timestamptz not null default now()
);
create index if not exists porchlight_sitter_applications_status_idx
  on public.porchlight_sitter_applications (status, created_at desc);
create index if not exists porchlight_sitter_applications_email_idx
  on public.porchlight_sitter_applications (lower(email));

alter table public.porchlight_sitter_applications enable row level security;
revoke all on public.porchlight_sitter_applications from anon;
revoke all on public.porchlight_sitter_applications from authenticated;
grant select, update on public.porchlight_sitter_applications to authenticated;

create policy "staff read sitter applications" on public.porchlight_sitter_applications
  for select to authenticated using (public.porchlight_is_staff());
create policy "staff update sitter applications" on public.porchlight_sitter_applications
  for update to authenticated using (public.porchlight_is_staff()) with check (public.porchlight_is_staff());

create or replace function public.porchlight_apply_sitter(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_email text := lower(trim(p->>'email'));
  v_id uuid;
  v_services text[];
  v_animals text[];
  v_avail text[];
begin
  -- Hidden "website" field: real people leave it empty. Pretend success for bots.
  if coalesce(trim(p->>'website'), '') <> '' then return jsonb_build_object('id', gen_random_uuid()); end if;

  if coalesce(trim(p->>'name'), '') = '' or coalesce(v_email, '') = '' or coalesce(trim(p->>'phone'), '') = ''
     or coalesce(trim(p->>'town'), '') = '' or coalesce(trim(p->>'experience'), '') = '' then
    raise exception 'Please fill in your name, email, phone, town and a little about your experience';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please check the email address'; end if;
  if coalesce((p->>'is_adult')::boolean, false) is not true then raise exception 'You must be 18 or older to apply'; end if;
  if coalesce((p->>'background_check_ok')::boolean, false) is not true then
    raise exception 'Please agree to a background check, which is required before you start';
  end if;
  if length(p::text) > 20000 then raise exception 'The form is too long'; end if;
  if length(p->>'name') > 120 or length(p->>'email') > 200 or length(p->>'phone') > 40 or length(p->>'town') > 120
     or length(coalesce(p->>'experience', '')) > 3000 or length(coalesce(p->>'notes', '')) > 3000
     or length(coalesce(p->>'other_platforms', '')) > 300 or length(coalesce(p->>'how_heard', '')) > 300
     or length(coalesce(p->>'years_experience', '')) > 40 then
    raise exception 'One of the fields is too long';
  end if;

  -- One open application per email, and a rolling cap so the form can't be flooded.
  if exists (select 1 from public.porchlight_sitter_applications
             where lower(email) = v_email and status in ('new', 'contacted', 'interviewing')) then
    raise exception 'We already have your application and will be in touch soon.';
  end if;
  if (select count(*) from public.porchlight_sitter_applications where created_at > now() - interval '1 hour') >= 30 then
    raise exception 'We are getting a lot of applications right now. Please try again in a little while.';
  end if;

  -- Only keep values from the lists the form offers.
  select coalesce(array_agg(x), '{}') into v_services from (
    select distinct x from jsonb_array_elements_text(coalesce(p->'services', '[]'::jsonb)) x
    where x in ('walks', 'dropins', 'overnights', 'cats', 'exotics', 'taxi', 'events')) s;
  select coalesce(array_agg(x), '{}') into v_animals from (
    select distinct x from jsonb_array_elements_text(coalesce(p->'animals', '[]'::jsonb)) x
    where x in ('small_dogs', 'large_dogs', 'puppies', 'seniors', 'cats', 'birds', 'reptiles', 'fish', 'small_pets', 'medication')) a;
  select coalesce(array_agg(x), '{}') into v_avail from (
    select distinct x from jsonb_array_elements_text(coalesce(p->'availability', '[]'::jsonb)) x
    where x in ('weekday_days', 'weekday_evenings', 'weekends', 'holidays', 'overnights')) v;

  insert into public.porchlight_sitter_applications (
    name, email, phone, town, services, animals, availability, years_experience, experience,
    has_vehicle, is_adult, background_check_ok, other_platforms, how_heard, notes)
  values (
    trim(p->>'name'), v_email, trim(p->>'phone'), trim(p->>'town'), v_services, v_animals, v_avail,
    nullif(trim(p->>'years_experience'), ''), trim(p->>'experience'),
    coalesce((p->>'has_vehicle')::boolean, false), true, true,
    nullif(trim(p->>'other_platforms'), ''), nullif(trim(p->>'how_heard'), ''), nullif(trim(p->>'notes'), ''))
  returning id into v_id;

  return jsonb_build_object('id', v_id);
end $function$;

revoke all on function public.porchlight_apply_sitter(jsonb) from public;
grant execute on function public.porchlight_apply_sitter(jsonb) to anon, authenticated;
