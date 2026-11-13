-- Privacy features the policies promise:
--   * Sitters see a client's details only for a confirmed visit assigned to them, until 3 days after (already true)
--     and now never see the client's email or exact home coordinates.
--   * Access codes (lockbox, door, alarm, Wi-Fi) are shown to the assigned sitter only around the visit
--     (from 2 hours before it starts until 2 hours after it ends), and each reveal is logged.
--   * Retention: access codes are removed 30 days after a client's last booking (or when the client asks);
--     check-in and check-out GPS coordinates are removed 90 days after the visit.
--
-- The sitter portal reads the client file through porchlight_visit_client() instead of the table, so the codes can be
-- withheld outside the window. Staff still read the table directly.
--
-- ORDER: apply with the sitter-rates migration, before 20261117_consent_logging.sql.

-- ---------------------------------------------------------------- sitters no longer read client rows directly

drop policy if exists "sitter sees served clients" on public.porchlight_clients;

create table if not exists public.porchlight_access_log (
  id bigserial primary key,
  booking_id uuid not null references public.porchlight_bookings (id) on delete cascade,
  sitter_id uuid references public.porchlight_sitters (id) on delete set null,
  viewed_at timestamptz not null default now()
);
alter table public.porchlight_access_log enable row level security;
revoke all on public.porchlight_access_log from anon, authenticated;
grant select on public.porchlight_access_log to authenticated;
drop policy if exists "staff read access log" on public.porchlight_access_log;
create policy "staff read access log" on public.porchlight_access_log
  for select to authenticated using (public.porchlight_is_staff());

-- Seconds either side of the visit during which the assigned sitter may see the codes.
create or replace function public.porchlight_code_window()
returns interval language sql immutable as $$ select interval '2 hours' $$;

-- The client file for a visit. Staff get the whole row. The assigned sitter gets the visit-relevant fields only,
-- and the access codes only inside the window around the visit.
create or replace function public.porchlight_visit_client(p_booking uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b public.porchlight_bookings; c jsonb; w interval := public.porchlight_code_window(); open_now boolean;
begin
  select * into b from public.porchlight_bookings where id = p_booking;
  if b.id is null or b.client_id is null then return null; end if;
  select to_jsonb(x) into c from public.porchlight_clients x where x.id = b.client_id;
  if c is null then return null; end if;
  if public.porchlight_is_staff() then return c; end if;

  if b.sitter_id is distinct from public.porchlight_my_sitter_id() or b.sitter_id is null
     or b.status not in ('confirmed', 'completed') or b.start_at <= now() - interval '3 days' then
    raise exception 'Not allowed.';
  end if;

  -- never needed by a sitter
  c := c - 'email' - 'lat' - 'lng' - 'agreed_at' - 'how_heard' - 'created_at' - 'updated_at';

  open_now := b.status = 'confirmed' and now() between b.start_at - w and b.end_at + w;
  if open_now then
    insert into public.porchlight_access_log (booking_id, sitter_id) values (b.id, b.sitter_id);
    return c || jsonb_build_object('codes_locked', false);
  end if;
  return (c - 'lockbox_code' - 'door_code' - 'alarm_code' - 'wifi')
         || jsonb_build_object('codes_locked', true, 'codes_from', b.start_at - w);
end $$;
revoke all on function public.porchlight_visit_client(uuid) from public, anon;
grant execute on function public.porchlight_visit_client(uuid) to authenticated;

-- ---------------------------------------------------------------- retention

-- A client can remove their saved access codes at any time.
create or replace function public.porchlight_clear_my_codes()
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  update public.porchlight_clients
     set lockbox_code = null, door_code = null, alarm_code = null, wifi = null
   where lower(email) = public.porchlight_my_email() and public.porchlight_my_email() <> '';
end $$;
revoke all on function public.porchlight_clear_my_codes() from public, anon;
grant execute on function public.porchlight_clear_my_codes() to authenticated;

-- Removes what the privacy policy says we no longer keep. Returns how many rows changed.
create or replace function public.porchlight_purge_retention()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare n_codes int; n_gps int; n_log int;
begin
  -- Access codes: 30 days after the client's last booking (or after sign-up when there is none).
  update public.porchlight_clients c
     set lockbox_code = null, door_code = null, alarm_code = null, wifi = null
   where (c.lockbox_code is not null or c.door_code is not null or c.alarm_code is not null or c.wifi is not null)
     and coalesce((select max(b.end_at) from public.porchlight_bookings b
                    where b.client_id = c.id and b.status in ('requested', 'confirmed', 'completed')), c.created_at)
         < now() - interval '30 days';
  get diagnostics n_codes = row_count;

  -- Check-in and check-out coordinates: 90 days after the visit.
  update public.porchlight_visit_reports r
     set arrive_lat = null, arrive_lng = null, arrive_acc_m = null,
         depart_lat = null, depart_lng = null, depart_acc_m = null
   where (r.arrive_lat is not null or r.arrive_lng is not null or r.depart_lat is not null or r.depart_lng is not null)
     and exists (select 1 from public.porchlight_bookings b
                  where b.id = r.booking_id and b.start_at < now() - interval '90 days');
  get diagnostics n_gps = row_count;

  -- The code-view log is kept 90 days.
  delete from public.porchlight_access_log where viewed_at < now() - interval '90 days';
  get diagnostics n_log = row_count;

  return jsonb_build_object('codes_cleared', n_codes, 'gps_cleared', n_gps, 'access_log_deleted', n_log);
end $$;
revoke all on function public.porchlight_purge_retention() from public, anon, authenticated;

-- Run it every night at 3:15 (UTC) when pg_cron is available. If it is not, call the function from a scheduled job.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'porchlight-retention';
    perform cron.schedule('porchlight-retention', '15 3 * * *', 'select public.porchlight_purge_retention()');
  end if;
exception when others then
  raise notice 'Could not schedule porchlight-retention (%). Run public.porchlight_purge_retention() on a schedule instead.', sqlerrm;
end $$;
