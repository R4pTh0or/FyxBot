# Commandes du bot Discord FyxBot

Ce document présente les commandes actuellement disponibles sur FyxBot.

Les réponses temporaires aux commandes et aux boutons disparaissent automatiquement environ 8 secondes après leur affichage. Les panneaux et messages publiés dans un salon restent visibles.

## Utilitaire

### `/ping`

Affiche la latence du bot et de sa connexion à Discord.

**Exemple :**

```text
/ping
```

## Modération

### `/ban`

Bannit un membre du serveur.

**Permission requise :** Bannir des membres

**Options :**

- `membre` — membre à bannir, obligatoire
- `raison` — motif du bannissement
- `messages` — nombre d’heures de messages à supprimer, de 0 à 168

### `/kick`

Expulse un membre du serveur.

**Permission requise :** Expulser des membres

**Options :**

- `membre` — membre à expulser, obligatoire
- `raison` — motif de l’expulsion

### `/timeout`

Place temporairement un membre en sourdine.

**Permission requise :** Exclure temporairement des membres

**Options :**

- `membre` — membre concerné, obligatoire
- `duree` — durée du timeout, obligatoire
- `unite` — minutes, heures ou jours, obligatoire
- `raison` — motif du timeout

Discord limite les timeouts à 28 jours.

### `/unban`

Révoque le bannissement d’un utilisateur.

**Permission requise :** Bannir des membres

**Options :**

- `utilisateur` — identifiant Discord de l’utilisateur, obligatoire
- `raison` — motif du débannissement

### `/clear`

Supprime plusieurs messages récents du salon.

**Permission requise :** Gérer les messages

**Options :**

- `nombre` — nombre de messages à supprimer, de 1 à 100

Les messages de plus de 14 jours ne peuvent pas être supprimés en masse par Discord.

### `/warn`

Ajoute un avertissement persistant à un membre.

**Permission requise :** Exclure temporairement des membres

**Options :**

- `membre` — membre à avertir, obligatoire
- `raison` — motif de l’avertissement, obligatoire

### `/warnings liste`

Affiche les 10 avertissements les plus récents d’un membre.

### `/warnings supprimer`

Supprime un avertissement grâce à son identifiant.

### `/warnings effacer`

Efface tous les avertissements d’un membre.

Les commandes `/warnings` nécessitent la permission **Exclure temporairement des membres**.

### `/modhelp`

Affiche la liste complète des commandes de modération FyxBot disponibles.

### `/slowmode`

Règle le mode lent du salon actuel ou d’un salon choisi. Utilisez `0` seconde pour le désactiver.

**Permission requise :** Gérer les salons

### `/lock` et `/unlock`

Verrouillent un salon pour les membres ou restaurent ensuite ses permissions héritées.

**Permission requise :** Gérer les rôles

## Informations

### `/avatar`

Affiche et permet de télécharger l’avatar d’un utilisateur.

### `/userinfo`

Affiche l’identifiant, les dates du compte et d’arrivée ainsi que les principaux rôles d’un membre.

### `/serverinfo`

Affiche le propriétaire, le nombre de membres, de salons et de rôles du serveur.

## Suggestions

### `/suggestion-config`

Configure le salon dans lequel les suggestions seront publiées.

**Permission requise :** Administrateur

- `salon` — salon textuel des suggestions, obligatoire

### `/suggestion`

Publie une idée dans le salon configuré et ajoute automatiquement les votes 👍 et 👎.

- `idee` — texte de la suggestion, obligatoire
- `anonyme` — masque facultativement l’identité dans la publication

## Rôles par boutons

### `/role-panel`

Publie un panneau permettant aux membres d’ajouter ou retirer eux-mêmes des rôles.

**Permission requise :** Administrateur

- `titre` — titre du panneau, obligatoire
- `description` — instructions facultatives
- `role1` — premier rôle, obligatoire
- `role2` à `role5` — rôles supplémentaires facultatifs

Le rôle **FyxBot** doit être placé au-dessus de tous les rôles proposés dans le panneau.

## Accueil et rôle automatique

### `/accueil-config`

