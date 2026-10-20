-- Guarda de forma segura las rutas de las fotos de una incidencia.
-- Solo puede hacerlo quien creó la incidencia o el administrador.

create or replace function public.save_incident_attachments(
  p_incident_id uuid,
  p_attachments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare
  v_created_by uuid;
  v_attachments jsonb := coalesce(p_attachments, '[]'::jsonb);
begin
  if auth.uid() is null then
    raise exception 'Se necesita una sesión';
  end if;

  if jsonb_typeof(v_attachments) <> 'array' then
    raise exception 'Las fotos no tienen un formato válido';
  end if;

  select created_by
    into v_created_by
    from public.community_incident_notifications
   where id = p_incident_id;

  if v_created_by is null then
    raise exception 'No se encontró la incidencia';
  end if;

  if v_created_by <> auth.uid() and not public.is_community_chat_admin() then
    raise exception 'No tienes permiso para adjuntar fotos a esta incidencia';
  end if;

  update public.community_incident_notifications
     set attachments = v_attachments,
         updated_at = now()
   where id = p_incident_id;

  return v_attachments;
end;
$function$;

revoke all on function public.save_incident_attachments(uuid, jsonb) from public, anon;
grant execute on function public.save_incident_attachments(uuid, jsonb) to authenticated;
