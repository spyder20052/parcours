// Outils du moteur de suivi : dates, échappement, icônes, mise en forme des réponses collées.

export const $ = <T extends Element = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector(s) as T;
/** Échappe toute valeur insérée dans le HTML. Toute donnée utilisateur doit passer par esc(). */
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const DAY = 864e5;
const P_ = (y: number, m: number, d: number) => new Date(y, m - 1, d);
export const D = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return P_(y, m, d); };
export const iso = (d: Date) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
export const NOW = () => { const n = new Date(); return P_(n.getFullYear(), n.getMonth() + 1, n.getDate()); };
export const until = (i: string) => Math.round((D(i).getTime() - NOW().getTime()) / DAY);
export const fD = (i: string) => D(i).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
export const fL = (i: string) => D(i).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
export const fLong = (i: string) => D(i).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
export const J = (i: string) => { const n = until(i); return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n > 0 ? "J-" + n : "dépassé"; };
// Urgence : une échéance tombe à 23h59 du jour indiqué. Quatre niveaux, une couleur chacun (tracker.css, « Urgence »).
export type Urg = "late" | "crit" | "hot" | "near" | "";
export const msLeft = (i: string) => D(i).getTime() + DAY - 60_000 - Date.now();
export const urg = (i: string): Urg => { const h = msLeft(i) / 36e5; return h < 0 ? "late" : h <= 48 ? "crit" : until(i) <= 3 ? "hot" : until(i) <= 7 ? "near" : ""; };
/** Temps restant : heures et minutes sous 48 h, sinon J-n. */
export const left = (i: string, long = false) => {
  const ms = msLeft(i);
  if (ms < 0) { const d = Math.floor(-ms / DAY); return d < 1 ? "dépassé" : `dépassé de ${d} j`; }
  const h = Math.floor(ms / 36e5), m = Math.floor((ms % 36e5) / 6e4);
  return h >= 48 ? J(i) : h ? `${h} h ${String(m).padStart(2, "0")}${long ? " min" : ""}` : `${m} min`;
};
/** Part des dernières 24 h qui reste, pour la barre du bandeau. */
export const frac = (i: string) => Math.max(0, Math.min(1, msLeft(i) / DAY));
/** Pastille d'échéance. Sous 48 h, elle porte un compte à rebours que le moteur met à jour. */
export const dueChip = (i: string, txt?: string) => { const u = urg(i); return u === "crit" ? `<span class="due u-crit" data-cd="${i}">${left(i)}</span>` : `<span class="due ${u ? "u-" + u : ""}">${esc(txt ?? J(i))}</span>`; };
export const hotJ = (i: string) => (urg(i) === "crit" ? `<em data-cd="${i}">${left(i)}</em>` : until(i) <= 7 ? `<em>${J(i)}</em>` : J(i));
export const uid = () => crypto.randomUUID();

const I: Record<string, string> = {
  canvas: '<circle cx="5" cy="6" r="2.2"/><circle cx="19" cy="6" r="2.2"/><circle cx="12" cy="18" r="2.2"/><path d="M6.6 7.6 10.6 16M17.4 7.6 13.4 16"/>',
  cal: '<rect x="4" y="5.5" width="16" height="14.5" rx="3"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  board: '<rect x="4" y="4.5" width="4.6" height="15" rx="1.8"/><rect x="10.7" y="4.5" width="4.6" height="10" rx="1.8"/><rect x="17.4" y="4.5" width="2.8" height="7" rx="1.4"/>',
  folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.7l2 2.2h7.3a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 7.5 7.5 6 7.5-6"/>',
  search: '<circle cx="11" cy="11" r="6.4"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', minus: '<path d="M5 12h14"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="M7 17 17 7M9 7h8v8"/>', left: '<path d="m14.5 6-6 6 6 6"/>', right: '<path d="m9.5 6 6 6-6 6"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5v-2a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  save: '<path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"/>', eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
  lock: '<rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
  doc: '<path d="M7 3.5h7l4.5 4.5v12.5H7a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14 3.5V8h4.5"/>',
  target: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10z"/>',
  auto: '<circle cx="12" cy="12" r="8"/><path d="M12 4v16a8 8 0 0 0 0-16z" fill="currentColor" stroke="none"/>',
  spark: '<path d="M12 3.5 13.8 10.2 20.5 12l-6.7 1.8L12 20.5l-1.8-6.7L3.5 12l6.7-1.8z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  upload: '<path d="M12 20V9M7.5 13.5 12 9l4.5 4.5M5 4.5h14"/>',
  trash: '<path d="M5 7h14M9.5 7V5h5v2M7 7l1 12.5h8L17 7"/>',
  pen: '<path d="M4.5 19.5h4l10-10-4-4-10 10z"/>',
};
export const ic = (n: string, c = "") => `<svg class="i ${c}" viewBox="0 0 24 24" aria-hidden="true">${I[n] ?? ""}</svg>`;

