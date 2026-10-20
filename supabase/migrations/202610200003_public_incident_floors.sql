-- Permite a los vecinos ver únicamente el piso de las incidencias ya tramitadas.
create or replace function public.get_public_incident_floors()
returns table (incident_id uuid, reporter_floor text)
language sql
security definer
set search_path = public
as $function$
  select i.id, r.floor
  from public.community_incident_notifications i
  join public.community_access_requests r
    on r.anonymous_user_id = i.created_by
   and r.status = 'approved'
  where i.status in ('reviewed', 'resolved')
    and exists (
      select 1
      from public.community_access_requests me
      where me.anonymous_user_id = auth.uid()
        and me.status = 'approved'
    );
$function$;

revoke all on function public.get_public_incident_floors() from public, anon;
grant execute on function public.get_public_incident_floors() to authenticated;
