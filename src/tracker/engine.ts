// Point d'entrée du moteur : rendu, délégation des événements, raccourcis clavier.
import type { WorkspaceData } from "@/lib/model";
import type { Op } from "@/lib/ops";
import * as st from "./state";
import { $, D, J, NOW, frac, iso, left, msLeft } from "./util";
import { VIEW_DEFS, alarmHtml, shellHtml, xOf } from "./views";
import * as dg from "./dialogs";
import { forgetThumb, hydrateThumbs, uploadFile } from "./files";
import { openAssistant, resetAssistant } from "./assistant";

const { store } = st;
const THEME_L = { auto: "Auto", light: "Clair", dark: "Sombre" };
const darkMQ = () => matchMedia("(prefers-color-scheme: dark)");

export function applyTheme() {
  const t = store.ui.theme;
  document.documentElement.dataset.theme = t === "dark" || (t === "auto" && darkMQ().matches) ? "dark" : "light";
  try { localStorage.setItem("parcours-theme", t); } catch { /* navigation privée */ }
}

function commit() {
  st.saveUi();
  render();
  const d = $<HTMLDialogElement>("#drawer");
  if (d.open && d.dataset.id) {
    if (!st.app(d.dataset.id)) { d.close(); return; }
    const t = d.scrollTop; dg.openDrawer(d.dataset.id, d.dataset.sp || undefined); d.scrollTop = t;
  }
}
function shiftCal(dir: number) {
  const a = store.ui.calAnchor ? D(store.ui.calAnchor) : NOW();
  const n = store.ui.calMode === "week" ? new Date(a.getFullYear(), a.getMonth(), a.getDate() + 7 * dir) : new Date(a.getFullYear(), a.getMonth() + dir, 1);
  store.ui.calAnchor = iso(n); commit();
}
const scrollToToday = () => { const s = $("#cvs"); if (s) s.scrollLeft = Math.max(0, xOf(NOW(), store.ui.zoom) - Math.min(112, Math.max(56, s.clientWidth * 0.08))); };

async function onUpload(input: HTMLInputElement) {
  const files = [...(input.files ?? [])];
  if (!files.length) return;
  const pieceId = input.dataset.uploadPiece ?? null;
  const folder = pieceId ? "pieces" : input.dataset.uploadDoc || "divers";
  const applicationId = input.dataset.app || null;
  const p = pieceId ? st.pieces().find((x) => x.id === pieceId) : null;
  dg.toast(files.length > 1 ? `Envoi de ${files.length} fichiers…` : `Envoi de ${files[0].name}…`);
  let ok = 0;
  for (const f of files) {
    try { await uploadFile(f, { folder, applicationId, pieceId, title: p?.label }); ok++; }
    catch (e) { dg.toast(`${f.name} : ${(e as Error).message}`); }
  }
  input.value = "";
  if (ok) { await st.reload(); dg.toast(ok > 1 ? `${ok} fichiers ajoutés.` : "Fichier ajouté."); }
}

// ---------- Rendu principal
let cvPos: [number, number] | null = null, firstCanvas = true, lastView = "";
const SCROLLERS = ".side .core,.th-s,.th-main .core,.doc-scroll,.wk,.mo,.col-b,.board,.cal-left";
export function render() {
  const old = $("#cvs"); if (old) cvPos = [old.scrollLeft, old.scrollTop];
  const kAct = (document.activeElement as HTMLElement | null)?.dataset?.k ?? null;
  const scrolls: [number, number][] = [];
  document.querySelectorAll(SCROLLERS).forEach((e, i) => (scrolls[i] = [e.scrollLeft, e.scrollTop]));
  const same = lastView === store.ui.view; lastView = store.ui.view;
  const { rail, top } = shellHtml();
  $("#rail").innerHTML = rail; $("#top").innerHTML = top;
  const al = alarmHtml(), alarm = $("#alarm"); alarm.innerHTML = al; alarm.hidden = !al;
  $("#stage").innerHTML = (VIEW_DEFS[store.ui.view] ?? VIEW_DEFS.canvas).render();
  if (same) {
    ($("#stage").firstElementChild as HTMLElement | null)?.style.setProperty("animation", "none");
    document.querySelectorAll(SCROLLERS).forEach((e, i) => { if (scrolls[i]) { e.scrollLeft = scrolls[i][0]; e.scrollTop = scrolls[i][1]; } });
  }
  if (store.ui.view === "canvas") {
    wireCanvas();
    const s = $("#cvs");
    if (s) { if (firstCanvas || !same || !cvPos) { scrollToToday(); firstCanvas = false; } else { s.scrollLeft = cvPos[0]; s.scrollTop = cvPos[1]; } }
  }
  if (kAct) document.querySelector<HTMLElement>(`[data-k="${CSS.escape(kAct)}"]`)?.focus({ preventScroll: true });
  setTitle(); lastSig = st.urgSig();
  hydrateThumbs();
}

