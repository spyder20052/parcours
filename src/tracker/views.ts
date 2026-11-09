// Les cinq vues. Chaque vue est une fonction qui renvoie du HTML à partir de l'état.
// Pour ajouter une vue : écrire une fonction ici, l'enregistrer dans VIEWS et dans le schéma de configuration.
import type { Application, Doc, Task, Thread } from "@/lib/model";
import * as st from "./state";
import { D, DAY, NOW, TOUR, dueChip, esc, fD, fL, frac, hotJ, ic, iso, left, msLeft, until, urg } from "./util";
import { thumbHtml } from "./files";
import { fmtReply as fmtReplyHtml, isAuto as isAutoMsg } from "./util";

const { store } = st;
export const VIEW_DEFS: Record<string, { label: string; icon: string; render: () => string }> = {
  canvas: { label: "Canvas", icon: "canvas", render: () => canvasView() },
  cal: { label: "Calendrier", icon: "cal", render: () => calView() },
  board: { label: "Tableau", icon: "board", render: () => boardView() },
  docs: { label: "Documents", icon: "folder", render: () => docsView() },
  mail: { label: "Échanges", icon: "mail", render: () => mailView() },
};
const THEME_L = { auto: "Auto (suit ton ordinateur)", light: "Clair", dark: "Sombre" };

// ---------- Coque
/** Bandeau d'alerte : seulement pour une échéance en retard ou à moins de 48 h. */
export function alarmHtml() {
  const L = st.urgentList(); if (!L.length) return "";
  const h = L[0], late = msLeft(h.d) < 0, dep = h.kind === "depots", n = until(h.d);
  const rest = L.slice(1).filter((e) => !(e.task && h.app && e.task.applicationId === h.app.id));
  const kicker = late ? "Date dépassée" : dep ? (n === 0 ? "Ferme ce soir à 23h59" : "Ferme demain à 23h59") : n === 0 ? "À faire aujourd'hui" : "À faire demain";
  const lead = late ? "Aussi" : n === 0 ? "Aussi avant ce soir" : "Aussi avant demain soir";
  const chip = (e: st.Ev) => `<button class="${msLeft(e.d) < 0 ? "late" : ""}" data-ev="${e.id}" data-k="al-${e.id}"><b>${esc(e.l)}</b>${e.app ? " · " + esc(e.app.university) : ""}${msLeft(e.d) < 0 ? " · en retard" : e.d === h.d ? "" : ` · <span data-cd="${e.d}">${left(e.d)}</span>`}</button>`;
  return `<div><p class="al-k"><span class="al-dot" aria-hidden="true"></span>${kicker}</p><p class="al-t">${esc(h.app ? st.appLabel(h.app) : h.l)}</p><p class="al-s">${esc(h.app ? h.l : h.sub)}</p></div>
  <p class="al-cd"><span data-cd="${h.d}" data-long>${left(h.d, true)}</span><small>${late ? "Vérifie si un dépôt tardif est possible" : "avant 23h59"}</small></p>
  <button class="al-go" data-ev="${h.id}" data-k="al-go">${h.app ? "Ouvrir l'étape" : "Voir comment faire"}${ic("right")}</button>
  ${rest.length ? `<div class="al-more"><span class="al-lead">${lead}</span>${rest.slice(0, 4).map(chip).join("")}${rest.length > 4 ? `<button data-go="cal" data-k="al-plus">${rest.length - 4} de plus</button>` : ""}</div>` : ""}
  ${late ? "" : `<span class="al-bar" aria-hidden="true"><i data-bar="${h.d}" style="transform:scaleX(${frac(h.d)})"></i></span>`}`;
}

export function shellHtml() {
  const u = store.ui, me = store.data.me, views = st.cfg().views;
  const pend = st.threads().filter((t) => st.thState(t) === "relance").length;
  const got = st.piecesGot(), nx = st.nextDeadline();
  const todo = st.listTasks().filter((t) => !t.doneAt && t.dueDate && until(t.dueDate) <= 3).length;
  const first = (me.name || me.email).split(/[\s@]/)[0];
  const rail = `<span class="logo" aria-hidden="true">${TOUR}</span>` + views.map((v, n) => {
    const d = VIEW_DEFS[v];
    return `<button class="rail-btn" data-go="${v}" ${u.view === v ? 'aria-current="page"' : ""} aria-label="${d.label}" title="${d.label} (touche ${n + 1})">${ic(d.icon)}${v === "mail" && pend ? `<span class="badge">${pend}</span>` : ""}</button>`;
  }).join("") + `<span class="rail-sep rail-push"></span>
    <button class="rail-btn" data-act="assistant" aria-label="Assistant : personnaliser mon parcours" title="Assistant">${ic("spark")}</button>
    <button class="rail-btn" data-act="theme" aria-label="Thème : ${THEME_L[u.theme]}. Cliquer pour changer" title="Thème : ${THEME_L[u.theme]}">${ic({ auto: "auto", light: "sun", dark: "moon" }[u.theme])}</button>
    <a class="rail-btn" href="/reglages" aria-label="Réglages et compte" title="Réglages">${ic("gear")}</a>`;
  const top = `<div class="brand"><h1>${esc(st.cfg().appTitle)}</h1><p>${todo ? `Bonjour ${esc(first)}, ${todo} action${todo > 1 ? "s" : ""} t'attend${todo > 1 ? "ent" : ""} dans les trois prochains jours.` : `Bonjour ${esc(first)}, rien d'urgent dans les trois prochains jours.`}</p></div>
  <div class="pills" role="group" aria-label="Vues">${views.map((v) => `<button class="pill" data-go="${v}" aria-pressed="${u.view === v}">${VIEW_DEFS[v].label}</button>`).join("")}</div>
  <div class="stats">${nx ? `<button class="stat ${urg(nx.s.dueDate!) ? "u-" + urg(nx.s.dueDate!) : ""}" data-open="${nx.a.id}"><small>Prochain dépôt</small><b>${esc(nx.a.university)} ${hotJ(nx.s.dueDate!)}</b></button>` : `<div class="stat"><small>Prochain dépôt</small><b>Aucun</b></div>`}
  <button class="stat" data-go="docs" data-folder-go="pieces"><small>Pièces réunies</small><b>${got} sur ${st.pieces().length}</b></button>
  <button class="search-btn" data-act="palette" aria-label="Chercher un document ou une université">${ic("search")}<span class="lbl">Chercher</span><kbd>/</kbd></button></div>`;
  return { rail, top };
}

