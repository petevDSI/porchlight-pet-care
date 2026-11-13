-- Sitter headshots for the public booking page. Depends on 20261113_sitters.sql and 20261114_sitter_availability.sql.
-- Photos live in a PUBLIC bucket because the booking page shows them to anyone. Only upload a headshot you are
-- happy to show publicly. Sitters can write only inside their own folder (<sitter id>/...); staff can write anywhere.

alter table public.porchlight_sitters add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('porchlight-sitter-photos', 'porchlight-sitter-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "staff manage sitter photos" on storage.objects;
create policy "staff manage sitter photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'porchlight-sitter-photos' and public.porchlight_is_staff())
  with check (bucket_id = 'porchlight-sitter-photos' and public.porchlight_is_staff());

drop policy if exists "sitter manages own photos" on storage.objects;
create policy "sitter manages own photos" on storage.objects
  for all to authenticated
  using (bucket_id = 'porchlight-sitter-photos' and (storage.foldername(name))[1] = public.porchlight_my_sitter_id()::text)
  with check (bucket_id = 'porchlight-sitter-photos' and (storage.foldername(name))[1] = public.porchlight_my_sitter_id()::text);

-- A sitter points their profile at a photo they uploaded to their own folder.
create or replace function public.porchlight_sitter_set_photo(p_path text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare sid uuid := public.porchlight_my_sitter_id();
begin
  if sid is null then raise exception 'Not a sitter account.'; end if;
  if p_path is not null and (p_path not like sid::text || '/%' or length(p_path) > 200) then
    raise exception 'That photo is not in your folder.';
  end if;
  update public.porchlight_sitters set photo_path = p_path, updated_at = now() where id = sid;
end $$;
revoke all on function public.porchlight_sitter_set_photo(text) from public, anon;
grant execute on function public.porchlight_sitter_set_photo(text) to authenticated;

-- Public list now includes the photo path.
drop function if exists public.porchlight_public_sitters(text, text);
create or replace function public.porchlight_public_sitters(p_town text, p_service text)
returns table (id uuid, display_name text, bio text, photo_path text)
language sql stable security definer set search_path to 'public' as $$
  select s.id,
         coalesce(nullif(trim(s.display_name), ''),
                  split_part(trim(s.name), ' ', 1) ||
                  case when position(' ' in trim(s.name)) > 0 then ' ' || left(split_part(trim(s.name), ' ', 2), 1) || '.' else '' end),
         s.bio, s.photo_path
    from public.porchlight_sitters s
   where s.status = 'active'
     and (cardinality(s.towns) = 0 or p_town = any (s.towns))
     and (cardinality(s.services) = 0 or p_service = any (s.services))
     and exists (select 1 from public.porchlight_sitter_hours h where h.sitter_id = s.id)
   order by 2
$$;
revoke all on function public.porchlight_public_sitters(text, text) from public;
grant execute on function public.porchlight_public_sitters(text, text) to anon, authenticated;
