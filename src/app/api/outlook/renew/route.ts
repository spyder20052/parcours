import { NextResponse } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";
import { renewAll } from "@/server/outlook";

export const maxDuration = 300;

/** Tâche planifiée (Vercel Cron) : prolonge les abonnements Outlook et vérifie chaque boîte. Protégée par CRON_SECRET. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const h = (s: string) => createHash("sha256").update(s).digest();
  const given = req.headers.get("authorization") ?? "";
  if (secret.length < 16 || !timingSafeEqual(h(given), h(`Bearer ${secret}`))) return new Response(null, { status: 401 });
  return NextResponse.json(await renewAll());
}
