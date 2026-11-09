import { after } from "next/server";
import { HttpError, rateLimit } from "@/server/guard";
import { processNotifications, verifyNotifications, type GraphNotification } from "@/server/outlook";

export const maxDuration = 60;

/**
 * Notifications de Microsoft Graph (route publique, sans session).
 * Validation : renvoie le jeton en texte brut. Notification : seules celles dont l'abonnement existe et dont le secret
 * partagé correspond sont gardées ; la réponse 202 part tout de suite, le traitement se fait ensuite.
 */
export async function POST(req: Request) {
  const token = new URL(req.url).searchParams.get("validationToken");
  if (token !== null) return new Response(token.slice(0, 1024), { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
  try { await rateLimit("outlook-notify", 3000, 60); } catch (e) { if (e instanceof HttpError) return new Response(null, { status: 429 }); throw e; }
  const text = await req.text();
  if (text.length > 1_000_000) return new Response(null, { status: 413 });
  let items: GraphNotification[] = [];
  try { const j = JSON.parse(text) as { value?: unknown }; items = Array.isArray(j.value) ? (j.value.slice(0, 100) as GraphNotification[]) : []; } catch { return new Response(null, { status: 400 }); }
  const ok = await verifyNotifications(items);
  if (ok.length) after(() => processNotifications(ok));
  return new Response(null, { status: 202 });
}
