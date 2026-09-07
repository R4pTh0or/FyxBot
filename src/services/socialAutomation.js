const { getSocialConfig, setSocialConfig } = require('../database/socialStore');
const { socialNotificationPayload } = require('./socialNotifications');
const logger = require('./logger').logger.child({ component: 'social-automation' });

const SUPPORTED_AUTOMATIC_PLATFORMS = Object.freeze(['youtube', 'twitch']);
let twitchTokenCache = null;

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function xmlValue(xml, tag) {
  const match = String(xml).match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i'));
  return decodeXml(match?.[1]?.trim());
}

function parseYouTubeFeed(xml) {
  const entry = String(xml || '').match(/<entry>([\s\S]*?)<\/entry>/i)?.[1];
  if (!entry) return null;
  const link = entry.match(/<link[^>]+href="([^"]+)"/i)?.[1];
  const itemId = xmlValue(entry, 'yt:videoId') || xmlValue(entry, 'id');
  const title = xmlValue(entry, 'title');
  const creator = xmlValue(entry, 'name') || xmlValue(xml, 'title');
  if (!itemId || !link || !title) return null;
  return { itemId, title, creator: creator || 'Chaîne YouTube', url: decodeXml(link), type: 'video', platform: 'YouTube' };
}

function normalizeSocialSource({ platform, identifier, label = '' }) {
  const normalizedPlatform = String(platform || '').trim().toLowerCase();
  const normalizedIdentifier = String(identifier || '').trim();
  if (!SUPPORTED_AUTOMATIC_PLATFORMS.includes(normalizedPlatform)) throw new Error('Choisissez YouTube ou Twitch.');
  if (normalizedPlatform === 'youtube' && !/^UC[\w-]{20,32}$/.test(normalizedIdentifier)) {
    throw new Error('Indiquez l’identifiant de chaîne YouTube commençant par UC.');
  }
  if (normalizedPlatform === 'twitch' && !/^[a-zA-Z0-9_]{3,25}$/.test(normalizedIdentifier)) {
    throw new Error('Indiquez le nom de chaîne Twitch, sans URL.');
  }
  const canonicalIdentifier = normalizedPlatform === 'twitch' ? normalizedIdentifier.toLowerCase() : normalizedIdentifier;
  return {
    id: `${normalizedPlatform}:${canonicalIdentifier}`,
    platform: normalizedPlatform,
    identifier: canonicalIdentifier,
    label: String(label || canonicalIdentifier).trim().slice(0, 80),
    enabled: true,
    createdAt: new Date().toISOString(),
  };
}

function replaceSocialSource(sources, sourceId, input, now = new Date()) {
  const items = Array.isArray(sources) ? [...sources] : [];
  const index = items.findIndex((source) => source.id === sourceId);
  if (index < 0) throw new Error('Source sociale introuvable.');

  const current = items[index];
  const normalized = normalizeSocialSource(input);
  if (items.some((source, sourceIndex) => sourceIndex !== index && source.id === normalized.id)) {
    throw new Error('Cette source est déjà surveillée.');
  }

  const identityChanged = current.id !== normalized.id;
  const updatedAt = now.toISOString();
  const updated = identityChanged
    ? {
        ...normalized,
        createdAt: current.createdAt || normalized.createdAt,
        updatedAt,
        status: 'pending',
      }
    : {
        ...current,
        ...normalized,
        createdAt: current.createdAt || normalized.createdAt,
        updatedAt,
      };
  items[index] = updated;
  return { sources: items, source: updated, identityChanged };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`Réponse HTTP ${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function latestYouTubeItem(channelId) {
  const response = await fetchWithTimeout(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  return parseYouTubeFeed(await response.text());
}

async function twitchAppToken() {
  const clientId = process.env.TWITCH_CLIENT_ID?.trim();
  const clientSecret = process.env.TWITCH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error('Twitch attend TWITCH_CLIENT_ID et TWITCH_CLIENT_SECRET.');
  if (twitchTokenCache?.expiresAt > Date.now() + 60_000) return { clientId, token: twitchTokenCache.token };
  const url = new URL('https://id.twitch.tv/oauth2/token');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('client_secret', clientSecret);
  url.searchParams.set('grant_type', 'client_credentials');
  const response = await fetchWithTimeout(url, { method: 'POST' });
  const body = await response.json();
  twitchTokenCache = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return { clientId, token: body.access_token };
}

async function twitchApi(pathname, searchParams) {
  const { clientId, token } = await twitchAppToken();
  const url = new URL(`https://api.twitch.tv/helix/${pathname}`);
  for (const [key, value] of Object.entries(searchParams)) url.searchParams.set(key, value);
  const response = await fetchWithTimeout(url, { headers: { 'Client-Id': clientId, Authorization: `Bearer ${token}` } });
  return response.json();
}