let wantedTitle = "";
function setTitle() {
  const h = st.urgentList()[0], title = st.cfg().appTitle, n = st.nextDeadline();
  wantedTitle = h && msLeft(h.d) >= 0 ? `${left(h.d)} · ${h.app ? h.app.university : h.l} · ${title}` : n ? `${n.a.university} ${J(n.s.dueDate!)} · ${title}` : title;
  document.title = wantedTitle;
}

// Compte à rebours : le texte change toutes les 30 s ; un changement de niveau relance le rendu complet.
let lastSig = "";
function tick() {
  if (st.urgSig() !== lastSig) { render(); return; }
  document.querySelectorAll<HTMLElement>("[data-cd]").forEach((el) => { el.textContent = left(el.dataset.cd!, el.hasAttribute("data-long")); });
  document.querySelectorAll<HTMLElement>("[data-bar]").forEach((el) => { el.style.transform = `scaleX(${frac(el.dataset.bar!)})`; });
  setTitle();
}

let canvasAbort: AbortController | null = null;
function wireCanvas() {
  canvasAbort?.abort(); canvasAbort = new AbortController();
  const signal = canvasAbort.signal, s = $("#cvs"); if (!s) return;
  let on = false, sx = 0, sy = 0, sl = 0, stp = 0;
  s.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" || (e.target as Element).closest("button,a")) return; on = true; sx = e.clientX; sy = e.clientY; sl = s.scrollLeft; stp = s.scrollTop; s.classList.add("is-drag"); }, { signal });
  window.addEventListener("pointermove", (e) => { if (!on) return; s.scrollLeft = sl - (e.clientX - sx); s.scrollTop = stp - (e.clientY - sy); }, { signal });
  window.addEventListener("pointerup", () => { on = false; s.classList.remove("is-drag"); }, { signal });
  s.addEventListener("wheel", (e) => { if (!e.ctrlKey) return; e.preventDefault(); const z = Math.max(1, Math.min(1.45, +(store.ui.zoom - e.deltaY * 0.002).toFixed(2))); if (z !== store.ui.zoom) { store.ui.zoom = z; commit(); } }, { passive: false, signal });
  s.addEventListener("keydown", (e) => { if (e.target !== s) return; const m = ({ ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -60], ArrowDown: [0, 60] } as Record<string, number[]>)[e.key]; if (m) { e.preventDefault(); s.scrollBy(m[0], m[1]); } }, { signal });
}

// ---------- Clics
const SEL = "[data-go],[data-open],[data-act],[data-step],[data-task],[data-scope],[data-cal],[data-calmode],[data-day],[data-ev],[data-move],[data-folder],[data-doc],[data-piece-cycle],[data-thread],[data-thf],[data-sent],[data-unsent],[data-copy],[data-close],[data-rawmsg],[data-delmsg],[data-dayweek],[data-use],[data-howtask],[data-howpiece],[data-donetask],[data-stage],[data-pv],[data-show],[data-pal],[data-swap],[data-makep],[data-confirm],[data-editapp],[data-delapp],[data-newstep],[data-editstep],[data-delstep],[data-edittask],[data-deltask],[data-editpiece],[data-delpiece],[data-editthread],[data-delthread],[data-reply],[data-editdoc],[data-deldoc],[data-pjedit],[data-mailsend],[data-mailgo],[data-outlook],[data-dlpj]";

