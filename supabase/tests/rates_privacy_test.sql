-- Sitter rates, Porchlight's minimum fee, online-only payouts, and the privacy window/retention.
-- Run by supabase/tests/run_consent_tests.sh after the consent tests. Every check raises an exception if it fails.
\set ON_ERROR_STOP on
\set QUIET on
create or replace function pg_temp.expect_error(q text, needle text) returns void language plpgsql as $$
begin
  begin execute q; exception when others then
    if sqlerrm like '%' || needle || '%' then return; end if;
    raise exception 'Wanted error containing "%", got "%"', needle, sqlerrm;
  end;
  raise exception 'Expected an error containing "%" but the call succeeded', needle;
end $$;
create or replace function pg_temp.check(ok boolean, what text) returns void language plpgsql as $$
begin if not ok then raise exception 'FAILED: %', what; end if; raise notice 'ok   %', what; end $$;

-- ---------------------------------------------------------------- the fee
select pg_temp.check(public.porchlight_fee_cents('walk', 3000) = 360, 'fee on the suggested $30 walk is $3.60');
select pg_temp.check(public.porchlight_fee_cents('walk', 2000) = 360, 'a sitter charging $20 still pays the $3.60 minimum');
select pg_temp.check(public.porchlight_fee_cents('walk', 5000) = 600, 'a sitter charging $50 pays 12% = $6.00');
select pg_temp.check(public.porchlight_fee_cents('walk', 200) = 200, 'the fee never exceeds the price');
select pg_temp.check(public.porchlight_fee_cents('meet', 0) = 0, 'the meet and greet has no fee');
select pg_temp.check(public.porchlight_fee_cents('taxi', 2000) = 240, 'taxi: percentage only, no minimum');
update public.porchlight_services set min_fee_cents = 400 where id = 'walk';
select pg_temp.check(public.porchlight_fee_cents('walk', 3000) = 400, 'a per-service minimum fee override is honored');
update public.porchlight_services set min_fee_cents = null where id = 'walk';

-- ---------------------------------------------------------------- sitters set their price
insert into public.porchlight_sitters (id, email, name, status) values
  ('00000000-0000-0000-0000-0000000000b1', 'hi@example.com', 'High Hannah', 'active'),
  ('00000000-0000-0000-0000-0000000000b2', 'lo@example.com', 'Low Leo', 'active');
