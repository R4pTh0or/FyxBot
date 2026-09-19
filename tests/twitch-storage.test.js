const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const { initializeTwitchSchema } = require('../src/database/database');
const {
  claimTwitchEventSubMessage,
  claimTwitchProcessedMessage,
  configureTwitchChat,
  consumeTwitchOAuthState,
  deleteTwitchConnection,
  deleteTwitchCustomCommand,
  deleteTwitchGuildData,
  getTwitchConnection,
  getTwitchConnectionTokens,
  getTwitchChatConfig,
  getTwitchCustomCommand,
  getTwitchRuntimeStatus,
  incrementTwitchCommandUsage,
  issueTwitchOAuthState,
  listEnabledTwitchConnections,
  listTwitchCustomCommands,
  purgeExpiredTwitchOAuthStates,
  setTwitchConnectionEnabled,
  setTwitchChatConfig,
  setTwitchRuntimeStatus,
  twitchOAuthStateGuildId,
  upsertTwitchConnection,
  upsertTwitchCustomCommand,
} = require('../src/database/twitchStore');
const {
  TOKEN_ENCRYPTION_VARIABLE,
  TwitchTokenVault,
  createTwitchTokenVault,
} = require('../src/services/twitchTokenVault');

const GUILD_A = '111111111111111111';
const GUILD_B = '222222222222222222';
const USER_A = '333333333333333333';
const USER_B = '444444444444444444';

function testDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  initializeTwitchSchema(targetDatabase);
  return targetDatabase;
}

function vault() {
  return new TwitchTokenVault(randomBytes(32).toString('base64'));
}

function connection(overrides = {}) {
  return {
    broadcasterUserId: '12345678',
    broadcasterLogin: 'chaine_test',
    broadcasterDisplayName: 'Chaîne Test',
    accessToken: 'access-secret-twitch',
    refreshToken: 'refresh-secret-twitch',
    scopes: ['chat:read', 'chat:edit'],
    expiresAt: '2026-10-01T12:00:00.000Z',
    enabled: true,
    ...overrides,
  };
}

test('chiffre les jetons Twitch avec AES-256-GCM et refuse toute altération', () => {
  const tokenVault = vault();
  const first = tokenVault.encrypt('jeton-ultra-secret');
  const second = tokenVault.encrypt('jeton-ultra-secret');
  assert.match(first, /^v1:/);
  assert.notEqual(first, second);
  assert.equal(tokenVault.decrypt(first), 'jeton-ultra-secret');
  assert.deepEqual(Object.keys(tokenVault), []);
  assert.equal(JSON.stringify(tokenVault), '{}');

  const tampered = `${first.slice(0, -1)}${first.endsWith('A') ? 'B' : 'A'}`;
  assert.throws(
    () => tokenVault.decrypt(tampered),
    (error) => error.code === 'TWITCH_TOKEN_VAULT_ERROR'
      && !error.message.includes(first)
      && !error.message.includes('jeton-ultra-secret'),
  );
});

test('exige une clé Twitch dédiée, canonique et différente des sauvegardes', () => {
  const key = randomBytes(32).toString('base64');
  assert.throws(() => createTwitchTokenVault({}), new RegExp(TOKEN_ENCRYPTION_VARIABLE));
  assert.throws(() => createTwitchTokenVault({ [TOKEN_ENCRYPTION_VARIABLE]: 'pas-du-base64' }), /Base64/);
  assert.throws(() => createTwitchTokenVault({
    [TOKEN_ENCRYPTION_VARIABLE]: key,
    FYXBOT_BACKUP_ENCRYPTION_KEY: key,
  }), /différente des clés de sauvegarde/);
});

