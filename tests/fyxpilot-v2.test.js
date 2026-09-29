const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const {
  getChange,
  listChanges,
  markChangeRolledBack,
  recordChange,
} = require('../src/database/changeHistoryStore');
const { buildContentLibrary } = require('../src/services/contentLibrary');
const { buildPermissionPreview, buildSetupSimulation } = require('../src/services/setupSimulation');
const { withoutServerSetupPreview } = require('../src/database/serverSetupStore');

function historyDatabase() {
  const targetDatabase = new DatabaseSync(':memory:');
  targetDatabase.exec(`CREATE TABLE change_history (
    id TEXT PRIMARY KEY, guild_id TEXT, actor_id TEXT, actor_name TEXT, kind TEXT,
    title TEXT, summary TEXT, details TEXT, backup_file TEXT, reversible INTEGER,
    status TEXT, created_at TEXT, rolled_back_at TEXT, rolled_back_by TEXT
  )`);
  return targetDatabase;
}

test('enregistre une modification réversible sans exposer de contenu sensible', async () => {
  const targetDatabase = historyDatabase();
  const created = await recordChange('guild', {
    actorId: 'user', actorName: 'Antony', kind: 'structure', title: 'Structure synchronisée',
    summary: 'Trois salons ajoutés.', details: { created: 3 }, backupFile: 'guild-backup.json.enc', reversible: true,
  }, { targetDatabase });
  assert.equal(created.reversible, true);
  assert.equal(created.details.created, 3);
  assert.equal((await listChanges('guild', 10, { targetDatabase })).length, 1);
  assert.equal(await markChangeRolledBack('guild', created.id, 'Antony', { targetDatabase }), true);
  assert.equal((await getChange('guild', created.id, { targetDatabase })).status, 'rolled_back');
  assert.equal(await markChangeRolledBack('guild', created.id, 'Antony', { targetDatabase }), false);
});

test('simule les trois modes sans modifier Discord', () => {
  const simulation = buildSetupSimulation({
    blueprint: { roles: [{}, {}], categories: [{}], channels: [{}, {}, {}] },
    current: {
      roles: 4,
      categories: 2,
      channels: 5,
      resettable: {
        roles: ['VIP', 'Membre'],
        categories: ['COMMUNAUTÉ'],
        channels: ['général', 'annonces'],
      },
    },
    analysis: {
      missingRoles: ['Membre'], missingCategories: [], missingChannels: ['général'],
      misplacedChannels: ['annonces'], permissionIssues: ['Catégorie STAFF'],
      extraRoles: ['VIP'], extraCategories: [], extraChannels: ['hors-sujet'],
    },
  });
  assert.equal(simulation.previewOnly, true);
  assert.equal(simulation.totalChanges, 4);
  assert.equal(simulation.plans.complete.deletes, 0);
  assert.deepEqual(simulation.plans.complete.projected, { roles: 5, categories: 2, channels: 6 });
  assert.equal(simulation.plans.synchronize.updates, 2);
  assert.equal(simulation.plans.reset.risk, 'critical');
  assert.equal(simulation.plans.reset.deletes, 5);
  assert.deepEqual(simulation.plans.reset.projected, { roles: 2, categories: 1, channels: 3 });
  assert.ok(simulation.removals.includes('Rôle : VIP'));
  assert.ok(simulation.removals.includes('Salon : général'));
});

test('respecte un serveur vide dans les projections FyxPilot', () => {
  const simulation = buildSetupSimulation({
    blueprint: { roles: [{}], categories: [{}], channels: [{}] },
    current: { roles: 0, categories: 0, channels: 0, resettable: { roles: [], categories: [], channels: [] } },
    analysis: {
      missingRoles: ['Membre'], missingCategories: ['ACCUEIL'], missingChannels: ['bienvenue'],
      misplacedChannels: [], permissionIssues: [], extraRoles: [], extraCategories: [], extraChannels: [],
    },
  });
  assert.deepEqual(simulation.before, { roles: 0, categories: 0, channels: 0 });
  assert.deepEqual(simulation.plans.complete.projected, { roles: 1, categories: 1, channels: 1 });
  assert.equal(simulation.plans.reset.deletes, 0);
});

test('prévisualise les permissions finales par catégorie et par rôle', () => {
  const preview = buildPermissionPreview({
    roles: [
      { key: 'member', name: '👤 Membre' },
      { key: 'moderator', name: '🛡️ Modérateur', staff: true },
    ],
    categories: [
      { key: 'welcome', name: '📌 ACCUEIL', permissionProfile: 'publicReadOnly' },
      { key: 'community', name: '💬 COMMUNAUTÉ', permissionProfile: 'publicCommunity' },
      { key: 'staff', name: '🔐 STAFF', permissionProfile: 'staffOnly' },
    ],
    channels: [
      { key: 'announcements', category: 'community', name: '📣・annonces', permissionProfile: 'memberReadOnly' },
    ],
  }, { memberAccessRoleName: '✅ Vérifié' });

  assert.equal(preview.find((item) => item.key === 'welcome').access.find((item) => item.role === '@everyone').label, 'Lecture seule');
  assert.equal(preview.find((item) => item.key === 'community').access.find((item) => item.role === '@everyone').label, 'Masqué');
  assert.equal(preview.find((item) => item.key === 'community').access.find((item) => item.role === '✅ Vérifié').label, 'Lecture et écriture');
  assert.equal(preview.find((item) => item.key === 'staff').access.find((item) => item.role === '✅ Vérifié').label, 'Masqué');
  assert.equal(preview.find((item) => item.key === 'staff').access.find((item) => item.role === '🛡️ Modérateur').label, 'Lecture, écriture et modération');
  assert.equal(preview.find((item) => item.key === 'community').channelOverrides[0].name, '📣・annonces');
});

