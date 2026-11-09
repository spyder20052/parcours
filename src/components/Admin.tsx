"use client";
import Link from "next/link";
import { useEffect, useState } from "react";

type Inv = { id: string; email: string; createdAt: string; expiresAt: string; usedAt: string | null; revokedAt: string | null };
type U = { id: string; name: string; email: string; role: string; disabledAt: string | null; createdAt: string };
const fd = (s: string) => new Date(s).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

async function call(path: string, method = "GET", body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Action impossible.");
  return j;
}
const invState = (i: Inv) => i.usedAt ? "Acceptée" : i.revokedAt ? "Révoquée" : new Date(i.expiresAt) < new Date() ? "Expirée" : "En attente";

export default function Admin({ meId }: { meId: string }) {
  const [inv, setInv] = useState<Inv[]>([]);
  const [users, setUsers] = useState<U[]>([]);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    Promise.all([call("/api/admin/invitations"), call("/api/admin/users")])
      .then(([a, b]) => { setInv(a.invitations); setUsers(b.users); })
      .catch((e) => setMsg({ ok: false, t: e.message }));
  }, [tick]);
  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ ok: true, t: ok }); setTick((n) => n + 1); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); }
  };

  return (
    <main className="set">
      <div className="set-in">
        <div className="set-top"><h1>Administration</h1><a className="btn" href="/reglages">Réglages</a><Link className="btn lime" href="/">Retour à mon suivi</Link></div>
        <section className="set-card" aria-labelledby="a-inv">
          <h2 id="a-inv">Inviter quelqu&apos;un</h2>
          <p className="meta">La personne reçoit un e-mail et peut créer son compte pendant 7 jours, par lien e-mail ou avec Google, avec cette adresse uniquement. Elle a son propre espace : tu ne vois pas ses données.</p>
          <form className="set-row" onSubmit={(e) => { e.preventDefault(); act(async () => { await call("/api/admin/invitations", "POST", { email }); setEmail(""); }, "Invitation envoyée."); }}>
            <input className="inp" type="email" required maxLength={254} aria-label="Adresse e-mail à inviter" placeholder="prenom@exemple.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <button className="btn lime">Envoyer l&apos;invitation</button>
          </form>
          {msg && <p className="note-c" role={msg.ok ? "status" : "alert"} style={{ marginTop: 10, background: msg.ok ? undefined : "var(--rose)" }}>{msg.t}</p>}
          {inv.length > 0 && (
            <table className="tbl" style={{ marginTop: 14 }}>
              <thead><tr><th>Adresse</th><th className="hide-s">Envoyée</th><th>État</th><th /></tr></thead>
              <tbody>{inv.map((i) => (
                <tr key={i.id}><td>{i.email}</td><td className="hide-s">{fd(i.createdAt)}</td><td>{invState(i)}</td>
                  <td>{invState(i) === "En attente" && <button className="mini-btn" onClick={() => act(() => call(`/api/admin/invitations/${i.id}`, "DELETE"), "Invitation révoquée.")}>Révoquer</button>}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
        <section className="set-card" aria-labelledby="a-users">
          <h2 id="a-users">Comptes</h2>
          <p className="meta">Suspendre un compte ferme aussitôt ses sessions. Ses données restent, cloisonnées.</p>
          <table className="tbl">
            <thead><tr><th>Nom</th><th className="hide-s">Adresse</th><th>Depuis</th><th /></tr></thead>
            <tbody>{users.map((u) => (
              <tr key={u.id}><td>{u.name || "—"}{u.role === "admin" ? " (admin)" : ""}{u.disabledAt ? " · suspendu" : ""}</td><td className="hide-s">{u.email}</td><td>{fd(u.createdAt)}</td>
                <td>{u.id !== meId && <button className="mini-btn" onClick={() => act(() => call(`/api/admin/users/${u.id}`, "PATCH", { disabled: !u.disabledAt }), u.disabledAt ? "Compte réactivé." : "Compte suspendu.")}>{u.disabledAt ? "Réactiver" : "Suspendre"}</button>}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
