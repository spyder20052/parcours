import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin, HttpError, requireAdmin, route } from "@/server/guard";
import { systemDb } from "@/server/db";
import * as t from "@/server/schema";
import { audit } from "@/server/audit";

/** Suspend ou réactive un compte. La suspension ferme aussitôt toutes ses sessions. */
export const PATCH = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const id = z.string().min(1).max(100).parse((await ctx.params).id);
  const { disabled } = z.object({ disabled: z.boolean() }).parse(await req.json());
  if (id === admin.id) throw new HttpError(400, "Tu ne peux pas suspendre ton propre compte.");
  await systemDb.transaction(async (tx) => {
    await tx.update(t.user).set({ disabledAt: disabled ? new Date() : null }).where(eq(t.user.id, id));
    if (disabled) await tx.delete(t.session).where(eq(t.session.userId, id));
  });
  await audit(admin.id, disabled ? "user.disable" : "user.enable", { target: id });
  return NextResponse.json({ ok: true });
});
