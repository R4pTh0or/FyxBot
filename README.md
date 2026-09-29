# FyxBot — Bot Discord

Bot Discord multifonction construit avec Node.js et discord.js v14. FyxBot fournit les utilitaires membres/serveur, la modération, les tickets privés avec transcripts, les logs, les suggestions, l’accueil, les rôles, AutoMod, les règlements interactifs, les anniversaires volontaires, les notifications sociales, les salons vocaux temporaires, les événements Discord programmés, les concours automatiques et un constructeur de messages Discord avec texte, embeds et images.

La version locale préparée est **FyxBot 2.0.1** ; la dernière version publique reste **2.0.0** tant que cette consolidation n’a pas reçu une confirmation de déploiement. Le suivi des éléments terminés et des prochaines priorités se trouve dans [ETAT-PROJET.md](ETAT-PROJET.md). Les contrôles post-publication sont suivis dans [docs/V2-READINESS.md](docs/V2-READINESS.md).

## Configuration adaptative du serveur

La commande `/setup concevoir` et la section Configuration du Control Center demandent une description libre du projet. FyxBot transforme cette description en aperçu personnalisé, sans imposer de profil initial et sans modifier Discord. Après validation, l’administrateur peut compléter, synchroniser ou reconstruire le serveur. Chaque salon créé suit le format `emoji・nom-du-salon`.

Une sauvegarde locale est créée avant chaque application. `/setup sauvegardes` permet de les consulter et `/setup restaurer` recrée les rôles, salons, permissions et liens de configuration pour revenir en arrière.

Les nouveautés sont détaillées dans [CHANGELOG.md](CHANGELOG.md) et sur la route publique `/changelog` du site.

## Démarrage guidé

Quand FyxBot rejoint un serveur, il recherche un salon textuel dans lequel il possède les permissions nécessaires puis publie un message d’accueil avec un bouton vers le Control Center. **FyxJourney**, dans l’espace Pilotage, calcule un score explicable sur 100, présente sept domaines contrôlés et propose jusqu’à trois prochaines actions. **FyxVision** permet de consulter les droits effectifs du compte Discord connecté avec tous ses rôles, ou de sélectionner un rôle isolé et de vérifier les salons visibles, masqués ou gérables. Ces diagnostics restent en lecture seule : l’administrateur doit toujours ouvrir et confirmer une modification sensible.

## Notifications sociales automatiques

Le module Social peut surveiller les nouvelles vidéos d’une chaîne YouTube à partir de son identifiant public `UC…`. Twitch est aussi pris en charge avec les variables `TWITCH_CLIENT_ID` et `TWITCH_CLIENT_SECRET` décrites dans `.env.example`. La première lecture mémorise le contenu courant sans l’annoncer, ce qui évite de republier une ancienne vidéo ou un ancien live.

Les sources se gèrent depuis le panel ou avec `/social ajouter`, `/social sources` et `/social retirer`. Les annonces manuelles restent disponibles pour les autres plateformes.

## FyxStream — espace Twitch intégré

FyxStream n'est pas un service distinct : ses fonctions sont intégrées à l'espace
**FyxStream** du Control Center FyxBot. Le module comprend la connexion OAuth
d'une chaîne Twitch, le chat IRC, les commandes intégrées et personnalisées,
les cooldowns, les protections simples et la réception sécurisée des événements
Twitch. Les commandes de modération prédéfinies sont `!mod`, `!ban`, `!unban`,
`!timeout`, `!clear` et `!slow`.

Une chaîne connectée avant l'ajout des autorisations de modération doit être
reconnectée une fois depuis le panel. Le détail de l'intégration figure dans le
[plan de migration Streaming](docs/MIGRATION-FYXSTREAM-VERS-FYXBOT.md).

Les identifiants publics de la chaîne servent à afficher la connexion choisie.
Les jetons OAuth restent côté serveur sous forme chiffrée et peuvent être retirés
en déconnectant Twitch depuis le Control Center. Les traitements et durées prévus
sont détaillés dans la
[politique de confidentialité locale](dashboard/app/politique-confidentialite/page.tsx).

