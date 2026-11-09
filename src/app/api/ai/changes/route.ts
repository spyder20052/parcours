import { NextResponse } from "next/server";
import { desc, isNotNull } from "drizzle-orm";
import { requireUser, route } from "@/server/guard";
import { withUser } from "@/server/db";
import * as t from "@/server/schema";

/** Derniers changements appliqués par l'assistant, pour pouvoir les annuler. */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await withUser(user.id, (tx) => tx.select({ id: t.aiChange.id, summary: t.aiChange.summary, appliedAt: t.aiChange.appliedAt, revertedAt: t.aiChange.revertedAt })
    .from(t.aiChange).where(isNotNull(t.aiChange.appliedAt)).orderBy(desc(t.aiChange.appliedAt)).limit(10));
  return NextResponse.json({ changes: rows });
});
