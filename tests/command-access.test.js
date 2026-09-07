const assert = require('node:assert/strict');
const test = require('node:test');
const { ChannelType, Collection, PermissionFlagsBits } = require('discord.js');
const clearCommand = require('../src/commands/moderation/clear');
const diagnosticCommand = require('../src/commands/configuration/diagnostic');
const permissionsCommand = require('../src/commands/configuration/permissions');
const { deliverSetupResult } = require('../src/commands/configuration/setup');
const { commandErrorMessage } = require('../src/events/interactionCreate');

test('explique comment réparer un salon inaccessible', () => {
  assert.match(commandErrorMessage({ code: 50001 }), /permissions reparer-fyxbot/);
  assert.match(commandErrorMessage({ code: 50013 }), /permissions reparer-fyxbot/);
  assert.match(commandErrorMessage({ code: 10008 }), /reconstruit/);
});

test('publie la réparation ciblée dans la commande permissions', () => {
  const payload = permissionsCommand.data.toJSON();
  const repair = payload.options.find((option) => option.name === 'reparer-fyxbot');
  assert.ok(repair);
  assert.equal(repair.options.find((option) => option.name === 'salon').required, true);
});

test('répare uniquement la permission du membre FyxBot sur le salon choisi', async () => {
  let edited = null;
  let response = null;
  const channel = {
    id: 'channel',
    toString: () => '<#channel>',
    permissionOverwrites: {
      edit: async (id, permissions) => { edited = { id, permissions }; },
    },
  };
  const botMember = { id: 'bot', permissions: { has: () => true } };
  await permissionsCommand.execute({
    options: {
      getSubcommand: () => 'reparer-fyxbot',
      getChannel: () => channel,
    },
    guild: { members: { me: botMember } },
    user: { tag: 'Admin#0001' },
    reply: async (payload) => { response = payload; },
  });
  assert.equal(edited.id, 'bot');
  assert.equal(edited.permissions.ViewChannel, true);
  assert.equal(edited.permissions.SendMessages, true);
  assert.match(response.content, /autres rôles et permissions n’ont pas été modifiés/);
});

test('diagnostique les permissions, salons et rôles bloquants sans les modifier', () => {
  const granted = new Set([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
  ]);
  const permissionSet = (permissions) => ({
    has(required) {
      const values = Array.isArray(required) ? required : [required];
      return values.every((permission) => permissions.has(permission));
    },
  });
  const highestRole = { id: 'fyxbot-role', name: 'FyxBot', position: 5, managed: true };
  const blockedText = {
    id: 'blocked-text',
    type: ChannelType.GuildText,
    isThread: () => false,
    isTextBased: () => true,
    isVoiceBased: () => false,
    permissionsFor: () => permissionSet(new Set()),
  };
  const availableText = {
    id: 'available-text',
    type: ChannelType.GuildText,
    isThread: () => false,
    isTextBased: () => true,
    isVoiceBased: () => false,
    permissionsFor: () => permissionSet(granted),
  };
  const guild = {
    id: 'guild',
    channels: { cache: new Collection([[blockedText.id, blockedText], [availableText.id, availableText]]) },
    roles: {
      cache: new Collection([
        [highestRole.id, highestRole],
        ['staff', { id: 'staff', name: 'Staff', position: 8, managed: false }],
        ['member', { id: 'member', name: 'Membre', position: 2, managed: false }],
      ]),
    },
  };
  const botMember = {
    permissions: permissionSet(new Set([PermissionFlagsBits.ViewChannel])),
    roles: { highest: highestRole },
  };

  const report = diagnosticCommand.inspectGuild(guild, botMember);

  assert.equal(report.healthy, false);
  assert.equal(report.blockedTextChannels.length, 1);
  assert.equal(report.blockedTextChannels[0].id, 'blocked-text');
  assert.ok(report.missingServerPermissions.includes('Gérer les rôles'));
  assert.deepEqual(report.rolesAboveBot.map((role) => role.id), ['staff']);
});

test('publie /diagnostic comme contrôle privé réservé aux gestionnaires du serveur', () => {
  const payload = diagnosticCommand.data.toJSON();
  assert.equal(payload.name, 'diagnostic');
  assert.equal(payload.default_member_permissions, PermissionFlagsBits.ManageGuild.toString());
});

test('arrête /clear avant Discord lorsque FyxBot ne peut pas lire le salon', async () => {
  let reply = null;
  let deferred = false;
  let deleted = false;
  await clearCommand.execute({
    options: { getInteger: () => 10 },
    channel: {
      isTextBased: () => true,
      bulkDelete: async () => { deleted = true; },
      permissionsFor: () => ({ has: () => false }),
    },
    guild: { members: { me: { id: 'bot' } } },
    reply: async (payload) => { reply = payload; },
    deferReply: async () => { deferred = true; },
  });
  assert.match(reply.content, /permissions reparer-fyxbot/);
  assert.equal(deferred, false);
  assert.equal(deleted, false);
});

test('dépose le résultat du setup dans le nouveau salon quand l’ancien a été supprimé', async () => {
  let sent = null;
  const fallback = {
    id: 'new-logs',
    name: '📝・logs-fyxbot',
    isTextBased: () => true,
    permissionsFor: () => ({ has: () => true }),
    send: async (payload) => { sent = payload; return payload; },
  };
  const user = { id: 'user', toString: () => '<@user>', send: async () => null };
  const result = await deliverSetupResult({
    editReply: async () => { throw Object.assign(new Error('Unknown Message'), { code: 10008 }); },
    guild: {
      name: 'Serveur test',
      members: { me: { id: 'bot' } },
      channels: { cache: new Collection([[fallback.id, fallback]]) },
    },
    user,
  }, '✅ Reconstruction terminée.', [fallback]);
  assert.equal(result, sent);
  assert.equal(sent.content, '<@user> ✅ Reconstruction terminée.');
});