function del(title: string, text: string, ops: Op[], msg: string, after?: () => void) {
  dg.confirmDialog(title, text, "Supprimer", () => { st.dispatch(ops); dg.toast(msg); after?.(); });
}

function onClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement;
  const t = target.closest<HTMLElement>(SEL);
  if (!t) { if (target.tagName === "DIALOG") (target as HTMLDialogElement).close(); return; }
  const a = t.dataset;
  if (t.tagName === "A" && a.k === "pvopen" && t.getAttribute("aria-disabled")) { ev.preventDefault(); return; }
  if ("close" in a) { t.closest("dialog")?.close(); return; }
  if ("confirm" in a) { dg.runConfirm(); return; }
  if (a.rawmsg) { dg.rawMessage(a.rawmsg); return; }
  if (a.delmsg) { del("Supprimer cette réponse ?", "Elle disparaîtra de ton suivi. Le courriel reste dans ta boîte.", [{ op: "message.delete", id: a.delmsg }], "Réponse supprimée."); return; }
  if (a.dayweek) { store.ui.calAnchor = a.dayweek; store.ui.calMode = "week"; commit(); return; }
  if (a.howtask) { const k = store.data.tasks.find((x) => x.id === a.howtask); if (k) dg.howDialog(k.how, { task: k.id }); return; }
  if (a.howpiece) { const p = st.pieces().find((x) => x.id === a.howpiece); if (p) dg.howDialog(p.how, { title: p.label }); return; }
  if (a.donetask) { $<HTMLDialogElement>("#dlg").close(); dg.toggleTask(a.donetask); return; }
  if (a.use) {
    const v = a.val ?? "";
    if (a.use === "th") { dg.closeAll(); store.ui.thSel = v; store.ui.thFilter = "all"; store.ui.view = "mail"; commit(); }
    else if (a.use === "doc" || a.use === "kdoc") { $<HTMLDialogElement>("#dlg").close(); dg.openPreview(v); }
    else if (a.use === "folder") { dg.closeAll(); store.ui.view = "docs"; store.ui.docFolder = v; commit(); }
    else if (a.use === "piecesgo") { dg.closeAll(); store.ui.view = "docs"; store.ui.docFolder = "pieces"; commit(); }
    else if (a.use === "open") { $<HTMLDialogElement>("#dlg").close(); dg.openDrawer(v); }
    else if (a.use === "copy") dg.copy(st.app(v)?.formText ?? "");
    return;
  }
  if (a.go) { dg.closeAll(); store.ui.view = a.go; if (a.go === "docs" && "folderGo" in a) store.ui.docFolder = a.folderGo || null; commit(); return; }
  if (a.open) { $<HTMLDialogElement>("#dlg").close(); dg.openDrawer(a.open, a.sp); return; }
  if (a.step) { dg.toggleStep(a.step); return; }
  if (a.task) { dg.toggleTask(a.task); return; }
  if (a.scope) { store.ui.scope = a.scope as "main" | "all"; commit(); return; }
  if (a.cal) {
    if (a.cal === "today") { store.ui.calAnchor = null; commit(); }
    else if (a.cal === "-m" || a.cal === "+m") { const x = store.ui.calAnchor ? D(store.ui.calAnchor) : NOW(); store.ui.calAnchor = iso(new Date(x.getFullYear(), x.getMonth() + (a.cal === "+m" ? 1 : -1), 1)); commit(); }
    else shiftCal(a.cal === "+" ? 1 : -1);
    return;
  }
  if (a.calmode) { store.ui.calMode = a.calmode as "week" | "month"; commit(); return; }
  if (a.day) { store.ui.calAnchor = a.day; commit(); return; }
  if (a.ev) {
    const e = st.events().find((x) => x.id === a.ev); if (!e) return;
    if (e.app && e.step) dg.openDrawer(e.app.id, e.step.id);
    else if (e.thread) { store.ui.thSel = e.thread.id; store.ui.view = "mail"; commit(); }
    else if (e.task) dg.howDialog(e.task.how, { task: e.task.id });
    else if (e.milestone && st.cfg().milestones.find((m) => m.id === e.milestone)?.kind === "gate") dg.gateDialog();
    return;
  }
  if (a.move) { const [id, dir] = a.move.split(":"); const S = st.cfg().stages, i = S.findIndex((s) => s.id === st.app(id)?.stage) + Number(dir); if (S[i]) dg.setStage(id, S[i].id); return; }
  if (a.stage) { const [id, s] = a.stage.split(":"); dg.setStage(id, s); return; }
  if ("folder" in a) { store.ui.docFolder = a.folder || null; commit(); return; }
  if (a.doc) { dg.openPreview(a.doc); return; }
  if (a.pieceCycle) { dg.cyclePiece(a.pieceCycle); return; }
  if (a.thread) { dg.closeAll(); store.ui.thSel = a.thread; store.ui.view = "mail"; commit(); return; }
  if (a.thf) { store.ui.thFilter = a.thf; commit(); return; }
  if (a.sent) { dg.markSent(a.sent); return; }
  if (a.unsent) { st.dispatch([{ op: "thread.update", id: a.unsent, patch: { sentAt: null } }]); return; }
  if (a.copy) { dg.copy(st.thread(a.copy)?.body ?? ""); return; }
  if (a.reply) { dg.replyDialog(a.reply); return; }
  if (a.pjedit) { dg.pjDialog(a.pjedit); return; }
  if (a.mailsend) { dg.sendDialog(a.mailsend); return; }
  if (a.mailgo) { dg.sendNow(a.mailgo, t as HTMLButtonElement); return; }
  if (a.outlook) { dg.prepareOutlook(a.outlook); return; }
  if (a.dlpj) { dg.downloadPieces(a.dlpj); return; }
  if (a.pv) { dg.stepPreview(Number(a.pv)); return; }
  if (a.show) { store.ui.shown[a.show] = true; st.saveUi(); forgetThumb(a.show); dg.renderPreview(a.show); render(); return; }
  if (a.pal) { dg.palGo(+a.pal); return; }
  if (a.swap) { $<HTMLDialogElement>("#dlg").close(); dg.setStage(a.swap, st.stageByRole("unique")!.id, { force: true }); return; }
  if (a.makep) { $<HTMLDialogElement>("#dlg").close(); const u = st.stageByRole("unique"); if (u) dg.setStage(a.makep, u.id); return; }
  if (a.editapp) { dg.appDialog(a.editapp); return; }
  if (a.delapp) { const x = st.app(a.delapp); if (x) del("Supprimer cette candidature ?", `${st.appLabel(x)}, ses étapes et ses liens seront supprimés. Ses documents restent dans « Autres documents ».`, [{ op: "application.delete", id: x.id }], "Candidature supprimée.", () => $<HTMLDialogElement>("#drawer").close()); return; }
  if (a.newstep) { dg.stepDialog(a.newstep); return; }
  if (a.editstep) { const x = st.apps().find((p) => p.steps.some((s) => s.id === a.editstep)); if (x) dg.stepDialog(x.id, a.editstep); return; }
  if (a.delstep) { del("Supprimer cette étape ?", "Elle disparaîtra du canvas et du calendrier.", [{ op: "step.delete", id: a.delstep }], "Étape supprimée."); return; }
  if (a.edittask) { dg.taskDialog(a.edittask); return; }
  if (a.deltask) { del("Supprimer cette tâche ?", "Elle disparaîtra de ta liste.", [{ op: "task.delete", id: a.deltask }], "Tâche supprimée."); return; }
  if (a.editpiece) { dg.pieceDialog(a.editpiece); return; }
  if (a.delpiece) { del("Supprimer cette pièce ?", "Le fichier lié reste dans tes documents.", [{ op: "piece.delete", id: a.delpiece }], "Pièce supprimée."); return; }
  if (a.editthread) { dg.threadDialog(undefined, a.editthread); return; }
  if (a.delthread) { del("Supprimer cet échange ?", "Le courriel et les réponses notées seront supprimés de ton suivi.", [{ op: "thread.delete", id: a.delthread }], "Échange supprimé.", () => { store.ui.thSel = null; }); return; }
  if (a.editdoc) { dg.docDialog(a.editdoc); return; }
  if (a.deldoc) { del("Supprimer ce document ?", "Le fichier sera effacé du stockage. Cette action est définitive.", [{ op: "document.delete", id: a.deldoc }], "Document supprimé."); return; }
  if (a.act) switch (a.act) {
    case "palette": dg.openPalette(); break;
    case "assistant": openAssistant(); break;
    case "theme": { const order = ["auto", "light", "dark"] as const; store.ui.theme = order[(order.indexOf(store.ui.theme) + 1) % 3]; applyTheme(); dg.toast("Thème : " + THEME_L[store.ui.theme] + "."); commit(); break; }
    case "tipoff": store.ui.tip = false; commit(); break;
    case "zoomin": store.ui.zoom = Math.min(1.45, +(store.ui.zoom + 0.15).toFixed(2)); commit(); break;
    case "zoomout": store.ui.zoom = Math.max(1, +(store.ui.zoom - 0.15).toFixed(2)); commit(); break;
    case "totoday": scrollToToday(); break;
    case "gate": dg.gateDialog(); break;
    case "newthread": dg.threadDialog(a.app); break;
    case "newapp": dg.appDialog(); break;
    case "newtask": dg.taskDialog(); break;
    case "newpiece": dg.pieceDialog(); break;
    case "mailsync": dg.syncNow(t as HTMLButtonElement); break;
  }
}

