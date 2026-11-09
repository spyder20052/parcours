import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireUser } from "@/server/guard";
import { decrypt } from "@/server/crypto";
import { msEnv, OAUTH_COOKIE } from "@/server/outlook-env";
import { connectOutlook } from "@/server/outlook";

export const maxDuration = 30;

/** Retour de Microsoft : vérifie l'état et le propriétaire, échange le code, puis renvoie aux réglages. */
export async function GET(req: Request) {
  const back = (r: string) => NextResponse.redirect(new URL(`/reglages?outlook=${r}`, msEnv().appUrl));
  const jar = await cookies();
  const box = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/api/outlook" });
  try {
    const user = await requireUser();
    const q = new URL(req.url).searchParams;
    if (q.get("error")) return back(q.get("error") === "access_denied" ? "refus" : "erreur");
    const code = q.get("code"), state = q.get("state");
    if (!box || !code || !state || code.length > 4000) return back("erreur");
    const s = JSON.parse(decrypt(box, "outlook-oauth")) as { state: string; verifier: string; uid: string; exp: number };
    if (s.state !== state || s.uid !== user.id || s.exp < Date.now()) return back("erreur");
    await connectOutlook(user.id, code, s.verifier);
    return back("ok");
  } catch (e) {
    console.error("Connexion Outlook échouée", e instanceof Error ? e.message : "");
    return back("erreur");
  }
}
