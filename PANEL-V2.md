# FyxBot Panel V2

## Statut

La V2 est l’interface principale du Control Center public. Les routes `/` et `/v2` utilisent toutes les deux cette interface afin de conserver les anciens liens. Toute nouvelle modification continue d’être préparée et testée dans `C:\Fyxbot` avant une publication Railway explicitement autorisée.

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

## Fondations intégrées

- Nouvelle identité visuelle `Control Center V2`, toujours rouge et orange.
- Routes `/` et `/v2` conservées, avec indexation limitée à la page publique principale.
- Centre de pilotage enrichi avec progression réelle de la configuration.
- Accès direct au démarrage, à la sécurité, aux tickets et au support.
- Activité récente issue des journaux réels du serveur.
- Bibliothèque de modules plus compacte et plus lisible.
- FyxPilot Studio avec aperçu, historique et retour arrière contrôlé.
- FyxJourney avec score pondéré, diagnostic explicable et plan d’actions priorisé.
- FyxVision avec simulation en lecture seule des permissions réelles d'un rôle Discord.
- Assistance : compteur et filtre des demandes à traiter, alerte visible hors de l’onglet et lien direct vers une conversation (accès toujours contrôlé).
- En production, les nouvelles demandes et réponses déclenchent des messages privés Discord discrets. En local, aucun message privé n’est envoyé ; un refus de MP n’empêche pas l’enregistrement de la demande.

## Étapes suivantes proposées

1. Finaliser la consolidation 2.0.1 et vérifier FyxJourney sur plusieurs serveurs.
2. Tester les parcours mobile, clavier, chargement, vide, succès et erreur.
3. Étendre FyxVision à un membre cumulant plusieurs rôles Discord.
4. Étendre FyxTwin à plusieurs brouillons comparables sans mutation du serveur.
5. Préparer FyxFlow et ses automatisations avec simulation avant activation.

Ces étapes restent locales tant que leur déploiement n’a pas été confirmé séparément.
