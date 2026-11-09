import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, rateLimit, requireUser, route } from "@/server/guard";
import { sendThread } from "@/server/outlook";

export const maxDuration = 120;

/** Envoie un échange depuis Outlook, avec ses pièces jointes. Une seule tentative par minute et par échange. */
export const POST = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  await assertSameOrigin();
  const user = await requireUser();
  const id = z.uuid().parse((await ctx.params).id);
  await rateLimit(`send:${user.id}`, 30, 3600);
  await rateLimit(`sendth:${id}`, 1, 60);
  return NextResponse.json(await sendThread(user.id, id));
});
