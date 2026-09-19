# Migration des fonctions FyxStream vers FyxBot

## Décision produit

FyxStream ne sera pas conservé comme bot, panel, dépôt ou service public séparé. Les fonctions Twitch utiles deviendront un module **Streaming** de FyxBot. Le panel reste le FyxBot Control Center et conserve sa direction artistique sombre rouge/orange.

Conséquence recommandée pour les domaines : ne pas acheter un domaine FyxStream. Utiliser à terme `fyxbot.com/streaming` (ou une section équivalente du domaine principal FyxBot).

## État vérifié

FyxBot possède déjà :

- la surveillance automatique des lives Twitch et vidéos YouTube dans `src/services/socialAutomation.js` ;
- les notifications Discord dans `src/services/socialNotifications.js` ;
- la commande `/social` et la gestion complète des sources dans le panel ;
- une API protégée par session Discord, contrôle des permissions, CSRF, CORS et limitation de débit ;
- un stockage SQLite isolé par `guild_id`, sauvegardé par le système de sauvegarde FyxBot ;
- un logger structuré Pino avec masquage des données sensibles.

FyxStream apporte en plus :

- un client de chat Twitch IRC/WebSocket avec reconnexion et `PING/PONG` ;
- un registre de commandes `!commands`, `!discord`, `!socials`, `!uptime` et des commandes personnalisées ;
- une détection simple de liens, majuscules et répétitions ;
- OAuth Twitch, rafraîchissement des jetons et chiffrement AES-256-GCM ;
- la vérification HMAC des notifications EventSub ;
- un état de connexion du bot et une interface de gestion des commandes.

Les améliorations locales préparées dans la copie FyxStream ne sont ni publiées ni déployées. Elles ajoutent la déduplication par identifiant IRC, ignorent les messages émis par le compte du bot, et complètent le panel FyxStream avec modification, activation et désactivation des commandes. Les 37 tests FyxStream passent, ainsi que le typage, le lint et le formatage. Ces changements servent de référence de migration ; le panel séparé ne doit pas être mis en production.

## Code réutilisable

| Source FyxStream | Destination FyxBot proposée | Traitement |
|---|---|---|
| `packages/twitch/src/chat.ts` | `src/services/twitchChatClient.js` | Porter en CommonJS, conserver reconnexion, assainissement, déduplication et exclusion des messages du bot. |
| `apps/bot/src/commands.ts` | `src/services/twitchCommandRegistry.js` | Porter le registre, les commandes intégrées et la modération ; rendre le registre propre à chaque serveur Discord. |
| `packages/twitch/src/index.ts` | `src/services/twitchApi.js` et `src/services/twitchEventSub.js` | Réutiliser OAuth, Helix, rafraîchissement et vérification HMAC. Partager le client Helix avec `socialAutomation.js`. |
| `packages/database/src/token-vault.ts` | `src/services/twitchTokenVault.js` | Adapter à CommonJS et à la clé FyxBot dédiée ; ne jamais réutiliser une clé de sauvegarde. |
| `apps/web/src/oauth-state.ts` | `src/database/twitchStore.js` | Ne pas porter le stockage en mémoire. Utiliser des états OAuth à usage unique conservés dans SQLite et liés au compte Discord et au serveur. |
| `packages/database/src/custom-command-repository.ts` | `src/database/twitchStore.js` | Réécrire pour SQLite et imposer `guild_id` sur toutes les lectures/écritures. Ne pas reprendre la logique « dernier streamer ». |
| `apps/web/src/dashboard.ts` | section Streaming de `dashboard/app/Dashboard.tsx` | Réutiliser uniquement le parcours créer/modifier/activer/désactiver/supprimer. Garder le branding FyxBot. |

À ne pas migrer : le serveur web autonome, le schéma PostgreSQL `fyxstream`, le logger console, le stub Discord, les scripts Railway et les assets spécifiques du panel FyxStream.

## Architecture cible

Le module doit rester dans les deux services FyxBot existants :

- `fyxbot-bot` héberge le client Twitch, le gestionnaire de connexions, l’API et les tâches automatiques ;
- `fyxbot-panel` affiche la nouvelle section et appelle l’API FyxBot existante ;
- aucun service Railway supplémentaire n’est nécessaire.

Services locaux proposés :