// ---------- Canvas : chaque candidature est un fil posé sur le temps
const NW = 182, NH = 66, LH = 86;
type Seg = [number, number, number];
let SEG: Seg[] = [];
function buildScale() {
  const dates = st.events().map((e) => D(e.d).getTime());
  const start = NOW().getTime() - 3 * DAY;
  const end = Math.max(start + 75 * DAY, (dates.length ? Math.max(...dates) : start) + 18 * DAY);
  const d1 = start + 45 * DAY, d2 = Math.min(end, d1 + 25 * DAY);
  SEG = [[start, d1, 40], [d1, d2, 22], [d2, end, 6.2]];
}
export const xOf = (date: Date, z: number) => {
  let x = 0; const t = date.getTime();
  for (const [a, b, r] of SEG) { const c = Math.min(t, b); if (c > a) x += (c - a) / DAY * r * (r === 40 ? z : 1); if (t <= b) break; }
  return x;
};
const lanes = () => st.sortedApps().filter((a) => store.ui.scope === "all" || (a.tier !== st.lastTier() || st.cfg().tiers.length === 1));

export function canvasView() {
  buildScale();
  const z = store.ui.zoom, L = lanes(), c = st.cfg();
  const end = SEG[SEG.length - 1][1];
  const W = xOf(new Date(end), z) + 110;
  const tracks = c.tracks, showPieces = st.pieces().length > 0 && !!c.piecesTarget;
  const sys = tracks.length + (showPieces ? 1 : 0), H = (L.length + sys) * LH + 90;
  const y = (i: number) => (i + sys) * LH + LH / 2, sy = (i: number) => i * LH + LH / 2;
  const gate = c.milestones.find((m) => m.kind === "gate"), result = c.milestones.find((m) => m.kind === "result");
  const gx = gate ? xOf(D(gate.date), z) : 0, gy = L.length ? (y(0) + y(L.length - 1)) / 2 : 200;
  const rx = result ? xOf(D(result.date), z) : 0, today = NOW(), tx = xOf(today, z);
  let svg = "", nodes = "", tags = "", axis = "";

  for (let t = new Date(SEG[0][0]); t.getTime() < SEG[0][1]; t = new Date(t.getTime() + DAY)) {
    if (t.getDay() !== 1) continue;
    const x = xOf(t, z);
    svg += `<line class="grid-l" x1="${x}" x2="${x}" y1="0" y2="${H}"/>`;
    if (Math.abs(x - tx) > 46) axis += `<span class="cv-tick" style="left:${x}px">${t.getDate()}</span>`;
  }
  // Noms de mois : un libellé trop proche du suivant (début de l'axe) est retiré.
  const s0 = new Date(SEG[0][0]), months: { x: number; m: Date }[] = [];
  for (let m = new Date(s0.getFullYear(), s0.getMonth(), 1); m.getTime() < end; m = new Date(m.getFullYear(), m.getMonth() + 1, 1)) months.push({ x: Math.max(0, xOf(m, z)), m });
  months.filter((o, i) => !months[i + 1] || months[i + 1].x - o.x > 130).forEach((o, i) => {
    const dense = o.m.getTime() < SEG[1][1];
    const label = i === 0 || o.m.getMonth() === 0 ? o.m.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }) : o.m.toLocaleDateString("fr-FR", { month: dense ? "long" : "short" });
    axis += `<span class="cv-month cap" style="transform:translateX(${o.x}px)">${esc(label)}</span>`;
  });
  c.milestones.forEach((m) => { axis += `<span class="cv-tick" style="left:${xOf(D(m.date), z)}px">${D(m.date).getDate()}</span>`; });
  axis += `<span class="today-tag" style="left:${tx}px">Aujourd'hui</span>`;

  tracks.forEach((tr, i) => {
    const items = st.trackTasks(tr.id).filter((t) => t.dueDate), py = sy(i);
    if (!items.length) return;
    svg += `<path class="th eef" d="M0 ${py} H${xOf(D(items[items.length - 1].dueDate!), z)}"/>`;
    items.forEach((t) => {
      const x = xOf(D(t.dueDate!), z), on = !!t.doneAt, late = until(t.dueDate!) < 0 && !on;
      nodes += `<button class="node k-eef ${on ? "done" : ""} ${late ? "late" : ""} ${!on && urg(t.dueDate!) ? "u-" + urg(t.dueDate!) : ""}" style="left:${x - NW / 2}px;top:${py - NH / 2}px" data-howtask="${t.id}" data-k="n-t-${t.id}" aria-label="${esc(tr.label)}, ${esc(t.label)}, ${fD(t.dueDate!)}"><b>${esc(t.label)}</b><small>${fD(t.dueDate!)} · ${hotJ(t.dueDate!)}</small></button>${ckBtn(x, py, on, t.label, `data-task="${t.id}"`, "k-t-" + t.id)}`;
    });
  });
  if (showPieces) {
    const got = st.piecesGot(), qy = sy(tracks.length), qx = xOf(D(c.piecesTarget!), z);
    svg += `<path class="th" d="M0 ${qy} H${qx}"/>`;
    nodes += `<button class="node k-piece" style="left:${qx - NW / 2}px;top:${qy - NH / 2}px" data-go="docs" data-folder-go="pieces" data-k="n-pieces" aria-label="Pièces reçues : ${got} sur ${st.pieces().length}"><b>Pièces reçues</b><small>${got} sur ${st.pieces().length} · ${hotJ(c.piecesTarget!)}</small></button>`;
  }

  const uniq = st.uniqueApp(), dropped = st.stageByRole("dropped")?.id;
  L.forEach((a, i) => {
    const yy = y(i), ab = a.stage === dropped, isP = uniq?.id === a.id;
    const fallback = new Date(NOW().getTime() + 21 * DAY);
    const pts = a.steps.map((s) => ({ s, x: xOf(s.dueDate ? D(s.dueDate) : fallback, z) }));
    // Deux étapes trop proches (un jour = 40 px, un nœud = 182 px) : la suivante glisse à droite, sa date reste écrite dessus.
    for (let j = 1; j < pts.length; j++) if (pts[j].x < pts[j - 1].x + NW + 16) pts[j].x = pts[j - 1].x + NW + 16;
    let px = 0;
    pts.forEach((p, j) => {
      const on = !!p.s.doneAt;
      svg += `<path class="th ${on ? "done" : ""}" style="${ab ? "opacity:.25" : ""}" d="M${px} ${yy} L${p.x} ${yy}"/>`;
      const prev = pts[j - 1];
      if (prev && z >= 0.9 && p.s.dueDate && prev.s.dueDate && p.x - prev.x > 230) tags += `<span class="gap-tag" style="left:${(p.x + prev.x) / 2}px;top:${yy + 58}px">${Math.round((D(p.s.dueDate).getTime() - D(prev.s.dueDate).getTime()) / DAY)} j</span>`;
      px = p.x;
      const late = p.s.dueDate && until(p.s.dueDate) < 0 && !on;
      nodes += `<button class="node k-${st.kindLane(p.s.kind) === "courriels" ? "contact" : st.kindLane(p.s.kind) === "reponses" ? "rep" : "depot"} ${a.tier === st.firstTier() ? "t-prio" : ""} ${on ? "done" : ""} ${late ? "late" : ""} ${!p.s.dueDate ? "unknown" : ""} ${!on && p.s.dueDate && urg(p.s.dueDate) ? "u-" + urg(p.s.dueDate) : ""}" style="left:${p.x - NW / 2}px;top:${yy - NH / 2}px;${ab ? "opacity:.4" : ""}" data-open="${a.id}" data-sp="${p.s.id}" data-k="n-${p.s.id}" aria-label="${esc(st.appLabel(a))} : ${esc(p.s.label)}${p.s.dueDate ? ", " + fD(p.s.dueDate) : ", date inconnue"}"><b>${esc(p.s.label)}</b><small>${p.s.dueDate ? `${p.s.isTarget ? "Objectif " : ""}${fD(p.s.dueDate)} · ${hotJ(p.s.dueDate)}` : "À obtenir"}</small></button>${ckBtn(p.x, yy, on, `${p.s.label}, ${st.appLabel(a)}`, `data-step="${p.s.id}"`, "k-" + p.s.id)}`;
    });
    if (gate && !ab) { const mx = (px + gx) / 2; svg += `<path class="th gate ${isP ? "is-p" : ""}" style="${uniq && !isP ? "opacity:.35" : ""}" d="M${px + NW / 2 - 6} ${yy} C${mx} ${yy} ${mx} ${gy} ${gx - 88} ${gy}"/>`; }
  });
  if (gate && result) svg += `<path class="th ${uniq ? "is-p" : "gate"}" d="M${gx + 88} ${gy} L${rx - 75} ${gy}"/>`;
  svg += `<line class="today-l" x1="${tx}" x2="${tx}" y1="0" y2="${H}"/><circle cx="${tx}" cy="0" r="4.5"/>`;
  if (gate) nodes += `<button class="gate" style="left:${gx - 88}px;top:${gy - 62}px" data-act="gate" data-k="gate" aria-label="${esc(c.gate?.label ?? gate.label)}, ${fL(gate.date)}"><small>${esc(fL(gate.date))}</small><b>${esc(c.gate?.label ?? gate.label)}</b><i>${uniq ? esc(st.appLabel(uniq)) : "À choisir"}</i></button>`;
  if (result) nodes += `<div class="result" style="left:${rx - 75}px;top:${gy - 46}px"><b>${esc(result.label)}</b><small>${esc(result.sub || fL(result.date))}</small></div>`;

  const labels = `<div class="cv-corner">Mes fils</div>` +
    tracks.map((tr) => `<div class="lane-l" style="height:${LH}px"><div><b>${esc(tr.label)}</b><small>${esc(tr.sub)}</small></div></div>`).join("") +
    (showPieces ? `<button class="lane-l" style="height:${LH}px" data-go="docs" data-folder-go="pieces"><span class="ring" style="--p:${Math.round(st.piecesGot() / st.pieces().length * 100)}"><span>${st.piecesGot()}</span></span><span><b>Pièces</b><small>Objectif ${esc(fD(c.piecesTarget!))}</small></span></button>` : "") +
    L.map((a) => `<button class="lane-l" style="height:${LH}px" data-open="${a.id}" data-k="l-${a.id}"><span class="ring" style="--p:${st.progress(a)}"><span>${st.progress(a)}</span></span><span><b>${esc(a.university)}</b><small>${esc(a.program)} · ${esc(st.tierLabel(a.tier))}</small></span></button>`).join("");

  const empty = !L.length ? `<div class="tip" style="position:absolute;left:200px;top:90px;bottom:auto">Aucune candidature pour l'instant. Ajoute-en une ou demande à l'assistant de t'aider.<br><button data-act="newapp">Ajouter une candidature</button></div>` : "";
  const tip = store.ui.tip && c.canvasTip ? `<div class="tip">${esc(c.canvasTip)}<br><button data-act="tipoff">Compris</button></div>` : "";
  const multi = st.cfg().tiers.length > 1;
  return `<div class="view" id="v-canvas"><div class="bezel cv-wrap"><div class="core">
    <div class="cv-scroll" id="cvs" tabindex="0" aria-label="Canvas du calendrier, défilement avec les flèches"><div class="cv-inner">
      <div class="cv-labels">${labels}</div>
      <div class="cv-time" style="width:${W}px;height:${H + 58}px"><div class="cv-axis">${axis}</div><svg class="cv-svg" width="${W}" height="${H}" aria-hidden="true">${svg}</svg><div style="position:absolute;left:0;top:58px;width:${W}px;height:${H}px">${tags}${nodes}</div></div>
    </div></div>
    ${empty}${tip}
    <div class="toolbar" role="toolbar" aria-label="Canvas">
      ${multi ? `<button class="tb" data-scope="main" aria-pressed="${store.ui.scope !== "all"}">Sans ${esc(st.cfg().tiers[st.cfg().tiers.length - 1].label.toLowerCase())}</button><button class="tb" data-scope="all" aria-pressed="${store.ui.scope === "all"}">Tout</button><span class="tb-sep"></span>` : ""}
      <button class="tb" data-act="newapp">${ic("plus")}<span class="hide-m">Candidature</span><span class="sr">Ajouter une candidature</span></button><span class="tb-sep"></span>
      <button class="tb" data-act="zoomout" aria-label="Dézoomer">${ic("minus")}</button><button class="tb" data-act="zoomin" aria-label="Zoomer">${ic("plus")}</button><span class="tb-sep"></span>
      <button class="tb" data-act="totoday">${ic("target")}<span class="hide-m">Aujourd'hui</span><span class="sr">Revenir à aujourd'hui</span></button>
    </div></div></div>${sidePanel()}</div>`;
}
const ckBtn = (x: number, yy: number, on: boolean, label: string, attr: string, k: string) =>
  `<button class="ck" style="left:${x + NW / 2 - 31}px;top:${yy - 12}px" role="checkbox" aria-checked="${on}" aria-label="Marquer comme fait : ${esc(label)}" ${attr} data-k="${k}">${ic("check")}</button>`;

