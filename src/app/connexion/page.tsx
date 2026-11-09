import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import LoginForm from "@/components/LoginForm";

export const metadata = { title: "Connexion · Parcours" };

const ERRORS: Record<string, string> = {
  lien: "Ce lien a expiré ou a déjà servi. Demande-en un nouveau.",
  google: "Connexion Google impossible. Cette adresse a-t-elle reçu une invitation ?",
  invitation: "Cette adresse n'a pas d'invitation valide.",
};

export default async function Connexion({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const s = await auth.api.getSession({ headers: await headers() });
  if (s) redirect("/");
  const q = await searchParams;
  const email = typeof q.email === "string" ? q.email.slice(0, 254) : "";
  const code = typeof q.erreur === "string" ? q.erreur : typeof q.error === "string" ? "lien" : "";
  return <LoginForm email={email} error={ERRORS[code] ?? ""} google={!!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)} />;
}
