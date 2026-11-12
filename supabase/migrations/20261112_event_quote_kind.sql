-- Adds a fourth quote type, 'event' (pet wedding and special event attendant).
-- Events use the venue as the single location (no destination), and weddings are
-- often booked more than a year ahead, so the date window is 18 months for events.

alter table public.porchlight_quotes drop constraint porchlight_quotes_kind_check;
alter table public.porchlight_quotes add constraint porchlight_quotes_kind_check
  check (kind = any (array['flight'::text, 'transport'::text, 'local'::text, 'event'::text]));

create or replace function public.porchlight_request_quote(
  p_kind text, p_name text, p_email text, p_phone text, p_pet_desc text, p_pet_count integer,
  p_pet_weight integer, p_from text, p_to text, p_date date, p_flexible boolean, p_notes text default null::text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare qid uuid;
begin
  if p_kind not in ('flight', 'transport', 'local', 'event') then raise exception 'Unknown trip type'; end if;
  if coalesce(trim(p_name), '') = '' or coalesce(trim(p_email), '') = '' or coalesce(trim(p_phone), '') = ''
     or coalesce(trim(p_pet_desc), '') = '' or coalesce(trim(p_from), '') = '' or (p_kind not in ('local', 'event') and coalesce(trim(p_to), '') = '') then
    raise exception 'Please fill in your name, email, phone, pet, and where the trip starts and ends';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Please check the email address'; end if;
  if length(p_name) > 120 or length(p_email) > 200 or length(p_phone) > 40 or length(p_pet_desc) > 600
     or length(p_from) > 200 or length(p_to) > 200 or length(coalesce(p_notes, '')) > 2000 then
    raise exception 'One of the fields is too long';
  end if;
  if p_date is not null and (p_date < current_date or p_date > current_date + (case when p_kind = 'event' then 548 else 365 end)) then
    raise exception 'Please choose a date within the next %', case when p_kind = 'event' then '18 months' else 'year' end;
  end if;
  if (select count(*) from public.porchlight_quotes where lower(email) = lower(trim(p_email)) and status in ('new', 'quoted')) >= 3 then
    raise exception 'You already have several quote requests open. We will be in touch soon.';
  end if;
  insert into public.porchlight_quotes (kind, name, email, phone, pet_desc, pet_count, pet_weight_lb, from_place, to_place, travel_date, flexible, notes)
  values (p_kind, trim(p_name), trim(p_email), trim(p_phone), trim(p_pet_desc), greatest(1, least(coalesce(p_pet_count, 1), 10)),
          p_pet_weight, trim(p_from), trim(p_to), p_date, coalesce(p_flexible, false), nullif(trim(p_notes), ''))
  returning id into qid;
  return jsonb_build_object('id', qid);
end $function$;