function sidePanel() {
  const tasks = st.listTasks().slice().sort((a, b) => (Number(!!a.doneAt) - Number(!!b.doneAt)) || ((a.dueDate ?? "9") < (b.dueDate ?? "9") ? -1 : 1));
  const done = tasks.filter((t) => t.doneAt).length, total = tasks.length || 1;
  const sends = st.threads().filter((t) => st.thState(t) === "envoyer");
  const P = st.pieces();
  return `<aside class="bezel side" aria-label="Priorités"><div class="core">
  <section class="acc"><h3>À faire maintenant <span>${done} sur ${tasks.length}</span></h3><div class="bar"><i style="transform:scaleX(${done / total})"></i></div>
   ${tasks.map(taskRow).join("") || `<p class="meta">Aucune tâche. <button class="more" data-act="newtask">Ajouter une tâche</button></p>`}
   ${tasks.length ? `<button class="more" data-act="newtask">Ajouter une tâche</button>` : ""}</section>
  <section class="acc"><h3>Courriels à envoyer <span>${sends.length}</span></h3>${sends.slice(0, 4).map((t) => `<button class="row-btn" data-thread="${t.id}"><span>${ic("mail")}</span><span><b>${esc(t.title)}</b></span></button>`).join("") || `<p class="meta">Tous partis. Surveille les relances dans Échanges.</p>`}<button class="more" data-go="mail">Voir tous mes échanges</button></section>
  <section class="acc"><h3>Pièces à réunir <span>${st.piecesGot()} sur ${P.length}</span></h3>${P.filter((p) => p.status !== "recue").slice(0, 5).map((p) => `<button class="row-btn" data-go="docs" data-folder-go="pieces"><span><b>${esc(p.label)}</b><small>${esc(p.who)}</small></span><span class="st st-${p.status}">${st.PIECE_L[p.status]}</span></button>`).join("")}<button class="more" data-go="docs" data-folder-go="pieces">Voir toutes mes pièces</button></section>
  </div></aside>`;
}
const taskRow = (t: Task) => {
  const on = !!t.doneAt;
  return `<div class="chk ${on ? "is-done" : ""}"><button class="ck" role="checkbox" aria-checked="${on}" aria-label="${esc(t.label)}" data-task="${t.id}" data-k="t-${t.id}">${ic("check")}</button><button class="task-open" data-howtask="${t.id}" data-k="to-${t.id}"><b>${esc(t.how?.t ?? t.label)}</b><small>${t.how ? "Voir comment faire" : "Modifier"}</small></button>${on || !t.dueDate ? "" : dueChip(t.dueDate)}</div>`;
};

