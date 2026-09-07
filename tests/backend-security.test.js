const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { PermissionFlagsBits } = require('discord.js');
const {
  contentDeleteError,
  deleteTrackedDiscordMessage,
  getDashboardState,
  isLoopbackHost,
  isRequestOriginAllowed,
  messagePublishError,
  normalizeBotNickname,
  panelErrorResponse,
  requireGuildCapability,
  requireRecentAuthentication,
  revalidateManageableGuildIds,
  updateGuildBotNickname,
} = require('../src/services/dashboardServer');
const { csrfTokenMatches, getSession, settings, startLogin } = require('../src/services/dashboardAuth');
const { database } = require('../src/database/database');
const { isRegisteredRolePanel } = require('../src/services/roleButtons');
const {
  closedTicketName,
  isClosedTicketChannel,
  isDeletableTicketChannel,
  openTicketName,
} = require('../src/services/tickets');
const { categoryNameWithEmoji, hasLeadingEmoji } = require('../src/services/categoryEmojis');
const { grantableRolePermissions, missingSetupPermissions } = require('../src/services/serverSetup');

test('refuse un serveur demandé hors de la liste administrable', async () => {
  const client = {
    config: { guildId: null },
    guilds: { cache: new Map([['guild-a', { id: 'guild-a' }], ['guild-b', { id: 'guild-b' }]]) },
  };
  await assert.rejects(
    getDashboardState(client, 'guild-b', ['guild-a']),
    /pas autorisé/,
  );
});

test('ne sélectionne pas le serveur de développement s’il n’est pas autorisé', async () => {
  const client = {
    config: { guildId: 'guild-b' },
    guilds: { cache: new Map([['guild-b', { id: 'guild-b' }]]) },
  };
  await assert.rejects(
    getDashboardState(client, null, []),
    /serveur que vous pouvez administrer/,
  );
});

test('revalide les permissions Discord présentes et retirées', async () => {
  const permittedGuild = {
    id: 'guild-a', ownerId: 'owner',
    members: { fetch: async () => ({ permissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild } }) },
  };
  const revokedGuild = {
    id: 'guild-b', ownerId: 'owner',
    members: { fetch: async () => ({ permissions: { has: () => false } }) },
  };
  const client = { guilds: { cache: new Map([['guild-a', permittedGuild], ['guild-b', revokedGuild]]) } };
  const result = await revalidateManageableGuildIds(client, { user: { id: 'user' }, manageableGuildIds: ['guild-a', 'guild-b'] });
  assert.deepEqual(result, ['guild-a']);
});

test('découvre un serveur rejoint après la connexion au panel', async () => {
  const authenticatedAt = Date.now() - 5_000;
  const newGuild = {
    id: 'guild-new',
    ownerId: 'another-owner',
    joinedTimestamp: Date.now(),
    members: {
      cache: new Map(),
      fetch: async () => ({
        permissions: {
          has: (permission) => permission === PermissionFlagsBits.ManageGuild,
        },
      }),
    },
  };
  const client = { guilds: { cache: new Map([['guild-new', newGuild]]) } };
  const result = await revalidateManageableGuildIds(client, {
    user: { id: 'new-admin' },
    manageableGuildIds: [],
    authenticatedAt,
  });
  assert.deepEqual(result, ['guild-new']);
});

test('découvre immédiatement un nouveau serveur appartenant au compte connecté', async () => {
  const ownedGuild = {
    id: 'guild-owned',
    ownerId: 'owner-user',
    members: { cache: new Map(), fetch: async () => { throw new Error('fetch inutile'); } },
  };
  const client = { guilds: { cache: new Map([['guild-owned', ownedGuild]]) } };
  const result = await revalidateManageableGuildIds(client, {
    user: { id: 'owner-user' },
    manageableGuildIds: [],
    authenticatedAt: Date.now(),
  });
  assert.deepEqual(result, ['guild-owned']);
});

