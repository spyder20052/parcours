# Accessibilité

Parcours vise le standard **WCAG 2.1 niveau AA**. L'application doit rester utilisable sans souris, avec un lecteur d'écran, et sans animation pour les personnes qui la désactivent. Ce document décrit ce qui est en place et comment le vérifier.

## Ce qui est en place

### Clavier

- Chaque action passe par un élément focusable natif (`button`, `a`, `input`) ; rien n'est cliquable sans l'être aussi au clavier.
- Le focus est **toujours visible** (anneau de focus dédié, jamais supprimé sans remplacement).
- Raccourci : `/` ouvre la recherche globale depuis n'importe quelle vue.
- Les fenêtres (`dialog`) gardent le focus à l'intérieur, le rendent à l'élément d'origine à la fermeture, et se ferment avec `Échap`.

### Lecteurs d'écran

- Rôles et états ARIA sur les éléments interactifs : `aria-label`, `aria-pressed`, `aria-current`, `aria-checked`, `aria-disabled`, `aria-labelledby`, et les rôles `group`, `listbox`, `option`, `toolbar`, `checkbox`, `status`, `alert`.
- Les retours vivants — courriel envoyé, erreur, réponse rattachée — sont annoncés par des régions `aria-live`.
- Les icônes seules portent un texte réservé aux lecteurs d'écran (classe `.sr`) ; les icônes purement décoratives sont masquées par `aria-hidden`.

### Mouvement

- `prefers-reduced-motion: reduce` est respecté : les transitions et animations sont coupées (voir `src/app/tracker.css`).
- Aucune information n'est portée par le seul mouvement : tout ce qu'une animation souligne reste lisible à l'arrêt.

### Couleur et contraste

- Thèmes clair et sombre, calibrés pour le contraste du texte et des bordures.
- L'état d'un élément (en retard, déposé, envoyé…) n'est **jamais** porté par la seule couleur : un libellé et/ou une forme le redoublent.

### Lisibilité et mobile

- Mise en page responsive jusqu'au téléphone, vérifiée à **390 px** de large, sans défilement horizontal.
- Zones tactiles confortables ; textes qui s'adaptent sans se tronquer.

## Comment vérifier

Avant de livrer un écran, on contrôle **quatre états** :

1. **Ordinateur**, thème clair et sombre.
2. **390 px** de large (téléphone), sans débordement horizontal.
3. **Au clavier seul** : atteindre chaque action, voir le focus, fermer les fenêtres avec `Échap`.
4. **Mouvement réduit** activé : aucune animation, rien ne « saute ».

Pistes d'outils :

- **axe DevTools** ou **Lighthouse** (onglet Accessibilité) sur chaque vue.
- Navigation complète **au clavier** d'un bout à l'autre d'un écran.
- Un lecteur d'écran réel : **VoiceOver** (macOS/iOS), **NVDA** ou **JAWS** (Windows), **Orca** (Linux).
- Vérifier les ratios de contraste des couleurs du thème (texte normal ≥ 4,5:1, grand texte ≥ 3:1).

## Limites connues

- La vue **Canvas** est une frise dense : elle reste navigable au clavier et annoncée, mais une personne au lecteur d'écran gagnera souvent à passer par les vues **Calendrier**, **Tableau** ou la liste des **tâches**, qui présentent les mêmes données de façon linéaire.
- Les **aperçus de PDF** dépendent du document importé ; un PDF non accessible le reste dans l'aperçu.

## Signaler un problème

Un obstacle d'accessibilité est un bug à part entière. Ouvre une *issue* en décrivant la vue, l'aide technique utilisée (clavier, lecteur d'écran et sa version) et ce qui bloque.
