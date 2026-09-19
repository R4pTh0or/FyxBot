const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresTwitchStore } = require('../src/database/postgresTwitchStore');
const twitchSqliteStore = require('../src/database/twitchStore');
const {
  completeTwitchAuthorization, publicTwitchStatus, startTwitchAuthorization,
} = require('../src/services/twitchDashboardService');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';
const USER_A = '333333333333333333';
const fixedNow = Date.parse('2026-09-18T10:00:00.000Z');

function vault() {
  return {
    encrypt: (plain) => `sealed:${plain}`,
    decrypt: (sealed) => sealed.slice('sealed:'.length),
  };
}

async function withPostgres(operation) {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = { query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }) };
    await operation(createPostgresTwitchStore(pool), database);
  } finally { await database.close(); }
}

test('chiffre les jetons Twitch et isole chaque connexion par serveur', async () => {
  await withPostgres(async (store, database) => {
    const connection = { broadcasterUserId: '12345', broadcasterLogin: 'MyChannel',
      broadcasterDisplayName: 'My Channel', accessToken: 'access-secret', refreshToken: 'refresh-secret',
      scopes: ['chat:read', 'chat:edit'], expiresAt: '2026-09-18T12:00:00.000Z', enabled: true };
    const current = await store.upsertTwitchConnection(GUILD_A, connection, { vault: vault(), now: fixedNow });
    assert.equal(current.broadcasterLogin, 'mychannel');
    assert.equal(current.enabled, true);
    assert.equal(current.accessToken, undefined);
    const raw = await database.query('SELECT access_token_encrypted, refresh_token_encrypted FROM fyxbot.twitch_connections');
    assert.deepEqual(raw.rows[0], { access_token_encrypted: 'sealed:access-secret', refresh_token_encrypted: 'sealed:refresh-secret' });
    assert.deepEqual(await store.getTwitchConnectionTokens(GUILD_A, { vault: vault() }),
      { accessToken: 'access-secret', refreshToken: 'refresh-secret' });
    assert.equal((await store.listEnabledTwitchConnections()).length, 1);
    await assert.rejects(() => store.upsertTwitchConnection(GUILD_B, connection, { vault: vault(), now: fixedNow }),
      (error) => error.code === 'TWITCH_BROADCASTER_IN_USE');
    assert.equal(await store.getTwitchConnection(GUILD_B), null);
    assert.equal((await store.setTwitchConnectionEnabled(GUILD_A, false)).enabled, false);
    assert.equal((await store.listEnabledTwitchConnections()).length, 0);
    assert.equal(await store.deleteTwitchConnection(GUILD_A), true);
    assert.equal(await store.deleteTwitchConnection(GUILD_A), false);
  });
});

test('les états OAuth Twitch sont liés au serveur, expirables et à usage unique', async () => {
  await withPostgres(async (store) => {
    const state = await store.issueTwitchOAuthState(GUILD_A, USER_A, { now: fixedNow });
    assert.equal(await store.consumeTwitchOAuthState(GUILD_B, state, { now: fixedNow }), null);
    assert.deepEqual(await store.consumeTwitchOAuthState(GUILD_A, state, { now: fixedNow, discordUserId: USER_A }),
      { guildId: GUILD_A, discordUserId: USER_A, expiresAt: fixedNow + 600_000 });
    assert.equal(await store.consumeTwitchOAuthState(GUILD_A, state, { now: fixedNow }), null);
    const expiring = await store.issueTwitchOAuthState(GUILD_A, USER_A, { now: fixedNow, lifetimeMs: 60_000 });
    assert.equal(await store.consumeTwitchOAuthState(GUILD_A, expiring, { now: fixedNow + 60_000 }), null);
  });
});

test('le parcours du panel Twitch fonctionne avec le stockage PostgreSQL injecté', async () => {
  await withPostgres(async (postgresStore, database) => {
    const store = { ...twitchSqliteStore, ...postgresStore };
    const apiClient = {
      getAuthorizationUrl: (_scopes, state) => new URL(`https://id.twitch.tv/oauth2/authorize?state=${encodeURIComponent(state)}`),
      exchangeCode: async () => ({
        accessToken: 'access-secret', refreshToken: 'refresh-secret', scopes: [],
        expiresAt: '2026-09-18T12:00:00.000Z',
      }),
      helix: async () => ({ data: [{ id: '12345', login: 'chaine_test', display_name: 'Chaîne Test' }] }),
    };
    const dependencies = {
      store, apiClient, storeOptions: { now: fixedNow, vault: vault() },
      environment: { DASHBOARD_PUBLIC_URL: 'http://127.0.0.1:3000/v2' },
    };
    const authorization = await startTwitchAuthorization(GUILD_A, USER_A, dependencies);
    const state = new URL(authorization.authorizationUrl).searchParams.get('state');
    const connected = await completeTwitchAuthorization({
      state, discordUserId: USER_A, code: 'valid',
    }, dependencies);
    assert.equal(connected.connection.broadcasterLogin, 'chaine_test');
    const status = await publicTwitchStatus(GUILD_A, dependencies);
    assert.equal(status.connected, true);
    assert.equal(status.broadcaster.login, 'chaine_test');
    assert.equal(JSON.stringify(status).includes('access-secret'), false);
    const raw = await database.query('SELECT access_token_encrypted FROM fyxbot.twitch_connections');
    assert.equal(raw.rows[0].access_token_encrypted, 'sealed:access-secret');
  });
});

