# Site vitrine standard sur Vercel

Le site est entièrement statique : aucune administration intégrée, API d’écriture, base Redis ou connexion Blob n’est utilisée. Les photos sont incluses dans la galerie lors de la construction, et restent visibles sans JavaScript ; celui-ci ajoute les comparaisons avant/après, les filtres et la navigation.

## Déploiement

- Dépôt : `boby12807/Romanyck-Coiffeur` ; branche publique : `main`.
- Adresse conservée : `https://romanyck-coiffeur-five.vercel.app`.
- Node : 24 ; installation : `npm ci` ; construction : `npm run build` ; dossier public : `dist`.
- L’adresse et les coordonnées du médiateur se règlent dans `site.config.js`. `PUBLIC_SITE_URL` peut aussi être défini dans Vercel pour remplacer l’adresse. Aucun secret n’est requis pour faire fonctionner le site.
- Les prévisualisations sont marquées `noindex` et leur robots refuse l’indexation. Cela ne remplace pas la protection d’accès Vercel.

La construction publie uniquement les pages, styles, script, polices et images nécessaires. Les sources, documents internes, originaux de galerie, fichiers `.env` et ancienne administration sont exclus. Les photos choisies sont décodées et réencodées en WebP sans EXIF/GPS, et portent des noms dérivés de leur contenu. Aucun ancien fichier de construction n’est recopié.

## Contrôle des modifications

Les comptes GitHub et Vercel autorisés contrôlent l’ajout et le retrait des photos. Les visiteurs ne disposent d’aucune route d’écriture. Vérifier les collaborateurs du dépôt et les membres de l’équipe Vercel, activer la double authentification et garder des accès de récupération sûrs. Les protections de comptes ne sont pas remplacées par les en-têtes du site.

## Services inutilisés

Ne connecter ni Redis ni Blob à cette version. Si un stockage Blob a déjà été créé pendant la préparation, il peut rester vide et inutilisé ; le déconnecter du projet retire les variables associées sans nécessiter la suppression du stockage. Aucune suppression irréversible de ressource ou de données n’est nécessaire au déploiement. Si une intégration Upstash a été acceptée mais qu’aucune base n’a été créée, ne pas poursuivre sa création.

## Vérifications

1. `npm run verify`, `npm run build`, `npm audit --audit-level=high`.
2. Ouvrir le site sur mobile et ordinateur ; contrôler les huit photos des quatre comparaisons, les filtres, les curseurs et le menu.
3. Vérifier les en-têtes CSP/HSTS, les URL canoniques, `/robots.txt` et `/sitemap.xml`.
4. Vérifier que `/admin.html`, `/admin.js`, `/api/admin-session`, `/api/realisations`, `/api/media`, `/.env` et `/lib/default-realisations.js` ne sont plus publiés.
5. Vérifier que seuls les comptes autorisés peuvent modifier le dépôt et le projet.
6. Faire confirmer les autorisations des images et les coordonnées du médiateur par le salon. En l’absence de coordonnées confirmées, la page légale le signale explicitement ; elle ne prétend pas que la conformité est complète et la construction affiche un avertissement. Ne pas inventer d’organisme.

Le retrait d’une image du nouveau déploiement n’efface pas les copies déjà téléchargées ou présentes dans l’historique GitHub et les anciens déploiements. Voir `AJOUTER-UNE-REALISATION.md`.
