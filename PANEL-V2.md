# FyxBot Panel V2

## Statut

La V2 est un aperçu local isolé à l’adresse `/v2`. La V1 reste disponible à la racine `/` et aucun déploiement Railway n’est autorisé pendant cette phase de préparation.

## Lancement local complet

Deux processus sont nécessaires pour utiliser la connexion Discord :

1. Dans le dossier principal, lancer `pnpm run dashboard:local` pour l’API et l’authentification.
2. Dans le dossier `dashboard`, lancer `pnpm start` après la compilation du panel.
3. Ouvrir `http://127.0.0.1:3000/v2`.

Le mode `dashboard:local` se connecte à Discord uniquement pour alimenter le panel. Il ne charge ni les commandes, ni les événements, ni les automatisations du bot déjà actif sur Railway.

## Objectifs

- Accéder plus vite aux actions importantes.
- Réduire la charge visuelle sans retirer de fonction.
- Conserver les données et actions réelles du panel existant.
- Rendre l’état du serveur compréhensible par une personne peu habituée à Discord.
- Garantir un usage confortable sur ordinateur, tablette et téléphone.

## Première fondation intégrée

- Nouvelle identité visuelle `Control Center V2`, toujours rouge et orange.
- Route locale indépendante `/v2` avec interdiction d’indexation.
- Centre de pilotage enrichi avec progression réelle de la configuration.
- Accès direct au démarrage, à la sécurité, aux tickets et au support.
- Activité récente issue des journaux réels du serveur.
- Bibliothèque de modules plus compacte et plus lisible.
- V1 inchangée et toujours accessible sur `/`.

## Étapes suivantes proposées

1. Tester l’aperçu avec plusieurs tailles d’écran et corriger les détails visuels.
2. Recueillir les choix définitifs sur la navigation et la densité des pages.
3. Étendre progressivement la nouvelle présentation aux écrans de configuration.
4. Effectuer un audit complet d’accessibilité et de performance.
5. Préparer une migration contrôlée, avec retour possible vers la V1.

Les concepts produits gardés pour plus tard ne sont pas inclus dans cette V2 tant qu’ils n’ont pas été validés séparément.
