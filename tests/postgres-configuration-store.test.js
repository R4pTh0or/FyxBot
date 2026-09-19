const assert = require('node:assert/strict');
const test = require('node:test');
const { POSTGRES_SCHEMA_SQL } = require('../src/database/postgresSchema');
const { createPostgresConfigurationStore } = require('../src/database/postgresConfigurationStore');
const { createServerSetupStore } = require('../src/database/serverSetupStore');
const { getRulesConfig, setRulesConfig } = require('../src/database/rulesStore');
const { getBirthdayConfig, setBirthdayConfig } = require('../src/database/birthdayStore');
const { getChangelogConfig, setChangelogConfig } = require('../src/database/changelogStore');
const { getRolePanelConfig, setRolePanelConfig } = require('../src/database/rolePanelStore');
const { getSocialConfig, setSocialConfig } = require('../src/database/socialStore');
const { getTemporaryVoiceConfig, setTemporaryVoiceConfig } = require('../src/database/temporaryVoiceStore');
const { getLogConfig, setLogConfig } = require('../src/database/logStore');
const { getTicketConfig, setTicketConfig } = require('../src/database/ticketStore');
const { getSuggestionConfig, setSuggestionConfig } = require('../src/database/suggestionStore');
const { getWelcomeConfig, setWelcomeConfig } = require('../src/database/welcomeStore');
const { buildServerSnapshot } = require('../src/services/serverBackup');
const {
  createPublishedMessage,
  getPublishedMessage,
  listPublishedMessages,
  updatePublishedMessage,
} = require('../src/database/publishedMessageStore');
const {
  archiveContent,
  getContentTrashItem,
  removeContentTrashItem,
} = require('../src/database/contentTrashStore');

test('refuse un schéma non sûr et une connexion absente', () => {
  assert.throws(() => createPostgresConfigurationStore(null), /connexion PostgreSQL/);
  assert.throws(() => createPostgresConfigurationStore({ query() {}, connect() {} }, { schema: 'public; DROP TABLE x' }), /schéma PostgreSQL invalide/);
});

test('lit, remplace et isole les configurations de deux serveurs avec PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, parameters) => database.query(sql, parameters),
      connect: async () => ({
        query: (sql, parameters) => database.query(sql, parameters),
        release: () => {},
      }),
    };
    const store = createPostgresConfigurationStore(pool);

    assert.equal(await store.getConfiguration('guild-a', 'logs'), null);
    const initial = { enabled: true, channelId: '123' };
    assert.deepEqual(await store.setConfiguration('guild-a', 'logs', initial), initial);
    await store.setConfiguration('guild-b', 'logs', { enabled: false });
    await store.setConfiguration('guild-a', 'tickets', { categoryId: '456' });
    await store.updateConfiguration('guild-a', 'logs', (current) => ({ ...current, note: 'mise à jour' }));
    await store.updateConfiguration('guild-a', 'logs', () => undefined);
    assert.deepEqual(await store.getConfiguration('guild-a', 'logs'), { ...initial, note: 'mise à jour' });
    await store.setConfiguration('guild-a', 'logs', initial);
    assert.deepEqual(await store.getConfiguration('guild-a', 'logs'), initial);
    assert.deepEqual(await store.getGuildConfigurations('guild-a'), [
      { section: 'logs', value: initial },
      { section: 'tickets', value: { categoryId: '456' } },
    ]);

    await store.replaceGuildConfigurations('guild-a', [{ section: 'welcome', value: { message: 'Bonjour' } }]);
    assert.deepEqual(await store.getGuildConfigurations('guild-a'), [
      { section: 'welcome', value: { message: 'Bonjour' } },
    ]);
    assert.deepEqual(await store.getConfiguration('guild-b', 'logs'), { enabled: false });

    await assert.rejects(() => store.replaceGuildConfigurations('guild-a', [
      { section: 'rules', value: { accepted: true } },
      { section: 'rules', value: { accepted: false } },
    ]));
    assert.deepEqual(await store.getGuildConfigurations('guild-a'), [
      { section: 'welcome', value: { message: 'Bonjour' } },
    ]);
  } finally {
    await database.close();
  }
});

