import "server-only";
import { asc, eq, inArray } from "drizzle-orm";
import { ConfigSchema, type WorkspaceData } from "@/lib/model";
import type { Op } from "@/lib/ops";
import { HttpError, type SessionUser } from "./guard";
import { withUser, type Tx } from "./db";
import * as t from "./schema";
import { deleteObject } from "./storage";
import { randomUUID } from "node:crypto";
import { TEMPLATES } from "@/lib/templates";
import { templateOps } from "@/lib/template";
import { outlookAvailable } from "./outlook-env";

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export async function getWorkspaceId(tx: Tx): Promise<string | null> {
  const rows = await tx.select({ id: t.workspace.id }).from(t.workspace).orderBy(asc(t.workspace.createdAt)).limit(1);
  return rows[0]?.id ?? null;
}

export async function loadWorkspace(user: SessionUser): Promise<WorkspaceData | null> {
  return withUser(user.id, async (tx) => {
    const ws = (await tx.select().from(t.workspace).orderBy(asc(t.workspace.createdAt)).limit(1))[0];
    if (!ws) return null;
    const apps = await tx.select().from(t.application).where(eq(t.application.workspaceId, ws.id)).orderBy(asc(t.application.position));
    const steps = apps.length ? await tx.select().from(t.step).where(inArray(t.step.applicationId, apps.map((a) => a.id))).orderBy(asc(t.step.position)) : [];
    const tasks = await tx.select().from(t.task).where(eq(t.task.workspaceId, ws.id)).orderBy(asc(t.task.position));
    const pieces = await tx.select().from(t.piece).where(eq(t.piece.workspaceId, ws.id)).orderBy(asc(t.piece.position));
    const docs = await tx.select().from(t.document).where(eq(t.document.workspaceId, ws.id)).orderBy(asc(t.document.createdAt));
    const threads = await tx.select().from(t.thread).where(eq(t.thread.workspaceId, ws.id)).orderBy(asc(t.thread.position));
    const msgs = threads.length ? await tx.select().from(t.threadMessage).where(inArray(t.threadMessage.threadId, threads.map((x) => x.id))).orderBy(asc(t.threadMessage.createdAt)) : [];
    const mc = (await tx.select({ email: t.mailConnection.accountEmail, lastSyncAt: t.mailConnection.lastSyncAt }).from(t.mailConnection))[0];
    return {
      workspace: { id: ws.id, name: ws.name, template: ws.template, config: ConfigSchema.parse(ws.config) },
      applications: apps.map((a) => ({
        id: a.id, university: a.university, program: a.program, longTitle: a.longTitle, tier: a.tier, variant: a.variant, stage: a.stage,
        conditions: a.conditions, channel: a.channel, procedureUrl: a.procedureUrl, programUrl: a.programUrl, notes: a.notes, formText: a.formText, position: a.position,
        steps: steps.filter((s) => s.applicationId === a.id).map((s) => ({
          id: s.id, applicationId: s.applicationId, label: s.label, kind: s.kind, dueDate: s.dueDate, isTarget: s.isTarget, note: s.note,
          how: (s.how as never) ?? null, doneAt: iso(s.doneAt), position: s.position,
        })),
      })),
      tasks: tasks.map((x) => ({ id: x.id, applicationId: x.applicationId, track: x.track, label: x.label, dueDate: x.dueDate, how: (x.how as never) ?? null, doneAt: iso(x.doneAt), position: x.position })),
      pieces: pieces.map((p) => ({ id: p.id, label: p.label, status: p.status, who: p.who, note: p.note, link: p.link, how: (p.how as never) ?? null, documentId: p.documentId, position: p.position })),
      documents: docs.filter((d) => d.status === "ready").map((d) => ({
        id: d.id, folder: d.folder, title: d.title, subtitle: d.subtitle, applicationId: d.applicationId, tag: d.tag, mime: d.mime, sizeBytes: d.sizeBytes,
        sensitive: d.sensitive, warning: d.warning, status: d.status, createdAt: d.createdAt.toISOString(),
      })),
      threads: threads.map((h) => ({
        id: h.id, applicationId: h.applicationId, title: h.title, recipient: h.recipient, subject: h.subject, body: h.body, kind: h.kind, sentAt: h.sentAt, position: h.position,
        attachmentIds: h.attachmentIds ?? [], viaOutlook: !!h.mailConversationId,
        messages: msgs.filter((m) => m.threadId === h.id).map((m) => ({ id: m.id, threadId: m.threadId, direction: m.direction as "in" | "out", rawText: m.rawText, receivedOn: m.receivedOn })),
      })),
      me: { id: user.id, name: user.name, email: user.email, role: user.role },
      mail: { available: outlookAvailable(), connected: !!mc, email: mc?.email ?? null, lastSyncAt: iso(mc?.lastSyncAt ?? null) },
    };
  });
}

const done = (v: boolean | undefined) => (v === undefined ? undefined : v ? new Date() : null);
function stepRow(d: Record<string, unknown>) {
  const { done: dn, ...rest } = d as { done?: boolean };
  return { ...rest, ...(dn === undefined ? {} : { doneAt: done(dn) }) };
}

