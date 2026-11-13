-- Minimal stand-ins for the real Porchlight tables and functions, so the consent migration can be tested on a plain
-- local Postgres (no Supabase needed). NOT for production. See supabase/tests/run_consent_tests.sh.
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create table public.porchlight_services (id text primary key, label text, price_cents int, duration_min int);
insert into public.porchlight_services values ('walk','Dog walk',3000,30),('visit','Drop-in',3000,30),('overnight','Overnight',9900,720),
  ('home','Home check-in',3500,30),('meet','Meet and greet',0,30),('taxi','Pet taxi',2000,30);
create table public.porchlight_pay_settings (id text primary key, discount_cents int not null default 0, card_fee_cents int not null default 0);
insert into public.porchlight_pay_settings (id) values ('main');
create table public.porchlight_clients (id uuid primary key default gen_random_uuid(), email text not null, name text);
create table public.porchlight_sitters (id uuid primary key default gen_random_uuid(), email text, status text default 'active');
create table public.porchlight_bookings (
  id uuid primary key default gen_random_uuid(), service_id text, start_at timestamptz, end_at timestamptz, client_name text, client_email text,
  group_id uuid, fare_cents int, tip_cents int default 0, status text default 'requested', sitter_id uuid, pets text, notes text);

create function public.porchlight_is_staff() returns boolean language sql stable as $$ select coalesce(current_setting('test.staff', true), '') = 'yes' $$;
create function public.porchlight_my_email() returns text language sql stable as $$ select lower(coalesce(current_setting('test.email', true), '')) $$;
create function public.porchlight_my_sitter_id() returns uuid language sql stable as $$ select nullif(current_setting('test.sitter', true), '')::uuid $$;

create function public.porchlight_request_bookings(p_town text, p_items jsonb, p_name text, p_email text, p_phone text, p_address text,
  p_pets text DEFAULT NULL, p_notes text DEFAULT NULL, p_new_client boolean DEFAULT true, p_lat double precision DEFAULT NULL,
  p_lng double precision DEFAULT NULL, p_dropoff text DEFAULT NULL, p_trip_miles numeric DEFAULT NULL, p_trip_minutes integer DEFAULT NULL,
  p_tip_cents integer DEFAULT 0) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare gid uuid := gen_random_uuid(); it jsonb; n int := 0;
begin
  for it in select * from jsonb_array_elements(p_items) loop
    insert into public.porchlight_bookings (service_id, start_at, end_at, client_name, client_email, group_id, pets, notes)
    values (it->>'service', (it->>'start_at')::timestamptz, (it->>'start_at')::timestamptz + interval '30 min', p_name, p_email, gid, p_pets, p_notes);
    n := n + 1;
  end loop;
  return jsonb_build_object('group_id', gid, 'count', n, 'sitters', '[]'::jsonb);
end $$;
grant execute on function public.porchlight_request_bookings(text, jsonb, text, text, text, text, text, text, boolean, double precision, double precision, text, numeric, integer, integer) to anon, authenticated;

create function public.porchlight_submit_intake(p jsonb) returns uuid language plpgsql security definer as $$
declare v uuid := gen_random_uuid(); begin insert into public.porchlight_clients (id, email, name) values (v, lower(p->>'email'), p->>'name'); return v; end $$;
grant execute on function public.porchlight_submit_intake(jsonb) to anon, authenticated;
create function public.porchlight_apply_sitter(p jsonb) returns jsonb language sql security definer as $$ select jsonb_build_object('id', gen_random_uuid()) $$;
grant execute on function public.porchlight_apply_sitter(jsonb) to anon, authenticated;

-- Same shape as the real porchlight_open_requests (only the price expression matters here).
create function public.porchlight_open_requests() returns table (est integer) language plpgsql stable security definer as $$
begin
  return query select coalesce(sum(v.price), 0)::int from (
    select case when b.service_id = 'meet' then 0
                when b.service_id in ('taxi', 'taxi_rt') then coalesce(b.fare_cents, sv.price_cents)
                else sv.price_cents end as price
      from public.porchlight_bookings b left join public.porchlight_services sv on sv.id = b.service_id where b.sitter_id is null) v;
end $$;