Configure les messages d’arrivée et de départ ainsi que le rôle attribué automatiquement.

**Permission requise :** Administrateur

- `bienvenue` — salon des arrivées, obligatoire
- `depart` — salon des départs, facultatif
- `role` — rôle automatique, facultatif
- `message-bienvenue` — texte personnalisé facultatif
- `message-depart` — texte personnalisé facultatif

Variables utilisables dans les messages : `{membre}`, `{serveur}` et `{nombre}`.
Si aucun texte personnalisé n’est fourni, FyxBot utilise automatiquement un message de bienvenue et un message de départ prêts à l’emploi.

## Règlement interactif

### `/reglement publier`

Publie un règlement personnalisé dans un salon textuel. Un rôle de validation facultatif peut être attribué avec le bouton **J’accepte le règlement**.

### `/reglement modele`

Publie un modèle prêt à personnaliser : communautaire, gaming, serveur Minecraft ou créateur de contenu.

### `/reglement modifier`

Modifie le titre, le contenu ou le rôle de validation du règlement déjà publié.

### `/reglement statut`

Affiche le salon et le rôle actuellement configurés.

Les commandes `/reglement` nécessitent la permission **Administrateur**. Le rôle FyxBot doit être placé au-dessus du rôle distribué.

## Anniversaires

### `/anniversaire definir`

Enregistre volontairement le jour et le mois d’anniversaire du membre. L’année de naissance n’est jamais demandée.

### `/anniversaire supprimer`

Supprime immédiatement la date enregistrée par le membre.

### `/anniversaire voir`

Affiche la date enregistrée pour soi-même ou un autre membre.

### `/anniversaire liste`

Affiche les 15 prochains anniversaires du serveur.

### `/anniversaire configurer`

Configure le salon des annonces, le fuseau horaire, le message et un rôle anniversaire facultatif.

**Permission requise pour la configuration :** Administrateur

Variables du message : `{membres}` et `{serveur}`.
Si `message` est omis, un message d’anniversaire FyxBot est enregistré automatiquement.

## Notifications sociales

### `/social configurer`

Choisit le salon des annonces et le rôle facultativement mentionné.

### `/social notifier`

Publie une annonce de lancement de live ou de nouvelle vidéo avec la plateforme, le créateur, le titre et un lien HTTPS.

### `/social statut`

Affiche le salon, le rôle et le nombre de sources automatiques configurées.

### `/social ajouter`

Ajoute une chaîne YouTube (`UC…`) ou Twitch à surveiller automatiquement.

### `/social sources`

Liste les sources automatiques et leur état de dernière vérification.

### `/social retirer`

Arrête la surveillance d’une source grâce à l’identifiant affiché par `/social sources`.

La permission **Gérer les messages** est requise. La configuration et la gestion des sources exigent également **Gérer le serveur**.

## Streaming Twitch

Le module Streaming est piloté depuis le Control Center. Il permet :

- la connexion et la déconnexion d’une chaîne Twitch par son administrateur ;
- l’activation du chat FyxBot et le choix du préfixe ;
- la création, la modification, l’activation et la suppression de commandes personnalisées ;
- un délai par utilisateur et par commande, ainsi que des niveaux d’accès ;
- les protections facultatives contre les liens, les majuscules excessives et les répétitions.

Les commandes de chat réservées à FyxBot sont `!commands`, `!discord`, `!socials`,
`!uptime`, `!mod`, `!ban`, `!unban`, `!timeout`, `!clear` et `!slow`. Les six
dernières commandes sont réservées aux modérateurs Twitch et au diffuseur. Une
reconnexion Twitch depuis le panel est nécessaire lors de leur première activation
afin d’accorder les permissions de modération officielles. Une commande personnalisée ne
peut pas reprendre un nom réservé. Si un autre bot Twitch possède une commande
du même nom, il peut toujours produire une réponse externe supplémentaire.

## Communauté

### `/communaute sondage`

Publie un sondage Discord natif avec 2 à 4 réponses, une durée et le multichoix facultatif.

### `/communaute evenement`

