-- Sitter-set rates with a Porchlight minimum fee, and card-only payments.
--
-- Model
--  * Porchlight publishes a suggested price for each service (porchlight_services.price_cents).
--  * A sitter may set their own price for walk, visit, overnight and home within a band around the suggested price
--    (porchlight_pay_settings.rate_floor_pct .. rate_cap_pct, default 50% to 200%, whole dollars).
--    No custom rate means the suggested price.
--  * An owner who picks a sitter pays that sitter's price. "Anyone available" bookings pay the suggested price.
--  * Porchlight's fee comes out of the sitter's price. It is the greater of
--      - the minimum fee: fee_pct of the SUGGESTED price (12% of $30 = $3.60 on a $30 session), and
--      - fee_pct of the sitter's price.
--    A sitter who charges less than suggested still pays the minimum fee (the shortfall comes out of the sitter's pay).
--    A sitter who charges more pays a larger fee, so Porchlight earns more.
--  * Extra-animal charges are not part of the fee base: the sitter keeps all of them.
--  * The fee is snapshotted on each booking when a sitter is assigned (porchlight_bookings.porchlight_fee_cents), so
--    changing a rate or the percentage never changes past visits.
--  * Clients pay by card only (Stripe). Venmo, Zelle, check and cash are gone. Sitters are paid out by Porchlight
--    (method: bank, stripe or other).
--
-- ORDER: apply before 20261117_consent_logging.sql.

-- ---------------------------------------------------------------- settings and columns

alter table public.porchlight_pay_settings
  add column if not exists fee_pct integer not null default 12 check (fee_pct between 0 and 50),
  add column if not exists rate_floor_pct integer not null default 50 check (rate_floor_pct between 10 and 100),
  add column if not exists rate_cap_pct integer not null default 200 check (rate_cap_pct between 100 and 500);

alter table public.porchlight_services
  add column if not exists min_fee_cents integer check (min_fee_cents is null or min_fee_cents >= 0);

alter table public.porchlight_bookings
  add column if not exists extra_animal_cents integer not null default 0 check (extra_animal_cents >= 0),
  add column if not exists porchlight_fee_cents integer check (porchlight_fee_cents is null or porchlight_fee_cents >= 0);

-- No more manual payment details.
update public.porchlight_pay_settings set venmo_handle = null, zelle_contact = null, discount_cents = 0 where id = 'main';

create or replace function public.porchlight_pay_info()
returns jsonb language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('card_enabled', coalesce(card_enabled, false), 'card_fee_cents', 0, 'discount_cents', 0)
  from public.porchlight_pay_settings where id = 'main'
$$;

-- ---------------------------------------------------------------- sitter rates

create table if not exists public.porchlight_sitter_rates (
  sitter_id uuid not null references public.porchlight_sitters (id) on delete cascade,
  service_id text not null references public.porchlight_services (id) on delete cascade,
  price_cents integer not null check (price_cents > 0),
  updated_at timestamptz not null default now(),
  primary key (sitter_id, service_id)
);
alter table public.porchlight_sitter_rates enable row level security;
revoke all on public.porchlight_sitter_rates from anon, authenticated;
grant select on public.porchlight_sitter_rates to authenticated;
drop policy if exists "staff manage sitter rates" on public.porchlight_sitter_rates;
create policy "staff manage sitter rates" on public.porchlight_sitter_rates
  for all to authenticated using (public.porchlight_is_staff()) with check (public.porchlight_is_staff());
drop policy if exists "sitter reads own rates" on public.porchlight_sitter_rates;
create policy "sitter reads own rates" on public.porchlight_sitter_rates
  for select to authenticated using (sitter_id = public.porchlight_my_sitter_id());

-- Services a sitter can price. Pet taxi is priced by distance and the meet and greet is free.
create or replace function public.porchlight_rateable_services()
returns text[] language sql immutable as $$ select array['walk', 'visit', 'overnight', 'home'] $$;

-- Porchlight's fee on a base price (extra-animal charges excluded). See the model above.
create or replace function public.porchlight_fee_cents(p_service text, p_base_cents integer)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select case
      when p_service = 'meet' or coalesce(p_base_cents, 0) <= 0 then 0
      else least(p_base_cents, greatest(
             case when p_service = any (public.porchlight_rateable_services())
                  then coalesce(sv.min_fee_cents, round(sv.price_cents * st.fee_pct / 100.0)::int) else 0 end,
             round(p_base_cents * st.fee_pct / 100.0)::int))
    end
    from public.porchlight_services sv cross join public.porchlight_pay_settings st
    where sv.id = p_service and st.id = 'main'), 0)
