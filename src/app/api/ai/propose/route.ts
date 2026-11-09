import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, HttpError, rateLimit, requireUser, route } from "@/server/guard";
import { loadWorkspace } from "@/server/workspace";
import { propose } from "@/server/ai";

const Body = z.object({
  prompt: z.string().trim().min(1).max(20000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(12).default([]),
});

export const POST = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`ai:${user.id}`, 40, 3600);
  const b = Body.parse(await req.json());
  const data = await loadWorkspace(user);
  if (!data) throw new HttpError(409, "Aucun espace.");
  return NextResponse.json(await propose(user, data, b.prompt, b.history));
});
