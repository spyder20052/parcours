import "server-only";
// Outlook par Microsoft Graph : connexion OAuth (code + PKCE), envoi d'un échange avec ses pièces jointes,
// import des réponses (notifications en direct et vérification à la demande).
// Les jetons sont chiffrés et lus sous RLS ; le texte des courriels reçus reste une donnée, jamais une consigne.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { attachmentName, matchThread, parseRecipients, SEND_LIMITS } from "@/lib/mail";
import { systemDb, withUser } from "./db";
import * as t from "./schema";
import { decrypt, encrypt } from "./crypto";
import { HttpError } from "./guard";
import { canReceiveNotifications, msEnv, outlookAvailable } from "./outlook-env";
import { readObject } from "./storage";
import { applyOne, getWorkspaceId } from "./workspace";
import { audit } from "./audit";

const GRAPH = "https://graph.microsoft.com/v1.0";
export const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send";
const SMALL = 3 * 1024 * 1024;          // en dessous : un seul POST ; au-dessus : session d'envoi
const CHUNK = 320 * 1024 * 12;          // 3,75 Mo, multiple de 320 Kio, sous la limite de 4 Mo
const SUB_LIFETIME_MS = 6.5 * 24 * 3600 * 1000; // Graph : 10 080 minutes au plus pour les messages
const MSG_SELECT = "id,internetMessageId,conversationId,subject,from,receivedDateTime,body,isDraft";

const aad = (userId: string) => `mail-tokens:${userId}`;
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const redirectUri = () => `${msEnv().appUrl}/api/outlook/callback`;
const todayIso = () => new Date().toISOString().slice(0, 10);

class GraphError extends HttpError {
  constructor(public graphStatus: number, public code: string) {
    super(graphStatus === 401 || graphStatus === 403 ? 412 : 502,
      graphStatus === 401 || graphStatus === 403 ? "Outlook a refusé l'accès. Reconnecte Outlook dans les réglages." : "Outlook n'a pas répondu comme prévu. Réessaie dans quelques minutes.");
  }
}

/** État de la connexion pour les réglages : boîte reliée, dernière vérification, réception en direct. */
export async function mailStatus(userId: string) {
  const c = await withUser(userId, async (tx) => (await tx.select({ email: t.mailConnection.accountEmail, lastSyncAt: t.mailConnection.lastSyncAt }).from(t.mailConnection))[0]);
  const sub = c ? (await systemDb.select({ id: t.mailSubscription.subscriptionId }).from(t.mailSubscription).where(eq(t.mailSubscription.ownerId, userId)))[0] : undefined;
  return { available: outlookAvailable(), connected: !!c, email: c?.email ?? null, lastSyncAt: c?.lastSyncAt?.toISOString() ?? null, live: !!sub && canReceiveNotifications() };
}

