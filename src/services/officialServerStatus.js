// @ts-check

const { ChannelType, EmbedBuilder } = require('discord.js');
const logger = require('./logger').logger.child({ component: 'official-status' });

const DEFAULT_CHANNEL_NAME = '🚦・statut-services';
const DEFAULT_INTERVAL_MS = 5 * 60_000;
const DEFAULT_PUBLIC_URL = 'https://fyxbot-panel-production.up.railway.app/';
const STATUS_FOOTER = 'FyxBot • Statut officiel';

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment */
function isOfficialStatusEnabled(environment = process.env) {
  const configured = String(environment.FYXBOT_OFFICIAL_STATUS_ENABLED || '').trim().toLowerCase();
  if (configured === 'true') return true;
  if (configured === 'false') return false;
  return environment.NODE_ENV === 'production';
}

/** @param {unknown} value */
function normalizeStatusInterval(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_INTERVAL_MS;
  return Math.min(Math.max(Math.trunc(parsed), 60_000), 60 * 60_000);
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} environment */
function resolvePublicUrl(environment = process.env) {
  try {
    const url = new URL(String(environment.DASHBOARD_PUBLIC_URL || DEFAULT_PUBLIC_URL).trim());
    if (!['http:', 'https:'].includes(url.protocol)) return DEFAULT_PUBLIC_URL;
    return url.toString();
  } catch {
    return DEFAULT_PUBLIC_URL;
  }
}

/**
 * @param {{ fetchImpl?: typeof fetch, publicUrl?: string, timeoutMs?: number }} [options]
 */
async function probePanelHealth({
  fetchImpl = fetch,
  publicUrl = DEFAULT_PUBLIC_URL,
  timeoutMs = 8_000,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  timeout.unref?.();
  try {
    const endpoint = new URL('/api/health', publicUrl);
    const response = await fetchImpl(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'FyxBot/status-monitor' },
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, status: response.status };
    const body = await response.json().catch(() => ({}));
    return {
      ok: body?.ok === true && body?.discord === 'connected',
      status: response.status,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * @param {{ botConnected: boolean, panelHealthy: boolean, checkedAt?: Date, publicUrl?: string }} values
 */
function buildOfficialStatusEmbed({
  botConnected,
  panelHealthy,
  checkedAt = new Date(),
  publicUrl = DEFAULT_PUBLIC_URL,
}) {
  const healthy = botConnected && panelHealthy;
  const panelLink = new URL('/', publicUrl).toString();
  const supportLink = new URL('/support', publicUrl).toString();
  return new EmbedBuilder()
    .setColor(healthy ? 0x22c55e : 0xf59e0b)
    .setTitle(healthy ? '🟢 Tous les services sont opérationnels' : '🟠 Un service est en cours de vérification')
    .setDescription('Cet état est actualisé automatiquement par FyxBot. Si l’heure ci-dessous reste ancienne, une maintenance peut être en cours.')
    .addFields(
      { name: 'Bot Discord', value: botConnected ? '🟢 Connecté' : '🔴 Déconnecté', inline: true },
      { name: 'Panel FyxBot', value: panelHealthy ? '🟢 Disponible' : '🟠 Inaccessible', inline: true },
      { name: 'FyxStream', value: '🟢 Module disponible', inline: true },
      { name: 'Liens officiels', value: `[Ouvrir le panel](${panelLink}) • [Contacter le support](${supportLink})`, inline: false },
      { name: 'Dernière vérification', value: `<t:${Math.floor(checkedAt.getTime() / 1000)}:R>`, inline: false },
    )
    .setFooter({ text: STATUS_FOOTER })
    .setTimestamp(checkedAt);
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ environment?: NodeJS.ProcessEnv | Record<string, string | undefined>, fetchImpl?: typeof fetch, now?: () => Date }} [options]
 */
async function updateOfficialStatus(client, {
  environment = process.env,
  fetchImpl = fetch,
  now = () => new Date(),
} = {}) {
  if (!isOfficialStatusEnabled(environment)) return { status: 'disabled' };
  const guildId = String(environment.GUILD_ID || '').trim();
  if (!guildId) return { status: 'skipped', reason: 'missing-guild-id' };

  const guild = await client.guilds.fetch(guildId);
  await guild.channels.fetch();
  const configuredChannelId = String(environment.FYXBOT_OFFICIAL_STATUS_CHANNEL_ID || '').trim();
  const channelName = String(environment.FYXBOT_OFFICIAL_STATUS_CHANNEL_NAME || DEFAULT_CHANNEL_NAME).trim();
  const channel = configuredChannelId
    ? await guild.channels.fetch(configuredChannelId).catch(() => null)
    : guild.channels.cache.find((item) => item?.name === channelName);
  if (!channel || channel.type !== ChannelType.GuildText) {
    return { status: 'skipped', reason: 'missing-status-channel' };
  }

  const publicUrl = resolvePublicUrl(environment);
  const panel = await probePanelHealth({ fetchImpl, publicUrl });
  const checkedAt = now();
  const payload = {
    embeds: [buildOfficialStatusEmbed({
      botConnected: client.isReady(),
      panelHealthy: panel.ok,
      checkedAt,
      publicUrl,
    })],
  };
  const messages = await channel.messages.fetch({ limit: 25 });
  const existing = messages.find((message) => message.author.id === client.user.id
    && message.embeds.some((item) => item.footer?.text === STATUS_FOOTER));
  const message = existing ? await existing.edit(payload) : await channel.send(payload);
  return {
    status: existing ? 'updated' : 'created',
    channelId: channel.id,
    messageId: message.id,
    healthy: client.isReady() && panel.ok,
  };
}

/**
 * @param {import('discord.js').Client} client
 * @param {{ environment?: NodeJS.ProcessEnv | Record<string, string | undefined>, fetchImpl?: typeof fetch, intervalMs?: number }} [options]
 */
function startOfficialStatusScheduler(client, {
  environment = process.env,
  fetchImpl = fetch,
  intervalMs = normalizeStatusInterval(environment.FYXBOT_OFFICIAL_STATUS_INTERVAL_MS),
} = {}) {
  if (!isOfficialStatusEnabled(environment)) {
    return { run: async () => ({ status: 'disabled' }), stop() {} };
  }
  let running = false;
  const run = async () => {
    if (running) return { status: 'skipped', reason: 'already-running' };
    running = true;
    try {
      const result = await updateOfficialStatus(client, { environment, fetchImpl });
      logger.debug({ result }, '[FyxBot] Statut officiel actualisé.');
      return result;
    } catch (error) {
      logger.error({ err: error }, '[FyxBot] Actualisation du statut officiel impossible.');
      return { status: 'error' };
    } finally {
      running = false;
    }
  };
  void run();
  const timer = setInterval(() => void run(), normalizeStatusInterval(intervalMs));
  timer.unref?.();
  return { run, stop: () => clearInterval(timer) };
}

module.exports = {
  DEFAULT_CHANNEL_NAME,
  DEFAULT_INTERVAL_MS,
  STATUS_FOOTER,
  buildOfficialStatusEmbed,
  isOfficialStatusEnabled,
  normalizeStatusInterval,
  probePanelHealth,
  resolvePublicUrl,
  startOfficialStatusScheduler,
  updateOfficialStatus,
};
