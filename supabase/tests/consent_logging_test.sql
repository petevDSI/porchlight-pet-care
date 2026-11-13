-- Run with supabase/tests/run_consent_tests.sh. Every check raises an exception if it fails.
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

-- ---- the web (anon) role books 2 dogs + a cat: one walk, one overnight, one meet
set role anon;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1","user-agent":"TestBrowser/1.0"}', false);
create temp table res (j jsonb);
grant all on res to anon;
insert into res select public.porchlight_book_with_consent(jsonb_build_object(
  'town','belmont','name','Pat Owner','email','Pat@Example.com','phone','7045551212','address','1 Main St','pets','Bailey, Miso (dogs); Whiskers (cat)',
  'items', jsonb_build_array(
    jsonb_build_object('service','walk','start_at','2026-12-01T14:00:00Z'),
    jsonb_build_object('service','overnight','start_at','2026-12-02T23:00:00Z'),
    jsonb_build_object('service','meet','start_at','2026-11-30T14:00:00Z')),
  'animals', jsonb_build_object('total', 3, 'others', 'Whiskers, indoor cat, has an automatic feeder'),
  'safety', jsonb_build_object('cameras','disclosed','camera_notes','Doorbell camera at front door, outdoors only','no_hidden_cameras',true,'people_in_home','none'),
  'consents', :'owner_overnight'::jsonb));
reset role;

select pg_temp.check((select (j->>'extra_animals')::int from res) = 2, 'cat plus two dogs = 2 additional animals');
select pg_temp.check((select fare_cents from public.porchlight_bookings where service_id='walk') = 3000 + 2*500, 'walk fare = $30 + 2 x $5');
select pg_temp.check((select fare_cents from public.porchlight_bookings where service_id='overnight') = 9900 + 2*500, 'overnight fare = $99 + 2 x $5');
select pg_temp.check((select fare_cents from public.porchlight_bookings where service_id='meet') is null, 'meet and greet has no extra-animal charge');
select pg_temp.check((select count(*) from public.porchlight_bookings where animals_in_home = 3) = 3, 'animal count saved on every booking in the group');
select pg_temp.check((select extra_animal_cents from public.porchlight_bookings where service_id='overnight') = 1000, 'extra_animal_cents saved');
select pg_temp.check((select count(*) from public.porchlight_consents where context='booking') = 6, 'six consent rows (one per document) for an overnight booking');
select pg_temp.check((select bool_and(booking_group_id = (select (j->>'group_id')::uuid from res)) from public.porchlight_consents), 'consents point at the booking group');
select pg_temp.check((select bool_and(email = 'pat@example.com' and ip = '203.0.113.9' and user_agent = 'TestBrowser/1.0') from public.porchlight_consents), 'email lowercased, IP and browser captured');
select pg_temp.check((select (details->>'extra_animals')::int = 2 and details->>'cameras' = 'disclosed' from public.porchlight_consents limit 1), 'animal and camera facts stored with the consent');
select pg_temp.check((select est from public.porchlight_open_requests()) = 3000+1000+9900+1000, 'sitter estimate uses amount due including extra animals');

-- ---- things that must fail
set role anon;
select pg_temp.expect_error($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','walk','start_at','2026-12-05T14:00:00Z')), 'animals', jsonb_build_object('total',1))) $q$, 'agreement boxes');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','overnight','start_at','2026-12-05T23:00:00Z')),
  'animals', jsonb_build_object('total',1), 'safety', jsonb_build_object('cameras','none','no_hidden_cameras',true), 'consents', %L::jsonb)) $q$, :'owner_docs'), 'agreement boxes');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','walk','start_at','2026-12-05T14:00:00Z')),
  'animals', jsonb_build_object('total',1), 'consents', %L::jsonb)) $q$, :'stale'), 'agreement boxes');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','walk','start_at','2026-12-05T14:00:00Z')),
  'animals', jsonb_build_object('total',1), 'consents', %L::jsonb)) $q$,
  (select jsonb_agg(case when x->>'doc_key'='terms' then jsonb_set(x,'{sha256}',to_jsonb(repeat('0',64))) else x end)::text from jsonb_array_elements(:'owner_docs'::jsonb) x)), 'was updated');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','overnight','start_at','2026-12-05T23:00:00Z')),
  'animals', jsonb_build_object('total',1), 'safety', jsonb_build_object('cameras','none'), 'consents', %L::jsonb)) $q$, :'owner_overnight'), 'hidden cameras');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','overnight','start_at','2026-12-05T23:00:00Z')),
  'animals', jsonb_build_object('total',1), 'safety', jsonb_build_object('cameras','disclosed','no_hidden_cameras',true), 'consents', %L::jsonb)) $q$, :'owner_overnight'), 'where each camera');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x','pets','Rex',
  'items', jsonb_build_array(jsonb_build_object('service','walk','start_at','2026-12-05T14:00:00Z')),
  'animals', jsonb_build_object('total',0), 'consents', %L::jsonb)) $q$, :'owner_docs'), 'at least one');