export const TOUR = '<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 2.5v3.5"/><path d="M14.4 6h3.2"/><path d="M14.8 6 12.6 16.5M17.2 6l2.2 10.5"/><path d="M11.2 16.5h9.6"/><path d="M12.4 16.5C11.6 21.6 9.8 25.8 7.2 29.5M19.6 16.5c.8 5.1 2.6 9.3 5.2 13"/><path d="M10.3 22.6h11.4"/><path d="M12.4 29.5c.7-3.4 6.5-3.4 7.2 0"/><path d="M14.2 10.8h3.6"/></svg>';

// ---------- Réponses collées : mise en forme et détection des réponses automatiques
const AUTO_RX = /généré automatiquement|réponse automatique|message automatique|automatic reply|auto-reply|do not reply|ne pas répondre|no-reply/i;
export const isAuto = (t: string) => AUTO_RX.test(t || "");

export function tidyReply(raw: string) {
  let t = String(raw || "").replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").trim();
  t = t.replace(/[ \t]*-{6,}[ \t]*/g, "\n\n---\n\n");
  t = t.replace(/\s*[•▪●◦]\s+/g, "\n\n• ");
  t = t.replace(/^(Bonjour|Bonsoir|Madame, Monsieur|Madame|Monsieur|Cher [^,\n]{1,40}|Chère [^,\n]{1,40}|Hello|Dear [^,\n]{1,40})\s*,\s*/i, "$1,\n\n");
  t = t.replace(/\s+(Volet (?:Master|Doctorat|Licence|Ingénieur))\s+(?=[A-ZÀ-Ý])/g, "\n\n## $1\n");
  t = t.replace(/\s*\b(Merci de votre compréhension\.)\s*/g, "\n\n$1\n");
  t = t.replace(/\s*\b(Bien cordialement|Cordialement|Bien à vous|Sincères salutations|Best regards|Kind regards|Regards)\s*,\s*/g, "\n\n$1,\n");
  t = t.replace(/(Direction [^\n(]{3,80}\([A-Z]{2,8}\))\s+(Université|Universit)/g, "$1\n$2");
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

export function fmtReply(raw: string) {
  const linkify = (h: string) => h.replace(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]])/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
  return tidyReply(raw).split(/\n{2,}/).map((block) => {
    if (block === "---") return "<hr>";
    if (block.startsWith("## ")) { const [h, ...rest] = block.slice(3).split("\n"); return `<h4>${esc(h)}</h4>` + (rest.length ? `<p>${linkify(esc(rest.join("\n")))}</p>` : ""); }
    if (block.startsWith("• ")) {
      let b = block.slice(2), head = "";
      const m = b.match(/^([^.!?:\n]{3,70}?[a-zà-ÿ])\s+(?=[A-ZÀ-ÝL]['’]?[a-zà-ÿ]|[A-ZÀ-Ý]{2,})/);
      if (m && b.length - m[0].length > 110) { head = m[1]; b = b.slice(m[0].length); }
      return `<div class="rp-item">${head ? `<h4>${esc(head)}</h4>` : ""}<p>${linkify(esc(b))}</p></div>`;
    }
    return `<p>${linkify(esc(block))}</p>`;
  }).join("");
}

export const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
