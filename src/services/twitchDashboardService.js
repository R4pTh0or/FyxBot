const twitchStore = require('../database/twitchStore');
const { RESERVED_TWITCH_COMMANDS } = require('./twitchCommandRegistry');
const { TwitchApiClient, TwitchApiError } = require('./twitchApi');

const TWITCH_BROADCASTER_SCOPES = Object.freeze([
  'moderator:manage:banned_users',
  'moderator:manage:chat_messages',
  'moderator:manage:chat_settings',
]);

class TwitchDashboardError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'TwitchDashboardError';
    this.status = status;
    this.code = code;
  }
}

function inferredTwitchCallbackUrl(environment = process.env) {
  const configured = String(environment.TWITCH_OAUTH_CALLBACK || '').trim();
  if (configured) return configured;
  const discordCallback = String(environment.DISCORD_OAUTH_CALLBACK || '').trim();
  if (discordCallback) {
    try {
      const callback = new URL(discordCallback);
      callback.pathname = '/api/twitch/auth/callback';
      callback.search = '';
      callback.hash = '';
      return callback.toString();
    } catch { /* TwitchApiClient retournera une erreur de configuration sûre. */ }
  }
  const port = Number(environment.DASHBOARD_API_PORT || environment.PORT || 3001);
  return `http://127.0.0.1:${port}/api/twitch/auth/callback`;
}

function twitchPanelReturnUrl(status, guildId, environment = process.env) {
  const fallback = 'http://127.0.0.1:3000';
  let target;
  try {
    target = new URL(String(environment.DASHBOARD_PUBLIC_URL || fallback).trim());
  } catch {
    target = new URL(fallback);
  }
  target.searchParams.set('twitch', status);
  if (guildId) target.searchParams.set('guildId', guildId);
  return target.toString();
}

function createTwitchApi(environment = process.env, dependencies = {}) {
  if (dependencies.apiClient) return dependencies.apiClient;
  return new TwitchApiClient({
    clientId: environment.TWITCH_CLIENT_ID,
    clientSecret: environment.TWITCH_CLIENT_SECRET,
    redirectUri: inferredTwitchCallbackUrl(environment),
  }, {
    fetchFn: dependencies.fetchFn,
    now: dependencies.now,
  });
}

function storeOptions(dependencies = {}) {
  return dependencies.storeOptions || {};
}

async function notifyRuntime(dependencies, hookName, payload, guildId) {
  const hook = dependencies.runtimeHooks?.[hookName];
  if (typeof hook !== 'function') return true;
  try {
    await hook(payload);
    return true;
  } catch {
    const store = dependencies.store || twitchStore;
    try {
      await store.setTwitchRuntimeStatus(
        guildId,
        'error',
        'Configuration enregistrée ; synchronisation Twitch à réessayer.',
        storeOptions(dependencies),
      );
    } catch { /* L’échec du signal secondaire ne doit pas exposer de détail interne. */ }
    return false;
  }
}

function twitchDashboardError(error) {
  if (error instanceof TwitchDashboardError) return error;
  if (error instanceof TwitchApiError) {
    if (error.status === 429) return new TwitchDashboardError(429, 'TWITCH_RATE_LIMITED', 'Twitch reçoit trop de demandes. Réessayez dans quelques instants.');
    if (error.status === 401 || error.status === 403) return new TwitchDashboardError(502, 'TWITCH_AUTHORIZATION_REFUSED', 'Twitch a refusé cette autorisation. Recommencez la connexion.');
    if (error.status === 400) return new TwitchDashboardError(400, 'TWITCH_INVALID_REQUEST', error.message);
    if (error.code === 'invalid_configuration') return new TwitchDashboardError(503, 'TWITCH_NOT_CONFIGURED', 'La connexion Twitch n’est pas encore configurée sur FyxBot.');
    return new TwitchDashboardError(502, 'TWITCH_UNAVAILABLE', 'Twitch est temporairement indisponible. Réessayez dans quelques instants.');
  }
  if (error instanceof twitchStore.TwitchStoreError || error?.name === 'TwitchStoreError') {
    if (error.code === 'TWITCH_BROADCASTER_IN_USE') return new TwitchDashboardError(409, error.code, error.message);
    if (error.code === 'TWITCH_CONNECTION_REQUIRED') return new TwitchDashboardError(409, error.code, error.message);
    if (error.code.endsWith('_WRITE_FAILED')) return new TwitchDashboardError(503, error.code, error.message);
    return new TwitchDashboardError(400, error.code, error.message);
  }
  return new TwitchDashboardError(500, 'TWITCH_INTERNAL_ERROR', 'Une erreur interne empêche cette action Twitch.');
}

