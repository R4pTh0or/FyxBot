# État du projet FyxBot

Dernière consolidation locale : **19 septembre 2026**.

Ce document décrit l'état fonctionnel du code présent dans `C:\Fyxbot`. Les
identifiants de déploiement Railway ne sont plus figés ici : ils changent à
chaque livraison et doivent être relus directement dans Railway avant toute
annonce publique.

## Version actuelle

- Version applicative : **1.5.0**.
- Site public : <https://fyxbot-panel-production.up.railway.app/>.
- Services Railway : `fyxbot-bot` et `fyxbot-panel`.
- Commandes Discord présentes dans le code : **34**.
- Manifeste partagé par le bot, le panel et le changelog :
  `dashboard/app/release-manifest.json`.
- La prochaine version majeure est suivie dans
  [docs/V2-READINESS.md](docs/V2-READINESS.md).

## Fonctionnalités disponibles

### Discord

- Modération : ban, kick, timeout, avertissements, nettoyage, mode lent,
  verrouillage et aide modérateur.
- Tickets privés avec plusieurs panneaux, transcripts et gestion depuis le
  panel.
- Accueil, règlement, rôles interactifs, suggestions, logs et AutoMod.
- Anniversaires, notifications sociales, événements, concours et salons vocaux
  temporaires.
- Constructeur de messages avec texte, embed, images et boutons.
- Configuration adaptative depuis une description libre, avec aperçu,
  synchronisation, reconstruction, sauvegarde et restauration.
- Permissions guidées selon les espaces Accueil, Membres et Staff.
- Changelog automatique dans `🛠️・changelog` sans doublon par serveur.

### Control Center

- Connexion Discord OAuth et sélection des serveurs administrables.
- Configuration isolée pour chaque serveur.
- Navigation V2, recherche de modules et affichage adapté au mobile.
- Parcours de démarrage et espace FyxPilot.
- Bibliothèque des messages publiés avec modification et corbeille.
- Support privé avec rôles Modérateur et Administrateur.
- Espace Créateur masqué aux utilisateurs non autorisés.
- Pages publiques : changelog, support, conditions d'utilisation et politique
  de confidentialité.

### FyxStream

- Espace Twitch intégré au panel FyxBot.
- Connexion OAuth, jetons chiffrés, chat IRC et événements Twitch.
- Commandes personnalisées, cooldowns et protections simples.
- Commandes de modération : `!mod`, `!ban`, `!unban`, `!timeout`, `!clear` et
  `!slow`.
- Les anciennes connexions Twitch doivent être reconnectées une fois si elles
  ne possèdent pas encore les nouvelles autorisations de modération.
- Le panel indique désormais les autorisations précises à accorder, alerte en
  cas d'expiration ou d'échec OAuth et affiche les vingt dernières actions de
  modération sans conserver leur motif sensible.

### Premium

- Accès Fondateur de trente jours pour les cent premiers utilisateurs Discord,
  sans carte ni renouvellement automatique.
- Un accès actif peut être appliqué à plusieurs serveurs administrés par son
  bénéficiaire.
- Limites Free et Premium actives sans suppression des réglages existants à
  l'expiration.
- Le parcours payant définitif, les tarifs et le cycle complet des SKU Discord
  restent à valider avant commercialisation.

### Données et sécurité

- Stockage PostgreSQL implémenté pour le runtime, avec mode SQLite conservé pour
  le développement et le retour arrière contrôlé.
- Sauvegardes externes chiffrées en AES-256-GCM dans un stockage S3/R2.
- Sauvegardes locales de structure Discord chiffrées.
- Isolation des données par serveur, protection CSRF, validation des entrées,
  limites de débit et contrôle des permissions sensibles.
- Purge des sessions expirées et parcours de suppression des données d'un
  serveur.
- Journalisation structurée avec Pino.

## Travail restant avant la V2

### Priorité 1 — stabilisation

- [x] Aligner le README avec FyxStream et l'état actuel du stockage.
- [x] Créer une définition vérifiable de la V2.
- [x] Validation locale complète : syntaxe et types valides, **279 tests bot**,
  **5 tests panel**, lint et build réussis.
- [x] `C:\Fyxbot` est relié à l'historique GitHub sur la branche locale
  `v2-development-2026-09-19`. Le dépôt vide imbriqué dans `dashboard` a été
  conservé dans `.safety` et aucun envoi GitHub n'a été effectué.
- [ ] Vérifier en lecture seule le moteur de stockage réellement actif en
  production et l'état courant des deux services Railway.
- [ ] Effectuer un exercice réel de restauration R2 vers une destination
  isolée, sans écraser la production.

### Priorité 2 — FyxPilot Studio

- [x] Comparatif visuel des ajouts, modifications, suppressions exactes et résultat projeté selon l'action choisie.
- [x] Brouillons de configuration enregistrables et récupérables.
- [x] Historique détaillé avec auteur, date et résultat.
- [x] Retour arrière guidé depuis le panel avec confirmation renforcée.
- [x] Aperçu complet des permissions finales par rôle et catégorie, avec les exceptions de salon.

### Priorité 3 — FyxStream

- [x] Reconnexion guidée lorsque des autorisations Twitch manquent.
- [x] Historique borné des actions de modération.
- [x] Alerte en cas d'expiration ou d'échec OAuth.
- [ ] Validation réelle sur une chaîne de développement.

### Priorité 4 — Premium et publication

- Valider la matrice Free/Premium, les tarifs et le nombre de serveurs inclus.
- Tester les SKU Discord de bout en bout.
- Ajouter les accès gratuits propriétaire/partenaire avec journal d'audit.
- Créer une préproduction Railway distincte après accord sur son coût.
- Passer une période de stabilité de sept jours avant l'annonce 2.0.0.
- Préparer le changelog, le tutoriel et la campagne Pulse.

## Conservé volontairement

- `.env` et les données locales, qui ne doivent jamais être publiés.
- Les préfixes historiques `nexora_*` nécessaires à la compatibilité des
  anciennes installations.
- Les sauvegardes de structure Discord dans `data/backups`.
- Les sources graphiques dans `Image` et les ressources optimisées du panel.
- Le mode SQLite tant que la procédure de retour arrière PostgreSQL reste utile.

## Règles de publication

- Travailler et tester d'abord dans `C:\Fyxbot`.
- Ne jamais déployer automatiquement après une simple modification locale.
- Obtenir une confirmation explicite avant une livraison Railway, une action
  Discord destructive, une dépense ou une modification de secret.
- Après un déploiement, attendre l'état Railway `SUCCESS` puis contrôler le
  panel, l'API, Discord et Twitch.
