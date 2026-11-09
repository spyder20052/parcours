import { NextResponse } from "next/server";
import { z } from "zod";
import { OpsSchema } from "@/lib/ops";
import { assertSameOrigin, rateLimit, requireUser, route } from "@/server/guard";
import { applyOps } from "@/server/workspace";

export const POST = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`ops:${user.id}`, 240, 60);
  const { ops } = z.object({ ops: OpsSchema }).parse(await req.json());
  await applyOps(user, ops);
  return NextResponse.json({ ok: true });
});
