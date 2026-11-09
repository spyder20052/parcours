// Modèle partagé entre le navigateur, le serveur et l'assistant.
// La configuration d'un espace décrit le parcours : la modifier ne demande aucun changement de code.
import { z } from "zod";

const id = z.string().regex(/^[a-z0-9_-]{1,40}$/, "identifiant : minuscules, chiffres, - ou _");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date au format AAAA-MM-JJ");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const short = (n: number) => z.string().trim().max(n);

/** Mode d'emploi d'une étape, d'une tâche ou d'une pièce. `use` : boutons [type, libellé, valeur]. */
export const HowSchema = z.object({
  t: short(200).min(1),
  why: short(1000).default(""),
  how: z.array(short(600)).max(12).default([]),
  use: z.array(z.tuple([z.enum(["th", "doc", "kdoc", "url", "folder", "piecesgo", "open", "copy"]), short(80), short(500)])).max(6).default([]),
});
export type How = z.infer<typeof HowSchema>;

export const STAGE_ROLES = ["start", "contact", "submitted", "shortlisted", "unique", "dropped"] as const;

export const ConfigSchema = z.object({
  version: z.literal(1),
  appTitle: short(80).min(1),
  stages: z.array(z.object({
    id, label: short(40).min(1), bg: color, fg: color,
    role: z.enum(STAGE_ROLES).optional(),
    empty: short(160).optional(),
  })).min(2).max(10),
  tiers: z.array(z.object({ id, label: short(30).min(1) })).min(1).max(5),
  stepKinds: z.array(z.object({ id, label: short(30).min(1), lane: z.enum(["courriels", "depots", "reponses"]) })).min(1).max(10),
  views: z.array(z.enum(["canvas", "cal", "board", "docs", "mail"])).min(1),
  milestones: z.array(z.object({ id, label: short(60).min(1), sub: short(120).default(""), date: isoDate, kind: z.enum(["gate", "result", "info"]) })).max(10).default([]),
  gate: z.object({ label: short(40), dialog: short(600), uniqueRule: short(300) }).optional(),
  tracks: z.array(z.object({ id, label: short(40).min(1), sub: short(60).default("") })).max(4).default([]),
  piecesTarget: isoDate.optional(),
  folders: z.array(z.object({ id, label: short(60).min(1), tone: z.enum(["", "hot", "warn"]).default(""), note: short(300).default("") })).max(20).default([]),
  canvasTip: short(400).default(""),
});
export type Config = z.infer<typeof ConfigSchema>;

export type Step = { id: string; applicationId: string; label: string; kind: string; dueDate: string | null; isTarget: boolean; note: string; how: How | null; doneAt: string | null; position: number };
export type Application = {
  id: string; university: string; program: string; longTitle: string; tier: string; variant: string; stage: string;
  conditions: string; channel: string; procedureUrl: string; programUrl: string; notes: string; formText: string; position: number; steps: Step[];
};
export type Task = { id: string; applicationId: string | null; track: string | null; label: string; dueDate: string | null; how: How | null; doneAt: string | null; position: number };
export type Piece = { id: string; label: string; status: string; who: string; note: string; link: string; how: How | null; documentId: string | null; position: number };
export type Doc = { id: string; folder: string; title: string; subtitle: string; applicationId: string | null; tag: string; mime: string; sizeBytes: number; sensitive: boolean; warning: string; status: string; createdAt: string };
export type Message = { id: string; threadId: string; direction: "in" | "out"; rawText: string; receivedOn: string };
export type Thread = { id: string; applicationId: string | null; title: string; recipient: string; subject: string; body: string; kind: string; sentAt: string | null; position: number; attachmentIds: string[]; viaOutlook: boolean; messages: Message[] };
export type Me = { id: string; name: string; email: string; role: string };
/** Boîte Outlook reliée : `available` dit si le serveur est configuré pour Outlook. */
export type MailStatus = { available: boolean; connected: boolean; email: string | null; lastSyncAt: string | null };
export type WorkspaceData = {
  workspace: { id: string; name: string; template: string | null; config: Config };
  applications: Application[]; tasks: Task[]; pieces: Piece[]; documents: Doc[]; threads: Thread[]; me: Me; mail: MailStatus;
};

export const PIECE_STATUSES = ["attendue", "demandee", "certifier", "recue"] as const;
export const THREAD_KINDS = ["premier_contact", "question", "relance", "reponse", "connu", "note"] as const;
