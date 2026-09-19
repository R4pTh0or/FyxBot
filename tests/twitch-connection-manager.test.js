const assert = require('node:assert/strict');
const test = require('node:test');

const { TwitchConnectionManager } = require('../src/services/twitchConnectionManager');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';
const NOW = Date.UTC(2026, 8, 15, 20, 0, 0);

class FakeChatClient {
  constructor(options) {
    this.options = options;
    this.handlers = { message: [], status: [], error: [] };
    this.sent = [];
    this.connected = false;
    this.disconnectCalls = 0;
  }

  onMessage(handler) {
    this.handlers.message.push(handler);
    return () => { this.handlers.message = this.handlers.message.filter((item) => item !== handler); };
  }

  onStatus(handler) {
    this.handlers.status.push(handler);
    return () => { this.handlers.status = this.handlers.status.filter((item) => item !== handler); };
  }

  onError(handler) {
    this.handlers.error.push(handler);
    return () => { this.handlers.error = this.handlers.error.filter((item) => item !== handler); };
  }

  connect() {
    this.connected = true;
    for (const handler of this.handlers.status) handler(true);
  }

  disconnect() {
    this.connected = false;
    this.disconnectCalls += 1;
  }

  sendMessage(message) {
    if (!this.connected) return false;
    this.sent.push(message);
    return true;
  }

  async emitMessage(message) {
    await Promise.all(this.handlers.message.map((handler) => handler(message)));
  }
}

function createLogger() {
  const events = [];
  const logger = {};
  for (const level of ['debug', 'error', 'info', 'warn']) {
    logger[level] = (...values) => events.push({ level, values });
  }
  logger.child = () => logger;
  return { events, logger };
}

