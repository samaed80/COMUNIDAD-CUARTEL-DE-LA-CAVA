import webpush from "npm:web-push";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const webhookSecret = Deno.env.get("PUSH_WEBHOOK_SECRET") || "";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

Deno.serve(async request => {
  if (request.method !== "POST" || request.headers.get("x-push-webhook-secret") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!vapidPublicKey || !vapidPrivateKey) return Response.json({ error: "VAPID keys are not configured" }, { status: 500 });
  const payload = await request.json();
  const kind = String(payload.kind || "notice");
  const senderRole = payload.sender_role ? String(payload.sender_role) : null;
  const targetRole = kind === "incident" ? "admin" : kind === "chat" ? (senderRole === "admin" ? "neighbor" : "admin") : null;
  let query = supabase.from("push_subscriptions").select("id,endpoint,p256dh,auth,role");
  if (targetRole) query = query.eq("role", targetRole);
  const { data: subscriptions, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  webpush.setVapidDetails("mailto:administrador@cuarteldelacava.es", vapidPublicKey, vapidPrivateKey);
  const notification = JSON.stringify({ title: payload.title, body: payload.body, tag: `cuartel-${kind}`, url: "./" });
  const results = await Promise.all((subscriptions || []).map(async subscription => {
    try {
      await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, notification);
      return { id: subscription.id, ok: true };
    } catch (error) {
      const status = Number((error as { statusCode?: number }).statusCode || 0);
      if (status === 404 || status === 410) await supabase.from("push_subscriptions").delete().eq("id", subscription.id);
      return { id: subscription.id, ok: false, status };
    }
  }));
  return Response.json({ sent: results.filter(item => item.ok).length, removed: results.filter(item => !item.ok && [404,410].includes(item.status)).length });
});
