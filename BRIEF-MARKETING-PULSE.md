# Brief produit et marketing — Pulse

Mise à jour : 24 août 2026.

Ce document distingue strictement la production publique des fonctions seulement prêtes en local. Pulse ne doit publier, contacter un tiers ou engager une dépense qu’après validation explicite du créateur de FyxBot.

## Identité et liens officiels

- Nom : **FyxBot**.
- Positionnement utilisable : **le cockpit Discord francophone qui réunit sécurité, support et animation communautaire dans un panel clair**.
- Site et panel public : <https://fyxbot-panel-production.up.railway.app/>.
- Changelog public : <https://fyxbot-panel-production.up.railway.app/changelog>.
- Support : <https://fyxbot-panel-production.up.railway.app/support>.
- Conditions : <https://fyxbot-panel-production.up.railway.app/conditions-utilisation>.
- Confidentialité : <https://fyxbot-panel-production.up.railway.app/politique-confidentialite>.
- Support public : `fyxbotassistance@outlook.fr`.
- Langue et marché initial : France et communautés Discord francophones.

## État public vérifié

- Les versions **1.0.0**, **1.1.0** et **1.2.0** sont affichées comme disponibles.
- Le site, le panel, les pages légales et le support sont publics.
- Le lien d’invitation public utilise le masque `581641939577974` sans demander la permission Administrateur.
- Le parcours guidé, les sondages et les notifications automatiques peuvent être présentés comme disponibles. Premium reste une préparation sans paiement ni limitation active.

## Version 1.2.0 disponible publiquement

- Parcours guidé en sept étapes dans le panel, calculé depuis la configuration réelle du serveur.
- Message envoyé à l’arrivée du bot avec un bouton vers le panel, dans le premier salon où FyxBot peut écrire.
- Notifications automatiques des nouvelles vidéos YouTube et des nouveaux lives Twitch.
- Première détection sociale silencieuse pour ne pas annoncer un ancien contenu.
- Gestion des sources sociales depuis le panel et les commandes `/social ajouter`, `/social sources` et `/social retirer`.
- Sondages Discord natifs avec `/communaute sondage`.
- Présentation de FyxBot Premium dans le panel et via `/premium`, sans paiement ni limitation active.
- Validation locale la plus récente : **81 tests bot sur 81**, **3 tests panel sur 3**, contrôle qualité et compilation de production réussis. Ne pas annoncer le lot sécurité/Premium/tickets avant son déploiement groupé.
- Nombre de commandes publiées globalement : **29**.

## Fonctions principales déjà disponibles

- Modération : ban, kick, timeout, avertissements, nettoyage et débannissement.
- Sécurité : quatre protections AutoMod, vérifications de permissions et journaux.
- Tickets : plusieurs panneaux, salons privés, fermeture et transcripts.
- Configuration adaptative : description libre du serveur, aperçu, rôles, catégories, salons, sauvegarde et retour arrière.
- Règlement interactif et rôle après acceptation.
- Accueil, départ, rôles automatiques et panneaux de rôles.
- Suggestions, anniversaires volontaires et salons vocaux temporaires.
- Constructeur de messages Discord : texte, embed, image, miniature, couleur et bouton.
- Changelog Discord automatique par serveur.
- Control Center multi-serveurs avec connexion Discord OAuth.

## Parcours d’activation proposé

1. Invitation de FyxBot.
2. Message d’arrivée avec bouton vers le Control Center.
3. Connexion Discord et sélection du serveur.
4. Parcours guidé : structure, logs, accueil, sécurité, règlement, tickets et animation communautaire.
5. Première publication ou première commande réellement utilisée.

Définition marketing proposée : un serveur est **activé** lorsqu’il termine au moins quatre des sept étapes dans les 24 heures. Il est **actif à 30 jours** lorsqu’il utilise au moins une commande ou une automatisation durant cette période. Le panel calcule déjà la progression individuelle, mais l’agrégation globale de ce tunnel n’est pas encore développée.

## Permissions demandées

Le lien d’invitation public utilise le masque `581641939577974` et les scopes `bot` et `applications.commands`.

