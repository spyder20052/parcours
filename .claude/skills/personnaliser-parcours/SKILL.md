---
name: personnaliser-parcours
description: Adapter Parcours à un parcours de candidature précis. Ajouter ou modifier une vue, un type d'étape, une colonne, un champ, un modèle de parcours, une opération, un test, ou importer un suivi existant. À utiliser dès que la personne veut changer ce que l'application affiche ou permet, ou suivre un autre type de candidature (bourse, emploi, doctorat, concours).
---

# Personnaliser Parcours

Commence par la solution la plus légère qui répond au besoin :

1. **Données ou configuration** : colonnes, niveaux, types d'étapes, vues, jalons, dossiers. Tout passe par `ConfigSchema` (`src/lib/model.ts`), modifiable dans Réglages, par l'assistant, ou par un modèle. **Aucun code à écrire.**
2. **Nouveau modèle de parcours** : un JSON dans `templates/`.
3. **Code** : un nouveau champ, une nouvelle opération, une nouvelle vue.

Lis d'abord `CLAUDE.md`, en particulier les règles de sécurité.

## Ajouter un modèle de parcours

1. Copie `templates/vide.json` sous un nouveau nom. Change `id`, `name` et `description`.
2. Remplis `config` en t'appuyant sur `ConfigSchema` :
   - les identifiants s'écrivent en minuscules, chiffres, `-` ou `_` ;
   - les couleurs s'écrivent `#RRGGBB` ;
   - les dates s'écrivent `AAAA-MM-JJ`.
3. Rôles de colonnes (`stages[].role`) :

   | Rôle | Signification |
   |---|---|
   | `start` | Point de départ |
   | `contact` | Échange en cours |
   | `submitted` | Dossier déposé |
   | `shortlisted` | Dossier retenu |
   | `unique` | Un seul choix final possible. Active la porte du canvas avec `gate`. |
   | `dropped` | Candidature abandonnée |

4. Ajoute des `tasks`, des `pieces` et des `threads`, avec des modes d'emploi `how`. Dans `how.use` :
   - `th` cite la `key` d'un échange du modèle ;
   - `open` et `copy` citent la `key` d'une candidature.
5. Importe le fichier dans `src/lib/templates.ts`.
6. Lance `npm test`. Le test `ops.test.ts` valide chaque modèle et ses liens internes.
7. Aucune donnée personnelle dans un modèle. Elles vont dans `private/`.

## Importer un suivi existant

Le format est celui d'un modèle, plus :
- `documents[]` : `path`, `folder`, `title`, `app`, `tag`, `sensitive`, `piece` ;
- les états : `done` sur les étapes et les tâches, `sentAt` et `messages` sur les échanges.

Écris le fichier dans `private/`, puis lance `npm run import -- --email … --fichier private/x.json --dossier <racine des fichiers>`.

## Ajouter un champ à une entité

Exemple : un champ `salary` sur `application`.

1. Écris une migration `db/migrations/000N_….sql`, avec `alter table … add column … not null default …`, puis applique-la avec `npm run db:migrate`.
2. Ajoute la colonne dans `src/server/schema.ts` et le type dans `src/lib/model.ts`.
3. Mets à jour :
   - la lecture dans `loadWorkspace` (`src/server/workspace.ts`) ;
   - les champs autorisés dans `src/lib/ops.ts` (`ApplicationFields`) ;
   - la liste `keys` de `inverseOf` dans `workspace.ts`, pour que l'annulation fonctionne ;
   - la description des opérations dans `src/server/ai.ts` ;
   - le formulaire `appDialog` et `formOps` dans `src/tracker/dialogs.ts`, et l'affichage dans `views.ts` ou dans la fiche (`openDrawer`).
4. Lance `npm run typecheck && npm test`.

## Ajouter une opération

Ajoute-la à `OpSchema`, puis traite-la dans `applyOne`, dans `inverseOf` et dans `localApply` (`src/tracker/state.ts`, affichage immédiat). Décris-la aussi dans `assistant.ts` (`label`) et dans `ai.ts`. Ajoute un cas d'annulation dans `tests/unit/ops.test.ts`.

## Ajouter une vue

1. Dans `src/tracker/views.ts`, écris une fonction qui renvoie du HTML. Chaque valeur passe par `esc()`.
2. Enregistre-la dans `VIEW_DEFS`.
3. Ajoute son identifiant à l'énumération `views` de `ConfigSchema`.
4. Les interactions passent par des attributs `data-*`, traités dans `onClick` (`engine.ts`). Les écritures passent par `st.dispatch([...ops])`.
5. Styles dans `src/app/tracker.css`, avec les variables existantes. Vérifie le thème sombre (`html[data-theme=dark]`) et la largeur de 390 px.

## Ajouter un test

- **Logique et RLS** : `tests/unit/*.test.ts` (Vitest, base locale).
- **Parcours complet** : `tests/e2e/*.spec.ts` (Playwright). Les aides de `tests/e2e/helpers.ts` gèrent la connexion par lien e-mail (`login`) et les mutations avec l'origine attendue (`post`).
- Pour toute nouvelle table métier, ajoute un test qui vérifie qu'un second utilisateur ne la voit pas et ne peut pas la modifier.

## Vérifier avant de rendre la main

Lance dans l'ordre :
1. `npm run typecheck` ;
2. `npm run lint` ;
3. `npm test` ;
4. `npm run test:e2e`.

Fais une capture de l'écran modifié dans les deux thèmes et à 390 px.