// ---------- Calendrier
export function calView() {
  const u = store.ui, anchor = u.calAnchor ? D(u.calAnchor) : NOW();
  const E = st.events(), byDay: Record<string, st.Ev[]> = {}; E.forEach((e) => (byDay[e.d] = byDay[e.d] || []).push(e));
  const mStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1), gridStart = new Date(mStart.getTime() - ((mStart.getDay() + 6) % 7) * DAY);
  const cells = [...Array(42)].map((_, i) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  const week = [...Array(7)].map((_, i) => new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i));
  const nowI = iso(NOW());
  const evBtn = (e: st.Ev) => {
    const hot = !e.done && until(e.d) >= 0 && until(e.d) <= 2 && ["depots", "task"].includes(e.kind);
    const alt = ["reponses", "nat", "relance"].includes(e.kind);
    return `<button class="ev ${alt ? "alt" : ""} ${e.kind === "track" ? "eef" : ""} ${hot ? "hot" : ""} ${!e.done && st.URG_KINDS.includes(e.kind) && urg(e.d) === "crit" ? "u-crit" : ""} ${e.done ? "done" : ""}" data-ev="${e.id}" data-k="ev-${e.id}"><b>${esc(e.l)}</b>${esc(e.sub)}</button>`;
  };
  const rows: [string, (e: st.Ev) => boolean][] = [["Courriels", (e) => ["courriels", "relance"].includes(e.kind)], ["Dépôts", (e) => e.kind === "depots"], ["Réponses", (e) => ["reponses", "nat"].includes(e.kind)], ["Ma liste", (e) => ["task", "track"].includes(e.kind)]];
  const wk = `<div class="wk"><div class="wk-h"></div>${week.map((d) => `<div class="wk-h ${iso(d) === nowI ? "now" : ""}"><b>${String(d.getDate()).padStart(2, "0")}</b><small>${d.toLocaleDateString("fr-FR", { weekday: "short" })}</small></div>`).join("")}${rows.map(([l, f]) => `<div class="wk-r">${l}</div>` + week.map((d) => `<div class="wk-c ${iso(d) === nowI ? "now" : ""}">${(byDay[iso(d)] || []).filter(f).map(evBtn).join("")}</div>`).join("")).join("")}</div>`;
  const mo = `<div class="mo">${["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => `<div class="mo-h">${d}</div>`).join("")}${cells.map((d) => { const i = iso(d), ev = byDay[i] || []; return `<div class="mo-c ${d.getMonth() !== anchor.getMonth() ? "off" : ""} ${i === nowI ? "now" : ""}"><span class="mo-n">${d.getDate()}</span>${ev.slice(0, 2).map(evBtn).join("")}${ev.length > 2 ? `<button class="mo-more" data-dayweek="${i}" aria-label="Voir les ${ev.length} événements du ${fL(i)}">+${ev.length - 2} autre${ev.length - 2 > 1 ? "s" : ""}</button>` : ""}</div>`; }).join("")}</div>`;
  const upcoming = E.filter((e) => until(e.d) >= -1 && !e.done);
  const groups: Record<string, st.Ev[]> = {}; upcoming.slice(0, 40).forEach((e) => (groups[e.d] = groups[e.d] || []).push(e));
  const ag = `<div class="agenda">${Object.keys(groups).map((d) => `<div class="ag-d">${fL(d)}</div>${groups[d].map(evBtn).join("")}`).join("") || `<p class="meta">Rien de prévu.</p>`}</div>`;
  const title = u.calMode === "week" ? `${week[0].getDate()} ${week[0].toLocaleDateString("fr-FR", { month: "short" })} au ${week[6].getDate()} ${week[6].toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}` : anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const next = upcoming.filter((e) => e.kind === "depots" && e.app).slice(0, 4);
  return `<div class="view"><div class="cal-left">
    <div class="mini"><div class="mini-h"><h3>${anchor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</h3><span style="display:flex;gap:5px"><button class="round" data-cal="-m" aria-label="Mois précédent">${ic("left")}</button><button class="round" data-cal="+m" aria-label="Mois suivant">${ic("right")}</button></span></div>
      <div class="mini-g">${["L", "M", "M", "J", "V", "S", "D"].map((d) => `<span>${d}</span>`).join("")}${cells.map((d) => { const i = iso(d); return `<button class="md ${d.getMonth() !== anchor.getMonth() ? "off" : ""} ${i === nowI ? "today" : ""} ${i === iso(anchor) && i !== nowI ? "sel" : ""} ${byDay[i] ? "has" : ""}" data-day="${i}" aria-label="${fL(i)}${byDay[i] ? `, ${byDay[i].length} événement${byDay[i].length > 1 ? "s" : ""}` : ""}">${d.getDate()}</button>`; }).join("")}</div></div>
    <div class="card"><h3>Prochains dépôts</h3>${next.map((e) => `<button class="row-btn" data-open="${e.app!.id}"><span><b>${esc(e.sub)}</b><small>${fD(e.d)}</small></span>${dueChip(e.d)}</button>`).join("") || `<p class="meta">Aucun dépôt à venir.</p>`}</div>
    <div class="card"><h3>Légende</h3><p class="meta" style="display:flex;gap:6px;flex-wrap:wrap"><span class="tag" style="background:var(--lime)">À toi d'agir</span><span class="tag" style="background:var(--peri);color:var(--ink)">Réponse attendue</span>${st.cfg().tracks.length ? `<span class="tag" style="background:var(--sage)">${esc(st.cfg().tracks[0].label)}</span>` : ""}</p></div>
  </div><div class="bezel cal-main"><div class="core"><div class="cal-head"><h2 class="cap">${title}</h2><button class="txt-btn" data-cal="today">Aujourd'hui</button><button class="round" data-cal="-" aria-label="Période précédente">${ic("left")}</button><button class="round" data-cal="+" aria-label="Période suivante">${ic("right")}</button><div class="seg" role="group" aria-label="Affichage"><button data-calmode="week" aria-pressed="${u.calMode === "week"}">Semaine</button><button data-calmode="month" aria-pressed="${u.calMode === "month"}">Mois</button></div></div>${u.calMode === "week" ? wk : mo}${ag}</div></div></div>`;
}