/** Lit l'état actuel des lignes visées pour produire les opérations inverses (annulation). */
async function inverseOf(tx: Tx, op: Op): Promise<Op[]> {
  const pick = <T extends Record<string, unknown>>(row: T, keys: string[]) => Object.fromEntries(keys.map((k) => [k, row[k]]));
  switch (op.op) {
    case "workspace.update": {
      const ws = (await tx.select().from(t.workspace).limit(1))[0];
      return [{ op: "workspace.update", patch: pick({ name: ws.name, config: ws.config }, Object.keys(op.patch)) as never }];
    }
    case "application.create": return [{ op: "application.delete", id: op.id }];
    case "step.create": return [{ op: "step.delete", id: op.id }];
    case "task.create": return [{ op: "task.delete", id: op.id }];
    case "piece.create": return [{ op: "piece.delete", id: op.id }];
    case "thread.create": return [{ op: "thread.delete", id: op.id }];
    case "message.create": return [{ op: "message.delete", id: op.id }];
    case "application.update": case "application.delete": {
      const a = (await tx.select().from(t.application).where(eq(t.application.id, op.id)))[0];
      if (!a) return [];
      const keys = ["university", "program", "longTitle", "tier", "variant", "stage", "conditions", "channel", "procedureUrl", "programUrl", "notes", "formText", "position"];
      if (op.op === "application.update") return [{ op: "application.update", id: op.id, patch: pick(a, Object.keys(op.patch)) as never }];
      const steps = await tx.select().from(t.step).where(eq(t.step.applicationId, op.id));
      return [
        { op: "application.create", id: a.id, data: pick(a, keys) as never },
        ...steps.map((s) => ({ op: "step.create" as const, id: s.id, applicationId: a.id, data: { ...pick(s, ["label", "kind", "dueDate", "isTarget", "note", "how", "position"]), done: !!s.doneAt } as never })),
      ];
    }
    case "step.update": case "step.delete": {
      const s = (await tx.select().from(t.step).where(eq(t.step.id, op.id)))[0];
      if (!s) return [];
      const full = { ...s, done: !!s.doneAt } as Record<string, unknown>;
      if (op.op === "step.update") return [{ op: "step.update", id: op.id, patch: pick(full, Object.keys(op.patch)) as never }];
      return [{ op: "step.create", id: s.id, applicationId: s.applicationId, data: pick(full, ["label", "kind", "dueDate", "isTarget", "note", "how", "done", "position"]) as never }];
    }
    case "task.update": case "task.delete": {
      const x = (await tx.select().from(t.task).where(eq(t.task.id, op.id)))[0];
      if (!x) return [];
      const full = { ...x, done: !!x.doneAt } as Record<string, unknown>;
      if (op.op === "task.update") return [{ op: "task.update", id: op.id, patch: pick(full, Object.keys(op.patch)) as never }];
      return [{ op: "task.create", id: x.id, data: pick(full, ["applicationId", "track", "label", "dueDate", "how", "done", "position"]) as never }];
    }
    case "piece.update": case "piece.delete": {
      const p = (await tx.select().from(t.piece).where(eq(t.piece.id, op.id)))[0];
      if (!p) return [];
      if (op.op === "piece.update") return [{ op: "piece.update", id: op.id, patch: pick(p, Object.keys(op.patch)) as never }];
      return [{ op: "piece.create", id: p.id, data: pick(p, ["label", "status", "who", "note", "link", "how", "documentId", "position"]) as never }];
    }
    case "thread.update": case "thread.delete": {
      const h = (await tx.select().from(t.thread).where(eq(t.thread.id, op.id)))[0];
      if (!h) return [];
      if (op.op === "thread.update") return [{ op: "thread.update", id: op.id, patch: pick(h, Object.keys(op.patch)) as never }];
      const ms = await tx.select().from(t.threadMessage).where(eq(t.threadMessage.threadId, op.id));
      return [
        { op: "thread.create", id: h.id, data: pick(h, ["applicationId", "title", "recipient", "subject", "body", "kind", "sentAt", "position", "attachmentIds"]) as never },
        ...ms.map((m) => ({ op: "message.create" as const, id: m.id, threadId: h.id, data: { direction: m.direction as "in" | "out", rawText: m.rawText, receivedOn: m.receivedOn, ...(m.externalId ? { externalId: m.externalId } : {}) } })),
      ];
    }
    case "message.delete": {
      const m = (await tx.select().from(t.threadMessage).where(eq(t.threadMessage.id, op.id)))[0];
      return m ? [{ op: "message.create", id: m.id, threadId: m.threadId, data: { direction: m.direction as "in" | "out", rawText: m.rawText, receivedOn: m.receivedOn, ...(m.externalId ? { externalId: m.externalId } : {}) } }] : [];
    }
    case "document.update": {
      const d = (await tx.select().from(t.document).where(eq(t.document.id, op.id)))[0];
      return d ? [{ op: "document.update", id: op.id, patch: pick(d, Object.keys(op.patch)) as never }] : [];
    }
    case "document.delete": return [];
  }
}

