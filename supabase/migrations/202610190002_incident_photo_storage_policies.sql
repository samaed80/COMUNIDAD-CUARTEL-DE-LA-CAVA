-- Permite que los usuarios autenticados suban y consulten las fotos de incidencias.
-- Las rutas se guardan con el id del usuario como primera carpeta.

drop policy if exists incident_photos_authenticated_select on storage.objects;
create policy incident_photos_authenticated_select
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'incident-photos');

drop policy if exists incident_photos_authenticated_insert on storage.objects;
create policy incident_photos_authenticated_insert
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'incident-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
