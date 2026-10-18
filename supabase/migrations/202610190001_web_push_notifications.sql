create extension if not exists pg_net with schema extensions;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin','neighbor')),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth, extensions
as $function$
declare
  v_id uuid;
  v_role text := case when public.is_community_chat_admin() then 'admin' else 'neighbor' end;
begin
  if auth.uid() is null then raise exception 'Se necesita una sesión'; end if;
  if char_length(coalesce(p_endpoint,'')) < 20 or char_length(coalesce(p_p256dh,'')) < 20 or char_length(coalesce(p_auth,'')) < 10 then
    raise exception 'La suscripción de notificaciones no es válida';
  end if;
  insert into public.push_subscriptions(user_id,role,endpoint,p256dh,auth,updated_at)
  values(auth.uid(),v_role,p_endpoint,p_p256dh,p_auth,now())
  on conflict(endpoint) do update set user_id=excluded.user_id, role=excluded.role, p256dh=excluded.p256dh, auth=excluded.auth, updated_at=now()
  returning id into v_id;
  return v_id;
end;
$function$;

revoke all on function public.save_push_subscription(text,text,text) from public, anon;
grant execute on function public.save_push_subscription(text,text,text) to authenticated;

create or replace function public.queue_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $function$
declare
  v_kind text := tg_argv[0];
  v_sender_role text := null;
  v_title text := 'Nueva actualización';
  v_body text := 'Hay novedades en la comunidad.';
begin
  if v_kind = 'chat' then
    v_sender_role := new.sender_role;
    v_title := case when new.sender_role = 'admin' then 'Nuevo mensaje del presidente' else 'Nueva respuesta de un vecino' end;
    v_body := 'Tienes un mensaje nuevo en el chat de la comunidad.';
  elsif v_kind = 'incident' then
    v_title := 'Nueva incidencia';
    v_body := 'El administrador tiene una nueva incidencia para revisar.';
  elsif v_kind = 'notice' then
    v_title := 'Nuevo aviso de la comunidad';
    v_body := 'Hay un aviso nuevo disponible en Cuartel de la Cava.';
  end if;
  perform net.http_post(
    url := 'https://kfshosgybldzqevtduem.supabase.co/functions/v1/send-push-notification',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtmc2hvc2d5YmxkenFldnRkdWVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MzU1NDMsImV4cCI6MjEwNjAxMTU0M30.nskRoEEuymA2ncfzfrAO9P2Nqud1o9X8F4USQj9c23U','x-push-webhook-secret','cfaa1273a08dc402b483b394416f13e734cf7c7f17be158a75f7820a20566ad0'),
    body := jsonb_build_object('kind',v_kind,'sender_role',v_sender_role,'title',v_title,'body',v_body)
  );
  return new;
exception when others then
  raise warning 'No se pudo encolar la notificación push: %', sqlerrm;
  return new;
end;
$function$;

drop trigger if exists community_notices_push_trigger on public.community_notices;
create trigger community_notices_push_trigger after insert on public.community_notices for each row execute function public.queue_push_notification('notice');
drop trigger if exists community_incidents_push_trigger on public.community_incident_notifications;
create trigger community_incidents_push_trigger after insert on public.community_incident_notifications for each row execute function public.queue_push_notification('incident');
drop trigger if exists community_chat_push_trigger on public.community_chat_messages;
create trigger community_chat_push_trigger after insert on public.community_chat_messages for each row execute function public.queue_push_notification('chat');
