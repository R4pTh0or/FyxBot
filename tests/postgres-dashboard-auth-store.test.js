const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresDashboardAuthStore } = require('../src/database/postgresDashboardAuthStore');
const { finishLogin, getSession, logout, startLogin } = require('../src/services/dashboardAuth');

test('conserve les sessions et rend les états OAuth à usage unique sous PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, parameters) => database.query(sql, parameters),
      connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }),
    };
    const auth = createPostgresDashboardAuthStore(pool);
    const now = Date.now();
    await auth.createSession('hash-a', { manageableGuildIds: ['guild-a', 'guild-b'] }, now + 60_000);
    await auth.createSession('hash-expired', { manageableGuildIds: ['guild-a'] }, now - 1);
    assert.equal(await auth.getSession('hash-expired', now), null);
    assert.deepEqual((await auth.getSession('hash-a', now)).manageableGuildIds, ['guild-a', 'guild-b']);
    assert.equal(await auth.removeGuildFromSessions('guild-a'), 2);
    assert.deepEqual((await auth.getSession('hash-a', now)).manageableGuildIds, ['guild-b']);
    assert.equal(await auth.updateSession('hash-a', { csrfToken: 'new' }), true);
    assert.equal((await auth.getSession('hash-a', now)).csrfToken, 'new');
    assert.equal(await auth.deleteSession('hash-a'), true);
    assert.equal(await auth.deleteSession('hash-a'), false);

    await auth.storeOAuthState('state-a', now + 60_000);
    await auth.storeOAuthState('state-expired', now - 1);
    assert.equal(await auth.consumeOAuthState('state-a', now), true);
    assert.equal(await auth.consumeOAuthState('state-a', now), false);
    assert.equal(await auth.consumeOAuthState('state-expired', now), false);
    const purged = await auth.purgeExpiredDashboardAuth(now);
    assert.equal(purged.sessions, 1);
    assert.equal(purged.oauthStates, 0);
  } finally {
    await database.close();
  }
});

test('refuse une connexion absente et un schéma non sûr', () => {
  assert.throws(() => createPostgresDashboardAuthStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresDashboardAuthStore({ query() {} }, { schema: 'fyxbot;DROP' }), /schéma PostgreSQL invalide/);
});

test('le parcours HTTP du panel attend le stockage PostgreSQL pour OAuth et les sessions', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  const previousClientId = process.env.CLIENT_ID;
  const previousSecret = process.env.DISCORD_CLIENT_SECRET;
  const previousFetch = global.fetch;
  process.env.CLIENT_ID = 'client-test';
  process.env.DISCORD_CLIENT_SECRET = 'secret-test';
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = { query: (sql, params) => database.query(sql, params) };
    const store = createPostgresDashboardAuthStore(pool);
    let status;
    let headers;
    const response = {
      writeHead(value, nextHeaders) { status = value; headers = nextHeaders; },
      end() {},
    };
    await startLogin(response, store);
    assert.equal(status, 302);
    const state = new URL(headers.Location).searchParams.get('state');
    const stateHash = createHash('sha256').update(state).digest('hex');
    global.fetch = async (url) => ({
      ok: true,
      json: async () => String(url).includes('/oauth2/token')
        ? { access_token: 'test-access-token' }
        : String(url).endsWith('/users/@me')
          ? { id: 'user-a', username: 'Test', avatar: null }
          : [{ id: 'guild-a', owner: true, permissions: '8' }],
    });
    const callbackRequest = { headers: { cookie: `fyxbot_oauth_state=${state}` } };
    const callbackUrl = new URL(`http://127.0.0.1:3001/api/auth/callback?state=${state}&code=test-code`);
    await finishLogin(callbackRequest, callbackUrl, response, store);
    assert.equal(status, 302);
    const sessionCookie = headers['Set-Cookie'].find((value) => value.startsWith('fyxbot_session='));
    assert.ok(sessionCookie);
    const authenticated = await getSession({ headers: { cookie: sessionCookie.split(';')[0] } }, store);
    assert.equal(authenticated.user.id, 'user-a');
    assert.deepEqual(authenticated.manageableGuildIds, ['guild-a']);
    await assert.rejects(() => finishLogin(callbackRequest, callbackUrl, response, store), /expirée ou invalide/);
    assert.equal(await store.consumeOAuthState(stateHash), false);

    const token = 'session-de-test';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    await store.createSession(tokenHash, { user: { id: 'user-a' }, manageableGuildIds: ['guild-a'] }, Date.now() + 60_000);
    const request = { headers: { cookie: `fyxbot_session=${token}` } };
    const session = await getSession(request, store);
    assert.equal(session.user.id, 'user-a');
    assert.match(session.csrfToken, /^[a-f0-9]{64}$/);
    assert.equal((await store.getSession(tokenHash)).csrfToken, session.csrfToken);
    await logout(request, response, 'http://127.0.0.1:3000', store);
    assert.equal(status, 200);
    assert.equal(await store.getSession(tokenHash), null);
  } finally {
    if (previousClientId === undefined) delete process.env.CLIENT_ID;
    else process.env.CLIENT_ID = previousClientId;
    if (previousSecret === undefined) delete process.env.DISCORD_CLIENT_SECRET;
    else process.env.DISCORD_CLIENT_SECRET = previousSecret;
    global.fetch = previousFetch;
    await database.close();
  }
});
