"use client";
import Link from "next/link";
import { useState } from "react";
import { ConfigSchema } from "@/lib/model";
import { authClient } from "@/lib/auth-client";

type Me = { id: string; name: string; email: string; role: string };
type Ai = { hasKey: boolean; model: string; models: { id: string; label: string }[] };
type Mail = { available: boolean; connected: boolean; email: string | null; lastSyncAt: string | null; live: boolean };
const OUTLOOK_BACK: Record<string, { ok: boolean; t: string }> = {
  ok: { ok: true, t: "Outlook est relié. Tes courriels peuvent partir d'ici, avec leurs pièces jointes." },
  refus: { ok: false, t: "Connexion annulée : Microsoft n'a pas reçu ton accord." },
  erreur: { ok: false, t: "La connexion à Outlook a échoué. Réessaie ; si cela recommence, ton établissement bloque peut-être les applications externes." },
};

async function call(path: string, method: string, body?: unknown) {
  const r = await fetch(path, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Action impossible.");
  return j;
}

function useAction() {
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true); setMsg(null);
    try { const t = await fn(); if (t) setMsg({ ok: true, t }); } catch (e) { setMsg({ ok: false, t: (e as Error).message }); }
    setBusy(false);
  };
  const out = msg && <p className="note-c" role={msg.ok ? "status" : "alert"} style={{ marginTop: 10, background: msg.ok ? undefined : "var(--rose)" }}>{msg.t}</p>;
  return { run, busy, out };
}

