// Assistant : la personne décrit ce qu'elle veut, le modèle propose des opérations,
// la personne voit l'aperçu, applique, et peut annuler.
import type { Op } from "@/lib/ops";
import * as st from "./state";
import { $, esc, ic } from "./util";

type Turn = { role: "user" | "assistant"; text: string; change?: { id: string; summary: string; ops: Op[]; state: "proposed" | "applied" | "undone" | "ignored" } };
let turns: Turn[] = [];
let busy = false;

const EXAMPLES = [
  "Ajoute une candidature pour le master IA de l'Université de Lyon, dépôt le 20 novembre.",
  "Ajoute une colonne « Entretien » entre Déposée et Présélectionnée.",
  "Je viens de recevoir ce courriel, note-le dans l'échange avec Toulouse : …",
  "Retire la vue Calendrier et mets le Tableau en premier.",
];

function label(op: Op): string {
  const app = (id: string) => { const a = st.app(id); return a ? st.appLabel(a) : "nouvelle candidature"; };
  const step = (id: string) => st.apps().flatMap((a) => a.steps).find((s) => s.id === id)?.label ?? "étape";
  const named = <T extends { id: string }>(list: T[], id: string, f: (x: T) => string, d: string) => { const x = list.find((i) => i.id === id); return x ? f(x) : d; };
  switch (op.op) {
    case "workspace.update": return op.patch.config ? "Modifier la structure de l'espace (colonnes, vues, dossiers…)" : `Renommer l'espace en « ${op.patch.name} »`;
    case "application.create": return `Ajouter la candidature ${op.data.university} ${op.data.program}`;
    case "application.update": return `Modifier ${app(op.id)} : ${Object.keys(op.patch).join(", ")}`;
    case "application.delete": return `Supprimer la candidature ${app(op.id)}`;
    case "step.create": return `Ajouter l'étape « ${op.data.label} »${op.data.dueDate ? ` le ${op.data.dueDate}` : ""} à ${app(op.applicationId)}`;
    case "step.update": return `Modifier l'étape « ${step(op.id)} »`;
    case "step.delete": return `Supprimer l'étape « ${step(op.id)} »`;
    case "task.create": return `Ajouter la tâche « ${op.data.label} »`;
    case "task.update": return `Modifier la tâche « ${named(st.store.data.tasks, op.id, (x) => x.label, "tâche")} »`;
    case "task.delete": return `Supprimer la tâche « ${named(st.store.data.tasks, op.id, (x) => x.label, "tâche")} »`;
    case "piece.create": return `Ajouter la pièce « ${op.data.label} »`;
    case "piece.update": return `Modifier la pièce « ${named(st.pieces(), op.id, (x) => x.label, "pièce")} »`;
    case "piece.delete": return `Supprimer la pièce « ${named(st.pieces(), op.id, (x) => x.label, "pièce")} »`;
    case "thread.create": return `Créer l'échange « ${op.data.title} »`;
    case "thread.update": return `Modifier l'échange « ${named(st.threads(), op.id, (x) => x.title, "échange")} »`;
    case "thread.delete": return `Supprimer l'échange « ${named(st.threads(), op.id, (x) => x.title, "échange")} »`;
    case "message.create": return `Noter un message ${op.data.direction === "in" ? "reçu" : "envoyé"} le ${op.data.receivedOn}`;
    case "message.delete": return "Supprimer un message noté";
    case "document.update": return `Modifier le document « ${named(st.docs(), op.id, (x) => x.title, "document")} »`;
    case "document.delete": return "Supprimer un document";
  }
}

function changeHtml(t: Turn, i: number) {
  const c = t.change!;
  const dels = c.ops.filter((o) => o.op.endsWith(".delete")).length;
  return `<div class="ai-change"><p>${esc(c.summary || "Changements proposés.")}</p><ul>${c.ops.slice(0, 30).map((o) => `<li class="${o.op.endsWith(".delete") ? "del" : ""}">${esc(label(o))}</li>`).join("")}${c.ops.length > 30 ? `<li>Et ${c.ops.length - 30} autres changements.</li>` : ""}</ul>
  ${dels ? `<p class="meta" style="color:var(--rose-deep)">Attention : ${dels} suppression${dels > 1 ? "s" : ""}.</p>` : ""}
  <div class="acts">${c.state === "proposed" ? `<button class="btn lime" data-ai-apply="${i}">${ic("check")}Appliquer</button><button class="btn" data-ai-ignore="${i}">Ignorer</button>` : c.state === "applied" ? `<span class="tag" style="background:var(--sage)">Appliqué</span><button class="btn" data-ai-undo="${i}">Annuler ce changement</button>` : `<span class="tag">${c.state === "undone" ? "Annulé" : "Ignoré"}</span>`}</div></div>`;
}