test('stocke uniquement les enveloppes chiffrées et ne retourne aucun jeton au statut public', () => {
  const targetDatabase = testDatabase();
  const tokenVault = vault();
  const saved = upsertTwitchConnection(GUILD_A, connection(), { targetDatabase, vault: tokenVault });
  const raw = targetDatabase.prepare('SELECT * FROM twitch_connections WHERE guild_id = ?').get(GUILD_A);

  assert.equal(saved.guildId, GUILD_A);
  assert.equal(saved.enabled, true);
  assert.equal(saved.broadcasterLogin, 'chaine_test');
  assert.doesNotMatch(JSON.stringify(saved), /access-secret|refresh-secret|encrypted/i);
  assert.match(raw.access_token_encrypted, /^v1:/);
  assert.match(raw.refresh_token_encrypted, /^v1:/);
  assert.notEqual(raw.access_token_encrypted, 'access-secret-twitch');
  assert.deepEqual(getTwitchConnectionTokens(GUILD_A, { targetDatabase, vault: tokenVault }), {
    accessToken: 'access-secret-twitch',
    refreshToken: 'refresh-secret-twitch',
  });
  assert.throws(
    () => getTwitchConnectionTokens(GUILD_A, { targetDatabase, vault: vault() }),
    (error) => error.code === 'TWITCH_TOKEN_VAULT_ERROR'
      && !error.message.includes('access-secret-twitch'),
  );
});

test('isole les connexions et interdit une chaîne active sur deux serveurs', () => {
  const targetDatabase = testDatabase();
  const tokenVault = vault();
  upsertTwitchConnection(GUILD_A, connection(), { targetDatabase, vault: tokenVault });
  upsertTwitchConnection(GUILD_B, connection({ enabled: false }), { targetDatabase, vault: tokenVault });

  assert.equal(getTwitchConnection(GUILD_A, { targetDatabase }).enabled, true);
  assert.equal(getTwitchConnection(GUILD_B, { targetDatabase }).enabled, false);
  assert.deepEqual(listEnabledTwitchConnections({ targetDatabase }).map((item) => item.guildId), [GUILD_A]);
  assert.throws(
    () => setTwitchConnectionEnabled(GUILD_B, true, { targetDatabase }),
    (error) => error.code === 'TWITCH_BROADCASTER_IN_USE',
  );
  assert.equal(setTwitchConnectionEnabled(GUILD_A, false, { targetDatabase }).enabled, false);
  assert.equal(setTwitchConnectionEnabled(GUILD_B, true, { targetDatabase }).enabled, true);
  assert.deepEqual(listEnabledTwitchConnections({ targetDatabase }).map((item) => item.guildId), [GUILD_B]);
  assert.equal(deleteTwitchConnection(GUILD_A, { targetDatabase }), true);
  assert.equal(getTwitchConnection(GUILD_A, { targetDatabase }), null);
  assert.notEqual(getTwitchConnection(GUILD_B, { targetDatabase }), null);
});

test('rend les états OAuth liés au serveur, hachés, expirables et à usage unique', () => {
  const targetDatabase = testDatabase();
  const issuedAt = 1_000_000;
  const state = issueTwitchOAuthState(GUILD_A, USER_A, {
    targetDatabase,
    now: issuedAt,
    lifetimeMs: 60_000,
  });
  const stored = targetDatabase.prepare('SELECT * FROM twitch_oauth_states WHERE guild_id = ?').get(GUILD_A);

  assert.equal(twitchOAuthStateGuildId(state), GUILD_A);
  assert.notEqual(stored.state_hash, state);
  assert.match(stored.state_hash, /^[a-f0-9]{64}$/);
  assert.equal(consumeTwitchOAuthState(GUILD_B, state, { targetDatabase, now: issuedAt + 1 }), null);
  assert.deepEqual(consumeTwitchOAuthState(GUILD_A, state, {
    targetDatabase,
    now: issuedAt + 1,
    discordUserId: USER_A,
  }), { guildId: GUILD_A, discordUserId: USER_A, expiresAt: issuedAt + 60_000 });
  assert.equal(consumeTwitchOAuthState(GUILD_A, state, { targetDatabase, now: issuedAt + 2 }), null);
});