// ---------- Tableau
export function boardView() {
  const list = st.sortedApps(), stages = st.cfg().stages;
  return `<div class="view"><div class="board" id="board">${stages.map((s) => {
    const items = list.filter((a) => a.stage === s.id);
    return `<section class="col" data-col="${s.id}" style="--cbg:${s.bg};--cfg:${s.fg}" aria-label="${esc(s.label)}"><div class="col-h"><i>${items.length}</i><h2>${esc(s.label)}</h2></div><div class="col-b">${items.map(card).join("") || `<div class="empty">${esc(s.empty ?? "Glisse une carte ici")}</div>`}</div></section>`;
  }).join("")}</div></div>`;
}
function card(a: Application) {
  const stages = st.cfg().stages, i = stages.findIndex((s) => s.id === a.stage);
  const dep = a.steps.find(st.isDepot), th = st.threads().filter((t) => t.applicationId === a.id);
  return `<article class="tk" draggable="true" data-card="${a.id}" tabindex="0" data-k="c-${a.id}" aria-label="${esc(st.appLabel(a))}, ${esc(stages[i]?.label ?? "")}. Flèches gauche et droite pour déplacer.">${store.ui.stamps[a.id] && st.stageRole(a) === "submitted" ? `<span class="stamp">Déposée</span>` : ""}
    <h3><button data-open="${a.id}">${esc(st.appLabel(a))}</button></h3><p>${esc(a.channel)}</p>
    <div class="tk-f"><span class="tag tag-${a.tier === st.firstTier() ? "prio" : a.tier === st.lastTier() ? "res" : "opt"}">${esc(st.tierLabel(a.tier))}</span>${st.stageRole(a) === "dropped" ? "" : dep && dep.dueDate && !dep.doneAt ? dueChip(dep.dueDate, fD(dep.dueDate)) : dep && !dep.dueDate ? `<span class="due">Date inconnue</span>` : ""}${th.length ? `<span class="count">${ic("mail")}${th.length}</span>` : ""}
    <span class="tk-mv"><button data-move="${a.id}:-1" aria-label="Déplacer vers ${esc(stages[i - 1]?.label ?? "")}" ${i <= 0 ? "disabled" : ""}>${ic("left")}</button><button data-move="${a.id}:1" aria-label="Déplacer vers ${esc(stages[i + 1]?.label ?? "")}" ${i >= stages.length - 1 ? "disabled" : ""}>${ic("right")}</button></span></div></article>`;
}

