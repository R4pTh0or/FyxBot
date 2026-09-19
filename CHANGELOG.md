# Changelog FyxBot

Les évolutions importantes de FyxBot sont documentées dans ce fichier et sur la page publique `/changelog`.

## V2 — Chantier local, non publié

### Stabilisation de la future version 2.0.0

- Documentation alignée sur la version 1.5.0 et checklist V2 centralisée dans `docs/V2-READINESS.md`.
- Données de test isolées dans un dossier temporaire afin qu'une validation locale ne lise ou ne modifie jamais la base de développement.
- Validation locale complète : syntaxe, types, 277 tests bot, lint, build et 5 tests panel.
- FyxPilot Studio affiche maintenant les ajouts, corrections, éléments conservés et suppressions exactes avant application, avec une projection adaptée à l'action choisie.
- Les brouillons, l'historique avec auteur et le retour arrière guidé sont intégrés au parcours FyxPilot.
- Préproduction, exercice réel de restauration R2 et période de stabilité requis avant toute annonce 2.0.0.

### FyxStream intégré

- Regroupement des fonctions Twitch dans FyxBot, sans service ou domaine FyxStream séparé.
- Connexion OAuth, chat IRC, commandes personnalisées, protections et réception sécurisée des événements Twitch.
- Commandes de modération `!mod`, `!ban`, `!unban`, `!timeout`, `!clear` et `!slow`.
- Les connexions antérieures aux nouvelles autorisations de modération doivent être reconnectées une fois depuis le panel.
- Le journal de modération, les alertes OAuth et le test réel sur une chaîne de développement restent nécessaires avant de déclarer la V2 terminée.

Cette section décrit des changements locaux non publiés. La version publique reste celle indiquée par le manifeste de publication.

## [1.5.0] — 28 août 2026

### Ajouté

- Accès Fondateur FyxBot Premium offert pendant trente jours aux 100 premiers utilisateurs Discord.
- Une seule place consommée par compte Discord, avec application possible sur plusieurs serveurs administrés pendant la période active.
- Activation depuis la commande `/premium activer` ou depuis le Control Center avec confirmation explicite et date d’expiration affichée.
- Compteur global atomique empêchant de dépasser cent bénéficiaires, même lors d’activations simultanées.
- Limites Free actives : un panneau de tickets, un panneau de rôles et une source sociale automatique.
- Limites Premium renforcées : vingt-cinq panneaux de tickets, vingt-cinq panneaux de rôles et dix sources sociales automatiques.

### Corrigé

- Permissions guidées automatiquement : `📌 ACCUEIL` reste visible au rôle le plus bas, les autres espaces membres s’ouvrent après acceptation du règlement et `🔐 STAFF` reste réservé aux rôles d’équipe.
- Migration contrôlée des serveurs déjà configurés, avec sauvegarde et vérification avant validation de chaque correction.

### Transparence et données

- Aucun moyen de paiement, aucun abonnement, aucun renouvellement automatique et aucun prélèvement pour l’accès Fondateur.
- Retour automatique à Free après trente jours sans suppression des réglages déjà créés.
- Conditions d’utilisation et politique de confidentialité complétées avec les données et règles propres à l’offre Fondateur.
- Sauvegardes locales de structure chiffrées et vérifiées, y compris conversion automatique des anciennes copies en clair.
- Transcripts nettoyés des secrets, identifiants d’auteur et URL privées de pièces jointes ; sessions et états OAuth expirés purgés automatiquement.

## [1.4.0] — 26 août 2026

### Ajouté

- Centre d’assistance privé dans le Control Center pour créer et suivre une demande liée à un serveur administré.
- Boîte de réception globale réservée au propriétaire de FyxBot avec gestion du statut et de la priorité.
- Conversations persistantes entre l’administrateur du serveur et l’équipe FyxBot, accompagnées d’un historique des décisions.
- Catégories dédiées aux problèmes techniques, à la configuration, à Premium, aux abus, aux données personnelles et à la sécurité.
- FAQ intégrée et lien facultatif vers le serveur Discord d’assistance.
- Gestion d’une équipe Support avec droits Modérateur et Administrateur attribuables depuis l’espace Créateur.
- Accès gradués : traitement des demandes et statuts pour les modérateurs, priorités supplémentaires pour les administrateurs, gestion de l’équipe réservée au propriétaire.

### Sécurité et données

- Isolation stricte des demandes par compte Discord et serveur administrable, avec accès global réservé au propriétaire de l’application.
- Protection CSRF, validation et taille maximale des messages, limite de cinq demandes actives par utilisateur et cent messages par conversation.
- Suppression des demandes, messages et événements associés lorsqu’un serveur demande l’effacement de ses données FyxBot.

