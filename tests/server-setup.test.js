const assert = require('node:assert/strict');
const test = require('node:test');
const { Collection, PermissionFlagsBits, PermissionsBitField } = require('discord.js');
const {
  DEFAULT_BIRTHDAY_MESSAGE,
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  configuredMessage,
} = require('../src/services/defaultMessages');
const { scheduleInteractionCleanup } = require('../src/services/interactionCleanup');
const { buildAdaptiveBlueprint } = require('../src/services/adaptiveServerBlueprint');
const { remapConfigurationIds } = require('../src/services/serverBackup');
const {
  analyzeServerStructure,
  CATEGORY_DEFINITIONS,
  CHANNEL_DEFINITIONS,
  normalizedBlueprintName,
  permissionOverwritesMatch,
  permissionProfiles,
  resolveMemberAccessRole,
  ROLE_DEFINITIONS,
  rulesTemplateForBlueprint,
  runtimeBlueprint,
  synchronizedRolePermissionBits,
} = require('../src/services/serverSetup');
const { RULE_TEMPLATES } = require('../src/services/rules');
const { renderTemplate } = require('../src/services/welcome');

test('fournit les messages par défaut pour l’accueil, le départ et les anniversaires', () => {
  assert.match(DEFAULT_WELCOME_MESSAGE, /\{membre\}/);
  assert.match(DEFAULT_LEAVE_MESSAGE, /\{serveur\}/);
  assert.match(DEFAULT_BIRTHDAY_MESSAGE, /\{membres\}/);
  assert.equal(configuredMessage('   ', DEFAULT_BIRTHDAY_MESSAGE), DEFAULT_BIRTHDAY_MESSAGE);
  const member = {
    toString: () => '<@123>',
    guild: { name: 'FyxBot Développement', memberCount: 42 },
  };
  assert.equal(renderTemplate(undefined, member), 'Bienvenue <@123> sur **FyxBot Développement** ! Tu es notre **42e membre** 🎉');
  assert.equal(renderTemplate(undefined, member, DEFAULT_LEAVE_MESSAGE), '**<@123>** a quitté **FyxBot Développement**. Nous sommes maintenant **42 membres**.');
});

test('supprime automatiquement une réponse éphémère après le délai prévu', async () => {
  let callback = null;
  let delay = null;
  let unrefCalled = false;
  let deleted = 0;
  const interaction = {
    ephemeral: true,
    replied: true,
    deferred: false,
    deleteReply: async () => { deleted += 1; },
  };
  const scheduled = scheduleInteractionCleanup(interaction, {
    delayMs: 250,
    setTimer(fn, value) {
      callback = fn;
      delay = value;
      return { unref() { unrefCalled = true; } };
    },
  });
  assert.equal(scheduled, true);
  assert.equal(delay, 250);
  assert.equal(unrefCalled, true);
  callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deleted, 1);
  assert.equal(scheduleInteractionCleanup({ ...interaction, ephemeral: false }), false);

  callback = null;
  const publicInteraction = { ...interaction, ephemeral: false };
  assert.equal(scheduleInteractionCleanup(publicInteraction, {
    ephemeralOnly: false,
    setTimer(fn) {
      callback = fn;
      return { unref() {} };
    },
  }), true);
  callback();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deleted, 2);
});

test('normalise les noms FyxBot et compare les permissions de catégorie', () => {
  assert.equal(normalizedBlueprintName('🛡️ Modérateur'), 'modérateur');
  assert.equal(normalizedBlueprintName('🛠️・changelog'), 'changelog');
  assert.equal(CHANNEL_DEFINITIONS.find((definition) => definition.key === 'changelog').name, '🛠️・changelog');
  assert.equal(normalizedBlueprintName('  📌 ACCUEIL  '), 'accueil');
  const channel = {
    permissionOverwrites: {
      cache: new Collection([
        ['everyone', {
          id: 'everyone',
          allow: new PermissionsBitField([PermissionFlagsBits.ViewChannel]),
          deny: new PermissionsBitField([PermissionFlagsBits.SendMessages]),
        }],
      ]),
    },
  };
  assert.equal(permissionOverwritesMatch(channel, [{
    id: 'everyone',
    allow: [PermissionFlagsBits.ViewChannel],
    deny: [PermissionFlagsBits.SendMessages],
  }]), true);
  assert.equal(permissionOverwritesMatch(channel, [{ id: 'everyone', allow: [PermissionFlagsBits.SendMessages] }]), false);
});

