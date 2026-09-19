const twitchStore = require('../database/twitchStore');
const { addAuditLog } = require('../database/auditLogStore');
const { TwitchApiClient } = require('./twitchApi');
const { TwitchChatClient } = require('./twitchChatClient');
const { createDefaultTwitchCommands } = require('./twitchCommandRegistry');
const rootLogger = require('./logger').logger;

const DEFAULT_STREAM_CACHE_MS = 30_000;
const BOT_TOKEN_REFRESH_LEEWAY_MS = 5 * 60_000;
const BOT_TOKEN_REFRESH_RETRY_MS = 60_000;
const TWITCH_MODERATION_AUDIT_PREFIX = 'FyxStream · ';
const TWITCH_MODERATION_LABELS = Object.freeze({
  ban: 'Bannissement',
  unban: 'Débannissement',
  timeout: 'Timeout',
  clear: 'Nettoyage du chat',
  slow: 'Mode lent',
});

function publicErrorType(error) {
  if (!error || typeof error !== 'object') return 'UnknownError';
  const name = String(error.name || 'Error').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60);
  const code = String(error.code || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  return code ? `${name}:${code}` : name;
}

function runtimeRedirectUri(environment) {
  const configured = String(environment.TWITCH_OAUTH_CALLBACK || '').trim();
  if (configured) return configured;
  const port = Number(environment.DASHBOARD_API_PORT || environment.PORT || 3001);
  return `http://127.0.0.1:${Number.isInteger(port) && port > 0 ? port : 3001}/api/twitch/auth/callback`;
}

function createRuntimeApi(environment, options) {
  if (Object.hasOwn(options, 'twitchApi')) return options.twitchApi;
  if (!environment.TWITCH_CLIENT_ID?.trim() || !environment.TWITCH_CLIENT_SECRET?.trim()) return null;
  try {
    return new TwitchApiClient({
      clientId: environment.TWITCH_CLIENT_ID,
      clientSecret: environment.TWITCH_CLIENT_SECRET,
      redirectUri: runtimeRedirectUri(environment),
    }, {
      fetchFn: options.fetchFn,
      now: options.now,
    });
  } catch {
    return null;
  }
}

class TwitchConnectionManager {
  constructor(options = {}) {
    this.environment = options.environment || process.env;
    this.store = options.store || twitchStore;
    this.storeOptions = options.storeOptions || {};
    this.now = options.now || Date.now;
    this.chatClientFactory = options.chatClientFactory
      || ((clientOptions) => new TwitchChatClient(clientOptions));
    this.logger = options.logger || rootLogger.child({ component: 'twitch-runtime' });
    this.twitchApi = createRuntimeApi(this.environment, options);
    this.recordAudit = options.recordAudit || addAuditLog;
    this.streamCacheMs = Number.isInteger(options.streamCacheMs)
      ? Math.max(0, options.streamCacheMs)
      : DEFAULT_STREAM_CACHE_MS;
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.botUsername = String(this.environment.TWITCH_BOT_USERNAME || '').trim();
    this.botAccessToken = String(this.environment.TWITCH_BOT_ACCESS_TOKEN || '').trim();
    this.botRefreshToken = String(this.environment.TWITCH_BOT_REFRESH_TOKEN || '').trim();
    this.botTokenRefreshTimer = null;
    this.botTokenRefreshInFlight = null;
    this.entries = new Map();
    this.pending = new Map();
    this.streamCache = new Map();
    this.started = false;
  }

