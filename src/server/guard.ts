import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { auth } from "./auth";
import { systemDb } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export type SessionUser = { id: string; name: string; email: string; role: string };

/** Utilisateur connecté et actif, sinon erreur 401. */
export async function requireUser(): Promise<SessionUser> {
  const s = await auth.api.getSession({ headers: await headers() });
  const u = s?.user as (SessionUser & { disabledAt?: Date | null }) | undefined;
  if (!u || u.disabledAt) throw new HttpError(401, "Connexion requise.");
  return { id: u.id, name: u.name, email: u.email, role: u.role ?? "user" };
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") throw new HttpError(403, "Accès réservé à l'administrateur.");
  return u;
}

/** Refuse toute mutation qui ne vient pas de l'application elle-même. */
export async function assertSameOrigin() {
  const h = await headers();
  const origin = h.get("origin");
  const app = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
  if (!origin || origin !== app) throw new HttpError(403, "Origine refusée.");
  if (h.get("sec-fetch-site") && !["same-origin", "none"].includes(h.get("sec-fetch-site")!)) throw new HttpError(403, "Origine refusée.");
}

/** Compteur simple en base : `max` requêtes par fenêtre de `windowSec` secondes. */
export async function rateLimit(key: string, max: number, windowSec: number) {
  const r = await systemDb.execute<{ count: number }>(sql`
    insert into app_rate_limit(key, count, reset_at) values (${key}, 1, now() + make_interval(secs => ${windowSec}))
    on conflict (key) do update set
      count = case when app_rate_limit.reset_at < now() then 1 else app_rate_limit.count + 1 end,
      reset_at = case when app_rate_limit.reset_at < now() then now() + make_interval(secs => ${windowSec}) else app_rate_limit.reset_at end
    returning count`);
  if (Number(r.rows[0]?.count ?? 0) > max) throw new HttpError(429, "Trop de requêtes. Réessaie dans quelques minutes.");
}

/** Enveloppe commune des routes API : erreurs propres, aucune fuite de détail interne. */
export function route<T>(fn: (req: Request, ctx: T) => Promise<Response>) {
  return async (req: Request, ctx: T) => {
    try {
      return await fn(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      if (e && typeof e === "object" && "issues" in e) return NextResponse.json({ error: "Données invalides." }, { status: 400 });
      console.error(e);
      return NextResponse.json({ error: "Erreur interne." }, { status: 500 });
    }
  };
}
