// Importe un espace personnel (même format qu'un modèle, plus des documents locaux) dans le compte d'un utilisateur.
// Usage : npm run import -- --email toi@exemple.com --fichier private/mon-espace.json --dossier "/chemin/des/fichiers" [--remplacer]
// Le compte doit exister : connecte-toi une première fois. Les fichiers personnels restent hors du dépôt (dossier private/).
import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { TemplateSchema, templateOps } from "@/lib/template";
import { systemDb, withUser } from "@/server/db";
import * as t from "@/server/schema";
import { applyOne, getWorkspaceId } from "@/server/workspace";
import { deleteObject, MAX_BYTES, putObject, sniff } from "@/server/storage";

const arg = (k: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
const email = arg("email"), file = arg("fichier"), dir = arg("dossier") ?? ".", replace = process.argv.includes("--remplacer");
if (!email || !file) { console.error("Usage : npm run import -- --email … --fichier … [--dossier …] [--remplacer]"); process.exit(1); }

async function main() {
  const tpl = TemplateSchema.parse(JSON.parse(readFileSync(file!, "utf8")));
  const user = (await systemDb.select().from(t.user).where(sql`lower(${t.user.email}) = ${email!.toLowerCase()}`))[0];
  if (!user) { console.error(`Aucun compte pour ${email}. Connecte-toi d'abord une fois.`); process.exit(1); }

  // 1. Envoi des fichiers dans le stockage privé, après contrôle de leur nature réelle.
  const docIds = new Map<string, string>();
  const rows: (typeof t.document.$inferInsert)[] = [];
  const sent: string[] = [];
  const missing: string[] = [];
  for (const d of tpl.documents) {
    const p = resolve(dir, d.path);
    if (!existsSync(p) || statSync(p).size > MAX_BYTES) { missing.push(d.path); continue; }
    const body = new Uint8Array(readFileSync(p));
    const mime = sniff(body.subarray(0, 16));
    if (!mime) { missing.push(d.path); continue; }
    const id = randomUUID(), key = `u/${user.id}/${randomUUID()}`;
    await putObject(key, body, mime);
    sent.push(key);
    docIds.set(d.path, id);
    rows.push({ id, ownerId: user.id, workspaceId: "", applicationId: null, folder: d.folder, title: d.title, subtitle: d.subtitle, tag: d.tag, objectKey: key, mime, sizeBytes: body.length, sensitive: d.sensitive, warning: d.warning, status: "ready" });
  }

  // 2. Espace, documents et contenu dans une seule transaction, sous RLS.
  const ops = templateOps(tpl, randomUUID, docIds);
  const appIdOf = new Map<string, string>();
  ops.forEach((o) => { if (o.op === "application.create") appIdOf.set(`${o.data.university}\u0000${o.data.program}`, o.id); });
  let oldKeys: string[] = [];
  try {
    await withUser(user.id, async (tx) => {
      if (await getWorkspaceId(tx)) {
        if (!replace) throw new Error("Cet utilisateur a déjà un espace. Ajoute --remplacer pour l'effacer et le remplacer.");
        oldKeys = (await tx.select({ k: t.document.objectKey }).from(t.document)).map((r) => r.k);
        await tx.delete(t.workspace);
      }
      const [ws] = await tx.insert(t.workspace).values({ ownerId: user.id, name: tpl.config.appTitle, template: tpl.id, config: tpl.config }).returning({ id: t.workspace.id });
      const objects: string[] = [];
      // Les candidatures d'abord, pour pouvoir y rattacher les documents.
      for (const op of ops.filter((o) => o.op === "application.create")) await applyOne(tx, user.id, ws.id, op, objects);
      const appKey = new Map(tpl.applications.map((a) => [a.key, appIdOf.get(`${a.university}\u0000${a.program}`)!]));
      for (const r of rows) {
        const d = tpl.documents.find((x) => docIds.get(x.path) === r.id)!;
        await tx.insert(t.document).values({ ...r, workspaceId: ws.id, applicationId: d.app ? appKey.get(d.app) ?? null : null });
      }
      for (const op of ops.filter((o) => o.op !== "application.create")) await applyOne(tx, user.id, ws.id, op, objects);
    });
  } catch (e) {
    for (const k of sent) await deleteObject(k).catch(() => undefined);
    console.error((e as Error).message);
    process.exit(1);
  }
  for (const k of oldKeys) await deleteObject(k).catch(() => undefined);
  console.log(`Espace importé pour ${email} : ${tpl.applications.length} candidatures, ${tpl.tasks.length} tâches, ${tpl.pieces.length} pièces, ${tpl.threads.length} échanges, ${rows.length} documents.`);
  if (missing.length) console.log(`Documents introuvables ou refusés (${missing.length}) :\n- ${missing.join("\n- ")}`);
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
