import { Client } from "pg";
import { readFileSync } from "node:fs";

/** Avant les tests : remet à zéro les compteurs de débit, uniquement sur une base locale. */
export default async function globalSetup() {
  const env = Object.fromEntries(readFileSync(".env.local", "utf8").split("\n").filter((l) => /^\w+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  const url = process.env.DATABASE_URL ?? env.DATABASE_URL;
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error("Les tests de bout en bout ne tournent que sur une base locale.");
  const c = new Client({ connectionString: url });
  await c.connect();
  await c.query("delete from rate_limit; delete from app_rate_limit;");
  await c.end();
}
