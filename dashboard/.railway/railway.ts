import { defineRailway, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const nexoraBotApiVolume = volume("nexora-bot-api-volume", {
    alerts: { usage: { "80": {}, "95": {}, "100": {} } },
    allowOnlineResize: true,
    region: "ams",
    sizeMB: 500,
  });

  const fyxbotBot = service("fyxbot-bot", {
    start: "pnpm start",
    healthcheck: "/api/health",
    healthcheckTimeout: 120,
    replicas: { ams: 1 },
    networking: { privateNetworkEndpoint: "nexora-bot-api" },
    env: {
      CLIENT_ID: preserve(),
      DASHBOARD_ALLOWED_ORIGINS: preserve(),
      DASHBOARD_API_HOST: preserve(),
      DASHBOARD_PUBLIC_URL: preserve(),
      DISCORD_CLIENT_SECRET: preserve(),
      DISCORD_OAUTH_CALLBACK: preserve(),
      DISCORD_TOKEN: preserve(),
      GUILD_ID: preserve(),
      NEXORA_BACKUP_ENCRYPTION_KEY: preserve(),
      NEXORA_BACKUP_INTERVAL_DAYS: preserve(),
      NEXORA_BACKUP_RETENTION: preserve(),
      NEXORA_BACKUP_S3_ACCESS_KEY_ID: preserve(),
      NEXORA_BACKUP_S3_BUCKET: preserve(),
      NEXORA_BACKUP_S3_ENDPOINT: preserve(),
      NEXORA_BACKUP_S3_FORCE_PATH_STYLE: preserve(),
      NEXORA_BACKUP_S3_PREFIX: preserve(),
      NEXORA_BACKUP_S3_REGION: preserve(),
      NEXORA_BACKUP_S3_SECRET_ACCESS_KEY: preserve(),
      NEXORA_EXTERNAL_BACKUP_ENABLED: preserve(),
      NODE_ENV: preserve(),
    },
    volumeMounts: {
      "/data": nexoraBotApiVolume,
    },
  });

  const fyxbotPanel = service("fyxbot-panel", {
    build: "pnpm run build",
    start: "pnpm start -- --host 0.0.0.0",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: { ams: 1 },
    networking: { privateNetworkEndpoint: "nexora-panel" },
    env: {
      FYXBOT_API_ORIGIN: preserve(),
      NEXORA_API_ORIGIN: preserve(),
      VITE_FYXBOT_API_URL: preserve(),
      VITE_NEXORA_API_URL: preserve(),
    },
  });

  return project("FyxBot", {
    resources: [fyxbotBot, fyxbotPanel, nexoraBotApiVolume],
  });
});
