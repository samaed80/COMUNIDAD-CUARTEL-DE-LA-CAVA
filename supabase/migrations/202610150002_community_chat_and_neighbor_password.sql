-- Chat privado administrador-vecino y cambio de contraseña de cuentas vecinales.
create table if not exists public.community_chat_messages (
  id uuid primary key default gen_random_uuid(),
  access_request_id uuid not null references public.community_access_requests(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  sender_role text not null check (sender_role in ('admin','neighbor')),
  message text not null check (char_length(btrim(message)) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index if not exists community_chat_messages_request_created_idx
  on public.community_chat_messages(access_request_id, created_at);

alter table public.community_chat_messages enable row level security;
revoke all on public.community_chat_messages from anon, authenticated;
grant select on public.community_chat_messages to authenticated;
create or replace function public.is_community_chat_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $function$
  select coalesce(
    lower(coalesce(auth.jwt()->>'email','')) =
    lower(coalesce(public.resolve_admin_username('administrador'),'__not_admin__')),
    false
  );
$function$;

create or replace function public.is_community_chat_participant(p_access_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth, extensions
as $function$
  select coalesce(
    exists (
      select 1 from public.community_access_requests r
      where r.id = p_access_request_id and r.status = 'approved'
    )
    and (
      public.is_community_chat_admin()
      or exists (
        select 1 from public.community_access_requests r
        where r.id = p_access_request_id
          and r.status = 'approved'
          and r.anonymous_user_id = auth.uid()
      )
    ),
    false
  );
$function$;

drop policy if exists community_chat_messages_participant_select on public.community_chat_messages;
create policy community_chat_messages_participant_select
  on public.community_chat_messages
  for select to authenticated
  using (public.is_community_chat_participant(access_request_id));

create or replace function public.get_my_community_chat_request_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth, extensions
as $function$
  select r.id
  from public.community_access_requests r
  where r.status = 'approved'
    and r.anonymous_user_id = auth.uid()
  order by r.last_seen_at desc nulls last, r.created_at desc
  limit 1;
$function$;

create or replace function public.send_community_chat_message(
  p_access_request_id uuid,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare
  v_role text;
  v_id uuid;
  v_message text := btrim(coalesce(p_message,''));
begin
  if auth.uid() is null then raise exception 'Se necesita una sesión'; end if;
  if char_length(v_message) < 1 or char_length(v_message) > 2000 then
    raise exception 'El mensaje debe tener entre 1 y 2000 caracteres';
  end if;
  if not public.is_community_chat_participant(p_access_request_id) then
    raise exception 'No tienes acceso a esta conversación';
  end if;
  if public.is_community_chat_admin() then
    v_role := 'admin';
  elsif exists (
    select 1 from public.community_access_requests r
    where r.id = p_access_request_id
      and r.status = 'approved'
      and r.anonymous_user_id = auth.uid()
  ) then
    v_role := 'neighbor';
  else
    raise exception 'No tienes acceso a esta conversación';
  end if;
  insert into public.community_chat_messages(access_request_id,sender_id,sender_role,message)
  values (p_access_request_id,auth.uid(),v_role,v_message)
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.mark_community_chat_read(p_access_request_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_community_chat_participant(p_access_request_id) then
    raise exception 'No tienes acceso a esta conversación';
  end if;
  update public.community_chat_messages
  set read_at = now()
  where access_request_id = p_access_request_id
    and sender_id <> auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

create or replace function public.change_neighbor_password(
  p_current_password text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
begin
  if auth.uid() is null then raise exception 'Se necesita una sesión'; end if;
  if char_length(coalesce(p_new_password,'')) < 8 then
    raise exception 'La nueva contraseña debe tener al menos 8 caracteres';
  end if;
  update public.community_access_requests
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where anonymous_user_id = auth.uid()
    and status = 'approved'
    and password_hash is not null
    and extensions.crypt(coalesce(p_current_password,''),password_hash) = password_hash;
  if not found then
    raise exception 'La contraseña actual no es correcta o la sesión vecinal ya no es válida';
  end if;
  return true;
end;
$function$;

revoke all on function public.is_community_chat_admin() from public, anon;
revoke all on function public.is_community_chat_participant(uuid) from public, anon;
revoke all on function public.get_my_community_chat_request_id() from public, anon;
revoke all on function public.send_community_chat_message(uuid,text) from public, anon;
revoke all on function public.mark_community_chat_read(uuid) from public, anon;
revoke all on function public.change_neighbor_password(text,text) from public, anon;
grant execute on function public.is_community_chat_admin() to authenticated;
grant execute on function public.is_community_chat_participant(uuid) to authenticated;
grant execute on function public.get_my_community_chat_request_id() to authenticated;
grant execute on function public.send_community_chat_message(uuid,text) to authenticated;
grant execute on function public.mark_community_chat_read(uuid) to authenticated;
grant execute on function public.change_neighbor_password(text,text) to authenticated;
