require('dotenv').config({ quiet: true });

const {
  ChannelType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require('discord.js');
const { getConfig } = require('../src/config');

const REQUIRED_TEXT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.SendPolls,
  PermissionFlagsBits.ManageMessages,
];

const BOT_ACCESS_OVERWRITE = Object.freeze({
  ViewChannel: true,
  SendMessages: true,
  ReadMessageHistory: true,
  EmbedLinks: true,
  AttachFiles: true,
  AddReactions: true,
  SendPolls: true,
  ManageMessages: true,
});

function argument(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function inaccessibleTextChannels(guild, botMember) {
  return guild.channels.cache.filter((channel) => channel.type !== ChannelType.GuildCategory
    && channel.isTextBased?.()
    && !channel.isThread?.()
    && !channel.permissionsFor(botMember, false)?.has(REQUIRED_TEXT_PERMISSIONS, false));
}

async function main() {
  const guildId = argument('guild-id');
  if (!/^\d{17,20}$/.test(String(guildId))) throw new Error('Utilisez --guild-id avec un identifiant Discord valide.');
  const confirmed = argument('confirm') === 'REPARER_FYXBOT';
  const config = getConfig();
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  try {
    await client.login(config.token);
    const guild = await client.guilds.fetch(guildId);
    await guild.channels.fetch();
    const botMember = guild.members.me || await guild.members.fetchMe();
    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('FyxBot ne dispose pas de la permission Gérer les rôles nécessaire à la réparation.');
    }

    const before = inaccessibleTextChannels(guild, botMember);
    const parentIds = new Set(before.map((channel) => channel.parentId).filter(Boolean));
    const categories = [...parentIds]
      .map((id) => guild.channels.cache.get(id))
      .filter((channel) => channel?.type === ChannelType.GuildCategory);

    if (!confirmed) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        guild: guild.name,
        inaccessibleTextChannels: before.size,
        categoriesToRepair: categories.map((channel) => channel.name),
        channelExamples: [...before.values()].slice(0, 10).map((channel) => channel.name),
      }, null, 2));
      return;
    }

    const repairedCategories = [];
    const repairedChannels = [];
    const failures = [];
    for (const category of categories) {
      try {
        await category.permissionOverwrites.edit(botMember.id, BOT_ACCESS_OVERWRITE, 'Accès commandes FyxBot réparé par le propriétaire');
        repairedCategories.push(category.name);
      } catch (error) {
        failures.push({ target: category.name, code: error.code || null, message: error.message });
      }
    }

    await guild.channels.fetch();
    const remainingAfterCategories = inaccessibleTextChannels(guild, botMember);
    for (const channel of remainingAfterCategories.values()) {
      try {
        await channel.permissionOverwrites.edit(botMember.id, BOT_ACCESS_OVERWRITE, 'Accès commandes FyxBot réparé par le propriétaire');
        repairedChannels.push(channel.name);
      } catch (error) {
        failures.push({ target: channel.name, code: error.code || null, message: error.message });
      }
    }

    await guild.channels.fetch();
    const remaining = inaccessibleTextChannels(guild, botMember);
    console.log(JSON.stringify({
      mode: 'applied',
      guild: guild.name,
      before: before.size,
      repairedCategories: repairedCategories.length,
      repairedChannels: repairedChannels.length,
      remaining: remaining.size,
      remainingChannels: [...remaining.values()].map((channel) => channel.name),
      failures,
    }, null, 2));
    if (remaining.size > 0 || failures.length > 0) process.exitCode = 2;
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  console.error('[FyxBot][Réparation accès]', {
    code: error?.code || null,
    message: error?.message || String(error),
  });
  process.exitCode = 1;
});
