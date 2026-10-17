# Version vitrine simplifiée — 17 octobre 2026

La version finale correspond au besoin confirmé par le propriétaire : ajout occasionnel de photos via ses comptes de publication, sans administration intégrée.

- Suppression des pages d’administration, sessions, téléchargements et API serveur : aucun visiteur ne peut publier ou retirer des photos depuis le site.
- Suppression des dépendances Redis, Upstash, Vercel Blob et Undici. Aucun service de stockage ou secret n’est requis. Sharp est réservé à la construction des images, sans code serveur déployé.
- Galerie générée dans le HTML à partir d’une liste unique de réalisations. Aucun appel API, aucun secours réseau réintroduisant des photos, et affichage des images même sans JavaScript.
- Construction à partir d’un dossier public vide ; seules les photos encore publiées sont exportées. Les images de galerie sont décodées, optimisées en WebP et débarrassées de leurs métadonnées ; leurs originaux restent exclus du dossier public.
- Conservation des protections CSP, HTTPS/HSTS, blocage de l’encadrement, types de fichiers et permissions du navigateur. Les connexions de scripts à des services externes sont bloquées.
- URL canoniques absolues, sitemap et robots statiques ; prévisualisations non indexables. Documents internes et sources exclus de la publication.
- Informations de confidentialité réécrites pour le site statique. Les coordonnées réelles du médiateur restent à confirmer avec le salon.

Les tests vérifient l’affichage sans services externes, l’absence de routes d’administration, le retrait effectif des fichiers lors d’une reconstruction, l’échappement HTML, la validation des images, les métadonnées et le référencement.

Le contrôle exclusif dépend des droits des comptes GitHub et Vercel et de leur protection. Un dépôt public reste lisible ; ses anciens contenus et les anciens déploiements peuvent conserver des copies des images.
