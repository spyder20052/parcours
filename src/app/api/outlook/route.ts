import { NextResponse } from "next/server";
import { assertSameOrigin, rateLimit, requireUser, route } from "@/server/guard";
import { disconnectOutlook, mailStatus } from "@/server/outlook";

/** État de la connexion Outlook de la personne. */
export const GET = route(async () => {
  const user = await requireUser();
  return NextResponse.json(await mailStatus(user.id), { headers: { "cache-control": "no-store" } });
});

export const DELETE = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`outlookdel:${user.id}`, 10, 3600);
  await disconnectOutlook(user.id);
  return NextResponse.json({ ok: true });
});
