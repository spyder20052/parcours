import { NextResponse } from "next/server";
import { asc } from "drizzle-orm";
import { requireAdmin, route } from "@/server/guard";
import { systemDb } from "@/server/db";
import * as t from "@/server/schema";

export const GET = route(async () => {
  await requireAdmin();
  const users = await systemDb.select({ id: t.user.id, name: t.user.name, email: t.user.email, role: t.user.role, disabledAt: t.user.disabledAt, createdAt: t.user.createdAt }).from(t.user).orderBy(asc(t.user.createdAt));
  return NextResponse.json({ users });
});
