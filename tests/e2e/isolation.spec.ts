import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { ADMIN, BASE, ensureWorkspace, login, post } from "./helpers";

// Une seule connexion administrateur pour tout le fichier : la connexion par lien est limitée à 4 par 10 minutes.
test.describe.configure({ mode: "serial" });
let admin: Page;
test.beforeAll(async ({ browser }) => {
  admin = await (await browser.newContext()).newPage();
  await login(admin, ADMIN);
  await ensureWorkspace(admin);
});

// Deux comptes : B ne doit rien voir ni rien toucher de A, même en appelant l'API directement.
test("cloisonnement entre deux comptes", async ({ browser }) => {
  // L'administrateur invite deux comptes neufs : A et B.
  const aEmail = `a-${Date.now()}@parcours.test`, bEmail = `b-${Date.now()}@parcours.test`;
  for (const e of [aEmail, bEmail]) expect((await post(admin.request, "/api/admin/invitations", { email: e })).ok()).toBe(true);

  const a = await (await browser.newContext()).newPage();
  await login(a, aEmail);
  await ensureWorkspace(a, "eiffel-2027-master");
  const appId = randomUUID(), uni = `Université A ${Date.now()}`;
  expect((await post(a.request, "/api/ops", { ops: [{ op: "application.create", id: appId, data: { university: uni, program: "Master", tier: "prio", stage: "prepare" } }] })).ok()).toBe(true);

  // Un PDF de A, envoyé par le même chemin que l'interface.
  const pdf = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF");
  const up = await (await post(a.request, "/api/files/upload-url", { name: "a.pdf", mime: "application/pdf", size: pdf.length, folder: "divers", applicationId: appId, title: "Pièce de A" })).json();
  expect((await a.request.fetch(up.url, { method: "PUT", data: pdf, headers: { "content-type": "application/pdf" } })).ok()).toBe(true);
  expect((await post(a.request, "/api/files/confirm", { id: up.id, pieceId: null, sha256: null })).ok()).toBe(true);
  expect((await a.request.get(`/api/files/${up.id}/url`)).ok()).toBe(true);

  // B se connecte et crée son propre espace.
  const b = await (await browser.newContext()).newPage();
  await login(b, bEmail);
  await expect(b.getByRole("heading", { name: /Bienvenue/ })).toBeVisible();
  await ensureWorkspace(b, "vide");

  const ws = await (await b.request.get("/api/workspace")).json();
  expect(JSON.stringify(ws)).not.toContain(uni);
  expect(ws.data.applications).toHaveLength(0);
  expect((await b.request.get(`/api/files/${up.id}/url`)).status()).toBe(404);
  expect((await post(b.request, "/api/ops", { ops: [{ op: "application.update", id: appId, patch: { notes: "piraté" } }] })).status()).toBe(404);
  expect((await post(b.request, "/api/ops", { ops: [{ op: "application.delete", id: appId }] })).status()).toBe(404);
  expect((await post(b.request, "/api/files/confirm", { id: up.id, pieceId: null, sha256: null })).status()).toBe(404);
  // B n'est pas administrateur.
  expect((await b.request.get("/api/admin/users")).status()).toBe(403);

  // Les données de A sont intactes.
  const wa = await (await a.request.get("/api/workspace")).json();
  expect(wa.data.applications.find((x: { id: string }) => x.id === appId).notes).toBe("");
});

test("protections de l'API", async ({ request }) => {
  const page = admin;
  expect((await request.get("/api/workspace")).status()).toBe(401);
  // Une adresse non invitée ne reçoit rien et ne peut pas créer de compte.
  const r = await post(request, "/api/auth/sign-in/magic-link", { email: `inconnu-${Date.now()}@parcours.test`, callbackURL: "/" });
  expect(r.ok()).toBe(true);
  const evil = await page.request.fetch("/api/ops", { method: "POST", data: { ops: [{ op: "workspace.update", patch: { name: "x" } }] }, headers: { origin: "https://evil.example", "content-type": "application/json" } });
  expect(evil.status()).toBe(403);
  const bad = await post(page.request, "/api/ops", { ops: [{ op: "application.update", id: "pas-un-uuid", patch: {} }] });
  expect(bad.status()).toBe(400);
  // Un fichier dont le contenu ne correspond pas au type annoncé est refusé.
  const fake = Buffer.from("<html>pas un pdf</html>");
  const up = await (await post(page.request, "/api/files/upload-url", { name: "x.pdf", mime: "application/pdf", size: fake.length, folder: "divers", applicationId: null, title: "Faux" })).json();
  await page.request.fetch(up.url, { method: "PUT", data: fake, headers: { "content-type": "application/pdf" } });
  expect((await post(page.request, "/api/files/confirm", { id: up.id, pieceId: null, sha256: null })).status()).toBe(422);
});

test("en-têtes de sécurité", async ({ request }) => {
  const r = await request.get("/connexion");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'/);
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  void BASE;
});
