import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pool?: Pool };

function pool() {
  if (!globalForDb.pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL manquant");
    globalForDb.pool = new Pool({ connectionString: url, max: 5 });
  }
  return globalForDb.pool;
}

/**
 * Connexion du rôle propriétaire. Réservée à l'authentification et à l'administration.
 * Les tables métier y restent protégées par FORCE ROW LEVEL SECURITY : sans withUser, elles sont invisibles.
 */
export const systemDb: NodePgDatabase<typeof schema> = drizzle(pool(), { schema });

export type Tx = Parameters<Parameters<typeof systemDb.transaction>[0]>[0];

/**
 * Seule porte d'accès aux données d'un utilisateur. Ouvre une transaction sous le rôle parcours_app
 * et fixe app.user_id : PostgreSQL ne renvoie et n'accepte alors que les lignes de cet utilisateur.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!userId) throw new Error("utilisateur requis");
  return systemDb.transaction(async (tx) => {
    await tx.execute(sql`set local role parcours_app`);
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}
