# Corrections du 17 octobre 2026

Cette proposition corrige les défauts identifiés sur la version `1cf30ab` avant déploiement.

## Changements réalisés

- Aucun retour de photos initiales en cas de panne de galerie.
- Médias privés servis par une route qui contrôle leur publication ; les photos masquées sont réservées à l’administrateur et les photos supprimées ne sont plus servies.
- Photos initiales exclues du dossier statique publié. L’index est explicitement initialisé ou migré : un retrait ne peut pas être annulé par une réinsertion automatique.
- Suppressions échouées conservées dans l’administration avec une action de reprise ; nettoyage des fichiers privés orphelins prévu dans l’outil d’exploitation.
- Sessions enregistrées avec expiration dans Redis, révocation à la déconnexion et invalidation lors d’un changement du mot de passe ou du secret.
- Un index Redis unique remplace les lectures de toutes les fiches Blob à chaque visite ; limites sur lectures et écritures ; modifications atomiques pour éviter les mises à jour concurrentes perdues.
- Images réellement décodées, redimensionnées et réencodées en WebP sur le serveur ; rejet des fichiers corrompus et dimensions excessives ; métadonnées supprimées.
- Undici mis à jour de 6.28.0 à 6.29.1. Audit npm : zéro vulnérabilité connue lors du contrôle.
- Sauvegarde chiffrée et restauration avec toutes les photos masquées, migration de l’ancien stockage et reprise du nettoyage.
- URL canoniques absolues générées au build, prévisualisations non indexables, contenu public construit par liste explicite de fichiers.
- Information sur les photos et leur retrait complétée. Les coordonnées du médiateur sont injectées depuis la configuration et exigées en production.

## Validation

`npm run verify` : syntaxe et 36 tests réussis. Les tests couvrent notamment le navigateur en panne, le rejeu des sessions, les liens directs après masquage, la suppression interrompue, les modifications concurrentes, la validation réelle des images, le format de réponse du SDK Redis, les archives chiffrées altérées et la migration d’anciens retraits.

`npm run build` : dossier public généré. Les tests de construction production vérifient les URL finales, l’échappement des informations et le refus des paramètres manquants. `npm audit --omit=dev --json` : zéro vulnérabilité signalée.

Les appels Vercel Blob et Redis sont simulés dans les tests ; aucune opération sur les vraies photos ou les vrais comptes n’a été exécutée. La recette sur un déploiement de test reste requise avant production.

## À terminer avec les accès et informations du propriétaire

1. Fournir le domaine définitif et les coordonnées du médiateur conventionné, puis confirmer la politique de conservation et les autorisations des photos.
2. Configurer un nouveau stockage Blob privé et une base Redis séparés pour chaque environnement ; initialiser ou migrer avant ouverture du nouveau site.
3. Vérifier les nouvelles publications, puis supprimer les anciennes URL publiques avec le manifeste de migration. Traiter séparément les anciens déploiements et les photos de l’historique GitHub si un retrait est nécessaire.
4. Régler les protections des comptes, les alertes d’erreur et de consommation, la rétention des journaux et une sauvegarde quotidienne avec rotation de 30 jours. Le dépôt fournit les outils ; leur planification et ces réglages de compte ne sont pas activés automatiquement.

La procédure détaillée et la recette sont dans `VERCEL-CONFIGURATION.md`. Le site n’a pas été déployé et la branche principale n’a pas été modifiée par cette proposition.