async function publicTwitchStatus(guildId, dependencies = {}) {
  const store = dependencies.store || twitchStore;
  const options = storeOptions(dependencies);
  const [connection, runtime, chat, commands] = await Promise.all([
    store.getTwitchConnection(guildId, options),
    store.getTwitchRuntimeStatus(guildId, options),
    store.getTwitchChatConfig(guildId, options),
    store.listTwitchCustomCommands(guildId, options),
  ]);
  return {
    connected: Boolean(connection),
    enabled: Boolean(connection?.enabled),
    chatEnabled: Boolean(connection?.enabled && chat.enabled),
    broadcaster: connection ? {
      id: connection.broadcasterUserId,
      login: connection.broadcasterLogin,
      displayName: connection.broadcasterDisplayName,
    } : null,
    scopes: connection?.scopes || [],
    expiresAt: connection?.expiresAt || null,
    expired: connection?.expired ?? null,
    connectedAt: connection?.connectedAt || null,
    lastSignalAt: runtime?.updatedAt || connection?.updatedAt || null,
    runtime,
    chat: { ...chat, guildId },
    commands,
  };
}

async function startTwitchAuthorization(guildId, discordUserId, dependencies = {}) {
  try {
    const store = dependencies.store || twitchStore;
    const api = createTwitchApi(dependencies.environment || process.env, dependencies);
    const state = await store.issueTwitchOAuthState(guildId, discordUserId, storeOptions(dependencies));
    return {
      guildId,
      authorizationUrl: api.getAuthorizationUrl(TWITCH_BROADCASTER_SCOPES, state).toString(),
    };
  } catch (error) {
    throw twitchDashboardError(error);
  }
}

async function completeTwitchAuthorization(input = {}, dependencies = {}) {
  const store = dependencies.store || twitchStore;
  const options = storeOptions(dependencies);
  const guildId = store.twitchOAuthStateGuildId(input.state);
  if (!guildId) throw new TwitchDashboardError(400, 'TWITCH_INVALID_STATE', 'Connexion Twitch expirée ou invalide.');
  const consumed = await store.consumeTwitchOAuthState(guildId, input.state, {
    ...options,
    discordUserId: input.discordUserId,
  });
  if (!consumed) throw new TwitchDashboardError(400, 'TWITCH_INVALID_STATE', 'Connexion Twitch expirée ou invalide.');
  if (input.providerError) throw new TwitchDashboardError(400, 'TWITCH_AUTHORIZATION_CANCELLED', 'La connexion Twitch a été annulée.');
  if (!input.code) throw new TwitchDashboardError(400, 'TWITCH_CODE_REQUIRED', 'Le code de connexion Twitch est manquant.');

  try {
    const api = createTwitchApi(dependencies.environment || process.env, dependencies);
    const tokenSet = await api.exchangeCode(input.code);
    const users = await api.helix('users', tokenSet.accessToken);
    const broadcaster = users?.data?.[0];
    if (!broadcaster?.id || !broadcaster?.login || !broadcaster?.display_name) {
      throw new TwitchDashboardError(502, 'TWITCH_IDENTITY_UNAVAILABLE', 'Twitch n’a pas retourné l’identité de la chaîne.');
    }
    const existing = await store.getTwitchConnection(guildId, options);
    const connection = await store.upsertTwitchConnection(guildId, {
      broadcasterUserId: broadcaster.id,
      broadcasterLogin: broadcaster.login,
      broadcasterDisplayName: broadcaster.display_name,
      accessToken: tokenSet.accessToken,
      refreshToken: tokenSet.refreshToken,
      scopes: tokenSet.scopes,
      expiresAt: tokenSet.expiresAt,
      enabled: existing?.enabled === true,
    }, options);
    await store.setTwitchRuntimeStatus(guildId, 'disconnected', null, options);
    const status = await publicTwitchStatus(guildId, dependencies);
    const runtimeSynchronized = await notifyRuntime(
      dependencies,
      'onConnectionChanged',
      { guildId, status },
      guildId,
    );
    return {
      guildId,
      connection,
      runtimeSynchronized,
      redirectUrl: twitchPanelReturnUrl('connected', guildId, dependencies.environment || process.env),
    };
  } catch (error) {
    throw twitchDashboardError(error);
  }
}

