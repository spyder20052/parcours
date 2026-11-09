import { readFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { APIRequestContext, Page } from "@playwright/test";

export const BASE = "http://localhost:3000";
export const ADMIN = process.env.ADMIN_EMAIL ?? "admin@parcours.test";
const mailFile = (email: string) => join(process.cwd(), ".dev-mail", `${email.replace(/[^a-z0-9@._-]/gi, "_")}.json`);

/** Requête de mutation avec l'en-tête Origin attendu par l'application. */
export const post = (r: APIRequestContext, path: string, data: unknown, method = "POST") =>
  r.fetch(path, { method, data, headers: { origin: BASE, "content-type": "application/json" } });

/** Connexion par lien magique : en développement, l'e-mail est écrit dans .dev-mail/. */
export async function login(page: Page, email: string) {
  const f = mailFile(email);
  if (existsSync(f)) rmSync(f);
  const r = await post(page.request, "/api/auth/sign-in/magic-link", { email, callbackURL: "/" });
  if (!r.ok()) throw new Error(`magic link: ${r.status()}`);
  for (let i = 0; i < 40 && !existsSync(f); i++) await page.waitForTimeout(150);
  const url = JSON.parse(readFileSync(f, "utf8")).text.match(/http\S+/)[0];
  await page.goto(url);
}

/** Choisit un modèle si l'espace n'existe pas encore. */
export async function ensureWorkspace(page: Page, template = "vide") {
  const r = await page.request.get("/api/workspace");
  if ((await r.json()).data) return;
  const c = await post(page.request, "/api/workspace/init", { template });
  if (!c.ok()) throw new Error(`init: ${c.status()}`);
}
