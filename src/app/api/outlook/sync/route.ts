import { NextResponse } from "next/server";
import { assertSameOrigin, rateLimit, requireUser, route } from "@/server/guard";
import { syncInbox } from "@/server/outlook";

export const maxDuration = 60;

/** Vérifie la boîte de réception maintenant et rattache les réponses à leurs échanges. */
export const POST = route(async () => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`mailsync:${user.id}`, 20, 600);
  return NextResponse.json({ added: await syncInbox(user.id) });
});
