import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, rateLimit, requireUser, route } from "@/server/guard";
import { createWorkspace } from "@/server/workspace";
import { TEMPLATES } from "@/lib/templates";

const Body = z.object({ template: z.enum(Object.keys(TEMPLATES) as [string, ...string[]]) });

export const POST = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`init:${user.id}`, 10, 3600);
  const { template } = Body.parse(await req.json());
  await createWorkspace(user, template);
  return NextResponse.json({ ok: true });
});
