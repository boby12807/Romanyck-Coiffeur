# Configuration Vercel

Le site contient trois fonctions serveur :

- `/api/rendez-vous` envoie chaque demande à `romanyckj@gmail.com`.
- `/api/realisations` enregistre et affiche les nouvelles photos avant / après.
- `/api/admin-session` gère l'accès à l'administration.

Le site est en préparation. Ne l'ouvrir aux visiteurs qu'après validation des informations
légales, des horaires et des autorisations de publication des photos.

## 1. Déployer le projet

Importez ce dossier dans un nouveau projet Vercel. Le fichier `package.json` permet à Vercel
d’installer automatiquement les dépendances nécessaires.

## 2. Connecter Vercel Blob

Dans le tableau de bord Vercel :

1. Ouvrez le projet.
2. Allez dans **Storage**.
3. Créez un stockage **Blob public** et connectez-le au projet.

Vercel ajoute alors automatiquement la variable `BLOB_READ_WRITE_TOKEN`.

Avant l'activation de l'administration, les quatre comparaisons avant / après
fournies avec le site restent visibles même si Blob n'est pas connecté. Une fois
les secrets d'administration renseignés, une panne ou l'absence de Blob bloque
la galerie afin de ne pas réafficher une photo masquée par le propriétaire.

## 3. Ajouter les variables privées

Créez également une base Upstash Redis pour les compteurs partagés entre toutes les fonctions.
La connexion administrateur, les modifications et le formulaire renvoient une erreur 503
en production si Redis n'est pas configuré : aucun envoi ne doit fonctionner sans cette protection.
Les clés de limitation sont des empreintes SHA-256 des adresses IP et expirent avec leurs fenêtres.

Dans **Project Settings → Environment Variables**, ajoutez :

| Variable | Valeur |
|---|---|
| `ADMIN_UPLOAD_PASSWORD` | Un mot de passe long réservé au propriétaire du salon |
| `ADMIN_SESSION_SECRET` | Une longue valeur aléatoire différente du mot de passe |
| `GMAIL_USER` | `romanyckj@gmail.com` |
| `GMAIL_APP_PASSWORD` | Le mot de passe d’application Google à 16 caractères |
| `UPSTASH_REDIS_REST_URL` | Adresse REST de la base Upstash Redis |
| `UPSTASH_REDIS_REST_TOKEN` | Jeton REST de la base Upstash Redis |
| `PUBLIC_SITE_URL` | URL HTTPS canonique du site, par exemple `https://www.votre-domaine.fr` |

Appliquez les variables aux environnements **Production**, **Preview** et **Development**, puis
redéployez le projet.

## 4. Créer le mot de passe d’application Gmail

1. Activez la validation en deux étapes sur le compte Google `romanyckj@gmail.com`.
2. Dans les paramètres de sécurité Google, ouvrez **Mots de passe des applications**.
3. Créez un mot de passe pour le site.
4. Copiez les 16 caractères dans `GMAIL_APP_PASSWORD` sur Vercel.

N’utilisez jamais le mot de passe Gmail habituel et ne placez aucune valeur secrète dans les
fichiers du projet.

## 5. Vérifications avant ouverture au public

1. Vérifiez les informations publiques déjà intégrées dans `informations-legales.html` et
   renseignez les coordonnées du médiateur de la consommation effectivement conventionné
   par ROMANYCK. Vérifiez également les horaires avec le salon.
2. Vérifiez la preuve d'autorisation pour chacune des photos initiales et futures.
   Les fichiers fournis dans `assets/` restent accessibles par leur URL même après un
   masquage dans la galerie : retirez-les aussi du dépôt si la publication est retirée.
3. Définissez la durée de conservation des demandes reçues par e-mail et la procédure
   de suppression et de sauvegarde des photos Blob. La suppression d'un Blob public
   peut prendre un court délai de propagation dans les caches.
4. Activez la protection du déploiement de prévisualisation si nécessaire et contrôlez
   les réponses HTTP sur le domaine choisi.
5. Le référencement est activé. Vérifiez que `PUBLIC_SITE_URL` correspond au domaine définitif,
   puis contrôlez `/robots.txt`, `/sitemap.xml` et l’URL canonique après le déploiement.

## 6. Tester après déploiement, avant annonce du site

1. Envoyez une demande de rendez-vous depuis le formulaire.
2. Vérifiez sa réception dans `romanyckj@gmail.com`, y compris le dossier spam.
3. Ouvrez `/admin.html`, connectez-vous, ajoutez une paire avant / après, puis testez la
   modification, la visibilité, l’ordre et la suppression.
4. Coupez temporairement l'accès au stockage de test : la galerie doit afficher un message
   d'indisponibilité, sans réafficher une réalisation qui a été masquée.
5. Lancez localement `npm run verify` avant chaque mise en production.
