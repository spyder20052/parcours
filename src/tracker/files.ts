// Fichiers : envoi vers le stockage privé par URL signée, miniatures et pages rendues dans le navigateur.
// Le serveur ne génère aucune image : pdf.js lit le PDF directement depuis une URL signée de 5 minutes.
import type { Doc } from "@/lib/model";
import { store } from "./state";
import { esc, ic } from "./util";

type Signed = { url: string; exp: number };
const signed = new Map<string, Signed>();
const thumbs = new Map<string, string>();

/** URL signée d'un document, gardée en mémoire tant qu'il lui reste au moins une minute. */
export async function fileUrl(id: string): Promise<string> {
  const c = signed.get(id);
  if (c && c.exp > Date.now() + 60_000) return c.url;
  const r = await fetch(`/api/files/${encodeURIComponent(id)}/url`, { cache: "no-store" });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Document introuvable.");
  const j = (await r.json()) as { url: string; ttl: number };
  signed.set(id, { url: j.url, exp: Date.now() + j.ttl * 1000 });
  return j.url;
}

/**
 * Enregistre un document sur le disque sous le nom donné, pour le glisser ensuite dans un courriel.
 * Les octets passent par la même origine (/download, autorisé par connect-src 'self'), puis un blob :
 * le nom de fichier est maîtrisé et aucun contrôle d'origine ne bloque la lecture.
 */
export async function saveDoc(id: string, filename: string) {
  const r = await fetch(`/api/files/${encodeURIComponent(id)}/download`, { cache: "no-store" });
  if (!r.ok) throw new Error("Téléchargement impossible.");
  const href = URL.createObjectURL(await r.blob());
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

type PdfLib = typeof import("pdfjs-dist");
let pdfLib: Promise<{ lib: PdfLib; worker: InstanceType<PdfLib["PDFWorker"]> }> | null = null;
/** pdf.js et un seul worker partagé par tous les documents (sinon chaque PDF lance le sien). */
function pdf() {
  pdfLib ??= import("pdfjs-dist").then((lib) => {
    lib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return { lib, worker: new lib.PDFWorker() };
  });
  return pdfLib;
}

async function renderPage(url: string, n: number, width: number) {
  const { lib, worker } = await pdf();
  const task = lib.getDocument({ url, worker });
  const doc = await task.promise;
  const pages: HTMLCanvasElement[] = [];
  const last = Math.min(doc.numPages, n);
  for (let i = 1; i <= last; i++) {
    const page = await doc.getPage(i);
    const v0 = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (width / v0.width) * Math.min(2, devicePixelRatio || 1) });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width; canvas.height = viewport.height;
    await page.render({ canvas, viewport }).promise;
    pages.push(canvas);
  }
  const total = doc.numPages;
  await task.destroy();
  return { pages, total };
}

/** Emplacement de miniature ; l'image arrive ensuite par hydrateThumbs(). */
export function thumbHtml(d: Doc, variant: "card" | "art" = "card") {
  const t = thumbs.get(d.id);
  const blur = d.sensitive && !store.ui.shown[d.id] ? ' style="filter:blur(5px)"' : "";
  if (t) return `<img src="${esc(t)}" alt="" loading="lazy"${blur}>`;
  return variant === "art" ? `<span data-thumb="${esc(d.id)}" data-art="1"></span>` : `<span class="thumb-wait" data-thumb="${esc(d.id)}" aria-hidden="true">${ic("doc")}</span>`;
}