// ---------- Documents
/** Documents d'une candidature : les siens, puis ceux que ses étapes demandent de joindre (un CV commun, par exemple). */
export const appDocs = (a: Application) => {
  const own = st.docs().filter((d) => d.applicationId === a.id);
  const refs = new Set(a.steps.flatMap((s) => s.how?.use.filter(([ty]) => ty === "doc").map(([, , v]) => v) ?? []));
  return [...own, ...st.docs().filter((d) => refs.has(d.id) && d.applicationId !== a.id)];
};
function folderArt(list: Doc[]) { return `<span class="pp" aria-hidden="true">${list.slice(0, 3).map((d) => thumbHtml(d, "art")).join("") || "<span></span><span></span>"}</span>`; }
const uploadBtn = (folder: string, appId = "") => `<label class="btn" style="cursor:pointer">${ic("upload")}Ajouter un document<input type="file" class="sr" data-upload-doc="${esc(folder)}" data-app="${esc(appId)}" accept="application/pdf,image/png,image/jpeg,image/webp" multiple></label>`;

/** Documents rangés nulle part : ni candidature, ni dossier connu, ni pièce. */
const orphans = () => {
  const known = new Set(st.cfg().folders.map((f) => f.id)), linked = new Set(st.pieces().map((p) => p.documentId));
  return st.docs().filter((d) => !d.applicationId && !known.has(d.folder) && !linked.has(d.id));
};
export function docsView() {
  const f = store.ui.docFolder, c = st.cfg(), P = st.pieces(), got = st.piecesGot();
  let head = "", body = "";
  if (!f) {
    head = `<div class="doc-top"><div class="crumb">${ic("folder")}<b>Mon dossier</b></div></div><h2 class="doc-h">Mon dossier</h2>`;
    body = `<div class="folders">
      <button class="fd fd-pieces" data-folder="pieces" data-k="f-pieces"><span class="pp" aria-hidden="true"><span></span><span></span></span><span class="front"><h3>Pièces à réunir</h3><small>${got} sur ${P.length} reçues</small></span></button>
      ${c.folders.map((x) => { const L = st.docs().filter((d) => d.folder === x.id && !d.applicationId); return `<button class="fd ${x.tone}" data-folder="${x.id}" data-k="f-${x.id}">${folderArt(L)}<span class="front"><h3>${esc(x.label)}</h3><small>${L.length} document${L.length > 1 ? "s" : ""}</small></span></button>`; }).join("")}
      ${orphans().length ? `<button class="fd" data-folder="_autres" data-k="f-autres">${folderArt(orphans())}<span class="front"><h3>Autres documents</h3><small>${orphans().length} document${orphans().length > 1 ? "s" : ""}</small></span></button>` : ""}
      <button class="fd" data-folder="formations" data-k="f-formations">${folderArt(st.docs().filter((d) => d.applicationId))}<span class="front"><h3>Dossiers par formation</h3><small>${st.apps().length} formation${st.apps().length > 1 ? "s" : ""}</small></span></button>
    </div>`;
  } else if (f === "pieces") {
    head = crumb("Pièces à réunir");
    body = `<div class="docs">${P.map(pieceCard).join("")}</div><p class="meta" style="margin-top:14px"><button class="btn" data-act="newpiece">${ic("plus")}Ajouter une pièce</button></p>`;
  } else if (f === "formations") {
    head = crumb("Dossiers par formation");
    body = `<div class="folders">${st.sortedApps().map((a) => `<button class="fd ${a.tier === st.firstTier() ? "hot" : ""}" data-folder="c:${a.id}" data-k="f-c-${a.id}">${folderArt(appDocs(a))}<span class="front"><h3>${esc(st.appLabel(a))}</h3><small>${esc(st.tierLabel(a.tier))}${a.variant ? " · " + esc(a.variant) : ""}</small></span></button>`).join("") || `<p class="meta">Aucune candidature.</p>`}</div>`;
  } else if (f.startsWith("c:")) {
    const a = st.app(f.slice(2));
    if (!a) { store.ui.docFolder = null; return docsView(); }
    head = crumb(st.appLabel(a), ["formations", "Dossiers par formation"]);
    body = `<div class="docs">${appDocs(a).map(docCard).join("")}</div><div class="acts" style="margin-top:14px">${uploadBtn("divers", a.id)}<button class="btn" data-open="${a.id}">Ouvrir le suivi de ${esc(st.appLabel(a))}</button></div>`;
  } else if (f === "_autres") {
    head = crumb("Autres documents");
    body = `<p class="meta" style="margin-bottom:12px">Documents sans dossier ni candidature. Clique sur un document puis sur « Modifier » pour le ranger.</p><div class="docs">${orphans().map(docCard).join("")}</div><div class="acts" style="margin-top:14px">${uploadBtn("divers")}</div>`;
  } else {
    const x = c.folders.find((a) => a.id === f);
    if (!x) { store.ui.docFolder = null; return docsView(); }
    head = crumb(x.label);
    const L = st.docs().filter((d) => d.folder === x.id && !d.applicationId);
    body = (x.note ? `<p class="note-c" style="margin-bottom:12px;${x.tone === "warn" ? "background:var(--rose)" : ""}">${esc(x.note)}</p>` : "") + `<div class="docs">${L.map(docCard).join("")}</div><div class="acts" style="margin-top:14px">${uploadBtn(x.id)}</div>`;
  }
  const missing = P.filter((p) => p.status !== "recue");
  return `<div class="view"><div class="bezel doc-main"><div class="core">${head}<div class="doc-scroll">${body}</div></div></div>
   <aside class="bezel info" aria-label="Avancement du dossier"><div class="core"><h3>Avancement</h3>
    <div class="st-card"><small>Pièces réunies</small><b>${got} sur ${P.length}</b><div class="bar" style="margin:0"><i style="transform:scaleX(${P.length ? got / P.length : 0})"></i></div></div>
    <div class="st-card"><small>Documents enregistrés</small><b>${st.docs().length}</b></div>
    <h3 style="margin-top:6px">Ce qui manque</h3><p class="meta" style="margin:0">Clique sur un statut pour le changer.</p><div>${missing.map((p) => `<div class="pp-row"><div>${esc(p.label)}<small>${esc(p.who)}</small></div><button class="st st-${p.status}" data-piece-cycle="${p.id}" data-k="pc-${p.id}" title="Changer le statut">${st.PIECE_L[p.status]}</button></div>`).join("") || `<p class="meta">Tout est réuni.</p>`}</div>
   </div></aside></div>`;
}
function crumb(label: string, parent?: [string, string]) {
  return `<div class="doc-top"><button class="round" style="background:var(--lilac-soft);color:var(--ink)" data-folder="${parent ? parent[0] : ""}" aria-label="Retour">${ic("left")}</button><div class="crumb"><button data-folder="">Mon dossier</button>${ic("right")}${parent ? `<button data-folder="${parent[0]}">${esc(parent[1])}</button>${ic("right")}` : ""}<b>${esc(label)}</b></div></div><h2 class="doc-h">${esc(label)}</h2>`;
}
export function docCard(d: Doc) {
  const blur = d.sensitive && !store.ui.shown[d.id];
  return `<button class="dc" data-doc="${d.id}" data-k="d-${d.id}"><span class="dc-t ${blur ? "blur" : ""}">${thumbHtml(d)}${blur ? `<span class="lock">${ic("lock")}</span>` : ""}</span>${d.warning ? `<span class="tag tag-warn">${esc(d.warning)}</span>` : ""}<b>${esc(d.title)}</b><small>${esc(d.subtitle)}</small></button>`;
}
function pieceCard(p: (ReturnType<typeof st.pieces>)[number]) {
  const d = p.documentId ? st.doc(p.documentId) : null;
  return `<div class="dc" style="cursor:default">${d ? `<button class="dc-t ${d.sensitive && !store.ui.shown[d.id] ? "blur" : ""}" data-doc="${d.id}" aria-label="Voir ${esc(p.label)}" style="width:100%">${thumbHtml(d)}${d.sensitive && !store.ui.shown[d.id] ? `<span class="lock">${ic("lock")}</span>` : ""}</button>` : `<div class="miss">${ic("doc")}<span>${esc(p.note || "Pas encore de fichier.")}</span></div>`}
    <b>${esc(p.label)}</b><small>${esc(p.who)}</small>
    <label class="fld" for="lk-${p.id}" style="font-weight:400;font-size:11.5px;margin:6px 0 2px">Lien de la preuve (facultatif)</label><input class="inp" id="lk-${p.id}" type="url" data-plink="${p.id}" value="${esc(p.link)}" placeholder="https://" style="padding:6px 9px;font-size:12px">
    <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px;align-items:center"><button class="st st-${p.status}" data-piece-cycle="${p.id}" data-k="pc2-${p.id}" title="Changer le statut">${st.PIECE_L[p.status]}</button>${p.how && p.status !== "recue" ? `<button class="mini-btn" data-howpiece="${p.id}" style="background:var(--lime)">Comment faire</button>` : ""}<label class="mini-btn">${d ? "Remplacer" : "Ajouter"}<input type="file" data-upload-piece="${p.id}" accept="application/pdf,image/png,image/jpeg,image/webp"></label>${p.link && /^https?:\/\//.test(p.link) ? `<a class="mini-btn" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none">Ouvrir le lien</a>` : ""}<button class="mini-btn" data-editpiece="${p.id}">Modifier</button></div></div>`;
}

