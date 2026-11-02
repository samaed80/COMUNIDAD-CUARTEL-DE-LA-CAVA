create or replace function public.attach_incident_photos(
  p_incident_id uuid,
  p_attachments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  saved_attachments jsonb;
begin
  if auth.uid() is null then
    raise exception 'Se necesita una sesión';
  end if;

  if jsonb_typeof(coalesce(p_attachments, '[]'::jsonb)) <> 'array' then
    raise exception 'Las fotos deben enviarse como una lista';
  end if;

  update public.community_incident_notifications
  set attachments = coalesce(p_attachments, '[]'::jsonb),
      updated_at = now()
  where id = p_incident_id
    and created_by = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'No se pudo guardar la foto en esta incidencia';
  end if;

  select attachments into saved_attachments
  from public.community_incident_notifications
  where id = p_incident_id;

  return saved_attachments;
end;
$function$;

revoke all on function public.attach_incident_photos(uuid, jsonb) from public;
grant execute on function public.attach_incident_photos(uuid, jsonb) to authenticated;