select pg_temp.expect_error(format($q$ select public.porchlight_book_with_consent(jsonb_build_object('town','belmont','name','A','email','a@b.co','phone','1','address','x',
  'items', jsonb_build_array(jsonb_build_object('service','walk','start_at','2026-12-05T14:00:00Z')),
  'animals', jsonb_build_object('total',3), 'consents', %L::jsonb)) $q$, :'owner_docs'), 'list each animal');
select pg_temp.expect_error($q$ select count(*) from public.porchlight_consents $q$, 'permission denied');   -- anon cannot read the log
reset role;
select pg_temp.check((select count(*) from public.porchlight_bookings) = 3, 'failed bookings left no bookings behind');
select pg_temp.check((select count(*) from public.porchlight_consents) = 6, 'failed bookings left no consent rows behind');

-- ---- the log cannot be edited or deleted, even by the database owner
select pg_temp.expect_error($q$ update public.porchlight_consents set email = 'x@y.z' $q$, 'cannot be changed');
select pg_temp.expect_error($q$ delete from public.porchlight_consents $q$, 'cannot be changed');

-- ---- intake and sitter application
set role anon;
select public.porchlight_submit_intake_consent(jsonb_build_object('email','New@Client.com','name','New Client','pets', jsonb_build_array(jsonb_build_object('name','Rex'))), :'owner_docs'::jsonb);
select public.porchlight_apply_sitter_consent(jsonb_build_object('email','sitter@x.com','name','S'), :'sitter_app'::jsonb);
select pg_temp.expect_error(format($q$ select public.porchlight_apply_sitter_consent(jsonb_build_object('email','s2@x.com','name','S'), %L::jsonb) $q$, :'owner_docs'), 'agreement boxes');
reset role;
select pg_temp.check((select count(*) from public.porchlight_consents where context='intake') = 5, 'intake saved five consents');
select pg_temp.check((select count(*) from public.porchlight_consents where context='sitter_application') = 3, 'sitter application saved three consents');
select pg_temp.check((select client_id is not null from public.porchlight_consents where context='intake' limit 1), 'intake consent linked to the new client');

-- ---- signed-in portal: status lists what is missing, accepting clears it
select set_config('test.email', 'new@client.com', false);
set role authenticated;
select pg_temp.check(jsonb_array_length(public.porchlight_consent_status()->'missing') = 0, 'a client who accepted at intake has nothing missing');
reset role;
insert into public.porchlight_legal_docs (doc_key, version, title, sha256, url) values ('owner', '2027-01-01', 'Owner Service Agreement and Release', repeat('a',64), '/legal/owner-agreement');
set role authenticated;
select pg_temp.check((public.porchlight_consent_status()->'missing'->0->>'doc_key') = 'owner' and jsonb_array_length(public.porchlight_consent_status()->'missing') = 1, 'a new version of one document is requested again');
select public.porchlight_record_consents(jsonb_build_array(jsonb_build_object('doc_key','owner','version','2027-01-01','sha256',repeat('a',64),'text','I agree to the new Owner Service Agreement.')));
select pg_temp.check(jsonb_array_length(public.porchlight_consent_status()->'missing') = 0, 'accepting the new version clears it');
select pg_temp.check((select count(*) from public.porchlight_consents) >= 1, 'a person can read their own consents');
select pg_temp.check((select count(*) from public.porchlight_consents where lower(email) <> 'new@client.com') = 0, 'a person sees only their own consents');
reset role;
-- an old version can no longer be accepted
set role authenticated;
select pg_temp.expect_error(format($q$ select public.porchlight_record_consents(%L::jsonb) $q$, jsonb_build_array(jsonb_build_object('doc_key','owner','version','2026-11-13','sha256',(select sha256 from public.porchlight_legal_docs where doc_key='owner' and version='2026-11-13'),'text','I agree to the old agreement.'))), 'was updated');
reset role;

-- ---- staff can read everything
select set_config('test.staff', 'yes', false);
set role authenticated;
select pg_temp.check((select count(distinct lower(email)) from public.porchlight_consents) >= 3, 'staff can read every consent');
reset role;
select set_config('test.staff', '', false);

\echo ALL CONSENT TESTS PASSED
