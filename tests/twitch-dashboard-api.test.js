const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { once } = require('node:events');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { PermissionFlagsBits } = require('discord.js');

const { database, initializeTwitchSchema } = require('../src/database/database');
const { getTwitchConnectionTokens } = require('../src/database/twitchStore');
const { startDashboardServer } = require('../src/services/dashboardServer');
const { TWITCH_BROADCASTER_SCOPES } = require('../src/services/twitchDashboardService');
const { TwitchTokenVault } = require('../src/services/twitchTokenVault');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';
const USER_A = '333333333333333333';
const USER_B = '444444444444444444';
const ORIGIN = 'http://127.0.0.1:3000';

function storeSession(token, userId, manageableGuildIds, authenticatedAt = Date.now()) {
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const session = {
    user: { id: userId, username: `Utilisateur ${userId.slice(-2)}` },
    manageableGuildIds,
    authenticatedAt,
    csrfToken: `csrf-${userId}`,
  };
  database.prepare('INSERT INTO dashboard_sessions (token_hash, value, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash, JSON.stringify(session), Date.now() + 60_000);
  return { cookie: `fyxbot_session=${token}`, csrfToken: session.csrfToken, tokenHash };
}

function fakeClient() {
  const managerPermissions = { has: (permission) => permission === PermissionFlagsBits.ManageGuild };
  const guildA = {
    id: GUILD_A,
    name: 'Serveur A',
    ownerId: USER_A,
    joinedTimestamp: Date.now() - 60_000,
    members: {
      cache: new Map([[USER_B, { permissions: managerPermissions }]]),
      fetch: async (userId) => (userId === USER_B ? { permissions: managerPermissions } : null),
    },
  };
  const guildB = {
    id: GUILD_B,
    name: 'Serveur B',
    ownerId: '555555555555555555',
    joinedTimestamp: Date.now() - 60_000,
    members: { cache: new Map(), fetch: async () => null },
  };
  const guilds = new Map([[GUILD_A, guildA], [GUILD_B, guildB]]);
  return {
    config: { guildId: GUILD_A },
    guilds: { cache: guilds, fetch: async (guildId) => guilds.get(guildId) },
    isReady: () => true,
    user: { id: '999999999999999999', username: 'FyxBot', tag: 'FyxBot#0001' },
    ws: { ping: 1 },
  };
}

async function startTestApi(t, dependencyOverrides = {}) {
  const targetDatabase = new DatabaseSync(':memory:');
  initializeTwitchSchema(targetDatabase);
  const vault = new TwitchTokenVault(randomBytes(32).toString('base64'));
  let exchanges = 0;
  const apiClient = {
    getAuthorizationUrl(scopes, state) {
      assert.deepEqual(scopes, TWITCH_BROADCASTER_SCOPES);
      const url = new URL('https://id.twitch.tv/oauth2/authorize');
      url.searchParams.set('state', state);
      return url;
    },
    async exchangeCode(code) {
      exchanges += 1;
      assert.equal(code, 'code-oauth-valide');
      return {
        accessToken: 'access-ultra-secret',
        refreshToken: 'refresh-ultra-secret',
        scopes: TWITCH_BROADCASTER_SCOPES,
        expiresAt: new Date(Date.now() + 3_600_000),
      };
    },
    async helix(path, accessToken) {
      assert.equal(path, 'users');
      assert.equal(accessToken, 'access-ultra-secret');
      return { data: [{ id: '12345678', login: 'chaine_test', display_name: 'Chaîne Test' }] };
    },
  };
  const server = startDashboardServer(fakeClient(), {
    host: '127.0.0.1',
    port: 0,
    twitchDependencies: {
      apiClient,
      environment: { DASHBOARD_PUBLIC_URL: 'http://127.0.0.1:3000/v2' },
      storeOptions: { targetDatabase, vault },
      ...dependencyOverrides,
    },
  });
  await once(server, 'listening');
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    targetDatabase.close();
  });
  return { baseUrl, targetDatabase, vault, exchangeCount: () => exchanges };
}

