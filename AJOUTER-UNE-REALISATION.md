# Ajouter une réalisation depuis votre ordinateur

Une fois le site publié sur Vercel, ouvrez :

`https://votre-domaine.fr/admin.html`

1. Saisissez votre mot de passe administrateur.
2. Choisissez la catégorie et le titre de la réalisation.
3. Sélectionnez la photo **avant** depuis votre ordinateur.
4. Sélectionnez la photo **après**.
5. Cliquez sur **Publier la réalisation**.

Depuis la même page, vous pouvez ensuite modifier le titre, masquer ou afficher une
réalisation, changer son ordre et la supprimer avec ses photos.

Les photos sont automatiquement redimensionnées et converties en WebP avant l’envoi. Elles
sont ensuite enregistrées dans Vercel Blob et apparaissent dans la rubrique « Avant / Après »
du site public.

## Conseils pour les photos

- Utilisez deux photos prises avec le même cadrage et la même orientation.
- Préférez un fond simple et une lumière similaire.
- Vérifiez que la cliente ou le client a autorisé la publication.
- Ne publiez aucune information personnelle dans le titre ou la description.

## Protection

La page d’administration demande le mot de passe défini dans la variable Vercel
`ADMIN_UPLOAD_PASSWORD`. La session est signée par `ADMIN_SESSION_SECRET`. Ne partagez pas
ces valeurs et ne les inscrivez jamais dans un fichier du site.