Permissions : expulser et bannir des membres, gérer les salons, gérer le serveur, ajouter des réactions, voir les salons, envoyer et gérer les messages, intégrer des liens, joindre des fichiers, voir l’historique, rejoindre et parler dans les vocaux, déplacer des membres, gérer les rôles, exclure temporairement et créer des sondages.

FyxBot ne demande pas Administrateur dans son lien public. Les actions du panel vérifient aussi les permissions de l’utilisateur connecté.

## Capacité et fiabilité

- Des simulations ont été réalisées avec **50 puis 200 utilisateurs virtuels simultanés**.
- Ces scénarios couvraient les commandes simulées et les lectures du panel ; ils ne constituent pas une garantie de 200 actions Discord réelles simultanées.
- Les résultats détaillés de latence n’ont pas été conservés dans un rapport exploitable par le marketing : ne pas publier de chiffre de performance précis.
- La surveillance Sentinel contrôle les services et les routes publiques sans ajouter de service Railway payant.
- Aucun incident majeur en cours n’est documenté.
- L’incident récent de `/reglement publier` a été corrigé : réponse différée avant la publication, vérification claire des permissions du salon et test réel réussi sur le serveur de développement.

## Adoption connue et limite de la mesure

- Le dernier instantané local daté du 24 août 2026 contient **4 serveurs installés**, **23 membres cumulés** et aucun retrait enregistré.
- Cet instantané local ne doit pas être présenté comme le chiffre actuel de production.
- Le chiffre actuel doit être relu dans l’espace Créateur du panel avec une session propriétaire connectée avant toute communication chiffrée.

## Identité visuelle

- Symbole : F arrondi, visière lumineuse et bouclier.
- Palette : charbon `#0D0908`, corail `#FF5A2A`, orange `#FF8A1F`, rouge profond `#E83220`, blanc chaud `#FFF7F3`.
- Logo seul pour avatars et favicons ; mascotte pour bannières et grandes illustrations.
- Marge minimale autour du logo : 14 %.
- Ne pas ajouter d’éclair, flamme, armure ou dominante bleue/violette.
- Ressources disponibles dans `dashboard/public/brand` et `Image`.
- Le nom **FyxBot** est retenu ; aucun domaine personnalisé n’est encore choisi. L’URL Railway reste l’adresse officielle actuelle.

## Premium : fondations, pas une offre commerciale active

### Free envisagé

- Modération, sécurité, tickets, règlement, accueil, rôles et configuration guidée.
- Une source sociale automatique envisagée.

### Premium envisagé

- Sources sociales supplémentaires.
- Historique et statistiques avancés.
- Personnalisation enrichie.
- Support prioritaire.

Les limites ne sont pas appliquées, aucun tarif n’est fixé, aucune facturation n’est active et aucune donnée bancaire n’est collectée. Le paiement devra passer par les Applications Premium et les droits d’accès Discord si l’application est éligible. Pulse peut travailler les bénéfices et le positionnement, mais ne doit annoncer ni prix ni date de disponibilité.

## Décisions encore attendues du créateur

- Budget publicitaire maximal : non défini. Hypothèse de travail actuelle : **0 € au lancement organique**.
- Tarifs, limites finales et coût cible de Premium : non définis.
- Domaine personnalisé : non choisi.
- Chiffres actuels de production : à relever dans l’espace Créateur connecté.
- Statut final de validation Discord : à confirmer avant le lancement marketing large.
- Contenu et numéro de la prochaine version : à choisir après les retours d’utilisation de la 1.2.0.

## Consignes pour Pulse

- Continuer la préparation des contenus et du calendrier sans attendre les décisions commerciales.
- Présenter la version 1.2.0 comme disponible, mais conserver « bientôt disponible » pour toute offre Premium payante.
- Prioriser une cohorte fondatrice organique de 10 à 20 serveurs.
- Ne lancer aucune publicité payante avant mesure de l’activation, de la rétention et de la fiabilité.
- Ne jamais publier, contacter ou dépenser sans confirmation explicite du créateur.