function render() {
  const d = $<HTMLDialogElement>("#assistant");
  const log = turns.map((t, i) => t.role === "user" ? `<div class="ai-msg me">${esc(t.text)}</div>` : `<div class="ai-msg">${t.text ? `<p>${esc(t.text)}</p>` : ""}${t.change ? changeHtml(t, i) : ""}</div>`).join("");
  d.innerHTML = `<div class="dw-h"><div class="dw-top"><span class="tag" style="background:var(--accent-soft);color:var(--accent-text)">${ic("spark")}Assistant</span><button class="x" data-close aria-label="Fermer">${ic("x")}</button></div><h2>Personnaliser mon parcours</h2><p>Décris ce que tu veux changer. Rien n'est appliqué sans ton accord, et tout peut être annulé.</p></div>
  <div class="dw-b ai-b"><div class="ai-log" aria-live="polite">${log || `<div class="ai-ex"><p class="meta">Par exemple :</p>${EXAMPLES.map((e) => `<button class="chip" data-ai-ex="${esc(e)}">${esc(e)}</button>`).join("")}</div>`}${busy ? `<div class="ai-msg"><p class="meta">Je prépare une proposition…</p></div>` : ""}</div>
  <form class="ai-form" data-ai-form><label class="sr" for="ai-in">Ta demande</label><textarea class="inp" id="ai-in" rows="3" maxlength="20000" placeholder="Ajoute, modifie, réorganise…" ${busy ? "disabled" : ""}></textarea><button class="btn lime" type="submit" ${busy ? "disabled" : ""}>Envoyer</button></form>
  <p class="meta ai-note">Le texte que tu colles (un courriel, par exemple) est traité comme une information, jamais comme une consigne. L'assistant utilise ta clé, réglable dans <a href="/reglages">Réglages</a>.</p></div>`;
  const logEl = d.querySelector(".ai-log"); if (logEl) logEl.scrollTop = logEl.scrollHeight;
}

async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "L'assistant ne répond pas.");
  return j;
}

async function send(prompt: string) {
  if (busy || !prompt.trim()) return;
  const history = turns.map((t) => ({ role: t.role, text: (t.text || t.change?.summary || "").slice(0, 4000) })).filter((t) => t.text).slice(-8);
  turns.push({ role: "user", text: prompt });
  busy = true; render();
  try {
    const r = await post("/api/ai/propose", { prompt, history });
    turns.push(r.kind === "change" ? { role: "assistant", text: "", change: { id: r.id, summary: r.summary, ops: r.ops, state: "proposed" } } : { role: "assistant", text: r.text });
  } catch (e) { turns.push({ role: "assistant", text: (e as Error).message }); }
  busy = false; render();
  $<HTMLTextAreaElement>("#ai-in")?.focus();
}

async function act(i: number, action: "apply" | "undo") {
  const c = turns[i]?.change; if (!c || busy) return;
  busy = true; render();
  try {
    await post(`/api/ai/changes/${c.id}`, { action });
    c.state = action === "apply" ? "applied" : "undone";
    await st.reload();
  } catch (e) { turns.push({ role: "assistant", text: (e as Error).message }); }
  busy = false; render();
}

let wired = false;
function wire() {
  if (wired) return; wired = true;
  const d = $<HTMLDialogElement>("#assistant");
  d.addEventListener("click", (ev) => {
    const t = (ev.target as HTMLElement).closest<HTMLElement>("[data-ai-ex],[data-ai-apply],[data-ai-ignore],[data-ai-undo]");
    if (!t) return;
    ev.stopPropagation();
    const a = t.dataset;
    if (a.aiEx) { const i = $<HTMLTextAreaElement>("#ai-in"); i.value = a.aiEx.replace(/ : …$/, " : "); i.focus(); }
    if (a.aiApply) act(+a.aiApply, "apply");
    if (a.aiUndo) act(+a.aiUndo, "undo");
    if (a.aiIgnore) { const c = turns[+a.aiIgnore].change; if (c) c.state = "ignored"; render(); }
  });
  d.addEventListener("submit", (ev) => {
    if (!(ev.target as HTMLElement).matches("[data-ai-form]")) return;
    ev.preventDefault(); ev.stopPropagation();
    send($<HTMLTextAreaElement>("#ai-in").value);
  });
  d.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey) && (ev.target as HTMLElement).id === "ai-in") { ev.preventDefault(); send((ev.target as HTMLTextAreaElement).value); }
  });
}

export function openAssistant() {
  wire();
  render();
  const d = $<HTMLDialogElement>("#assistant");
  if (!d.open) d.showModal();
  $<HTMLTextAreaElement>("#ai-in")?.focus();
}

/** Réinitialise la conversation (changement d'utilisateur ou démontage). */
export function resetAssistant() { turns = []; busy = false; wired = false; }
