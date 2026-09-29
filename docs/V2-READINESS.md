# FyxBot V2 — suivi post-publication

La V2 est publique. Ce document conserve les contrôles restants, les preuves de
qualité et les tâches qui doivent encore être terminées avant la
commercialisation complète de Premium.

## Règle de validation

Une section est considérée comme terminée uniquement si son comportement est
implémenté, testé et documenté. Une validation de production doit être ajoutée
lorsqu’elle est nécessaire. Toute action publique ou payante reste soumise à
une confirmation explicite du propriétaire.

## 1. Socle stable

- [x] Version unique entre le bot, le panel et le manifeste de publication.
- [x] Chargement modulaire des commandes Discord et absence de doublons.
- [x] Stockage PostgreSQL disponible avec repli SQLite contrôlé.
- [x] Sauvegardes chiffrées et tests automatisés de restauration.
- [x] Journalisation structurée et contrôles d'accès du panel.
- [x] Suite locale validée : 304 tests bot et 5 tests panel, lint, types et build.
- [ ] Mettre à jour automatiquement l'état du projet et la liste des commandes.
- [x] Relier le dossier source `C:\Fyxbot` au dépôt GitHub FyxBot ; le dépôt Git vide imbriqué dans `dashboard` a été sauvegardé localement avant son retrait.
- [ ] Effectuer un exercice réel de restauration R2 sans modifier la production.
- [ ] Consolider un historique de sept jours sans incident critique autour de la
  version publique.

## 2. FyxPilot Studio

- [x] Génération d'une structure depuis une description libre.
- [x] Aperçu avant application et sauvegarde avant modification.
- [x] Synchronisation, reconstruction et restauration d'un serveur.
- [x] Afficher un comparatif lisible : ajout, modification, suppression et résultat projeté selon l'action choisie.
- [x] Enregistrer un brouillon et reprendre la configuration plus tard.
- [x] Afficher l'historique des changements avec leur auteur et leur résultat.
- [x] Proposer un retour arrière depuis le panel avec confirmation renforcée.
- [x] Afficher les permissions finales par rôle et par catégorie avant application, y compris les exceptions de salon.
- [x] Simuler la perspective réelle d'un rôle sur les salons existants, avec alertes de sécurité explicables et sans mutation Discord.
- [x] Étendre FyxVision au compte Discord connecté pour reproduire ses permissions combinées et ses exceptions de salon.

## 3. FyxStream

- [x] Connexion OAuth Twitch et stockage chiffré des jetons.
- [x] Chat IRC, commandes personnalisées et protections de base.
- [x] Commandes de modération `!mod`, `!ban`, `!unban`, `!timeout`, `!clear` et `!slow`.
- [x] Afficher précisément les autorisations manquantes et proposer la reconnexion.
- [x] Conserver un journal borné des vingt dernières actions de modération Twitch, sans enregistrer le motif saisi dans le chat.
- [x] Vérifier la reconnexion OAuth réelle, les autorisations de modération et le chat opérationnel sur la chaîne `fyxstream`.
- [x] Alerter le propriétaire si la connexion expire ou si le parcours OAuth échoue.

## 4. Free et Premium

- [x] Accès Fondateur de trente jours pour les cent premiers utilisateurs.
- [x] Limites Free et Premium conservant les réglages existants.
- [x] Application de Premium à plusieurs serveurs administrés par le bénéficiaire.
- [ ] Valider la grille définitive des fonctions et les tarifs.
- [ ] Tester les SKU Discord, l'activation, l'expiration, l'annulation et le remboursement.
- [x] Ajouter l'attribution gratuite propriétaire/partenaire avec historique d'attribution et de révocation.
- [ ] Publier une présentation claire des limites avant tout achat.

## 5. Préproduction et qualité

- [ ] Créer un environnement Railway de préproduction sans dupliquer inutilement les services coûteux.
- [ ] Utiliser des identifiants Discord et Twitch de développement séparés.
- [x] Exécuter la validation bot, le lint, les tests et le build du panel.
- [ ] Tester les commandes Discord sur plusieurs serveurs et plusieurs niveaux de permissions.
- [ ] Vérifier les parcours mobile, clavier, chargement, vide, succès et erreur.
- [ ] Vérifier les limites de débit, CSRF, OAuth, permissions et suppression des données.
- [ ] Réaliser un test de charge borné après accord sur le budget Railway.

## 6. Publication et suivi 2.0.x

- [x] Mettre à jour `README.md`, `COMMANDES.md`, `CHANGELOG.md` et les pages légales.
- [x] Préparer le manifeste 2.0.0 et l'annonce Discord.
- [x] Déployer la V2 en production et vérifier le bot, le panel et l’API jusqu’à
  l’état Railway `SUCCESS`.
- [ ] Faire un contrôle final de la vérification et de la monétisation Discord.
- [ ] Préparer le tutoriel d'installation, le support et la campagne Pulse.
- [ ] Déployer d'abord en préproduction, puis promouvoir le même code en production.
- [ ] Publier la consolidation 2.0.1 après validation locale et confirmation.

## Définition de terminé

Le socle V2 est considéré comme public lorsqu’un nouvel administrateur peut
inviter FyxBot, décrire son serveur, prévisualiser les changements, les appliquer,
les comprendre et revenir en arrière. La préproduction, l’exercice réel R2 et le
cycle payant Discord restent des contrôles séparés avant la commercialisation
complète de Premium.