// ---------- OAuth
export function authorizeUrl(state: string, challenge: string) {
  const e = msEnv();
  const q = new URLSearchParams({
    client_id: e.clientId, response_type: "code", redirect_uri: redirectUri(), response_mode: "query",
    scope: SCOPES, state, code_challenge: challenge, code_challenge_method: "S256", prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${encodeURIComponent(e.tenant)}/oauth2/v2.0/authorize?${q}`;
}

export function pkcePair() {
  const verifier = randomBytes(48).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

async function tokenRequest(params: Record<string, string>) {
  const e = msEnv();
  const r = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(e.tenant)}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, cache: "no-store",
    body: new URLSearchParams({ client_id: e.clientId, client_secret: e.clientSecret, scope: SCOPES, ...params }),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string };
  if (!r.ok || !j.access_token) {
    throw new HttpError(412, j.error === "invalid_grant" ? "Ta connexion Outlook a expiré. Reconnecte Outlook dans les réglages." : "Microsoft a refusé la connexion à Outlook.");
  }
  return { access: j.access_token, refresh: j.refresh_token ?? params.refresh_token ?? "", expiresAt: new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000) };
}

/** Échange le code d'autorisation, enregistre les jetons chiffrés, puis s'abonne aux nouveaux messages. */
export async function connectOutlook(userId: string, code: string, verifier: string) {
  const tk = await tokenRequest({ grant_type: "authorization_code", code, redirect_uri: redirectUri(), code_verifier: verifier });
  if (!tk.refresh) throw new HttpError(412, "Microsoft n'a pas accordé l'accès durable. Reconnecte Outlook.");
  const me = (await graph(tk.access, "/me?$select=mail,userPrincipalName")) as { mail?: string; userPrincipalName?: string };
  const email = (me.mail || me.userPrincipalName || "").toLowerCase().slice(0, 320);
  const values = { ownerId: userId, accountEmail: email, encryptedTokens: encrypt(JSON.stringify({ access: tk.access, refresh: tk.refresh }), aad(userId)), accessExpiresAt: tk.expiresAt, updatedAt: new Date() };
  await withUser(userId, (tx) => tx.insert(t.mailConnection).values(values).onConflictDoUpdate({ target: t.mailConnection.ownerId, set: values }));
  await audit(userId, "outlook.connect");
  if (canReceiveNotifications()) await subscribe(userId).catch((e) => console.error("Abonnement Outlook impossible", e));
  return email;
}

/** Jeton d'accès valide, renouvelé si besoin. */
async function accessToken(userId: string): Promise<string> {
  const row = await withUser(userId, async (tx) => (await tx.select().from(t.mailConnection))[0]);
  if (!row) throw new HttpError(412, "Connecte d'abord Outlook dans les réglages.");
  let tk: { access: string; refresh: string };
  try { tk = JSON.parse(decrypt(row.encryptedTokens, aad(userId))); } catch { throw new HttpError(412, "Ta connexion Outlook ne peut pas être relue. Reconnecte Outlook."); }
  if (row.accessExpiresAt.getTime() > Date.now() + 120_000) return tk.access;
  const n = await tokenRequest({ grant_type: "refresh_token", refresh_token: tk.refresh });
  await withUser(userId, (tx) => tx.update(t.mailConnection).set({
    encryptedTokens: encrypt(JSON.stringify({ access: n.access, refresh: n.refresh }), aad(userId)), accessExpiresAt: n.expiresAt, updatedAt: new Date(),
  }));
  return n.access;
}

/** Appel de Graph. N'accepte que des adresses de graph.microsoft.com ; réessaie une fois si Graph demande d'attendre. */
async function graph(token: string, path: string, init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}, tries = 3): Promise<unknown> {
  const url = path.startsWith("https://") ? path : GRAPH + path;
  if (!url.startsWith(GRAPH + "/")) throw new HttpError(502, "Adresse Outlook inattendue.");
  const r = await fetch(url, {
    method: init.method ?? "GET", cache: "no-store",
    headers: { authorization: `Bearer ${token}`, prefer: 'IdType="ImmutableId", outlook.body-content-type="text"', ...(init.json !== undefined ? { "content-type": "application/json" } : {}), ...init.headers },
    body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
  });
  if ((r.status === 429 || r.status === 503 || r.status === 504) && tries > 1) {
    await sleep(Math.min(10, Number(r.headers.get("retry-after")) || 2) * 1000);
    return graph(token, path, init, tries - 1);
  }
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: { code?: string } };
    throw new GraphError(r.status, j.error?.code ?? "");
  }
  if (r.status === 202 || r.status === 204) return null;
  return (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null;
}

// ---------- Envoi
async function uploadLarge(token: string, messageId: string, name: string, bytes: Uint8Array) {
  const s = (await graph(token, `/me/messages/${encodeURIComponent(messageId)}/attachments/createUploadSession`, {
    method: "POST", json: { AttachmentItem: { attachmentType: "file", name, size: bytes.length } },
  })) as { uploadUrl?: string };
  const host = s.uploadUrl ? new URL(s.uploadUrl).hostname : "";
  if (!/(^|\.)outlook\.office(365)?\.com$/.test(host)) throw new HttpError(502, "Adresse d'envoi Outlook inattendue.");
  for (let start = 0; start < bytes.length; start += CHUNK) {
    const end = Math.min(bytes.length, start + CHUNK);
    // L'adresse de session est déjà authentifiée : pas d'en-tête Authorization.
    const r = await fetch(s.uploadUrl!, {
      method: "PUT", cache: "no-store", body: Buffer.from(bytes.subarray(start, end)),
      headers: { "content-type": "application/octet-stream", "content-length": String(end - start), "content-range": `bytes ${start}-${end - 1}/${bytes.length}` },
    });
    if (!r.ok) throw new GraphError(r.status, "upload");
  }
}

/**
 * Envoie un échange depuis la boîte Outlook de la personne, avec ses pièces jointes, puis le note comme envoyé.
 * Le brouillon est supprimé si une étape échoue : rien ne part à moitié.
 */
export async function sendThread(userId: string, threadId: string) {
  const { th, docs } = await withUser(userId, async (tx) => {
    const th = (await tx.select().from(t.thread).where(eq(t.thread.id, threadId)))[0];
    if (!th) throw new HttpError(404, "Échange introuvable.");
    const docs = th.attachmentIds.length ? await tx.select().from(t.document).where(and(inArray(t.document.id, th.attachmentIds), eq(t.document.status, "ready"))) : [];
    return { th, docs };
  });
  if (th.sentAt) throw new HttpError(409, "Ce courriel est déjà noté comme envoyé.");
  if (docs.length !== th.attachmentIds.length) throw new HttpError(409, "Une pièce jointe n'existe plus. Retire-la de la liste avant d'envoyer.");
  const rc = parseRecipients(th.recipient);
  if (!rc.to.length) throw new HttpError(422, "Ajoute l'adresse e-mail du destinataire avant d'envoyer.");
  if (!th.subject.trim()) throw new HttpError(422, "Ajoute un objet avant d'envoyer.");
  if (!th.body.trim()) throw new HttpError(422, "Le courriel est vide.");
  if (docs.length > SEND_LIMITS.maxFiles) throw new HttpError(422, `Un courriel part avec ${SEND_LIMITS.maxFiles} pièces au plus.`);
  if (docs.reduce((n, d) => n + d.sizeBytes, 0) > SEND_LIMITS.maxTotalBytes) throw new HttpError(422, "Les pièces dépassent 25 Mo : sépare-les en deux courriels.");

  const token = await accessToken(userId);
  const addr = (a: string) => ({ emailAddress: { address: a } });
  const draft = (await graph(token, "/me/messages", {
    method: "POST",
    json: { subject: th.subject, body: { contentType: "Text", content: th.body }, toRecipients: rc.to.map(addr), ccRecipients: rc.cc.map(addr) },
  })) as { id: string; conversationId?: string };
  const mid = encodeURIComponent(draft.id);
  try {
    const ordered = th.attachmentIds.map((id) => docs.find((d) => d.id === id)!);
    for (const d of ordered) {
      const bytes = await readObject(d.objectKey);
      const name = attachmentName(d.title, d.mime);
      if (bytes.length < SMALL) {
        await graph(token, `/me/messages/${mid}/attachments`, { method: "POST", json: { "@odata.type": "#microsoft.graph.fileAttachment", name, contentType: d.mime, contentBytes: Buffer.from(bytes).toString("base64") } });
      } else await uploadLarge(token, draft.id, name, bytes);
    }
    await graph(token, `/me/messages/${mid}/send`, { method: "POST" });
  } catch (e) {
    await graph(token, `/me/messages/${mid}`, { method: "DELETE" }).catch(() => undefined);
    throw e;
  }
  const sentAt = todayIso();
  await withUser(userId, async (tx) => {
    const ws = await getWorkspaceId(tx);
    await applyOne(tx, userId, ws!, { op: "thread.update", id: th.id, patch: { sentAt } }, []);
    await tx.update(t.thread).set({ mailConversationId: draft.conversationId ?? null }).where(eq(t.thread.id, th.id));
  });
  await audit(userId, "outlook.send", { files: docs.length });
  return { sentAt, to: rc.to, cc: rc.cc, files: docs.length };
}

// ---------- Réponses
type GMsg = {
  id: string; internetMessageId?: string; conversationId?: string; subject?: string; isDraft?: boolean; receivedDateTime?: string;
  from?: { emailAddress?: { address?: string; name?: string } }; body?: { content?: string };
};

/** Rattache les courriels reçus à leurs échanges. Ignore ceux déjà importés et ceux qu'aucun échange n'attend. */
async function importMessages(userId: string, msgs: GMsg[]) {
  if (!msgs.length) return 0;
  return withUser(userId, async (tx) => {
    const ws = await getWorkspaceId(tx);
    if (!ws) return 0;
    const own = (await tx.select({ email: t.mailConnection.accountEmail }).from(t.mailConnection))[0]?.email ?? "";
    const threads = await tx.select({ id: t.thread.id, recipient: t.thread.recipient, subject: t.thread.subject, sentAt: t.thread.sentAt, mailConversationId: t.thread.mailConversationId }).from(t.thread).where(eq(t.thread.workspaceId, ws));
    const keys = msgs.map((m) => m.internetMessageId || m.id);
    const seen = new Set((await tx.select({ k: t.threadMessage.externalId }).from(t.threadMessage).where(inArray(t.threadMessage.externalId, keys))).map((x) => x.k));
    let added = 0;
    for (const m of msgs) {
      const key = (m.internetMessageId || m.id).slice(0, 400);
      const from = (m.from?.emailAddress?.address ?? "").toLowerCase();
      if (m.isDraft || seen.has(key) || !from || from === own || !m.receivedDateTime) continue;
      const receivedOn = m.receivedDateTime.slice(0, 10);
      const tid = matchThread(threads, { conversationId: m.conversationId ?? "", from, subject: m.subject ?? "", receivedOn });
      if (!tid) continue;
      const name = m.from?.emailAddress?.name?.trim();
      const raw = `De : ${name ? `${name} <${from}>` : from}\nDate : ${m.receivedDateTime}\nObjet : ${m.subject ?? ""}\n\n${(m.body?.content ?? "").trim()}`.slice(0, 50000);
      await applyOne(tx, userId, ws, { op: "message.create", id: randomUUID(), threadId: tid, data: { direction: "in", rawText: raw, receivedOn, externalId: key } }, []);
      seen.add(key); added++;
    }
    return added;
  });
}

/** Parcourt la boîte de réception depuis la dernière vérification (14 jours la première fois). */
export async function syncInbox(userId: string) {
  const token = await accessToken(userId);
  const last = await withUser(userId, async (tx) => (await tx.select({ at: t.mailConnection.lastSyncAt }).from(t.mailConnection))[0]?.at ?? null);
  const since = new Date(Math.max(Date.now() - 30 * 86400_000, last ? last.getTime() - 3600_000 : Date.now() - 14 * 86400_000));
  const started = new Date();
  let url: string | undefined = `/me/mailFolders/inbox/messages?$select=${MSG_SELECT}&$filter=receivedDateTime ge ${since.toISOString()}&$orderby=receivedDateTime asc&$top=50`;
  let added = 0;
  for (let page = 0; url && page < 10; page++) {
    const r = (await graph(token, url)) as { value?: GMsg[]; "@odata.nextLink"?: string };
    added += await importMessages(userId, r.value ?? []);
    url = r["@odata.nextLink"];
  }
  await withUser(userId, (tx) => tx.update(t.mailConnection).set({ lastSyncAt: started }));
  return added;
}

/** Un nouveau message signalé par Graph. */
async function importOne(userId: string, messageId: string) {
  const token = await accessToken(userId);
  const m = (await graph(token, `/me/messages/${encodeURIComponent(messageId)}?$select=${MSG_SELECT}`)) as GMsg;
  return importMessages(userId, [m]);
}

// ---------- Abonnement aux notifications
export async function subscribe(userId: string) {
  const token = await accessToken(userId);
  const old = (await systemDb.select().from(t.mailSubscription).where(eq(t.mailSubscription.ownerId, userId)))[0];
  if (old) {
    await graph(token, `/subscriptions/${encodeURIComponent(old.subscriptionId)}`, { method: "DELETE" }).catch(() => undefined);
    await systemDb.delete(t.mailSubscription).where(eq(t.mailSubscription.ownerId, userId));
  }
  const clientState = randomBytes(32).toString("base64url");
  const hook = `${msEnv().appUrl}/api/outlook/notify`;
  const s = (await graph(token, "/subscriptions", {
    method: "POST",
    json: { changeType: "created", notificationUrl: hook, lifecycleNotificationUrl: hook, resource: "/me/mailFolders('inbox')/messages", expirationDateTime: new Date(Date.now() + SUB_LIFETIME_MS).toISOString(), clientState },
  })) as { id: string; expirationDateTime: string };
  await systemDb.insert(t.mailSubscription).values({ subscriptionId: s.id, ownerId: userId, clientStateHash: sha256(clientState), expiresAt: new Date(s.expirationDateTime) });
}

async function renew(userId: string, subscriptionId: string) {
  const token = await accessToken(userId);
  try {
    const s = (await graph(token, `/subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "PATCH", json: { expirationDateTime: new Date(Date.now() + SUB_LIFETIME_MS).toISOString() } })) as { expirationDateTime: string };
    await systemDb.update(t.mailSubscription).set({ expiresAt: new Date(s.expirationDateTime) }).where(eq(t.mailSubscription.subscriptionId, subscriptionId));
  } catch (e) {
    if (e instanceof GraphError && e.graphStatus === 404) await subscribe(userId); else throw e;
  }
}

