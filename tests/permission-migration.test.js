const assert = require('node:assert/strict');
const test = require('node:test');
const {
  PERMISSION_MODEL_VERSION,
  permissionMigrationEnabled,
  permissionMigrationTargets,
  runPermissionMigration,
} = require('../src/services/permissionMigration');

function clientWith(...guilds) {
  return { guilds: { cache: new Map(guilds.map((guild) => [guild.id, guild])) } };
}

function guild(id, name) {
  const value = { id, name };
  value.fetch = async () => value;
  return value;
}

test('n’active la migration que pour un périmètre explicite', () => {
  const development = guild('1', 'FyxBot Développement');
  const publicGuild = guild('2', 'Serveur public');
  const client = clientWith(publicGuild, development);
  assert.equal(permissionMigrationEnabled('disabled'), false);
  assert.deepEqual(permissionMigrationTargets(client, ''), []);
  assert.deepEqual(permissionMigrationTargets(client, 'FyxBot Développement'), [development]);
  assert.deepEqual(permissionMigrationTargets(client, 'all'), [development, publicGuild]);
});

test('sauvegarde, synchronise et marque une configuration active', async () => {
  const development = guild('1', 'FyxBot Développement');
  const configurations = new Map([['1', { activeBlueprint: { description: 'Serveur de test FyxBot' } }]]);
  const calls = [];
  const result = await runPermissionMigration(clientWith(development), {
    scope: 'FyxBot Développement',
    getConfig: async (id) => configurations.get(id),
    setConfig: async (id, value) => configurations.set(id, value),
    backup: async () => { calls.push('backup'); return 'backup.json'; },
    synchronize: async () => {
      calls.push('synchronize');
      return { created: 0, updated: 4, analysis: { totals: { missing: 0, permissionIssues: 0 } } };
    },
  });
  assert.deepEqual(calls, ['backup', 'synchronize']);
  assert.equal(result.migrated.length, 1);
  assert.equal(result.errors.length, 0);
  assert.equal(configurations.get('1').permissionModelVersion, PERMISSION_MODEL_VERSION);
  assert.equal(configurations.get('1').permissionModelBackupFile, 'backup.json');
});

test('ignore les serveurs non gérés et arrête le lot à la première erreur', async () => {
  const unmanaged = guild('1', 'Sans setup');
  const failing = guild('2', 'Serveur en erreur');
  const untouched = guild('3', 'Serveur suivant');
  const configurations = new Map([
    ['2', { activeBlueprint: { description: 'Serveur en erreur' } }],
    ['3', { activeBlueprint: { description: 'Serveur suivant' } }],
  ]);
  let synchronizations = 0;
  const result = await runPermissionMigration(clientWith(unmanaged, failing, untouched), {
    scope: 'all',
    getConfig: async (id) => configurations.get(id),
    setConfig: async () => null,
    backup: async () => 'backup.json',
    synchronize: async () => {
      synchronizations += 1;
      throw new Error('Permissions Discord insuffisantes');
    },
    logger: { error: () => null },
  });
  assert.equal(result.skipped.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(synchronizations, 1);
});