```text
src/services/twitchApi.js
src/services/twitchChatClient.js
src/services/twitchCommandRegistry.js
src/services/twitchConnectionManager.js
src/services/twitchEventSub.js
src/services/twitchTokenVault.js
src/database/twitchStore.js
```

`twitchConnectionManager.js` maintient au maximum une connexion par chaîne Twitch et associe chaque chaîne à un serveur Discord. La première version doit refuser qu’une même chaîne active deux ensembles de commandes provenant de serveurs Discord différents.

## Schéma SQLite proposé

Toutes les données sont stockées dans le fichier SQLite FyxBot existant afin de profiter des sauvegardes déjà en place.

```sql
CREATE TABLE twitch_connections (
  guild_id TEXT PRIMARY KEY,
  broadcaster_user_id TEXT NOT NULL,
  broadcaster_login TEXT NOT NULL,
  broadcaster_display_name TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT,
  scopes TEXT NOT NULL DEFAULT '[]',
  expires_at TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  connected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX twitch_active_broadcaster
  ON twitch_connections(broadcaster_user_id) WHERE enabled = 1;

CREATE TABLE twitch_oauth_states (
  state_hash TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  discord_user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE twitch_custom_commands (
  guild_id TEXT NOT NULL,
  name TEXT NOT NULL,
  response TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  cooldown_seconds INTEGER NOT NULL DEFAULT 5,
  access_level TEXT NOT NULL DEFAULT 'everyone',
  usage_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (guild_id, name)
);

CREATE TABLE twitch_runtime_status (
  guild_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  detail TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE twitch_processed_messages (
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, message_id)
);

CREATE TABLE twitch_eventsub_messages (
  guild_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, message_id)
);
```

Les jetons ne doivent jamais apparaître dans `configurations`, les réponses API, les journaux ou le navigateur. Utiliser une nouvelle variable privée `FYXBOT_TWITCH_TOKEN_ENCRYPTION_KEY`, contenant 32 octets en Base64. Les variables Twitch existantes `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` peuvent être partagées avec la surveillance des lives.

## OAuth et compte du bot Twitch

Deux identités ont des rôles différents :

1. le créateur du serveur relie sa chaîne Twitch à son serveur Discord depuis le panel ;
2. un compte Twitch officiel FyxBot rejoint les chats et répond aux commandes.

Le compte bot doit être autorisé une seule fois par le propriétaire de FyxBot et son jeton doit rester côté serveur dans `TWITCH_BOT_ACCESS_TOKEN`, associé à `TWITCH_BOT_USERNAME`. Pour IRC, ce jeton utilisateur utilise uniquement `chat:read` et `chat:edit`. Il ne faut pas faire parler le compte Twitch personnel de chaque client à la place de FyxBot. L’OAuth de la chaîne ne demande aucun scope supplémentaire et ne demande notamment pas `user:read:email`.

## Routes API proposées

Ces routes rejoignent `src/services/dashboardServer.js` et utilisent les protections déjà présentes : session Discord, `manageableGuildIds`, `requireGuildCapability`, CSRF sur les mutations, origine autorisée et limitation de débit.

| Méthode et route | Permission | But |
|---|---|---|
| `GET /api/twitch/status?guildId=...` | Gérer le serveur | Retourner l’identité publique, l’état et la date du dernier signal, jamais les jetons. |
| `GET /api/twitch/auth/start?guildId=...` | Gérer le serveur | Créer un état OAuth lié au serveur et rediriger vers Twitch. |
| `GET /api/twitch/auth/callback` | État OAuth valide | Échanger le code, chiffrer les jetons et revenir sur la section Streaming. |
| `POST /api/twitch/disconnect` | Gérer le serveur + authentification récente | Désactiver la connexion et supprimer les jetons du serveur. |
| `POST /api/twitch/chat/config` | Gérer le serveur | Activer ou désactiver le chat, le préfixe et les protections. |
| `POST /api/twitch/commands` | Gérer le serveur | Actions `add`, `update`, `toggle` et `remove`, avec validation centralisée. |
| `POST /api/twitch/eventsub` | Signature Twitch valide | Recevoir les challenges et événements ; cette route publique ne dépend pas de la session Discord. |

Le callback Twitch et EventSub doivent être ajoutés explicitement aux exceptions d’origine, sans rendre les autres routes publiques. Le corps EventSub doit être vérifié dans sa forme brute avant tout `JSON.parse`.

