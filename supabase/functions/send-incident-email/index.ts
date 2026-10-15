import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://samaed80.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Vary": "Origin",
  });
  if (origin && allowedOrigins.has(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Access-Control-Allow-Headers", "authorization, apikey, content-type, x-client-info");
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  if (request.method === "OPTIONS") return response("ok", 200, origin);
  if (request.method !== "POST" || (origin && !allowedOrigins.has(origin))) {
    return response({ ok: false, error: "Solicitud no permitida." }, 403, origin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const webhookUrl = Deno.env.get("INCIDENT_EMAIL_WEBHOOK_URL");
  const webhookSecret = Deno.env.get("INCIDENT_EMAIL_SECRET");
  if (!supabaseUrl || !anonKey || !serviceKey || !webhookUrl || !webhookSecret) {
    return response({ ok: false, error: "El servicio de correo no está configurado." }, 503, origin);
  }

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.replace(/^Bearer\s+/i, "");
  if (!accessToken) return response({ ok: false, error: "Sesión requerida." }, 401, origin);

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user?.email) {
    return response({ ok: false, error: "Sesión no válida." }, 401, origin);
  }

  const adminClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: adminEmail, error: adminError } = await adminClient.rpc(
    "resolve_admin_username",
    { p_username: "administrador" },
  );
  if (adminError || !adminEmail || String(authData.user.email).toLowerCase() !== String(adminEmail).toLowerCase()) {
    return response({ ok: false, error: "Solo el administrador puede tramitar incidencias." }, 403, origin);
  }

  let payload: { incident_id?: string; incident?: Record<string, unknown> };
  try {
    payload = await request.json();
  } catch {
    return response({ ok: false, error: "Solicitud inválida." }, 400, origin);
  }
  const incidentId = String(payload.incident_id || "");
  const incident = payload.incident || {};
  if (!incidentId || String(incident.id || "") !== incidentId) {
    return response({ ok: false, error: "Incidencia no válida." }, 400, origin);
  }

  const { data: savedIncident, error: incidentError } = await adminClient
    .from("community_incident_notifications")
    .select("id,type,status")
    .eq("id", incidentId)
    .maybeSingle();
  if (incidentError || !savedIncident) {
    return response({ ok: false, error: "No se encontró la incidencia." }, 404, origin);
  }
  if (String(savedIncident.type || "").toLowerCase() !== "incidencia" || String(savedIncident.status || "").toLowerCase() !== "pending") {
    return response({ ok: false, error: "Solo se puede enviar el aviso al tramitar una incidencia pendiente." }, 409, origin);
  }

  const reporterName = String(incident.neighbor_name || incident.reporter_name || incident.full_name || incident.username || "Vecino");
  const reporterPhone = String(incident.neighbor_phone || incident.phone || "No indicado");
  const reporterFloor = String(incident.neighbor_floor || incident.floor || "No indicado");
  const reporterUsername = String(incident.neighbor_username || incident.username || "No indicado");
  const title = String(incident.title || "Incidencia");
  const message = String(incident.message || incident.text || "");
  const location = String(incident.location || "No indicada");
  const body = `Hola, administrador de la Comunidad Cuartel de la Cava:\n\nEl vecino ${reporterName}, teléfono ${reporterPhone}, piso ${reporterFloor} y usuario ${reporterUsername}, comunica una incidencia.\n\nTítulo: ${title}\nMensaje: ${message}\nZona o portal: ${location}\n\nEste mensaje se ha enviado desde la aplicación de la comunidad.`;

  try {
    const mailResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        secret: webhookSecret,
        action: "tramitado",
        type: "Incidencia",
        sender_email: "cuarteldelacava@gmail.com",
        recipient_email: "santamariamata@gmail.com",
        from: "cuarteldelacava@gmail.com",
        to: "santamariamata@gmail.com",
        subject: `[Comunidad Cuartel de la Cava] INCIDENCIA de ${reporterName}`,
        title,
        message: body,
        body,
        incident_message: message,
        location,
        neighbor_name: reporterName,
        neighbor_phone: reporterPhone,
        neighbor_floor: reporterFloor,
        neighbor_username: reporterUsername,
        incident_id: incidentId,
        idempotency_key: incidentId,
      }),
    });
    const result = await mailResponse.json().catch(() => null);
    if (!mailResponse.ok || !result?.ok) {
      return response({ ok: false, error: "El servicio de correo rechazó la incidencia." }, 502, origin);
    }
    return response({ ok: true }, 200, origin);
  } catch {
    return response({ ok: false, error: "No se pudo conectar con el servicio de correo." }, 502, origin);
  }
});
