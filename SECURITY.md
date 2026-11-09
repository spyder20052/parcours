# Sécurité

## Signaler une faille

N'ouvre pas de ticket public. Utilise l'onglet **Security → Report a vulnerability** du dépôt GitHub, ou écris au mainteneur. Indique les étapes pour reproduire et l'impact. Tu reçois une réponse sous sept jours. Ne teste que sur ta propre instance, jamais sur celle de quelqu'un d'autre.

## Modèle de menace

Chaque utilisateur ne doit lire ni modifier que ses données. L'administrateur invite et suspend des comptes, mais il ne lit pas les espaces des autres.

| Couche | Protection | Où |
|---|---|---|
| Base | RLS forcé sur chaque table métier, rôle `parcours_app` sans contournement, déclencheurs de même propriétaire | `db/migrations/0002_rls.sql` |
| Accès aux données | Transaction `withUser()` qui fixe `app.user_id` | `src/server/db.ts` |
| Écritures | Opérations typées validées par Zod, vérification de l'origine, limitation de débit | `src/lib/ops.ts`, `src/server/guard.ts` |
| Comptes | Invitation obligatoire ; lien e-mail haché, valable 10 minutes, à usage unique ; Google ; suspension qui ferme les sessions | `src/server/auth.ts` |
| Fichiers | Bucket privé, URL signées de 5 minutes, contrôle des premiers octets, 15 Mo au plus | `src/server/storage.ts`, `src/app/api/files` |
| Clés IA | AES-256-GCM, données associées liées au propriétaire, appels côté serveur | `src/server/crypto.ts`, `src/server/ai.ts` |
| Navigateur | CSP avec nonce et `strict-dynamic`, `frame-ancestors 'none'`, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy` | `src/proxy.ts` |
| Assistant | Le contenu de l'espace et le texte collé sont des données ; aucune suppression de document ; rien n'est appliqué sans validation ; annulation possible | `src/server/ai.ts` |

Les tests `tests/unit/isolation.test.ts` et `tests/e2e/isolation.spec.ts` vérifient le cloisonnement entre deux comptes, y compris par des appels directs à l'API.

## Choix assumés

- **`style-src 'unsafe-inline'`.** Le canvas positionne ses nœuds par attribut `style`. Les scripts restent stricts, avec nonce. Toute valeur insérée par le moteur passe par `esc()`.
- **Invitations par liste d'adresses.** L'invitation autorise une adresse e-mail. La preuve de possession de cette adresse vient du lien e-mail ou de Google. Aucun jeton d'invitation ne circule.
- **`npm audit`.** Il reste des alertes modérées sur `esbuild`, via `drizzle-kit`, une dépendance de `better-auth`. Elles concernent le serveur de développement d'esbuild, que l'application n'exécute jamais.

## Exploitation

- Fais tourner `BETTER_AUTH_SECRET` en cas de doute : toutes les sessions sont alors invalidées.
- Ne change pas `APP_ENCRYPTION_KEY` sans migration : les clés IA enregistrées deviendraient illisibles. Chaque utilisateur devrait alors les saisir de nouveau.
- Active la restauration à un instant donné de Neon et le chiffrement au repos de R2 (actif par défaut).