  async start() {
    if (this.started) return { started: [], skipped: [], failed: [] };
    this.started = true;
    if (this.botUsername && this.botRefreshToken && this.twitchApi) {
      try {
        await this.#refreshBotToken();
      } catch (error) {
        this.logger.warn({ errorType: publicErrorType(error) }, '[FyxBot] Renouvellement initial du compte Twitch différé.');
        this.#scheduleBotTokenRetry();
      }
    }
    let connections;
    try {
      connections = await this.store.listEnabledTwitchConnections(this.storeOptions);
    } catch (error) {
      this.logger.error({ errorType: publicErrorType(error) }, '[FyxBot] Lecture des connexions Twitch impossible.');
      return { started: [], skipped: [], failed: [{ guildId: null, reason: 'storage' }] };
    }

    const report = { started: [], skipped: [], failed: [] };
    for (const connection of connections) {
      const guildId = String(connection?.guildId || '');
      try {
        const result = await this.refreshGuild(guildId);
        if (result.started) report.started.push(guildId);
        else report.skipped.push({ guildId, reason: result.reason });
      } catch (error) {
        report.failed.push({ guildId, reason: 'runtime' });
        this.#setRuntimeStatus(guildId, 'error', 'Le chat Twitch FyxBot n’a pas pu démarrer.');
        this.logger.error({ guildId, errorType: publicErrorType(error) }, '[FyxBot] Démarrage Twitch impossible pour un serveur.');
      }
    }
    this.logger.info({ started: report.started.length, skipped: report.skipped.length, failed: report.failed.length }, '[FyxBot] Gestionnaire Twitch initialisé.');
    return report;
  }

  refreshGuild(guildId) {
    return this.#enqueue(guildId, () => this.#refreshGuild(guildId));
  }

