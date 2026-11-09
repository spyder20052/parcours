import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { HttpError, rateLimit, requireUser, route } from "@/server/guard";
import { encrypt } from "@/server/crypto";
import { msEnv, OAUTH_COOKIE, outlookAvailable } from "@/server/outlook-env";
import { authorizeUrl, pkcePair } from "@/server/outlook";

/** Démarre la connexion à Outlook : état et vérificateur PKCE chiffrés dans un cookie de 10 minutes, puis Microsoft. */
export const GET = route(async () => {
  const user = await requireUser();
  if (!outlookAvailable()) throw new HttpError(404, "Outlook n'est pas configuré sur ce serveur.");
  await rateLimit(`outlookconnect:${user.id}`, 10, 600);
  const state = randomBytes(24).toString("base64url");
  const { verifier, challenge } = pkcePair();
  (await cookies()).set(OAUTH_COOKIE, encrypt(JSON.stringify({ state, verifier, uid: user.id, exp: Date.now() + 600_000 }), "outlook-oauth"), {
    httpOnly: true, secure: msEnv().appUrl.startsWith("https://"), sameSite: "lax", path: "/api/outlook", maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(state, challenge));
});
