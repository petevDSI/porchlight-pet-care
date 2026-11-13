-- Lets a pet owner see who their sitter is. Depends on 20261113/14/15 sitter migrations.
-- Returns only public profile info (display name, photo, bio) for the signed-in client's own visits.
create or replace function public.porchlight_my_visit_sitters()
returns table (booking_id uuid, sitter_name text, photo_path text, bio text)
language sql stable security definer set search_path to 'public' as $$
  select b.id,
         coalesce(nullif(trim(s.display_name), ''),
                  split_part(trim(s.name), ' ', 1) ||
                  case when position(' ' in trim(s.name)) > 0 then ' ' || left(split_part(trim(s.name), ' ', 2), 1) || '.' else '' end),
         s.photo_path, s.bio
    from public.porchlight_bookings b
    join public.porchlight_sitters s on s.id = b.sitter_id
   where lower(b.client_email) = public.porchlight_my_email() and public.porchlight_my_email() <> ''
     and b.status in ('requested', 'confirmed', 'completed')
$$;
revoke all on function public.porchlight_my_visit_sitters() from public, anon;
grant execute on function public.porchlight_my_visit_sitters() to authenticated;
