const assert = require('node:assert/strict');
const test = require('node:test');
const { once } = require('node:events');
const { EventEmitter } = require('node:events');
const { Collection } = require('discord.js');
const { getLogConfig, setLogConfig } = require('../src/database/logStore');
const { getWelcomeConfig, setWelcomeConfig } = require('../src/database/welcomeStore');
const { addWarning, getWarnings } = require('../src/database/warningStore');
const { createSupportRequest, getSupportConversation } = require('../src/database/supportStore');
const { getFounderProgramState } = require('../src/services/premiumFounderAccess');
const { getGuildPremiumEntitlementState } = require('../src/services/premiumEntitlements');
const { recordGuild, getCreatorStats } = require('../src/database/creatorStatsStore');
const { listGuildGiveaways } = require('../src/services/communityGiveaways');
const { POSTGRES_SCHEMA_SQL, POSTGRES_SCHEMA_VERSION } = require('../src/database/postgresSchema');
const { assertRuntimeBackendReady, initializeRuntimeBackend, verifyPostgresRuntimeSchema } = require('../src/database/runtimeBackend');
const {
  STORE_NAMES, configureRuntimeStores, createPostgresRuntimeStores, resolveRuntimeStore,
} = require('../src/database/runtimeStorage');

test('assemble tous les magasins dans un schéma isolé et refuse un raccordement incomplet', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, params) => database.query(sql, params),
      connect: async () => ({ query: (sql, params) => database.query(sql, params), release() {} }),
    };
    const stores = createPostgresRuntimeStores(pool);
    assert.deepEqual(Object.keys(stores), STORE_NAMES);
    assert.throws(() => configureRuntimeStores({ configuration: stores.configuration }), /incomplets/);
    await assert.rejects(() => verifyPostgresRuntimeSchema(pool, 'fyxbot'), /Version du schéma/);
    await database.query('INSERT INTO fyxbot.fyxbot_schema_migrations (version, applied_at) VALUES ($1, $2)', [POSTGRES_SCHEMA_VERSION, new Date().toISOString()]);
    const runtime = await initializeRuntimeBackend({
      environment: { FYXBOT_STORAGE_BACKEND: 'postgres', FYXBOT_POSTGRES_URL: 'postgres://local-test', FYXBOT_POSTGRES_SCHEMA: 'fyxbot' },
      poolFactory: () => pool,
    });
    assert.equal(runtime.backend, 'postgres');
    assert.equal(runtime.pool, pool);
    assert.throws(() => configureRuntimeStores(stores), /déjà configuré/);
    const previous = process.env.FYXBOT_STORAGE_BACKEND;
    try {
      process.env.FYXBOT_STORAGE_BACKEND = 'postgres';
      assert.doesNotThrow(() => assertRuntimeBackendReady());
      assert.equal(resolveRuntimeStore('configuration'), runtime.stores.configuration);
      await stores.configuration.setConfiguration('guild', 'welcome', { enabled: true });
      assert.deepEqual(await resolveRuntimeStore('configuration').getConfiguration('guild', 'welcome'), { enabled: true });
      await setLogConfig('guild', { channelId: 'log-channel' });
      await setWelcomeConfig('guild', { enabled: false });
      assert.deepEqual(await getLogConfig('guild'), { channelId: 'log-channel' });
      assert.deepEqual(await getWelcomeConfig('guild'), { enabled: false });
      await addWarning({ guildId: 'guild', userId: 'user', moderatorId: 'mod', reason: 'test' });
      assert.equal((await getWarnings('guild', 'user')).length, 1);
      const support = await createSupportRequest({
        guildId: 'guild', guildName: 'Test', requesterId: 'user', requesterName: 'Alice',
        category: 'technical', subject: 'Question', priority: 'normal', message: 'Bonjour',
      });
      assert.equal((await getSupportConversation(support.id)).messages.length, 1);
      assert.equal((await getFounderProgramState(null, null)).claimed, 0);
      assert.equal((await getGuildPremiumEntitlementState('123456789012345678', { skuIds: [] })).active, false);
      await recordGuild({ id: 'guild', name: 'Test', memberCount: 2 });
      assert.equal((await getCreatorStats([{ id: 'guild', name: 'Test', memberCount: 2 }])).guildCount, 1);
      assert.deepEqual(await listGuildGiveaways('guild'), []);
      const { startDashboardServer } = require('../src/services/dashboardServer');
      const server = startDashboardServer({ isReady: () => false }, { host: '127.0.0.1', port: 0 });
      try {
        if (!server.listening) await once(server, 'listening');
        const origin = `http://127.0.0.1:${server.address().port}`;
        const health = await fetch(`${origin}/api/health`);
        assert.equal(health.status, 200);
        assert.equal((await health.json()).ok, true);
        const auth = await fetch(`${origin}/api/auth/status`);
        assert.equal(auth.status, 200);
        assert.equal((await auth.json()).authenticated, false);
      } finally {
        await new Promise((resolve) => server.close(resolve));
      }
      const client = new EventEmitter();
      client.commands = new Collection();
      await require('../src/loaders/commandLoader').loadCommands(client);
      await require('../src/loaders/eventLoader').loadEvents(client);
      assert.ok(client.commands.size > 0);
      assert.ok(client.eventNames().length > 0);
      assert.equal(require.cache[require.resolve('../src/database/database')], undefined);
    } finally {
      if (previous === undefined) delete process.env.FYXBOT_STORAGE_BACKEND;
      else process.env.FYXBOT_STORAGE_BACKEND = previous;
    }
  } finally {
    await database.close();
  }
});

test('refuse une connexion absente ou un schéma non autorisé avant toute ouverture PostgreSQL', async () => {
  await assert.rejects(() => initializeRuntimeBackend({ environment: { FYXBOT_STORAGE_BACKEND: 'postgres' } }), /FYXBOT_POSTGRES_URL/);
  await assert.rejects(() => initializeRuntimeBackend({
    environment: { FYXBOT_STORAGE_BACKEND: 'postgres', FYXBOT_POSTGRES_URL: 'postgres://local-test', FYXBOT_POSTGRES_SCHEMA: 'public;drop' },
  }), /schéma PostgreSQL invalide/);
  assert.equal((await initializeRuntimeBackend({ environment: {} })).backend, 'sqlite');
});
