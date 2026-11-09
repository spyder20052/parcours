// Vérifie le cloisonnement au niveau de PostgreSQL, sans passer par l'application.
// Nécessite la base locale : npm run db:up && npm run db:migrate
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "pg";

const url = process.env.DATABASE_URL ?? "postgres://parcours_owner:parcours_local@localhost:5433/parcours";
const db = new Client({ connectionString: url });
const A = "test-user-a-" + Date.now();
const B = "test-user-b-" + Date.now();
let wsA = "";
let appA = "";

async function as<T>(user: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("begin");
  try {
    await db.query("set local role parcours_app");
    if (user) await db.query("select set_config('app.user_id', $1, true)", [user]);
    const r = await fn();
    await db.query("commit");
    return r;
  } catch (e) {
    await db.query("rollback");
    throw e;
  }
}

beforeAll(async () => {
  await db.connect();
  for (const id of [A, B]) {
    await db.query(`insert into "user"(id, name, email) values ($1, $1, $1 || '@test.local')`, [id]);
  }
  await as(A, async () => {
    wsA = (await db.query(`insert into workspace(owner_id, name, config) values ($1, 'A', '{}') returning id`, [A])).rows[0].id;
    appA = (await db.query(`insert into application(owner_id, workspace_id, university, program) values ($1, $2, 'U', 'P') returning id`, [A, wsA])).rows[0].id;
    await db.query(`insert into step(owner_id, application_id, label) values ($1, $2, 'S')`, [A, appA]);
  });
});

afterAll(async () => {
  await db.query(`delete from "user" where id in ($1, $2)`, [A, B]);
  await db.end();
});

describe("cloisonnement PostgreSQL", () => {
  it("A voit ses propres lignes", async () => {
    const n = await as(A, async () => (await db.query("select count(*)::int as n from application")).rows[0].n);
    expect(n).toBe(1);
  });

  it("B ne voit aucune ligne de A, dans aucune table", async () => {
    for (const t of ["workspace", "application", "step"]) {
      const n = await as(B, async () => (await db.query(`select count(*)::int as n from ${t}`)).rows[0].n);
      expect(n, t).toBe(0);
    }
  });

  it("sans utilisateur fixé, rien n'est visible", async () => {
    const n = await as(null, async () => (await db.query("select count(*)::int as n from application")).rows[0].n);
    expect(n).toBe(0);
  });

  it("B ne peut ni modifier ni supprimer une ligne de A", async () => {
    const upd = await as(B, async () => (await db.query("update application set university = 'pirate' where id = $1", [appA])).rowCount);
    const del = await as(B, async () => (await db.query("delete from application where id = $1", [appA])).rowCount);
    expect(upd).toBe(0);
    expect(del).toBe(0);
    const still = await as(A, async () => (await db.query("select university from application where id = $1", [appA])).rows[0].university);
    expect(still).toBe("U");
  });

  it("B ne peut pas écrire une ligne au nom de A", async () => {
    await expect(as(B, () => db.query(`insert into workspace(owner_id, name, config) values ($1, 'x', '{}')`, [A]))).rejects.toThrow();
  });

  it("B ne peut pas rattacher sa ligne à l'espace de A", async () => {
    await expect(as(B, () => db.query(`insert into application(owner_id, workspace_id, university, program) values ($1, $2, 'U', 'P')`, [B, wsA]))).rejects.toThrow();
  });

  it("la connexion Outlook de A reste invisible et intouchable pour B", async () => {
    await as(A, () => db.query(`insert into mail_connection(owner_id, account_email, encrypted_tokens, access_expires_at) values ($1, 'a@x.fr', 'v1.x.y.z', now())`, [A]));
    expect(await as(B, async () => (await db.query("select count(*)::int as n from mail_connection")).rows[0].n)).toBe(0);
    expect(await as(B, async () => (await db.query("update mail_connection set account_email = 'pirate' where owner_id = $1", [A])).rowCount)).toBe(0);
    await expect(as(B, () => db.query(`insert into mail_connection(owner_id, account_email, encrypted_tokens, access_expires_at) values ($1, 'b@x.fr', 'v1', now())`, [A]))).rejects.toThrow();
    expect(await as(A, async () => (await db.query("select count(*)::int as n from mail_connection")).rows[0].n)).toBe(1);
  });

  it("le rôle applicatif ne peut pas lire l'annuaire des abonnements Outlook", async () => {
    await expect(as(B, () => db.query("select * from mail_subscription"))).rejects.toThrow();
  });

  it("le rôle applicatif ne peut pas lire les sessions ni les comptes", async () => {
    await expect(as(B, () => db.query("select * from session"))).rejects.toThrow();
    await expect(as(B, () => db.query("select * from account"))).rejects.toThrow();
  });
});
