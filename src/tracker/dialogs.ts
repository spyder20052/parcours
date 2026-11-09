// Fenêtres : fiche d'une candidature, aperçu, recherche, modes d'emploi et formulaires.
// Chaque formulaire produit des opérations typées (voir src/lib/ops.ts), jamais d'écriture directe.
import type { Application, Doc, How, Thread } from "@/lib/model";
import { attachmentName, parseRecipients, SEND_LIMITS } from "@/lib/mail";
import { PIECE_STATUSES, THREAD_KINDS } from "@/lib/model";
import type { Op } from "@/lib/ops";
import * as st from "./state";
import { $, D, NOW, dueChip, esc, fD, fL, ic, iso, reduced, uid } from "./util";
import { ACCEPT, hydrateThumbs, previewPages, saveDoc, thumbHtml } from "./files";
import { appDocs, fmtSize, pjBlock } from "./views";

const { store } = st;
export const DOC_TAGS: [string, string][] = [["", "Aucun"], ["projet", "Projet d'études"], ["lettre", "Lettre de motivation"], ["reco", "Recommandation"], ["demarche", "Démarche"], ["cv", "CV"]];
const THREAD_KIND_L: Record<string, string> = { premier_contact: "Premier contact", question: "Question", relance: "Relance", reponse: "Réponse", connu: "Contact connu", note: "Note" };

// ---------- Retours visuels
export function toast(t: string) {
  const e = $("#toast"); e.textContent = t; e.classList.add("on");
  clearTimeout((toast as unknown as { _: number })._);
  (toast as unknown as { _: number })._ = window.setTimeout(() => e.classList.remove("on"), 3400);
}
export function confetti() {
  if (reduced()) return;
  const cv = $<HTMLCanvasElement>("#confetti"), x = cv.getContext("2d")!, W = (cv.width = innerWidth), H = (cv.height = innerHeight);
  const cs = getComputedStyle(document.documentElement);
  const cols = ["--lime-deep", "--peri", "--ink", "--blue", "--rose"].map((v) => cs.getPropertyValue(v).trim() || "#0082FB");
  const P = [...Array(90)].map(() => ({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.55, vx: (Math.random() - 0.5) * 13, vy: -Math.random() * 15 - 5, r: Math.random() * 6 + 3, c: cols[(Math.random() * 5) | 0], a: Math.random() * 6, s: Math.random() * 0.3 - 0.15 }));
  let f = 0;
  (function tick() {
    x.clearRect(0, 0, W, H);
    P.forEach((p) => { p.vy += 0.42; p.x += p.vx; p.y += p.vy; p.a += p.s; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.c; x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore(); });
    if (++f < 95) requestAnimationFrame(tick); else x.clearRect(0, 0, W, H);
  })();
}
export async function copy(t: string) {
  try { await navigator.clipboard.writeText(t); toast("Copié."); }
  catch { toast("Copie impossible. Sélectionne le texte à la main."); }
}
export const closeAll = () => document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((d) => d.close());
function dlg(html: string) { const d = $<HTMLDialogElement>("#dlg"); d.innerHTML = html; if (!d.open) d.showModal(); d.querySelector<HTMLElement>("[autofocus],input,textarea,select,button")?.focus(); }

// ---------- Confirmation générique
let pending: (() => void) | null = null;
export function confirmDialog(title: string, text: string, ok: string, fn: () => void) {
  pending = fn;
  dlg(`<h2>${esc(title)}</h2><p class="meta" style="font-size:14px">${esc(text)}</p><div class="acts" style="margin-top:12px"><button class="btn lime" data-confirm>${esc(ok)}</button><button class="btn" data-close>Annuler</button></div>`);
}
export function runConfirm() { $<HTMLDialogElement>("#dlg").close(); const f = pending; pending = null; f?.(); }