// ---------- Pièces jointes d'un échange
const threadDocs = (t: Thread) => t.attachmentIds.map((id) => st.doc(id));
export const fmtSize = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(b / 1024))} Ko`);

/** Liste des pièces d'un courriel, avec un bouton « Voir » par fichier. Toujours explicite, même vide. */
export function pjBlock(t: Thread) {
  const all = threadDocs(t), list = all.filter((d): d is Doc => !!d), missing = all.length - list.length;
  const total = list.reduce((n, d) => n + d.sizeBytes, 0);
  return `<div class="pj"><div class="pj-top"><b>${t.sentAt ? "Pièces jointes" : "Pièces à joindre"}</b>${list.length ? `<small>${list.length} fichier${list.length > 1 ? "s" : ""} · ${fmtSize(total)}</small>` : ""}${t.sentAt ? "" : `<button class="mini-btn" data-pjedit="${t.id}">Modifier les pièces</button>`}${list.length ? `<button class="mini-btn" data-dlpj="${t.id}">Tout télécharger</button>` : ""}</div>${list.length ? `<ul>${list.map((d) => `<li><span>${esc(d.title)}</span><button class="btn" data-doc="${d.id}" aria-label="Voir : ${esc(d.title)}">Voir</button></li>`).join("")}</ul>` : `<p>Aucune : ce courriel part sans pièce jointe.</p>`}${missing ? `<p class="pj-warn">${missing > 1 ? `${missing} pièces ont été supprimées` : "Une pièce a été supprimée"} de tes documents. Modifie la liste avant d'envoyer.</p>` : ""}</div>`;
}


// ---------- Échanges
export function mailView() {
  const u = store.ui, F = u.thFilter, ts = st.threads();
  const list = ts.filter((t) => F === "all" || st.thState(t) === F);
  const sel = ts.find((t) => t.id === u.thSel) || list[0] || ts[0];
  const counts: Record<string, number> = {}; ts.forEach((t) => (counts[st.thState(t)] = (counts[st.thState(t)] || 0) + 1));
  const s = sel ? st.thState(sel) : null;
  const mailto = sel ? (() => { const m = (sel.recipient || "").match(/[\w.+-]+@[\w.-]+\.\w+/g); return m ? `mailto:${encodeURIComponent(m[0])}${m.length > 1 ? "?cc=" + encodeURIComponent(m.slice(1).join(",")) + "&" : "?"}subject=${encodeURIComponent(sel.subject)}&body=${encodeURIComponent(sel.body)}` : null; })() : null;
  const linked = sel?.applicationId ? st.app(sel.applicationId) : null, mail = store.data.mail;
  return `<div class="view"><div class="bezel th-list"><div class="core"><div class="th-f" role="group" aria-label="Filtrer les échanges">${([["all", "Tous", ts.length], ["envoyer", "À envoyer", counts.envoyer || 0], ["attente", "En attente", counts.attente || 0], ["relance", "À relancer", counts.relance || 0], ["repondu", "Réponses", counts.repondu || 0]] as const).map(([k, l, n]) => `<button class="chip" data-thf="${k}" aria-pressed="${F === k}">${l} ${n}</button>`).join("")}<button class="chip" data-act="newthread" style="background:var(--lime)">Nouvel échange</button></div>
    <div class="th-s">${list.map((t) => `<button class="th-i" data-thread="${t.id}" data-k="th-${t.id}" aria-current="${sel && t.id === sel.id}"><b>${esc(t.title)}</b><small>${esc(t.subject)}</small><span class="st st-${st.thState(t)}">${st.TH_L[st.thState(t)]}</span></button>`).join("") || `<p class="meta" style="padding:10px">Aucun échange dans ce filtre.</p>`}</div></div></div>
  <div class="bezel th-main"><div class="core">${sel ? `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2>${esc(sel.title)}</h2><span class="st st-${s}">${st.TH_L[s!]}</span>${linked ? `<button class="mini-btn" data-open="${linked.id}">Voir la candidature</button>` : ""}<button class="mini-btn" data-editthread="${sel.id}">Modifier</button></div>
    <p class="meta"><b>À :</b> ${esc(sel.recipient)}</p><p class="meta"><b>Objet :</b> ${esc(sel.subject)}</p>
    ${pjBlock(sel)}
    ${!sel.sentAt ? (mail.connected
      ? `<ol class="how" style="max-width:74ch;margin-top:10px"><li>Relis le texte du courriel, plus bas, et la liste des pièces.</li><li>Clique sur « Envoyer depuis Outlook » : il part de ${esc(mail.email ?? "ta boîte")}, avec ses pièces jointes.</li><li>Les réponses arriveront dans cet échange.</li></ol>`
      : `<ol class="how" style="max-width:74ch;margin-top:10px"><li>Relis le texte du courriel, plus bas, et la liste des pièces.</li><li>Clique sur « Préparer dans Outlook » : Outlook s'ouvre avec le destinataire et l'objet remplis, les pièces s'enregistrent, et le texte est copié.</li><li>Dans Outlook : si le texte n'apparaît pas, colle-le (Cmd+V) ; glisse les pièces enregistrées, relis, puis envoie-le.</li><li>Reviens ici et clique sur « J'ai envoyé ce courriel ».</li></ol>${mail.available ? `<p class="meta">Si Epitech autorise un jour l'envoi automatique, <a href="/reglages#s-mail">connecte Outlook dans les réglages</a>.</p>` : ""}`) : ""}<div class="acts">${!sel.sentAt ? `${mail.connected ? `<button class="btn main-a" data-mailsend="${sel.id}" data-k="ms">Envoyer depuis Outlook<span>${ic("up")}</span></button>` : `<button class="btn main-a" data-outlook="${sel.id}" data-k="ol">Préparer dans Outlook<span>${ic("up")}</span></button>${mailto ? `<a class="btn" href="${esc(mailto)}" data-k="mt">Autre messagerie</a>` : ""}`}<button class="btn" data-copy="${sel.id}" data-k="cp">${ic("copy")}Copier le courriel</button><button class="btn ${mail.connected ? "" : "lime"}" data-sent="${sel.id}" data-k="snt">${ic("check")}J'ai envoyé ce courriel</button>` : `${mail.connected ? `<button class="btn main-a" data-act="mailsync" data-k="sy">Vérifier les réponses<span>${ic("up")}</span></button>` : ""}<button class="btn" data-copy="${sel.id}" data-k="cp">${ic("copy")}Copier le courriel</button><button class="btn ${mail.connected ? "" : "lime"}" data-reply="${sel.id}" data-k="rp">Noter la réponse</button>${sel.viaOutlook ? "" : `<button class="btn" data-unsent="${sel.id}">Annuler l'envoi noté</button>`}`}</div>
    ${s === "relance" ? `<p class="note-c" style="background:var(--rose);max-width:74ch">Pas de réponse depuis 7 jours ou plus. Une relance courte et précise est le bon réflexe.</p>` : ""}
    ${sel.sentAt || sel.messages.length ? `<ul class="tl">${sel.sentAt ? `<li><b>${sel.viaOutlook ? "Envoyé depuis Outlook" : "Courriel envoyé"}</b><small>${fL(sel.sentAt)}</small></li>` : ""}${sel.messages.map((m) => `<li><b>${m.direction === "in" ? (isAutoMsg(m.rawText) ? "Réponse automatique reçue" : "Réponse reçue") : "Message envoyé"}</b><small>${fL(m.receivedOn)}</small></li>`).join("")}</ul>` : ""}
    ${sel.messages.map((m) => m.direction !== "in" ? "" : `<section class="rp ${isAutoMsg(m.rawText) ? "is-auto" : ""}"><div class="rp-h"><b>${isAutoMsg(m.rawText) ? "Réponse automatique" : "Réponse reçue"}</b><span>${fL(m.receivedOn)}</span><button class="mini-btn" data-rawmsg="${m.id}">Texte d'origine</button><button class="mini-btn" data-delmsg="${m.id}">Supprimer</button></div>${isAutoMsg(m.rawText) ? `<p class="rp-note">Ce message est envoyé automatiquement. Il ne répond pas à ta question : l'échange reste en attente d'une vraie réponse.</p>` : ""}<div class="rp-b">${fmtReplyHtml(m.rawText)}</div></section>`).join("")}
    <div class="mail-box">${esc(sel.body)}</div><p class="meta">Relis ce texte avant envoi. Rien ne part sans toi.</p>` : `<p class="meta">Aucun échange. Crée un premier courriel avec « Nouvel échange ».</p>`}</div></div></div>`;
}
