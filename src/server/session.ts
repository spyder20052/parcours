import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import type { SessionUser } from "./guard";

/** Pour les pages : renvoie l'utilisateur ou redirige vers la connexion. */
export async function pageUser(): Promise<SessionUser> {
  const s = await auth.api.getSession({ headers: await headers() });
  const u = s?.user as (SessionUser & { disabledAt?: Date | null }) | undefined;
  if (!u || u.disabledAt) redirect("/connexion");
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? "user" };
}