async function latestTwitchItem(login) {
  const users = await twitchApi('users', { login });
  const user = users.data?.[0];
  if (!user) throw new Error('Chaîne Twitch introuvable.');
  const streams = await twitchApi('streams', { user_id: user.id });
  const stream = streams.data?.[0];
  if (!stream) return null;
  return {
    itemId: stream.id,
    title: stream.title || `${user.display_name} est en direct`,
    creator: user.display_name || login,
    url: `https://www.twitch.tv/${encodeURIComponent(user.login)}`,
    type: 'live',
    platform: 'Twitch',
  };
}

async function latestSocialItem(source) {
  if (source.platform === 'youtube') return latestYouTubeItem(source.identifier);
  if (source.platform === 'twitch') return latestTwitchItem(source.identifier);
  throw new Error('Plateforme automatique inconnue.');
}

async function checkGuildSocialNotifications(guild) {
  const config = await getSocialConfig(guild.id);
  const sources = Array.isArray(config?.sources) ? config.sources : [];
  if (!config?.channelId || sources.length === 0) return { checked: 0, published: 0 };
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  if (!channel?.isTextBased()) return { checked: 0, published: 0 };
  let published = 0;
  let changed = false;
  const updatedSources = [];
  for (const source of sources) {
    if (source.enabled === false) { updatedSources.push(source); continue; }
    try {
      const item = await latestSocialItem(source);
      const checkedAt = new Date().toISOString();
      if (!item) {
        updatedSources.push({ ...source, status: 'waiting', lastCheckedAt: checkedAt, lastError: null });
        changed = true;
        continue;
      }
      const firstObservation = source.lastItemId === undefined;
      const isNew = !firstObservation && source.lastItemId !== item.itemId;
      if (isNew) {
        await channel.send(socialNotificationPayload({ ...item, roleId: config.roleId }));
        published += 1;
      }
      updatedSources.push({
        ...source,
        lastItemId: item.itemId,
        lastCheckedAt: checkedAt,
        lastNotifiedAt: isNew ? checkedAt : source.lastNotifiedAt,
        status: firstObservation ? 'initialized' : 'active',
        lastError: null,
      });
      changed = true;
    } catch (error) {
      updatedSources.push({ ...source, status: 'error', lastCheckedAt: new Date().toISOString(), lastError: String(error.message).slice(0, 200) });
      changed = true;
      logger.warn({ err: error, guildId: guild.id, sourceId: source.id }, '[FyxBot] Vérification d’une source sociale impossible.');
    }
  }
  if (changed) await setSocialConfig(guild.id, { ...config, sources: updatedSources, updatedAt: new Date().toISOString() });
  return { checked: updatedSources.length, published };
}

async function checkSocialNotifications(client) {
  const results = [];
  for (const guild of client.guilds.cache.values()) {
    try { results.push(await checkGuildSocialNotifications(guild)); }
    catch (error) { logger.error({ err: error, guildId: guild.id }, '[FyxBot] Automatisation sociale indisponible.'); }
  }
  return results;
}

function startSocialNotificationScheduler(client, intervalMs = Number(process.env.FYXBOT_SOCIAL_INTERVAL_MS) || 5 * 60_000) {
  const safeInterval = Math.max(intervalMs, 60_000);
  let stopped = false;
  let running = false;
  const run = async () => {
    if (stopped || running || !client.isReady()) return;
    running = true;
    try { await checkSocialNotifications(client); } finally { running = false; }
  };
  const timer = setInterval(() => void run(), safeInterval);
  timer.unref();
  setTimeout(() => void run(), 15_000).unref();
  return { stop() { stopped = true; clearInterval(timer); } };
}

module.exports = {
  SUPPORTED_AUTOMATIC_PLATFORMS,
  checkGuildSocialNotifications,
  checkSocialNotifications,
  latestSocialItem,
  normalizeSocialSource,
  parseYouTubeFeed,
  replaceSocialSource,
  startSocialNotificationScheduler,
};