let running = false, again = false;
/** Remplace les emplacements visibles par la première page de chaque document. */
export async function hydrateThumbs(root: ParentNode = document): Promise<void> {
  if (running) { again = true; return; }
  running = true;
  try {
    const slots = [...root.querySelectorAll<HTMLElement>("[data-thumb]")];
    const queue = [...new Set(slots.map((s) => s.dataset.thumb!))].filter((id) => !thumbs.has(id));
    const place = (id: string) => document.querySelectorAll<HTMLElement>(`[data-thumb="${CSS.escape(id)}"]`).forEach((s) => {
      const t = thumbs.get(id);
      if (!t) return;
      const d = store.data.documents.find((x) => x.id === id);
      const img = document.createElement("img");
      img.src = t; img.alt = ""; img.loading = "lazy";
      if (d?.sensitive && !store.ui.shown[id]) img.style.filter = "blur(5px)";
      s.replaceWith(img);
    });
    // Quatre rendus en parallèle ; chaque miniature s'affiche dès qu'elle est prête.
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        const d = store.data.documents.find((x) => x.id === id);
        if (!d) continue;
        try {
          const url = await fileUrl(id);
          if (d.mime === "application/pdf") {
            const { pages } = await renderPage(url, 1, 240);
            thumbs.set(id, pages[0].toDataURL("image/jpeg", 0.82));
          } else thumbs.set(id, url);
        } catch { thumbs.set(id, ""); }
        place(id);
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    [...thumbs.keys()].forEach(place);
  } finally { running = false; }
  if (again) { again = false; return hydrateThumbs(); }
}

/** Pages d'un document pour l'aperçu (12 au plus). */
export async function previewPages(d: Doc, into: HTMLElement, blur: boolean) {
  into.innerHTML = `<p class="meta">Chargement de l'aperçu…</p>`;
  try {
    const url = await fileUrl(d.id);
    if (d.mime !== "application/pdf") {
      into.innerHTML = `<img src="${esc(url)}" alt="${esc(d.title)}"${blur ? ' style="filter:blur(14px)"' : ""}>`;
      return url;
    }
    const { pages, total } = await renderPage(url, 12, Math.min(900, into.clientWidth || 700));
    into.innerHTML = "";
    pages.forEach((c, i) => {
      const img = document.createElement("img");
      img.src = c.toDataURL("image/jpeg", 0.9); img.alt = `Page ${i + 1} de ${d.title}`;
      if (blur) img.style.filter = "blur(14px)";
      into.appendChild(img);
    });
    if (total > pages.length) into.insertAdjacentHTML("beforeend", `<p class="meta">Ouvre le PDF pour voir les ${total} pages.</p>`);
    return url;
  } catch (e) {
    into.innerHTML = `<p class="meta">${esc((e as Error).message || "Aperçu indisponible.")}</p>`;
    return null;
  }
}

export const ACCEPT = "application/pdf,image/png,image/jpeg,image/webp";
const MAX = 15 * 1024 * 1024;

async function sha256(file: File) {
  const h = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Envoi en trois temps : demande d'URL signée, envoi direct au stockage, confirmation (contrôle du contenu). */
export async function uploadFile(file: File, meta: { folder: string; applicationId?: string | null; pieceId?: string | null; title?: string }) {
  if (!ACCEPT.split(",").includes(file.type)) throw new Error("Formats acceptés : PDF, PNG, JPEG ou WEBP.");
  if (file.size > MAX) throw new Error("Fichier trop lourd : 15 Mo au plus.");
  const post = async (path: string, body: unknown) => {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? "Envoi impossible.");
    return j;
  };
  const title = (meta.title || file.name.replace(/\.[a-z0-9]+$/i, "")).slice(0, 200);
  const { id, url } = await post("/api/files/upload-url", { name: file.name, mime: file.type, size: file.size, folder: meta.folder, applicationId: meta.applicationId ?? null, title });
  const put = await fetch(url, { method: "PUT", headers: { "content-type": file.type }, body: file });
  if (!put.ok) throw new Error("Le stockage a refusé le fichier.");
  await post("/api/files/confirm", { id, pieceId: meta.pieceId ?? null, sha256: await sha256(file) });
  return id as string;
}

export function forgetThumb(id: string) { thumbs.delete(id); signed.delete(id); }