### Corrigé

- Les quatre boutons de la page Support ouvrent maintenant directement le formulaire interne du Control Center avec la catégorie adaptée, même lorsqu’une connexion Discord est nécessaire.

## [1.3.0] — 25 août 2026

### Ajouté

- Commande `/communaute evenement` et formulaire du Control Center pour programmer un événement Discord natif avec lieu externe ou salon vocal.
- Commande `/communaute concours` et formulaire du Control Center avec participation unique, nombre de gagnants configurable et tirage automatique.
- Suivi des événements à venir et des concours actifs dans la section Communauté du panel.
- Permission Créer des événements ajoutée au lien d’invitation et au diagnostic FyxBot, sans demander Administrateur.

### Données et sécurité

- Identifiants des participants aux concours conservés uniquement jusqu’au tirage puis supprimés automatiquement.
- Isolation des concours par serveur, salon et message Discord.
- Conditions d’utilisation et politique de confidentialité complétées pour les événements et concours.

## [1.2.0] — 24 août 2026

### Ajouté

- Constructeur de messages dans le Control Center avec aperçu fidèle au rendu Discord.
- Modèle Changelog avec version, environnement, lien et mise en forme en embed.
- Combinaison libre de texte, embed, grande image, miniature, couleur et bouton HTTPS.
- Commandes `/message envoyer` et `/message changelog` pour publier directement depuis Discord.
- Salon `🛠️・changelog` créé automatiquement pendant la configuration d’un serveur.
- Diffusion sans doublon des nouvelles versions et des correctifs après chaque déploiement.
- Audit réel du serveur avant configuration avec recommandations de complément, synchronisation ou reconstruction.
- Permissions de référence appliquées aux rôles, catégories et salons FyxBot.
- Messages par défaut pour l’accueil, les départs et les annonces d’anniversaire.
- Conception de serveur à partir d’une description libre, sans choix de profil prédéfini.
- Aperçu obligatoire des rôles, catégories et salons proposés avant application.
- Sauvegarde automatique avant chaque configuration et commande `/setup restaurer` pour revenir en arrière.
- Restauration des permissions et des identifiants utilisés par les modules FyxBot.
- Format `emoji・nom-du-salon` appliqué à tous les salons générés par FyxBot.
- Message d’arrivée envoyé dans le premier salon accessible avec un bouton vers le Control Center.
- Parcours guidé du panel avec sept étapes et progression calculée depuis la configuration réelle.
- Notifications automatiques des nouvelles vidéos YouTube et des nouveaux lives Twitch, sans republier l’ancien contenu à l’activation.
- Gestion des sources sociales automatiques depuis Discord et depuis le panel.
- Commande `/communaute sondage` pour publier des sondages Discord natifs.
- Espace et commande FyxBot Premium préparés sans activer de paiement ni limiter les fonctions existantes.

### Sécurité

- Liens et images limités aux adresses HTTPS.
- Mentions automatiques désactivées dans les messages personnalisés pour éviter les notifications involontaires.
- Le setup adapte désormais les permissions des rôles à celles réellement accordées au bot, sans exiger Administrateur.

### Corrigé

- `/setup lancer` ne bloque plus lors de la création du rôle Fondateur si FyxBot ne possède pas la permission Administrateur.
- Utilisation du nouveau format de couleurs de rôles recommandé par discord.js.
- Les confirmations éphémères des commandes et de l’acceptation du règlement disparaissent automatiquement.
- Toutes les réponses de commandes et de boutons FyxBot disparaissent automatiquement après leur affichage, y compris les réponses publiques.
- `/reglement publier` répond immédiatement et indique précisément les permissions manquantes dans le salon choisi.

## [1.1.0] — 24 août 2026

### Ajouté

- Système de règlement interactif avec modèles, modification et rôle après acceptation.
- Système d’anniversaires volontaire avec annonces automatiques et fuseaux horaires.
- Notifications manuelles de lancement de live et de sortie de vidéo.
- Générateur de salons vocaux temporaires et commandes de contrôle pour leur propriétaire.
- Configuration de ces quatre modules depuis le Control Center.
- Page publique de changelog.

### Confidentialité

- Le système d’anniversaires ne conserve que le jour et le mois choisis par le membre.
- Chaque membre peut supprimer sa date avec `/anniversaire supprimer`.

## [1.0.0] — 23 août 2026

### Ajouté

- Lancement public de FyxBot et du Control Center.
- Modération, avertissements persistants, tickets, rôles interactifs, accueil, suggestions, AutoMod et logs.
- Authentification Discord et isolation de la configuration par serveur.
