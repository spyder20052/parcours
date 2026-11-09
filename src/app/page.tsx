import { pageUser } from "@/server/session";
import { loadWorkspace } from "@/server/workspace";
import { TEMPLATE_LIST } from "@/lib/templates";
import Tracker from "@/components/Tracker";
import Onboarding from "@/components/Onboarding";

export default async function Home() {
  const user = await pageUser();
  const data = await loadWorkspace(user);
  if (!data) return <Onboarding name={user.name || user.email} templates={TEMPLATE_LIST} />;
  return <Tracker data={data} />;
}
