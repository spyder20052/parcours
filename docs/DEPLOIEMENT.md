# Déployer Parcours

Ce guide met Parcours en ligne avec quatre services :
- **Neon** pour la base PostgreSQL ;
- **Cloudflare R2** pour les fichiers ;
- **Resend** pour les e-mails ;
- **Vercel** pour l'application.

Google et Outlook sont facultatifs.

Compte une heure, surtout pour la vérification du domaine d'envoi des e-mails. Garde un fichier de notes privé pour y coller les valeurs au fur et à mesure. Ne le mets jamais dans le dépôt.

## 0. Préparer les secrets

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # APP_ENCRYPTION_KEY (à conserver : sans elle, les clés IA enregistrées sont perdues)
```

## 1. Neon (base de données)

1. Crée un projet sur neon.tech, dans la région la plus proche de tes utilisateurs, par exemple Francfort (`aws-eu-central-1`).
2. Dans **Connect**, copie deux chaînes de connexion du rôle propriétaire (`neondb_owner`) :
   - la chaîne **directe**, sans `-pooler`, pour les migrations ;
   - la chaîne **pooled**, avec `-pooler`, pour l'application, dans `DATABASE_URL`.
3. Applique les migrations depuis ton ordinateur, avec la chaîne directe :

   ```bash
   DATABASE_URL="postgres://…neon.tech/neondb?sslmode=require" node --import tsx scripts/migrate.ts
   ```

   La migration crée le rôle `parcours_app` et active le RLS sur toutes les tables métier.
4. Dans **Settings → Backup & restore**, garde une fenêtre de restauration d'au moins 7 jours.

## 2. Cloudflare R2 (fichiers)

1. Dans **R2**, crée un bucket `parcours-documents`. Laisse l'accès public désactivé.
2. Dans **Manage API tokens**, crée un jeton avec la permission **Object Read & Write**, limité à ce bucket. Note :
   - le **Access Key ID** ;
   - le **Secret Access Key** ;
   - l'**Account ID**.
3. Dans **Settings → CORS policy** du bucket, colle la règle suivante, en remplaçant le domaine :

   ```json
   [{ "AllowedOrigins": ["https://parcours.example.com"], "AllowedMethods": ["GET", "PUT", "HEAD"],
      "AllowedHeaders": ["content-type", "range"], "ExposeHeaders": ["content-length", "content-range", "accept-ranges"], "MaxAgeSeconds": 3600 }]
   ```

Variables à reporter :

```
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=parcours-documents
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
S3_FORCE_PATH_STYLE=true
```

## 3. Resend (e-mails de connexion)

1. Sur resend.com, ajoute ton domaine d'envoi dans **Domains**, puis crée chez ton registrar les enregistrements DNS indiqués (SPF, DKIM).
2. Attends que le domaine passe en **Verified**, puis crée une clé API avec la permission **Sending access**.

```
RESEND_API_KEY=re_…
MAIL_FROM="Parcours <connexion@ton-domaine.com>"
```

## 4. Google (facultatif)

1. Dans Google Cloud Console, va dans **APIs & Services → OAuth consent screen**. Choisis le type **External** et renseigne le nom et l'adresse de contact.
2. Tant que l'application est en mode « Testing », ajoute les adresses invitées comme utilisateurs de test.
3. Dans **Credentials → Create credentials → OAuth client ID**, choisis le type **Web application** et renseigne :
   - Authorized JavaScript origins : `https://parcours.example.com`
   - Authorized redirect URIs : `https://parcours.example.com/api/auth/callback/google`

```
GOOGLE_CLIENT_ID=…
GOOGLE_CLIENT_SECRET=…
```

Sans ces deux variables, le bouton Google n'apparaît pas et la connexion se fait par lien e-mail.

## 5. Outlook (facultatif)

Avec Outlook relié, un courriel part de Parcours avec ses pièces jointes, et les réponses se rangent seules dans le bon échange.