Le chat utilise un compte Twitch officiel FyxBot distinct, configuré uniquement
côté serveur avec `TWITCH_BOT_USERNAME`, `TWITCH_BOT_ACCESS_TOKEN` et
`TWITCH_BOT_REFRESH_TOKEN`. Son jeton doit disposer des droits IRC minimaux
`chat:read` et `chat:edit`. FyxBot renouvelle automatiquement cet accès avant
son expiration. Tant que le compte ou son jeton d'accès sont absents, le module
reste volontairement hors réseau et le panel affiche un état de configuration
explicite.

## Événements et concours communautaires

La section **Communauté** du Control Center et la commande `/communaute` permettent de programmer un événement Discord natif ou de publier un concours. Les événements acceptent un lieu externe ou un salon vocal, une heure locale et un fuseau horaire. Les concours limitent chaque membre à une participation, effectuent le tirage automatiquement et effacent les identifiants des participants après le résultat.

## Changelog Discord automatique

La configuration automatique crée un salon public en lecture seule nommé `🛠️・changelog` et y publie la dernière version disponible. Le manifeste `dashboard/app/release-manifest.json` est la source unique utilisée par le panel, la page changelog, l’API et les annonces Discord. FyxBot publie uniquement les versions disponibles qui n’ont pas encore été annoncées sur chaque serveur.

Pour préparer une version, ajoutez-la au manifeste puis alignez les numéros de version des deux `package.json` et le titre correspondant dans `CHANGELOG.md`. Les tests refusent une divergence. La construction du panel génère automatiquement `public/release.json`, et la diffusion Discord est déclenchée au prochain démarrage ou déploiement du bot.

## Prérequis