test('interdit toujours le mode sans authentification en production', () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousOptIn = process.env.ALLOW_UNAUTHENTICATED_LOCAL;
  const previousSecret = process.env.DISCORD_CLIENT_SECRET;
  process.env.NODE_ENV = 'production';
  process.env.ALLOW_UNAUTHENTICATED_LOCAL = 'true';
  delete process.env.DISCORD_CLIENT_SECRET;
  try {
    const config = settings();
    assert.equal(config.enabled, false);
    assert.equal(config.allowUnauthenticatedLocal, false);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousEnvironment;
    if (previousOptIn === undefined) delete process.env.ALLOW_UNAUTHENTICATED_LOCAL; else process.env.ALLOW_UNAUTHENTICATED_LOCAL = previousOptIn;
    if (previousSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET; else process.env.DISCORD_CLIENT_SECRET = previousSecret;
  }
});

test('ajoute Secure aux cookies lorsque le panel est en HTTPS', () => {
  const previousUrl = process.env.DASHBOARD_PUBLIC_URL;
  process.env.DASHBOARD_PUBLIC_URL = 'https://panel.fyxbot.example';
  try {
    assert.equal(settings().secureCookies, true);
  } finally {
    if (previousUrl === undefined) delete process.env.DASHBOARD_PUBLIC_URL; else process.env.DASHBOARD_PUBLIC_URL = previousUrl;
  }
});

test('exige un jeton CSRF identique à celui de la session', () => {
  const session = { csrfToken: 'jeton-secret' };
  assert.equal(csrfTokenMatches({ headers: { 'x-fyxbot-csrf': 'jeton-secret' } }, session), true);
  assert.equal(csrfTokenMatches({ headers: { 'x-fyxbot-csrf': 'autre-jeton' } }, session), false);
  assert.equal(csrfTokenMatches({ headers: {} }, session), false);
});

test('ajoute un jeton CSRF aux anciennes sessions sans prolonger leur expiration', () => {
  const token = `ancienne-session-${process.pid}-${Date.now()}`;
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const expiresAt = Date.now() + 60_000;
  database.prepare('INSERT INTO dashboard_sessions (token_hash, value, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    JSON.stringify({ user: { id: 'user-a' }, manageableGuildIds: ['guild-a'], authenticatedAt: Date.now() }),
    expiresAt,
  );
  try {
    const session = getSession({ headers: { cookie: `fyxbot_session=${token}` } });
    assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
    const stored = database.prepare('SELECT value, expires_at FROM dashboard_sessions WHERE token_hash = ?').get(tokenHash);
    assert.equal(JSON.parse(stored.value).csrfToken, session.csrfToken);
    assert.equal(stored.expires_at, expiresAt);
  } finally {
    database.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(tokenHash);
  }
});

