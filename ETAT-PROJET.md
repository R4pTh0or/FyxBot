# État du projet FyxBot

Dernière consolidation : **25 août 2026**.

Ce document est la référence courte pour savoir ce qui est terminé, ce qui reste à faire et ce qui doit être conservé.

## État de la production

- Projet Railway : `FyxBot`.
- Services : `fyxbot-bot` et `fyxbot-panel`.
- Site public : <https://fyxbot-panel-production.up.railway.app/>.
- Bot Discord : connecté sous `FyxBot#5572`.
- Dernier déploiement public du bot : `9d969046-4ade-4faa-ba13-6c95bc307259`, état `SUCCESS`.
- Dernier déploiement public du panel : `fcf39982-e89f-4167-82cd-8fe069aaf6b7`, état `SUCCESS`.
- Surveillance Sentinel : contrôle automatique toutes les 15 minutes, sans service Railway supplémentaire.
- Santé observée après le dernier déploiement : site, API et authentification HTTP 200 ; Discord connecté ; aucun incident applicatif récent.

## Terminé

### Bot Discord

- Base Node.js et discord.js v14 modulaire avec chargeurs de commandes et d’événements.
- Commandes globales sans doublon et documentation dans `COMMANDES.md`.
- Modération : bannissement, expulsion, timeout, avertissements, effacement et débannissement.
- Tickets privés avec plusieurs panneaux, destinations différentes, modification depuis le panel, transcripts, archivage et réouverture par le staff.
- Logs, accueil et départ, suggestions, rôles interactifs et sécurité configurable.
- Conception adaptative d’un serveur à partir d’une description libre, avec aperçu obligatoire, rôles et salons personnalisés au format `emoji・nom`.
- Audit, configuration complète et retour arrière local avec restauration des rôles, salons, permissions et liens de configuration.
- Règlement interactif avec modèles, rôle après acceptation et correction de `/reglement publier`.
- Anniversaires volontaires avec messages par défaut et fuseaux horaires.
- Notifications sociales manuelles et automatiques pour YouTube/Twitch, sondages Discord natifs et salons vocaux temporaires.
- Événements Discord natifs et concours persistants avec participation unique, tirage automatique et effacement des participants après le résultat.
- Constructeur de messages Discord : texte, embed, image, miniature, couleur et bouton HTTPS.
- Salon changelog créé par le setup et diffusion sans doublon des versions publiées.
- Suppression des données d’un serveur après désinstallation et statistiques anonymisées.

### Panel web

- Control Center public sur Railway avec connexion Discord OAuth.
- Sélection de plusieurs serveurs, invitation publique du bot et actualisation automatique.
- Configuration des modules Discord depuis le site.
- Interface rouge et orange, logo, bannière, mascotte et emojis cohérents.
- Compte utilisateur accessible depuis le bloc inférieur gauche et déconnexion intégrée.
- Espace créateur avec installations, serveurs, membres couverts et usages des commandes.
- Pages publiques : changelog, support, conditions d’utilisation et politique de confidentialité.
- Référencement technique : métadonnées, `robots.txt` et sitemap.
- Adresse publique de support : `fyxbotassistance@outlook.fr`.
- Parcours guidé en sept étapes, gestion des sources sociales et aperçu Premium sans facturation.
- Statistiques d’activation avec cohorte 24 heures complète : les installations encore dans leur fenêtre ne sont pas comptées comme des échecs.
- Section Communauté enrichie pour créer et suivre les événements programmés et les concours actifs.

### Sécurité, données et exploitation

