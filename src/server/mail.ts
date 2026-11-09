import "server-only";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Resend } from "resend";

type Mail = { to: string; subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function magicLinkMail(to: string, url: string): Mail {
  return {
    to,
    subject: "Ton lien de connexion",
    text: `Bonjour,\n\nVoici ton lien de connexion, valable 10 minutes et utilisable une seule fois :\n${url}\n\nSi tu n'as rien demandé, ignore ce message.`,
    html: `<p>Bonjour,</p><p>Voici ton lien de connexion, valable 10 minutes et utilisable une seule fois :</p><p><a href="${esc(url)}">Me connecter</a></p><p>Si tu n'as rien demandé, ignore ce message.</p>`,
  };
}

export function invitationMail(to: string, appUrl: string, inviter: string): Mail {
  const url = `${appUrl}/connexion?email=${encodeURIComponent(to)}`;
  return {
    to,
    subject: "Invitation à suivre tes candidatures",
    text: `Bonjour,\n\n${inviter} t'invite à utiliser Parcours pour suivre tes candidatures. Connecte-toi avec cette adresse e-mail ou avec Google :\n${url}\n\nL'invitation expire dans 7 jours.`,
    html: `<p>Bonjour,</p><p>${esc(inviter)} t'invite à utiliser Parcours pour suivre tes candidatures. Connecte-toi avec cette adresse e-mail ou avec Google.</p><p><a href="${esc(url)}">Ouvrir Parcours</a></p><p>L'invitation expire dans 7 jours.</p>`,
  };
}

/** Sans clé Resend (développement), l'e-mail est écrit dans le terminal et dans .dev-mail/. */
export async function sendMail(mail: Mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") throw new Error("RESEND_API_KEY manquant");
    const dir = join(process.cwd(), ".dev-mail");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${mail.to.replace(/[^a-z0-9@._-]/gi, "_")}.json`), JSON.stringify({ ...mail, at: new Date().toISOString() }, null, 2));
    console.log(`\n[e-mail de développement] à ${mail.to} : ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const resend = new Resend(key);
  const { error } = await resend.emails.send({ from: process.env.MAIL_FROM ?? "Parcours <onboarding@resend.dev>", to: mail.to, subject: mail.subject, text: mail.text, html: mail.html });
  if (error) throw new Error("envoi de l'e-mail impossible");
}
