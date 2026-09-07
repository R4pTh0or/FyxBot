# Mise en ligne de FyxBot sur Railway

FyxBot utilise deux services dans un même projet Railway :

1. **fyxbot-bot** depuis la racine du projet : bot Discord et API sécurisée.
2. **fyxbot-panel** depuis le dossier `dashboard` : interface web.

## Infrastructure as Code

La configuration Railway du projet est centralisée dans
`dashboard/.railway/railway.ts`. Ce fichier décrit les deux services, leurs
commandes de démarrage, leurs contrôles de santé, le réseau privé et le volume
persistant du bot. Les anciens fichiers `railway.json` ont été supprimés.

Depuis `dashboard`, toujours vérifier le plan avant une modification :

```text
railway config plan
railway config apply
```

Les variables existantes utilisent `preserve()` : Railway conserve leur valeur
sans écrire les secrets Discord ou de sauvegarde dans le dépôt.

## Stockage persistant

Le service **fyxbot-bot** doit recevoir un volume Railway. Le code utilise
automatiquement `RAILWAY_VOLUME_MOUNT_PATH` pour conserver la base SQLite, les
avertissements et les sauvegardes entre deux déploiements.

## Sauvegarde externe

Pour rester sur Railway Hobby, la base peut être copiée chaque semaine dans un
bucket S3 privé externe. Cloudflare R2 en classe Standard est compatible. Créer
un jeton limité au seul bucket `fyxbot-backups` avec les droits de lecture et
d’écriture, puis ajouter au service bot/API :

- `FYXBOT_EXTERNAL_BACKUP_ENABLED=true`
- `FYXBOT_BACKUP_S3_ENDPOINT=https://ID-DU-COMPTE.r2.cloudflarestorage.com`
- `FYXBOT_BACKUP_S3_REGION=auto`
- `FYXBOT_BACKUP_S3_BUCKET=fyxbot-backups`
- `FYXBOT_BACKUP_S3_ACCESS_KEY_ID` (secret)
- `FYXBOT_BACKUP_S3_SECRET_ACCESS_KEY` (secret)
- `FYXBOT_BACKUP_ENCRYPTION_KEY` (secret Base64 de 32 octets)
- `FYXBOT_BACKUP_INTERVAL_DAYS=7`
- `FYXBOT_BACKUP_RETENTION=8`

Une installation existante peut conserver le bucket privé `nexora-backups`,
son préfixe et ses variables `NEXORA_*`. FyxBot les reconnaît pour éviter toute
perte de sauvegarde. Les nouvelles variables `FYXBOT_*` sont prioritaires dès
qu’elles sont renseignées.

La sauvegarde est chiffrée localement avant l’envoi. Conserver séparément la clé
de chiffrement : elle est indispensable pour restaurer la base.

## Variables du bot/API

- `NODE_ENV=production`
- `DISCORD_TOKEN` (secret)
- `CLIENT_ID`
- `DISCORD_CLIENT_SECRET` (secret)
- `DASHBOARD_PUBLIC_URL=https://URL-DU-PANEL`
- `DASHBOARD_ALLOWED_ORIGINS=https://URL-DU-PANEL`
- `DISCORD_OAUTH_CALLBACK=https://URL-DU-PANEL/api/auth/callback`
- `DASHBOARD_TRUST_PROXY=true`
- `ALLOW_UNAUTHENTICATED_LOCAL=false`

Railway fournit automatiquement `PORT`, `RAILWAY_ENVIRONMENT_ID` et le chemin
du volume. Il ne faut pas définir `DASHBOARD_API_PORT` en production.

## Variable du panel

- `VITE_FYXBOT_API_URL=https://URL-DE-L-API/api`

Cette variable doit être présente avant la compilation du panel.

## Discord Developer Portal

Ajouter exactement l’URL `DISCORD_OAUTH_CALLBACK` dans **OAuth2 > Redirects**.
Les commandes destinées à tous les serveurs doivent ensuite être publiées avec
la commande `pnpm run deploy:global` depuis un environnement contenant les
secrets Discord.

Ne jamais copier le fichier `.env` dans le dépôt ni dans les journaux Railway.