test('le parcours /setup attend les lectures et écritures PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, parameters) => database.query(sql, parameters),
      connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }),
    };
    const setup = createServerSetupStore(createPostgresConfigurationStore(pool));
    const draft = { description: 'Serveur Minecraft', roles: [], categories: [], channels: [] };
    assert.equal(await setup.getServerSetupBlueprint('guild-a'), null);
    await setup.saveServerSetupDraft('guild-a', draft);
    assert.deepEqual(await setup.getServerSetupBlueprint('guild-a'), draft);
    assert.equal(await setup.getServerSetupBlueprint('guild-b'), null);

    await setup.activateServerSetupBlueprint('guild-a', draft);
    assert.deepEqual(await setup.getServerSetupBlueprint('guild-a', { activeOnly: true }), draft);
    assert.equal(await setup.deleteServerSetupPreview('guild-a'), true);
    assert.equal(await setup.getServerSetupBlueprint('guild-a'), null);
    assert.deepEqual(await setup.getServerSetupBlueprint('guild-a', { activeOnly: true }), draft);
    assert.equal(await setup.deleteServerSetupPreview('guild-a'), true);
    assert.equal(await setup.deleteServerSetupPreview('guild-b'), false);
  } finally {
    await database.close();
  }
});

test('la bibliothèque et la corbeille du panel fonctionnent avec PostgreSQL', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const database = await PGlite.create();
  try {
    await database.exec(`CREATE SCHEMA fyxbot; SET search_path TO fyxbot; ${POSTGRES_SCHEMA_SQL}`);
    const pool = {
      query: (sql, parameters) => database.query(sql, parameters),
      connect: async () => ({ query: (sql, parameters) => database.query(sql, parameters), release() {} }),
    };
    const storage = createPostgresConfigurationStore(pool);
    const sections = [
      [getBirthdayConfig, setBirthdayConfig],
      [getChangelogConfig, setChangelogConfig],
      [getRolePanelConfig, setRolePanelConfig],
      [getSocialConfig, setSocialConfig],
      [getTemporaryVoiceConfig, setTemporaryVoiceConfig],
      [getLogConfig, setLogConfig],
      [getTicketConfig, setTicketConfig],
      [getSuggestionConfig, setSuggestionConfig],
      [getWelcomeConfig, setWelcomeConfig],
    ];
    for (const [getConfig, setConfig] of sections) {
      assert.equal(await getConfig('guild-a', storage), null);
      await setConfig('guild-a', { active: true }, storage);
      assert.deepEqual(await getConfig('guild-a', storage), { active: true });
      assert.equal(await getConfig('guild-b', storage), null);
    }
    await setRulesConfig('guild-a', { verifiedRoleId: 'role-a' }, storage);
    assert.deepEqual(await getRulesConfig('guild-a', storage), { verifiedRoleId: 'role-a' });
    assert.equal(await getRulesConfig('guild-b', storage), null);
    const fakeGuild = {
      id: 'guild-a', name: 'Serveur de test',
      channels: { fetch: async () => {}, cache: new Map() },
      roles: { fetch: async () => {}, cache: new Map() },
    };
    const snapshot = await buildServerSnapshot(fakeGuild, { store: storage });
    assert.deepEqual(snapshot.configurations.find((item) => item.section === 'rules'), {
      section: 'rules', value: { verifiedRoleId: 'role-a' },
    });
    const published = await createPublishedMessage('guild-a', {
      messageId: 'message-a', channelId: 'channel-a', title: 'Annonce', description: 'Bonjour',
    }, storage);
    assert.equal((await listPublishedMessages('guild-a', storage)).length, 1);
    assert.equal((await listPublishedMessages('guild-b', storage)).length, 0);
    assert.equal((await getPublishedMessage('guild-a', published.id, storage)).messageId, 'message-a');
    await updatePublishedMessage('guild-a', published.id, { title: 'Annonce modifiée' }, storage);
    assert.equal((await getPublishedMessage('guild-a', published.id, storage)).title, 'Annonce modifiée');

    const archived = await archiveContent('guild-a', {
      kind: 'message', title: 'Annonce', snapshot: { messageId: 'message-a', channelId: 'channel-a' },
    }, storage);
    assert.equal((await getContentTrashItem('guild-a', archived.id, storage)).id, archived.id);
    assert.equal(await getContentTrashItem('guild-b', archived.id, storage), null);
    assert.equal((await removeContentTrashItem('guild-a', archived.id, storage)).id, archived.id);
    assert.equal(await getContentTrashItem('guild-a', archived.id, storage), null);
  } finally {
    await database.close();
  }
});
