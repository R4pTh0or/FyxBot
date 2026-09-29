const assert = require('node:assert/strict');
const test = require('node:test');
const { PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const {
  buildMemberPermissionPerspective,
  buildRolePermissionPerspective,
  isSensitiveChannel,
} = require('../src/services/permissionPerspective');

function fakeChannel({ id, name, parent = null, permissions = [], voice = false, position = 0 }) {
  return {
    id,
    name,
    parent,
    type: voice ? 2 : 0,
    rawPosition: position,
    isThread: () => false,
    isTextBased: () => !voice,
    isVoiceBased: () => voice,
    permissionsFor: () => new PermissionsBitField(permissions),
  };
}

test('calcule la perspective réelle d’un rôle sans modifier Discord', () => {
  const guild = { id: 'guild', name: 'FyxBot Développement' };
  const role = {
    id: 'member',
    name: 'Membre',
    hexColor: '#ff5a2a',
    permissions: new PermissionsBitField([]),
  };
  const publicCategory = { id: 'public', name: '💬・COMMUNAUTÉ', rawPosition: 1 };
  const staffCategory = { id: 'staff', name: '🔐・STAFF', rawPosition: 2 };
  const channels = new Map([
    ['general', fakeChannel({ id: 'general', name: '💬・général', parent: publicCategory, permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages] })],
    ['announcements', fakeChannel({ id: 'announcements', name: '📣・annonces', parent: publicCategory, permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory], position: 1 })],
    ['logs', fakeChannel({ id: 'logs', name: '🧾・logs', parent: staffCategory, permissions: [] })],
  ]);

  const result = buildRolePermissionPerspective({ guild, role, channels });

  assert.equal(result.previewOnly, true);
  assert.equal(result.subject.type, 'role');
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.visible, 2);
  assert.equal(result.summary.hidden, 1);
  assert.equal(result.summary.write, 1);
  assert.equal(result.summary.read, 1);
  assert.equal(result.categories[0].channels[0].label, 'Lecture et écriture');
  assert.equal(result.categories[1].channels[0].tone, 'hidden');
  assert.deepEqual(result.warnings, []);
});

test('signale un salon sensible visible par un rôle non privilégié', () => {
  const guild = { id: 'guild', name: 'Serveur' };
  const role = { id: 'guild', name: '@everyone', permissions: new PermissionsBitField([]) };
  const staffCategory = { id: 'staff', name: 'STAFF', rawPosition: 0 };
  const channels = new Map([
    ['mod', fakeChannel({ id: 'mod', name: 'moderation', parent: staffCategory, permissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] })],
  ]);

  const result = buildRolePermissionPerspective({ guild, role, channels });
  assert.equal(result.subject.everyone, true);
  assert.equal(result.warnings[0].code, 'sensitive-exposure');
});

test('explique le contournement des restrictions par Administrateur', () => {
  const guild = { id: 'guild', name: 'Serveur' };
  const role = {
    id: 'admin',
    name: 'Administrateur',
    permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
  };
  const result = buildRolePermissionPerspective({ guild, role, channels: new Map() });
  assert.equal(result.subject.elevated, true);
  assert.equal(result.warnings[0].severity, 'critical');
  assert.equal(result.warnings[0].code, 'administrator');
});

test('compte aussi l’écriture dans les salons gérables', () => {
  const guild = { id: 'guild', name: 'Serveur' };
  const role = { id: 'admin', name: 'Administrateur', permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]) };
  const channel = fakeChannel({ id: 'general', name: 'général', permissions: [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageChannels,
  ] });
  const result = buildRolePermissionPerspective({ guild, role, channels: new Map([['general', channel]]) });
  assert.equal(result.summary.visible, 1);
  assert.equal(result.summary.write, 1);
  assert.equal(result.summary.control, 1);
});

test('ne confond pas un changelog public avec un salon de journaux sensible', () => {
  assert.equal(isSensitiveChannel({ categoryName: 'ACCUEIL', name: '🛠️・changelog' }), false);
  assert.equal(isSensitiveChannel({ categoryName: 'FYXBOT STAFF', name: 'commandes-bot' }), true);
  assert.equal(isSensitiveChannel({ categoryName: 'ACCUEIL', name: '🧾・journaux-fyxbot' }), true);
});

test('calcule le compte connecté avec ses rôles et les exceptions de salon', () => {
  const guild = { id: 'guild', name: 'FyxBot' };
  const member = {
    id: 'member',
    displayName: 'R4pth0or',
    displayHexColor: '#ff6633',
    permissions: new PermissionsBitField([PermissionFlagsBits.ManageGuild]),
    roles: { cache: new Map([
      ['guild', { id: 'guild', name: '@everyone', position: 0 }],
      ['vip', { id: 'vip', name: 'VIP', position: 2 }],
      ['staff', { id: 'staff', name: 'Modérateur', position: 10 }],
    ]) },
  };
  const receivedTargets = [];
  const channels = new Map([
    ['general', { ...fakeChannel({ id: 'general', name: 'général' }), permissionsFor(target) {
      receivedTargets.push(target);
      return new PermissionsBitField([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]);
    } }],
    ['private', { ...fakeChannel({ id: 'private', name: 'privé' }), permissionsFor(target) {
      receivedTargets.push(target);
      return new PermissionsBitField([]);
    } }],
  ]);

  const result = buildMemberPermissionPerspective({ guild, member, channels });
  assert.equal(result.subject.type, 'member');
  assert.equal(result.subject.name, 'R4pth0or');
  assert.equal(result.subject.roleCount, 2);
  assert.deepEqual(result.subject.roleNames, ['Modérateur', 'VIP']);
  assert.equal(result.summary.visible, 1);
  assert.equal(result.summary.hidden, 1);
  assert.equal(result.warnings[0].code, 'server-management');
  assert.deepEqual(receivedTargets, [member, member]);
});
