import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, rateLimit, requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";
import { readObject } from "@/server/storage";
import { attachmentName } from "@/lib/mail";

/**
 * Renvoie les octets d'un document depuis la même origine, en pièce jointe, pour l'enregistrer puis le glisser dans un courriel.
 * Le navigateur lit ce flux sans contrôle d'origine (CSP connect-src 'self') ; le fichier appartient à l'utilisateur (RLS).
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  await rateLimit(`filedl:${user.id}`, 300, 600);
  const id = z.uuid().parse((await ctx.params).id);
  const doc = await withUser(user.id, async (tx) => (await tx.select().from(t.document).where(and(eq(t.document.id, id), eq(t.document.status, "ready"))))[0]);
  if (!doc) throw new HttpError(404, "Document introuvable.");
  const bytes = await readObject(doc.objectKey);
  const name = attachmentName(doc.title, doc.mime);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new Response(body, {
    headers: {
      "content-type": doc.mime,
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "content-length": String(bytes.byteLength),
      "cache-control": "no-store",
    },
  });
});