function createStore() {
  const connections = new Map([
    [GUILD_A, {
      guildId: GUILD_A,
      broadcasterUserId: '101',
      broadcasterLogin: 'chaine_a',
      broadcasterDisplayName: 'Chaîne A',
      scopes: [],
      expiresAt: new Date(NOW + 3_600_000).toISOString(),
      enabled: true,
    }],
    [GUILD_B, {
      guildId: GUILD_B,
      broadcasterUserId: '202',
      broadcasterLogin: 'chaine_b',
      broadcasterDisplayName: 'Chaîne B',
      scopes: [],
      expiresAt: new Date(NOW + 3_600_000).toISOString(),
      enabled: true,
    }],
  ]);
  const chats = new Map([
    [GUILD_A, { enabled: true, prefix: '!', protections: { links: true, caps: true, repetition: true } }],
    [GUILD_B, { enabled: false, prefix: '!', protections: { links: true, caps: true, repetition: true } }],
  ]);
  const commands = new Map([[GUILD_A, [{
    name: 'bonjour',
    response: 'Salut le chat !',
    enabled: true,
    cooldownSeconds: 0,
    accessLevel: 'everyone',
  }]]]);
  const statuses = [];
  const claimed = new Set();
  const usage = [];
  return {
    chats,
    commands,
    connections,
    statuses,
    usage,
    listEnabledTwitchConnections: () => [...connections.values()].filter((connection) => connection.enabled),
    getTwitchConnection: (guildId) => connections.get(guildId) || null,
    getTwitchChatConfig: (guildId) => chats.get(guildId) || { enabled: false, prefix: '!', protections: {} },
    listTwitchCustomCommands: (guildId) => commands.get(guildId) || [],
    setTwitchRuntimeStatus: (guildId, status, detail) => statuses.push({ guildId, status, detail }),
    claimTwitchProcessedMessage: (guildId, messageId) => {
      const key = `${guildId}:${messageId}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    incrementTwitchCommandUsage: (guildId, name) => usage.push({ guildId, name }),
    getTwitchConnectionTokens: () => ({ accessToken: 'stored-access', refreshToken: 'stored-refresh' }),
    upsertTwitchConnection: () => {},
  };
}

function createManager(options = {}) {
  const store = options.store || createStore();
  const clients = [];
  const { events, logger } = createLogger();
  const manager = new TwitchConnectionManager({
    environment: {
      TWITCH_BOT_USERNAME: 'fyxbot_chat',
      TWITCH_BOT_ACCESS_TOKEN: 'private-bot-token',
      FYXBOT_SUPPORT_URL: 'https://discord.gg/fyxbot',
      DASHBOARD_PUBLIC_URL: 'https://fyxbot.example/',
      ...(options.environment || {}),
    },
    store,
    logger,
    now: () => NOW,
    chatClientFactory: (clientOptions) => {
      const client = new FakeChatClient(clientOptions);
      clients.push(client);
      return client;
    },
    twitchApi: options.twitchApi ?? null,
    setTimeoutFn: options.setTimeoutFn,
    clearTimeoutFn: options.clearTimeoutFn,
  });
  return { clients, events, manager, store };
}

function message(text, id, overrides = {}) {
  return {
    text,
    messageId: id,
    username: 'viewer',
    userId: '42',
    channel: 'chaine_a',
    isModerator: false,
    isSubscriber: false,
    isBroadcaster: false,
    ...overrides,
  };
}

test('démarre uniquement les chats activés et les arrête proprement', async () => {
  const { clients, manager, store } = createManager();
  const report = await manager.start();

  assert.deepEqual(report.started, [GUILD_A]);
  assert.deepEqual(report.skipped, [{ guildId: GUILD_B, reason: 'disabled' }]);
  assert.equal(clients.length, 1);
  assert.equal(clients[0].options.username, 'fyxbot_chat');
  assert.equal(clients[0].options.channel, 'chaine_a');
  assert.equal(manager.status().activeGuildIds.includes(GUILD_A), true);
  assert.equal(store.statuses.some((item) => item.guildId === GUILD_A && item.status === 'connected'), true);

  const stopped = manager.stop();
  assert.deepEqual(stopped.stopped, [GUILD_A]);
  assert.equal(clients[0].disconnectCalls, 1);
  assert.deepEqual(manager.status().activeGuildIds, []);
});

test('exécute les commandes intégrées et personnalisées avec déduplication persistante', async () => {
  const apiCalls = [];
  const twitchApi = {
    async helixAuthenticated(path, dependencies) {
      apiCalls.push(path);
      const tokens = await dependencies.loadTokenSet();
      assert.equal(tokens.accessToken, 'stored-access');
      return { data: [{ started_at: new Date(NOW - 3_900_000).toISOString() }] };
    },
  };
  const { clients, manager, store } = createManager({ twitchApi });
  await manager.start();
  const client = clients[0];

  await client.emitMessage(message('!bonjour', 'same-message'));
  await client.emitMessage(message('!bonjour', 'same-message'));
  await client.emitMessage(message('!commands', 'commands-message'));
  await client.emitMessage(message('!discord', 'discord-message'));
  await client.emitMessage(message('!socials', 'socials-message'));
  await client.emitMessage(message('!uptime', 'uptime-message'));

  assert.equal(client.sent.filter((value) => value === 'Salut le chat !').length, 1);
  assert.equal(client.sent.some((value) => value.includes('!bonjour')), true);
  assert.equal(client.sent.some((value) => value.includes('https://discord.gg/fyxbot')), true);
  assert.equal(client.sent.some((value) => value.includes('https://fyxbot.example/')), true);
  assert.equal(client.sent.includes('Live depuis 1h 5m 0s.'), true);
  assert.deepEqual(apiCalls, ['streams?user_id=101']);
  assert.deepEqual(store.usage, [{ guildId: GUILD_A, name: 'bonjour' }]);
  manager.stop();
});

test('exécute les commandes de modération Twitch via Helix avec les permissions requises', async () => {
  const apiCalls = [];
  const twitchApi = {
    async helixAuthenticated(path, dependencies, init = {}) {
      apiCalls.push({ path, init });
      const tokens = await dependencies.loadTokenSet();
      assert.equal(tokens.accessToken, 'stored-access');
      if (path.startsWith('users?login=')) return { data: [{ id: '303', login: 'viewer_2' }] };
      return null;
    },
  };
  const store = createStore();
  store.connections.set(GUILD_A, {
    ...store.connections.get(GUILD_A),
    scopes: [
      'moderator:manage:banned_users',
      'moderator:manage:chat_messages',
      'moderator:manage:chat_settings',
    ],
  });
  const { clients, manager } = createManager({ store, twitchApi });
  await manager.start();

  await clients[0].emitMessage(message('!timeout @viewer_2 60 spam', 'moderation-timeout', { isModerator: true }));
  await clients[0].emitMessage(message('!clear', 'moderation-clear', { isBroadcaster: true }));
  await clients[0].emitMessage(message('!slow 10', 'moderation-slow', { isModerator: true }));

  assert.deepEqual(apiCalls.map((call) => call.path), [
    'users?login=viewer_2',
    'moderation/bans?broadcaster_id=101&moderator_id=101',
    'moderation/chat?broadcaster_id=101&moderator_id=101',
    'chat/settings?broadcaster_id=101&moderator_id=101',
  ]);
  assert.deepEqual(JSON.parse(apiCalls[1].init.body), {
    data: { user_id: '303', duration: 60, reason: 'spam' },
  });
  assert.equal(clients[0].sent.some((value) => value.includes('@viewer_2 est en timeout')), true);
  assert.equal(clients[0].sent.includes('🧹 Le chat Twitch a été effacé.'), true);
  assert.equal(clients[0].sent.includes('🐢 Mode lent Twitch réglé sur 10 seconde(s).'), true);
  manager.stop();
});

test('demande une reconnexion Twitch lorsque les permissions de modération manquent', async () => {
  const { clients, manager } = createManager({ twitchApi: { helixAuthenticated: async () => null } });
  await manager.start();
  await clients[0].emitMessage(message('!clear', 'moderation-scope', { isModerator: true }));
  assert.deepEqual(clients[0].sent, [
    'Reconnectez Twitch depuis le panel FyxBot pour activer les commandes de modération.',
  ]);
  manager.stop();
});

test('explique une syntaxe de modération Twitch invalide sans exposer d’erreur interne', async () => {
  const { clients, manager } = createManager();
  await manager.start();
  await clients[0].emitMessage(message('!slow 2', 'moderation-invalid', { isModerator: true }));
  assert.deepEqual(clients[0].sent, [
    'Commande invalide : Utilisez !slow 0 pour désactiver, ou une valeur de 3 à 120 secondes.',
  ]);
  manager.stop();
});

test('resynchronise les commandes et arrête un chat désactivé sans redémarrer FyxBot', async () => {
  const { clients, manager, store } = createManager();
  await manager.start();
  store.commands.set(GUILD_A, [{
    name: 'nouveau',
    response: 'Nouvelle réponse',
    enabled: true,
    cooldownSeconds: 0,
    accessLevel: 'moderator',
  }]);
  const sync = await manager.refreshAfterCommands(GUILD_A);
  assert.deepEqual(sync.loaded, ['nouveau']);

  await clients[0].emitMessage(message('!nouveau', 'denied'));
  assert.equal(clients[0].sent.length, 0);
  await clients[0].emitMessage(message('!nouveau', 'allowed', { isModerator: true }));
  assert.deepEqual(clients[0].sent, ['Nouvelle réponse']);

  store.chats.set(GUILD_A, { enabled: false, prefix: '!', protections: {} });
  store.connections.set(GUILD_A, { ...store.connections.get(GUILD_A), enabled: false });
  const refreshed = await manager.refreshAfterConfiguration(GUILD_A);
  assert.deepEqual(refreshed, { started: false, reason: 'disabled' });
  assert.equal(clients[0].disconnectCalls, 1);
  assert.deepEqual(manager.status().activeGuildIds, []);
});

test('reste hors réseau sans identifiants du compte bot et ne journalise pas les secrets', async () => {
  const store = createStore();
  const { events, logger } = createLogger();
  let clientCreations = 0;
  const manager = new TwitchConnectionManager({
    environment: {},
    store,
    logger,
    chatClientFactory: () => {
      clientCreations += 1;
      throw new Error('private-bot-token');
    },
    twitchApi: null,
  });

  const report = await manager.start();
  assert.equal(clientCreations, 0);
  assert.equal(report.started.length, 0);
  assert.equal(report.skipped.some((item) => item.reason === 'bot_credentials'), true);
  assert.equal(store.statuses.some((item) => item.status === 'error' && /compte Twitch officiel/.test(item.detail)), true);
  assert.equal(JSON.stringify(events).includes('private-bot-token'), false);
});

test('renouvelle le jeton du compte bot avant de connecter le chat', async () => {
  const timers = [];
  const { clients, manager } = createManager({
    environment: { TWITCH_BOT_REFRESH_TOKEN: 'private-refresh-token' },
    twitchApi: {
      async refreshToken(refreshToken) {
        assert.equal(refreshToken, 'private-refresh-token');
        return {
          accessToken: 'fresh-access-token',
          refreshToken: 'fresh-refresh-token',
          expiresAt: new Date(NOW + 3_600_000),
          scopes: ['chat:edit', 'chat:read'],
        };
      },
    },
    setTimeoutFn: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
  });

  const report = await manager.start();
  assert.deepEqual(report.started, [GUILD_A]);
  assert.equal(clients[0].options.accessToken, 'fresh-access-token');
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 3_300_000);
  manager.stop();
});

test('attend les lectures et écritures du magasin Twitch asynchrone', async () => {
  const source = createStore();
  const store = Object.fromEntries(Object.entries(source).map(([key, value]) => [
    key, typeof value === 'function' ? async (...args) => value(...args) : value,
  ]));
  const { clients, manager } = createManager({ store });
  const report = await manager.start();
  assert.deepEqual(report.started, [GUILD_A]);
  await clients[0].emitMessage(message('!bonjour', 'async-message'));
  assert.equal(clients[0].sent.length, 1);
  assert.deepEqual(store.usage, [{ guildId: GUILD_A, name: 'bonjour' }]);
  manager.stop();
});
