import { redirect } from "next/navigation";
import { pageUser } from "@/server/session";
import Admin from "@/components/Admin";

export const metadata = { title: "Administration · Parcours" };

export default async function AdminPage() {
  const user = await pageUser();
  if (user.role !== "admin") redirect("/");
  return <Admin meId={user.id} />;
}
