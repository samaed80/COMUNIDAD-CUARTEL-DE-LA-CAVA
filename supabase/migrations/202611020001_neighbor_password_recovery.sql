-- Recuperación de contraseña vecinal mediante usuario y teléfono verificados.
create or replace function public.reset_neighbor_password(
  p_username text,
  p_phone text,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
begin
  if auth.uid() is null then
    raise exception 'Se necesita una sesión';
  end if;
  if char_length(coalesce(p_new_password,'')) < 8 then
    raise exception 'La nueva contraseña debe tener al menos 8 caracteres';
  end if;

  update public.community_access_requests
  set password_hash = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  where status = 'approved'
    and lower(btrim(coalesce(username,''))) = lower(btrim(coalesce(p_username,'')))
    and regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
    and char_length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 7;

  if not found then
    raise exception 'No se ha podido verificar el usuario y el teléfono';
  end if;
  return true;
end;
$function$;

revoke all on function public.reset_neighbor_password(text,text,text) from public, anon;
grant execute on function public.reset_neighbor_password(text,text,text) to authenticated;