test('stocke l’état OAuth haché et utilise les cookies sécurisés __Host en production', () => {
  const previous = {
    environment: process.env.NODE_ENV,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    panelUrl: process.env.DASHBOARD_PUBLIC_URL,
    callbackUrl: process.env.DISCORD_OAUTH_CALLBACK,
  };
  Object.assign(process.env, {
    NODE_ENV: 'production', CLIENT_ID: 'client', DISCORD_CLIENT_SECRET: 'secret',
    DASHBOARD_PUBLIC_URL: 'https://panel.fyxbot.example',
    DISCORD_OAUTH_CALLBACK: 'https://api.fyxbot.example/api/auth/callback',
  });
  let status;
  let headers;
  const response = {
    writeHead(nextStatus, nextHeaders) { status = nextStatus; headers = nextHeaders; },
    end() {},
  };
  let stateHash;
  try {
    startLogin(response);
    const state = new URL(headers.Location).searchParams.get('state');
    stateHash = createHash('sha256').update(state).digest('hex');
    assert.equal(status, 302);
    assert.match(headers['Set-Cookie'][0], /^__Host-fyxbot_oauth_state=/);
    assert.match(headers['Set-Cookie'][0], /; HttpOnly; SameSite=Lax; Path=\/; Max-Age=600; Secure$/);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM dashboard_oauth_states WHERE state_hash = ?').get(stateHash).total, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS total FROM dashboard_oauth_states WHERE state_hash = ?').get(state).total, 0);
  } finally {
    if (stateHash) database.prepare('DELETE FROM dashboard_oauth_states WHERE state_hash = ?').run(stateHash);
    for (const [key, value] of Object.entries({ NODE_ENV: previous.environment, CLIENT_ID: previous.clientId, DISCORD_CLIENT_SECRET: previous.clientSecret, DASHBOARD_PUBLIC_URL: previous.panelUrl, DISCORD_OAUTH_CALLBACK: previous.callbackUrl })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('réserve une action administrateur au propriétaire ou à un administrateur', async () => {
  const guild = {
    id: 'guild-a', ownerId: 'owner',
    members: { fetch: async () => ({ permissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild } }) },
  };
  const client = { guilds: { fetch: async () => guild } };
  await assert.rejects(
    requireGuildCapability(client, guild.id, { user: { id: 'manager' } }, [], { administratorOnly: true }),
    /permissions Discord/,
  );
  await assert.doesNotReject(
    requireGuildCapability(client, guild.id, { user: { id: 'owner' } }, [], { administratorOnly: true }),
  );
});

test('exige la permission correspondant à chaque action de modération', async () => {
  const guild = {
    id: 'guild-a', ownerId: 'owner',
    members: { fetch: async () => ({ permissions: { has: (permission) => permission === PermissionFlagsBits.KickMembers } }) },
  };
  const client = { guilds: { fetch: async () => guild } };
  const session = { user: { id: 'moderator' } };
  await assert.doesNotReject(requireGuildCapability(client, guild.id, session, [PermissionFlagsBits.KickMembers]));
  await assert.rejects(requireGuildCapability(client, guild.id, session, [PermissionFlagsBits.BanMembers]), /permissions Discord/);
});

test('reconnaît uniquement les adresses locales pour le mode sans authentification', () => {
  assert.equal(isLoopbackHost('127.0.0.1'), true);
  assert.equal(isLoopbackHost('::1'), true);
  assert.equal(isLoopbackHost('0.0.0.0'), false);
});

test('utilise le même domaine local pour le panel et le retour OAuth Discord', () => {
  const previous = {
    panelUrl: process.env.DASHBOARD_PUBLIC_URL,
    callbackUrl: process.env.DISCORD_OAUTH_CALLBACK,
    apiPort: process.env.DASHBOARD_API_PORT,
    port: process.env.PORT,
  };
  delete process.env.DASHBOARD_PUBLIC_URL;
  delete process.env.DISCORD_OAUTH_CALLBACK;
  delete process.env.DASHBOARD_API_PORT;
  delete process.env.PORT;
  try {
    const config = settings();
    assert.equal(config.panelUrl, 'http://127.0.0.1:3000');
    assert.equal(config.callbackUrl, 'http://127.0.0.1:3001/api/auth/callback');
  } finally {
    for (const [key, value] of Object.entries({
      DASHBOARD_PUBLIC_URL: previous.panelUrl,
      DISCORD_OAUTH_CALLBACK: previous.callbackUrl,
      DASHBOARD_API_PORT: previous.apiPort,
      PORT: previous.port,
    })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('autorise les lectures sans Origin tout en protégeant les écritures', () => {
  assert.equal(isRequestOriginAllowed('GET', '/api/auth/status', ''), true);
  assert.equal(isRequestOriginAllowed('GET', '/api/state', ''), true);
  assert.equal(isRequestOriginAllowed('POST', '/api/config/logs', ''), false);
  assert.equal(isRequestOriginAllowed('GET', '/api/state', 'https://malveillant.example'), false);
});

test('refuse OAuth en production lorsque les URL ne sont pas en HTTPS', () => {
  const previous = {
    environment: process.env.NODE_ENV,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.DISCORD_CLIENT_SECRET,
    panelUrl: process.env.DASHBOARD_PUBLIC_URL,
    callbackUrl: process.env.DISCORD_OAUTH_CALLBACK,
  };
  Object.assign(process.env, {
    NODE_ENV: 'production', CLIENT_ID: 'client', DISCORD_CLIENT_SECRET: 'secret',
    DASHBOARD_PUBLIC_URL: 'http://panel.example', DISCORD_OAUTH_CALLBACK: 'http://api.example/callback',
  });
  try { assert.equal(settings().enabled, false); } finally {
    for (const [key, value] of Object.entries({ NODE_ENV: previous.environment, CLIENT_ID: previous.clientId, DISCORD_CLIENT_SECRET: previous.clientSecret, DASHBOARD_PUBLIC_URL: previous.panelUrl, DISCORD_OAUTH_CALLBACK: previous.callbackUrl })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('accepte seulement les boutons appartenant à un panneau de rôles enregistré', () => {
  const interaction = { message: { id: 'message-a' }, channelId: 'channel-a' };
  const config = { panels: [{ messageId: 'message-a', channelId: 'channel-a', roleIds: ['role-a'] }] };
  assert.equal(isRegisteredRolePanel(config, interaction, 'role-a'), true);
  assert.equal(isRegisteredRolePanel(config, interaction, 'admin-role'), false);
});

test('supprime uniquement un salon de ticket FyxBot déjà fermé', () => {
  assert.equal(isDeletableTicketChannel({ name: 'ferme-aide', topic: 'fyxbot-ticket:user:panel' }), true);
  assert.equal(isDeletableTicketChannel({ name: '🔒・ferme-aide', topic: 'fyxbot-ticket:user:panel' }), true);
  assert.equal(isDeletableTicketChannel({ name: 'ferme-ancien', topic: 'nexora-ticket:user:panel' }), true);
  assert.equal(isDeletableTicketChannel({ name: 'general', topic: 'fyxbot-ticket:user:panel' }), false);
  assert.equal(isDeletableTicketChannel({ name: 'ferme-general', topic: 'salon-normal' }), false);
});

test('nomme et renomme les tickets au format emoji・nom sans perdre leur identité', () => {
  assert.equal(openTicketName('Jean_Dupont'), '🎫・ticket-jeandupont');
  assert.equal(closedTicketName('🎫・ticket-jeandupont'), '🔒・ferme-jeandupont');
  assert.equal(openTicketName('🔒・ferme-jeandupont'), '🎫・ticket-jeandupont');
  assert.equal(isClosedTicketChannel({ name: '🔒・ferme-jeandupont' }), true);
  assert.equal(isClosedTicketChannel({ name: '🎫・ticket-jeandupont' }), false);
});

test('exige une connexion Discord récente avant une action sensible', () => {
  assert.doesNotThrow(() => requireRecentAuthentication({ authenticatedAt: Date.now() }));
  assert.throws(() => requireRecentAuthentication({ authenticatedAt: Date.now() - 11 * 60_000 }), /Reconnectez-vous/);
  assert.throws(() => requireRecentAuthentication({}), /Reconnectez-vous/);
});

test('attribue un emoji cohérent sans modifier les catégories déjà illustrées', () => {
  assert.equal(categoryNameWithEmoji('Vocal'), '🔊 Vocal');
  assert.equal(categoryNameWithEmoji('Minecraft survie'), '🎮 Minecraft survie');
  assert.equal(categoryNameWithEmoji('Partenaires'), '🤝 Partenaires');
  assert.equal(categoryNameWithEmoji('Autres'), '📁 Autres');
  assert.equal(categoryNameWithEmoji('🎫 Support'), '🎫 Support');
  assert.equal(hasLeadingEmoji('🔐 Staff'), true);
});

test('adapte les rôles du setup aux permissions réellement accordées à FyxBot', () => {
  const granted = new Set([
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ManageMessages,
  ]);
  const guild = { members: { me: { permissions: { has: (permission) => granted.has(permission) } } } };
  const permissions = grantableRolePermissions(
    guild,
    [PermissionFlagsBits.Administrator],
    [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ViewAuditLog, PermissionFlagsBits.ManageMessages],
  );
  assert.deepEqual(permissions, [PermissionFlagsBits.ManageGuild, PermissionFlagsBits.ManageMessages]);
  assert.deepEqual(missingSetupPermissions(guild), []);
  granted.delete(PermissionFlagsBits.ManageRoles);
  assert.deepEqual(missingSetupPermissions(guild), [PermissionFlagsBits.ManageRoles]);
});

test('affiche la raison sûre des requêtes invalides en production', () => {
  const validation = messagePublishError(Object.assign(new Error('Missing Permissions'), { code: 50013 }));
  const response = panelErrorResponse(validation, 'production');
  assert.equal(response.status, 403);
  assert.match(response.error, /permissions nécessaires/);
  assert.equal(response.reference, null);
});

test('traduit les refus Discord du constructeur de messages', () => {
  assert.match(messagePublishError(Object.assign(new Error('Missing Access'), { code: 50001 })).message, /voir ce salon/);
  assert.match(messagePublishError(Object.assign(new Error('Invalid Form Body'), { code: 50035 })).message, /format du message/);
  assert.match(messagePublishError(new Error('socket interne indisponible')).message, /Réessayez/);
});

test('explique précisément les refus Discord lors du retrait d’un contenu', () => {
  assert.match(contentDeleteError(Object.assign(new Error('Missing Access'), { code: 50001 })).message, /contenant ce message/);
  assert.match(contentDeleteError(Object.assign(new Error('Missing Permissions'), { code: 50013 })).message, /Gérer les messages/);
  assert.match(contentDeleteError(new Error('socket interne indisponible')).message, /retirer ce contenu/);
});

test('normalise le surnom FyxBot sans dépasser la limite Discord', () => {
  assert.equal(normalizeBotNickname('  Assistant   Minecraft  '), 'Assistant Minecraft');
  assert.equal(normalizeBotNickname(''), '');
  assert.throws(() => normalizeBotNickname('x'.repeat(33)), /32 caractères/);
});

test('modifie uniquement le surnom du bot sur le serveur ciblé', async () => {
  let applied = null;
  const member = {
    nickname: null,
    permissions: { has: (permission) => permission === PermissionFlagsBits.ChangeNickname },
    setNickname: async (nickname) => { applied = nickname; member.nickname = nickname; },
  };
  const result = await updateGuildBotNickname({ members: { me: member } }, 'Assistant Minecraft');
  assert.deepEqual(result, { changed: true, nickname: 'Assistant Minecraft' });
  assert.equal(applied, 'Assistant Minecraft');
});

test('refuse la personnalisation si FyxBot ne peut pas changer son pseudo', async () => {
  const member = {
    nickname: null,
    permissions: { has: () => false },
    setNickname: async () => assert.fail('Discord ne doit pas être appelé'),
  };
  await assert.rejects(updateGuildBotNickname({ members: { me: member } }, 'Assistant'), /Changer de pseudo/);
});

test('supprime uniquement un message Discord publié par FyxBot', async () => {
  let deleted = false;
  const client = {
    user: { id: 'fyxbot' },
    channels: { fetch: async () => ({
      guildId: 'guild',
      isTextBased: () => true,
      messages: { fetch: async () => ({ author: { id: 'fyxbot' }, delete: async () => { deleted = true; } }) },
    }) },
  };
  assert.equal(await deleteTrackedDiscordMessage(client, 'guild', 'channel', 'message'), true);
  assert.equal(deleted, true);
});

test('refuse de supprimer un message Discord qui n’appartient pas à FyxBot', async () => {
  const client = {
    user: { id: 'fyxbot' },
    channels: { fetch: async () => ({
      guildId: 'guild',
      isTextBased: () => true,
      messages: { fetch: async () => ({ author: { id: 'member' }, delete: async () => {} }) },
    }) },
  };
  await assert.rejects(deleteTrackedDiscordMessage(client, 'guild', 'channel', 'message'), /n’est pas l’auteur/);
});

test('masque les erreurs internes en production avec une référence de diagnostic', () => {
  const response = panelErrorResponse(new Error('SQLITE_CONSTRAINT: détail interne'), 'production');
  assert.equal(response.status, 500);
  assert.doesNotMatch(response.error, /SQLITE/);
  assert.match(response.error, /Référence/);
  assert.match(response.reference, /^[A-F0-9]{8}$/);
});
