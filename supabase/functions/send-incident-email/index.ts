import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const allowedOrigins = new Set([
  "https://samaed80.github.io",
  "http://localhost:8000",
  "http://127.0.0.1:8000",
]);

function response(body: unknown, status: number, origin: string | null) {
  const headers = new Headers({ "Content-Type": "application/json", "Vary": "Origin" });
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

  const accessToken = (request.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!accessToken) return response({ ok: false, error: "Sesión requerida." }, 401, origin);
  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
  if (authError || !authData.user?.id) return response({ ok: false, error: "Sesión no válida." }, 401, origin);

  let payload: { incident_id?: string; manual?: boolean };
  try { payload = await request.json(); }
  catch { return response({ ok: false, error: "Solicitud inválida." }, 400, origin); }
  const incidentId = String(payload.incident_id || "");
  const manual = payload.manual === true;
  if (!incidentId) return response({ ok: false, error: "Incidencia no válida." }, 400, origin);

  const adminClient = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: savedIncident, error: incidentError } = await adminClient
    .from("community_incident_notifications")
    .select("id,title,message,location,type,status,created_by,created_at,updated_at,sent_at,email_status,email_error")
    .eq("id", incidentId)
    .maybeSingle();
  if (incidentError || !savedIncident) return response({ ok: false, error: "No se encontró la incidencia." }, 404, origin);
  if (String(savedIncident.type || "").toLowerCase() !== "incidencia") {
    return response({ ok: false, error: "El envío de correo solo está disponible para incidencias." }, 409, origin);
  }
  if (String(savedIncident.status || "").toLowerCase() !== "pending") {
    return response({ ok: false, error: "Solo se pueden enviar incidencias pendientes." }, 409, origin);
  }
  if (savedIncident.sent_at || savedIncident.email_status === "sent") {
    return response({ ok: true, already_sent: true }, 200, origin);
  }

  if (savedIncident.email_status === "sending") {
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { data: recovered, error: recoveryError } = await adminClient
      .from("community_incident_notifications")
      .update({
        email_status: "failed",
        email_error: "El intento anterior quedó interrumpido; se puede reenviar.",
        recipient_email: "santamariamata@gmail.com",
        updated_at: new Date().toISOString(),
      })
      .eq("id", incidentId)
      .eq("email_status", "sending")
      .lt("updated_at", staleBefore)
      .select("id")
      .maybeSingle();
    if (recoveryError) console.error("incident-email-recovery", { incidentId, error: recoveryError.message });
    if (!recovered) return response({ ok: false, error: "El correo ya se está enviando. Espera un momento." }, 409, origin);
    savedIncident.email_status = "failed";
  }

  const { data: adminEmail } = await adminClient.rpc("resolve_admin_username", { p_username: "administrador" });
  const isAdmin = Boolean(adminEmail && authData.user.email && String(authData.user.email).toLowerCase() === String(adminEmail).toLowerCase());
  const isCreator = String(savedIncident.created_by || "") === authData.user.id;
  if (!isAdmin && !isCreator) return response({ ok: false, error: "No tienes permiso para enviar esta incidencia." }, 403, origin);
  if (manual && !isAdmin) {
    return response({ ok: false, error: "Solo el administrador puede enviar manualmente una incidencia." }, 403, origin);
  }
  if (!manual) {
    const { data: settings, error: settingsError } = await adminClient
      .from("community_settings").select("automatic_incident_email").eq("id", true).maybeSingle();
    if (settingsError) return response({ ok: false, error: "No se pudo comprobar el ajuste de envío automático." }, 503, origin);
    if (!settings?.automatic_incident_email) return response({ ok: true, skipped: true }, 200, origin);
  }

  const { data: resident } = await adminClient
    .from("community_access_requests")
    .select("full_name,phone,floor,username")
    .eq("anonymous_user_id", savedIncident.created_by)
    .eq("status", "approved")
    .maybeSingle();
  const reporterName = String(resident?.full_name || (isAdmin ? "Administrador" : "Vecino"));
  const reporterPhone = String(resident?.phone || "No indicado");
  const reporterFloor = String(resident?.floor || "").trim();
  const reporterUsername = String(resident?.username || "No indicado");
  const title = String(savedIncident.title || "Incidencia");
  const description = String(savedIncident.message || "");
  const location = String(savedIncident.location || "No indicada");
  const incidentDate = savedIncident.created_at
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(savedIncident.created_at))
    : "No indicada";
  const reporterSubject = `${reporterName}${reporterFloor ? ` (${reporterFloor})` : ""}`;
  const subject = `${reporterSubject} - ${title}`;
  const body = [
    "Se ha recibido una nueva incidencia en la Comunidad de Vecinos Cuartel de la Cava.",
    "",
    `Datos del vecino:`,
    `Nombre: ${reporterName}`,
    `Teléfono: ${reporterPhone}`,
    `Piso: ${reporterFloor || "No indicado"}`,
    "",
    `Título: ${title}`,
    `Descripción: ${description}`,
    `Zona afectada: ${location}`,
    `Fecha de comunicación: ${incidentDate}`,
    "",
    "La incidencia queda registrada en la aplicación y pendiente de revisión.",
  ].join("\n");

  // Reserva atómica: evita que el automático y el botón de tramitación envíen duplicados.
  const { data: claim, error: claimError } = await adminClient
    .from("community_incident_notifications")
    .update({ email_status: "sending", email_error: null, recipient_email: "santamariamata@gmail.com", updated_at: new Date().toISOString() })
    .eq("id", incidentId)
    .in("email_status", ["not_sent", "failed"])
    .is("sent_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claim) {
    if (claimError) console.error("incident-email-claim", { incidentId, error: claimError.message });
    const { data: latest } = await adminClient.from("community_incident_notifications")
      .select("sent_at,email_status").eq("id", incidentId).maybeSingle();
    if (latest?.sent_at || latest?.email_status === "sent") return response({ ok: true, already_sent: true }, 200, origin);
    if (latest?.email_status === "sending") return response({ ok: false, error: "El correo ya se está enviando. Espera un momento." }, 409, origin);
    return response({ ok: false, error: "No se pudo reservar el envío del correo." }, 409, origin);
  }

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
        subject,
        title,
        message: body,
        body,
        incident_message: description,
        location,
        neighbor_name: reporterName,
        neighbor_phone: reporterPhone,
        neighbor_floor: reporterFloor || "No indicado",
        neighbor_username: reporterUsername,
        incident_id: incidentId,
        idempotency_key: incidentId,
      }),
    });
    const result = await mailResponse.json().catch(() => null);
    if (!mailResponse.ok || !result?.ok) throw new Error(String(result?.error || `El servicio de correo rechazó la incidencia (HTTP ${mailResponse.status}).`));
    const { error: finalizeError } = await adminClient.from("community_incident_notifications").update({
      email_status: "sent", email_error: null, sent_at: new Date().toISOString(), recipient_email: "santamariamata@gmail.com",
    }).eq("id", incidentId);
    if (finalizeError) {
      console.error("incident-email-finalize", { incidentId, error: finalizeError.message });
      return response({ ok: true, sent: true, tracking_warning: "El correo se envió, pero no se pudo actualizar su estado." }, 200, origin);
    }
    return response({ ok: true, sent: true }, 200, origin);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "No se pudo conectar con el servicio de correo.";
    console.error("incident-email-send", { incidentId, error: errorMessage });
    const { error: failureUpdateError } = await adminClient.from("community_incident_notifications").update({
      email_status: "failed", email_error: errorMessage.slice(0, 1000), sent_at: null,
      recipient_email: "santamariamata@gmail.com", updated_at: new Date().toISOString(),
    }).eq("id", incidentId);
    if (failureUpdateError) console.error("incident-email-failure-state", { incidentId, error: failureUpdateError.message });
    return response({ ok: false, error: errorMessage }, 502, origin);
  }
});
