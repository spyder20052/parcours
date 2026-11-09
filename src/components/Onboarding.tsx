"use client";
import { useState } from "react";

type T = { id: string; name: string; description: string };

export default function Onboarding({ name, templates }: { name: string; templates: T[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  async function choose(id: string) {
    setBusy(id); setErr("");
    const r = await fetch("/api/workspace/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ template: id }) });
    if (r.ok) { location.reload(); return; }
    setErr((await r.json().catch(() => ({}))).error ?? "Création impossible.");
    setBusy(null);
  }
  return (
    <main className="solo">
      <div className="solo-card wide">
        <span className="logo" aria-hidden="true"><Tower /></span>
        <h1>Bienvenue, {name.split(/[\s@]/)[0]}</h1>
        <p className="meta solo-lead">Choisis un point de départ. Tout reste modifiable ensuite : colonnes, étapes, pièces, textes, à la main ou avec l&apos;assistant.</p>
        <div className="tpl-grid">
          {templates.map((t) => (
            <button key={t.id} className="tpl" onClick={() => choose(t.id)} disabled={!!busy} aria-busy={busy === t.id}>
              <b>{t.name}</b>
              <small>{t.description}</small>
              <span className="btn lime">{busy === t.id ? "Création…" : "Choisir ce modèle"}</span>
            </button>
          ))}
        </div>
        {err && <p className="note-c" role="alert" style={{ background: "var(--rose)", marginTop: 12 }}>{err}</p>}
      </div>
    </main>
  );
}

export function Tower() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M16 2.5v3.5" /><path d="M14.4 6h3.2" /><path d="M14.8 6 12.6 16.5M17.2 6l2.2 10.5" /><path d="M11.2 16.5h9.6" /><path d="M12.4 16.5C11.6 21.6 9.8 25.8 7.2 29.5M19.6 16.5c.8 5.1 2.6 9.3 5.2 13" /><path d="M10.3 22.6h11.4" /><path d="M12.4 29.5c.7-3.4 6.5-3.4 7.2 0" /><path d="M14.2 10.8h3.6" /></svg>
  );
}