async function disconnectTwitch(guildId, dependencies = {}) {
  try {
    const store = dependencies.store || twitchStore;
    const options = storeOptions(dependencies);
    const currentChat = await store.getTwitchChatConfig(guildId, options);
    await store.setTwitchChatConfig(guildId, { ...currentChat, enabled: false }, options);
    const removed = await store.deleteTwitchConnection(guildId, options);
    await store.setTwitchRuntimeStatus(guildId, 'disconnected', null, options);
    const status = await publicTwitchStatus(guildId, dependencies);
    const runtimeSynchronized = await notifyRuntime(dependencies, 'onDisconnected', { guildId, status }, guildId);
    return { removed, runtimeSynchronized, status };
  } catch (error) {
    throw twitchDashboardError(error);
  }
}

async function updateTwitchChatConfig(guildId, config, dependencies = {}) {
  try {
    const store = dependencies.store || twitchStore;
    const result = await store.configureTwitchChat(guildId, config, storeOptions(dependencies));
    const status = await publicTwitchStatus(guildId, dependencies);
    const runtimeSynchronized = await notifyRuntime(dependencies, 'onChatConfigChanged', { guildId, status }, guildId);
    return { ...result, runtimeSynchronized, status: await publicTwitchStatus(guildId, dependencies) };
  } catch (error) {
    throw twitchDashboardError(error);
  }
}

async function mutateTwitchCommand(guildId, input = {}, dependencies = {}) {
  try {
    const store = dependencies.store || twitchStore;
    const options = storeOptions(dependencies);
    const action = String(input.action || '').trim().toLowerCase();
    const name = store.normalizeCommandName(input.name);
    const existing = await store.getTwitchCustomCommand(guildId, name, options);
    if (['add', 'update'].includes(action) && RESERVED_TWITCH_COMMANDS.has(name)) {
      throw new TwitchDashboardError(409, 'TWITCH_RESERVED_COMMAND', `La commande !${name} est réservée à FyxBot.`);
    }
    if (action === 'add') {
      if (existing) throw new TwitchDashboardError(409, 'TWITCH_COMMAND_EXISTS', `La commande !${name} existe déjà.`);
      await store.upsertTwitchCustomCommand(guildId, { ...input, name }, options);
    } else if (action === 'update') {
      if (!existing) throw new TwitchDashboardError(404, 'TWITCH_COMMAND_NOT_FOUND', 'Cette commande Twitch n’existe plus.');
      await store.upsertTwitchCustomCommand(guildId, {
        ...existing,
        response: input.response ?? existing.response,
        cooldownSeconds: input.cooldownSeconds ?? existing.cooldownSeconds,
        accessLevel: input.accessLevel ?? existing.accessLevel,
        enabled: input.enabled ?? existing.enabled,
        name,
      }, options);
    } else if (action === 'toggle') {
      if (!existing) throw new TwitchDashboardError(404, 'TWITCH_COMMAND_NOT_FOUND', 'Cette commande Twitch n’existe plus.');
      if (typeof input.enabled !== 'boolean') throw new TwitchDashboardError(400, 'TWITCH_ENABLED_REQUIRED', 'Indiquez si la commande doit être activée ou désactivée.');
      await store.upsertTwitchCustomCommand(guildId, { ...existing, enabled: input.enabled, name }, options);
    } else if (action === 'remove') {
      if (input.confirmation !== 'SUPPRIMER') throw new TwitchDashboardError(400, 'TWITCH_CONFIRMATION_REQUIRED', 'Écrivez SUPPRIMER pour confirmer.');
      if (!await store.deleteTwitchCustomCommand(guildId, name, options)) {
        throw new TwitchDashboardError(404, 'TWITCH_COMMAND_NOT_FOUND', 'Cette commande Twitch n’existe plus.');
      }
    } else {
      throw new TwitchDashboardError(400, 'TWITCH_INVALID_ACTION', 'Action de commande Twitch inconnue.');
    }
    const result = {
      command: action === 'remove' ? null : await store.getTwitchCustomCommand(guildId, name, options),
      commands: await store.listTwitchCustomCommands(guildId, options),
    };
    result.runtimeSynchronized = await notifyRuntime(
      dependencies,
      'onCommandsChanged',
      { guildId, commands: result.commands },
      guildId,
    );
    return result;
  } catch (error) {
    throw twitchDashboardError(error);
  }
}

module.exports = {
  TWITCH_BROADCASTER_SCOPES,
  TwitchDashboardError,
  completeTwitchAuthorization,
  createTwitchApi,
  disconnectTwitch,
  inferredTwitchCallbackUrl,
  mutateTwitchCommand,
  publicTwitchStatus,
  startTwitchAuthorization,
  twitchDashboardError,
  twitchPanelReturnUrl,
  updateTwitchChatConfig,
};
