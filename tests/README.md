# Tests

| Commande | Contenu | Prérequis |
|---|---|---|
| `npm test` | Vitest : politiques RLS (`isolation.test.ts`), modèles et annulation des opérations (`ops.test.ts`) | `npm run setup` |
| `npm run test:e2e` | Playwright : cloisonnement entre deux comptes par l'API, refus d'une origine étrangère, refus d'un fichier déguisé, en-têtes de sécurité | `npm run setup` ; le serveur démarre seul si besoin |

Les tests de bout en bout se connectent avec l'adresse `ADMIN_EMAIL` de `.env.local`. Ils lisent les liens de connexion dans `.dev-mail/`. Avant de commencer, ils remettent à zéro les compteurs de débit, et seulement sur une base locale.

## Écrire un test

**Règle métier ou opération.** Ajoute un cas dans `tests/unit/ops.test.ts`. Applique les opérations avec `applyOps`, puis vérifie l'état avec `loadWorkspace`. Applique ensuite les opérations inverses et vérifie que l'état d'origine revient.

**Nouvelle table.** Dans `tests/unit/isolation.test.ts`, vérifie quatre choses pour un second utilisateur :
- il ne voit pas la ligne ;
- il ne peut pas la modifier ;
- il ne peut pas la supprimer ;
- il ne peut pas la rattacher à l'espace du premier.

**Parcours d'écran.** Ajoute un fichier `tests/e2e/*.spec.ts`. Utilise ces aides :
- `login(page, email)` pour te connecter ;
- `ensureWorkspace(page, modèle)` pour créer l'espace ;
- `post(request, chemin, corps)` pour une mutation avec l'en-tête `Origin` attendu.

Pour un compte supplémentaire, invite d'abord l'adresse depuis le compte administrateur. Utilise une adresse unique en `@parcours.test`.
