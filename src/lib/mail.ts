// Règles d'envoi et de rattachement des courriels, sans réseau : partagées par le serveur et les tests.

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

/**
 * Lit le champ « destinataire » d'un échange : « a@x.fr ; copie b@y.fr, c@z.fr ».
 * Les adresses qui suivent le mot « copie » (ou « cc ») partent en copie ; les autres sont destinataires.
 */
export function parseRecipients(field: string): { to: string[]; cc: string[] } {
  const to: string[] = [], cc: string[] = [];
  let inCc = false;
  for (const part of field.split(/[;,\n]/)) {
    if (/\b(copie|cc)\b/i.test(part)) inCc = true;
    for (const m of part.match(EMAIL) ?? []) {
      const a = m.toLowerCase();
      if (!to.includes(a) && !cc.includes(a)) (inCc ? cc : to).push(a);
    }
  }
  if (!to.length && cc.length) to.push(cc.shift()!);
  return { to, cc };
}

/** Objet sans préfixes de réponse ni de transfert, sans numéro de ticket, en minuscules. */
export function normSubject(s: string) {
  let x = s.toLowerCase();
  for (let i = 0; i < 5; i++) x = x.replace(/^\s*(re|tr|fw|fwd|réf|ref|aw|wg)\s*:\s*/i, "");
  return x.replace(/\[[^\]]*#\d+\]/g, "").replace(/\s+/g, " ").trim();
}

/** Domaine enregistrable approché : les deux derniers éléments (« rt-dri.unistra.fr » → « unistra.fr »). */
export const baseDomain = (addr: string) => addr.toLowerCase().split("@")[1]?.split(".").slice(-2).join(".") ?? "";

export type MatchThread = { id: string; recipient: string; subject: string; sentAt: string | null; mailConversationId: string | null };
export type MatchMail = { conversationId: string; from: string; subject: string; receivedOn: string };

/**
 * Échange auquel appartient un courriel reçu, ou null. Seuls les échanges déjà envoyés comptent, et seulement
 * pour un courriel reçu le jour de l'envoi ou après. Ordre : même conversation Outlook, puis expéditeur parmi
 * les destinataires, puis même domaine et objet repris. À égalité, l'envoi le plus récent l'emporte.
 */
export function matchThread(threads: MatchThread[], m: MatchMail): string | null {
  const sent = threads.filter((t) => t.sentAt && t.sentAt <= m.receivedOn).sort((a, b) => (a.sentAt! < b.sentAt! ? 1 : -1));
  const conv = sent.find((t) => t.mailConversationId && t.mailConversationId === m.conversationId);
  if (conv) return conv.id;
  const from = m.from.toLowerCase();
  if (!from) return null;
  const addrs = (t: MatchThread) => { const r = parseRecipients(t.recipient); return [...r.to, ...r.cc]; };
  const direct = sent.find((t) => addrs(t).includes(from));
  if (direct) return direct.id;
  const subj = normSubject(m.subject), dom = baseDomain(from);
  const near = sent.find((t) => {
    const ts = normSubject(t.subject);
    return ts.length >= 12 && subj.includes(ts) && addrs(t).some((a) => baseDomain(a) === dom);
  });
  return near?.id ?? null;
}

/** Nom de fichier lisible et sûr pour une pièce jointe. */
export function attachmentName(title: string, mime: string) {
  const ext = ({ "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" } as Record<string, string>)[mime] ?? "";
  const base = title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "document";
  return base.toLowerCase().endsWith(ext) ? base : base + ext;
}

/** Limites d'un envoi : au-delà, Outlook ou les boîtes des universités risquent de refuser le message. */
export const SEND_LIMITS = { maxFiles: 20, maxTotalBytes: 25 * 1024 * 1024 };