async function apiRequest(baseUrl, path, session, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    redirect: 'manual',
    ...init,
    headers: {
      Origin: ORIGIN,
      Cookie: session.cookie,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.method === 'POST' && init.csrf !== false ? { 'X-FyxBot-CSRF': session.csrfToken } : {}),
      ...init.headers,
    },
  });
}

test('protège tout le parcours Twitch par session, serveur administrable, CSRF et authentification récente', async (t) => {
  const previous = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
  };
  process.env.CLIENT_ID = 'discord-client-test';
  process.env.DISCORD_CLIENT_SECRET = 'discord-secret-test';
  const sessionA = storeSession(`session-a-${Date.now()}`, USER_A, [GUILD_A]);
  const staleSession = storeSession(`session-stale-${Date.now()}`, USER_A, [GUILD_A], Date.now() - 11 * 60_000);
  t.after(() => {
    database.prepare('DELETE FROM dashboard_sessions WHERE token_hash IN (?, ?)').run(sessionA.tokenHash, staleSession.tokenHash);
    if (previous.clientId === undefined) delete process.env.CLIENT_ID; else process.env.CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET; else process.env.DISCORD_CLIENT_SECRET = previous.clientSecret;
  });
  const { baseUrl } = await startTestApi(t);

  const unauthenticated = await fetch(`${baseUrl}/api/twitch/status?guildId=${GUILD_A}`, {
    headers: { Origin: ORIGIN },
  });
  assert.equal(unauthenticated.status, 401);

  const unauthenticatedCallback = await fetch(`${baseUrl}/api/twitch/auth/callback?state=invalide`, {
    redirect: 'manual',
  });
  assert.equal(unauthenticatedCallback.status, 302);
  assert.equal(new URL(unauthenticatedCallback.headers.get('location')).searchParams.get('twitchError'), 'DISCORD_LOGIN_REQUIRED');

  const forbiddenGuild = await apiRequest(baseUrl, `/api/twitch/status?guildId=${GUILD_B}`, sessionA);
  assert.equal(forbiddenGuild.status, 403);

  const missingCsrf = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', csrf: false, body: JSON.stringify({ guildId: GUILD_A, action: 'add', name: 'bonjour', response: 'Salut' }),
  });
  assert.equal(missingCsrf.status, 403);

  const staleDisconnect = await apiRequest(baseUrl, '/api/twitch/disconnect', staleSession, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, confirmation: 'DECONNECTER' }),
  });
  assert.equal(staleDisconnect.status, 401);
  assert.match((await staleDisconnect.json()).error, /Reconnectez-vous/);
});