$$;

-- What a sitter charges for a service: their own rate, or the suggested price. A null sitter means "anyone available".
create or replace function public.porchlight_sitter_rate(p_sitter uuid, p_service text)
returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(
    (select r.price_cents from public.porchlight_sitter_rates r
      where r.sitter_id = p_sitter and r.service_id = p_service and p_service = any (public.porchlight_rateable_services())),
    (select price_cents from public.porchlight_services where id = p_service))
$$;

-- A sitter (or staff for a sitter) sets a price. Null resets to the suggested price.
create or replace function public.porchlight_set_sitter_rate(p_service text, p_cents integer, p_sitter uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sid uuid := coalesce(p_sitter, public.porchlight_my_sitter_id()); pub integer; st public.porchlight_pay_settings; lo integer; hi integer;
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  if sid is distinct from public.porchlight_my_sitter_id() and not public.porchlight_is_staff() then raise exception 'Not allowed.'; end if;
  if not (p_service = any (public.porchlight_rateable_services())) then raise exception 'That service has a fixed price.'; end if;
  if p_cents is null then
    delete from public.porchlight_sitter_rates where sitter_id = sid and service_id = p_service;
    return;
  end if;
  select price_cents into pub from public.porchlight_services where id = p_service;
  select * into st from public.porchlight_pay_settings where id = 'main';
  lo := ceil(pub * st.rate_floor_pct / 100.0)::int; hi := floor(pub * st.rate_cap_pct / 100.0)::int;
  if p_cents % 100 <> 0 then raise exception 'Please use whole dollars.'; end if;
  if p_cents < lo or p_cents > hi then
    raise exception 'Your price for this service must be between $% and $%.', lo / 100, hi / 100;
  end if;
  insert into public.porchlight_sitter_rates (sitter_id, service_id, price_cents) values (sid, p_service, p_cents)
    on conflict (sitter_id, service_id) do update set price_cents = excluded.price_cents, updated_at = now();
end $$;

-- Everything the rate screen needs, for the signed-in sitter (or staff for a given sitter).
create or replace function public.porchlight_my_rates(p_sitter uuid default null)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $$
declare sid uuid := coalesce(p_sitter, public.porchlight_my_sitter_id()); st public.porchlight_pay_settings;
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  if sid is distinct from public.porchlight_my_sitter_id() and not public.porchlight_is_staff() then raise exception 'Not allowed.'; end if;
  select * into st from public.porchlight_pay_settings where id = 'main';
  return jsonb_build_object('fee_pct', st.fee_pct, 'services', coalesce((
    select jsonb_agg(jsonb_build_object(
             'service_id', sv.id, 'label', sv.label, 'suggested_cents', sv.price_cents,
             'mine_cents', r.price_cents,
             'min_cents', ceil(sv.price_cents * st.rate_floor_pct / 100.0)::int,
             'max_cents', floor(sv.price_cents * st.rate_cap_pct / 100.0)::int,
             'min_fee_cents', coalesce(sv.min_fee_cents, round(sv.price_cents * st.fee_pct / 100.0)::int))
           order by sv.sort_order, sv.id)
      from public.porchlight_services sv
      left join public.porchlight_sitter_rates r on r.sitter_id = sid and r.service_id = sv.id
     where sv.id = any (public.porchlight_rateable_services())), '[]'::jsonb));
end $$;

-- Owners see each sitter's price on the booking page.
create or replace function public.porchlight_public_sitter_rates()
returns table (sitter_id uuid, service_id text, price_cents integer)
language sql stable security definer set search_path to 'public' as $$
  select r.sitter_id, r.service_id, r.price_cents
    from public.porchlight_sitter_rates r join public.porchlight_sitters s on s.id = r.sitter_id
   where s.status = 'active' and r.service_id = any (public.porchlight_rateable_services())
$$;

-- ---------------------------------------------------------------- fee snapshot on bookings

create or replace function public.porchlight_bookings_snapshot()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare base integer;
begin
  if tg_op = 'UPDATE' and old.payout_id is not null and old.sitter_id is distinct from new.sitter_id then
    raise exception 'This visit has already been paid out to a sitter and cannot be reassigned.';
  end if;
  if new.sitter_id is null then
    new.sitter_keep_pct := null;
    new.porchlight_fee_cents := null;
  else
    if tg_op = 'INSERT' or old.sitter_id is distinct from new.sitter_id then
      select keep_pct into new.sitter_keep_pct from public.porchlight_sitters where id = new.sitter_id;
    end if;
    if not (tg_op = 'UPDATE' and old.payout_id is not null) then
      base := coalesce(new.fare_cents, (select price_cents from public.porchlight_services where id = new.service_id), 0)
              - coalesce(new.extra_animal_cents, 0);
      new.porchlight_fee_cents := public.porchlight_fee_cents(new.service_id, greatest(base, 0));
    end if;
  end if;
  return new;
end $$;

drop trigger if exists porchlight_bookings_snapshot on public.porchlight_bookings;
create trigger porchlight_bookings_snapshot
  before insert or update of sitter_id, fare_cents, extra_animal_cents on public.porchlight_bookings
  for each row execute function public.porchlight_bookings_snapshot();

-- ---------------------------------------------------------------- earnings

drop function if exists public.porchlight_sitter_earnings(uuid);
drop function if exists public.porchlight_earn_rows(uuid);

-- One row per completed visit. share = what the client paid for the visit minus Porchlight's fee, plus tips.
-- Visits assigned before this change have no fee snapshot and keep the old percentage rule.
create function public.porchlight_earn_rows(p_sitter uuid)
returns table (booking_id uuid, start_at timestamptz, service_id text, town_id text, collected_cents integer,
               tip_cents integer, fee_cents integer, keep_pct integer, share_cents integer, payout_id uuid, paid_out_at timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select b.id, b.start_at, b.service_id, b.town_id,
         coalesce(p.amt, 0)::int, coalesce(p.tip, 0)::int, f.fee::int, b.sitter_keep_pct,
         (greatest(coalesce(p.amt, 0) - f.fee, 0) + coalesce(p.tip, 0))::int,
         b.payout_id, po.created_at
    from public.porchlight_bookings b
    left join (select booking_id, sum(amount_cents) amt, sum(coalesce(tip_cents, 0)) tip
                 from public.porchlight_payments group by booking_id) p on p.booking_id = b.id
    left join public.porchlight_payouts po on po.id = b.payout_id
    cross join lateral (select case when coalesce(p.amt, 0) = 0 then 0
                                    when b.porchlight_fee_cents is not null then b.porchlight_fee_cents
                                    else p.amt - round(p.amt * coalesce(b.sitter_keep_pct, 88) / 100.0) end as fee) f
   where b.sitter_id = p_sitter and b.status = 'completed'
$$;
revoke all on function public.porchlight_earn_rows(uuid) from public, anon, authenticated;

create function public.porchlight_sitter_earnings(p_sitter uuid default null)
returns table (booking_id uuid, start_at timestamptz, service_id text, town_id text, collected_cents integer,
               tip_cents integer, fee_cents integer, keep_pct integer, share_cents integer, payout_id uuid, paid_out_at timestamptz)
language plpgsql stable security definer set search_path to 'public' as $$
declare v uuid := coalesce(p_sitter, public.porchlight_my_sitter_id());
begin
  if v is null then return; end if;
  if v is distinct from public.porchlight_my_sitter_id() and not public.porchlight_is_staff() then
    raise exception 'Not allowed.';
  end if;
  return query select * from public.porchlight_earn_rows(v) e order by e.start_at desc limit 500;
end $$;

drop function if exists public.porchlight_open_requests();
-- Open work this sitter could accept, with what they would take home after Porchlight's fee.
-- Open requests are priced at the suggested price. No client names, phone numbers or addresses.
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
           coalesce(sum(case when v.service_id = 'meet' then 0
                             else greatest(v.price - public.porchlight_fee_cents(v.service_id, greatest(v.price - v.extra, 0)), 0) end), 0)::int
      from (
        select coalesce(b.group_id, b.id) as gk, b.town_id, t.name as town_name, b.service_id, b.start_at, b.pets,
               case when b.service_id = 'meet' then 0 else coalesce(b.fare_cents, sv.price_cents) end as price,
               coalesce(b.extra_animal_cents, 0) as extra,
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

-- ---------------------------------------------------------------- payouts: bank, stripe or other (no Venmo, Zelle, check or cash)

alter table public.porchlight_sitters drop constraint if exists porchlight_sitters_payout_method_check;
alter table public.porchlight_sitters drop constraint if exists porchlight_sitters_payout_method_v2;
alter table public.porchlight_sitters add constraint porchlight_sitters_payout_method_v2
  check (payout_method is null or payout_method in ('bank', 'stripe', 'other')) not valid;
alter table public.porchlight_payouts drop constraint if exists porchlight_payouts_method_check;
alter table public.porchlight_payouts drop constraint if exists porchlight_payouts_method_v2;
alter table public.porchlight_payouts add constraint porchlight_payouts_method_v2
  check (method in ('bank', 'stripe', 'other')) not valid;

create or replace function public.porchlight_sitter_update_me(p_phone text, p_method text, p_handle text, p_paused boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sid uuid := public.porchlight_my_sitter_id();
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  if p_method is not null and p_method not in ('bank', 'stripe', 'other') then
    raise exception 'Choose how you would like to be paid.';
  end if;
  -- Bank details are never typed into this app, so any handle is ignored.
  update public.porchlight_sitters
     set phone = nullif(left(trim(p_phone), 40), ''),
         payout_method = p_method,
         payout_handle = null,
         status = case when p_paused then 'paused' else 'active' end,
         updated_at = now()
   where id = sid;
end $$;

create or replace function public.porchlight_record_payout(p_sitter uuid, p_method text, p_reference text, p_note text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare total integer; ids uuid[]; pid uuid;
begin
  if not public.porchlight_is_staff() then raise exception 'Not allowed.'; end if;
  if p_method not in ('bank', 'stripe', 'other') then raise exception 'Choose how you paid.'; end if;
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

-- ---------------------------------------------------------------- grants

do $$
declare f text;
begin
  foreach f in array array[
    'porchlight_set_sitter_rate(text,integer,uuid)', 'porchlight_my_rates(uuid)', 'porchlight_sitter_earnings(uuid)',
    'porchlight_open_requests()', 'porchlight_sitter_update_me(text,text,text,boolean)', 'porchlight_record_payout(uuid,text,text,text)']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  revoke all on function public.porchlight_public_sitter_rates() from public;
  grant execute on function public.porchlight_public_sitter_rates() to anon, authenticated;
  revoke all on function public.porchlight_fee_cents(text, integer) from public, anon, authenticated;
  revoke all on function public.porchlight_sitter_rate(uuid, text) from public, anon, authenticated;
  revoke all on function public.porchlight_pay_info() from public;
  grant execute on function public.porchlight_pay_info() to anon, authenticated;
end $$;
