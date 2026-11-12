-- Per-sitter availability for the public booking calendar.
-- Depends on 20261113_sitters.sql.
--
-- Before: one provider. Every active booking blocked every slot.
-- Now:   each sitter has weekly hours, time off, and their own bookings. A time is open for a sitter when it is
--        inside their hours, not on time off, in their towns/services, and has no clash (incl. drive time) with
--        THEIR OWN visits. Pet owners can pick a sitter, or "anyone". If the picked sitter is busy the calendar
--        offers the sitters who are free.
-- Transition: while there are NO active sitters, the old single-provider logic still runs, so booking never breaks.
--
-- Not covered: visits with no sitter yet ("anyone") do not belong to a sitter. They reduce how many sitters can
-- still be offered at that time, so the site cannot sell more simultaneous "anyone" visits than there are sitters.

-- ---------------------------------------------------------------- data

alter table public.porchlight_sitters
  add column if not exists display_name text,
  add column if not exists bio text;

create table if not exists public.porchlight_sitter_hours (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.porchlight_sitters (id) on delete cascade,
  dow smallint not null check (dow between 0 and 6),          -- 0 = Sunday, as in postgres extract(dow)
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);
create index if not exists porchlight_sitter_hours_idx on public.porchlight_sitter_hours (sitter_id, dow);

create table if not exists public.porchlight_sitter_timeoff (
  id uuid primary key default gen_random_uuid(),
  sitter_id uuid not null references public.porchlight_sitters (id) on delete cascade,
  start_date date not null,
  end_date date not null,
  note text,
  check (end_date >= start_date)
);
create index if not exists porchlight_sitter_timeoff_idx on public.porchlight_sitter_timeoff (sitter_id, start_date);

alter table public.porchlight_sitter_hours enable row level security;
alter table public.porchlight_sitter_timeoff enable row level security;

drop policy if exists "staff manage sitter hours" on public.porchlight_sitter_hours;
create policy "staff manage sitter hours" on public.porchlight_sitter_hours
  for all to authenticated using (public.porchlight_is_staff()) with check (public.porchlight_is_staff());
drop policy if exists "sitter manages own hours" on public.porchlight_sitter_hours;
create policy "sitter manages own hours" on public.porchlight_sitter_hours
  for all to authenticated using (sitter_id = public.porchlight_my_sitter_id())
  with check (sitter_id = public.porchlight_my_sitter_id());

drop policy if exists "staff manage sitter timeoff" on public.porchlight_sitter_timeoff;
create policy "staff manage sitter timeoff" on public.porchlight_sitter_timeoff
  for all to authenticated using (public.porchlight_is_staff()) with check (public.porchlight_is_staff());
drop policy if exists "sitter manages own timeoff" on public.porchlight_sitter_timeoff;
create policy "sitter manages own timeoff" on public.porchlight_sitter_timeoff
  for all to authenticated using (sitter_id = public.porchlight_my_sitter_id())
  with check (sitter_id = public.porchlight_my_sitter_id());

-- New sitters start with Monday to Friday, 8 to 6. They change it on the Availability tab.
create or replace function public.porchlight_sitter_default_hours()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.porchlight_sitter_hours (sitter_id, dow, start_time, end_time)
    select new.id, d, '08:00', '18:00' from generate_series(1, 5) d;
  return new;
end $$;
drop trigger if exists porchlight_sitter_default_hours on public.porchlight_sitters;
create trigger porchlight_sitter_default_hours after insert on public.porchlight_sitters
  for each row execute function public.porchlight_sitter_default_hours();

-- ---------------------------------------------------------------- the one rule everything shares

-- Why this sitter cannot do this visit, or null when they can.
-- p_sitter null = the legacy single-provider check (every booking blocks; no hours).
create or replace function public.porchlight_sitter_conflict(
  p_sitter uuid, p_service text, p_town text, p_start timestamptz, p_end timestamptz,
  p_lat double precision default null, p_lng double precision default null)