test('refuse puis purge les états OAuth expirés sans toucher à un autre serveur', () => {
  const targetDatabase = testDatabase();
  const issuedAt = 2_000_000;
  const expiredState = issueTwitchOAuthState(GUILD_A, USER_A, { targetDatabase, now: issuedAt, lifetimeMs: 60_000 });
  issueTwitchOAuthState(GUILD_B, USER_B, { targetDatabase, now: issuedAt, lifetimeMs: 60_000 });
  assert.equal(consumeTwitchOAuthState(GUILD_A, expiredState, { targetDatabase, now: issuedAt + 60_000 }), null);

  issueTwitchOAuthState(GUILD_A, USER_A, { targetDatabase, now: issuedAt + 70_000, lifetimeMs: 60_000 });
  assert.equal(purgeExpiredTwitchOAuthStates(GUILD_A, { targetDatabase, now: issuedAt + 130_000 }), 1);
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM twitch_oauth_states WHERE guild_id = ?').get(GUILD_B).total, 1);
});

test('cloisonne les commandes personnalisées et préserve leur compteur lors des modifications', () => {
  const targetDatabase = testDatabase();
  upsertTwitchCustomCommand(GUILD_A, { name: '!discord', response: 'Discord A', cooldownSeconds: 5 }, { targetDatabase, now: 1_000 });
  upsertTwitchCustomCommand(GUILD_B, { name: 'discord', response: 'Discord B', enabled: false, accessLevel: 'moderator' }, { targetDatabase, now: 1_000 });
  incrementTwitchCommandUsage(GUILD_A, 'discord', { targetDatabase });
  upsertTwitchCustomCommand(GUILD_A, { name: 'discord', response: 'Nouveau Discord A', cooldownSeconds: 10 }, { targetDatabase, now: 2_000 });

  assert.equal(getTwitchCustomCommand(GUILD_A, 'discord', { targetDatabase }).response, 'Nouveau Discord A');
  assert.equal(getTwitchCustomCommand(GUILD_A, 'discord', { targetDatabase }).usageCount, 1);
  assert.equal(getTwitchCustomCommand(GUILD_B, 'discord', { targetDatabase }).response, 'Discord B');
  assert.equal(listTwitchCustomCommands(GUILD_A, { targetDatabase }).length, 1);
  assert.equal(deleteTwitchCustomCommand(GUILD_A, 'discord', { targetDatabase }), true);
  assert.equal(getTwitchCustomCommand(GUILD_A, 'discord', { targetDatabase }), null);
  assert.notEqual(getTwitchCustomCommand(GUILD_B, 'discord', { targetDatabase }), null);
});

test('configure le chat atomiquement et sans toucher aux autres serveurs', () => {
  const targetDatabase = testDatabase();
  const tokenVault = vault();
  upsertTwitchConnection(GUILD_A, connection({ enabled: false }), { targetDatabase, vault: tokenVault });
  upsertTwitchConnection(GUILD_B, connection({
    broadcasterUserId: '87654321', broadcasterLogin: 'autre_chaine', enabled: false,
  }), { targetDatabase, vault: tokenVault });

  const configured = configureTwitchChat(GUILD_A, {
    enabled: true,
    prefix: '?',
    protections: { links: false, caps: true, repetition: false },
  }, { targetDatabase, now: 10_000 });
  assert.equal(configured.connection.enabled, true);
  assert.deepEqual(configured.chat.protections, { links: false, caps: true, repetition: false });
  assert.equal(getTwitchChatConfig(GUILD_B, { targetDatabase }).prefix, '!');
  assert.equal(getTwitchConnection(GUILD_B, { targetDatabase }).enabled, false);

  assert.throws(
    () => configureTwitchChat('555555555555555555', { enabled: true, prefix: '!' }, { targetDatabase }),
    (error) => error.code === 'TWITCH_CONNECTION_REQUIRED',
  );
  assert.equal(targetDatabase.prepare('SELECT COUNT(*) AS total FROM twitch_chat_config WHERE guild_id = ?').get('555555555555555555').total, 0);
  assert.throws(
    () => configureTwitchChat(GUILD_A, { enabled: false, prefix: 'commande' }, { targetDatabase }),
    (error) => error.code === 'TWITCH_INVALID_PREFIX',
  );
  targetDatabase.close();
});

