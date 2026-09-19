import { defineRailway, preserve, project, service, volume } from "railway/iac";

export default defineRailway(() => {
  const fyxbotBotVolume = volume("nexora-bot-api-volume", {
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
    networking: { privateNetworkEndpoint: "fyxbot-bot-api" },
    env: {
      CLIENT_ID: preserve(),
      DASHBOARD_ALLOWED_ORIGINS: preserve(),
      DASHBOARD_API_HOST: preserve(),
      DASHBOARD_PUBLIC_URL: preserve(),
      DISCORD_CLIENT_SECRET: preserve(),
      DISCORD_OAUTH_CALLBACK: preserve(),
      DISCORD_TOKEN: preserve(),
      GUILD_ID: preserve(),
      FYXBOT_BACKUP_ENCRYPTION_KEY: preserve(),
      FYXBOT_BACKUP_INTERVAL_DAYS: preserve(),
      FYXBOT_BACKUP_RETENTION: preserve(),
      FYXBOT_BACKUP_S3_ACCESS_KEY_ID: preserve(),
      FYXBOT_BACKUP_S3_BUCKET: preserve(),
      FYXBOT_BACKUP_S3_ENDPOINT: preserve(),
      FYXBOT_BACKUP_S3_FORCE_PATH_STYLE: preserve(),
      FYXBOT_BACKUP_S3_PREFIX: preserve(),
      FYXBOT_BACKUP_S3_REGION: preserve(),
      FYXBOT_BACKUP_S3_SECRET_ACCESS_KEY: preserve(),
      FYXBOT_EXTERNAL_BACKUP_ENABLED: preserve(),
      NODE_ENV: preserve(),
    },
    volumeMounts: {
      "/data": fyxbotBotVolume,
    },
  });

  const fyxbotPanel = service("fyxbot-panel", {
    build: "pnpm run build",
    start: "pnpm start -- --host 0.0.0.0",
    healthcheck: "/",
    healthcheckTimeout: 120,
    replicas: { ams: 1 },
    networking: { privateNetworkEndpoint: "fyxbot-panel" },
    env: {
      FYXBOT_API_ORIGIN: preserve(),
      VITE_FYXBOT_API_URL: preserve(),
    },
  });

  return project("FyxBot", {
    resources: [fyxbotBot, fyxbotPanel, fyxbotBotVolume],
  });
});