- Node.js 22.12 ou plus récent
- pnpm 11 ou plus récent
- Une application créée dans le [Portail développeur Discord](https://discord.com/developers/applications)
- Un bot ajouté à cette application et invité sur votre serveur avec les scopes `bot` et `applications.commands`

## Installation

1. Installez les dépendances :

   ```bash
   pnpm install
   ```

2. Copiez `.env.example` vers `.env`, puis renseignez :

   - `DISCORD_TOKEN` : jeton secret du bot ;
   - `CLIENT_ID` : identifiant de l’application ;
   - `GUILD_ID` : identifiant du serveur de test (recommandé pendant le développement).

3. Publiez les commandes slash :

   ```bash
   pnpm run deploy
   ```

4. Démarrez FyxBot :

   ```bash
   pnpm start
   ```

Pour relancer automatiquement le bot après une modification :

```bash
pnpm run dev
```

> Ne partagez et ne versionnez jamais le fichier `.env` ni le jeton du bot. Si le jeton est exposé, régénérez-le immédiatement dans le portail Discord.

## Vérifications dans VS Code

Le dossier de développement contient des tâches prêtes à l’emploi. Dans VS Code,
ouvrez **Terminal > Exécuter la tâche**, puis choisissez :

- `FyxBot: Vérifier le bot` pour la syntaxe, le typage progressif et tous les tests ;
- `FyxBot: Vérifier le panel` pour le lint ;
- `FyxBot: Compiler le panel` avant un aperçu ou un déploiement.

La configuration locale indique également à VS Code où trouver Node et pnpm sur
cet ordinateur. Le bot utilise Pino : les journaux restent lisibles en local et
sont émis en JSON structuré sur Railway. `FYXBOT_LOG_LEVEL` permet d’ajuster leur
niveau sans modifier le code.

## Simulation de 50 utilisateurs

Le scénario de charge intégré exécute simultanément 50 commandes `/ping`
simulées, puis 50 parcours en lecture seule sur le panel, l’état de connexion et
la santé du bot. Il n’utilise pas de faux comptes Discord et ne modifie aucun
serveur, ticket, rôle ou réglage.

```bash
pnpm run simulate:50
```

Pour lancer le scénario renforcé avec 200 utilisateurs simultanés :

```bash
pnpm run simulate:200
```

Le rapport affiche les réussites, les erreurs, la latence médiane, la latence
p95, le débit et l’état de la connexion Discord. Le script limite volontairement
la simulation à 250 utilisateurs virtuels au maximum.

## Sauvegardes externes chiffrées

FyxBot peut sauvegarder automatiquement son stockage SQLite ou PostgreSQL dans
un espace privé compatible S3, notamment Cloudflare R2. Les données sont
compressées puis chiffrées en AES-256-GCM avant de quitter le serveur. Par
défaut, une sauvegarde est créée tous les 7 jours et seules les 8 plus récentes
sont conservées.

L’activation nécessite les variables `FYXBOT_BACKUP_*` documentées dans
`.env.example`. La clé `FYXBOT_BACKUP_ENCRYPTION_KEY` doit être conservée dans
un gestionnaire de mots de passe : sans elle, une restauration est impossible.

## Suppression et anonymisation des données

Lorsque FyxBot est retiré d’un serveur, ses configurations, anniversaires,
avertissements, suggestions, journaux locaux, compteurs associés et sauvegardes
locales de structure sont supprimés automatiquement. L’historique d’installation
est conservé uniquement sous forme anonymisée, sans identifiant, nom ni nombre
de membres du serveur. Les demandes individuelles d’accès ou d’effacement sont
prises en charge à l’adresse indiquée sur la page publique de confidentialité.

Pour FyxStream, déconnecter Twitch supprime de la base
opérationnelle les jetons chiffrés et l’identité de la chaîne reliée. Les textes
du chat Twitch sont analysés en mémoire et ne sont pas enregistrés ; seuls des
identifiants techniques anti-doublon à courte durée sont conservés.

## Accès Premium offerts

Le propriétaire de FyxBot peut accorder depuis son espace Créateur un accès
Premium gratuit, temporaire ou sans échéance, à un compte Discord partenaire.
Le bénéficiaire peut ensuite appliquer cet accès aux serveurs qu'il administre.
L'attribution et la révocation sont datées et conservées dans un historique ;
aucun moyen de paiement et aucun abonnement ne sont créés.

La page Premium du panel et la commande `/premium roles-configurer` permettent
à chaque serveur de choisir un rôle pour les abonnements Discord payants et un
autre pour les accès offerts.
FyxBot synchronise ces rôles après un achat, une expiration, une révocation, une
activation Fondateur, une arrivée sur le serveur et périodiquement après son
démarrage. Les rôles à permissions sensibles sont refusés.

Avant de démarrer cette version sur une base PostgreSQL V1 existante, exécuter
une seule fois `pnpm run database:postgres:migrate-v2`. La migration est
idempotente et ne touche pas aux droits Fondateur ni aux droits Discord payants.

## Arborescence

```text
src/
├── commands/
│   ├── utility/       # informations, ping et suggestions
│   ├── moderation/    # sanctions et avertissements
│   ├── community/     # règlement, anniversaires, social et vocaux temporaires
│   ├── tickets/       # tickets privés
│   ├── configuration/ # catégories et permissions du serveur
│   └── logs/          # configuration des journaux
├── database/          # stockage PostgreSQL/SQLite isolé par serveur
├── events/            # événements Discord
├── loaders/           # découverte des commandes et événements
├── services/          # logique métier partagée, dont FyxStream
├── config.js          # validation de la configuration
├── deploy-commands.js # publication des commandes slash
└── index.js           # point d’entrée du bot
```

## Ajouter une commande

Créez un fichier JavaScript dans un sous-dossier de `src/commands`. Il doit exporter :

```js
module.exports = {
  data: new SlashCommandBuilder()
    .setName('exemple')
    .setDescription('Une commande FyxBot.'),
  async execute(interaction) {
    await interaction.reply('Réponse de FyxBot');
  },
};
```

Relancez ensuite `pnpm run deploy` pour publier la nouvelle commande.

## Déploiement des commandes

Avec `GUILD_ID`, les commandes sont publiées sur le serveur de développement et apparaissent rapidement. Sans `GUILD_ID`, elles sont publiées globalement ; leur propagation peut prendre plus de temps.

## Prochaines étapes prévues

- Valider localement puis publier la consolidation 2.0.1 après confirmation explicite.
- Effectuer un exercice réel de restauration R2 vers une destination isolée.
- Comparer les permissions du compte connecté à celles d’un rôle isolé dans FyxVision.
- Étendre FyxTwin avec plusieurs versions virtuelles comparables avant application.
- Préparer FyxFlow, un constructeur d’automatisations contrôlées avec aperçu et journal d’exécution.
- Finaliser la tarification et tester le parcours d’achat Discord de bout en bout. Les accès Fondateur et partenaire restent gratuits, séparés et sans renouvellement automatique.

La liste de validation complète se trouve dans [docs/V2-READINESS.md](docs/V2-READINESS.md).