test('relie Twitch sans réseau réel, chiffre les jetons et ne les renvoie jamais', async (t) => {
  const previous = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
  };
  process.env.CLIENT_ID = 'discord-client-test';
  process.env.DISCORD_CLIENT_SECRET = 'discord-secret-test';
  const sessionA = storeSession(`oauth-a-${Date.now()}`, USER_A, [GUILD_A]);
  const sessionB = storeSession(`oauth-b-${Date.now()}`, USER_B, [GUILD_A]);
  t.after(() => {
    database.prepare('DELETE FROM dashboard_sessions WHERE token_hash IN (?, ?)').run(sessionA.tokenHash, sessionB.tokenHash);
    if (previous.clientId === undefined) delete process.env.CLIENT_ID; else process.env.CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET; else process.env.DISCORD_CLIENT_SECRET = previous.clientSecret;
  });
  const { baseUrl, targetDatabase, vault, exchangeCount } = await startTestApi(t);

  const mismatchedStart = await apiRequest(baseUrl, `/api/twitch/auth/start?guildId=${GUILD_A}`, sessionA);
  assert.equal(mismatchedStart.status, 302);
  const mismatchedState = new URL(mismatchedStart.headers.get('location')).searchParams.get('state');
  const mismatchedCallback = await apiRequest(
    baseUrl,
    `/api/twitch/auth/callback?code=code-oauth-valide&state=${encodeURIComponent(mismatchedState)}`,
    sessionB,
  );
  assert.equal(mismatchedCallback.status, 302);
  assert.equal(new URL(mismatchedCallback.headers.get('location')).searchParams.get('twitchError'), 'TWITCH_INVALID_STATE');
  assert.equal(exchangeCount(), 0);

  const start = await apiRequest(baseUrl, `/api/twitch/auth/start?guildId=${GUILD_A}`, sessionA);
  assert.equal(start.status, 302);
  const authorizationUrl = new URL(start.headers.get('location'));
  assert.equal(authorizationUrl.origin, 'https://id.twitch.tv');
  const state = authorizationUrl.searchParams.get('state');
  assert.match(state, new RegExp(`^v1\\.${GUILD_A}\\.`));

  const callback = await apiRequest(
    baseUrl,
    `/api/twitch/auth/callback?code=code-oauth-valide&state=${encodeURIComponent(state)}`,
    sessionA,
  );
  assert.equal(callback.status, 302);
  const returnUrl = new URL(callback.headers.get('location'));
  assert.equal(returnUrl.pathname, '/v2');
  assert.equal(returnUrl.searchParams.get('twitch'), 'connected');
  assert.equal(returnUrl.searchParams.get('guildId'), GUILD_A);
  assert.equal(exchangeCount(), 1);

  const raw = targetDatabase.prepare('SELECT * FROM twitch_connections WHERE guild_id = ?').get(GUILD_A);
  assert.notEqual(raw.access_token_encrypted, 'access-ultra-secret');
  assert.notEqual(raw.refresh_token_encrypted, 'refresh-ultra-secret');
  assert.deepEqual(getTwitchConnectionTokens(GUILD_A, { targetDatabase, vault }), {
    accessToken: 'access-ultra-secret',
    refreshToken: 'refresh-ultra-secret',
  });

  const statusResponse = await apiRequest(baseUrl, `/api/twitch/status?guildId=${GUILD_A}`, sessionA);
  assert.equal(statusResponse.status, 200);
  const responseText = await statusResponse.text();
  assert.equal(responseText.includes('access-ultra-secret'), false);
  assert.equal(responseText.includes('refresh-ultra-secret'), false);
  const status = JSON.parse(responseText);
  assert.deepEqual(status.broadcaster, { id: '12345678', login: 'chaine_test', displayName: 'Chaîne Test' });
  assert.equal(status.connected, true);
  assert.equal(status.chat.prefix, '!');

  const replay = await apiRequest(
    baseUrl,
    `/api/twitch/auth/callback?code=code-oauth-valide&state=${encodeURIComponent(state)}`,
    sessionA,
  );
  assert.equal(replay.status, 302);
  assert.equal(new URL(replay.headers.get('location')).searchParams.get('twitchError'), 'TWITCH_INVALID_STATE');
  assert.equal(exchangeCount(), 1);
});

