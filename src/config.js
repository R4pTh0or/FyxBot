// @ts-check

const requiredVariables = ['DISCORD_TOKEN', 'CLIENT_ID'];

/**
 * Charge et valide les paramètres nécessaires au bot.
 * @param {{ requireClientId?: boolean }} [options]
 */
function getConfig({ requireClientId = false } = {}) {
  const required = requireClientId ? requiredVariables : ['DISCORD_TOKEN'];
  const missing = required.filter((name) => !process.env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(
      `Configuration manquante : ${missing.join(', ')}. Copiez .env.example vers .env et complétez-le.`,
    );
  }

  const token = process.env.DISCORD_TOKEN?.trim();
  if (!token) throw new Error('Configuration manquante : DISCORD_TOKEN.');

  return Object.freeze({
    token,
    clientId: process.env.CLIENT_ID?.trim(),
    guildId: process.env.GUILD_ID?.trim() || null,
    environment: process.env.NODE_ENV?.trim() || 'development',
    dashboardApiHost: process.env.DASHBOARD_API_HOST?.trim()
      || (process.env.RAILWAY_ENVIRONMENT_ID ? '0.0.0.0' : '127.0.0.1'),
    dashboardApiPort: Number(process.env.DASHBOARD_API_PORT || process.env.PORT || 3001),
  });
}

module.exports = { getConfig };
