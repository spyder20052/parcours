// Applique les migrations SQL de db/migrations dans l'ordre, une seule fois chacune.
// Usage : npm run db:migrate (lit DATABASE_URL, rôle propriétaire).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())");
  const done = new Set((await client.query("select name from schema_migration")).rows.map((r) => r.name));
  const dir = join(process.cwd(), "db", "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query("insert into schema_migration(name) values ($1)", [file]);
      await client.query("commit");
      console.log("appliquée :", file);
    } catch (e) {
      await client.query("rollback");
      throw e;
    }
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
