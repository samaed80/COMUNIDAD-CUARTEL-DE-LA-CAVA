-- Ajuste singleton por proyecto/comunidad y seguimiento independiente del correo.
create table if not exists public.community_settings (
  id boolean primary key default true check (id = true),
  automatic_incident_email boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid
);
insert into public.community_settings (id, automatic_incident_email)
values (true, false) on conflict (id) do nothing;
alter table public.community_settings enable row level security;
revoke all on public.community_settings from anon, authenticated;

alter table public.community_incident_notifications
  add column if not exists email_status text not null default 'not_sent',
  add column if not exists email_error text;
alter table public.community_incident_notifications
  drop constraint if exists community_incident_notifications_email_status_check;
alter table public.community_incident_notifications
  add constraint community_incident_notifications_email_status_check
  check (email_status in ('not_sent','sending','sent','failed'));

create or replace function public.get_incident_email_setting()
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare v_admin_email text; v_enabled boolean;
begin
  if auth.uid() is null then raise exception 'Se necesita una sesión'; end if;
  select public.resolve_admin_username('administrador') into v_admin_email;
  if v_admin_email is null or lower(coalesce(auth.jwt()->>'email','')) <> lower(v_admin_email) then
    raise exception 'Solo el administrador puede consultar este ajuste';
  end if;
  select automatic_incident_email into v_enabled from public.community_settings where id = true;
  return coalesce(v_enabled, false);
end;
$function$;

create or replace function public.set_incident_email_setting(p_enabled boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare v_admin_email text;
begin
  if auth.uid() is null then raise exception 'Se necesita una sesión'; end if;
  select public.resolve_admin_username('administrador') into v_admin_email;
  if v_admin_email is null or lower(coalesce(auth.jwt()->>'email','')) <> lower(v_admin_email) then
    raise exception 'Solo el administrador puede cambiar este ajuste';
  end if;
  insert into public.community_settings(id, automatic_incident_email, updated_at, updated_by)
  values (true, coalesce(p_enabled,false), now(), auth.uid())
  on conflict (id) do update set automatic_incident_email = excluded.automatic_incident_email,
    updated_at = excluded.updated_at, updated_by = excluded.updated_by;
  return coalesce(p_enabled,false);
end;
$function$;

revoke all on function public.get_incident_email_setting() from public, anon;
revoke all on function public.set_incident_email_setting(boolean) from public, anon;
grant execute on function public.get_incident_email_setting() to authenticated;
grant execute on function public.set_incident_email_setting(boolean) to authenticated;