- Audits web et cybersécurité réalisés, avec contrôles d’accès renforcés.
- Isolation des configurations par serveur et vérification des permissions avant les actions sensibles.
- Sauvegardes externes Cloudflare R2 compressées et chiffrées en AES-256-GCM.
- Tests de restauration chiffrée, conservation limitée et compatibilité avec les anciennes sauvegardes.
- Simulations de charge avec 50 puis 200 utilisateurs virtuels.
- Suite locale actuelle : **89 tests bot réussis sur 89** et **3 tests panel réussis sur 3** ; lint et build du panel réussis.
- Services et projet Railway renommés avec le branding FyxBot.
- Équipe IA documentée dans `AGENTS-EQUIPE.md` : Nova, Orion, Sentinel, Aegis et Ember.
- Test réel de `/reglement publier` réussi sur le serveur de développement.
- Validation réelle de la 1.2.0 réussie dans `🤖・commandes-bot` : message d’arrivée, notification sociale, sondage natif et contrôle anti-doublon.
- Demande de vérification envoyée à Discord.
- Version 1.3.0 déployée publiquement avec les événements Discord natifs, les concours automatiques et leur gestion depuis le panel.
- Premium reporté : la commande n’est ni publiée sur Discord ni chargée par le bot public ; aucun paiement, produit ou contrôle d’accès Premium n’est actif.

## Reste à faire

### Priorité immédiate

1. Recueillir le retour du créateur sur les événements, concours et écrans Communauté de la version 1.3.0.
2. Continuer le contrôle de l’indexation Google : le 25 août 2026, Search Console indique que les données sont encore en cours de traitement et la recherche publique ne retourne pas encore FyxBot. Ne pas demander une nouvelle indexation tant que ce traitement n’est pas terminé.

### Avant FyxBot Premium

1. Valider précisément les limites proposées dans `PREMIUM-PREPARATION.md` et fixer les tarifs.
2. Configurer les Applications Premium Discord, les produits et les droits d’accès (*entitlements*).
3. Tester les droits Discord préparés localement avec un produit de test, puis définir les contrôles Premium côté bot et panel. La gestion des créations, fins, suppressions et remboursements de droits est déjà préparée sans application des limitations.
4. Tester tout le parcours d’achat en environnement de développement avant activation publique.
5. Utiliser l’agent marketing Pulse pour préparer la communication, puis attendre la vérification Discord et la stabilisation du référencement avant toute diffusion.

### Améliorations futures

- Étendre les notifications automatiques aux autres plateformes disposant d’un accès officiel adapté.
- Statistiques communautaires supplémentaires, annulation d’événement et nouveau tirage manuel encadré.
- Domaine personnalisé pour remplacer progressivement l’adresse Railway publique.
- Test réel de restauration depuis Cloudflare R2, en plus des tests automatisés locaux.
- Migration de la configuration Railway vers le nouveau format d’infrastructure avant l’échéance annoncée par Railway.

## Nettoyage effectué

- Ancien fichier vide `500` supprimé.
- Quatre anciens journaux locaux de Nexora et du dashboard supprimés.
- Sorties de compilation locales `.next`, `.vinext` et `dist` supprimées ; elles seront recréées au prochain build.
- Verrou npm du dashboard supprimé, car le projet utilise pnpm et `pnpm-lock.yaml`.
- Trois icônes génériques du modèle web, non utilisées par FyxBot, supprimées.
- Le cache `.wrangler` n’a pas été supprimé complètement car le panel local l’utilise actuellement. Il pourra être retiré après l’arrêt du processus local.

## Conservé volontairement

- `.env` et les données locales : nécessaires au développement et jamais publiées par les scripts de déploiement.
- `data/nexora.sqlite` et les préfixes `nexora_*` : compatibilité et migration des anciennes installations.
- Les sauvegardes de structure Discord dans `data/backups`.
- Les originaux graphiques dans `Image` et les versions optimisées dans `dashboard/public/brand`.
- `node_modules` et les caches de paquets utiles aux tests locaux.
- L’exemple D1 du dashboard, utile si une base web séparée est ajoutée plus tard.
- Les conversations FyxBot encore visibles : elles contiennent l’historique de création ou la configuration du serveur. Aucun ancien chat FyxBot clairement inutile n’est actuellement listé.
