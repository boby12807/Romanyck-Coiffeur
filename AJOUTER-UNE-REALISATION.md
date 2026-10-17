# Ajouter ou retirer des photos

Le site est une vitrine statique. Les visiteurs n’ont aucun formulaire de publication, compte ou accès en écriture. Les modifications passent par les comptes GitHub et Vercel autorisés du propriétaire. Protéger ces comptes par la double authentification et vérifier leurs collaborateurs ; un dépôt public n’accorde pas de droit de modification aux visiteurs.

## Ajouter une réalisation

1. Conserver les preuves d’autorisation de publication séparément, hors du dépôt public.
2. Ajouter la photo avant et la photo après dans `assets/realisations/`, avec des noms explicites sans nom de cliente ou autre donnée personnelle.
3. Dans `lib/default-realisations.js`, copier une réalisation existante, choisir un identifiant unique, préciser le titre, la catégorie et l’ordre. Renseigner `before.fallback` et `after.fallback` avec les deux chemins et des textes alternatifs descriptifs. Les dimensions réelles sont calculées automatiquement.
4. Utiliser de vraies images JPEG, PNG ou WebP, sans animation. La construction du site les décode, les redimensionne et les convertit en WebP sans métadonnées EXIF/GPS. Les originaux ne sont pas copiés dans le site publié.
5. Exécuter `npm run verify` et `npm run build`, examiner la prévisualisation Vercel, puis fusionner les modifications dans `main` pour mettre à jour le site public.

## Retirer une réalisation

Retirer son objet de `lib/default-realisations.js` (ou mettre `visible: false`), puis publier la mise à jour. La construction repart d’un dossier public vide et ne copie que les photos des réalisations encore publiées. Il n’y a aucun secours qui réintroduit une photo retirée. Retirer aussi les originaux du dépôt si leur conservation publique n’est plus autorisée.

Les anciennes versions Vercel, l’historique du dépôt public et les copies déjà téléchargées peuvent conserver les images. Une demande de retrait doit donc aussi prendre en compte ces anciennes versions ; masquer dans la liste actuelle ne supprime pas ces copies historiques. Coordonner toute réécriture de l’historique avec le propriétaire.

Les versions du dépôt permettent de retrouver le travail et les anciens contenus. Avant de restaurer une version, vérifier qu’elle ne republie pas une photo dont l’autorisation a été retirée.