export default function Settings({ me, config, ai, mail, outlookResult }: { me: Me; config: string | null; ai: Ai; mail: Mail; outlookResult: string | null }) {
  const [name, setName] = useState(me.name);
  const prof = useAction();
  const [key, setKey] = useState("");
  const [model, setModel] = useState(ai.model);
  const [hasKey, setHasKey] = useState(ai.hasKey);
  const aiA = useAction();
  const [cfg, setCfg] = useState(config ?? "");
  const [issues, setIssues] = useState<string[]>([]);
  const cfgA = useAction();
  const [confirmDel, setConfirmDel] = useState("");
  const delA = useAction();
  const [confirmReset, setConfirmReset] = useState("");
  const [mailOn, setMailOn] = useState(mail.connected);
  const mailA = useAction();
  // Le message de retour de Microsoft s'efface dès que la connexion change ici.
  const [backOn, setBackOn] = useState(true);
  const back = backOn && outlookResult ? OUTLOOK_BACK[outlookResult] : undefined;
  const resetA = useAction();

  function checkCfg(text: string) {
    try {
      const r = ConfigSchema.safeParse(JSON.parse(text));
      setIssues(r.success ? [] : r.error.issues.slice(0, 8).map((i) => `${i.path.join(".") || "racine"} : ${i.message}`));
      return r.success ? r.data : null;
    } catch (e) { setIssues([`JSON invalide : ${(e as Error).message}`]); return null; }
  }

  return (
    <main className="set">
      <div className="set-in">
        <div className="set-top">
          <h1>Réglages</h1>
          {me.role === "admin" && <a className="btn" href="/admin">Administration</a>}
          <Link className="btn lime" href="/">Retour à mon suivi</Link>
        </div>

        <section className="set-card" aria-labelledby="s-prof">
          <h2 id="s-prof">Profil</h2>
          <p className="meta">Connecté avec {me.email}.</p>
          <form className="set-row" onSubmit={(e) => { e.preventDefault(); prof.run(async () => { await call("/api/account", "PATCH", { name }); return "Nom enregistré."; }); }}>
            <div style={{ flex: 1, minWidth: 200 }}><label className="fld" htmlFor="nm">Nom affiché</label><input className="inp" id="nm" value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} /></div>
            <button className="btn lime" disabled={prof.busy}>Enregistrer</button>
            <button type="button" className="btn" onClick={async () => { await authClient.signOut(); location.href = "/connexion"; }}>Me déconnecter</button>
          </form>
          {prof.out}
        </section>

        <section className="set-card" aria-labelledby="s-ai">
          <h2 id="s-ai">Assistant IA</h2>
          <p className="meta">L&apos;assistant modifie ton espace en parlant : ajouter une formation, réorganiser les colonnes, préparer un courriel. Il utilise ta propre clé de l&apos;API Claude, chiffrée sur le serveur et jamais renvoyée au navigateur. Chaque changement s&apos;affiche avant d&apos;être appliqué et peut être annulé.</p>
          <p className="meta"><b>{hasKey ? "Une clé est enregistrée." : "Aucune clé enregistrée."}</b> Crée une clé sur console.anthropic.com, dans la rubrique API Keys.</p>
          <form className="set-row" onSubmit={(e) => { e.preventDefault(); aiA.run(async () => { await call("/api/ai/settings", "PUT", { key: key || undefined, model }); setKey(""); if (key) setHasKey(true); return "Réglages de l'assistant enregistrés."; }); }}>
            <div style={{ flex: 2, minWidth: 220 }}><label className="fld" htmlFor="ak">Clé de l&apos;API Claude</label><input className="inp" id="ak" type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={hasKey ? "Laisser vide pour garder la clé actuelle" : "sk-ant-…"} maxLength={300} /></div>
            <div style={{ flex: 1, minWidth: 160 }}><label className="fld" htmlFor="am">Modèle</label><select className="inp" id="am" value={model} onChange={(e) => setModel(e.target.value)}>{ai.models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></div>
            <button className="btn lime" disabled={aiA.busy || (!hasKey && !key)}>Enregistrer</button>
            {hasKey && <button type="button" className="btn" onClick={() => aiA.run(async () => { await call("/api/ai/settings", "DELETE"); setHasKey(false); return "Clé supprimée."; })}>Supprimer la clé</button>}
          </form>
          {aiA.out}
        </section>

        {mail.available && (
          <section className="set-card" id="s-mail" aria-labelledby="s-mail-h">
            <h2 id="s-mail-h">Messagerie Outlook</h2>
            <p className="meta">Relie ta boîte Outlook pour envoyer tes courriels depuis Échanges, avec leurs pièces jointes. Les réponses des universités se rangent ensuite toutes seules dans le bon échange. Parcours n&apos;envoie rien sans ton clic sur « Envoyer le courriel », et ne lit que les courriels qui répondent à tes échanges.</p>
            {back && <p className="note-c" role={back.ok ? "status" : "alert"} style={{ marginBottom: 10, background: back.ok ? undefined : "var(--rose)" }}>{back.t}</p>}
            {mailOn ? (
              <>
                <p className="meta"><b>Relié à {mail.email}.</b> {mail.live ? "Les réponses arrivent en direct, en moins de trois minutes." : "Les réponses arrivent quand tu cliques sur « Vérifier les réponses », et chaque jour automatiquement."}{mail.lastSyncAt ? ` Dernière vérification : ${new Date(mail.lastSyncAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}.` : ""}</p>
                <div className="acts">
                  <button className="btn lime" disabled={mailA.busy} onClick={() => mailA.run(async () => { const j = await call("/api/outlook/sync", "POST"); return j.added ? `${j.added} réponse${j.added > 1 ? "s" : ""} rattachée${j.added > 1 ? "s" : ""} à tes échanges.` : "Aucune nouvelle réponse."; })}>Vérifier les réponses</button>
                  <button className="btn" disabled={mailA.busy} onClick={() => mailA.run(async () => { await call("/api/outlook", "DELETE"); setMailOn(false); setBackOn(false); return "Outlook est déconnecté. Pour retirer aussi l'autorisation chez Microsoft, ouvre myapps.microsoft.com."; })}>Déconnecter Outlook</button>
                </div>
              </>
            ) : (
              <>
                <p className="meta">Microsoft te demandera d&apos;autoriser Parcours à envoyer et lire tes courriels. Connecte-toi avec l&apos;adresse qui écrit aux universités.</p>
                <div className="acts"><a className="btn lime" href="/api/outlook/connect">Connecter Outlook</a></div>
              </>
            )}
            {mailA.out}
          </section>
        )}

        {config !== null && (
          <section className="set-card" aria-labelledby="s-cfg">
            <h2 id="s-cfg">Structure de mon espace</h2>
            <p className="meta">Colonnes du tableau, niveaux, types d&apos;étapes, vues, jalons, dossiers. Le plus simple est de demander à l&apos;assistant ; tu peux aussi modifier ce JSON directement. Il est vérifié avant d&apos;être enregistré.</p>
            <label className="fld" htmlFor="cfg">Configuration (JSON)</label>
            <textarea className="inp code" id="cfg" spellCheck={false} value={cfg} onChange={(e) => { setCfg(e.target.value); checkCfg(e.target.value); }} />
            {issues.length > 0 && <ul className="err-list">{issues.map((i) => <li key={i}>{i}</li>)}</ul>}
            <div className="acts" style={{ marginTop: 10 }}>
              <button className="btn lime" disabled={cfgA.busy || issues.length > 0} onClick={() => cfgA.run(async () => { const c = checkCfg(cfg); if (!c) throw new Error("Corrige d'abord les erreurs."); await call("/api/ops", "POST", { ops: [{ op: "workspace.update", patch: { config: c } }] }); return "Structure enregistrée."; })}>Enregistrer la structure</button>
              <button className="btn" onClick={() => { setCfg(config); setIssues([]); }}>Annuler mes modifications</button>
            </div>
            {cfgA.out}
          </section>
        )}

        <section className="set-card" aria-labelledby="s-data">
          <h2 id="s-data">Mes données</h2>
          <p className="meta">Télécharge tout ton suivi au format JSON. Tes fichiers se téléchargent un par un depuis la vue Documents.</p>
          <div className="acts"><a className="btn" href="/api/account/export">Exporter mes données</a></div>
          {config !== null && (
            <>
              <p className="meta" style={{ marginTop: 14 }}><b>Repartir de zéro.</b> Supprime ton espace, ses candidatures et ses fichiers, puis te propose de choisir un nouveau modèle. Ton compte reste. Tape EFFACER pour confirmer.</p>
              <form className="set-row" onSubmit={(e) => { e.preventDefault(); resetA.run(async () => { await call("/api/workspace", "DELETE", { confirm: confirmReset }); location.href = "/"; }); }}>
                <input className="inp" aria-label="Confirmation" value={confirmReset} onChange={(e) => setConfirmReset(e.target.value)} placeholder="EFFACER" />
                <button className="btn" disabled={resetA.busy || confirmReset !== "EFFACER"}>Effacer mon espace</button>
              </form>
              {resetA.out}
            </>
          )}
          <p className="meta" style={{ marginTop: 14 }}><b>Supprimer mon compte.</b> Tout est effacé définitivement : compte, espace, fichiers, clé IA. Recopie ton adresse e-mail pour confirmer.</p>
          <form className="set-row" onSubmit={(e) => { e.preventDefault(); delA.run(async () => { await call("/api/account", "DELETE", { confirm: confirmDel }); location.href = "/connexion"; }); }}>
            <input className="inp" aria-label="Adresse e-mail de confirmation" value={confirmDel} onChange={(e) => setConfirmDel(e.target.value)} placeholder={me.email} />
            <button className="btn" disabled={delA.busy || confirmDel.trim().toLowerCase() !== me.email.toLowerCase()}>Supprimer définitivement</button>
          </form>
          {delA.out}
        </section>
      </div>
    </main>
  );
}
