import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin, HttpError, requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";
import { deleteObject, headObject, MAX_BYTES, readHead, sniff } from "@/server/storage";

const Body = z.object({ id: z.uuid(), pieceId: z.uuid().nullable(), sha256: z.string().regex(/^[a-f0-9]{64}$/).nullable() });

/** Vérifie le fichier réellement reçu (taille, nature par ses premiers octets) avant de le rendre visible. */
export const POST = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  const b = Body.parse(await req.json());
  const doc = await withUser(user.id, async (tx) => (await tx.select().from(t.document).where(and(eq(t.document.id, b.id), eq(t.document.status, "pending"))))[0]);
  if (!doc) throw new HttpError(404, "Envoi introuvable.");
  const reject = async (msg: string) => {
    await deleteObject(doc.objectKey).catch(() => undefined);
    await withUser(user.id, (tx) => tx.delete(t.document).where(eq(t.document.id, doc.id)));
    throw new HttpError(422, msg);
  };
  const head = await headObject(doc.objectKey).catch(() => null);
  if (!head) return reject("Fichier non reçu par le stockage.");
  if (head.size > MAX_BYTES || head.size !== doc.sizeBytes) await reject("Taille du fichier inattendue.");
  if (sniff(await readHead(doc.objectKey)) !== doc.mime) await reject("Le contenu du fichier ne correspond pas à son type.");
  await withUser(user.id, async (tx) => {
    await tx.update(t.document).set({ status: "ready", sha256: b.sha256 }).where(eq(t.document.id, doc.id));
    if (b.pieceId) {
      const r = await tx.update(t.piece).set({ documentId: doc.id, status: "recue" }).where(eq(t.piece.id, b.pieceId));
      if (!r.rowCount) throw new HttpError(404, "Pièce introuvable.");
    }
  });
  return NextResponse.json({ ok: true });
});
