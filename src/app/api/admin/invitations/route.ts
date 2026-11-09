import { NextResponse } from "next/server";
import { desc, sql } from "drizzle-orm";
import { z } from "zod";
import { assertSameOrigin, HttpError, rateLimit, requireAdmin, route } from "@/server/guard";
import { systemDb } from "@/server/db";
import * as t from "@/server/schema";
import { invitationMail, sendMail } from "@/server/mail";
import { audit } from "@/server/audit";

export const GET = route(async () => {
  await requireAdmin();
  const rows = await systemDb.select().from(t.invitation).orderBy(desc(t.invitation.createdAt)).limit(200);
  return NextResponse.json({ invitations: rows });
});

/** Invite une adresse : elle pourra créer son compte pendant 7 jours, par lien e-mail ou Google. */
export const POST = route(async (req) => {
  await assertSameOrigin();
  const admin = await requireAdmin();
  await rateLimit(`invite:${admin.id}`, 30, 3600);
  const email = z.object({ email: z.email().max(254) }).parse(await req.json()).email.trim().toLowerCase();
  const exists = await systemDb.select({ id: t.user.id }).from(t.user).where(sql`lower(${t.user.email}) = ${email}`).limit(1);
  if (exists.length) throw new HttpError(409, "Cette adresse a déjà un compte.");
  await systemDb.update(t.invitation).set({ revokedAt: new Date() }).where(sql`lower(${t.invitation.email}) = ${email} and ${t.invitation.usedAt} is null and ${t.invitation.revokedAt} is null`);
  await systemDb.insert(t.invitation).values({ email, invitedBy: admin.id, expiresAt: new Date(Date.now() + 7 * 864e5) });
  await sendMail(invitationMail(email, process.env.APP_URL ?? "http://localhost:3000", admin.name || admin.email));
  await audit(admin.id, "invitation.create");
  return NextResponse.json({ ok: true });
});
