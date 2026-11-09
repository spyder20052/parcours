// État du moteur : données de l'espace (serveur) et préférences d'affichage (navigateur).
import type { Application, Config, Doc, Piece, Step, Task, Thread, WorkspaceData } from "@/lib/model";
import type { Op } from "@/lib/ops";
import { D, DAY, NOW, iso, isAuto, msLeft, until, urg } from "./util";

export type Ui = {
  view: string; scope: "main" | "all"; zoom: number; tip: boolean; calMode: "week" | "month"; calAnchor: string | null;
  docFolder: string | null; thSel: string | null; thFilter: string; theme: "auto" | "light" | "dark"; shown: Record<string, boolean>; stamps: Record<string, boolean>;
};
const DEF_UI: Ui = { view: "canvas", scope: "main", zoom: 1, tip: true, calMode: "week", calAnchor: null, docFolder: null, thSel: null, thFilter: "all", theme: "auto", shown: {}, stamps: {} };

export const store = {
  data: null as unknown as WorkspaceData,
  ui: { ...DEF_UI } as Ui,
  key: "parcours-ui",
  onChange: () => {},
  onError: (m: string) => console.error(m),
};

export function initStore(data: WorkspaceData) {
  store.data = data;
  store.key = "parcours-ui-" + data.me.id;
  try { store.ui = { ...DEF_UI, ...JSON.parse(localStorage.getItem(store.key) || "{}") }; } catch { store.ui = { ...DEF_UI }; }
  if (!cfg().views.includes(store.ui.view as never)) store.ui.view = cfg().views[0];
}
export const saveUi = () => { try { localStorage.setItem(store.key, JSON.stringify(store.ui)); } catch { /* navigation privée */ } };

// ---------- Sélecteurs
export const cfg = (): Config => store.data.workspace.config;
export const apps = () => store.data.applications;
export const app = (id: string) => apps().find((a) => a.id === id);
export const stageDef = (id: string) => cfg().stages.find((s) => s.id === id);
export const stageByRole = (role: string) => cfg().stages.find((s) => s.role === role);
export const stageRole = (a: Application) => stageDef(a.stage)?.role;
export const tierLabel = (id: string) => cfg().tiers.find((t) => t.id === id)?.label ?? id;
export const tierRank = (id: string) => { const i = cfg().tiers.findIndex((t) => t.id === id); return i < 0 ? 99 : i; };
export const firstTier = () => cfg().tiers[0]?.id;
export const lastTier = () => cfg().tiers[cfg().tiers.length - 1]?.id;
export const kindLane = (k: string) => cfg().stepKinds.find((x) => x.id === k)?.lane ?? "depots";
export const isDepot = (s: Step) => kindLane(s.kind) === "depots";
export const isContact = (s: Step) => kindLane(s.kind) === "courriels";
export const sortedApps = () => apps().slice().sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.position - b.position);
export const progress = (a: Application) => (a.steps.length ? Math.round(100 * a.steps.filter((s) => s.doneAt).length / a.steps.length) : 0);
export const listTasks = (): Task[] => store.data.tasks.filter((t) => !t.track);
export const trackTasks = (track: string): Task[] => store.data.tasks.filter((t) => t.track === track).sort((a, b) => (a.dueDate ?? "") < (b.dueDate ?? "") ? -1 : 1);
export const pieces = (): Piece[] => store.data.pieces;
export const piecesGot = () => pieces().filter((p) => p.status === "recue").length;
export const docs = (): Doc[] => store.data.documents;
export const doc = (id: string) => docs().find((d) => d.id === id);
export const threads = (): Thread[] => store.data.threads;
export const thread = (id: string) => threads().find((t) => t.id === id);
export const appLabel = (a: Application) => `${a.university} ${a.program}`;
export const uniqueApp = () => { const s = stageByRole("unique"); return s ? apps().find((a) => a.stage === s.id) ?? null : null; };

export type ThState = "envoyer" | "attente" | "relance" | "repondu";
export const thState = (t: Thread): ThState => {
  if (t.messages.some((m) => m.direction === "in" && !isAuto(m.rawText))) return "repondu";
  if (t.sentAt) return Math.round((NOW().getTime() - D(t.sentAt).getTime()) / DAY) >= 7 ? "relance" : "attente";
  return "envoyer";
};
export const TH_L: Record<ThState, string> = { envoyer: "À envoyer", attente: "En attente", relance: "À relancer", repondu: "Réponse reçue" };
export const PIECE_L: Record<string, string> = { attendue: "À obtenir", demandee: "Demandée", certifier: "À certifier", recue: "Reçue" };