test('configure le chat et gère le cycle complet des commandes sur le seul serveur ciblé', async (t) => {
  const previous = {
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
  };
  process.env.CLIENT_ID = 'discord-client-test';
  process.env.DISCORD_CLIENT_SECRET = 'discord-secret-test';
  const sessionA = storeSession(`commands-a-${Date.now()}`, USER_A, [GUILD_A]);
  t.after(() => {
    database.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(sessionA.tokenHash);
    if (previous.clientId === undefined) delete process.env.CLIENT_ID; else process.env.CLIENT_ID = previous.clientId;
    if (previous.clientSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET; else process.env.DISCORD_CLIENT_SECRET = previous.clientSecret;
  });
  const runtimeEvents = [];
  const { baseUrl, targetDatabase, vault } = await startTestApi(t, {
    runtimeHooks: {
      onConnectionChanged: async (event) => runtimeEvents.push(['connection', event]),
      onChatConfigChanged: async (event) => runtimeEvents.push(['chat', event]),
      onCommandsChanged: async (event) => runtimeEvents.push(['commands', event]),
      onDisconnected: async (event) => runtimeEvents.push(['disconnect', event]),
    },
  });

  const start = await apiRequest(baseUrl, `/api/twitch/auth/start?guildId=${GUILD_A}`, sessionA);
  const state = new URL(start.headers.get('location')).searchParams.get('state');
  await apiRequest(baseUrl, `/api/twitch/auth/callback?code=code-oauth-valide&state=${encodeURIComponent(state)}`, sessionA);

  const chat = await apiRequest(baseUrl, '/api/twitch/chat/config', sessionA, {
    method: 'POST',
    body: JSON.stringify({
      guildId: GUILD_A,
      enabled: true,
      prefix: '?',
      protections: { links: true, caps: false, repetition: true },
    }),
  });
  assert.equal(chat.status, 200);
  assert.equal((await chat.json()).status.chatEnabled, true);

  targetDatabase.prepare('UPDATE twitch_connections SET expires_at = ? WHERE guild_id = ?')
    .run(new Date(Date.now() - 60_000).toISOString(), GUILD_A);
  const expiredBroadcasterStatus = await apiRequest(
    baseUrl,
    `/api/twitch/status?guildId=${GUILD_A}`,
    sessionA,
  );
  assert.equal(expiredBroadcasterStatus.status, 200);
  const expiredBroadcasterPayload = await expiredBroadcasterStatus.json();
  assert.equal(expiredBroadcasterPayload.expired, true);
  assert.equal(expiredBroadcasterPayload.chatEnabled, true);

  const reserved = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, action: 'add', name: 'discord', response: 'Collision' }),
  });
  assert.equal(reserved.status, 409);

  const add = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, action: 'add', name: 'bonjour', response: 'Bonjour !', cooldownSeconds: 10 }),
  });
  assert.equal(add.status, 200);
  assert.equal((await add.json()).command.response, 'Bonjour !');

  const update = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, action: 'update', name: 'bonjour', response: 'Bienvenue !', accessLevel: 'moderator' }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).command.response, 'Bienvenue !');

  const toggle = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, action: 'toggle', name: 'bonjour', enabled: false }),
  });
  assert.equal(toggle.status, 200);
  assert.equal((await toggle.json()).command.enabled, false);

  const removeWithoutConfirmation = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, action: 'remove', name: 'bonjour' }),
  });
  assert.equal(removeWithoutConfirmation.status, 400);

  const remove = await apiRequest(baseUrl, '/api/twitch/commands', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, action: 'remove', name: 'bonjour', confirmation: 'SUPPRIMER' }),
  });
  assert.equal(remove.status, 200);
  assert.deepEqual((await remove.json()).commands, []);

  const disconnect = await apiRequest(baseUrl, '/api/twitch/disconnect', sessionA, {
    method: 'POST', body: JSON.stringify({ guildId: GUILD_A, confirmation: 'DECONNECTER' }),
  });
  assert.equal(disconnect.status, 200);
  const disconnected = await disconnect.json();
  assert.equal(disconnected.removed, true);
  assert.equal(disconnected.status.connected, false);
  assert.equal(disconnected.status.chat.enabled, false);
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM twitch_connections').get().total, 0);
  assert.equal(JSON.stringify(disconnected).includes(vault.encrypt('valeur-sentinelle')), false);
  assert.deepEqual(runtimeEvents.map(([name]) => name), ['connection', 'chat', 'commands', 'commands', 'commands', 'commands', 'disconnect']);
  assert.equal(JSON.stringify(runtimeEvents).includes('access-ultra-secret'), false);
  assert.equal(JSON.stringify(runtimeEvents).includes('refresh-ultra-secret'), false);
});
