-- Correo verificado y recuperación vecinal mediante código temporal.
alter table public.community_access_requests
  add column if not exists email text;

create unique index if not exists community_access_requests_email_unique_idx
  on public.community_access_requests (lower(email))
  where email is not null and status <> 'rejected';

drop function if exists public.register_neighbor_account(text,text,text,text,text,text);
create or replace function public.register_neighbor_account(
  p_username text,
  p_full_name text,
  p_phone text,
  p_floor text,
  p_email text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare v_id uuid; v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if length(btrim(coalesce(p_username,''))) < 3 or p_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'Elige un usuario válido'; end if;
  if position('@' in v_email) < 2 then raise exception 'Indica un correo electrónico válido'; end if;
  if length(btrim(coalesce(p_password,''))) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  if auth.uid() is null then raise exception 'No se pudo preparar el acceso'; end if;
  if exists(select 1 from public.community_access_requests where lower(username)=lower(btrim(p_username)) and status<>'rejected') then raise exception 'Ese usuario ya está registrado'; end if;
  if exists(select 1 from public.community_access_requests where lower(email)=v_email and status<>'rejected') then raise exception 'Ese correo ya está registrado'; end if;
  insert into public.community_access_requests(invitation_code,username,full_name,phone,floor,email,password_hash,status,anonymous_user_id)
  values(null,lower(btrim(p_username)),btrim(p_full_name),btrim(p_phone),btrim(p_floor),v_email,extensions.crypt(p_password,extensions.gen_salt('bf')),'pending',auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

drop function if exists public.claim_neighbor_access_request(text,text,text,text,text);
drop function if exists public.claim_neighbor_access_request(text,text,text,text,text,text);
create or replace function public.claim_neighbor_access_request(
  p_invitation_code text,
  p_full_name text,
  p_phone text,
  p_floor text,
  p_username text,
  p_email text,
  p_password text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare v_id uuid; v_existing public.community_access_requests%rowtype; v_invitation public.community_invitations%rowtype; v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if length(btrim(coalesce(p_username,''))) < 3 or p_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'Elige un usuario válido'; end if;
  if position('@' in v_email) < 2 then raise exception 'Indica un correo electrónico válido'; end if;
  if length(btrim(coalesce(p_password,''))) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  if auth.uid() is null then raise exception 'Se necesita una sesión de vecino'; end if;
  select * into v_invitation from public.community_invitations where code=p_invitation_code and status in ('active','used') and (expires_at is null or expires_at>now()) for update;
  if not found then raise exception 'La invitación no existe o ha caducado'; end if;
  select * into v_existing from public.community_access_requests where invitation_code=p_invitation_code and status<>'rejected' order by created_at desc limit 1 for update;
  if found then
    if v_existing.anonymous_user_id is not null and v_existing.anonymous_user_id<>auth.uid() then raise exception 'Esta invitación ya está reservada para otro dispositivo'; end if;
    if v_existing.username is not null and lower(v_existing.username)<>lower(btrim(p_username)) then raise exception 'Esta invitación ya tiene otro usuario'; end if;
    update public.community_access_requests set full_name=btrim(p_full_name),phone=btrim(p_phone),floor=btrim(p_floor),email=v_email,password_hash=extensions.crypt(p_password,extensions.gen_salt('bf')) where id=v_existing.id;
    return v_existing.id;
  end if;
  if exists(select 1 from public.community_access_requests where lower(username)=lower(btrim(p_username)) and status<>'rejected') then raise exception 'Ese usuario ya está registrado'; end if;
  if exists(select 1 from public.community_access_requests where lower(email)=v_email and status<>'rejected') then raise exception 'Ese correo ya está registrado'; end if;
  insert into public.community_access_requests(invitation_code,username,full_name,phone,floor,email,password_hash,status,anonymous_user_id)
  values(p_invitation_code,lower(btrim(p_username)),btrim(p_full_name),btrim(p_phone),btrim(p_floor),v_email,extensions.crypt(p_password,extensions.gen_salt('bf')),'pending',auth.uid()) returning id into v_id;
  update public.community_invitations set status='used' where id=v_invitation.id;
  return v_id;
end;
$function$;

create table if not exists public.neighbor_password_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.community_access_requests(id) on delete cascade,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists neighbor_password_recovery_codes_lookup_idx
  on public.neighbor_password_recovery_codes(lower(email), expires_at desc);
alter table public.neighbor_password_recovery_codes enable row level security;
revoke all on public.neighbor_password_recovery_codes from public, anon, authenticated;

create or replace function public.store_neighbor_password_recovery(p_email text, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare v_request_id uuid; v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'No autorizado'; end if;
  select id into v_request_id from public.community_access_requests where status='approved' and lower(email)=v_email limit 1;
  if v_request_id is null then return false; end if;
  delete from public.neighbor_password_recovery_codes where access_request_id=v_request_id and used_at is null;
  insert into public.neighbor_password_recovery_codes(access_request_id,email,code_hash,expires_at)
  values(v_request_id,v_email,extensions.crypt(p_code,extensions.gen_salt('bf')),now()+interval '10 minutes');
  return true;
end;
$function$;

create or replace function public.complete_neighbor_password_recovery(p_email text, p_code text, p_new_password text)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare v_recovery public.neighbor_password_recovery_codes%rowtype; v_email text := lower(btrim(coalesce(p_email,'')));
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'No autorizado'; end if;
  if length(coalesce(p_new_password,'')) < 8 then raise exception 'La nueva contraseña debe tener al menos 8 caracteres'; end if;
  select * into v_recovery from public.neighbor_password_recovery_codes where lower(email)=v_email and used_at is null and expires_at>now() order by created_at desc limit 1;
  if not found or extensions.crypt(coalesce(p_code,''),v_recovery.code_hash)<>v_recovery.code_hash then raise exception 'El código no es válido o ha caducado'; end if;
  update public.community_access_requests set password_hash=extensions.crypt(p_new_password,extensions.gen_salt('bf')) where id=v_recovery.access_request_id and status='approved';
  if not found then raise exception 'La cuenta vecinal no está disponible'; end if;
  update public.neighbor_password_recovery_codes set used_at=now() where id=v_recovery.id;
  return true;
end;
$function$;

revoke all on function public.store_neighbor_password_recovery(text,text) from public, anon, authenticated;
revoke all on function public.complete_neighbor_password_recovery(text,text,text) from public, anon, authenticated;
grant execute on function public.store_neighbor_password_recovery(text,text) to service_role;
grant execute on function public.complete_neighbor_password_recovery(text,text,text) to service_role;
drop function if exists public.reset_neighbor_password(text,text,text);