export type GraphNotification = { subscriptionId?: string; clientState?: string; changeType?: string; lifecycleEvent?: string; resourceData?: { id?: string } };

/** Garde seulement les notifications dont l'abonnement existe et dont le secret partagé correspond. */
export async function verifyNotifications(items: GraphNotification[]) {
  const ids = [...new Set(items.map((n) => n.subscriptionId).filter((x): x is string => typeof x === "string" && x.length < 200))];
  if (!ids.length) return [];
  const subs = await systemDb.select().from(t.mailSubscription).where(inArray(t.mailSubscription.subscriptionId, ids));
  return items.flatMap((n) => {
    const s = subs.find((x) => x.subscriptionId === n.subscriptionId);
    if (!s || typeof n.clientState !== "string") return [];
    const a = Buffer.from(sha256(n.clientState)), b = Buffer.from(s.clientStateHash);
    return a.length === b.length && timingSafeEqual(a, b) ? [{ ownerId: s.ownerId, subscriptionId: s.subscriptionId, n }] : [];
  });
}

/** Traite des notifications déjà vérifiées : nouveau message, ou événement de cycle de vie de l'abonnement. */
export async function processNotifications(list: Awaited<ReturnType<typeof verifyNotifications>>) {
  for (const { ownerId, subscriptionId, n } of list) {
    try {
      if (n.lifecycleEvent === "subscriptionRemoved") await subscribe(ownerId);
      else if (n.lifecycleEvent === "reauthorizationRequired") await renew(ownerId, subscriptionId);
      else if (n.lifecycleEvent === "missed") await syncInbox(ownerId);
      else if (n.changeType === "created" && n.resourceData?.id) await importOne(ownerId, n.resourceData.id);
    } catch (e) { console.error("Notification Outlook non traitée", e); }
  }
}

