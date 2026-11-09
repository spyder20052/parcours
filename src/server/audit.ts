import "server-only";
import { systemDb } from "./db";
import { auditLog } from "./schema";

/** Journal d'audit : action et détail minimal, jamais d'adresse IP ni de contenu personnel. */
export async function audit(ownerId: string | null, action: string, detail: Record<string, unknown> = {}) {
  await systemDb.insert(auditLog).values({ ownerId, action, detail }).catch(() => undefined);
}
