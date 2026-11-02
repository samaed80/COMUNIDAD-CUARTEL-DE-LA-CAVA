import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return response({ error: "Método no permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const resendKey = Deno.env.get("RESEND_API_KEY");
  const sender = Deno.env.get("RESEND_FROM_EMAIL");
  const appOrigin = request.headers.get("origin") || "";
  if (!supabaseUrl || !serviceRoleKey || !resendKey || !sender) {
    return response({ error: "El servicio de recuperación no está configurado." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  try {
    const body = await request.json();
    const action = String(body?.action || "request");
    const email = String(body?.email || "").trim().toLowerCase();
    if (!email || !email.includes("@")) return response({ error: "Indica un correo válido." }, 400);

    if (action === "request") {
      const { data: account, error: accountError } = await admin
        .from("community_access_requests")
        .select("id")
        .eq("status", "approved")
        .ilike("email", email)
        .maybeSingle();
      if (accountError) throw accountError;

      if (account) {
        const code = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
        const { error: storeError } = await admin.rpc("store_neighbor_password_recovery", {
          p_email: email,
          p_code: code,
        });
        if (storeError) throw storeError;
        const recoveryLink = appOrigin
          ? appOrigin + "/?recuperar=1&recuperar_email=" + encodeURIComponent(email) + "&codigo=" + encodeURIComponent(code)
          : "";
        const mail = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: sender,
            to: [email],
            subject: "Código para recuperar tu acceso",
            html: `<p>Tu código para recuperar el acceso a Comunidad Cuartel de la Cava es:</p><p style="font-size:28px;font-weight:700;letter-spacing:4px">${code}</p><p>Caduca en 10 minutos y solo puede utilizarse una vez.</p>${recoveryLink ? `<p><a href="${recoveryLink}">Abrir recuperación y elegir una contraseña nueva</a></p>` : ""}`,
          }),
        });
        if (!mail.ok) throw new Error(`Resend: ${await mail.text()}`);
      }
      return response({ ok: true, message: "Si existe una cuenta con ese correo, recibirás un código." });
    }

    if (action === "complete") {
      const code = String(body?.code || "").trim().toUpperCase();
      const newPassword = String(body?.new_password || "");
      const { data, error } = await admin.rpc("complete_neighbor_password_recovery", {
        p_email: email,
        p_code: code,
        p_new_password: newPassword,
      });
      if (error || !data) return response({ error: error?.message || "No se pudo actualizar la contraseña." }, 400);
      return response({ ok: true });
    }
    return response({ error: "Acción no válida." }, 400);
  } catch (error) {
    console.error("neighbor-password-recovery", error);
    return response({ error: "No se pudo procesar la recuperación." }, 500);
  }
});