## Panel intégré

Ne pas créer un second panel. Étendre l’écran **Social** avec deux onglets :

- **Notifications** : l’interface YouTube/Twitch actuelle reste inchangée ;
- **Chat Twitch** : connexion de la chaîne, état du bot, activation, commandes personnalisées, cooldown et niveau d’accès.

Chaque commande personnalisée doit pouvoir être créée, modifiée, activée, désactivée et supprimée. Les états chargement, vide, succès et erreur restent visibles. Une suppression demande une confirmation. Le panneau doit préciser que les commandes StreamElements portant le même nom peuvent encore produire une deuxième réponse externe.

L’identité visuelle reste celle de FyxBot. Les textes FyxStream « Le copilote de vos lives » et « Animez votre chat. Gardez le contrôle. » peuvent être repris comme texte de présentation du module, sans conserver une marque séparée.

## Risques et protections

- **Réponses en double internes** : dédupliquer les identifiants IRC en mémoire et dans SQLite ; ignorer les messages émis par le compte bot.
- **Réponses en double externes** : FyxBot ne peut pas empêcher StreamElements de répondre. Signaler les collisions et proposer un nom ou préfixe différent, par exemple `!fyxcommands`.
- **Plusieurs instances** : une seconde instance ou réplica pourrait répondre deux fois. Maintenir strictement un seul réplica du bot tant qu’un bail distribué n’a pas été ajouté.
- **Multi-serveur** : aucune requête ne doit sélectionner « le dernier streamer ». Chaque enregistrement et chaque action utilisent le `guild_id` autorisé.
- **Jetons expirés** : rafraîchir avant connexion, enregistrer le nouveau refresh token atomiquement et passer l’état en erreur réparable si Twitch refuse.
- **Twitch Helix** : mutualiser le jeton d’application, mettre en cache les recherches et respecter les en-têtes de limite.
- **Chat abusif** : cooldown par commande et utilisateur, longueur maximale, assainissement IRC, liste de commandes réservées et limitation du débit de sortie.
- **Données personnelles** : ajouter Twitch, les identifiants publics et les jetons chiffrés à la politique de confidentialité, avec déconnexion et suppression immédiate depuis le panel.
- **Sauvegardes** : les jetons chiffrés entreront dans la sauvegarde SQLite chiffrée ; la clé de jetons ne doit pas être la clé de sauvegarde.

## Ordre d’implémentation

1. Ajouter le schéma SQLite et `twitchStore.js`, avec tests de cloisonnement par serveur, chiffrement, expiration et suppression.
2. Porter `twitchApi.js`, le coffre de jetons et le parcours OAuth lié à la session Discord.
3. Mutualiser le client Helix avec `socialAutomation.js` sans changer le comportement des notifications existantes.
4. Porter le client IRC et le registre de commandes, avec déduplication, cooldowns et tests de reconnexion.
5. Ajouter le gestionnaire de connexions au cycle de démarrage/arrêt de `src/index.js`.
6. Ajouter les routes API et leur couverture sécurité : accès inter-serveurs refusé, CSRF, origine, taille, erreurs et absence de secrets.
7. Ajouter l’onglet Chat Twitch au panel FyxBot et ses tests de rendu/accessibilité.
8. Tester en mode simulation, puis avec une chaîne Twitch de développement et un serveur Discord de développement.
9. Mettre à jour les mentions légales, le changelog et le plan de retour arrière.
10. Publier seulement après validation explicite. Une fois la migration validée en production, demander séparément l’autorisation avant d’arrêter ou supprimer les anciens services FyxStream.

## Critères de validation avant publication

- suite `pnpm validate` FyxBot entièrement verte ;
- compilation, lint et tests du panel verts ;
- aucune valeur sensible dans le HTML, l’API, les journaux, Git ou les erreurs ;
- deux serveurs de test ne voient jamais leurs connexions ni leurs commandes respectives ;
- un message IRC répété avec le même identifiant produit une seule réponse ;
- une seule réponse interne après reconnexion ou redémarrage ;
- ajout, modification, activation, désactivation et suppression visibles sans rechargement incohérent ;
- déconnexion Twitch arrête le chat et supprime effectivement les jetons concernés ;
- les notifications sociales existantes fonctionnent encore à l’identique ;
- aucune création de service Railway ni achat d’un domaine FyxStream.
