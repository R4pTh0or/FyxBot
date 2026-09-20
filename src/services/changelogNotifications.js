const { createHash } = require('node:crypto');
const { getChangelogConfig, setChangelogConfig } = require('../database/changelogStore');
const { customMessagePayload } = require('./customMessages');
const { publishedReleases } = require('./releaseManifest');
const appLogger = require('./logger').logger.child({ component: 'changelog-notifications' });

const DEFAULT_PUBLIC_URL = 'https://fyxbot-panel-production.up.railway.app/changelog';
const CHANGELOG_CHANNEL_NAME = '🛠️・changelog';

function normalizedChangelogChannelName(name) {
  return String(name || '')
    .normalize('NFKD')
    .replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, '')
    .toLowerCase();
}

function selectChangelogChannel(guild, channels) {
  const candidates = [...(channels?.values?.() || [])].filter((channel) => (
    channel?.guildId === guild.id
    && channel.isTextBased?.()
    && !channel.isThread?.()
    && normalizedChangelogChannelName(channel.name) === 'changelog'
  ));
  return candidates.find((channel) => channel.name === CHANGELOG_CHANNEL_NAME) || candidates[0] || null;
}

async function findExistingChangelogChannel(guild) {
  const cached = selectChangelogChannel(guild, guild.channels?.cache);
  if (cached) return cached;
  const fetched = await guild.channels?.fetch?.().catch(() => null);
  return selectChangelogChannel(guild, fetched);
}

async function ensureChangelogChannelName(channel, logger = appLogger) {
  if (!channel || channel.name === CHANGELOG_CHANNEL_NAME || typeof channel.setName !== 'function') return false;
  try {
    await channel.setName(CHANGELOG_CHANNEL_NAME, 'Nom du salon changelog FyxBot synchronisé');
    return true;
  } catch (error) {
    logger.warn?.(`[FyxBot] Impossible de renommer le salon changelog : ${error.message}`);
    return false;
  }
}

function extractChanges(body) {
  const changes = [];
  let section = 'Changements';
  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.trim();
    const heading = line.match(/^###\s+(.+)$/);
    if (heading) {
      section = heading[1].trim();
      continue;
    }
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) changes.push({ section, text: bullet[1].trim() });
  }
  return changes;
}

