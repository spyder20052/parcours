# Contribuer

Merci de ton aide. Parcours doit rester simple à héberger et sûr par défaut.

1. Lis `CLAUDE.md`. Ses règles de sécurité s'appliquent à toute contribution, écrite à la main ou avec un assistant.
2. Installe le projet en local (voir le README) et vérifie que les tests passent avant de commencer.
3. Une demande de fusion couvre un seul sujet. Elle comprend :
   - les tests qui couvrent le changement ;
   - une migration SQL si le schéma change ;
   - la mise à jour de la documentation concernée.
4. Avant d'ouvrir la demande, lance `npm run typecheck && npm run lint && npm test && npm run test:e2e`.
5. Pour un changement visible, joins des captures dans les deux thèmes, sur ordinateur et à 390 px.
6. Aucune donnée personnelle, même fictive mais réaliste, dans `templates/` ou dans les tests. Utilise des adresses en `@parcours.test`.

Les nouveaux modèles de parcours sont bienvenus : bourses, doctorat, emploi, concours. Cite les sources officielles dans les modes d'emploi.
