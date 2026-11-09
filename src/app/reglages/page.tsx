import { pageUser } from "@/server/session";
import { loadWorkspace } from "@/server/workspace";
import { aiStatus } from "@/server/ai";
import { mailStatus } from "@/server/outlook";
import Settings from "@/components/Settings";

export const metadata = { title: "Réglages · Parcours" };

export default async function Reglages({ searchParams }: { searchParams: Promise<{ outlook?: string }> }) {
  const user = await pageUser();
  const data = await loadWorkspace(user);
  const back = (await searchParams).outlook ?? null;
  return <Settings me={user} config={data ? JSON.stringify(data.workspace.config, null, 2) : null} ai={await aiStatus(user)} mail={await mailStatus(user.id)} outlookResult={back} />;
}