Programme un événement dans l’interface native de Discord. Indiquez le titre, la date au format `JJ/MM/AAAA`, l’heure au format `HH:MM`, le fuseau et, selon le type choisi, un lieu externe ou un salon vocal. La permission **Créer des événements** est requise pour l’utilisateur et pour FyxBot.

### `/communaute concours`

Publie un concours dans le salon choisi avec un bouton de participation, entre 1 et 5 gagnants et un tirage automatique. Une seule participation est acceptée par membre. Les identifiants des participants sont supprimés de la base après le résultat.

## Premium — reporté

FyxBot Premium est conservé pour une version ultérieure. Aucune commande `/premium`, aucun paiement et aucune limitation Premium ne sont publiés dans la version 1.3.0.

## Messages personnalisés et changelog

### `/message envoyer`

Publie dans le salon choisi un message composé de texte, d’un embed, d’une grande image jointe, d’une miniature et d’un bouton facultatifs.

### `/message changelog`

Publie une note de version structurée comme un changelog Discord avec titre, description, version, couleur, image et lien facultatifs.

La permission **Gérer les messages** est requise. Les liens et les images doivent utiliser HTTPS. Les mêmes possibilités sont disponibles dans la section **Messages** du Control Center avec un aperçu avant envoi.

## Salons vocaux temporaires

### `/vocal-temporaire configurer`

Crée un salon générateur. Lorsqu’un membre le rejoint, FyxBot crée automatiquement son salon personnel dans la catégorie choisie.

### `/vocal-temporaire statut`

Affiche le générateur et le nombre de salons temporaires suivis.

### Commandes du propriétaire

- `/vocal-temporaire nommer`
- `/vocal-temporaire limite`
- `/vocal-temporaire verrouiller`
- `/vocal-temporaire ouvrir`
- `/vocal-temporaire autoriser`
- `/vocal-temporaire expulser`
- `/vocal-temporaire transferer`

Un salon temporaire vide est automatiquement supprimé. La sous-commande `configurer` nécessite la permission **Administrateur**.

## Sécurité AutoMod

### `/securite activer`

Active quatre protections natives Discord : liens, invitations, spam et mentions excessives.

**Permission requise :** Administrateur

- `role-exempte` — rôle de confiance facultatif qui contourne les filtres
- `salon-exempte` — salon facultatif dans lequel les filtres ne s’appliquent pas

### `/securite desactiver`

Désactive les règles AutoMod créées par FyxBot sans les supprimer.

### `/securite statut`

Affiche les protections actives et désactivées.

Les alertes AutoMod sont envoyées dans le salon choisi avec `/logs-config`.

## Configuration automatique

### `/setup concevoir description:...`

L’administrateur décrit librement l’objectif du serveur, son public et les fonctions souhaitées. FyxBot génère alors une proposition personnalisée de rôles, catégories, salons texte et salons vocaux. Aucun profil prédéfini n’est demandé et aucune modification Discord n’est effectuée à cette étape.

Tous les salons proposés suivent le format `emoji・nom-du-salon`.

### `/setup analyser` ou `/setup aperçu`

Compare les rôles, catégories, salons et permissions actuels à la dernière proposition personnalisée. `/setup aperçu` réaffiche la proposition complète.

Le diagnostic privé reste affiché jusqu’à sa fermeture manuelle afin de laisser le temps de le lire.

### `/setup completer confirmation:COMPLETER`

Crée uniquement les éléments FyxBot absents sans supprimer ni modifier les éléments supplémentaires du serveur.

### `/setup synchroniser confirmation:SYNCHRONISER`

Complète la structure et applique les permissions de référence aux rôles, catégories et salons FyxBot.

### `/setup lancer confirmation:CONFIRMER`

Ancien raccourci conservé : complète et synchronise la structure sans suppression.

### `/setup reconstruire confirmation:TOUT SUPPRIMER`

Crée une sauvegarde, supprime tous les salons et rôles que FyxBot peut gérer, puis applique la proposition personnalisée. Cette action est réservée aux tests ou aux reconstructions explicitement confirmées.

Une sauvegarde est également créée avant les actions non destructives afin de pouvoir annuler une mauvaise synchronisation.

