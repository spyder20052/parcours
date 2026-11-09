"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { Tower } from "./Onboarding";

export default function LoginForm({ email: initial, error, google }: { email: string; error: string; google: boolean }) {
  const [email, setEmail] = useState(initial);
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [err, setErr] = useState(error);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState("busy"); setErr("");
    const r = await authClient.signIn.magicLink({ email: email.trim(), callbackURL: "/", errorCallbackURL: "/connexion?erreur=lien" });
    if (r.error && r.error.status === 429) { setErr("Trop de demandes. Réessaie dans quelques minutes."); setState("idle"); return; }
    setState("sent");
  }
  async function withGoogle() {
    setErr("");
    await authClient.signIn.social({ provider: "google", callbackURL: "/", errorCallbackURL: "/connexion?erreur=google" });
  }

  return (
    <main className="solo">
      <div className="solo-card">
        <span className="logo" aria-hidden="true"><Tower /></span>
        <h1>Parcours</h1>
        <p className="meta solo-lead">Ton espace privé pour suivre tes candidatures. L&apos;accès se fait sur invitation.</p>
        {state === "sent" ? (
          <div className="note-c" role="status">
            <b>Regarde ta boîte de réception.</b> Si {email} a été invitée, un lien de connexion vient de partir. Il reste valable 10 minutes et ne sert qu&apos;une fois.
            <div className="acts" style={{ marginTop: 10 }}><button className="btn" onClick={() => setState("idle")}>Utiliser une autre adresse</button></div>
          </div>
        ) : (
          <form onSubmit={send}>
            <label className="fld" htmlFor="email">Adresse e-mail</label>
            <input className="inp" id="email" type="email" required autoComplete="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" />
            <div className="acts" style={{ marginTop: 12 }}>
              <button className="btn lime" type="submit" disabled={state === "busy"}>{state === "busy" ? "Envoi…" : "Recevoir un lien de connexion"}</button>
            </div>
          </form>
        )}
        {google && state !== "sent" && (
          <>
            <p className="solo-or"><span>ou</span></p>
            <button className="btn solo-google" onClick={withGoogle}>
              <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z" /><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1.1.7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9h-4v3.1A12 12 0 0 0 12 24z" /><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8z" /><path fill="#EA4335" d="M12 4.8c1.7 0 3.3.6 4.5 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z" /></svg>
              Continuer avec Google
            </button>
          </>
        )}
        {err && <p className="note-c" role="alert" style={{ background: "var(--rose)", marginTop: 12 }}>{err}</p>}
        <p className="meta solo-foot">Aucune donnée n&apos;est partagée entre les comptes. Le code de la plateforme est ouvert.</p>
      </div>
    </main>
  );
}