// ---------- Changement d'étape du tableau, avec les règles portées par les rôles
const DEPOSITED = ["submitted", "shortlisted", "unique"];
export function setStage(id: string, stageId: string, opts: { force?: boolean; extra?: Op[]; autoSteps?: boolean } = {}) {
  const a = st.app(id), target = st.stageDef(stageId);
  if (!a || !target) return;
  const prevRole = st.stageRole(a), role = target.role ?? "", uniq = st.uniqueApp();
  if (role === "unique" && uniq && uniq.id !== id && !opts.force) return askSwap(id);
  const ops: Op[] = [...(opts.extra ?? []), { op: "application.update", id, patch: { stage: stageId } }];
  if (role === "unique" && uniq && uniq.id !== id) {
    const back = st.stageByRole("shortlisted") ?? st.stageByRole("submitted");
    if (back) ops.push({ op: "application.update", id: uniq.id, patch: { stage: back.id } });
  }
  if (opts.autoSteps !== false) {
    if (DEPOSITED.includes(role)) { const d = a.steps.find((s) => st.isDepot(s) && !s.doneAt); if (d) ops.push({ op: "step.update", id: d.id, patch: { done: true } }); }
    if (role === "contact") { const k = a.steps.find((s) => st.isContact(s) && !s.doneAt); if (k) ops.push({ op: "step.update", id: k.id, patch: { done: true } }); }
  }
  if (role === "submitted" && prevRole !== "submitted") { store.ui.stamps[id] = true; st.saveUi(); confetti(); toast(`${st.appLabel(a)} : dossier déposé. Vérifie la page de confirmation.`); }
  else if (role === "unique") { confetti(); toast(`${st.appLabel(a)} devient ton seul porteur. Retire les autres candidatures par écrit.`); }
  else toast(`${st.appLabel(a)} : ${target.label}.`);
  st.dispatch(ops);
}
function askSwap(id: string) {
  const a = st.app(id)!, o = st.uniqueApp()!, g = st.cfg().gate;
  dlg(`<h2>Une seule université peut te présenter</h2><p class="meta" style="font-size:14px">${esc(st.appLabel(o))} est déjà ton porteur. ${esc(g?.uniqueRule ?? "")}</p><div class="acts" style="margin-top:14px"><button class="btn lime" data-swap="${a.id}">Remplacer par ${esc(st.appLabel(a))}</button><button class="btn" data-close>Garder ${esc(st.appLabel(o))}</button></div>`);
}
export function gateDialog() {
  const g = st.cfg().gate, L = st.apps().filter((a) => DEPOSITED.includes(st.stageRole(a) ?? "")), u = st.uniqueApp();
  dlg(`<h2>${esc(g?.label ?? "Choix final")}</h2><p class="meta" style="font-size:14px">${esc(g?.dialog ?? "")}</p><div style="margin-top:10px">${L.map((a) => `<button class="row-btn" data-makep="${a.id}"><span><b>${esc(st.appLabel(a))}</b><small>${esc(st.stageDef(a.stage)?.label ?? "")}</small></span>${u?.id === a.id ? `<span class="tag tag-prio">Choisi</span>` : ""}</button>`).join("") || `<p class="note-c">Aucun dossier déposé pour l'instant. Tes candidatures apparaîtront ici dès que tu les marques comme déposées.</p>`}</div><div class="acts" style="margin-top:12px"><button class="btn" data-close>Fermer</button></div>`);
}

export function toggleStep(stepId: string) {
  const a = st.apps().find((x) => x.steps.some((s) => s.id === stepId)); if (!a) return;
  const s = a.steps.find((x) => x.id === stepId)!, on = !s.doneAt, role = st.stageRole(a) ?? "";
  const op: Op = { op: "step.update", id: stepId, patch: { done: on } };
  if (on && st.isDepot(s) && !DEPOSITED.includes(role)) { const sub = st.stageByRole("submitted"); if (sub) return setStage(a.id, sub.id, { extra: [op], autoSteps: false }); }
  if (on && st.isContact(s) && role === "start") { const c = st.stageByRole("contact"); if (c) return setStage(a.id, c.id, { extra: [op], autoSteps: false }); }
  if (!on && st.isDepot(s) && role === "submitted") { const c = st.stageByRole("contact") ?? st.stageByRole("start"); delete store.ui.stamps[a.id]; st.saveUi(); if (c) { st.dispatch([op, { op: "application.update", id: a.id, patch: { stage: c.id } }]); toast(`${s.label} : à refaire.`); return; } }
  st.dispatch([op]);
  toast(on ? `${s.label} : fait.` : `${s.label} : à refaire.`);
}
export function toggleTask(id: string) {
  const t = store.data.tasks.find((x) => x.id === id); if (!t) return;
  const on = !t.doneAt;
  st.dispatch([{ op: "task.update", id, patch: { done: on } }]);
  if (on && st.listTasks().every((x) => x.doneAt)) { confetti(); toast("Ta liste est vide. Beau travail."); } else if (on) toast("Tâche terminée.");
}
export function cyclePiece(id: string) {
  const p = st.pieces().find((x) => x.id === id); if (!p) return;
  const order = ["attendue", "demandee", "recue"], cur = p.status === "certifier" ? "demandee" : p.status;
  const nx = order[(order.indexOf(cur) + 1) % 3];
  st.dispatch([{ op: "piece.update", id, patch: { status: nx as never } }]);
  if (nx === "recue") toast(`${p.label} : reçue.`);
}
/** Suites d'un envoi : l'étape de contact se coche et la candidature passe « en échange ». */
function afterSentOps(th: Thread): Op[] {
  const ops: Op[] = [];
  const a = th.applicationId ? st.app(th.applicationId) : null;
  if (a) {
    const k = a.steps.find((s) => st.isContact(s) && !s.doneAt); if (k) ops.push({ op: "step.update", id: k.id, patch: { done: true } });
    const c = st.stageByRole("contact"); if (c && st.stageRole(a) === "start") ops.push({ op: "application.update", id: a.id, patch: { stage: c.id } });
  }
  return ops;
}
export function markSent(id: string) {
  const th = st.thread(id); if (!th) return;
  st.dispatch([{ op: "thread.update", id, patch: { sentAt: iso(NOW()) } }, ...afterSentOps(th)]);
  toast("Envoi noté. Relance prévue dans 7 jours.");
}

// ---------- Pièces jointes et Outlook
const threadDocs = (t: Thread) => t.attachmentIds.map((id) => st.doc(id));

/**
 * Lien de composition Outlook sur le web : destinataires, copie et objet remplis.
 * L'encodage est fait à la main avec encodeURIComponent (espaces en %20) : URLSearchParams encoderait les
 * espaces en « + », qu'Outlook garderait tels quels dans l'objet. Le corps n'entre dans l'URL que s'il reste
 * court ; au-delà, la page de connexion de Microsoft rejette l'adresse (AADSTS90015), et le corps passe alors
 * par le presse-papiers (voir prepareOutlook).
 */
function outlookComposeUrl(t: Thread) {
  const r = parseRecipients(t.recipient), p: string[] = [];
  if (r.to.length) p.push("to=" + encodeURIComponent(r.to.join(";")));
  if (r.cc.length) p.push("cc=" + encodeURIComponent(r.cc.join(";")));
  p.push("subject=" + encodeURIComponent(t.subject));
  const base = "https://outlook.office.com/mail/deeplink/compose?" + p.join("&");
  const withBody = base + "&body=" + encodeURIComponent(t.body);
  return withBody.length <= 1900 ? withBody : base;
}

/** Enregistre les pièces une à une, espacées pour que le navigateur ne bloque pas la série. */
async function savePieces(docs: Doc[]) {
  for (const d of docs) {
    try { await saveDoc(d.id, attachmentName(d.title, d.mime)); }
    catch { toast(`Impossible d'enregistrer « ${d.title} ».`); }
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Ouvre Outlook (destinataire et objet remplis), copie le texte du courriel dans le presse-papiers, puis enregistre
 * les pièces à glisser. Rien ne part : coller le texte, glisser les pièces et envoyer restent tes gestes.
 * La copie est lancée avant window.open pour rester dans le geste de clic (sinon la fenêtre serait bloquée).
 */
export async function prepareOutlook(id: string) {
  const t = st.thread(id); if (!t) return;
  const copied = navigator.clipboard?.writeText(t.body).then(() => true, () => false) ?? Promise.resolve(false);
  window.open(outlookComposeUrl(t), "_blank", "noopener");
  const docs = threadDocs(t).filter((d): d is Doc => !!d);
  const txt = (await copied) ? "Si le texte n'y est pas, colle-le d'un Cmd+V (il est copié)." : "Copie le texte du courriel, plus bas, avant d'envoyer.";
  if (!docs.length) { toast(`Outlook s'ouvre. ${txt}`); return; }
  toast(`Outlook s'ouvre. ${txt} J'enregistre ${docs.length} pièce${docs.length > 1 ? "s" : ""} à glisser.`);
  await savePieces(docs);
}

/** Enregistre toutes les pièces d'un échange, sans ouvrir Outlook. */
export async function downloadPieces(id: string) {
  const t = st.thread(id); if (!t) return;
  const docs = threadDocs(t).filter((d): d is Doc => !!d);
  if (!docs.length) { toast("Ce courriel n'a aucune pièce."); return; }
  toast(`Enregistrement de ${docs.length} pièce${docs.length > 1 ? "s" : ""}.`);
  await savePieces(docs);
}

/** Choix des pièces : documents de la candidature liée d'abord, puis dossiers communs, puis autres candidatures. */
export function pjDialog(threadId: string) {
  const t = st.thread(threadId); if (!t) return;
  const sel = new Set(t.attachmentIds), c = st.cfg(), ds = st.docs();
  const row = (d: Doc) => `<label class="pj-pick"><input type="checkbox" name="doc" value="${d.id}" ${sel.has(d.id) ? "checked" : ""}><span>${esc(d.title)}</span><small>${fmtSize(d.sizeBytes)}</small></label>`;
  const group = (label: string, list: Doc[], open: boolean) => list.length ? `<details class="pj-g" ${open ? "open" : ""}><summary>${esc(label)} <small>${list.length}</small></summary>${list.map(row).join("")}</details>` : "";
  const linked = t.applicationId ? st.app(t.applicationId) : null;
  const folderIds = c.folders.map((f) => f.id);
  const blocks = [
    linked ? group(st.appLabel(linked), ds.filter((d) => d.applicationId === linked.id), true) : "",
    ...c.folders.map((f) => group(f.label, ds.filter((d) => !d.applicationId && d.folder === f.id), ds.some((d) => sel.has(d.id) && !d.applicationId && d.folder === f.id) || !linked)),
    group("Autres documents", ds.filter((d) => !d.applicationId && !folderIds.includes(d.folder)), false),
    ...st.apps().filter((a) => a.id !== linked?.id).map((a) => group(st.appLabel(a), ds.filter((d) => d.applicationId === a.id), ds.some((d) => sel.has(d.id) && d.applicationId === a.id))),
  ].join("");
  dlg(`<h2>Pièces à joindre</h2><p class="meta" style="margin-bottom:8px">${esc(t.title)}. Coche les fichiers qui partent avec ce courriel : ${SEND_LIMITS.maxFiles} au plus, 25 Mo en tout.</p><form data-form="pj" data-id="${t.id}"><div class="pj-list">${blocks || `<p class="meta">Aucun document. Ajoute d'abord tes fichiers dans la vue Documents.</p>`}</div><div class="acts" style="margin-top:12px"><button class="btn lime" type="submit">Enregistrer les pièces</button><button class="btn" type="button" data-close>Annuler</button></div></form>`);
}

/** Récapitulatif avant l'envoi par Outlook : expéditeur, destinataires, objet et pièces. */
export function sendDialog(threadId: string) {
  const t = st.thread(threadId); if (!t) return;
  const rc = parseRecipients(t.recipient), list = threadDocs(t).filter((d): d is Doc => !!d);
  const total = list.reduce((n, d) => n + d.sizeBytes, 0), missing = list.length !== t.attachmentIds.length;
  const blocker = !rc.to.length ? "Ajoute l'adresse e-mail du destinataire avec « Modifier »." : !t.subject.trim() ? "Ajoute un objet avec « Modifier »." : missing ? "Une pièce n'existe plus : modifie la liste des pièces." : total > SEND_LIMITS.maxTotalBytes ? "Les pièces dépassent 25 Mo : sépare-les en deux courriels." : "";
  dlg(`<h2>Envoyer depuis Outlook ?</h2><dl class="send-sum"><dt>De</dt><dd>${esc(store.data.mail.email ?? "")}</dd><dt>À</dt><dd>${esc(rc.to.join(", ") || "aucun destinataire")}</dd>${rc.cc.length ? `<dt>Copie</dt><dd>${esc(rc.cc.join(", "))}</dd>` : ""}<dt>Objet</dt><dd>${esc(t.subject)}</dd><dt>Pièces</dt><dd>${list.length ? `${list.length} fichier${list.length > 1 ? "s" : ""}, ${fmtSize(total)}<ul>${list.map((d) => `<li>${esc(d.title)}</li>`).join("")}</ul>` : "aucune"}</dd></dl>${blocker ? `<p class="note-c" role="alert" style="background:var(--rose)">${esc(blocker)}</p>` : `<p class="meta">Le courriel part tout de suite de ta boîte et s'enregistre dans tes éléments envoyés. Les réponses arriveront dans cet échange.</p>`}<div class="acts" style="margin-top:12px"><button class="btn lime" data-mailgo="${t.id}" ${blocker ? "disabled" : ""} autofocus>Envoyer le courriel</button><button class="btn" data-close>Annuler</button></div>`);
}

export async function sendNow(id: string, btn: HTMLButtonElement) {
  const t = st.thread(id); if (!t) return;
  btn.disabled = true; btn.textContent = "Envoi en cours…";
  try {
    const r = await fetch(`/api/threads/${encodeURIComponent(id)}/send`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Envoi impossible.");
    $<HTMLDialogElement>("#dlg").close();
    t.sentAt = j.sentAt;
    const ops = afterSentOps(t);
    if (ops.length) await st.dispatch(ops, { reload: true }); else await st.reload();
    toast(j.files ? `Courriel envoyé depuis Outlook, avec ${j.files} pièce${j.files > 1 ? "s" : ""}.` : "Courriel envoyé depuis Outlook.");
  } catch (e) {
    btn.disabled = false; btn.textContent = "Envoyer le courriel";
    toast((e as Error).message);
  }
}

/** Vérifie la boîte de réception maintenant. */
export async function syncNow(btn?: HTMLButtonElement) {
  if (btn) { btn.disabled = true; btn.textContent = "Vérification…"; }
  try {
    const r = await fetch("/api/outlook/sync", { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Vérification impossible.");
    await st.reload();
    toast(j.added ? `${j.added} nouvelle${j.added > 1 ? "s" : ""} réponse${j.added > 1 ? "s" : ""} rattachée${j.added > 1 ? "s" : ""}.` : "Aucune nouvelle réponse.");
  } catch (e) { toast((e as Error).message); }
  if (btn?.isConnected) { btn.disabled = false; btn.textContent = "Vérifier les réponses"; }
}

// ---------- Modes d'emploi
function actionBtns(use: How["use"], a: Application | null) {
  return use.map(([type, label, val], i) => {
    const main = i === 0 && ["th", "url"].includes(type);
    const arrow = main ? `<span>${ic("up")}</span>` : "";
    if (type === "url") return /^https?:\/\//.test(val) ? `<a class="btn ${main ? "main-a" : ""}" href="${esc(val)}" target="_blank" rel="noopener noreferrer">${esc(label)}${arrow}</a>` : "";
    let v = val;
    if (type === "kdoc") { if (!a) return ""; v = appDocs(a).find((d) => d.tag === val)?.id ?? ""; if (!v) return ""; }
    if (type === "copy" && !v && a) v = a.id;
    return `<button class="btn ${main ? "main-a" : ""}" data-use="${type}" data-val="${esc(v)}">${esc(label)}${arrow}</button>`;
  }).join("");
}
export const howBlock = (h: How | null, a: Application | null) => {
  if (!h) return "";
  // Sous un courriel à envoyer, la liste des pièces remplace les boutons qui ouvraient les mêmes fichiers.
  const ths = h.use.filter(([ty, l]) => ty === "th" && !/^Voir/.test(l)).map(([, , v]) => st.thread(v)).filter((x): x is Thread => !!x);
  const att = new Set(ths.flatMap((t) => t.attachmentIds)), folders = new Set([...att].map((id) => st.doc(id)?.folder));
  const kdocId = (v: string) => (a ? appDocs(a).find((d) => d.tag === v)?.id : undefined);
  const use = ths.length ? h.use.filter(([ty, , v]) => !((ty === "doc" && att.has(v)) || (ty === "kdoc" && att.has(kdocId(v) ?? "")) || (ty === "folder" && folders.has(v)))) : h.use;
  return `${h.why ? `<p class="why">${esc(h.why)}</p>` : ""}${h.how.length ? `<ol class="how">${h.how.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>` : ""}${ths.map(pjBlock).join("")}${use.length ? `<div class="acts">${actionBtns(use, a)}</div>` : ""}`;
};
export function howDialog(h: How | null, o: { task?: string; piece?: string; title?: string } = {}) {
  const t = o.task ? store.data.tasks.find((x) => x.id === o.task) : null;
  const on = !!t?.doneAt;
  dlg(`<h2>${esc(h?.t ?? t?.label ?? o.title ?? "")}</h2>${howBlock(h, t?.applicationId ? st.app(t.applicationId) ?? null : null) || `<p class="meta">Aucun mode d'emploi pour l'instant.</p>`}<div class="acts" style="margin-top:6px">${o.task ? `<button class="btn lime" data-donetask="${o.task}">${ic("check")}${on ? "Marquer comme à faire" : "C'est fait"}</button><button class="btn" data-edittask="${o.task}">${ic("pen")}Modifier</button>` : ""}<button class="btn" data-close>Fermer</button></div>`);
}

// ---------- Fiche d'une candidature
export function openDrawer(id: string, sp?: string) {
  const a = st.app(id); if (!a) return;
  const d = $<HTMLDialogElement>("#drawer");
  d.dataset.sp = sp || "";
  const openStep = sp || a.steps.find((s) => !s.doneAt)?.id;
  const dep = a.steps.find(st.isDepot), th = st.threads().filter((t) => t.applicationId === id), docs = appDocs(a);
  const ab = st.stageRole(a) === "dropped";
  const tierCls = a.tier === st.firstTier() ? "prio" : a.tier === st.lastTier() ? "res" : "opt";
  d.innerHTML = `<div class="dw-h"><div class="dw-top"><span class="tag tag-${tierCls}">${esc(st.tierLabel(a.tier))}</span>${a.variant ? `<span class="tag" style="background:var(--surface);color:var(--accent-text)">${esc(a.variant)}</span>` : ""}<button class="mini-btn" data-editapp="${a.id}" style="margin-left:auto">${ic("pen")}Modifier</button><button class="x" data-close aria-label="Fermer" autofocus>${ic("x")}</button></div><h2>${esc(st.appLabel(a))}</h2>${a.longTitle ? `<p>${esc(a.longTitle)}</p>` : ""}<p style="margin-top:8px;font-weight:600">${ab ? "Candidature écartée : aucune échéance à suivre" : dep?.dueDate ? `Date limite ${fD(dep.dueDate)} ${dep.doneAt ? "" : dueChip(dep.dueDate)}` : "Date limite à obtenir"}</p></div>
  <div class="dw-b">
   <section><h3>Où j'en suis</h3><div class="stepper" role="group" aria-label="Étape de la candidature">${st.cfg().stages.map((s) => `<button data-stage="${a.id}:${s.id}" aria-pressed="${a.stage === s.id}">${esc(s.label)}</button>`).join("")}</div></section>
   ${a.conditions ? `<section class="note-c"><b>À ne pas oublier :</b> ${esc(a.conditions)}</section>` : ""}
   <section><h3>${ab ? "Étapes, si tu la relances" : "Ce que tu dois faire"}</h3>${a.steps.map((s) => { const on = !!s.doneAt, title = s.how?.t ?? s.label; return `<div class="sp ${on ? "is-done" : ""}"><button class="ck" role="checkbox" aria-checked="${on}" aria-label="Marquer comme fait : ${esc(title)}" data-step="${s.id}" data-k="ds-${s.id}">${ic("check")}</button><details ${s.id === openStep ? "open" : ""}><summary><b>${esc(title)}</b><small>${s.dueDate ? (s.isTarget ? "À faire d'ici le " + fD(s.dueDate) : fL(s.dueDate)) : "Date à obtenir"}${!on && !ab && s.dueDate ? " " + dueChip(s.dueDate) : ""}</small></summary>${s.how ? howBlock(s.how, a) : s.note ? `<p class="why">${esc(s.note)}</p>` : ""}<div class="acts" style="margin-top:6px"><button class="mini-btn" data-editstep="${s.id}">${ic("pen")}Modifier l'étape</button></div></details></div>`; }).join("") || `<p class="meta">Aucune étape.</p>`}<div class="acts"><button class="btn" data-newstep="${a.id}">${ic("plus")}Ajouter une étape</button></div></section>
   <section><h3>Mes documents</h3>${docs.length ? `<div class="th-row">${docs.map((x) => `<button class="dc" data-doc="${x.id}"><span class="dc-t" style="height:128px">${thumbHtml(x)}</span><b style="font-size:12px">${esc(x.title)}</b></button>`).join("")}</div>` : `<p class="meta">Aucun document lié.</p>`}<div class="acts"><label class="btn" style="cursor:pointer">${ic("upload")}Ajouter un document<input type="file" class="sr" data-upload-doc="divers" data-app="${a.id}" accept="${ACCEPT}" multiple></label></div></section>
   ${a.formText ? `<section><h3>Texte du formulaire</h3><div class="acts" style="margin:0"><button class="btn" data-use="copy" data-val="${a.id}">${ic("copy")}Copier le texte de motivation</button></div></section>` : ""}
   <section><h3>Échanges</h3>${th.length ? th.map((t) => `<button class="row-btn" data-thread="${t.id}"><span><b>${esc(t.title)}</b></span><span class="st st-${st.thState(t)}">${st.TH_L[st.thState(t)]}</span></button>`).join("") : `<p class="meta">Aucun échange${a.channel ? ` : ${esc(a.channel.toLowerCase())}` : ""}.</p>`}<div class="acts"><button class="btn" data-act="newthread" data-app="${a.id}">Noter un échange</button></div></section>
   ${a.procedureUrl || a.programUrl ? `<section><h3>Liens officiels</h3><div class="acts" style="margin:0">${a.procedureUrl ? `<a class="btn main-a" href="${esc(a.procedureUrl)}" target="_blank" rel="noopener noreferrer">Procédure<span>${ic("up")}</span></a>` : ""}${a.programUrl ? `<a class="btn" href="${esc(a.programUrl)}" target="_blank" rel="noopener noreferrer">Fiche de la formation</a>` : ""}</div></section>` : ""}
   <section><label class="fld" for="note-${a.id}" style="font-family:var(--display);font-size:15.5px;font-weight:600">Mes notes</label><textarea class="inp" id="note-${a.id}" rows="3" data-note="${a.id}" maxlength="5000" placeholder="Nom d'un contact, conseil reçu, question à poser">${esc(a.notes)}</textarea></section>
  </div>`;
  d.dataset.id = id;
  if (!d.open) d.showModal();
  hydrateThumbs();
}

// ---------- Aperçu
let pvList: string[] = [], pvIdx = 0;
export function openPreview(id: string) {
  const d = st.doc(id); if (!d) return;
  pvList = st.docs().filter((x) => (d.applicationId ? x.applicationId === d.applicationId : !x.applicationId && x.folder === d.folder)).map((x) => x.id);
  pvIdx = Math.max(0, pvList.indexOf(id));
  renderPreview(id);
}
export function stepPreview(dir: number) { if (pvList.length < 2) return; pvIdx = (pvIdx + dir + pvList.length) % pvList.length; renderPreview(pvList[pvIdx]); }
export async function renderPreview(id: string) {
  const d = st.doc(id), pv = $<HTMLDialogElement>("#preview"); if (!d) return;
  const blur = d.sensitive && !store.ui.shown[d.id];
  pv.dataset.id = id;
  pv.innerHTML = `<div class="pv-pages" tabindex="0" aria-label="Pages du document"></div>
  <div class="pv-side"><button class="x" data-close aria-label="Fermer" autofocus>${ic("x")}</button><h2>${esc(d.title)}</h2><p class="meta">${esc(d.subtitle)}</p>${d.warning ? `<span class="tag tag-warn" style="align-self:flex-start">${esc(d.warning)}</span>` : ""}
   ${blur ? `<button class="btn lime" data-show="${d.id}">${ic("eye")}Afficher cette pièce sensible</button>` : ""}
   <a class="btn main-a" href="#" target="_blank" rel="noopener noreferrer" data-k="pvopen" aria-disabled="true">Ouvrir ${d.mime === "application/pdf" ? "le PDF" : "l'image"}<span>${ic("up")}</span></a>
   <button class="btn" data-editdoc="${d.id}">${ic("pen")}Modifier</button>
   <div class="pv-nav">${pvList.length > 1 ? `<button class="btn" data-pv="-1" aria-label="Document précédent">${ic("left")}</button><button class="btn" data-pv="1" aria-label="Document suivant">${ic("right")}</button>` : ""}</div></div>`;
  if (!pv.open) pv.showModal();
  const url = await previewPages(d, pv.querySelector(".pv-pages")!, blur);
  const a = pv.querySelector<HTMLAnchorElement>("[data-k=pvopen]");
  if (url && a && pv.dataset.id === id) { a.href = url; a.removeAttribute("aria-disabled"); }
}

// ---------- Recherche
let palSel = 0, palItems: { l: string; s: string; i: string; go: () => void }[] = [];
export function openPalette() { const i = $<HTMLInputElement>("#pal-in"); i.value = ""; palSel = 0; palette(""); $<HTMLDialogElement>("#pal").showModal(); i.focus(); }
export function palette(q: string) {
  const n = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), Q = n(q || "");
  const items: typeof palItems = [];
  st.sortedApps().forEach((a) => items.push({ l: st.appLabel(a), s: "Candidature · " + st.tierLabel(a.tier), go: () => openDrawer(a.id), i: "target" }));
  st.docs().forEach((d) => items.push({ l: d.title, s: "Document · " + (d.applicationId ? st.appLabel(st.app(d.applicationId)!) : st.cfg().folders.find((f) => f.id === d.folder)?.label ?? "Autres documents"), go: () => openPreview(d.id), i: "doc" }));
  st.threads().forEach((t) => items.push({ l: t.title, s: "Échange · " + st.TH_L[st.thState(t)], go: () => { store.ui.thSel = t.id; store.ui.view = "mail"; store.onChange(); }, i: "mail" }));
  st.pieces().forEach((p) => items.push({ l: p.label, s: "Pièce · " + st.PIECE_L[p.status], go: () => { store.ui.view = "docs"; store.ui.docFolder = "pieces"; store.onChange(); }, i: "folder" }));
  palItems = items.filter((x) => !Q || n(x.l + " " + x.s).includes(Q)).slice(0, 12);
  palSel = Math.min(palSel, Math.max(0, palItems.length - 1));
  $("#pal-r").innerHTML = palItems.map((x, i) => `<button class="pal-i ${i === palSel ? "on" : ""}" data-pal="${i}" role="option" aria-selected="${i === palSel}">${ic(x.i)}<span>${esc(x.l)}<small>${esc(x.s)}</small></span></button>`).join("") || `<p class="meta" style="padding:12px">Aucun résultat. Essaie le nom d'une université ou d'une pièce.</p>`;
}
export function palMove(dir: number) { palSel = (palSel + dir + palItems.length) % (palItems.length || 1); palette($<HTMLInputElement>("#pal-in").value); }
export function palGo(i = palSel) { const it = palItems[i]; $<HTMLDialogElement>("#pal").close(); it?.go(); }

// ---------- Formulaires
const opt = (v: string, l: string, sel: string | null | undefined) => `<option value="${esc(v)}" ${v === (sel ?? "") ? "selected" : ""}>${esc(l)}</option>`;
const appOpts = (sel?: string | null) => opt("", "Aucune", sel) + st.sortedApps().map((a) => opt(a.id, st.appLabel(a), sel)).join("");
const field = (id: string, label: string, input: string) => `<label class="fld" for="${id}">${esc(label)}</label>${input}`;
const text = (name: string, v: string, o: { req?: boolean; max?: number; ph?: string; type?: string } = {}) => `<input class="inp" id="f-${name}" name="${name}" type="${o.type ?? "text"}" value="${esc(v)}" ${o.req ? "required" : ""} maxlength="${o.max ?? 200}" placeholder="${esc(o.ph ?? "")}">`;
const area = (name: string, v: string, rows = 3, max = 2000, ph = "") => `<textarea class="inp" id="f-${name}" name="${name}" rows="${rows}" maxlength="${max}" placeholder="${esc(ph)}">${esc(v)}</textarea>`;
const check = (name: string, label: string, on: boolean) => `<label class="fld" style="display:flex;gap:8px;align-items:center;font-weight:400"><input type="checkbox" name="${name}" ${on ? "checked" : ""}>${esc(label)}</label>`;
const formEnd = (save: string, del?: string) => `<div class="acts" style="margin-top:12px"><button class="btn lime" type="submit">${esc(save)}</button><button class="btn" type="button" data-close>Annuler</button>${del ? `<button class="btn" type="button" ${del} style="margin-left:auto">${ic("trash")}Supprimer</button>` : ""}</div>`;

export function appDialog(id?: string) {
  const a = id ? st.app(id) : null, c = st.cfg();
  dlg(`<h2>${a ? "Modifier la candidature" : "Nouvelle candidature"}</h2><form data-form="app" data-id="${a?.id ?? ""}">
   ${field("f-university", "Université ou école", text("university", a?.university ?? "", { req: true, max: 120, ph: "Université de Toulouse" }))}
   ${field("f-program", "Formation", text("program", a?.program ?? "", { req: true, max: 160, ph: "Master IA" }))}
   ${field("f-longTitle", "Intitulé complet", text("longTitle", a?.longTitle ?? "", { max: 300 }))}
   ${field("f-tier", "Niveau", `<select class="inp" id="f-tier" name="tier">${c.tiers.map((t) => opt(t.id, t.label, a?.tier ?? c.tiers[0].id)).join("")}</select>`)}
   ${field("f-stage", "Étape", `<select class="inp" id="f-stage" name="stage">${c.stages.map((s) => opt(s.id, s.label, a?.stage ?? c.stages[0].id)).join("")}</select>`)}
   ${field("f-variant", "Variante ou parcours", text("variant", a?.variant ?? "", { max: 80 }))}
   ${field("f-channel", "Canal de candidature", text("channel", a?.channel ?? "", { max: 200, ph: "Plateforme de l'université, courriel…" }))}
   ${field("f-conditions", "À ne pas oublier", area("conditions", a?.conditions ?? "", 2))}
   ${field("f-procedureUrl", "Lien de la procédure", text("procedureUrl", a?.procedureUrl ?? "", { type: "url", max: 600, ph: "https://" }))}
   ${field("f-programUrl", "Lien de la formation", text("programUrl", a?.programUrl ?? "", { type: "url", max: 600, ph: "https://" }))}
   ${field("f-formText", "Texte du formulaire (motivation à copier)", area("formText", a?.formText ?? "", 4, 8000))}
   ${a ? "" : field("f-deadline", "Date limite du dépôt (facultatif)", `<input class="inp" id="f-deadline" name="deadline" type="date">`)}
   ${formEnd(a ? "Enregistrer" : "Ajouter la candidature", a ? `data-delapp="${a.id}"` : undefined)}</form>`);
}
export function stepDialog(appId: string, stepId?: string) {
  const a = st.app(appId), s = stepId ? a?.steps.find((x) => x.id === stepId) : null, c = st.cfg();
  if (!a) return;
  dlg(`<h2>${s ? "Modifier l'étape" : "Nouvelle étape"}</h2><p class="meta">${esc(st.appLabel(a))}</p><form data-form="step" data-id="${s?.id ?? ""}" data-app="${a.id}">
   ${field("f-label", "Libellé", text("label", s?.label ?? "", { req: true, ph: "Dépôt du dossier" }))}
   ${field("f-kind", "Type", `<select class="inp" id="f-kind" name="kind">${c.stepKinds.map((k) => opt(k.id, k.label, s?.kind ?? c.stepKinds[0].id)).join("")}</select>`)}
   ${field("f-dueDate", "Date", `<input class="inp" id="f-dueDate" name="dueDate" type="date" value="${esc(s?.dueDate ?? "")}">`)}
   ${check("isTarget", "C'est un objectif personnel, pas une date limite officielle", !!s?.isTarget)}
   ${field("f-note", "Note", area("note", s?.note ?? "", 2, 1000))}
   ${formEnd(s ? "Enregistrer" : "Ajouter l'étape", s ? `data-delstep="${s.id}"` : undefined)}</form>`);
}
export function taskDialog(id?: string) {
  const t = id ? store.data.tasks.find((x) => x.id === id) : null, c = st.cfg();
  dlg(`<h2>${t ? "Modifier la tâche" : "Nouvelle tâche"}</h2><form data-form="task" data-id="${t?.id ?? ""}">
   ${field("f-label", "Ce qu'il faut faire", text("label", t?.label ?? "", { req: true, ph: "Demander l'attestation de réussite" }))}
   ${field("f-dueDate", "Pour quand", `<input class="inp" id="f-dueDate" name="dueDate" type="date" value="${esc(t?.dueDate ?? "")}">`)}
   ${c.tracks.length ? field("f-track", "Fil", `<select class="inp" id="f-track" name="track">${opt("", "Ma liste", t?.track)}${c.tracks.map((x) => opt(x.id, x.label, t?.track)).join("")}</select>`) : ""}
   ${field("f-applicationId", "Candidature liée", `<select class="inp" id="f-applicationId" name="applicationId">${appOpts(t?.applicationId)}</select>`)}
   ${formEnd(t ? "Enregistrer" : "Ajouter la tâche", t ? `data-deltask="${t.id}"` : undefined)}</form>`);
}
export function pieceDialog(id?: string) {
  const p = id ? st.pieces().find((x) => x.id === id) : null;
  dlg(`<h2>${p ? "Modifier la pièce" : "Nouvelle pièce"}</h2><form data-form="piece" data-id="${p?.id ?? ""}">
   ${field("f-label", "Pièce", text("label", p?.label ?? "", { req: true, ph: "Relevé de notes certifié" }))}
   ${field("f-who", "Qui la fournit", text("who", p?.who ?? "", { max: 80, ph: "Scolarité, enseignant, toi…" }))}
   ${field("f-status", "Statut", `<select class="inp" id="f-status" name="status">${PIECE_STATUSES.map((s) => opt(s, st.PIECE_L[s], p?.status ?? "attendue")).join("")}</select>`)}
   ${field("f-note", "Note", area("note", p?.note ?? "", 2, 500))}
   ${formEnd(p ? "Enregistrer" : "Ajouter la pièce", p ? `data-delpiece="${p.id}"` : undefined)}</form>`);
}
export function threadDialog(appId?: string, id?: string) {
  const t = id ? st.thread(id) : null;
  dlg(`<h2>${t ? "Modifier l'échange" : "Nouvel échange"}</h2><form data-form="thread" data-id="${t?.id ?? ""}">
   ${field("f-title", "Avec qui ?", text("title", t?.title ?? "", { req: true, ph: "Service des relations internationales" }))}
   ${field("f-recipient", "Adresse e-mail du destinataire", text("recipient", t?.recipient ?? "", { max: 500, ph: "contact@universite.fr" }))}
   ${field("f-applicationId", "Candidature liée", `<select class="inp" id="f-applicationId" name="applicationId">${appOpts(t ? t.applicationId : appId)}</select>`)}
   ${field("f-kind", "Type", `<select class="inp" id="f-kind" name="kind">${THREAD_KINDS.map((k) => opt(k, THREAD_KIND_L[k], t?.kind ?? "premier_contact")).join("")}</select>`)}
   ${field("f-subject", "Objet", text("subject", t?.subject ?? "", { max: 300 }))}
   ${field("f-body", "Texte du courriel, ou ce qui a été dit", area("body", t?.body ?? "", 7, 20000))}
   ${t ? "" : check("sent", "Déjà envoyé ou déjà eu lieu aujourd'hui", false)}
   ${formEnd(t ? "Enregistrer" : "Enregistrer l'échange", t ? `data-delthread="${t.id}"` : undefined)}</form>`);
}
export function replyDialog(threadId: string) {
  dlg(`<h2>Noter la réponse</h2><form data-form="reply" data-id="${esc(threadId)}"><p class="meta" style="margin-bottom:6px">Colle le courriel reçu en entier, ou résume-le. La page le met en forme et garde ton texte d'origine.</p>${field("rp-t", "Réponse reçue", `<textarea class="inp" id="rp-t" name="rawText" rows="9" required maxlength="50000" placeholder="Colle ici le courriel reçu"></textarea>`)}${field("rp-d", "Date", `<input class="inp" type="date" id="rp-d" name="receivedOn" value="${iso(NOW())}" required>`)}<div class="acts" style="margin-top:12px"><button class="btn lime" type="submit">Enregistrer la réponse</button><button class="btn" type="button" data-close>Annuler</button></div></form>`);
}
export function rawMessage(id: string) {
  const m = st.threads().flatMap((t) => t.messages).find((x) => x.id === id); if (!m) return;
  dlg(`<h2>Texte d'origine</h2><div class="mail-box" style="max-height:60dvh;overflow:auto">${esc(m.rawText)}</div><div class="acts"><button class="btn" data-close>Fermer</button></div>`);
}
export function docDialog(id: string) {
  const d = st.doc(id); if (!d) return;
  $<HTMLDialogElement>("#preview").close();
  const c = st.cfg();
  dlg(`<h2>Modifier le document</h2><form data-form="doc" data-id="${d.id}">
   ${field("f-title", "Titre", text("title", d.title, { req: true }))}
   ${field("f-subtitle", "Description", text("subtitle", d.subtitle, { max: 300 }))}
   ${field("f-applicationId", "Candidature", `<select class="inp" id="f-applicationId" name="applicationId">${appOpts(d.applicationId)}</select>`)}
   ${field("f-folder", "Dossier (si aucune candidature)", `<select class="inp" id="f-folder" name="folder">${c.folders.map((f) => opt(f.id, f.label, d.folder)).join("")}${opt("divers", "Autres documents", c.folders.some((f) => f.id === d.folder) ? "" : d.folder)}</select>`)}
   ${field("f-tag", "Nature", `<select class="inp" id="f-tag" name="tag">${DOC_TAGS.map(([v, l]) => opt(v, l, d.tag)).join("")}</select>`)}
   ${field("f-warning", "Avertissement affiché", text("warning", d.warning, { max: 120, ph: "Ne pas réutiliser tel quel" }))}
   ${check("sensitive", "Pièce sensible : floutée tant que je ne l'affiche pas", d.sensitive)}
   ${formEnd("Enregistrer", `data-deldoc="${d.id}"`)}</form>`);
}

/** Lit un formulaire et renvoie les opérations à envoyer. */
export function formOps(f: HTMLFormElement): { ops: Op[]; msg: string; after?: () => void } | null {
  const v = (k: string) => String(new FormData(f).get(k) ?? "").trim();
  const on = (k: string) => new FormData(f).get(k) === "on";
  const dateOrNull = (k: string) => v(k) || null;
  const id = f.dataset.id || "";
  switch (f.dataset.form) {
    case "app": {
      const data = { university: v("university"), program: v("program"), longTitle: v("longTitle"), tier: v("tier"), stage: v("stage"), variant: v("variant"), channel: v("channel"), conditions: v("conditions"), procedureUrl: v("procedureUrl"), programUrl: v("programUrl"), formText: v("formText") };
      if (id) return { ops: [{ op: "application.update", id, patch: data }], msg: "Candidature enregistrée." };
      const nid = uid(), ops: Op[] = [{ op: "application.create", id: nid, data: { ...data, position: st.apps().length } }];
      const depot = st.cfg().stepKinds.find((k) => k.lane === "depots");
      if (v("deadline") && depot) ops.push({ op: "step.create", id: uid(), applicationId: nid, data: { label: "Dépôt du dossier", kind: depot.id, dueDate: v("deadline"), position: 0 } });
      return { ops, msg: "Candidature ajoutée.", after: () => openDrawer(nid) };
    }
    case "step": {
      const app = f.dataset.app!, data = { label: v("label"), kind: v("kind"), dueDate: dateOrNull("dueDate"), isTarget: on("isTarget"), note: v("note") };
      if (id) return { ops: [{ op: "step.update", id, patch: data }], msg: "Étape enregistrée.", after: () => openDrawer(app, id) };
      return { ops: [{ op: "step.create", id: uid(), applicationId: app, data: { ...data, position: st.app(app)?.steps.length ?? 0 } }], msg: "Étape ajoutée.", after: () => openDrawer(app) };
    }
    case "task": {
      const data = { label: v("label"), dueDate: dateOrNull("dueDate"), track: v("track") || null, applicationId: v("applicationId") || null };
      if (id) return { ops: [{ op: "task.update", id, patch: data }], msg: "Tâche enregistrée." };
      return { ops: [{ op: "task.create", id: uid(), data: { ...data, position: store.data.tasks.length } }], msg: "Tâche ajoutée." };
    }
    case "piece": {
      const data = { label: v("label"), who: v("who"), status: v("status") as never, note: v("note") };
      if (id) return { ops: [{ op: "piece.update", id, patch: data }], msg: "Pièce enregistrée." };
      return { ops: [{ op: "piece.create", id: uid(), data: { ...data, position: st.pieces().length } }], msg: "Pièce ajoutée." };
    }
    case "thread": {
      const data = { title: v("title"), recipient: v("recipient"), applicationId: v("applicationId") || null, kind: v("kind") as never, subject: v("subject"), body: v("body") };
      if (id) return { ops: [{ op: "thread.update", id, patch: data }], msg: "Échange enregistré." };
      const nid = uid();
      return { ops: [{ op: "thread.create", id: nid, data: { ...data, sentAt: on("sent") ? iso(NOW()) : null, position: st.threads().length } }], msg: "Échange enregistré.", after: () => { store.ui.thSel = nid; store.ui.view = "mail"; } };
    }
    case "reply": {
      const raw = String(new FormData(f).get("rawText") ?? "");
      return { ops: [{ op: "message.create", id: uid(), threadId: id, data: { direction: "in", rawText: raw, receivedOn: v("receivedOn") } }], msg: /généré automatiquement|réponse automatique|automatic reply|auto-reply|ne pas répondre|no-reply/i.test(raw) ? "Réponse automatique notée. L'échange reste en attente d'une vraie réponse." : "Réponse enregistrée." };
    }
    case "pj": {
      const picked = new FormData(f).getAll("doc").map(String), prev = st.thread(id)?.attachmentIds ?? [];
      const ids = [...prev.filter((x) => picked.includes(x)), ...picked.filter((x) => !prev.includes(x))];
      if (ids.length > SEND_LIMITS.maxFiles) { toast(`${SEND_LIMITS.maxFiles} pièces au plus par courriel.`); return null; }
      return { ops: [{ op: "thread.update", id, patch: { attachmentIds: ids } }], msg: ids.length ? `${ids.length} pièce${ids.length > 1 ? "s" : ""} à joindre.` : "Aucune pièce jointe." };
    }
    case "doc": {
      const app = v("applicationId") || null;
      return { ops: [{ op: "document.update", id, patch: { title: v("title"), subtitle: v("subtitle"), applicationId: app, folder: v("folder") || "divers", tag: v("tag"), warning: v("warning"), sensitive: on("sensitive") } }], msg: "Document enregistré." };
    }
  }
  return null;
}

export const dateValid = (s: string) => !s || !isNaN(D(s).getTime());