test('adapte automatiquement les permissions à ACCUEIL, aux membres vérifiés et au STAFF', () => {
  const everyone = { id: 'guild-a', name: '@everyone' };
  const member = { id: 'role-member', name: '👤 Membre', managed: false };
  const moderator = { id: 'role-moderator', name: '🛡️ Modérateur', managed: false };
  const guild = {
    id: 'guild-a',
    roles: { everyone, cache: new Collection([[everyone.id, everyone], [member.id, member], [moderator.id, moderator]]) },
    members: { me: { id: 'bot-a' } },
  };
  const roles = { member, moderator };
  const definitions = [
    { key: 'member', staff: false },
    { key: 'moderator', staff: true },
  ];
  const profiles = permissionProfiles(guild, roles, definitions, member);
  const overwrite = (profile, id) => profiles[profile].find((item) => item.id === id);

  assert.ok(overwrite('publicReadOnly', everyone.id).allow.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(overwrite('publicReadOnly', everyone.id).deny.includes(PermissionFlagsBits.SendMessages));
  assert.ok(overwrite('memberCommunity', everyone.id).deny.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(overwrite('memberCommunity', member.id).allow.includes(PermissionFlagsBits.SendMessages));
  assert.ok(overwrite('memberReadOnly', member.id).deny.includes(PermissionFlagsBits.SendMessages));
  assert.ok(overwrite('staffOnly', everyone.id).deny.includes(PermissionFlagsBits.ViewChannel));
  assert.ok(overwrite('staffOnly', moderator.id).allow.includes(PermissionFlagsBits.ManageMessages));
});

test('relie les catégories membres au rôle attribué après le règlement', () => {
  const member = { id: 'role-member', managed: false };
  const verified = { id: 'role-verified', managed: false };
  const guild = {
    id: 'guild-a',
    roles: { cache: new Collection([[member.id, member], [verified.id, verified]]) },
  };
  assert.equal(resolveMemberAccessRole(guild, { member }, { verifiedRoleId: verified.id }), verified);
  assert.equal(resolveMemberAccessRole(guild, { member }, { verifiedRoleId: 'missing' }), member);
});

test('convertit les anciens profils publics enregistrés vers les permissions membres', () => {
  const legacy = runtimeBlueprint({
    roles: [{ key: 'member', name: '👤 Membre', permissions: [] }],
    categories: [
      { key: 'welcome', name: '📌 ACCUEIL', permissionProfile: 'publicReadOnly' },
      { key: 'community', name: '💬 COMMUNAUTÉ', permissionProfile: 'publicCommunity' },
      { key: 'support', name: '🎫 SUPPORT', permissionProfile: 'publicReadOnly' },
      { key: 'staff', name: '🔐 STAFF', permissionProfile: 'staffOnly' },
    ],
    channels: [
      { key: 'welcome', category: 'welcome', name: '👋・bienvenue', permissionProfile: 'inherit' },
      { key: 'general', category: 'community', name: '💬・general', permissionProfile: 'publicCommunity' },
      { key: 'tickets', category: 'support', name: '🎫・tickets', permissionProfile: 'publicReadOnly' },
    ],
  });
  assert.equal(legacy.categories.find((category) => category.key === 'welcome').profile, 'publicReadOnly');
  assert.equal(legacy.categories.find((category) => category.key === 'community').profile, 'memberCommunity');
  assert.equal(legacy.categories.find((category) => category.key === 'support').profile, 'memberReadOnly');
  assert.equal(legacy.categories.find((category) => category.key === 'staff').profile, 'staffOnly');
  assert.equal(legacy.channels.find((channel) => channel.key === 'general').profile, 'memberCommunity');
  assert.equal(legacy.channels.find((channel) => channel.key === 'tickets').profile, 'memberReadOnly');
});

test('choisit un règlement par défaut cohérent avec la description du serveur', () => {
  assert.equal(rulesTemplateForBlueprint({ description: 'Serveur Minecraft survie' }), RULE_TEMPLATES.minecraft);
  assert.equal(rulesTemplateForBlueprint({ description: 'Communauté pour une créatrice Twitch' }), RULE_TEMPLATES.createur);
  assert.equal(rulesTemplateForBlueprint({ description: 'Serveur esport et gaming' }), RULE_TEMPLATES.gaming);
  assert.equal(rulesTemplateForBlueprint({ description: 'Communauté générale' }), RULE_TEMPLATES.communautaire);
});

test('conçoit librement une structure adaptée et formate tous les salons avec un emoji', () => {
  const blueprint = buildAdaptiveBlueprint(
    'Je veux un serveur Minecraft survie avec une équipe de builders, des tickets, des suggestions et des salons vocaux temporaires.',
    { guildName: 'Projet test' },
  );
  assert.equal(blueprint.guildName, 'Projet test');
  assert.ok(blueprint.roles.some((role) => role.key === 'builder'));
  assert.ok(blueprint.roles.some((role) => role.key === 'support'));
  assert.ok(blueprint.channels.some((channel) => channel.key === 'gameStatus'));
  assert.ok(blueprint.channels.some((channel) => channel.key === 'privateVoiceHub' && channel.type === 'voice'));
  assert.ok(blueprint.channels.every((channel) => channel.name.includes('・')));
  assert.equal(blueprint.channels.find((channel) => channel.key === 'changelog').name, '🛠️・changelog');
  assert.equal(blueprint.categories.find((category) => category.key === 'welcome').permissionProfile, 'publicReadOnly');
  assert.equal(blueprint.categories.find((category) => category.key === 'staff').permissionProfile, 'staffOnly');
  assert.ok(blueprint.categories.filter((category) => !['welcome', 'staff'].includes(category.key))
    .every((category) => ['memberCommunity', 'memberReadOnly'].includes(category.permissionProfile)));
  assert.ok(blueprint.channels.filter((channel) => channel.category !== 'welcome')
    .every((channel) => channel.permissionProfile !== 'publicReadOnly'));
  assert.throws(() => buildAdaptiveBlueprint('trop court'), /au moins 20 caractères/);
});

test('remappe les identifiants de configuration lors d’un retour arrière', () => {
  const restored = remapConfigurationIds({ channelId: 'old-channel', nested: ['old-role', 'other'] }, new Map([
    ['old-channel', 'new-channel'],
    ['old-role', 'new-role'],
  ]));
  assert.deepEqual(restored, { channelId: 'new-channel', nested: ['new-role', 'other'] });
});

test('préserve les permissions que le bot ne peut pas gérer pendant la synchronisation', () => {
  const guild = {
    members: {
      me: {
        permissions: new PermissionsBitField([
          PermissionFlagsBits.ManageRoles,
          PermissionFlagsBits.ManageMessages,
          PermissionFlagsBits.KickMembers,
        ]),
      },
    },
  };
  const founder = {
    permissions: new PermissionsBitField([PermissionFlagsBits.Administrator]),
  };
  const founderDefinition = {
    permissions: [PermissionFlagsBits.Administrator],
    fallback: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.ManageMessages],
  };
  assert.equal(
    synchronizedRolePermissionBits(guild, founderDefinition, founder),
    PermissionFlagsBits.Administrator,
  );

  const support = {
    permissions: new PermissionsBitField([
      PermissionFlagsBits.ViewAuditLog,
      PermissionFlagsBits.KickMembers,
    ]),
  };
  const supportDefinition = { permissions: [PermissionFlagsBits.ManageMessages] };
  const synchronized = synchronizedRolePermissionBits(guild, supportDefinition, support);
  assert.equal((synchronized & PermissionFlagsBits.ViewAuditLog) !== 0n, true);
  assert.equal((synchronized & PermissionFlagsBits.ManageMessages) !== 0n, true);
  assert.equal((synchronized & PermissionFlagsBits.KickMembers) !== 0n, false);
});

test('analyse un serveur vide et recommande de compléter sans supprimer', async () => {
  const permissions = new PermissionsBitField([PermissionFlagsBits.Administrator]);
  const everyone = { id: 'guild-a', name: '@everyone', managed: false };
  const guild = {
    id: 'guild-a',
    members: { me: { id: 'bot-a', permissions } },
    roles: {
      everyone,
      cache: new Collection([[everyone.id, everyone]]),
      fetch: async () => null,
    },
    channels: {
      cache: new Collection(),
      fetch: async () => null,
    },
  };
  const analysis = await analyzeServerStructure(guild, { channels: true, roles: true });
  assert.equal(analysis.recommendation, 'complete');
  assert.equal(analysis.missingRoles.length, ROLE_DEFINITIONS.length);
  assert.equal(analysis.missingCategories.length, CATEGORY_DEFINITIONS.length);
  assert.equal(analysis.missingChannels.length, CHANNEL_DEFINITIONS.length);
  assert.equal(analysis.totals.missing, ROLE_DEFINITIONS.length + CATEGORY_DEFINITIONS.length + CHANNEL_DEFINITIONS.length);
});