export type Ev = { d: string; l: string; sub: string; kind: string; done: boolean; id: string; app?: Application; step?: Step; task?: Task; thread?: Thread; milestone?: string };
export function events(): Ev[] {
  const L: Ev[] = [];
  const dropped = stageByRole("dropped")?.id;
  apps().forEach((a) => { if (a.stage === dropped) return; a.steps.forEach((s) => { if (s.dueDate) L.push({ d: s.dueDate, l: s.label, sub: appLabel(a), kind: kindLane(s.kind), done: !!s.doneAt, id: "s-" + s.id, app: a, step: s }); }); });
  store.data.tasks.forEach((t) => { if (t.dueDate) L.push({ d: t.dueDate, l: t.label, sub: t.track ? (cfg().tracks.find((x) => x.id === t.track)?.label ?? "") : "Ma liste", kind: t.track ? "track" : "task", done: !!t.doneAt, id: "t-" + t.id, task: t }); });
  threads().forEach((t) => { if (t.sentAt && thState(t) !== "repondu") { const d = new Date(D(t.sentAt).getTime() + 7 * DAY); L.push({ d: iso(d), l: "Relancer", sub: t.title, kind: "relance", done: false, id: "r-" + t.id, thread: t }); } });
  cfg().milestones.forEach((m) => L.push({ d: m.date, l: m.label, sub: m.sub, kind: "nat", done: false, id: "m-" + m.id, milestone: m.id }));
  return L.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}

/** Types d'événements qui demandent une action de la personne. */
export const URG_KINDS = ["depots", "courriels", "task", "track", "relance"];
/** Échéances en retard ou à moins de 48 h, dépôts d'abord. */
export function urgentList() {
  const rank = (e: Ev) => (msLeft(e.d) < 0 ? 2 : 0) + (e.kind === "depots" ? 0 : 1);
  return events().filter((e) => !e.done && URG_KINDS.includes(e.kind) && ["late", "crit"].includes(urg(e.d))).sort((a, b) => rank(a) - rank(b) || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
}
/** Signature des niveaux : quand elle change, le moteur refait le rendu complet. */
export const urgSig = () => events().filter((e) => !e.done).map((e) => urg(e.d)).join("");

export function nextDeadline() {
  const busy = new Set(cfg().stages.filter((s) => ["submitted", "shortlisted", "unique", "dropped"].includes(s.role ?? "")).map((s) => s.id));
  const L = apps().filter((a) => !busy.has(a.stage) && a.tier !== lastTier())
    .map((a) => ({ a, s: a.steps.find((s) => isDepot(s) && s.dueDate) }))
    .filter((x): x is { a: Application; s: Step } => !!x.s && until(x.s.dueDate!) >= 0 && !x.s.doneAt)
    .sort((x, y) => (x.s.dueDate! < y.s.dueDate! ? -1 : 1));
  return L[0] ?? null;
}

// ---------- Application locale des opérations (affichage immédiat), puis confirmation serveur
function patchList<T extends { id: string }>(list: T[], id: string, patch: Partial<T>) { const x = list.find((i) => i.id === id); if (x) Object.assign(x, patch); }
const doneAt = (v: unknown) => (v === undefined ? undefined : v ? new Date().toISOString() : null);
function localApply(op: Op) {
  const d = store.data;
  const strip = (o: Record<string, unknown>) => { const { done, ...r } = o; const da = doneAt(done); return da === undefined ? r : { ...r, doneAt: da }; };
  switch (op.op) {
    case "workspace.update": Object.assign(d.workspace, op.patch); break;
    case "application.update": patchList(d.applications, op.id, op.patch as never); break;
    case "step.update": d.applications.forEach((a) => patchList(a.steps, op.id, strip(op.patch) as never)); break;
    case "task.update": patchList(d.tasks, op.id, strip(op.patch) as never); break;
    case "piece.update": patchList(d.pieces, op.id, op.patch as never); break;
    case "thread.update": patchList(d.threads, op.id, op.patch as never); break;
    case "document.update": patchList(d.documents, op.id, op.patch as never); break;
    case "message.create": d.threads.find((t) => t.id === op.threadId)?.messages.push({ id: op.id, threadId: op.threadId, ...op.data }); break;
    case "message.delete": d.threads.forEach((t) => { t.messages = t.messages.filter((m) => m.id !== op.id); }); break;
    default: break;
  }
}

let queue = Promise.resolve();
/** Envoie des opérations. L'affichage change tout de suite ; le serveur fait foi au retour. */
export function dispatch(ops: Op[], opts: { reload?: boolean; silent?: boolean } = {}) {
  ops.forEach(localApply);
  if (!opts.silent) store.onChange();
  queue = queue.then(async () => {
    const r = await fetch("/api/ops", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ops }) });
    if (!r.ok) { store.onError((await r.json().catch(() => ({}))).error ?? "Enregistrement impossible."); await reload(); return; }
    if (opts.reload || ops.some((o) => o.op.endsWith(".create") || o.op.endsWith(".delete"))) await reload();
  });
  return queue;
}

export async function reload() {
  const r = await fetch("/api/workspace", { cache: "no-store" });
  if (r.ok) { const j = await r.json(); if (j.data) { store.data = j.data; store.onChange(); } }
}