returns text language plpgsql stable security definer set search_path to 'public' as $$
declare
  tz constant text := 'America/New_York';
  buffer_min constant int := 10;
  svc public.porchlight_services%rowtype;
  town public.porchlight_towns%rowtype;
  s public.porchlight_sitters%rowtype;
  my_lat double precision; my_lng double precision;
  l_start time := (p_start at time zone tz)::time;
  l_end time := (p_end at time zone tz)::time;
  l_day date := (p_start at time zone tz)::date;
  clash record; d_in int; d_out int;
begin
  select * into svc from public.porchlight_services where id = p_service;
  select * into town from public.porchlight_towns where id = p_town;
  my_lat := coalesce(p_lat, town.lat); my_lng := coalesce(p_lng, town.lng);

  if p_sitter is not null then
    select * into s from public.porchlight_sitters where id = p_sitter;
    if s.id is null or s.status <> 'active' then return 'unavailable'; end if;
    if cardinality(s.towns) > 0 and not (p_town = any (s.towns)) then return 'outside area'; end if;
    if cardinality(s.services) > 0 and not (p_service = any (s.services)) then return 'service'; end if;
    if exists (select 1 from public.porchlight_sitter_timeoff t where t.sitter_id = s.id and l_day between t.start_date and t.end_date) then
      return 'time off';
    end if;
    if svc.is_overnight then
      if not exists (select 1 from public.porchlight_sitter_hours h
                      where h.sitter_id = s.id and h.dow = extract(dow from l_day) and l_start between h.start_time and h.end_time) then
        return 'outside hours';
      end if;
    else
      if l_end <= l_start then return 'outside hours'; end if;
      if not exists (select 1 from public.porchlight_sitter_hours h
                      where h.sitter_id = s.id and h.dow = extract(dow from l_day) and h.start_time <= l_start and h.end_time >= l_end) then
        return 'outside hours';
      end if;
    end if;
  end if;

  for clash in
    select b.start_at, b.end_at, sv.is_overnight,
           coalesce(b.lat, c.lat, t.lat) as lat, coalesce(b.lng, c.lng, t.lng) as lng
      from public.porchlight_bookings b
      join public.porchlight_services sv on sv.id = b.service_id
      join public.porchlight_towns t on t.id = b.town_id
      left join public.porchlight_clients c on c.id = b.client_id
     where b.status in ('requested', 'confirmed')
       and (p_sitter is null or b.sitter_id = p_sitter)
       and b.start_at < p_end + interval '3 hours'
       and b.end_at > p_start - interval '3 hours'
  loop
    d_in := public.porchlight_drive_min_pts(clash.lat, clash.lng, my_lat, my_lng, clash.end_at);
    d_out := public.porchlight_drive_min_pts(my_lat, my_lng, clash.lat, clash.lng, p_end);
    if clash.is_overnight then
      if svc.is_overnight
         or (p_start < clash.start_at + interval '2 hours' + make_interval(mins => d_in)
             and p_end + make_interval(mins => d_out) > clash.start_at)
         or (p_start < clash.end_at + make_interval(mins => d_in)
             and p_end > clash.end_at - interval '90 minutes') then
        return 'overnight booked';
      end if;
    elsif p_start < clash.end_at + make_interval(mins => d_in + buffer_min)
      and p_end + make_interval(mins => d_out + buffer_min) > clash.start_at then
      return case when p_start < clash.end_at and p_end > clash.start_at then 'booked' else 'drive time' end;
    end if;
  end loop;
  return null;
end $$;

-- ---------------------------------------------------------------- who can be picked

-- Public list for the booking page. First name and last initial unless the sitter set their own display name.
-- No email, phone or address.
create or replace function public.porchlight_public_sitters(p_town text, p_service text)
returns table (id uuid, display_name text, bio text)
language sql stable security definer set search_path to 'public' as $$
  select s.id,
         coalesce(nullif(trim(s.display_name), ''),
                  split_part(trim(s.name), ' ', 1) ||
                  case when position(' ' in trim(s.name)) > 0 then ' ' || left(split_part(trim(s.name), ' ', 2), 1) || '.' else '' end),
         s.bio
    from public.porchlight_sitters s
   where s.status = 'active'
     and (cardinality(s.towns) = 0 or p_town = any (s.towns))
     and (cardinality(s.services) = 0 or p_service = any (s.services))
     and exists (select 1 from public.porchlight_sitter_hours h where h.sitter_id = s.id)
   order by 2
