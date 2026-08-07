# Configuration Vercel

Le site contient deux fonctions serveur :

- `/api/rendez-vous` envoie chaque demande à `romanyckj@gmail.com`.
- `/api/realisations` enregistre et affiche les nouvelles photos avant / après.

## 1. Déployer le projet

Importez ce dossier dans un nouveau projet Vercel. Le fichier `package.json` permet à Vercel
d’installer automatiquement les dépendances nécessaires.

## 2. Connecter Vercel Blob

Dans le tableau de bord Vercel :

1. Ouvrez le projet.
2. Allez dans **Storage**.
3. Créez un stockage **Blob public** et connectez-le au projet.

Vercel ajoute alors automatiquement la variable `BLOB_READ_WRITE_TOKEN`.

## 3. Ajouter les variables privées

Dans **Project Settings → Environment Variables**, ajoutez :

| Variable | Valeur |
|---|---|
| `ADMIN_UPLOAD_PASSWORD` | Un mot de passe long réservé au propriétaire du salon |
| `ADMIN_SESSION_SECRET` | Une longue valeur aléatoire différente du mot de passe |
| `GMAIL_USER` | `romanyckj@gmail.com` |
| `GMAIL_APP_PASSWORD` | Le mot de passe d’application Google à 16 caractères |

Appliquez les variables aux environnements **Production**, **Preview** et **Development**, puis
redéployez le projet.

## 4. Créer le mot de passe d’application Gmail

1. Activez la validation en deux étapes sur le compte Google `romanyckj@gmail.com`.
2. Dans les paramètres de sécurité Google, ouvrez **Mots de passe des applications**.
3. Créez un mot de passe pour le site.
4. Copiez les 16 caractères dans `GMAIL_APP_PASSWORD` sur Vercel.

N’utilisez jamais le mot de passe Gmail habituel et ne placez aucune valeur secrète dans les
fichiers du projet.

## 5. Tester après publication

1. Envoyez une demande de rendez-vous depuis le formulaire.
2. Vérifiez sa réception dans `romanyckj@gmail.com`, y compris le dossier spam.
3. Ouvrez `/admin.html`, connectez-vous, ajoutez une paire avant / après, puis testez la
   modification, la visibilité, l’ordre et la suppression.