### `/setup sauvegardes`

Affiche les dix sauvegardes locales les plus récentes du serveur.

### `/setup restaurer confirmation:RESTAURER [sauvegarde]`

Restaure la sauvegarde indiquée, ou la plus récente si aucun nom n’est fourni. Les rôles, salons, permissions et identifiants utilisés par la configuration FyxBot sont recréés. L’état présent est sauvegardé une nouvelle fois avant la restauration.

**Permission requise :** Administrateur

## Tickets

### `/ticket-panel`

Configure le système de tickets et publie le panneau permettant aux membres d’ouvrir un ticket privé.

**Permission requise :** Administrateur

**Options :**

- `categorie` — catégorie dans laquelle créer les tickets, obligatoire
- `staff` — rôle autorisé à voir et gérer les tickets, obligatoire

Le panneau comporte un bouton **Créer un ticket**. Dans chaque ticket, le staff peut utiliser les boutons pour fermer puis supprimer le salon.

## Logs et transcripts

### `/logs-config`

Choisit le salon dans lequel FyxBot envoie les journaux de modération, les événements de tickets et leurs transcripts.

**Permission requise :** Administrateur

**Options :**

- `salon` — salon textuel réservé aux logs, obligatoire

**Exemple :**

```text
/logs-config salon:#logs-fyxbot
```

## Gestion des catégories

Toutes les sous-commandes suivantes nécessitent la permission **Administrateur**.

### `/categorie creer`

Crée une catégorie.

- `nom` — nom de la catégorie, obligatoire
- `position` — position facultative dans la liste

### `/categorie renommer`

Renomme une catégorie existante.

- `categorie` — catégorie concernée, obligatoire
- `nom` — nouveau nom, obligatoire

### `/categorie supprimer`

Supprime une catégorie uniquement si elle est vide.

- `categorie` — catégorie à supprimer, obligatoire

### `/categorie synchroniser`

Synchronise les permissions de tous les salons enfants avec celles de leur catégorie.

- `categorie` — catégorie concernée, obligatoire

## Gestion des permissions

### `/diagnostic`

Analyse sans rien modifier les permissions du rôle FyxBot, les salons textuels et vocaux bloqués ainsi que la hiérarchie des rôles. Le rapport est privé et nécessite la permission **Gérer le serveur**.

Les actions de modification suivantes nécessitent la permission **Administrateur**.

### `/permissions definir`

Autorise ou refuse certaines permissions à un rôle sur un salon ou une catégorie.

- `salon` — salon ou catégorie concerné, obligatoire
- `role` — rôle concerné, obligatoire
- `voir` — autoriser ou refuser l’accès au salon
- `envoyer` — autoriser ou refuser les messages ou la parole
- `historique` — autoriser ou refuser la lecture de l’historique
- `gerer` — autoriser ou refuser la gestion du salon

Au moins une permission doit être indiquée.

### `/permissions heriter`

Supprime les réglages spécifiques d’un rôle afin de rétablir l’héritage des permissions.

- `salon` — salon ou catégorie concerné, obligatoire
- `role` — rôle concerné, obligatoire

### `/permissions copier`

Copie toutes les permissions d’un salon ou d’une catégorie vers un autre salon ou une autre catégorie.

- `source` — salon servant de modèle, obligatoire
- `destination` — salon à modifier, obligatoire

### `/permissions reparer-fyxbot`

Rétablit uniquement les permissions du membre FyxBot sur un salon ou une catégorie accessible. Les autres rôles et permissions ne sont pas modifiés.

- `salon` — salon ou catégorie à réparer, obligatoire

## Permissions nécessaires au rôle FyxBot

Pour utiliser toutes les fonctions, le rôle du bot doit disposer au minimum des permissions suivantes :

- Voir les salons
- Envoyer des messages
- Lire l’historique des messages
- Gérer les messages
- Gérer les salons
- Gérer les rôles
- Déplacer des membres
- Expulser des membres
- Bannir des membres
- Exclure temporairement des membres

Le rôle **FyxBot** doit être placé au-dessus des rôles des membres que le bot doit modérer.
