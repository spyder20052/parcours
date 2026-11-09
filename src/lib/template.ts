// Format d'un modèle de parcours (templates/*.json) et conversion en opérations.
// Les éléments se référencent entre eux par une clé locale (`key`) ; les identifiants réels sont créés ici.
import { z } from "zod";
import { ConfigSchema, HowSchema, PIECE_STATUSES, THREAD_KINDS, type How } from "./model";
import type { Op } from "./ops";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const key = z.string().regex(/^[a-z0-9_-]{1,40}$/);

export const TemplateSchema = z.object({
  id: key,
  name: z.string().min(1).max(80),
  description: z.string().max(400).default(""),
  config: ConfigSchema,
  applications: z.array(z.object({
    key, university: z.string().min(1), program: z.string().min(1), longTitle: z.string().default(""), tier: key, variant: z.string().default(""), stage: key.optional(),
    conditions: z.string().default(""), channel: z.string().default(""), procedureUrl: z.string().default(""), programUrl: z.string().default(""), notes: z.string().default(""), formText: z.string().default(""),
    steps: z.array(z.object({ label: z.string().min(1), kind: key, dueDate: date.nullable().default(null), isTarget: z.boolean().default(false), note: z.string().default(""), how: HowSchema.nullable().default(null), done: z.boolean().default(false) })).default([]),
  })).default([]),
  tasks: z.array(z.object({ label: z.string().min(1), dueDate: date.nullable().default(null), track: key.nullable().default(null), app: key.nullable().default(null), how: HowSchema.nullable().default(null), done: z.boolean().default(false) })).default([]),
  pieces: z.array(z.object({ key: key.optional(), label: z.string().min(1), who: z.string().default(""), note: z.string().default(""), status: z.enum(PIECE_STATUSES).default("attendue"), link: z.string().default(""), how: HowSchema.nullable().default(null) })).default([]),
  threads: z.array(z.object({
    key, app: key.nullable().default(null), title: z.string().min(1), recipient: z.string().default(""), subject: z.string().default(""), body: z.string().default(""), kind: z.enum(THREAD_KINDS).default("premier_contact"),
    sentAt: date.nullable().default(null), attachments: z.array(z.string().min(1)).max(20).default([]), messages: z.array(z.object({ direction: z.enum(["in", "out"]), rawText: z.string().min(1), receivedOn: date })).default([]),
  })).default([]),
  // Utilisé par l'import d'un espace personnel (scripts/import.ts) : fichiers locaux à envoyer dans le stockage.
  documents: z.array(z.object({
    path: z.string().min(1), folder: key.default("divers"), title: z.string().min(1), subtitle: z.string().default(""), app: key.nullable().default(null),
    tag: z.string().max(40).default(""), sensitive: z.boolean().default(false), warning: z.string().max(120).default(""), piece: key.nullable().default(null),
  })).default([]),
});
export type Template = z.infer<typeof TemplateSchema>;

/**
 * Opérations qui remplissent un espace neuf à partir d'un modèle. `newId` fournit les identifiants.
 * `docIds` (import) associe le chemin de chaque document déjà enregistré à son identifiant.
 */
export function templateOps(t: Template, newId: () => string, docIds: Map<string, string> = new Map()): Op[] {
  const appIds = new Map(t.applications.map((a) => [a.key, newId()]));
  const thIds = new Map(t.threads.map((h) => [h.key, newId()]));
  const pieceDoc = new Map(t.documents.filter((d) => d.piece && docIds.has(d.path)).map((d) => [d.piece!, docIds.get(d.path)!]));
  // Les boutons d'un mode d'emploi citent des clés locales : on les remplace par les vrais identifiants.
  const how = (h: How | null): How | null => h && { ...h, use: h.use.map(([ty, l, v]) => [ty, l, ty === "th" ? thIds.get(v) ?? "" : ty === "open" || ty === "copy" ? appIds.get(v) ?? "" : ty === "doc" ? docIds.get(v) ?? "" : v] as How["use"][number])
    .filter(([ty, , v]) => v !== "" || !["th", "open", "doc"].includes(ty)) };
  const ops: Op[] = [];
  const firstStage = t.config.stages[0].id;
  t.applications.forEach((a, i) => {
    const id = appIds.get(a.key)!;
    const { university, program, longTitle, tier, variant, conditions, channel, procedureUrl, programUrl, notes, formText } = a;
    ops.push({ op: "application.create", id, data: { university, program, longTitle, tier, variant, conditions, channel, procedureUrl, programUrl, notes, formText, stage: a.stage ?? firstStage, position: i } });
    a.steps.forEach((s, j) => ops.push({ op: "step.create", id: newId(), applicationId: id, data: { ...s, how: how(s.how), position: j } }));
  });
  t.tasks.forEach((x, i) => ops.push({ op: "task.create", id: newId(), data: { label: x.label, dueDate: x.dueDate, track: x.track, applicationId: x.app ? appIds.get(x.app) ?? null : null, how: how(x.how), done: x.done, position: i } }));
  t.pieces.forEach((p, i) => ops.push({ op: "piece.create", id: newId(), data: { label: p.label, who: p.who, note: p.note, status: p.status, link: p.link, how: how(p.how), documentId: (p.key && pieceDoc.get(p.key)) || null, position: i } }));
  t.threads.forEach((h, i) => {
    const id = thIds.get(h.key)!;
    ops.push({ op: "thread.create", id, data: { title: h.title, recipient: h.recipient, subject: h.subject, body: h.body, kind: h.kind, sentAt: h.sentAt, applicationId: h.app ? appIds.get(h.app) ?? null : null, position: i, attachmentIds: h.attachments.map((p) => docIds.get(p)).filter((x): x is string => !!x) } });
    h.messages.forEach((m) => ops.push({ op: "message.create", id: newId(), threadId: id, data: m }));
  });
  return ops;
}
