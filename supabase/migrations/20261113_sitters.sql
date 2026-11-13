-- Sitter accounts, request acceptance and payout splits.
--
-- Model
--  * porchlight_sitters: one row per contracted sitter. A sitter signs in to /portal with the same
--    email (matched like porchlight_staff). Staff set towns, services and the share they keep.
--  * porchlight_bookings.sitter_id: who is doing a visit. sitter_keep_pct is copied from the sitter when
--    they are assigned, so changing a sitter's share later never changes past visits.
--  * Sitters accept open requests with porchlight_sitter_claim (first to accept wins).
--  * Sitters see client names, addresses and access codes only for visits assigned to them that are
--    confirmed (client has paid), from 3 days after the visit until then.
--  * Earnings = keep_pct of the money actually collected for a completed visit + 100% of tips.
--    Staff record a payout, which stamps the visits as paid out.

-- ---------------------------------------------------------------- tables

create table if not exists public.porchlight_sitters (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  email text not null,
  phone text,
  status text not null default 'active' check (status in ('active', 'paused', 'removed')),
  towns text[] not null default '{}',      -- porchlight_towns ids; empty means all towns
  services text[] not null default '{}',   -- porchlight_services ids; empty means all services
  keep_pct integer not null default 88 check (keep_pct between 50 and 100),
  payout_method text check (payout_method in ('venmo', 'zelle', 'check', 'cash', 'other')),
  payout_handle text,
  application_id uuid references public.porchlight_sitter_applications (id) on delete set null,
  staff_notes text
);
create unique index if not exists porchlight_sitters_email_idx on public.porchlight_sitters (lower(email));

create table if not exists public.porchlight_payouts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  sitter_id uuid not null references public.porchlight_sitters (id),
  amount_cents integer not null check (amount_cents > 0),
  method text not null check (method in ('venmo', 'zelle', 'check', 'cash', 'other')),
  reference text,
  note text
);
create index if not exists porchlight_payouts_sitter_idx on public.porchlight_payouts (sitter_id, created_at desc);

alter table public.porchlight_bookings
  add column if not exists sitter_id uuid references public.porchlight_sitters (id),
  add column if not exists sitter_keep_pct integer,
  add column if not exists payout_id uuid references public.porchlight_payouts (id);
create index if not exists porchlight_bookings_sitter_idx on public.porchlight_bookings (sitter_id, start_at);

-- ---------------------------------------------------------------- helpers

create or replace function public.porchlight_my_sitter_id()
returns uuid language sql stable security definer set search_path to 'public' as $$
  select id from public.porchlight_sitters
   where lower(email) = public.porchlight_my_email() and public.porchlight_my_email() <> ''
     and status in ('active', 'paused')
   limit 1
$$;

-- Clients this sitter may see: confirmed or completed visits assigned to them, until 3 days after.
create or replace function public.porchlight_sitter_client_ids()
returns setof uuid language sql stable security definer set search_path to 'public' as $$
  select distinct b.client_id from public.porchlight_bookings b
   where b.client_id is not null
     and b.sitter_id = public.porchlight_my_sitter_id()
     and b.status in ('confirmed', 'completed')
     and b.start_at > now() - interval '3 days'
$$;

-- ---------------------------------------------------------------- row level security

alter table public.porchlight_sitters enable row level security;
alter table public.porchlight_payouts enable row level security;
revoke all on public.porchlight_sitters from anon, authenticated;
revoke all on public.porchlight_payouts from anon, authenticated;
grant select, insert, update on public.porchlight_sitters to authenticated;
grant select on public.porchlight_payouts to authenticated;

create policy "staff manage sitters" on public.porchlight_sitters
  for all to authenticated using (public.porchlight_is_staff()) with check (public.porchlight_is_staff());
create policy "sitter reads self" on public.porchlight_sitters
  for select to authenticated using (id = public.porchlight_my_sitter_id());
create policy "staff read payouts" on public.porchlight_payouts
  for select to authenticated using (public.porchlight_is_staff());
create policy "sitter reads own payouts" on public.porchlight_payouts
  for select to authenticated using (sitter_id = public.porchlight_my_sitter_id());

create policy "sitter sees assigned bookings" on public.porchlight_bookings
  for select to authenticated
  using (sitter_id = public.porchlight_my_sitter_id() and status in ('confirmed', 'completed'));
create policy "sitter completes assigned bookings" on public.porchlight_bookings
  for update to authenticated
  using (sitter_id = public.porchlight_my_sitter_id() and status = 'confirmed')
  with check (sitter_id = public.porchlight_my_sitter_id() and status = 'completed');

