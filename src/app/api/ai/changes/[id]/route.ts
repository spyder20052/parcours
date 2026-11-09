import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { OpsSchema } from "@/lib/ops";
import { assertSameOrigin, HttpError, requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";
import { applyOps } from "@/server/workspace";
import { audit } from "@/server/audit";

/** Applique (action "apply") ou annule (action "undo") un changement proposé par l'assistant. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const id = z.uuid().parse((await ctx.params).id);
  const { action } = z.object({ action: z.enum(["apply", "undo"]) }).parse(await req.json());
  const ch = await withUser(user.id, async (tx) => (await tx.select().from(t.aiChange).where(eq(t.aiChange.id, id)))[0]);
  if (!ch) throw new HttpError(404, "Changement introuvable.");
  if (action === "apply") {
    if (ch.appliedAt) throw new HttpError(409, "Ce changement est déjà appliqué.");
    const inverse = await applyOps(user, OpsSchema.parse(ch.operations));
    await withUser(user.id, (tx) => tx.update(t.aiChange).set({ appliedAt: new Date(), inverse }).where(eq(t.aiChange.id, id)));
    await audit(user.id, "ai.apply", { ops: (ch.operations as unknown[]).length });
  } else {
    if (!ch.appliedAt || ch.revertedAt || !ch.inverse) throw new HttpError(409, "Rien à annuler.");
    const inv = OpsSchema.safeParse(ch.inverse);
    if (inv.success) await applyOps(user, inv.data);
    await withUser(user.id, (tx) => tx.update(t.aiChange).set({ revertedAt: new Date() }).where(eq(t.aiChange.id, id)));
    await audit(user.id, "ai.undo");
  }
  return NextResponse.json({ ok: true });
});
