import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, rateLimit, requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";
import { downloadUrl, URL_TTL } from "@/server/storage";

/** URL de lecture signée de 5 minutes, produite seulement si le document appartient à l'utilisateur (RLS). */
export const GET = route<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireUser();
  await rateLimit(`fileurl:${user.id}`, 600, 600);
  const id = z.uuid().parse((await ctx.params).id);
  const doc = await withUser(user.id, async (tx) => (await tx.select().from(t.document).where(and(eq(t.document.id, id), eq(t.document.status, "ready"))))[0]);
  if (!doc) throw new HttpError(404, "Document introuvable.");
  const ext = { "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" }[doc.mime] ?? "";
  return NextResponse.json({ url: await downloadUrl(doc.objectKey, doc.title + ext, doc.mime), ttl: URL_TTL }, { headers: { "cache-control": "no-store" } });
});