create policy "sitter sees served clients" on public.porchlight_clients
  for select to authenticated using (id in (select public.porchlight_sitter_client_ids()));
create policy "sitter sees served pets" on public.porchlight_pets
  for select to authenticated using (client_id in (select public.porchlight_sitter_client_ids()));
create policy "sitter sees served pet docs" on public.porchlight_pet_docs
  for select to authenticated using (client_id in (select public.porchlight_sitter_client_ids()));

create policy "sitter manages own reports" on public.porchlight_visit_reports
  for all to authenticated
  using (exists (select 1 from public.porchlight_bookings b
                  where b.id = porchlight_visit_reports.booking_id and b.sitter_id = public.porchlight_my_sitter_id()))
  with check (exists (select 1 from public.porchlight_bookings b
                       where b.id = porchlight_visit_reports.booking_id
                         and b.sitter_id = public.porchlight_my_sitter_id()
                         and b.client_id = porchlight_visit_reports.client_id));

create policy "porchlight sitter reads photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'porchlight-photos'
         and (storage.foldername(name))[1] in (select id::text from public.porchlight_sitter_client_ids() id));
create policy "porchlight sitter uploads photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'porchlight-photos'
              and (storage.foldername(name))[1] in (select id::text from public.porchlight_sitter_client_ids() id));

-- ---------------------------------------------------------------- triggers on bookings

-- A sitter signed in with a normal session may only mark their own confirmed visit completed.
-- (Calls made through security definer functions run as the function owner and are not limited here.)
create or replace function public.porchlight_bookings_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user = 'authenticated' and not public.porchlight_is_staff() then
    if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status')
       or not (old.status = 'confirmed' and new.status = 'completed') then
      raise exception 'You can only mark your own confirmed visit as completed.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.porchlight_bookings_snapshot()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'UPDATE' and old.payout_id is not null and old.sitter_id is distinct from new.sitter_id then
    raise exception 'This visit has already been paid out to a sitter and cannot be reassigned.';
  end if;
  if new.sitter_id is null then
    new.sitter_keep_pct := null;
  elsif tg_op = 'INSERT' or old.sitter_id is distinct from new.sitter_id then
    select keep_pct into new.sitter_keep_pct from public.porchlight_sitters where id = new.sitter_id;
  end if;
  return new;
end $$;

drop trigger if exists porchlight_bookings_guard on public.porchlight_bookings;
create trigger porchlight_bookings_guard before update on public.porchlight_bookings
  for each row execute function public.porchlight_bookings_guard();
drop trigger if exists porchlight_bookings_snapshot on public.porchlight_bookings;
create trigger porchlight_bookings_snapshot before insert or update of sitter_id on public.porchlight_bookings
  for each row execute function public.porchlight_bookings_snapshot();

-- ---------------------------------------------------------------- who am I

create or replace function public.porchlight_whoami()
returns json language sql stable security definer set search_path to 'public' as $$
  select json_build_object(
    'email', public.porchlight_my_email(),
    'is_staff', public.porchlight_is_staff(),
    'client_id', (select id from public.porchlight_clients where lower(email) = public.porchlight_my_email() and public.porchlight_my_email() <> '' limit 1),
    'sitter', (select json_build_object('id', s.id, 'name', s.name, 'status', s.status, 'keep_pct', s.keep_pct)
                 from public.porchlight_sitters s where s.id = public.porchlight_my_sitter_id())
  )
$$;

-- ---------------------------------------------------------------- open requests and accepting them

-- Open work this sitter could accept. Deliberately no client names, phone numbers or addresses.
create or replace function public.porchlight_open_requests()
returns table (group_key uuid, town_id text, town_name text, services text[], n_visits integer,
               first_start timestamptz, last_start timestamptz, pets text, est_cents integer)
language plpgsql stable security definer set search_path to 'public' as $$
declare s public.porchlight_sitters;
begin
  select * into s from public.porchlight_sitters where id = public.porchlight_my_sitter_id() and status = 'active';
  if s.id is null then return; end if;
  return query
    select coalesce(b.group_id, b.id) as group_key,
           min(b.town_id), min(t.name),
           array_agg(distinct b.service_id)::text[],
           count(*)::int, min(b.start_at), max(b.start_at),
           min(b.pets),
           coalesce(round(sum(case when b.service_id = 'meet' then 0
                                   when b.service_id in ('taxi', 'taxi_rt') then coalesce(b.fare_cents, sv.price_cents)
                                   else sv.price_cents end) * s.keep_pct / 100.0), 0)::int
      from public.porchlight_bookings b
      left join public.porchlight_towns t on t.id = b.town_id
      left join public.porchlight_services sv on sv.id = b.service_id
     where b.sitter_id is null and b.status in ('requested', 'confirmed') and b.start_at > now()
       and (cardinality(s.services) = 0 or b.service_id = any (s.services))
       and (cardinality(s.towns) = 0 or b.town_id = any (s.towns))
     group by coalesce(b.group_id, b.id)
     order by min(b.start_at);
