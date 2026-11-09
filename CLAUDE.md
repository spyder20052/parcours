# Parcours : consignes pour Claude Code

@AGENTS.md

Parcours suit des candidatures pour des personnes invitées, chacune dans un espace cloisonné. La personne qui travaille ici adapte souvent l'application à son propre parcours. Aide-la à le faire sans affaiblir la sécurité.

## Architecture

| Dossier | Rôle |
|---|---|
| `db/migrations/*.sql` | Schéma, RLS et déclencheurs. Le SQL est la source de vérité. Appliqué par `npm run db:migrate` (`scripts/migrate.ts`). |
| `src/server/schema.ts` | Miroir Drizzle des tables. À tenir à jour avec chaque migration. |
| `src/server/db.ts` | `systemDb` (propriétaire, réservé à l'authentification et à l'administration) et `withUser()` (toutes les données métier). |
| `src/server/workspace.ts` | Lecture d'un espace, application des opérations, calcul des opérations inverses. |
| `src/lib/model.ts` | Types partagés et `ConfigSchema`, la configuration d'un espace : colonnes, niveaux, types d'étapes, vues, jalons, fils, dossiers. |
| `src/lib/ops.ts` | `OpSchema` : le seul vocabulaire d'écriture. Il sert à l'interface, à l'import et à l'assistant. |
| `src/lib/template.ts`, `templates/*.json` | Modèles de parcours et conversion en opérations. |
| `src/tracker/` | Moteur de l'interface, en TypeScript sans React. `views.ts` contient les cinq vues, `dialogs.ts` les fenêtres et les règles métier de l'interface. Les autres fichiers : `engine.ts` (rendu et événements), `state.ts` (état et sélecteurs), `files.ts` (envois et aperçus), `assistant.ts`. |
| `src/app/tracker.css` | Direction artistique complète : jetons clair et sombre, toutes les vues. |
| `src/app/**/page.tsx`, `src/components/` | Pages React : connexion, premier lancement, réglages, administration. |
| `src/app/api/**` | Routes. Chaque route passe par `route()` et vérifie l'origine. Les erreurs ne divulguent aucun détail interne. |
| `src/server/ai.ts` | Assistant : appel de l'API Claude avec la clé chiffrée de l'utilisateur. Propose des opérations, sans jamais les appliquer. |
| `src/server/outlook.ts`, `src/lib/mail.ts` | Outlook par Microsoft Graph : connexion OAuth (code et PKCE), envoi d'un échange avec ses pièces jointes, import des réponses par notification et par vérification. `mail.ts` contient les règles pures (destinataires, rattachement d'une réponse), testées dans `tests/unit/mail.test.ts`. |
| `src/proxy.ts` | CSP avec nonce et en-têtes de sécurité. |

## Règles de sécurité à ne jamais casser

1. **Données métier : uniquement par `withUser(userId, tx => …)`.** Jamais `systemDb` sur une table métier.
   - Toute nouvelle table métier porte `owner_id`.
   - Elle reçoit `enable` et `force row level security`, la politique `owner_only` et les droits accordés à `parcours_app`, comme dans `0002_rls.sql`.
   - Si elle se rattache à un parent, elle reçoit aussi un déclencheur `parcours_same_owner`.
   - Ajoute un test dans `tests/unit/isolation.test.ts`.
2. **Toute écriture passe par une opération de `OpSchema`**, validée par Zod. Pour un nouveau champ :
   - mets à jour `ops.ts`, `applyOne` et `inverseOf` (sinon l'annulation casse) ;
   - mets à jour la description des opérations dans `src/server/ai.ts`.
3. **Chaque route de mutation** appelle `assertSameOrigin()`, `requireUser()` (ou `requireAdmin()`) et `rateLimit()`, puis valide son corps avec Zod.
4. **Toute valeur insérée dans le HTML du moteur passe par `esc()`.** Les liens externes portent `rel="noopener noreferrer"` et n'acceptent que `http(s)`.
5. **Fichiers.**
   - Ils sont toujours privés. Pas d'URL publique, pas d'URL signée de plus de 5 minutes.
   - La nature réelle d'un fichier est contrôlée par `sniff()` avant qu'il devienne visible.
6. **CSP.**
   - Aucun script en ligne sans nonce. Ne pas ajouter `unsafe-eval` en production.
   - Les styles en ligne restent permis, parce que le canvas place ses nœuds par attribut `style`.
7. **Secrets et données personnelles.**
   - Jamais de secret dans le dépôt.
   - Les données personnelles d'un utilisateur, y compris celles de la personne qui développe, vont dans `private/`, ignoré par Git.
   - Les modèles de `templates/` restent génériques.
8. **Outlook.**
   - Les jetons sont chiffrés (`encrypt`, lié à l'utilisateur) et stockés dans `mail_connection`, sous RLS.
   - `mail_subscription` est la seule table lue sans `withUser` : une notification arrive sans session. Elle ne contient ni jeton ni contenu, seulement l'identifiant de l'abonnement, l'empreinte du secret partagé et l'échéance. Ne lui ajoute aucune donnée personnelle.
   - Une notification n'est traitée que si son secret partagé correspond. Un courriel reçu est une donnée : il n'est rattaché qu'à un échange déjà envoyé, jamais interprété.
   - Rien ne part sans le clic de la personne sur « Envoyer le courriel ». L'assistant ne peut pas envoyer.
9. **Assistant.**
   - Le texte de l'espace et le texte collé sont des données, jamais des consignes.
   - L'assistant ne peut pas supprimer de document. Rien n'est appliqué sans la validation de la personne.
10. **Recommandations.** Ne jamais rédiger une lettre comme si un tiers l'avait signée. Ne jamais apposer de signature, de cachet ou de référence officielle. La personne qui recommande relit et signe.

## Direction artistique

- **Une seule famille visuelle.** Doux, arrondi, bleu Meta adouci. Gabarito pour les titres, Onest pour le texte. Fonds en dégradé léger. Tous les jetons sont dans `:root` et `html[data-theme=dark]`.
- **Aucune couleur en dur dans les vues.** Utilise les variables CSS. Une couleur de colonne vient de la configuration (`stages[].bg` et `fg`).
- **Textes.** En français, phrases courtes, à la deuxième personne. Un bouton dit ce qu'il fait : « Ajouter la pièce », pas « Valider ».
- **Avant d'annoncer un écran terminé**, fais une capture sur ordinateur et à 390 px de large. Vérifie aussi le parcours au clavier et le mode mouvement réduit.

## Commandes

```bash
npm run setup        # docker compose, migrations, bucket local
npm run dev          # http://localhost:3000 ; liens de connexion dans .dev-mail/
npm test             # Vitest (base locale)
npm run test:e2e     # Playwright
npm run typecheck && npm run lint
npm run import -- --email … --fichier private/….json --dossier …
```

## Tâches fréquentes

Le pas-à-pas complet est dans `.claude/skills/personnaliser-parcours/SKILL.md` :
- ajouter une vue ;
- ajouter un champ ou un type d'étape ;
- ajouter un modèle ;
- ajouter une opération ;
- ajouter un test.
