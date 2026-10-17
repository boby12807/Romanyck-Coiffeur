# Déploiement de la version sécurisée

Cette version change le stockage de la galerie. Les anciennes fiches Blob publiques ne sont plus lues par le site. Ne remplacez pas simplement l’ancien déploiement sans initialisation ou migration : la galerie reste indisponible tant que son index privé n’existe pas.

## Ressources séparées

Créer un **nouveau stockage Vercel Blob privé**, et une base Upstash Redis. Garder l’ancien stockage public le temps de la migration. Utiliser des ressources et des secrets différents pour Production, Preview et Development. Ne jamais donner le jeton de production à une prévisualisation de code non approuvé.

Redis contient les sessions révocables et l’index de galerie. Une visite lit cet index en une opération, sans énumérer les photos ou télécharger une fiche par réalisation. L’index n’a pas de copie locale périmée. Les réponses de galerie et de photos ne sont pas mises en cache dans le navigateur ou le CDN : un masquage bloque les accès suivants. Le SDK peut utiliser le cache interne du stockage privé pour les octets immuables ; l’autorisation est toujours vérifiée dans Redis avant de les servir et à nouveau après leur téléchargement.

L’index est limité à 500 réalisations. Les modifications concurrentes emploient une comparaison atomique pour éviter qu’un ancien formulaire annule une suppression récente.

## Variables

Voir `.env.example`. Configurer uniquement les variables de l’environnement concerné :

- `ADMIN_UPLOAD_PASSWORD` : mot de passe unique d’au moins 16 caractères, idéalement généré par un gestionnaire de mots de passe.
- `ADMIN_SESSION_SECRET` : valeur aléatoire d’au moins 32 caractères, distincte du mot de passe.
- `BLOB_STORE_ID` : identifiant automatiquement ajouté par la connexion du stockage **privé**. Le SDK utilise l’identité temporaire OIDC de Vercel, sans clé permanente à gérer. Autre possibilité pour les opérations locales : `BLOB_READ_WRITE_TOKEN` du stockage privé. Ne pas enregistrer de copie durable d’un jeton OIDC temporaire.
- `UPSTASH_REDIS_REST_URL` et `UPSTASH_REDIS_REST_TOKEN` : base Redis dédiée à cet environnement.
- `PUBLIC_SITE_URL` : domaine HTTPS final, sans chemin, paramètres ou identifiants.
- `MEDIATOR_NAME`, `MEDIATOR_ADDRESS`, `MEDIATOR_URL` : coordonnées exactes du médiateur conventionné par le salon, site en HTTPS.

Le build de production refuse les informations manquantes. Les URL canoniques et les liens de partage sont générés à partir du domaine définitif. Les versions Preview ont `noindex` et un robots qui refuse l’indexation ; cela ne remplace pas leur protection d’accès.

Sur Vercel, conserver les réglages du dépôt : build `npm run build`, répertoire public `dist`, fonctions `api/`. Les photos initiales sont incluses uniquement dans la fonction serveur qui les sert, jamais dans `dist`. Les documents internes, tests, secrets et fichiers serveur ne doivent pas être publiés comme fichiers statiques.

## Initialiser une nouvelle galerie

Pour les commandes locales, charger les variables du bon environnement dans le processus. Ne jamais copier un `.env` dans un dossier public ou le déposer dans Git. Avec Node 24, on peut utiliser `node --env-file=.env.local scripts/gallery.mjs …`.

- Galerie sans photos : `npm run gallery:seed -- --empty --approve-photos`.
- Photos initiales : vérifier les autorisations, puis `npm run gallery:seed -- --approve-photos`.

La confirmation ne remplace pas les justificatifs, conservés séparément par le salon. L’initialisation refuse de remplacer une galerie existante. Aucune photo par défaut ne se réinsère automatiquement après un retrait.

## Migrer une galerie déjà utilisée

1. Bloquer les modifications de l’ancienne administration pendant la migration. Utiliser d’abord des ressources de test séparées pour répéter la procédure.
2. Définir `LEGACY_PUBLIC_BLOB_TOKEN` avec l’ancien jeton public, en gardant `BLOB_READ_WRITE_TOKEN` pour le nouveau stockage privé.
3. Définir `BACKUP_ENCRYPTION_KEY` : 32 octets aléatoires encodés en hexadécimal. Conserver cette clé dans un gestionnaire de secrets, séparément des sauvegardes. Ces deux variables sont réservées aux opérations, pas au build ni au navigateur.
4. Exécuter `npm run gallery:migrate -- --approve-photos`. Les anciens états masqués et supprimés sont respectés ; les photos actives sont réencodées et copiées dans le stockage privé. Un manifeste chiffré est créé dans `backups/`. L’index ne remplace jamais une galerie déjà initialisée.
5. Déployer en test, vérifier toutes les réalisations et leurs états, puis préparer le déploiement de production avec ses propres ressources. Faire une sauvegarde complète avec `npm run gallery:backup`.
6. Après validation de la migration, exécuter `npm run gallery:cleanup -- --legacy --file chemin-du-manifeste.encrypted.json`. Cette commande supprime les anciennes photos et fiches publiques listées dans le manifeste. Garder ce manifeste chiffré en cas de reprise du nettoyage. Vérifier les anciennes URL et la propagation des caches.
7. Retirer les anciens déploiements ou leur accès, puis révoquer l’ancien jeton public. Ne plus réutiliser la version précédente avec les secrets de production.

