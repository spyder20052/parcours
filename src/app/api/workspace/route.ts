import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";
import { deleteObject } from "@/server/storage";
import { loadWorkspace } from "@/server/workspace";

export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json({ data: await loadWorkspace(user) }, { headers: { "cache-control": "no-store" } });
});

/** Repartir de zéro : supprime l'espace, ses données et ses fichiers. Le compte reste. */
export const DELETE = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  const { confirm } = z.object({ confirm: z.literal("EFFACER") }).parse(await req.json());
  void confirm;
  const keys = await withUser(user.id, async (tx) => {
    const k = (await tx.select({ k: t.document.objectKey }).from(t.document)).map((r) => r.k);
    await tx.delete(t.workspace);
    return k;
  });
  for (const k of keys) await deleteObject(k).catch(() => undefined);
  return NextResponse.json({ ok: true });
});
