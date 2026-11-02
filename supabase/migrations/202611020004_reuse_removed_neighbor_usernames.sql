-- La baja debe liberar también el nombre de usuario.
alter table public.community_access_requests
  drop constraint if exists community_access_requests_username_key;

drop index if exists public.community_access_requests_username_key;
create unique index if not exists community_access_requests_username_unique_idx
  on public.community_access_requests (lower(username))
  where username is not null and status in ('pending', 'more_info', 'approved');