test('compte séparément catégories, salons et rôles gérables dans la structure Discord', () => {
  const dashboardServerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'dashboardServer.js'), 'utf8');
  assert.match(dashboardServerSource, /categories: categoryList\.length/);
  assert.match(dashboardServerSource, /channels: regularChannels\.length/);
  assert.match(dashboardServerSource, /roles: roleList\.length/);
  assert.match(dashboardServerSource, /setupCurrentSnapshot\(\s*fullGuild,\s*currentChannels,\s*currentRoles,/);
  assert.doesNotMatch(dashboardServerSource, /categories: categories\.size/);
});

test('affiche la projection et les suppressions propres au mode choisi', () => {
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'app', 'Dashboard.tsx'), 'utf8');
  assert.match(dashboardSource, /plan\.projected\.roles/);
  assert.match(dashboardSource, /mode === "reset" \? simulation\.removals : \[\]/);
  assert.match(dashboardSource, /Aucune suppression avec cette action/);
  assert.match(dashboardSource, /PERMISSIONS FINALES/);
});

test('expose FyxVision en lecture seule pour les permissions réelles d’un rôle', () => {
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'app', 'Dashboard.tsx'), 'utf8');
  const dashboardServerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'services', 'dashboardServer.js'), 'utf8');
  assert.match(dashboardSource, /FYXVISION · PERSPECTIVE RÉELLE/);
  assert.match(dashboardSource, /\/permissions\/perspective/);
  assert.match(dashboardSource, /Cette lecture ne modifie rien sur Discord/);
  assert.match(dashboardServerSource, /url\.pathname === '\/api\/permissions\/perspective'/);
  assert.match(dashboardServerSource, /manageableGuildIds && !manageableGuildIds\.includes\(guildId\)/);
  assert.match(dashboardServerSource, /requireGuildCapability\(client, guildId, session, \[PermissionFlagsBits\.ManageGuild\]\)/);
  assert.match(dashboardServerSource, /buildRolePermissionPerspective/);
  assert.match(dashboardServerSource, /subject === 'me'/);
  assert.match(dashboardServerSource, /session\.user\.id/);
  assert.match(dashboardServerSource, /buildMemberPermissionPerspective/);
  assert.match(dashboardSource, /Mon compte/);
  assert.match(dashboardSource, /Tous mes rôles combinés|tous ses rôles combinés/);
});

test('réunit les contenus éditables sans inclure le changelog officiel', () => {
  const library = buildContentLibrary({
    channelNames: new Map([['rules', 'règlement'], ['tickets', 'tickets']]),
    publishedMessages: [{ id: 'm1', title: 'Annonce', channelId: 'news', channelName: 'annonces', updatedAt: '2026-08-31' }],
    config: {
      rules: { title: 'Nos règles', channelId: 'rules', messageId: 'discord-rule' },
      tickets: { panels: [{ id: 'p1', title: 'Support', requestType: 'aide', panelChannelId: 'tickets' }] },
      rolePanels: [],
    },
  });
  assert.deepEqual(library.map((item) => item.kind).sort(), ['message', 'rules', 'ticket']);
  assert.equal(library.some((item) => /changelog/i.test(item.title)), false);
  assert.equal(library.find((item) => item.kind === 'ticket').entityId, 'p1');
  assert.equal(library.find((item) => item.kind === 'rules').entityId, 'main');
  assert.equal(library.find((item) => item.kind === 'message').removable, true);
  assert.equal(library.find((item) => item.kind === 'ticket').removable, true);
});

test('ne propose pas la suppression directe des automatisations sans message suivi', () => {
  const library = buildContentLibrary({
    config: {
      welcome: { welcomeChannelId: 'welcome' },
      birthdays: { channelId: 'birthdays' },
    },
  });
  assert.equal(library.find((item) => item.kind === 'welcome').removable, false);
  assert.equal(library.find((item) => item.kind === 'birthdays').removable, false);
});

test('conserve le module consulté pendant les actualisations automatiques', () => {
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'app', 'Dashboard.tsx'), 'utf8');
  assert.match(dashboardSource, /ACTIVE_VIEW_KEY = "fyxbot-dashboard-active-view"/);
  assert.match(dashboardSource, /sessionStorage\.setItem\(ACTIVE_VIEW_KEY, normalizedView\)/);
  assert.match(dashboardSource, /sessionStorage\.getItem\(ACTIVE_VIEW_KEY\)/);
});

test('annule une actualisation obsolète lors du changement de serveur', () => {
  const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard', 'app', 'Dashboard.tsx'), 'utf8');
  assert.match(dashboardSource, /refreshController\.current\?\.abort\(\)/);
  assert.match(dashboardSource, /signal: controller\.signal/);
  assert.match(dashboardSource, /refreshController\.current !== controller/);
});

test('supprime un aperçu sans effacer le modèle actif utilisé pour la maintenance', () => {
  const activeBlueprint = { description: 'Structure active' };
  const result = withoutServerSetupPreview({
    description: 'Nouvel aperçu',
    draftBlueprint: { description: 'Brouillon' },
    draftUpdatedAt: '2026-08-31T10:00:00.000Z',
    activeBlueprint,
    appliedAt: '2026-08-30T10:00:00.000Z',
  }, new Date('2026-09-01T08:00:00.000Z'));

  assert.equal(result.draftBlueprint, undefined);
  assert.equal(result.description, undefined);
  assert.equal(result.activeBlueprint, activeBlueprint);
  assert.equal(result.previewHiddenAt, '2026-09-01T08:00:00.000Z');
});