// ---------- Saisie, envoi de formulaires, clavier, glisser-déposer
const timers = new Map<string, number>();
function debounce(key: string, fn: () => void, ms = 600) { clearTimeout(timers.get(key)); timers.set(key, window.setTimeout(fn, ms)); }

function onInput(ev: Event) {
  const t = ev.target as HTMLInputElement;
  if (t.dataset.note) { const id = t.dataset.note; debounce("note-" + id, () => st.dispatch([{ op: "application.update", id, patch: { notes: t.value } }], { silent: true })); }
  if (t.dataset.plink) { const id = t.dataset.plink, v = t.value.trim(); if (v === "" || /^https?:\/\//i.test(v)) debounce("pl-" + id, () => st.dispatch([{ op: "piece.update", id, patch: { link: v } }], { silent: true })); }
  if (t.id === "pal-in") dg.palette(t.value);
}
function onChange(ev: Event) {
  const t = ev.target as HTMLInputElement;
  if (t.type === "file" && ("uploadDoc" in t.dataset || "uploadPiece" in t.dataset)) onUpload(t);
}
function onSubmit(ev: SubmitEvent) {
  const f = ev.target as HTMLFormElement;
  if (!f.dataset.form) return;
  ev.preventDefault();
  const r = dg.formOps(f); if (!r) return;
  $<HTMLDialogElement>("#dlg").close();
  dg.toast(r.msg);
  // Les éléments créés n'existent dans l'état qu'après le retour du serveur.
  st.dispatch(r.ops).then(() => { if (r.after) { r.after(); commit(); } });
}
function onKey(ev: KeyboardEvent) {
  const target = ev.target as HTMLElement;
  const inField = /INPUT|TEXTAREA|SELECT/.test(target.tagName), anyDlg = document.querySelector("dialog[open]");
  if ($<HTMLDialogElement>("#pal").open) {
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") { ev.preventDefault(); dg.palMove(ev.key === "ArrowDown" ? 1 : -1); }
    if (ev.key === "Enter") { ev.preventDefault(); dg.palGo(); }
    return;
  }
  if ($<HTMLDialogElement>("#preview").open && (ev.key === "ArrowRight" || ev.key === "ArrowLeft")) { dg.stepPreview(ev.key === "ArrowRight" ? 1 : -1); return; }
  if (inField || anyDlg || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  if (ev.key === "/") { ev.preventDefault(); dg.openPalette(); return; }
  const views = st.cfg().views;
  if (/^[1-9]$/.test(ev.key) && views[+ev.key - 1]) { store.ui.view = views[+ev.key - 1]; commit(); return; }
  const card = target.closest?.<HTMLElement>("[data-card]");
  if (card && target === card) {
    const id = card.dataset.card!, S = st.cfg().stages, i = S.findIndex((s) => s.id === st.app(id)?.stage);
    if (ev.key === "ArrowRight" && S[i + 1]) { ev.preventDefault(); dg.setStage(id, S[i + 1].id); }
    if (ev.key === "ArrowLeft" && S[i - 1]) { ev.preventDefault(); dg.setStage(id, S[i - 1].id); }
    if (ev.key === "Enter") { ev.preventDefault(); dg.openDrawer(id); }
  }
}
function wireDrag(signal: AbortSignal) {
  const card = (e: Event) => (e.target as Element).closest?.<HTMLElement>("[data-card]");
  const col = (e: Event) => (e.target as Element).closest?.<HTMLElement>("[data-col]");
  document.addEventListener("dragstart", (ev) => { const c = card(ev); if (!c) return; ev.dataTransfer!.setData("text/plain", c.dataset.card!); ev.dataTransfer!.effectAllowed = "move"; requestAnimationFrame(() => c.classList.add("dragging")); }, { signal });
  document.addEventListener("dragend", (ev) => { card(ev)?.classList.remove("dragging"); document.querySelectorAll(".col.over").forEach((x) => x.classList.remove("over")); }, { signal });
  document.addEventListener("dragover", (ev) => { const c = col(ev); if (!c) return; ev.preventDefault(); document.querySelectorAll(".col.over").forEach((x) => x !== c && x.classList.remove("over")); c.classList.add("over"); }, { signal });
  document.addEventListener("drop", (ev) => { const c = col(ev); if (!c) return; ev.preventDefault(); c.classList.remove("over"); const id = ev.dataTransfer!.getData("text/plain"); if (id && st.app(id) && st.app(id)!.stage !== c.dataset.col) dg.setStage(id, c.dataset.col!); }, { signal });
}

/** Monte le moteur dans la page. Renvoie la fonction de démontage. */
export function mount(data: WorkspaceData) {
  const ac = new AbortController(), signal = ac.signal;
  st.initStore(data);
  store.onChange = commit;
  store.onError = (m) => dg.toast(m);
  applyTheme();
  darkMQ().addEventListener("change", applyTheme, { signal });
  document.addEventListener("click", onClick, { signal });
  document.addEventListener("input", onInput, { signal });
  document.addEventListener("change", onChange, { signal });
  document.addEventListener("submit", onSubmit, { signal });
  document.addEventListener("keydown", onKey, { signal });
  wireDrag(signal);
  render();
  const timer = setInterval(tick, 30_000);
  // Outlook relié : les réponses arrivent sur le serveur ; on relit l'espace toutes les 90 s quand la page est visible et calme.
  const inbound = () => store.data.threads.reduce((n, t) => n + t.messages.filter((m) => m.direction === "in").length, 0);
  let seenIn = inbound();
  const refresh = async () => {
    if (!store.data.mail?.connected || document.hidden || document.querySelector("dialog[open]") || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName ?? "")) return;
    await st.reload();
    const n = inbound();
    if (n > seenIn) dg.toast(n - seenIn > 1 ? `${n - seenIn} nouvelles réponses dans Échanges.` : "Nouvelle réponse dans Échanges.");
    seenIn = n;
  };
  const poll = setInterval(refresh, 90_000);
  // Next pose le titre de la page après le montage : on remet celui du moteur dès qu'il change.
  const titleWatch = new MutationObserver(() => { if (wantedTitle && document.title !== wantedTitle) document.title = wantedTitle; });
  titleWatch.observe(document.head, { subtree: true, childList: true, characterData: true });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { tick(); refresh(); } }, { signal });
  return () => { ac.abort(); clearInterval(timer); clearInterval(poll); titleWatch.disconnect(); canvasAbort?.abort(); resetAssistant(); };
}
