import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin, HttpError, rateLimit, requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";
import { getWorkspaceId } from "@/server/workspace";
import { ALLOWED_MIME, deleteObject, MAX_BYTES, uploadUrl } from "@/server/storage";

const Body = z.object({
  name: z.string().max(255),
  mime: z.enum(ALLOWED_MIME),
  size: z.number().int().min(1).max(MAX_BYTES),
  folder: z.string().regex(/^[a-z0-9_-]{1,40}$/),
  applicationId: z.uuid().nullable(),
  title: z.string().trim().min(1).max(200),
});

/** Réserve une ligne « en attente » et renvoie une URL d'envoi signée de 5 minutes. */
export const POST = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`upload:${user.id}`, 60, 3600);
  const b = Body.parse(await req.json());
  const id = randomUUID();
  const key = `u/${user.id}/${randomUUID()}`;
  const stale = await withUser(user.id, async (tx) => {
    // Envois abandonnés depuis plus d'une heure : on les efface.
    const old = await tx.delete(t.document).where(and(eq(t.document.status, "pending"), lt(t.document.createdAt, new Date(Date.now() - 3600_000)))).returning({ k: t.document.objectKey });
    const wsId = await getWorkspaceId(tx);
    if (!wsId) throw new HttpError(409, "Aucun espace.");
    if (b.applicationId && !(await tx.select({ id: t.application.id }).from(t.application).where(eq(t.application.id, b.applicationId))).length) throw new HttpError(404, "Candidature introuvable.");
    await tx.insert(t.document).values({ id, ownerId: user.id, workspaceId: wsId, applicationId: b.applicationId, folder: b.folder, title: b.title, objectKey: key, mime: b.mime, sizeBytes: b.size, status: "pending" });
    return old.map((r) => r.k);
  });
  for (const k of stale) await deleteObject(k).catch(() => undefined);
  return NextResponse.json({ id, url: await uploadUrl(key, b.mime, b.size) });
});
