require('dotenv').config({ quiet: true });

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { getConfig } = require('../src/config');
const { getServerSetupBlueprint } = require('../src/database/serverSetupStore');
const {
  analyzeServerStructure,
  grantableRolePermissions,
  normalizedBlueprintName,
  runtimeBlueprint,
  setupServer,
} = require('../src/services/serverSetup');
const { backupServer } = require('../src/services/serverBackup');

function argument(name, fallback = null) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

async function main() {
  const config = getConfig();
  const guildName = argument('guild-name', 'FyxBot Développement');
  const mode = argument('mode', 'analyze');
  const listOnly = process.argv.includes('--list');
  const permissionsOnly = process.argv.includes('--permissions-only');
  const confirmation = argument('confirm', '');
  if (!['analyze', 'complete', 'synchronize'].includes(mode)) {
    throw new Error('Mode autorisé : analyze, complete ou synchronize. La reconstruction destructive est volontairement exclue de ce test.');
  }
  const expected = mode === 'complete' ? 'COMPLETER' : mode === 'synchronize' ? 'SYNCHRONISER' : '';
  if (expected && confirmation !== expected) throw new Error(`Ajoutez --confirm ${expected} pour modifier le serveur de test.`);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    console.error('[FyxBot][Test setup] Connexion à Discord…');
    await client.login(config.token);
    console.error('[FyxBot][Test setup] Lecture des serveurs…');
    const availableGuilds = (await Promise.all(client.guilds.cache.map((item) => item.fetch().catch(() => null)))).filter(Boolean);
    if (listOnly) {
      console.log(JSON.stringify({ guilds: availableGuilds.map((item) => item.name).sort() }, null, 2));
      return;
    }
    const guild = availableGuilds.find((item) => item.name === guildName);
    if (!guild) throw new Error(`Serveur introuvable : ${guildName}.`);
    const fullGuild = await guild.fetch();
    const botMember = fullGuild.members.me;
    if (permissionsOnly) {
      const channels = await fullGuild.channels.fetch();
      const visibleChannels = [...channels.values()]
        .filter(Boolean)
        .sort((left, right) => left.rawPosition - right.rawPosition)
        .map((channel) => {
          const permissions = channel.permissionsFor(botMember);
          return {
            name: channel.name,
            type: channel.type,
            view: permissions?.has('ViewChannel') || false,
            sendMessages: permissions?.has('SendMessages') || false,
            embedLinks: permissions?.has('EmbedLinks') || false,
            attachFiles: permissions?.has('AttachFiles') || false,
            sendPolls: permissions?.has('SendPolls') || false,
            manageChannels: permissions?.has('ManageChannels') || false,
          };
        });
      console.log(JSON.stringify({
        guild: { id: fullGuild.id, name: fullGuild.name, members: fullGuild.memberCount },
        bot: {
          highestRole: botMember.roles.highest.name,
          highestRolePosition: botMember.roles.highest.position,
          administrator: botMember.permissions.has('Administrator'),
          manageRoles: botMember.permissions.has('ManageRoles'),
          manageChannels: botMember.permissions.has('ManageChannels'),
        },
        channels: visibleChannels,
      }, null, 2));
      return;
    }
    const blueprint = await getServerSetupBlueprint(fullGuild.id);
    if (!blueprint) throw new Error('Aucune proposition personnalisée. Utilisez d’abord /setup concevoir sur Discord ou la zone de description du panel.');
    const desired = runtimeBlueprint(blueprint);
    const before = await analyzeServerStructure(fullGuild, {}, blueprint);
    const roleDiagnostics = desired.roles.map((definition) => {
      const role = fullGuild.roles.cache.find((item) => !item.managed
        && normalizedBlueprintName(item.name) === normalizedBlueprintName(definition.name));
      if (!role) return { name: definition.name, found: false };
      return {
        name: role.name,
        found: true,
        position: role.position,
        editable: role.editable,
        currentPermissions: role.permissions.toArray().sort(),
        desiredPermissions: new PermissionsBitField(
          grantableRolePermissions(fullGuild, definition.permissions, definition.fallback),
        ).toArray().sort(),
      };
    });
    let operation = null;
    let backupFile = null;
    if (mode !== 'analyze') {
      backupFile = await backupServer(fullGuild);
      operation = await setupServer(fullGuild, { blueprint, synchronizePermissions: mode === 'synchronize' });
    }
    const after = mode === 'analyze' ? before : await analyzeServerStructure(fullGuild, {}, blueprint);
    console.log(JSON.stringify({
      guild: { id: guild.id, name: guild.name },
      bot: {
        highestRole: botMember.roles.highest.name,
        highestRolePosition: botMember.roles.highest.position,
        administrator: botMember.permissions.has('Administrator'),
        manageRoles: botMember.permissions.has('ManageRoles'),
        manageChannels: botMember.permissions.has('ManageChannels'),
      },
      roleDiagnostics,
      mode,
      backupFile,
      operation: operation ? { created: operation.created, updated: operation.updated } : null,
      before,
      after,
    }, null, 2));
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error('[FyxBot][Test setup]', {
    name: error?.name || null,
    code: error?.code || null,
    status: error?.status || null,
    message: error?.message || String(error),
    stack: error?.stack || null,
  });
  process.exitCode = 1;
});
