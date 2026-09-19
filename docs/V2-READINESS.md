# FyxBot V2 — critères de préparation

Ce document définit ce que signifie « V2 terminée ». Il sert de liste de contrôle
avant la publication et évite qu'un simple changement de numéro de version soit
présenté comme une nouvelle version majeure.

## Règle de validation

Une section est considérée comme terminée uniquement si son comportement est
implémenté, testé localement, vérifié en préproduction et documenté. Toute action
publique ou payante reste soumise à une validation explicite du propriétaire.

## 1. Socle stable

- [x] Version unique entre le bot, le panel et le manifeste de publication.
- [x] Chargement modulaire des commandes Discord et absence de doublons.
- [x] Stockage PostgreSQL disponible avec repli SQLite contrôlé.
- [x] Sauvegardes chiffrées et tests automatisés de restauration.
- [x] Journalisation structurée et contrôles d'accès du panel.
- [x] Suite locale validée : 275 tests bot et 5 tests panel, lint, types et build.
- [ ] Mettre à jour automatiquement l'état du projet et la liste des commandes.
- [x] Relier le dossier source `C:\Fyxbot` au dépôt GitHub FyxBot ; le dépôt Git vide imbriqué dans `dashboard` a été sauvegardé localement avant son retrait.
- [ ] Effectuer un exercice réel de restauration R2 sans modifier la production.
- [ ] Observer sept jours sans incident critique avant la publication 2.0.0.

## 2. FyxPilot Studio

- [x] Génération d'une structure depuis une description libre.
- [x] Aperçu avant application et sauvegarde avant modification.
- [x] Synchronisation, reconstruction et restauration d'un serveur.
- [ ] Afficher un comparatif lisible : ajout, modification et suppression.
- [ ] Enregistrer un brouillon et reprendre la configuration plus tard.
- [ ] Afficher l'historique des changements avec leur auteur et leur résultat.
- [ ] Proposer un retour arrière depuis le panel avec confirmation renforcée.
- [ ] Afficher les permissions finales par rôle et par catégorie avant application.

## 3. FyxStream

- [x] Connexion OAuth Twitch et stockage chiffré des jetons.
- [x] Chat IRC, commandes personnalisées et protections de base.
- [x] Commandes de modération `!mod`, `!ban`, `!unban`, `!timeout`, `!clear` et `!slow`.
- [ ] Afficher précisément les autorisations manquantes et proposer la reconnexion.
- [ ] Conserver un journal borné des actions de modération Twitch.
- [ ] Tester le parcours complet sur une chaîne Twitch de développement.
- [ ] Alerter le propriétaire si la connexion ou le renouvellement OAuth échoue.

## 4. Free et Premium

- [x] Accès Fondateur de trente jours pour les cent premiers utilisateurs.
- [x] Limites Free et Premium conservant les réglages existants.
- [x] Application de Premium à plusieurs serveurs administrés par le bénéficiaire.
- [ ] Valider la grille définitive des fonctions et les tarifs.
- [ ] Tester les SKU Discord, l'activation, l'expiration, l'annulation et le remboursement.
- [ ] Ajouter l'attribution gratuite propriétaire/partenaire avec journal d'audit.
- [ ] Publier une présentation claire des limites avant tout achat.

## 5. Préproduction et qualité

- [ ] Créer un environnement Railway de préproduction sans dupliquer inutilement les services coûteux.
- [ ] Utiliser des identifiants Discord et Twitch de développement séparés.
- [ ] Exécuter la validation bot, le lint, les tests et le build du panel.
- [ ] Tester les commandes Discord sur plusieurs serveurs et plusieurs niveaux de permissions.
- [ ] Vérifier les parcours mobile, clavier, chargement, vide, succès et erreur.
- [ ] Vérifier les limites de débit, CSRF, OAuth, permissions et suppression des données.
- [ ] Réaliser un test de charge borné après accord sur le budget Railway.

## 6. Publication 2.0.0

- [ ] Mettre à jour `README.md`, `COMMANDES.md`, `CHANGELOG.md` et les pages légales.
- [ ] Préparer le manifeste 2.0.0 et l'annonce Discord sans la publier immédiatement.
- [ ] Faire un contrôle final de la vérification et de la monétisation Discord.
- [ ] Préparer le tutoriel d'installation, le support et la campagne Pulse.
- [ ] Déployer d'abord en préproduction, puis promouvoir le même code en production.
- [ ] Vérifier Railway jusqu'à l'état `SUCCESS`, puis contrôler le panel, l'API, Discord et Twitch.

## Définition de terminé

La V2 peut être annoncée lorsqu'un nouvel administrateur peut inviter FyxBot,
décrire son serveur, prévisualiser les changements, les appliquer, les comprendre
et revenir en arrière sans assistance technique. Les parcours Discord, Twitch,
Premium, sauvegarde et suppression des données doivent fonctionner de bout en
bout, avec une documentation identique à la version réellement déployée.