$$;

-- A sitter's own public profile text.
create or replace function public.porchlight_sitter_set_public(p_display text, p_bio text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sid uuid := public.porchlight_my_sitter_id();
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  update public.porchlight_sitters
     set display_name = nullif(left(trim(p_display), 40), ''), bio = nullif(left(trim(p_bio), 400), ''), updated_at = now()
   where id = sid;
end $$;

-- ---------------------------------------------------------------- the calendar

drop function if exists public.porchlight_check_slots(text, text, date[], text[], double precision, double precision);
drop function if exists public.porchlight_available_slots(date, text, text, double precision, double precision);

-- p_sitter null: "anyone". available = at least one sitter is free; sitters = who.
-- p_sitter set:  sitter_ok = that sitter is free. If not, available is still true when someone else is free
--                (sitters lists the alternates), so the page can offer them.
create or replace function public.porchlight_available_slots(
  p_date date, p_service text, p_town text,
  p_lat double precision default null, p_lng double precision default null, p_sitter uuid default null)
returns table (slot_label text, start_at timestamptz, available boolean, reason text, sitters jsonb, sitter_ok boolean)
language plpgsql stable security definer set search_path to 'public' as $$
declare
  svc public.porchlight_services%rowtype;
  town public.porchlight_towns%rowtype;
  home public.porchlight_towns%rowtype;
  tz constant text := 'America/New_York';
  my_lat double precision; my_lng double precision;
  cand time; cand_start timestamptz; cand_end timestamptz;
  candidates time[];
  legacy boolean;
  sr record; r text; first_reason text;
  free jsonb; n_free int; n_open int; me_ok boolean;
begin
  select * into svc from public.porchlight_services where id = p_service;
  if not found then raise exception 'Unknown service'; end if;
  select * into town from public.porchlight_towns where id = p_town;
  if not found then raise exception 'Outside service area'; end if;
  my_lat := coalesce(p_lat, town.lat); my_lng := coalesce(p_lng, town.lng);
  if p_lat is not null then
    select * into home from public.porchlight_towns where is_home_base limit 1;
    if not public.porchlight_in_area(my_lat, my_lng) or public.porchlight_drive_min_pts(home.lat, home.lng, my_lat, my_lng) > 75 then
      raise exception 'That address is outside our service area. Call us and we will see what we can do.';
    end if;
  end if;

  legacy := not exists (select 1 from public.porchlight_sitters where status = 'active');

  if svc.is_overnight then candidates := array['19:00'::time];
  else candidates := array['07:30','08:15','09:00','11:00','11:45','12:30','13:15','16:30','17:15','18:00']::time[];
  end if;

  foreach cand in array candidates loop
    cand_start := (p_date + cand) at time zone tz;
    cand_end := cand_start + make_interval(mins => svc.duration_min);
    slot_label := to_char(cand, 'FMHH12:MI AM'); start_at := cand_start;
    sitters := '[]'::jsonb; sitter_ok := false; reason := null; available := false;

    if cand_start < now() + interval '2 hours' then
      reason := 'too soon'; return next; continue;
    end if;

    if legacy then
      r := public.porchlight_sitter_conflict(null, svc.id, p_town, cand_start, cand_end, my_lat, my_lng);
      available := r is null; reason := r; sitter_ok := available;
      return next; continue;
    end if;

    free := '[]'::jsonb; n_free := 0; first_reason := null; me_ok := false;
    for sr in select s.id, coalesce(nullif(trim(s.display_name), ''),
                        split_part(trim(s.name), ' ', 1) ||
                        case when position(' ' in trim(s.name)) > 0 then ' ' || left(split_part(trim(s.name), ' ', 2), 1) || '.' else '' end) as dn
                from public.porchlight_sitters s where s.status = 'active' order by s.name
    loop
      r := public.porchlight_sitter_conflict(sr.id, svc.id, p_town, cand_start, cand_end, my_lat, my_lng);
      if p_sitter is not null and sr.id = p_sitter then
        me_ok := r is null;
        if r is not null then first_reason := r; end if;
      end if;
      if r is null then
        n_free := n_free + 1;
        if p_sitter is null or sr.id <> p_sitter then
          free := free || jsonb_build_object('id', sr.id, 'name', sr.dn);
        end if;
      elsif first_reason is null and p_sitter is null then
        first_reason := r;
      end if;
    end loop;

    -- Visits nobody has accepted yet still need a sitter, so they use up capacity.
    select count(*) into n_open from public.porchlight_bookings b
     where b.sitter_id is null and b.status in ('requested', 'confirmed')
       and b.start_at < cand_end and b.end_at > cand_start;

    if p_sitter is not null then
      sitter_ok := me_ok;
      if me_ok then available := true; sitters := free;
      else
        -- alternates only count if there is spare capacity beyond unassigned visits
        if n_free - n_open > 0 then available := true; sitters := free; end if;
        reason := coalesce(first_reason, 'booked');
      end if;
    else
      if n_free - n_open > 0 then available := true; sitter_ok := true; sitters := free;
      else reason := coalesce(first_reason, 'booked'); end if;
    end if;
    return next;
  end loop;
end $$;

create or replace function public.porchlight_check_slots(
  p_service text, p_town text, p_dates date[], p_times text[],
  p_lat double precision default null, p_lng double precision default null, p_sitter uuid default null)
returns table (day date, slot_label text, start_at timestamptz, available boolean, reason text, sitters jsonb, sitter_ok boolean)
language plpgsql stable security definer set search_path to 'public' as $$
declare d date;
begin
  if coalesce(array_length(p_dates, 1), 0) = 0 or array_length(p_dates, 1) > 92 then raise exception 'Pick between 1 and 92 days'; end if;
  if coalesce(array_length(p_times, 1), 0) = 0 or array_length(p_times, 1) > 6 then raise exception 'Pick between 1 and 6 times'; end if;
  foreach d in array p_dates loop
    if d > (now() at time zone 'America/New_York')::date + 92 then raise exception 'We can only book up to 13 weeks ahead'; end if;
    return query select d, s.slot_label, s.start_at, s.available, s.reason, s.sitters, s.sitter_ok
      from public.porchlight_available_slots(d, p_service, p_town, p_lat, p_lng, p_sitter) s where s.slot_label = any (p_times);
  end loop;
end $$;

-- ---------------------------------------------------------------- booking with a chosen sitter

-- Each item may carry "sitter": the id the pet owner picked (or an alternate offered for that time).
-- No sitter = "anyone": left open for any free sitter to accept.
create or replace function public.porchlight_request_bookings(p_town text, p_items jsonb, p_name text, p_email text, p_phone text, p_address text, p_pets text DEFAULT NULL::text, p_notes text DEFAULT NULL::text, p_new_client boolean DEFAULT true, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_dropoff text DEFAULT NULL::text, p_trip_miles numeric DEFAULT NULL::numeric, p_trip_minutes integer DEFAULT NULL::integer, p_tip_cents integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  svc public.porchlight_services%rowtype;
  item jsonb; t timestamptz; want uuid; legacy boolean;
  gid uuid := gen_random_uuid();
  n int := 0; taken text[] := '{}';
  drop_to text := nullif(trim(coalesce(p_dropoff, '')), '');
  fare int; base_sum int := 0; ids uuid[] := '{}'; bases int[] := '{}'; bid uuid;
  tip_left int; i int; share int; ok boolean;
  tip_total int := greatest(0, least(coalesce(p_tip_cents, 0), 50000));
begin
  -- One booking at a time, so two people cannot take the same sitter and time together.
  perform pg_advisory_xact_lock(hashtext('porchlight-booking'));
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' or coalesce(trim(p_phone), '') = ''
     or coalesce(trim(p_address), '') = '' then raise exception 'Name, email, phone and address are required'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please check the email address'; end if;
  if length(p_name) > 120 or length(p_email) > 200 or length(p_phone) > 40 or length(p_address) > 300
     or length(coalesce(p_pets, '')) > 1000 or length(coalesce(p_notes, '')) > 2000
     or length(coalesce(drop_to, '')) > 300 then raise exception 'One of the fields is too long'; end if;
  if p_lat is null or p_lng is null or p_lat not between 34 and 37 or p_lng not between -83 and -79 then
    p_lat := null; p_lng := null;
  end if;
  if p_trip_miles is not null and (p_trip_miles < 0 or p_trip_miles > 2000) then p_trip_miles := null; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Pick at least one visit'; end if;
  if jsonb_array_length(p_items) > 120 then raise exception 'That is a lot of visits for one request. Please split it up or call us.'; end if;
  if (select count(distinct coalesce(group_id, id)) from public.porchlight_bookings
      where lower(client_email) = lower(trim(p_email)) and status = 'requested') >= 3 then
    raise exception 'You already have several requests waiting. We will be in touch soon.';
  end if;
  legacy := not exists (select 1 from public.porchlight_sitters where status = 'active');

  for item in select value from jsonb_array_elements(p_items) order by (value->>'start_at')::timestamptz loop
    select * into svc from public.porchlight_services where id = item->>'service';
    if not found then raise exception 'Unknown service'; end if;
    if svc.id = 'meet' then
      if (select count(*) from jsonb_array_elements(p_items) x where x->>'service' = 'meet') > 1 then
        raise exception 'One meet and greet is all you need. Please remove the extra one.';
      end if;
      if exists (select 1 from public.porchlight_bookings
                 where lower(client_email) = lower(trim(p_email)) and service_id = 'meet' and status in ('requested', 'confirmed', 'completed')) then
        raise exception 'You already have a meet and greet with us. Call us if you need to change it.';
      end if;
    end if;
    if svc.id in ('taxi', 'taxi_rt') and drop_to is null then
      raise exception 'Tell us where your pet is going (the vet, groomer or other drop-off address)';
    end if;
    t := (item->>'start_at')::timestamptz;
    if t > now() + interval '93 days' then raise exception 'We can only book up to 13 weeks ahead'; end if;
    want := case when legacy then null else nullif(item->>'sitter', '')::uuid end;

    if want is not null then
      -- a named sitter must be free at exactly this time
      ok := exists (select 1 from public.porchlight_available_slots((t at time zone 'America/New_York')::date, svc.id, p_town, p_lat, p_lng, want) s
                     where s.start_at = t and s.sitter_ok);
    else
      ok := exists (select 1 from public.porchlight_available_slots((t at time zone 'America/New_York')::date, svc.id, p_town, p_lat, p_lng, null) s
                     where s.start_at = t and s.available);
    end if;
    if not ok then
      taken := taken || to_char(t at time zone 'America/New_York', 'Dy Mon FMDD FMHH12:MI AM');
      continue;
    end if;
    fare := null;
    if svc.id in ('taxi', 'taxi_rt') and p_trip_miles is not null then
      fare := public.porchlight_taxi_fare(svc.id = 'taxi_rt', p_trip_miles);
    end if;
    insert into public.porchlight_bookings
      (service_id, town_id, start_at, end_at, client_name, client_email, client_phone, street_address, pets, notes,
       is_new_client, group_id, series_label, lat, lng, dropoff_address, trip_miles, trip_minutes, fare_cents, sitter_id)
    values (svc.id, p_town, t, t + make_interval(mins => svc.duration_min), trim(p_name), trim(p_email), trim(p_phone),
       trim(p_address), nullif(trim(p_pets), ''), nullif(trim(p_notes), ''), p_new_client, gid,
       nullif(left(trim(item->>'series'), 120), ''), p_lat, p_lng,
       case when svc.id in ('taxi', 'taxi_rt') then drop_to end,
       case when svc.id in ('taxi', 'taxi_rt') then p_trip_miles end,
       case when svc.id in ('taxi', 'taxi_rt') then p_trip_minutes end, fare, want)
    returning id into bid;
    ids := ids || bid; bases := bases || coalesce(fare, svc.price_cents); base_sum := base_sum + coalesce(fare, svc.price_cents);
    n := n + 1;
  end loop;
  if array_length(taken, 1) > 0 then
    raise exception 'These times are no longer open: %. Remove them and send again.', array_to_string(taken, ', ');
  end if;
  if tip_total > 0 and n > 0 and base_sum > 0 then
    tip_left := tip_total;
    for i in 1 .. n loop
      share := case when i = n then tip_left else round(tip_total::numeric * bases[i] / base_sum)::int end;
      share := least(share, tip_left);
      update public.porchlight_bookings set tip_cents = share where id = ids[i];
      tip_left := tip_left - share;
    end loop;
  end if;
  return jsonb_build_object('group_id', gid, 'count', n);
end $function$;

-- ---------------------------------------------------------------- sitters only see and accept work they can do

create or replace function public.porchlight_open_requests()
returns table (group_key uuid, town_id text, town_name text, services text[], n_visits integer,
               first_start timestamptz, last_start timestamptz, pets text, est_cents integer)
language plpgsql stable security definer set search_path to 'public' as $$
declare s public.porchlight_sitters;
begin
  select * into s from public.porchlight_sitters where id = public.porchlight_my_sitter_id() and status = 'active';
  if s.id is null then return; end if;
  return query
    select v.gk, min(v.town_id), min(v.town_name), array_agg(distinct v.service_id)::text[],
           count(*)::int, min(v.start_at), max(v.start_at), min(v.pets),
           coalesce(round(sum(v.price) * s.keep_pct / 100.0), 0)::int
      from (
        select coalesce(b.group_id, b.id) as gk, b.town_id, t.name as town_name, b.service_id, b.start_at, b.pets,
               case when b.service_id = 'meet' then 0
                    when b.service_id in ('taxi', 'taxi_rt') then coalesce(b.fare_cents, sv.price_cents)
                    else sv.price_cents end as price,
               public.porchlight_sitter_conflict(s.id, b.service_id, b.town_id, b.start_at, b.end_at, b.lat, b.lng) as bad
          from public.porchlight_bookings b
          left join public.porchlight_towns t on t.id = b.town_id
          left join public.porchlight_services sv on sv.id = b.service_id
         where b.sitter_id is null and b.status in ('requested', 'confirmed') and b.start_at > now()
           and (cardinality(s.services) = 0 or b.service_id = any (s.services))
           and (cardinality(s.towns) = 0 or b.town_id = any (s.towns))
      ) v
     group by v.gk
    having bool_and(v.bad is null)
     order by min(v.start_at);
end $$;

create or replace function public.porchlight_sitter_claim(p_key uuid)
returns integer language plpgsql security definer set search_path to 'public' as $$
declare s public.porchlight_sitters; n integer; c record; why text;
begin
  select * into s from public.porchlight_sitters where id = public.porchlight_my_sitter_id() for update;
  if s.id is null or s.status <> 'active' then
    raise exception 'Your sitter account is not active. Contact Porchlight.';
  end if;
  for c in select * from public.porchlight_bookings
            where (group_id = p_key or id = p_key) and sitter_id is null
              and status in ('requested', 'confirmed') and start_at > now()
  loop
    why := public.porchlight_sitter_conflict(s.id, c.service_id, c.town_id, c.start_at, c.end_at, c.lat, c.lng);
    if why is not null then
      raise exception 'That does not fit your availability (%). Update your hours on the Availability tab or skip this one.', why;
    end if;
  end loop;
  -- Visits right next to one you already have are refused even when drive time looks fine.
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

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'porchlight_sitter_conflict(uuid,text,text,timestamptz,timestamptz,double precision,double precision)',
    'porchlight_sitter_default_hours()']
  loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
  end loop;
  -- public booking page
  foreach f in array array[
    'porchlight_public_sitters(text,text)',
    'porchlight_available_slots(date,text,text,double precision,double precision,uuid)',
    'porchlight_check_slots(text,text,date[],text[],double precision,double precision,uuid)']
  loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
  foreach f in array array['porchlight_sitter_set_public(text,text)', 'porchlight_open_requests()', 'porchlight_sitter_claim(uuid)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