/** Tâche quotidienne : prolonge les abonnements qui expirent sous 3 jours, puis vérifie chaque boîte. */
export async function renewAll() {
  const soon = new Date(Date.now() + 3 * 86400_000);
  const subs = await systemDb.select().from(t.mailSubscription);
  let renewed = 0, failed = 0;
  for (const s of subs) {
    try {
      if (s.expiresAt < soon) { await renew(s.ownerId, s.subscriptionId); renewed++; }
      await syncInbox(s.ownerId);
    } catch (e) { failed++; console.error("Renouvellement Outlook impossible", e); }
  }
  await systemDb.delete(t.mailSubscription).where(lt(t.mailSubscription.expiresAt, new Date(Date.now() - 86400_000)));
  return { total: subs.length, renewed, failed };
}

/** Déconnecte Outlook : supprime l'abonnement chez Microsoft puis les jetons. */
export async function disconnectOutlook(userId: string) {
  const sub = (await systemDb.select().from(t.mailSubscription).where(eq(t.mailSubscription.ownerId, userId)))[0];
  if (sub) {
    const token = await accessToken(userId).catch(() => null);
    if (token) await graph(token, `/subscriptions/${encodeURIComponent(sub.subscriptionId)}`, { method: "DELETE" }).catch(() => undefined);
    await systemDb.delete(t.mailSubscription).where(eq(t.mailSubscription.ownerId, userId));
  }
  await withUser(userId, (tx) => tx.delete(t.mailConnection));
  await audit(userId, "outlook.disconnect");
}