export async function applyOne(tx: Tx, userId: string, wsId: string, op: Op, objectsToDelete: string[]) {
  const owner = { ownerId: userId };
  const check = (n: number) => { if (n === 0) throw new HttpError(404, "Élément introuvable."); };
  switch (op.op) {
    case "workspace.update":
      await tx.update(t.workspace).set({ ...op.patch, updatedAt: new Date() }).where(eq(t.workspace.id, wsId)); return;
    case "application.create":
      await tx.insert(t.application).values({ ...op.data, ...owner, id: op.id, workspaceId: wsId }); return;
    case "application.update":
      check((await tx.update(t.application).set(op.patch).where(eq(t.application.id, op.id))).rowCount ?? 0); return;
    case "application.delete":
      check((await tx.delete(t.application).where(eq(t.application.id, op.id))).rowCount ?? 0); return;
    case "step.create":
      await tx.insert(t.step).values({ ...(stepRow(op.data) as typeof op.data & { label: string }), ...owner, id: op.id, applicationId: op.applicationId } as never); return;
    case "step.update":
      check((await tx.update(t.step).set(stepRow(op.patch)).where(eq(t.step.id, op.id))).rowCount ?? 0); return;
    case "step.delete":
      check((await tx.delete(t.step).where(eq(t.step.id, op.id))).rowCount ?? 0); return;
    case "task.create":
      await tx.insert(t.task).values({ ...stepRow(op.data), ...owner, id: op.id, workspaceId: wsId } as never); return;
    case "task.update":
      check((await tx.update(t.task).set(stepRow(op.patch)).where(eq(t.task.id, op.id))).rowCount ?? 0); return;
    case "task.delete":
      check((await tx.delete(t.task).where(eq(t.task.id, op.id))).rowCount ?? 0); return;
    case "piece.create":
      await tx.insert(t.piece).values({ ...op.data, ...owner, id: op.id, workspaceId: wsId }); return;
    case "piece.update":
      check((await tx.update(t.piece).set(op.patch).where(eq(t.piece.id, op.id))).rowCount ?? 0); return;
    case "piece.delete":
      check((await tx.delete(t.piece).where(eq(t.piece.id, op.id))).rowCount ?? 0); return;
    case "thread.create":
      await tx.insert(t.thread).values({ ...op.data, ...owner, id: op.id, workspaceId: wsId }); return;
    case "thread.update":
      check((await tx.update(t.thread).set(op.patch).where(eq(t.thread.id, op.id))).rowCount ?? 0); return;
    case "thread.delete":
      check((await tx.delete(t.thread).where(eq(t.thread.id, op.id))).rowCount ?? 0); return;
    case "message.create":
      await tx.insert(t.threadMessage).values({ ...op.data, ...owner, id: op.id, threadId: op.threadId }); return;
    case "message.delete":
      check((await tx.delete(t.threadMessage).where(eq(t.threadMessage.id, op.id))).rowCount ?? 0); return;
    case "document.update":
      check((await tx.update(t.document).set(op.patch).where(eq(t.document.id, op.id))).rowCount ?? 0); return;
    case "document.delete": {
      const d = (await tx.delete(t.document).where(eq(t.document.id, op.id)).returning({ key: t.document.objectKey }))[0];
      if (!d) throw new HttpError(404, "Élément introuvable.");
      objectsToDelete.push(d.key); return;
    }
  }
}

/** Applique une liste d'opérations en une transaction, sous RLS. Renvoie les opérations inverses. */
export async function applyOps(user: SessionUser, ops: Op[]): Promise<Op[]> {
  const objects: string[] = [];
  const inverse = await withUser(user.id, async (tx) => {
    const wsId = await getWorkspaceId(tx);
    if (!wsId) throw new HttpError(409, "Aucun espace : choisis d'abord un modèle.");
    const inv: Op[] = [];
    for (const op of ops) {
      inv.unshift(...(await inverseOf(tx, op)));
      await applyOne(tx, user.id, wsId, op, objects);
    }
    return inv;
  });
  for (const key of objects) await deleteObject(key).catch(() => undefined);
  return inverse;
}

/** Crée l'espace de l'utilisateur à partir d'un modèle, en une seule transaction. */
export async function createWorkspace(user: SessionUser, templateId: string) {
  const tpl = TEMPLATES[templateId];
  if (!tpl) throw new HttpError(404, "Modèle inconnu.");
  await withUser(user.id, async (tx) => {
    if (await getWorkspaceId(tx)) throw new HttpError(409, "Ton espace existe déjà.");
    const [ws] = await tx.insert(t.workspace).values({ ownerId: user.id, name: tpl.config.appTitle, template: tpl.id, config: tpl.config }).returning({ id: t.workspace.id });
    const objects: string[] = [];
    for (const op of templateOps(tpl, randomUUID)) await applyOne(tx, user.id, ws.id, op, objects);
  });
}
