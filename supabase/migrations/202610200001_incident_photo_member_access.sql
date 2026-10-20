-- Restringe las fotos de incidencias al administrador y a vecinos aprobados.
-- Las fotos siguen siendo comunitarias: cualquier miembro aprobado puede consultarlas.

create or replace function public.can_access_community_incident_photos()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $function$
  select coalesce(
    public.is_community_chat_admin()
    or exists (
      select 1
      from public.community_access_requests r
      where r.status = 'approved'
        and r.anonymous_user_id = auth.uid()
    ),
    false
  );
$function$;

revoke all on function public.can_access_community_incident_photos() from public, anon;
grant execute on function public.can_access_community_incident_photos() to authenticated;

drop policy if exists incident_photos_authenticated_select on storage.objects;
create policy incident_photos_community_member_select
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'incident-photos'
    and public.can_access_community_incident_photos()
  );

drop policy if exists incident_photos_authenticated_insert on storage.objects;
drop policy if exists incident_photos_community_member_insert on storage.objects;
create policy incident_photos_community_member_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'incident-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_access_community_incident_photos()
  );