test('rejette les opérations Twitch non cloisonnées et les commandes invalides', () => {
  const targetDatabase = testDatabase();
  assert.throws(() => listTwitchCustomCommands('', { targetDatabase }), /serveur Discord/);
  assert.throws(() => getTwitchConnection('guild-global', { targetDatabase }), /serveur Discord/);
  assert.throws(() => upsertTwitchCustomCommand(GUILD_A, { name: '!', response: 'ok' }, { targetDatabase }), /2 et 24/);
  assert.throws(() => upsertTwitchCustomCommand(GUILD_A, { name: 'commande', response: '' }, { targetDatabase }), /1 et 400/);
  assert.throws(() => upsertTwitchCustomCommand(GUILD_A, { name: 'commande', response: 'ok', cooldownSeconds: 3.5 }, { targetDatabase }), /nombre entier/);
  assert.throws(() => upsertTwitchCustomCommand(GUILD_A, { name: 'commande', response: 'ok', accessLevel: 'admin' }, { targetDatabase }), /niveau d’accès/);
});

test('déduplique les messages IRC et EventSub par serveur puis accepte leur réutilisation après expiration', () => {
  const targetDatabase = testDatabase();
  const now = 3_000_000;
  assert.equal(claimTwitchProcessedMessage(GUILD_A, 'irc-message', { targetDatabase, now, lifetimeMs: 60_000 }), true);
  assert.equal(claimTwitchProcessedMessage(GUILD_A, 'irc-message', { targetDatabase, now: now + 1, lifetimeMs: 60_000 }), false);
  assert.equal(claimTwitchProcessedMessage(GUILD_B, 'irc-message', { targetDatabase, now: now + 1, lifetimeMs: 60_000 }), true);
  assert.equal(claimTwitchProcessedMessage(GUILD_A, 'irc-message', { targetDatabase, now: now + 60_000, lifetimeMs: 60_000 }), true);

  assert.equal(claimTwitchEventSubMessage(GUILD_A, 'eventsub-message', { targetDatabase, now, lifetimeMs: 60_000 }), true);
  assert.equal(claimTwitchEventSubMessage(GUILD_A, 'eventsub-message', { targetDatabase, now: now + 1, lifetimeMs: 60_000 }), false);
  assert.equal(claimTwitchEventSubMessage(GUILD_A, 'eventsub-message', { targetDatabase, now: now + 60_000, lifetimeMs: 60_000 }), true);
});

test('supprime atomiquement toutes les données Twitch d’un seul serveur', () => {
  const targetDatabase = testDatabase();
  const tokenVault = vault();
  upsertTwitchConnection(GUILD_A, connection({ enabled: false }), { targetDatabase, vault: tokenVault });
  upsertTwitchConnection(GUILD_B, connection({ broadcasterUserId: '87654321', broadcasterLogin: 'autre_chaine', enabled: false }), { targetDatabase, vault: tokenVault });
  upsertTwitchCustomCommand(GUILD_A, { name: 'discord', response: 'Serveur A' }, { targetDatabase });
  upsertTwitchCustomCommand(GUILD_B, { name: 'discord', response: 'Serveur B' }, { targetDatabase });
  issueTwitchOAuthState(GUILD_A, USER_A, { targetDatabase });
  setTwitchChatConfig(GUILD_A, { enabled: false, prefix: '!' }, { targetDatabase });
  setTwitchRuntimeStatus(GUILD_A, 'connected', 'Chat prêt', { targetDatabase });
  claimTwitchProcessedMessage(GUILD_A, 'irc-a', { targetDatabase });
  claimTwitchEventSubMessage(GUILD_A, 'event-a', { targetDatabase });

  const deleted = deleteTwitchGuildData(GUILD_A, { targetDatabase });
  assert.ok(Object.values(deleted).every((total) => total === 1));
  assert.equal(getTwitchConnection(GUILD_A, { targetDatabase }), null);
  assert.equal(getTwitchCustomCommand(GUILD_A, 'discord', { targetDatabase }), null);
  assert.equal(getTwitchRuntimeStatus(GUILD_A, { targetDatabase }), null);
  assert.notEqual(getTwitchConnection(GUILD_B, { targetDatabase }), null);
  assert.notEqual(getTwitchCustomCommand(GUILD_B, 'discord', { targetDatabase }), null);
});
