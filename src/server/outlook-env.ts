import "server-only";

/** Réglages de l'application Microsoft (Entra ID). Sans eux, Outlook n'apparaît pas dans l'interface. */
export const msEnv = () => ({
  clientId: process.env.MS_CLIENT_ID ?? "",
  clientSecret: process.env.MS_CLIENT_SECRET ?? "",
  tenant: process.env.MS_TENANT || "common",
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, ""),
});
/** Cookie de la connexion en cours : état et vérificateur PKCE, chiffrés. */
export const OAUTH_COOKIE = "parcours_ms_oauth";
export const outlookAvailable = () => { const e = msEnv(); return !!(e.clientId && e.clientSecret); };
/** Les notifications de Graph n'atteignent qu'une adresse publique en HTTPS. */
export const canReceiveNotifications = () => msEnv().appUrl.startsWith("https://");
