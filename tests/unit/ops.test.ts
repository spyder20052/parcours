// Modèles de parcours et annulation : chaque opération appliquée doit pouvoir être défaite exactement.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { OpsSchema } from "@/lib/ops";
import { TEMPLATES } from "@/lib/templates";
import { templateOps } from "@/lib/template";
import { systemDb } from "@/server/db";
import * as t from "@/server/schema";
import { applyOps, createWorkspace, loadWorkspace } from "@/server/workspace";

const user = { id: "test-ops-" + Date.now(), name: "Test", email: `ops-${Date.now()}@test.local`, role: "user" };

describe("modèles", () => {
  for (const tpl of Object.values(TEMPLATES)) {
    it(`${tpl.id} produit des opérations valides`, () => {
      const ops = templateOps(tpl, randomUUID);
      if (ops.length) expect(OpsSchema.safeParse(ops).success).toBe(true);
      // Les boutons d'échange et de candidature pointent vers des identifiants créés par le modèle.
      const ids = new Set(ops.map((o) => ("id" in o ? o.id : "")));
      for (const o of ops) {
        const how = "data" in o && o.data && "how" in o.data ? o.data.how : null;
        how?.use.filter(([ty]) => ty === "th" || ty === "open").forEach(([, , v]) => expect(ids.has(v)).toBe(true));
      }
    });
  }
});

describe("annulation", () => {
  beforeAll(async () => {
    const now = new Date();
    await systemDb.insert(t.user).values({ id: user.id, name: user.name, email: user.email, emailVerified: true, createdAt: now, updatedAt: now });
    await createWorkspace(user, "eiffel-2027-master");
  });
  afterAll(async () => { await systemDb.delete(t.user).where(eq(t.user.id, user.id)); });

  const snapshot = async () => {
    const d = (await loadWorkspace(user))!;
    return JSON.stringify({ c: d.workspace.config, a: d.applications, t: d.tasks.map((x) => ({ ...x, doneAt: !!x.doneAt })), p: d.pieces, h: d.threads });
  };

  it("une création, une modification et une suppression se défont", async () => {
    const before = await snapshot();
    const app = randomUUID(), step = randomUUID();
    const inv1 = await applyOps(user, OpsSchema.parse([
      { op: "application.create", id: app, data: { university: "U", program: "P", tier: "prio", stage: "prepare" } },
      { op: "step.create", id: step, applicationId: app, data: { label: "Dépôt", kind: "depot", dueDate: "2026-12-01" } },
    ]));
    const mid = await snapshot();
    const d = (await loadWorkspace(user))!;
    const cfg = { ...d.workspace.config, appTitle: "Autre titre" };
    const inv2 = await applyOps(user, OpsSchema.parse([
      { op: "step.update", id: step, patch: { done: true, dueDate: "2026-12-05" } },
      { op: "workspace.update", patch: { config: cfg } },
      { op: "task.update", id: d.tasks[0].id, patch: { done: true, label: "Changée" } },
      { op: "piece.delete", id: d.pieces[0].id },
    ]));
    expect(await snapshot()).not.toBe(mid);
    await applyOps(user, inv2);
    expect(await snapshot()).toBe(mid);
    await applyOps(user, OpsSchema.parse(inv1));
    expect(await snapshot()).toBe(before);
  });

  it("la suppression d'une candidature se défait avec ses étapes", async () => {
    const d = (await loadWorkspace(user))!;
    const app = randomUUID();
    await applyOps(user, [{ op: "application.create", id: app, data: { university: "V", program: "Q", tier: "opt", stage: "prepare" } },
      { op: "step.create", id: randomUUID(), applicationId: app, data: { label: "Contact", kind: "contact", dueDate: null } }]);
    const mid = await snapshot();
    const inv = await applyOps(user, [{ op: "application.delete", id: app }]);
    expect((await loadWorkspace(user))!.applications.find((a) => a.id === app)).toBeUndefined();
    await applyOps(user, inv);
    expect(await snapshot()).toBe(mid);
    void d;
  });
});