  syncGuildCommands(guildId) {
    return this.#enqueue(guildId, async () => {
      const entry = this.entries.get(String(guildId));
      if (!entry) return { loaded: [], skipped: [], active: false };
      const commands = await this.store.listTwitchCustomCommands(String(guildId), this.storeOptions);
      const report = entry.registry.syncCustom(commands);
      if (report.skipped.length > 0) {
        this.logger.warn({ guildId: String(guildId), skipped: report.skipped.length }, '[FyxBot] Certaines commandes Twitch invalides ont été ignorées.');
      }
      return { ...report, active: true };
    });
  }

  refreshAfterConfiguration(guildId) {
    return this.refreshGuild(guildId);
  }

  refreshAfterCommands(guildId) {
    return this.syncGuildCommands(guildId);
  }

  stopGuild(guildId, options = {}) {
    const id = String(guildId || '');
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.stopping = true;
    for (const unsubscribe of entry.unsubscribe) unsubscribe();
    entry.client.disconnect();
    this.entries.delete(id);
    this.streamCache.delete(id);
    if (options.recordStatus !== false) this.#setRuntimeStatus(id, 'stopped', null);
    this.logger.info({ guildId: id }, '[FyxBot] Chat Twitch arrêté.');
    return true;
  }

  stop() {
    this.started = false;
    if (this.botTokenRefreshTimer) {
      this.clearTimeoutFn(this.botTokenRefreshTimer);
      this.botTokenRefreshTimer = null;
    }
    const guildIds = [...this.entries.keys()];
    for (const guildId of guildIds) this.stopGuild(guildId);
    return { stopped: guildIds };
  }

  status() {
    return {
      started: this.started,
      activeGuildIds: [...this.entries.keys()],
      pendingGuildIds: [...this.pending.keys()],
    };
  }

  async #refreshGuild(guildId) {
    const id = String(guildId || '');
    if (!this.started) return { started: false, reason: 'manager_stopped' };
    this.stopGuild(id, { recordStatus: false });
    const connection = await this.store.getTwitchConnection(id, this.storeOptions);
    const chat = await this.store.getTwitchChatConfig(id, this.storeOptions);
    if (!connection) {
      this.#setRuntimeStatus(id, 'disconnected', null);
      return { started: false, reason: 'disconnected' };
    }
    if (!connection.enabled || !chat.enabled) {
      this.#setRuntimeStatus(id, 'stopped', null);
      return { started: false, reason: 'disabled' };
    }

    const username = this.botUsername;
    const accessToken = this.botAccessToken;
    if (!username || !accessToken) {
      this.#setRuntimeStatus(id, 'error', 'Le compte Twitch officiel FyxBot doit être configuré.');
      return { started: false, reason: 'bot_credentials' };
    }

    let entry;
    const registry = createDefaultTwitchCommands({
      now: this.now,
      prefix: chat.prefix,
      discordUrl: this.environment.FYXBOT_SUPPORT_URL,
      websiteUrl: this.environment.DASHBOARD_PUBLIC_URL,
      moderationHandler: (request) => this.#moderateChat(entry, request),
    });
    const syncReport = registry.syncCustom(await this.store.listTwitchCustomCommands(id, this.storeOptions));
    if (syncReport.skipped.length > 0) {
      this.logger.warn({ guildId: id, skipped: syncReport.skipped.length }, '[FyxBot] Certaines commandes Twitch invalides ont été ignorées.');
    }

    let chatClient;
    try {
      chatClient = this.chatClientFactory({
        username,
        accessToken,
        channel: connection.broadcasterLogin,
      });
    } catch (error) {
      this.#setRuntimeStatus(id, 'error', 'La connexion au chat Twitch ne peut pas être préparée.');
      this.logger.error({ guildId: id, errorType: publicErrorType(error) }, '[FyxBot] Client Twitch invalide.');
      return { started: false, reason: 'client' };
    }

    entry = {
      guildId: id,
      connection,
      chat,
      client: chatClient,
      registry,
      stopping: false,
      unsubscribe: [],
    };
    entry.unsubscribe.push(chatClient.onStatus((connected) => {
      if (this.entries.get(id) !== entry) return;
      this.#setRuntimeStatus(id, connected ? 'connected' : entry.stopping ? 'stopped' : 'reconnecting', null);
    }));
    entry.unsubscribe.push(chatClient.onError((error) => {
      if (this.entries.get(id) !== entry || entry.stopping) return;
      this.#setRuntimeStatus(id, 'error', 'La connexion au chat Twitch a été interrompue.');
      this.logger.warn({ guildId: id, errorType: publicErrorType(error) }, '[FyxBot] Incident de connexion Twitch.');
    }));
    entry.unsubscribe.push(chatClient.onMessage((message) => this.#handleMessage(entry, message)));
    this.entries.set(id, entry);
    this.#setRuntimeStatus(id, 'connecting', null);
    Promise.resolve(chatClient.connect()).catch((error) => {
      if (this.entries.get(id) !== entry || entry.stopping) return;
      this.#setRuntimeStatus(id, 'error', 'La connexion au chat Twitch a échoué.');
      this.logger.error({ guildId: id, errorType: publicErrorType(error) }, '[FyxBot] Connexion Twitch refusée.');
    });
    return { started: true, syncReport };
  }

  async #handleMessage(entry, message) {
    if (this.entries.get(entry.guildId) !== entry || entry.stopping) return;
    const commandText = String(message?.text || '').trim();
    if (!commandText.startsWith(entry.registry.prefix)) return;
    if (message?.messageId) {
      let claimed;
      try {
        claimed = await this.store.claimTwitchProcessedMessage(
          entry.guildId,
          message.messageId,
          this.storeOptions,
        );
      } catch (error) {
        this.logger.error({ guildId: entry.guildId, errorType: publicErrorType(error) }, '[FyxBot] Déduplication Twitch indisponible.');
        return;
      }
      if (!claimed) return;
    }

    try {
      const uptimeCommand = `${entry.registry.prefix}uptime`;
      const streamStartedAt = commandText === uptimeCommand || commandText.startsWith(`${uptimeCommand} `)
        ? await this.#streamStartedAt(entry)
        : undefined;
      const result = await entry.registry.execute({ message, streamStartedAt });
      if (!result.handled || !result.response) return;
      const sent = entry.client.sendMessage(result.response);
      if (!sent) {
        this.logger.debug({ guildId: entry.guildId, commandName: result.commandName }, '[FyxBot] Réponse Twitch différée par le client de chat.');
        return;
      }
      if (result.custom) {
        try {
          await this.store.incrementTwitchCommandUsage(entry.guildId, result.commandName, this.storeOptions);
        } catch (error) {
          this.logger.warn({ guildId: entry.guildId, errorType: publicErrorType(error) }, '[FyxBot] Compteur de commande Twitch non mis à jour.');
        }
      }
    } catch (error) {
      const validationMessage = error instanceof Error && [
        'Indiquez un pseudo Twitch valide.',
        'Le timeout Twitch doit durer entre 1 seconde et 2 semaines.',
        'Le motif Twitch est limité à 500 caractères.',
        'Utilisez !slow 0 pour désactiver, ou une valeur de 3 à 120 secondes.',
      ].includes(error.message)
        ? error.message
        : null;
      if (validationMessage) entry.client.sendMessage(`Commande invalide : ${validationMessage}`);
      this.logger.warn({ guildId: entry.guildId, errorType: publicErrorType(error) }, '[FyxBot] Commande Twitch ignorée en sécurité.');
    }
  }

  async #streamStartedAt(entry) {
    if (!this.twitchApi) return undefined;
    const cached = this.streamCache.get(entry.guildId);
    const now = this.now();
    if (cached && cached.expiresAt > now) return cached.startedAt;
    try {
      const response = await this.twitchApi.helixAuthenticated(
        `streams?user_id=${encodeURIComponent(entry.connection.broadcasterUserId)}`,
        {
          loadTokenSet: async () => {
            const connection = await this.store.getTwitchConnection(entry.guildId, this.storeOptions);
            const tokens = await this.store.getTwitchConnectionTokens(entry.guildId, this.storeOptions);
            if (!connection || !tokens) throw new Error('Twitch connection unavailable');
            return { ...tokens, expiresAt: connection.expiresAt, scopes: connection.scopes };
          },
          saveTokenSet: async (tokenSet) => {
            if (this.entries.get(entry.guildId) !== entry || entry.stopping) {
              throw new Error('Twitch runtime stopped');
            }
            const connection = await this.store.getTwitchConnection(entry.guildId, this.storeOptions);
            if (!connection) throw new Error('Twitch connection unavailable');
            await this.store.upsertTwitchConnection(entry.guildId, {
              ...connection,
              ...tokenSet,
            }, this.storeOptions);
          },
        },
      );
      const startedAt = Date.parse(String(response?.data?.[0]?.started_at || ''));
      const value = Number.isFinite(startedAt) ? startedAt : undefined;
      this.streamCache.set(entry.guildId, { startedAt: value, expiresAt: now + this.streamCacheMs });
      return value;
    } catch (error) {
      this.logger.warn({ guildId: entry.guildId, errorType: publicErrorType(error) }, '[FyxBot] État du live Twitch indisponible.');
      return undefined;
    }
  }

  async #moderateChat(entry, request) {
    if (!entry || this.entries.get(entry.guildId) !== entry || entry.stopping || !this.twitchApi) {
      const detail = 'La modération Twitch est temporairement indisponible.';
      if (entry) await this.#recordModeration(entry, request, false, detail);
      return detail;
    }

    const requiredScope = request.action === 'clear'
      ? 'moderator:manage:chat_messages'
      : request.action === 'slow'
        ? 'moderator:manage:chat_settings'
        : 'moderator:manage:banned_users';
    const connection = await this.store.getTwitchConnection(entry.guildId, this.storeOptions);
    if (!connection || !Array.isArray(connection.scopes) || !connection.scopes.includes(requiredScope)) {
      const detail = `Autorisation manquante : ${requiredScope}. Reconnectez Twitch depuis le panel FyxBot.`;
      await this.#recordModeration(entry, request, false, detail);
      return detail;
    }

    const broadcasterId = connection.broadcasterUserId;
    const query = `broadcaster_id=${encodeURIComponent(broadcasterId)}&moderator_id=${encodeURIComponent(broadcasterId)}`;
    try {
      if (request.action === 'clear') {
        await this.#helixAuthenticated(entry, `moderation/chat?${query}`, { method: 'DELETE' });
        const detail = '🧹 Le chat Twitch a été effacé.';
        await this.#recordModeration(entry, request, true, detail);
        return detail;
      }
      if (request.action === 'slow') {
        const body = request.seconds === 0
          ? { slow_mode: false }
          : { slow_mode: true, slow_mode_wait_time: request.seconds };
        await this.#helixAuthenticated(entry, `chat/settings?${query}`, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const detail = request.seconds === 0
          ? '🐢 Le mode lent Twitch est désactivé.'
          : `🐢 Mode lent Twitch réglé sur ${request.seconds} seconde(s).`;
        await this.#recordModeration(entry, request, true, detail);
        return detail;
      }

      const target = await this.#twitchUser(entry, request.targetLogin);
      if (!target) {
        const detail = `Utilisateur Twitch @${request.targetLogin} introuvable.`;
        await this.#recordModeration(entry, request, false, detail);
        return detail;
      }
      if (target.id === broadcasterId) {
        const detail = 'Le diffuseur ne peut pas être modéré par cette commande.';
        await this.#recordModeration(entry, request, false, detail);
        return detail;
      }
      if (request.action === 'unban') {
        await this.#helixAuthenticated(
          entry,
          `moderation/bans?${query}&user_id=${encodeURIComponent(target.id)}`,
          { method: 'DELETE' },
        );
        const detail = `✅ @${target.login} n’est plus banni ni en timeout.`;
        await this.#recordModeration(entry, request, true, detail);
        return detail;
      }

      const data = { user_id: target.id };
      if (request.action === 'timeout') data.duration = request.durationSeconds;
      if (request.reason) data.reason = request.reason;
      await this.#helixAuthenticated(entry, `moderation/bans?${query}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ data }),
      });
      const detail = request.action === 'timeout'
        ? `⏳ @${target.login} est en timeout pour ${request.durationSeconds} seconde(s).`
        : `🔨 @${target.login} a été banni du chat.`;
      await this.#recordModeration(entry, request, true, detail);
      return detail;
    } catch (error) {
      this.logger.warn({
        guildId: entry.guildId,
        action: request.action,
        errorType: publicErrorType(error),
      }, '[FyxBot] Action de modération Twitch refusée.');
      const detail = 'Twitch a refusé cette action. Vérifiez les permissions et réessayez.';
      await this.#recordModeration(entry, request, false, detail);
      return detail;
    }
  }

  async #recordModeration(entry, request, success, detail) {
    const action = String(request?.action || 'unknown').toLowerCase();
    const actor = String(request?.message?.username || 'modérateur').replace(/^@/, '').slice(0, 25);
    const target = String(request?.targetLogin || '').replace(/^@/, '').slice(0, 25);
    const duration = action === 'timeout' && Number.isInteger(request?.durationSeconds)
      ? ` · ${request.durationSeconds}s`
      : action === 'slow' && Number.isInteger(request?.seconds)
        ? ` · ${request.seconds}s`
        : '';
    const description = [
      `Par @${actor}${target ? ` · cible @${target}` : ''}${duration}.`,
      success ? 'Action appliquée par Twitch.' : String(detail || 'Action refusée.').slice(0, 240),
    ].join(' ');
    try {
      await this.recordAudit(entry.guildId, {
        title: `${TWITCH_MODERATION_AUDIT_PREFIX}${TWITCH_MODERATION_LABELS[action] || 'Modération'}`,
        description,
        color: success ? 0x57f287 : 0xed4245,
      });
    } catch (error) {
      this.logger.warn({ guildId: entry.guildId, errorType: publicErrorType(error) }, '[FyxBot] Historique de modération Twitch non enregistré.');
    }
  }

  async #twitchUser(entry, login) {
    const response = await this.#helixAuthenticated(entry, `users?login=${encodeURIComponent(login)}`);
    const user = response?.data?.[0];
    return user?.id && user?.login ? user : null;
  }

  async #helixAuthenticated(entry, path, init = {}) {
    return this.twitchApi.helixAuthenticated(
      path,
      {
        loadTokenSet: async () => {
          const connection = await this.store.getTwitchConnection(entry.guildId, this.storeOptions);
          const tokens = await this.store.getTwitchConnectionTokens(entry.guildId, this.storeOptions);
          if (!connection || !tokens) throw new Error('Twitch connection unavailable');
          return { ...tokens, expiresAt: connection.expiresAt, scopes: connection.scopes };
        },
        saveTokenSet: async (tokenSet) => {
          if (this.entries.get(entry.guildId) !== entry || entry.stopping) {
            throw new Error('Twitch runtime stopped');
          }
          const connection = await this.store.getTwitchConnection(entry.guildId, this.storeOptions);
          if (!connection) throw new Error('Twitch connection unavailable');
          await this.store.upsertTwitchConnection(entry.guildId, {
            ...connection,
            ...tokenSet,
          }, this.storeOptions);
        },
      },
      init,
    );
  }

  async #refreshBotToken() {
    if (this.botTokenRefreshInFlight) return this.botTokenRefreshInFlight;
    if (!this.botRefreshToken || !this.twitchApi) throw new Error('Twitch bot refresh unavailable');
    this.botTokenRefreshInFlight = (async () => {
      const tokenSet = await this.twitchApi.refreshToken(this.botRefreshToken);
      this.botAccessToken = tokenSet.accessToken;
      this.botRefreshToken = tokenSet.refreshToken || this.botRefreshToken;
      this.#scheduleBotTokenRefresh(tokenSet.expiresAt);
      return tokenSet;
    })();
    try {
      return await this.botTokenRefreshInFlight;
    } finally {
      this.botTokenRefreshInFlight = null;
    }
  }

  #scheduleBotTokenRefresh(expiresAt) {
    if (this.botTokenRefreshTimer) this.clearTimeoutFn(this.botTokenRefreshTimer);
    const expiry = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt || ''));
    const delay = Number.isFinite(expiry)
      ? Math.max(BOT_TOKEN_REFRESH_RETRY_MS, expiry - this.now() - BOT_TOKEN_REFRESH_LEEWAY_MS)
      : BOT_TOKEN_REFRESH_RETRY_MS;
    this.botTokenRefreshTimer = this.setTimeoutFn(() => {
      this.botTokenRefreshTimer = null;
      void this.#refreshBotTokenAndReconnect();
    }, delay);
  }

  #scheduleBotTokenRetry() {
    if (!this.started || this.botTokenRefreshTimer || !this.botRefreshToken || !this.twitchApi) return;
    this.botTokenRefreshTimer = this.setTimeoutFn(() => {
      this.botTokenRefreshTimer = null;
      void this.#refreshBotTokenAndReconnect();
    }, BOT_TOKEN_REFRESH_RETRY_MS);
  }

  async #refreshBotTokenAndReconnect() {
    if (!this.started) return;
    try {
      await this.#refreshBotToken();
      const guildIds = [...this.entries.keys()];
      for (const guildId of guildIds) await this.refreshGuild(guildId);
      this.logger.info({ reconnected: guildIds.length }, '[FyxBot] Jeton du chat Twitch renouvelé.');
    } catch (error) {
      this.logger.warn({ errorType: publicErrorType(error) }, '[FyxBot] Renouvellement du chat Twitch reporté.');
      this.#scheduleBotTokenRetry();
    }
  }

  #setRuntimeStatus(guildId, status, detail) {
    try {
      Promise.resolve(this.store.setTwitchRuntimeStatus(guildId, status, detail, this.storeOptions))
        .catch((error) => this.logger.error({ guildId, status, errorType: publicErrorType(error) }, '[FyxBot] Statut Twitch non enregistré.'));
    } catch (error) {
      this.logger.error({ guildId, status, errorType: publicErrorType(error) }, '[FyxBot] Statut Twitch non enregistré.');
    }
  }

  #enqueue(guildId, operation) {
    const id = String(guildId || '');
    const previous = this.pending.get(id) || Promise.resolve();
    const next = previous.then(operation, operation);
    this.pending.set(id, next);
    return next.finally(() => {
      if (this.pending.get(id) === next) this.pending.delete(id);
    });
  }
}

async function startTwitchConnectionManager(options = {}) {
  const manager = new TwitchConnectionManager(options);
  await manager.start();
  return manager;
}

module.exports = {
  BOT_TOKEN_REFRESH_LEEWAY_MS,
  BOT_TOKEN_REFRESH_RETRY_MS,
  DEFAULT_STREAM_CACHE_MS,
  TwitchConnectionManager,
  createRuntimeApi,
  publicErrorType,
  runtimeRedirectUri,
  startTwitchConnectionManager,
};