end $$;

-- Visits this sitter has accepted that are not confirmed yet (client has not paid). No client details.
create or replace function public.porchlight_sitter_pending()
returns table (id uuid, group_key uuid, service_id text, town_id text, start_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select b.id, coalesce(b.group_id, b.id), b.service_id, b.town_id, b.start_at
    from public.porchlight_bookings b
   where b.sitter_id = public.porchlight_my_sitter_id() and b.status = 'requested' and b.start_at > now()
   order by b.start_at
$$;

create or replace function public.porchlight_sitter_claim(p_key uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare s public.porchlight_sitters; n integer;
begin
  select * into s from public.porchlight_sitters where id = public.porchlight_my_sitter_id() for update;
  if s.id is null or s.status <> 'active' then
    raise exception 'Your sitter account is not active. Contact Porchlight.';
  end if;
  -- Candidate visits: still open, in the future, and within this sitter's towns and services.
  if exists (
    select 1
      from public.porchlight_bookings c
      join public.porchlight_bookings m
        on m.sitter_id = s.id and m.status in ('requested', 'confirmed')
       and tstzrange(m.start_at - interval '30 minutes', coalesce(m.end_at, m.start_at + interval '30 minutes') + interval '30 minutes')
           && tstzrange(c.start_at, coalesce(c.end_at, c.start_at + interval '30 minutes'))
     where (c.group_id = p_key or c.id = p_key) and c.sitter_id is null
       and c.status in ('requested', 'confirmed') and c.start_at > now()
  ) then
    raise exception 'That overlaps, or is too close to, a visit you already have.';
  end if;
  update public.porchlight_bookings
     set sitter_id = s.id
   where (group_id = p_key or id = p_key) and sitter_id is null
     and status in ('requested', 'confirmed') and start_at > now()
     and (cardinality(s.services) = 0 or service_id = any (s.services))
     and (cardinality(s.towns) = 0 or town_id = any (s.towns));
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Someone else already accepted that request, or it is no longer available.'; end if;
  return n;
end $$;

-- Give visits back. Allowed until 24 hours before the first affected visit starts.
create or replace function public.porchlight_sitter_release(p_key uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare sid uuid := public.porchlight_my_sitter_id(); n integer;
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  update public.porchlight_bookings set sitter_id = null
   where (group_id = p_key or id = p_key) and sitter_id = sid
     and status in ('requested', 'confirmed') and start_at > now() + interval '24 hours' and payout_id is null;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Visits can be given back up to 24 hours before they start. Please call Pete.'; end if;
  return n;
end $$;

create or replace function public.porchlight_sitter_update_me(p_phone text, p_method text, p_handle text, p_paused boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sid uuid := public.porchlight_my_sitter_id();
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  if p_method is not null and p_method not in ('venmo', 'zelle', 'check', 'cash', 'other') then
    raise exception 'Choose how you would like to be paid.';
  end if;
  update public.porchlight_sitters
     set phone = nullif(left(trim(p_phone), 40), ''),
         payout_method = p_method,
         payout_handle = nullif(left(trim(p_handle), 120), ''),
         status = case when p_paused then 'paused' else 'active' end,
         updated_at = now()
   where id = sid;
end $$;

-- ---------------------------------------------------------------- earnings and payouts

-- One row per completed visit with what the sitter earned. Internal; callers go through the functions below.
create or replace function public.porchlight_earn_rows(p_sitter uuid)
returns table (booking_id uuid, start_at timestamptz, service_id text, town_id text, collected_cents integer,
               tip_cents integer, keep_pct integer, share_cents integer, payout_id uuid, paid_out_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select b.id, b.start_at, b.service_id, b.town_id,
         coalesce(p.amt, 0)::int, coalesce(p.tip, 0)::int, coalesce(b.sitter_keep_pct, 88),
         (round(coalesce(p.amt, 0) * coalesce(b.sitter_keep_pct, 88) / 100.0) + coalesce(p.tip, 0))::int,
         b.payout_id, po.created_at
    from public.porchlight_bookings b
    left join (select booking_id, sum(amount_cents) amt, sum(coalesce(tip_cents, 0)) tip
                 from public.porchlight_payments group by booking_id) p on p.booking_id = b.id
    left join public.porchlight_payouts po on po.id = b.payout_id
   where b.sitter_id = p_sitter and b.status = 'completed'
$$;
revoke all on function public.porchlight_earn_rows(uuid) from public, anon, authenticated;

create or replace function public.porchlight_sitter_earnings(p_sitter uuid default null)
returns table (booking_id uuid, start_at timestamptz, service_id text, town_id text, collected_cents integer,
               tip_cents integer, keep_pct integer, share_cents integer, payout_id uuid, paid_out_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := coalesce(p_sitter, public.porchlight_my_sitter_id());
begin
  if v is null then return; end if;
  if v is distinct from public.porchlight_my_sitter_id() and not public.porchlight_is_staff() then
    raise exception 'Not allowed.';
  end if;
  return query select * from public.porchlight_earn_rows(v) e order by e.start_at desc limit 500;
end $$;

-- Staff: what each sitter is owed right now.
create or replace function public.porchlight_sitter_balances()
returns table (sitter_id uuid, name text, status text, payout_method text, payout_handle text,
               owed_cents integer, owed_visits integer, paid_cents integer)
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.porchlight_is_staff() then raise exception 'Not allowed.'; end if;
  return query
    select s.id, s.name, s.status, s.payout_method, s.payout_handle,
           coalesce(sum(e.share_cents) filter (where e.payout_id is null and (e.collected_cents > 0 or e.tip_cents > 0)), 0)::int,
           (count(e.booking_id) filter (where e.payout_id is null and (e.collected_cents > 0 or e.tip_cents > 0)))::int,
           coalesce((select sum(po.amount_cents) from public.porchlight_payouts po where po.sitter_id = s.id), 0)::int
      from public.porchlight_sitters s
      left join lateral public.porchlight_earn_rows(s.id) e on true
     group by s.id
     order by s.name;
end $$;

-- Staff: pay a sitter everything currently owed (completed visits that clients have paid for).
create or replace function public.porchlight_record_payout(p_sitter uuid, p_method text, p_reference text, p_note text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare total integer; ids uuid[]; pid uuid;
begin
  if not public.porchlight_is_staff() then raise exception 'Not allowed.'; end if;
  if p_method not in ('venmo', 'zelle', 'check', 'cash', 'other') then raise exception 'Choose how you paid.'; end if;
  perform 1 from public.porchlight_sitters where id = p_sitter for update;
  select coalesce(sum(share_cents), 0), coalesce(array_agg(booking_id), '{}')
    into total, ids
    from public.porchlight_earn_rows(p_sitter)
   where payout_id is null and (collected_cents > 0 or tip_cents > 0);
  if total <= 0 then raise exception 'Nothing is owed to this sitter right now.'; end if;
  insert into public.porchlight_payouts (sitter_id, amount_cents, method, reference, note)
    values (p_sitter, total, p_method, nullif(trim(p_reference), ''), nullif(trim(p_note), '')) returning id into pid;
  update public.porchlight_bookings set payout_id = pid where id = any (ids);
  return pid;
end $$;

-- Staff: turn an application into a sitter account.
create or replace function public.porchlight_approve_applicant(p_app uuid, p_towns text[], p_keep integer default 88)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare a public.porchlight_sitter_applications; sid uuid;
begin
  if not public.porchlight_is_staff() then raise exception 'Not allowed.'; end if;
  select * into a from public.porchlight_sitter_applications where id = p_app;
  if a.id is null then raise exception 'Application not found.'; end if;
  insert into public.porchlight_sitters (name, email, phone, towns, keep_pct, application_id)
    values (a.name, lower(trim(a.email)), a.phone, coalesce(p_towns, '{}'), coalesce(p_keep, 88), a.id)
    on conflict (lower(email)) do update
      set status = 'active', towns = excluded.towns, keep_pct = excluded.keep_pct, updated_at = now()
    returning id into sid;
  update public.porchlight_sitter_applications set status = 'approved', updated_at = now() where id = p_app;
  return sid;
end $$;

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'porchlight_my_sitter_id()', 'porchlight_sitter_client_ids()', 'porchlight_open_requests()',
    'porchlight_sitter_pending()', 'porchlight_sitter_claim(uuid)', 'porchlight_sitter_release(uuid)',
    'porchlight_sitter_update_me(text,text,text,boolean)', 'porchlight_sitter_earnings(uuid)',
    'porchlight_sitter_balances()', 'porchlight_record_payout(uuid,text,text,text)',
    'porchlight_approve_applicant(uuid,text[],integer)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
