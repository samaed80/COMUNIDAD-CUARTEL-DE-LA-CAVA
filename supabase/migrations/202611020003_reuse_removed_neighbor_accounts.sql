-- Permite volver a utilizar un usuario o correo después de darlo de baja.
drop index if exists public.community_access_requests_email_unique_idx;
create unique index if not exists community_access_requests_email_unique_idx
  on public.community_access_requests (lower(email))
  where email is not null and status in ('pending', 'more_info', 'approved');

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
declare
  v_id uuid;
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v_username) < 3 or v_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'Elige un usuario válido'; end if;
  if position('@' in v_email) < 2 then raise exception 'Indica un correo electrónico válido'; end if;
  if length(btrim(coalesce(p_password, ''))) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  if auth.uid() is null then raise exception 'No se pudo preparar el acceso'; end if;
  if exists(select 1 from public.community_access_requests where lower(username) = v_username and status in ('pending', 'more_info', 'approved')) then raise exception 'Ese usuario ya está registrado'; end if;
  if exists(select 1 from public.community_access_requests where lower(email) = v_email and status in ('pending', 'more_info', 'approved')) then raise exception 'Ese correo ya está registrado'; end if;
  insert into public.community_access_requests(invitation_code, username, full_name, phone, floor, email, password_hash, status, anonymous_user_id)
  values(null, v_username, btrim(p_full_name), btrim(p_phone), btrim(p_floor), v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), 'pending', auth.uid())
  returning id into v_id;
  return v_id;
end;
$function$;

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
declare
  v_id uuid;
  v_existing public.community_access_requests%rowtype;
  v_invitation public.community_invitations%rowtype;
  v_username text := lower(btrim(coalesce(p_username, '')));
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if length(v_username) < 3 or v_username !~ '^[A-Za-z0-9._-]+$' then raise exception 'Elige un usuario válido'; end if;
  if position('@' in v_email) < 2 then raise exception 'Indica un correo electrónico válido'; end if;
  if length(btrim(coalesce(p_password, ''))) < 6 then raise exception 'La contraseña debe tener al menos 6 caracteres'; end if;
  if auth.uid() is null then raise exception 'Se necesita una sesión de vecino'; end if;
  select * into v_invitation
  from public.community_invitations
  where code = p_invitation_code and status in ('active', 'used') and (expires_at is null or expires_at > now())
  for update;
  if not found then raise exception 'La invitación no existe o ha caducado'; end if;
  select * into v_existing
  from public.community_access_requests
  where invitation_code = p_invitation_code and status in ('pending', 'more_info', 'approved')
  order by created_at desc limit 1
  for update;
  if found then
    if v_existing.anonymous_user_id is not null and v_existing.anonymous_user_id <> auth.uid() then raise exception 'Esta invitación ya está reservada para otro dispositivo'; end if;
    if v_existing.username is not null and lower(v_existing.username) <> v_username then raise exception 'Esta invitación ya tiene otro usuario'; end if;
    update public.community_access_requests
    set full_name = btrim(p_full_name), phone = btrim(p_phone), floor = btrim(p_floor), email = v_email, password_hash = extensions.crypt(p_password, extensions.gen_salt('bf'))
    where id = v_existing.id;
    return v_existing.id;
  end if;
  if exists(select 1 from public.community_access_requests where lower(username) = v_username and status in ('pending', 'more_info', 'approved')) then raise exception 'Ese usuario ya está registrado'; end if;
  if exists(select 1 from public.community_access_requests where lower(email) = v_email and status in ('pending', 'more_info', 'approved')) then raise exception 'Ese correo ya está registrado'; end if;
  insert into public.community_access_requests(invitation_code, username, full_name, phone, floor, email, password_hash, status, anonymous_user_id)
  values(p_invitation_code, v_username, btrim(p_full_name), btrim(p_phone), btrim(p_floor), v_email, extensions.crypt(p_password, extensions.gen_salt('bf')), 'pending', auth.uid())
  returning id into v_id;
  update public.community_invitations set status = 'used' where id = v_invitation.id;
  return v_id;
end;
$function$;