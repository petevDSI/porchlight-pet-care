-- After 20261119_require_consent.sql, the web can only book through the consent wrapper.
\set ON_ERROR_STOP on
set role anon;
do $$ begin
  begin perform public.porchlight_submit_intake('{"email":"x@y.co","name":"X"}'::jsonb); raise exception 'direct intake call should be blocked';
  exception when insufficient_privilege then raise notice 'ok   direct intake call blocked'; end;
  begin perform public.porchlight_apply_sitter('{"email":"x@y.co"}'::jsonb); raise exception 'direct application call should be blocked';
  exception when insufficient_privilege then raise notice 'ok   direct application call blocked'; end;
  begin perform public.porchlight_request_bookings('belmont','[]'::jsonb,'A','a@b.co','1','x'); raise exception 'direct booking call should be blocked';
  exception when insufficient_privilege then raise notice 'ok   direct booking call blocked'; end;
end $$;
select public.porchlight_submit_intake_consent('{"email":"after@y.co","name":"After"}'::jsonb, :'owner_docs'::jsonb) is not null as wrapper_still_works;
reset role;
\echo ENFORCEMENT TESTS PASSED
