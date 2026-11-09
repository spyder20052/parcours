import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin, HttpError, rateLimit, requireUser, route } from "@/server/guard";
import { systemDb, withUser } from "@/server/db";
import * as t from "@/server/schema";
import { deleteObject } from "@/server/storage";
import { audit } from "@/server/audit";

/** Modifie le nom affiché. */
export const PATCH = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { name } = z.object({ name: z.string().trim().min(1).max(80) }).parse(await req.json());
  await systemDb.update(t.user).set({ name, updatedAt: new Date() }).where(eq(t.user.id, user.id));
  return NextResponse.json({ ok: true });
});

/** Suppression définitive : fichiers du stockage, puis compte (les données suivent par cascade). */
export const DELETE = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`delete:${user.id}`, 5, 3600);
  const { confirm } = z.object({ confirm: z.string() }).parse(await req.json());
  if (confirm.trim().toLowerCase() !== user.email.toLowerCase()) throw new HttpError(400, "Recopie ton adresse e-mail pour confirmer.");
  if (user.role === "admin") {
    const admins = await systemDb.select({ id: t.user.id }).from(t.user).where(eq(t.user.role, "admin"));
    if (admins.length <= 1) throw new HttpError(400, "Tu es le seul administrateur : supprime ce compte depuis la base, ou nomme d'abord un autre administrateur.");
  }
  const keys = await withUser(user.id, async (tx) => (await tx.select({ k: t.document.objectKey }).from(t.document)).map((r) => r.k));
  for (const k of keys) await deleteObject(k).catch(() => undefined);
  await systemDb.delete(t.user).where(eq(t.user.id, user.id));
  await audit(null, "account.delete");
  return NextResponse.json({ ok: true });
});