function parsePublishedReleases(markdown) {
  const headers = [...String(markdown || '').matchAll(/^##\s+\[([^\]]+)]\s+—\s+(.+)$/gm)];
  const releases = [];
  for (let index = 0; index < headers.length; index += 1) {
    const header = headers[index];
    const version = header[1].trim();
    const date = header[2].trim();
    if (/en préparation/i.test(date)) continue;
    const bodyStart = header.index + header[0].length;
    const bodyEnd = headers[index + 1]?.index ?? String(markdown).length;
    const body = String(markdown).slice(bodyStart, bodyEnd).trim();
    const changes = extractChanges(body);
    if (changes.length === 0) continue;
    const fingerprint = createHash('sha256').update(`${version}\n${body}`).digest('hex').slice(0, 16);
    const patchNumber = Number(version.split('.')[2]);
    releases.push({
      id: `${version}-${fingerprint}`,
      version,
      date,
      title: Number.isFinite(patchNumber) && patchNumber > 0 ? `Correctifs FyxBot ${version}` : `Mise à jour FyxBot ${version}`,
      changes,
    });
  }
  return releases;
}

function readPublishedReleases() {
  return publishedReleases();
}

function getPendingReleases(releases, deliveredReleaseIds = []) {
  const delivered = new Set(Array.isArray(deliveredReleaseIds) ? deliveredReleaseIds : []);
  return releases.filter((release) => !delivered.has(release.id));
}

function publicChangelogUrl() {
  const configured = String(process.env.DASHBOARD_PUBLIC_URL || '').trim();
  if (!configured) return DEFAULT_PUBLIC_URL;
  try {
    const url = new URL('/changelog', configured);
    return url.protocol === 'https:' ? url.toString() : DEFAULT_PUBLIC_URL;
  } catch {
    return DEFAULT_PUBLIC_URL;
  }
}

function releasePayload(release, linkUrl = publicChangelogUrl()) {
  const visibleChanges = release.changes.slice(0, 10);
  const lines = visibleChanges.map((change) => `• **${change.section}** — ${change.text.slice(0, 320)}`);
  if (release.changes.length > visibleChanges.length) lines.push(`• **Suite** — ${release.changes.length - visibleChanges.length} autre(s) changement(s) dans le changelog complet.`);
  const description = [`Version publiée le **${release.date}**.`, '', ...lines].join('\n').slice(0, 4000);
  return customMessagePayload({
    mode: 'changelog',
    content: '📰 **Nouveau changelog FyxBot**',
    version: release.version,
    title: release.title,
    description,
    color: '#ef4444',
    linkUrl,
    buttonLabel: 'Consulter le changelog',
    footer: 'FyxBot • Mise à jour automatique',
  });
}

async function publishPendingReleasesForGuild(guild, config, {
  releases = readPublishedReleases(),
  saveConfig = setChangelogConfig,
} = {}) {
  if (!config?.channelId) return { published: 0, missingChannel: false };
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased() || channel.guildId !== guild.id) return { published: 0, missingChannel: true };
  await ensureChangelogChannelName(channel);
  const delivered = [...new Set(Array.isArray(config.deliveredReleaseIds) ? config.deliveredReleaseIds : [])];
  const pending = getPendingReleases(releases, delivered).reverse();
  let published = 0;
  for (const release of pending) {
    await channel.send(releasePayload(release));
    delivered.push(release.id);
    await saveConfig(guild.id, {
      ...config,
      channelId: channel.id,
      deliveredReleaseIds: [...new Set(delivered)],
      lastPublishedVersion: release.version,
      updatedAt: new Date().toISOString(),
    });
    published += 1;
  }
  return { published, missingChannel: false };
}

async function initializeChangelogChannel(guild, channel, {
  releases = readPublishedReleases(),
  loadConfig = getChangelogConfig,
  saveConfig = setChangelogConfig,
} = {}) {
  if (!channel?.isTextBased() || channel.guildId !== guild.id) throw new Error('Le salon changelog FyxBot est invalide.');
  await ensureChangelogChannelName(channel);
  const current = await loadConfig(guild.id);
  if (current?.channelId === channel.id) {
    return publishPendingReleasesForGuild(guild, current, { releases, saveConfig });
  }
  const latest = releases[0];
  if (latest) await channel.send(releasePayload(latest));
  await saveConfig(guild.id, {
    channelId: channel.id,
    deliveredReleaseIds: releases.map((release) => release.id),
    lastPublishedVersion: latest?.version || null,
    updatedAt: new Date().toISOString(),
  });
  return { published: latest ? 1 : 0, missingChannel: false };
}

async function broadcastPendingChangelogs(client, {
  releases = readPublishedReleases(),
  loadConfig = getChangelogConfig,
  saveConfig = setChangelogConfig,
  logger = appLogger,
} = {}) {
  let published = 0;
  let configuredGuilds = 0;
  let errors = 0;
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await loadConfig(guild.id);
      let result;
      if (config?.channelId) {
        configuredGuilds += 1;
        result = await publishPendingReleasesForGuild(guild, config, { releases, saveConfig });
        if (result.missingChannel) {
          const replacement = await findExistingChangelogChannel(guild);
          if (replacement && replacement.id !== config.channelId) {
            result = await initializeChangelogChannel(guild, replacement, { releases, loadConfig, saveConfig });
          }
        }
      } else {
        const existingChannel = await findExistingChangelogChannel(guild);
        if (!existingChannel) continue;
        configuredGuilds += 1;
        result = await initializeChangelogChannel(guild, existingChannel, { releases, loadConfig, saveConfig });
      }
      published += result.published;
      if (result.missingChannel) logger.warn(`[FyxBot] Salon changelog introuvable sur ${guild.name}. Relancez /setup lancer.`);
    } catch (error) {
      errors += 1;
      logger.error(`[FyxBot] Changelog impossible sur ${guild.name} : ${error.message}`);
    }
  }
  return { published, configuredGuilds, errors };
}

module.exports = {
  CHANGELOG_CHANNEL_NAME,
  broadcastPendingChangelogs,
  ensureChangelogChannelName,
  extractChanges,
  findExistingChangelogChannel,
  getPendingReleases,
  initializeChangelogChannel,
  parsePublishedReleases,
  publishPendingReleasesForGuild,
  publicChangelogUrl,
  readPublishedReleases,
  releasePayload,
};
