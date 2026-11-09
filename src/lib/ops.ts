// Toute modification d'un espace passe par ces opérations : l'interface, l'import et l'assistant IA
// utilisent le même vocabulaire, validé ici avant d'atteindre la base.
import { z } from "zod";
import { ConfigSchema, HowSchema, PIECE_STATUSES, THREAD_KINDS } from "./model";

const uuid = z.uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const txt = (n: number) => z.string().max(n);
const url = z.string().max(600).refine((v) => v === "" || /^https?:\/\//i.test(v), "lien http ou https");
const slug = z.string().regex(/^[a-z0-9_-]{1,40}$/);

const ApplicationFields = z.object({
  university: txt(120).min(1), program: txt(160).min(1), longTitle: txt(300), tier: slug, variant: txt(80), stage: slug,
  conditions: txt(2000), channel: txt(200), procedureUrl: url, programUrl: url, notes: txt(5000), formText: txt(8000), position: z.number().int().min(0).max(10000),
});
const StepFields = z.object({
  label: txt(200).min(1), kind: slug, dueDate: date, isTarget: z.boolean(), note: txt(1000), how: HowSchema.nullable(), done: z.boolean(), position: z.number().int().min(0).max(10000),
});
const TaskFields = z.object({
  applicationId: uuid.nullable(), track: slug.nullable(), label: txt(200).min(1), dueDate: date, how: HowSchema.nullable(), done: z.boolean(), position: z.number().int().min(0).max(10000),
});
const PieceFields = z.object({
  label: txt(200).min(1), status: z.enum(PIECE_STATUSES), who: txt(80), note: txt(500), link: url, how: HowSchema.nullable(), documentId: uuid.nullable(), position: z.number().int().min(0).max(10000),
});
const ThreadFields = z.object({
  applicationId: uuid.nullable(), title: txt(200).min(1), recipient: txt(500), subject: txt(300), body: txt(20000), kind: z.enum(THREAD_KINDS), sentAt: date, position: z.number().int().min(0).max(10000),
  attachmentIds: z.array(uuid).max(20),
});
const DocumentFields = z.object({
  folder: slug, title: txt(200).min(1), subtitle: txt(300), applicationId: uuid.nullable(), tag: txt(40), sensitive: z.boolean(), warning: txt(120),
});

export const OpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("workspace.update"), patch: z.object({ name: txt(80).min(1), config: ConfigSchema }).partial() }),
  z.object({ op: z.literal("application.create"), id: uuid, data: ApplicationFields.partial().required({ university: true, program: true }) }),
  z.object({ op: z.literal("application.update"), id: uuid, patch: ApplicationFields.partial() }),
  z.object({ op: z.literal("application.delete"), id: uuid }),
  z.object({ op: z.literal("step.create"), id: uuid, applicationId: uuid, data: StepFields.partial().required({ label: true }) }),
  z.object({ op: z.literal("step.update"), id: uuid, patch: StepFields.partial() }),
  z.object({ op: z.literal("step.delete"), id: uuid }),
  z.object({ op: z.literal("task.create"), id: uuid, data: TaskFields.partial().required({ label: true }) }),
  z.object({ op: z.literal("task.update"), id: uuid, patch: TaskFields.partial() }),
  z.object({ op: z.literal("task.delete"), id: uuid }),
  z.object({ op: z.literal("piece.create"), id: uuid, data: PieceFields.partial().required({ label: true }) }),
  z.object({ op: z.literal("piece.update"), id: uuid, patch: PieceFields.partial() }),
  z.object({ op: z.literal("piece.delete"), id: uuid }),
  z.object({ op: z.literal("thread.create"), id: uuid, data: ThreadFields.partial().required({ title: true }) }),
  z.object({ op: z.literal("thread.update"), id: uuid, patch: ThreadFields.partial() }),
  z.object({ op: z.literal("thread.delete"), id: uuid }),
  z.object({ op: z.literal("message.create"), id: uuid, threadId: uuid, data: z.object({ direction: z.enum(["in", "out"]), rawText: txt(50000).min(1), receivedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), externalId: txt(400).optional() }) }),
  z.object({ op: z.literal("message.delete"), id: uuid }),
  z.object({ op: z.literal("document.update"), id: uuid, patch: DocumentFields.partial() }),
  z.object({ op: z.literal("document.delete"), id: uuid }),
]);
export type Op = z.infer<typeof OpSchema>;
export const OpsSchema = z.array(OpSchema).min(1).max(200);
