# Gérer les réalisations

Ouvrir `https://votre-domaine.fr/admin.html` et saisir le mot de passe réservé au salon.

Pour publier : choisir la catégorie et le titre, ajouter les deux photos avant/après, confirmer leur autorisation de publication, puis cliquer sur **Publier la réalisation**. Conserver les justificatifs séparément, hors du dépôt et du site.

Les images sont préparées par le navigateur puis décodées et réencodées sur le serveur. Leurs dimensions réelles sont contrôlées et leurs métadonnées retirées. Utiliser des photos JPEG, PNG ou WebP prises dans des conditions comparables. Les données envoyées au serveur doivent peser au maximum 1,5 Mo par photo.

Les fichiers sont conservés dans un stockage privé. Le site ne sert aux visiteurs que les photos des réalisations visibles.

- **Masquer** : retire la réalisation de la galerie et bloque ses liens directs pour les visiteurs. Elle reste consultable dans l’administration.
- **Afficher** : demande de confirmer que l’autorisation de publication est toujours valable.
- **Supprimer** : retire immédiatement la publication et efface ses médias privés. Les photos initiales ne sont plus accessibles depuis le site, même si leur fichier reste dans le paquet serveur.
- **Réessayer la suppression** : termine une suppression de fichiers qui a échoué. La réalisation reste inaccessible au public pendant cette reprise.

Le retrait du site ne rappelle pas les copies déjà téléchargées. Pour les anciennes photos publiées sur GitHub ou via un ancien déploiement, faire aussi traiter ces copies par le responsable du site.

Se déconnecter à la fin de l’utilisation. La déconnexion révoque la session sur le serveur ; une panne de ce service est signalée au lieu d’afficher un faux succès. Les sessions expirent après huit heures. Changer le mot de passe ou le secret de signature invalide les sessions précédentes une fois la nouvelle configuration appliquée aux déploiements.

En cas de demande de retrait, commencer par masquer la réalisation, puis procéder à sa suppression. Vérifier les éventuelles copies publiques historiques et tenir compte de la demande lors des restaurations de sauvegardes.