test('les commandes, le chat et les états Twitch restent cloisonnés par serveur', async () => {
  await withPostgres(async (store) => {
    await assert.rejects(() => store.configureTwitchChat(GUILD_A, { enabled: true }, { now: fixedNow }),
      (error) => error.code === 'TWITCH_CONNECTION_REQUIRED');
    const connection = { broadcasterUserId: '12345', broadcasterLogin: 'channel',
      broadcasterDisplayName: 'Channel', accessToken: 'secret',
      scopes: [], expiresAt: '2026-09-18T12:00:00.000Z', enabled: false };
    await store.upsertTwitchConnection(GUILD_A, connection, { vault: vault(), now: fixedNow });
    const configured = await store.configureTwitchChat(GUILD_A, {
      enabled: true, prefix: '?', protections: { links: false, caps: true, repetition: true },
    }, { now: fixedNow });
    assert.equal(configured.connection.enabled, true);
    assert.equal(configured.chat.prefix, '?');
    assert.equal(configured.chat.protections.links, false);
    assert.equal((await store.getTwitchChatConfig(GUILD_B)).enabled, false);

    const command = await store.upsertTwitchCustomCommand(GUILD_A, { name: '!hello', response: 'Salut !' }, { now: fixedNow });
    assert.equal(command.name, 'hello');
    assert.equal((await store.listTwitchCustomCommands(GUILD_B)).length, 0);
    assert.equal(await store.incrementTwitchCommandUsage(GUILD_A, 'hello'), true);
    const updated = await store.upsertTwitchCustomCommand(GUILD_A, { name: 'hello', response: 'Bonjour !' }, { now: fixedNow });
    assert.equal(updated.usageCount, 1);
    assert.equal((await store.getTwitchCustomCommand(GUILD_A, 'hello')).response, 'Bonjour !');
    assert.equal(await store.deleteTwitchCustomCommand(GUILD_A, 'hello'), true);
    assert.equal(await store.getTwitchCustomCommand(GUILD_A, 'hello'), null);

    const status = await store.setTwitchRuntimeStatus(GUILD_A, 'connected', null, { now: fixedNow });
    assert.equal(status.status, 'connected');
    assert.equal((await store.getTwitchRuntimeStatus(GUILD_A)).guildId, GUILD_A);
    assert.equal(await store.getTwitchRuntimeStatus(GUILD_B), null);
    const deleted = await store.deleteTwitchGuildData(GUILD_A);
    assert.equal(deleted.twitch_connections, 1);
    assert.equal(deleted.twitch_chat_config, 1);
    assert.equal(deleted.twitch_runtime_status, 1);
  });
});

test('déduplique IRC et EventSub par serveur puis libère les identifiants expirés', async () => {
  await withPostgres(async (store) => {
    assert.equal(await store.claimTwitchProcessedMessage(GUILD_A, 'message-a', { now: fixedNow }), true);
    assert.equal(await store.claimTwitchProcessedMessage(GUILD_A, 'message-a', { now: fixedNow }), false);
    assert.equal(await store.claimTwitchProcessedMessage(GUILD_B, 'message-a', { now: fixedNow }), true);
    assert.equal(await store.claimTwitchProcessedMessage(GUILD_A, 'message-a', { now: fixedNow + 15 * 60_000 }), true);
    assert.equal(await store.claimTwitchEventSubMessage(GUILD_A, 'event-a', { now: fixedNow }), true);
    assert.equal(await store.claimTwitchEventSubMessage(GUILD_A, 'event-a', { now: fixedNow }), false);
    assert.equal(await store.purgeExpiredTwitchEventSubMessages(GUILD_A, { now: fixedNow + 24 * 60 * 60_000 }), 1);
    assert.equal(await store.claimTwitchEventSubMessage(GUILD_A, 'event-a', { now: fixedNow + 24 * 60 * 60_000 }), true);
  });
});

test('refuse les connexions absentes et les noms de schéma arbitraires', () => {
  assert.throws(() => createPostgresTwitchStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresTwitchStore({ query() {}, connect() {} }, { schema: 'public;DROP' }), /schéma PostgreSQL invalide/);
});
