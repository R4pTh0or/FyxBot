require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  REST,
  Routes,
} = require('discord.js');
const { getConfig } = require('../src/config');

const REQUIRED_GUILD_PERMISSIONS = Object.freeze({
  viewChannels: PermissionFlagsBits.ViewChannel,
  sendMessages: PermissionFlagsBits.SendMessages,
  readHistory: PermissionFlagsBits.ReadMessageHistory,
  embedLinks: PermissionFlagsBits.EmbedLinks,
  manageMessages: PermissionFlagsBits.ManageMessages,
  manageChannels: PermissionFlagsBits.ManageChannels,
  manageRoles: PermissionFlagsBits.ManageRoles,
  moderateMembers: PermissionFlagsBits.ModerateMembers,
  createEvents: PermissionFlagsBits.CreateEvents,
});

async function main() {
  const config = getConfig({ requireClientId: true });
  const rest = new REST({ version: '10' }).setToken(config.token);
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  try {
    const globalCommands = await rest.get(Routes.applicationCommands(config.clientId));
    await client.login(config.token);
    const guilds = [];
    for (const cachedGuild of client.guilds.cache.values()) {
      const guild = await cachedGuild.fetch();
      const [channels, localCommands] = await Promise.all([
        guild.channels.fetch(),
        rest.get(Routes.applicationGuildCommands(config.clientId, guild.id)),
      ]);
      const botMember = guild.members.me || await guild.members.fetchMe();
      const textChannels = [...channels.values()].filter((channel) => channel?.isTextBased?.() && !channel.isThread?.());
      const writable = textChannels.filter((channel) => channel.permissionsFor(botMember)?.has([
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
      ]));
      const inaccessible = textChannels.filter((channel) => !channel.permissionsFor(botMember)?.has(PermissionFlagsBits.ViewChannel));
      guilds.push({
        id: guild.id,
        name: guild.name,
        localCommandCount: localCommands.length,
        permissions: Object.fromEntries(Object.entries(REQUIRED_GUILD_PERMISSIONS)
          .map(([name, permission]) => [name, botMember.permissions.has(permission)])),
        textChannels: textChannels.length,
        writableTextChannels: writable.length,
        writableExamples: writable.slice(0, 5).map((channel) => channel.name),
        inaccessibleTextChannels: inaccessible.length,
        inaccessibleExamples: inaccessible.slice(0, 5).map((channel) => channel.name),
      });
    }
    console.log(JSON.stringify({
      globalCommandCount: globalCommands.length,
      globalCommands: globalCommands.map((command) => command.name).sort(),
      guilds: guilds.sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    }, null, 2));
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error('[FyxBot][Diagnostic commandes]', {
    name: error?.name || null,
    code: error?.code || null,
    status: error?.status || null,
    message: error?.message || String(error),
  });
  process.exitCode = 1;
});
