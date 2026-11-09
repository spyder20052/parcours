import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, rateLimit, requireUser, route } from "@/server/guard";
import { AI_MODELS, deleteAiKey, saveAiSettings } from "@/server/ai";

const Body = z.object({
  key: z.string().trim().min(20).max(300).regex(/^sk-ant-[A-Za-z0-9_-]+$/, "clé de l'API Claude attendue").optional(),
  model: z.enum(AI_MODELS.map((m) => m.id) as [string, ...string[]]),
});

export const PUT = route(async (req) => {
  await assertSameOrigin();
  const user = await requireUser();
  await rateLimit(`aiset:${user.id}`, 20, 3600);
  const b = Body.parse(await req.json());
  await saveAiSettings(user, b.key, b.model as never);
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async () => {
  await assertSameOrigin();
  await deleteAiKey(await requireUser());
  return NextResponse.json({ ok: true });
});