select set_config('test.sitter', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select public.porchlight_set_sitter_rate('walk', 4000);
select pg_temp.expect_error($q$ select public.porchlight_set_sitter_rate('walk', 1400) $q$, 'must be between $15 and $60');
select pg_temp.expect_error($q$ select public.porchlight_set_sitter_rate('walk', 6100) $q$, 'must be between');
select pg_temp.expect_error($q$ select public.porchlight_set_sitter_rate('walk', 3050) $q$, 'whole dollars');
select pg_temp.expect_error($q$ select public.porchlight_set_sitter_rate('taxi', 3000) $q$, 'fixed price');
select pg_temp.expect_error($q$ select public.porchlight_set_sitter_rate('walk', 3000, '00000000-0000-0000-0000-0000000000b2') $q$, 'Not allowed');
select pg_temp.check((select count(*) from jsonb_array_elements(public.porchlight_my_rates()->'services') e where e->>'service_id' = 'walk' and (e->>'mine_cents')::int = 4000 and (e->>'min_cents')::int = 1500 and (e->>'max_cents')::int = 6000) >= 1, 'rate screen shows my price and the allowed range');
reset role;
select set_config('test.sitter', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;
select public.porchlight_set_sitter_rate('walk', 2000);
reset role;
select set_config('test.sitter', '', false);

-- ---------------------------------------------------------------- bookings are priced from the chosen sitter
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.20","user-agent":"T/1"}', false);
create temp table r2 (j jsonb);
grant all on r2 to anon;
insert into r2 select public.porchlight_book_with_consent(jsonb_build_object(
  'town','belmont','name','Rate Owner','email','rate@example.com','phone','7045551212','address','2 Main St','pets','Rex (dog); Tom (cat)',
  'items', jsonb_build_array(
    jsonb_build_object('service','walk','start_at','2027-01-05T14:00:00Z','sitter','00000000-0000-0000-0000-0000000000b1'),
    jsonb_build_object('service','walk','start_at','2027-01-06T14:00:00Z','sitter','00000000-0000-0000-0000-0000000000b2'),
    jsonb_build_object('service','walk','start_at','2027-01-07T14:00:00Z')),
  'animals', jsonb_build_object('total', 2, 'others', 'Tom, cat', 'extra_care', true),
  'consents', :'owner_docs'::jsonb));
reset role;
select pg_temp.check((select fare_cents from public.porchlight_bookings where start_at = '2027-01-05T14:00:00Z') = 4000 + 500, 'high-priced sitter: $40 + $5 extra animal');
select pg_temp.check((select porchlight_fee_cents from public.porchlight_bookings where start_at = '2027-01-05T14:00:00Z') = 480, '...Porchlight earns 12% of $40 = $4.80 (more than the minimum)');
select pg_temp.check((select fare_cents from public.porchlight_bookings where start_at = '2027-01-06T14:00:00Z') = 2000 + 500, 'low-priced sitter: $20 + $5 extra animal');
select pg_temp.check((select porchlight_fee_cents from public.porchlight_bookings where start_at = '2027-01-06T14:00:00Z') = 360, '...Porchlight still gets the $3.60 minimum; the sitter absorbs it');
select pg_temp.check((select fare_cents from public.porchlight_bookings where start_at = '2027-01-07T14:00:00Z') = 3000 + 500, '"anyone available" pays the suggested price');
select pg_temp.check((select porchlight_fee_cents from public.porchlight_bookings where start_at = '2027-01-07T14:00:00Z') is null, 'no fee is snapshotted until a sitter is assigned');
-- claiming snapshots the fee
update public.porchlight_bookings set sitter_id = '00000000-0000-0000-0000-0000000000b2', status = 'confirmed' where start_at = '2027-01-07T14:00:00Z';
select pg_temp.check((select porchlight_fee_cents from public.porchlight_bookings where start_at = '2027-01-07T14:00:00Z') = 360, 'assigning a sitter snapshots the fee on the suggested price');
-- changing the sitter's rate later does not change a past booking
select set_config('test.sitter', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
select public.porchlight_set_sitter_rate('walk', 5000);
reset role;
select set_config('test.sitter', '', false);
select pg_temp.check((select fare_cents from public.porchlight_bookings where start_at = '2027-01-05T14:00:00Z') = 4500, 'a later rate change does not reprice an existing booking');

-- ---------------------------------------------------------------- earnings: price - fee + tips; extras stay with the sitter
update public.porchlight_bookings set status = 'completed' where start_at in ('2027-01-05T14:00:00Z', '2027-01-06T14:00:00Z');
insert into public.porchlight_payments (booking_id, amount_cents, tip_cents)
  select id, fare_cents, case when start_at = '2027-01-06T14:00:00Z' then 300 else 0 end from public.porchlight_bookings where start_at in ('2027-01-05T14:00:00Z', '2027-01-06T14:00:00Z');
select pg_temp.check((select share_cents from public.porchlight_earn_rows('00000000-0000-0000-0000-0000000000b1')) = 4500 - 480, 'high sitter takes home $45 - $4.80');
select pg_temp.check((select share_cents from public.porchlight_earn_rows('00000000-0000-0000-0000-0000000000b2')) = 2500 - 360 + 300, 'low sitter takes home $25 - $3.60 + $3 tip');
select pg_temp.check((select fee_cents from public.porchlight_earn_rows('00000000-0000-0000-0000-0000000000b2')) = 360, 'the fee column shows the minimum fee');

-- ---------------------------------------------------------------- payouts: online methods only
select set_config('test.staff', 'yes', false);
set role authenticated;
select pg_temp.expect_error($q$ select public.porchlight_record_payout('00000000-0000-0000-0000-0000000000b2', 'venmo', null, null) $q$, 'Choose how you paid');
select pg_temp.expect_error($q$ select public.porchlight_record_payout('00000000-0000-0000-0000-0000000000b2', 'cash', null, null) $q$, 'Choose how you paid');
select public.porchlight_record_payout('00000000-0000-0000-0000-0000000000b2', 'bank', 'ACH-1', null);
reset role;
select pg_temp.check((select amount_cents from public.porchlight_payouts where sitter_id = '00000000-0000-0000-0000-0000000000b2') = 2440, 'payout recorded for the exact earnings');
select pg_temp.check((select count(*) from public.porchlight_earn_rows('00000000-0000-0000-0000-0000000000b2') where payout_id is not null) = 1, 'the visit is marked paid out once');
select pg_temp.expect_error($q$ insert into public.porchlight_payouts (sitter_id, amount_cents, method) values (null, 1, 'zelle') $q$, 'violates check constraint');
select set_config('test.staff', '', false);
select set_config('test.sitter', '00000000-0000-0000-0000-0000000000b2', false);
set role authenticated;
select pg_temp.expect_error($q$ select public.porchlight_sitter_update_me('7045550000', 'venmo', '@x', false) $q$, 'Choose how you would like to be paid');
select public.porchlight_sitter_update_me('7045550000', 'bank', 'ignored', false);
reset role;
select pg_temp.check((select payout_handle is null and payout_method = 'bank' from public.porchlight_sitters where id = '00000000-0000-0000-0000-0000000000b2'), 'no payment handles are stored');
select set_config('test.sitter', '', false);
select pg_temp.check((select (public.porchlight_pay_info() ->> 'discount_cents')::int = 0 and not (public.porchlight_pay_info() ? 'venmo') and not (public.porchlight_pay_info() ? 'zelle')), 'the payment info the web sees has no Venmo or Zelle');

-- ---------------------------------------------------------------- privacy: code window and what a sitter never sees
insert into public.porchlight_clients (id, email, name, address, phone, lockbox_code, door_code, alarm_code, wifi, key_notes, lat, lng)
  values ('00000000-0000-0000-0000-0000000000c1', 'cl@example.com', 'Cleo Client', '3 Oak', '7045559999', '1234', '5678', '9999', 'pw', 'side door', 35.2, -81.0);
insert into public.porchlight_bookings (id, service_id, start_at, end_at, client_name, client_email, sitter_id, status, client_id) values
  ('00000000-0000-0000-0000-0000000000d1', 'walk', now() + interval '5 hours', now() + interval '5.5 hours', 'Cleo', 'cl@example.com', '00000000-0000-0000-0000-0000000000b1', 'confirmed', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d2', 'walk', now() + interval '30 minutes', now() + interval '1 hour', 'Cleo', 'cl@example.com', '00000000-0000-0000-0000-0000000000b1', 'confirmed', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d3', 'walk', now() - interval '2 days', now() - interval '2 days' + interval '30 minutes', 'Cleo', 'cl@example.com', '00000000-0000-0000-0000-0000000000b1', 'completed', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d4', 'walk', now() - interval '4 days', now() - interval '4 days' + interval '30 minutes', 'Cleo', 'cl@example.com', '00000000-0000-0000-0000-0000000000b1', 'completed', '00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000d5', 'walk', now() + interval '30 minutes', now() + interval '1 hour', 'Cleo', 'cl@example.com', '00000000-0000-0000-0000-0000000000b2', 'confirmed', '00000000-0000-0000-0000-0000000000c1');
select set_config('test.sitter', '00000000-0000-0000-0000-0000000000b1', false);
set role authenticated;
create temp table v1 as select public.porchlight_visit_client('00000000-0000-0000-0000-0000000000d1') j;
create temp table v2 as select public.porchlight_visit_client('00000000-0000-0000-0000-0000000000d2') j;
create temp table v3 as select public.porchlight_visit_client('00000000-0000-0000-0000-0000000000d3') j;
select pg_temp.check((select j->>'name' = 'Cleo Client' and j->>'address' = '3 Oak' and j->>'key_notes' = 'side door' from v1), 'sitter sees the name, address and entry notes for their visit');
select pg_temp.check((select not (j ? 'lockbox_code') and not (j ? 'door_code') and not (j ? 'alarm_code') and not (j ? 'wifi') and (j->>'codes_locked')::boolean from v1), 'codes are withheld more than 2 hours before the visit');
select pg_temp.check((select j->>'lockbox_code' = '1234' and j->>'alarm_code' = '9999' and j->>'wifi' = 'pw' and not (j->>'codes_locked')::boolean from v2), 'codes appear inside the window around the visit');
select pg_temp.check((select not (j ? 'lockbox_code') and (j->>'codes_locked')::boolean from v3), 'codes are gone again after the visit window');
select pg_temp.check((select not (j ? 'email') and not (j ? 'lat') and not (j ? 'lng') from v2), 'sitter never gets the client email or exact coordinates');
select pg_temp.expect_error($q$ select public.porchlight_visit_client('00000000-0000-0000-0000-0000000000d4') $q$, 'Not allowed');
select pg_temp.expect_error($q$ select public.porchlight_visit_client('00000000-0000-0000-0000-0000000000d5') $q$, 'Not allowed');
reset role;
select set_config('test.sitter', '', false);
select pg_temp.check((select count(*) from public.porchlight_access_log where booking_id = '00000000-0000-0000-0000-0000000000d2') = 1, 'the one reveal of the codes was logged');
select pg_temp.check((select count(*) from public.porchlight_access_log where booking_id = '00000000-0000-0000-0000-0000000000d1') = 0, 'a locked view is not logged as a reveal');
select set_config('test.staff', 'yes', false);
set role authenticated;
select pg_temp.check((public.porchlight_visit_client('00000000-0000-0000-0000-0000000000d1')->>'lockbox_code') = '1234', 'staff always see the full file');
reset role;
select set_config('test.staff', '', false);

-- ---------------------------------------------------------------- retention
insert into public.porchlight_clients (id, email, name, lockbox_code, door_code, created_at) values
  ('00000000-0000-0000-0000-0000000000c2', 'old@example.com', 'Old Client', '1111', '2222', now() - interval '200 days'),
  ('00000000-0000-0000-0000-0000000000c3', 'new@example.com', 'Recent Client', '3333', null, now() - interval '200 days'),
  ('00000000-0000-0000-0000-0000000000c4', 'fresh@example.com', 'Fresh Client', '4444', null, now());
insert into public.porchlight_bookings (id, service_id, start_at, end_at, client_name, client_email, status, client_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'walk', now() - interval '45 days', now() - interval '45 days' + interval '30 minutes', 'x', 'old@example.com', 'completed', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000e2', 'walk', now() - interval '10 days', now() - interval '10 days' + interval '30 minutes', 'x', 'new@example.com', 'completed', '00000000-0000-0000-0000-0000000000c3'),
  ('00000000-0000-0000-0000-0000000000e3', 'walk', now() - interval '120 days', now() - interval '120 days' + interval '30 minutes', 'x', 'old@example.com', 'completed', '00000000-0000-0000-0000-0000000000c2'),
  ('00000000-0000-0000-0000-0000000000e4', 'walk', now() - interval '20 days', now() - interval '20 days' + interval '30 minutes', 'x', 'old@example.com', 'completed', '00000000-0000-0000-0000-0000000000c1');
insert into public.porchlight_visit_reports (booking_id, arrive_lat, arrive_lng, arrive_acc_m, depart_lat, depart_lng, depart_acc_m) values
  ('00000000-0000-0000-0000-0000000000e3', 35.1, -81.0, 20, 35.1, -81.0, 20),
  ('00000000-0000-0000-0000-0000000000e4', 35.1, -81.0, 20, 35.1, -81.0, 20);
select public.porchlight_purge_retention();
select pg_temp.check((select lockbox_code is null and door_code is null from public.porchlight_clients where id = '00000000-0000-0000-0000-0000000000c2'), 'codes are removed 30 days after the last booking');
select pg_temp.check((select lockbox_code = '3333' from public.porchlight_clients where id = '00000000-0000-0000-0000-0000000000c3'), 'codes are kept while the client has booked in the last 30 days');
select pg_temp.check((select lockbox_code = '4444' from public.porchlight_clients where id = '00000000-0000-0000-0000-0000000000c4'), 'a brand-new client with no bookings keeps codes for the first 30 days');
select pg_temp.check((select arrive_lat is null and depart_lng is null and arrive_acc_m is null from public.porchlight_visit_reports where booking_id = '00000000-0000-0000-0000-0000000000e3'), 'check-in and check-out coordinates are removed after 90 days');
select pg_temp.check((select arrive_lat is not null from public.porchlight_visit_reports where booking_id = '00000000-0000-0000-0000-0000000000e4'), 'coordinates are kept inside the 90 days');
-- a client can remove their own codes
select set_config('test.email', 'fresh@example.com', false);
set role authenticated;
select public.porchlight_clear_my_codes();
reset role;
select set_config('test.email', '', false);
select pg_temp.check((select lockbox_code is null from public.porchlight_clients where id = '00000000-0000-0000-0000-0000000000c4'), 'a client can remove their own codes at any time');
select pg_temp.check((select lockbox_code is not null from public.porchlight_clients where id = '00000000-0000-0000-0000-0000000000c3'), '...and only their own');
\echo rates and privacy tests passed