1. Sur entra.microsoft.com, ouvre **Applications → Inscriptions d'applications → Nouvelle inscription**.
   - Nom : `Parcours`.
   - Types de comptes : **comptes dans un annuaire organisationnel et comptes Microsoft personnels**.
   - URI de redirection, plateforme **Web** : `https://parcours.example.com/api/outlook/callback`. En local, ajoute aussi `http://localhost:3000/api/outlook/callback`.
2. Dans **Certificats et secrets → Nouveau secret client**, crée un secret et copie sa **valeur** tout de suite. Note aussi l'**ID d'application (client)** de la page Vue d'ensemble.
3. Dans **Autorisations des API → Ajouter une autorisation → Microsoft Graph → Autorisations déléguées**, ajoute :
   - `offline_access` et `User.Read` ;
   - `Mail.ReadWrite`, pour préparer le brouillon et y joindre les fichiers ;
   - `Mail.Send`, pour l'envoyer.
4. Si ton établissement bloque les applications externes, Microsoft affichera « Approbation de l'administrateur requise ». Demande alors au service informatique d'approuver l'application `Parcours`, ou relie une autre boîte.

```
MS_CLIENT_ID=…
MS_CLIENT_SECRET=…
MS_TENANT=common
CRON_SECRET=…   # openssl rand -base64 32
```

Les réponses arrivent en direct seulement si `APP_URL` est en `https://` : Microsoft envoie ses notifications à `/api/outlook/notify`. En local, utilise le bouton « Vérifier les réponses ». Le fichier `vercel.json` planifie chaque jour `/api/outlook/renew`, qui prolonge les abonnements de 7 jours et vérifie chaque boîte.

## 6. Vercel (application)

1. Publie le dépôt sur GitHub, puis importe-le dans Vercel (**Add New → Project**). Le framework détecté est Next.js.
2. Dans **Settings → Environment Variables**, environnement **Production**, ajoute toutes les variables de `.env.example` avec les valeurs de production :
   - `APP_URL` est l'adresse publique exacte, en `https://`, sans barre finale ;
   - `ADMIN_EMAIL` est ton adresse : c'est le seul compte créé sans invitation.
3. Dans **Settings → Functions**, choisis une région proche de Neon, par exemple `fra1` pour Francfort.
4. Dans **Settings → Domains**, ajoute ton domaine. Mets ensuite à jour `APP_URL`, la règle CORS de R2 et Google si le domaine change.
5. Déploie.

## 7. Premier lancement

1. Ouvre le site, saisis l'adresse `ADMIN_EMAIL` et clique sur le lien reçu.
2. Choisis un modèle.
3. Pour importer ton suivi existant, lance l'import depuis ton ordinateur avec les variables de production : `DATABASE_URL` en chaîne directe, et les variables `S3_*` de R2.

   ```bash
   npm run import -- --email toi@exemple.com --fichier private/mon-espace.json --dossier "/chemin/des/fichiers" --remplacer
   ```

4. Dans **Administration**, invite les personnes une à une. Chacune reçoit un e-mail et crée son espace.

## 8. Vérifier

```bash
curl -sI https://parcours.example.com/connexion | grep -iE "content-security|strict-transport|x-frame|x-content|referrer|permissions"
```

Vérifie ensuite ces quatre points :
1. Une adresse non invitée ne reçoit aucun e-mail.
2. Un second compte invité ne voit rien du premier.
3. Une URL de document copiée cesse de fonctionner après 5 minutes.
4. L'export JSON des Réglages contient tout ton suivi.
5. Si Outlook est configuré : relie ta boîte dans Réglages, envoie-toi un échange de test avec une pièce jointe, puis réponds-y. La réponse doit apparaître dans l'échange en moins de trois minutes.

## Mettre à jour

À chaque nouvelle migration dans `db/migrations/`, applique `scripts/migrate.ts` avec la chaîne directe de Neon **avant** de déployer le nouveau code. Le script ignore les migrations déjà appliquées.