Une migration interrompue avant création de l’index peut laisser des fichiers privés orphelins. Les retirer après diagnostic, ou utiliser le nettoyage normal après initialisation : seuls les orphelins vieux de plus de 24 heures sont supprimés. Si la création de l’index a réussi malgré une erreur réseau, ne pas réinitialiser : inspecter le résultat avant toute reprise.

**Dépôt GitHub :** les photos déjà présentes dans un dépôt public et son historique restent consultables depuis GitHub, même si elles ne sont plus servies par le nouveau site. Le contrôle d’accès du site ne peut pas supprimer ces copies. Pour un retrait d’autorisation concernant ces photos, traiter aussi le dépôt, son historique et les anciens déploiements avec le propriétaire. Ne pas réécrire l’historique partagé sans coordination.

## Sauvegardes et exploitation

- `npm run gallery:backup` sauvegarde l’index et les octets des photos dans une archive **AES-256-GCM chiffrée** sous `backups/`, exclu de Git.
- `npm run gallery:restore -- --file chemin.encrypted.json` restaure vers une galerie cible non initialisée et un stockage distinct. En production, l’option explicite `--allow-production` est requise après un essai en test.
- Toutes les photos restaurées restent **masquées**. Vérifier les retraits intervenus depuis la sauvegarde avant de les republier. Ne pas écraser l’index actuel pour restaurer une ancienne publication.
- `npm run gallery:cleanup` reprend les suppressions en attente et retire les fichiers privés orphelins de plus de 24 heures.
- Mettre en place une sauvegarde quotidienne hors du poste, avec accès limité, une rotation de 30 jours, et un essai de restauration au moins après chaque changement de stockage. Le script seul ne planifie pas les sauvegardes.
- Configurer la conservation des journaux Vercel à 30 jours maximum hors gestion d’incident, ainsi que des alertes sur les erreurs `admin.security.unavailable`, `security.ratelimit.unavailable`, `gallery.media.unavailable`, `gallery.delete.pending`, `gallery.upload.cleanup.failed` et `gallery.request.failed`.
- Activer les alertes de consommation/coûts Vercel, Blob et Upstash. Les limites applicatives par IP ne remplacent pas les règles du pare-feu contre un trafic distribué. Configurer les règles adaptées au forfait et tester sur Preview.
- Activer la double authentification sur GitHub, Vercel et Upstash ; limiter les droits aux personnes nécessaires. Les comptes réels, leurs protections, les alertes et la planification ne peuvent pas être configurés depuis ce dépôt.

## Recette avant livraison

1. `npm ci`, `npm run verify`, puis `npm audit --omit=dev --audit-level=high`.
2. Construire la production avec ses variables finales. Vérifier domaine, certificat HTTPS et redirections des alias vers le domaine canonique dans Vercel.
3. Vérifier les en-têtes CSP/HSTS, les URL canoniques, `/robots.txt` et `/sitemap.xml`.
4. Vérifier que `/assets/realisations/…`, `/assets/balayage_before.jpg`, `/assets/balayage_after.jpg`, `/lib/…` et `/.env` ne sont pas servis en statique.
5. Sans connexion, vérifier le refus de toute mutation et de `?admin=1`. Vérifier la limitation des connexions et le refus en cas de panne Redis.
6. Ajouter une paire, modifier, masquer puis ouvrir le lien de sa photo dans une fenêtre sans session : réponse 404. Le lien reste utilisable par l’administrateur connecté pour les photos simplement masquées.
7. Couper l’API de test : la galerie montre une indisponibilité sans réafficher des photos de secours.
8. Simuler une suppression Blob échouée : la publication est immédiatement retirée, et « Réessayer la suppression » reste disponible dans l’administration.
9. Après déconnexion, vérifier qu’une copie du cookie est refusée. Refaire l’essai après changement du mot de passe ou du secret ; redéployer tous les environnements concernés par la rotation.
10. Essayer une sauvegarde puis une restauration dans des ressources distinctes ; vérifier que toutes les photos restaurées sont masquées. Confirmer les autorisations, la politique de conservation et le médiateur avec le salon.
