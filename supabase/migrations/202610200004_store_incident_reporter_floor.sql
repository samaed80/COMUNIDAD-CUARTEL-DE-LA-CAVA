-- Conserva el piso del vecino al crear la incidencia para que no dependa de la sesión anónima posterior.
alter table public.community_incident_notifications
  add column if not exists reporter_floor text;

create or replace function public.notify_new_incident(
  p_title text,
  p_message text,
  p_location text default null,
  p_type text default 'Incidencia'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare
  v_id uuid;
  v_floor text;
begin
  if auth.uid() is null then
    raise exception 'Se necesita una sesión de vecino';
  end if;

  select floor into v_floor
  from public.community_access_requests
  where anonymous_user_id = auth.uid()
    and status = 'approved'
  order by last_seen_at desc nulls last, created_at desc
  limit 1;

  insert into public.community_incident_notifications(
    title, message, location, type, created_by, reporter_floor
  )
  values (
    trim(p_title),
    trim(p_message),
    nullif(trim(p_location), ''),
    coalesce(nullif(trim(p_type), ''), 'Incidencia'),
    auth.uid(),
    v_floor
  )
  returning id into v_id;

  return v_id;
end;
$function$;

create or replace function public.get_public_incident_floors()
returns table (incident_id uuid, reporter_floor text)
language sql
security definer
set search_path = public
as $function$
  select i.id, coalesce(i.reporter_floor, r.floor)
  from public.community_incident_notifications i
  left join public.community_access_requests r
    on r.anonymous_user_id = i.created_by
   and r.status = 'approved'
  where i.status in ('reviewed', 'resolved')
    and (i.reporter_floor is not null or r.floor is not null)
    and exists (
      select 1
      from public.community_access_requests me
      where me.anonymous_user_id = auth.uid()
        and me.status = 'approved'
    );
$function$;

revoke all on function public.get_public_incident_floors() from public, anon;
grant execute on function public.get_public_incident_floors() to authenticated;
