-- Makes the agreement checkboxes impossible to skip.
--
-- APPLY THIS LAST, only after the new site (which calls the *_consent functions) is live.
-- Until then the original public functions stay open so the current site keeps working.
--
-- After this, the web can no longer call the original booking, intake or application functions directly.
-- The *_consent wrappers still call them (they run with the database owner's rights), so each of those
-- three actions can only happen together with a saved consent record.

revoke all on function public.porchlight_request_bookings(text, jsonb, text, text, text, text, text, text, boolean, double precision, double precision, text, numeric, integer, integer) from public, anon, authenticated;
revoke all on function public.porchlight_submit_intake(jsonb) from public, anon, authenticated;
revoke all on function public.porchlight_apply_sitter(jsonb) from public, anon, authenticated;
