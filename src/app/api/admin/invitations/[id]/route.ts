import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin, requireAdmin, route } from "@/server/guard";
import { systemDb } from "@/server/db";
import * as t from "@/server/schema";
import { audit } from "@/server/audit";

export const DELETE = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  const id = z.uuid().parse((await ctx.params).id);
  await systemDb.update(t.invitation).set({ revokedAt: new Date() }).where(eq(t.invitation.id, id));
  await audit(admin.id, "invitation.revoke");
  return NextResponse.json({ ok: true });
});
