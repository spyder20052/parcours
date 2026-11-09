import { requireUser, rateLimit, route } from "@/server/guard";
import { loadWorkspace } from "@/server/workspace";

/** Export de toutes les données de l'espace, au format JSON (les fichiers se téléchargent depuis Documents). */
export const GET = route(async () => {
  const user = await requireUser();
  await rateLimit(`export:${user.id}`, 20, 3600);
  const data = await loadWorkspace(user);
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), format: "parcours/1", data }, null, 2);
  return new Response(body, { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="parcours-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" } });
});
