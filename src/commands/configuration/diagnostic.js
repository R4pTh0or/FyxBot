const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');

const REQUIRED_SERVER_PERMISSIONS = [
  ['Voir les salons', PermissionFlagsBits.ViewChannel],
  ['Envoyer des messages', PermissionFlagsBits.SendMessages],
  ['Lire l’historique', PermissionFlagsBits.ReadMessageHistory],
  ['Intégrer des liens', PermissionFlagsBits.EmbedLinks],
  ['Joindre des fichiers', PermissionFlagsBits.AttachFiles],
  ['Ajouter des réactions', PermissionFlagsBits.AddReactions],
  ['Gérer les messages', PermissionFlagsBits.ManageMessages],
  ['Gérer les salons', PermissionFlagsBits.ManageChannels],
  ['Gérer le serveur', PermissionFlagsBits.ManageGuild],
  ['Gérer les rôles', PermissionFlagsBits.ManageRoles],
  ['Voir les logs du serveur', PermissionFlagsBits.ViewAuditLog],
  ['Expulser des membres', PermissionFlagsBits.KickMembers],
  ['Bannir des membres', PermissionFlagsBits.BanMembers],
  ['Exclure temporairement', PermissionFlagsBits.ModerateMembers],
  ['Créer des sondages', PermissionFlagsBits.SendPolls],
  ['Créer des événements', PermissionFlagsBits.CreateEvents],
  ['Se connecter aux vocaux', PermissionFlagsBits.Connect],
  ['Parler dans les vocaux', PermissionFlagsBits.Speak],
  ['Déplacer des membres', PermissionFlagsBits.MoveMembers],
];

const REQUIRED_TEXT_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

const REQUIRED_VOICE_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Connect,
];

function hasPermissions(permissions, required) {
  return permissions?.has(required, false) === true;
}

function inspectGuild(guild, botMember) {
  const missingServerPermissions = REQUIRED_SERVER_PERMISSIONS
    .filter(([, permission]) => !hasPermissions(botMember.permissions, permission))
    .map(([label]) => label);

  const blockedTextChannels = [];
  const blockedVoiceChannels = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildCategory || channel.isThread?.()) continue;
    const permissions = channel.permissionsFor?.(botMember, false);
    if (channel.isTextBased?.() && !hasPermissions(permissions, REQUIRED_TEXT_PERMISSIONS)) {
      blockedTextChannels.push(channel);
    } else if (channel.isVoiceBased?.() && !hasPermissions(permissions, REQUIRED_VOICE_PERMISSIONS)) {
      blockedVoiceChannels.push(channel);
    }
  }

  const highestRole = botMember.roles.highest;
  const rolesAboveBot = guild.roles.cache
    .filter((role) => role.id !== guild.id
      && role.id !== highestRole.id
      && !role.managed
      && role.position >= highestRole.position)
    .sort((left, right) => right.position - left.position);
  const administrator = hasPermissions(botMember.permissions, PermissionFlagsBits.Administrator);

  return {
    administrator,
    blockedTextChannels,
    blockedVoiceChannels,
    highestRole,
    missingServerPermissions,
    rolesAboveBot: [...rolesAboveBot.values()],
    healthy: missingServerPermissions.length === 0
      && blockedTextChannels.length === 0
      && blockedVoiceChannels.length === 0,
  };
}

function channelExamples(channels) {
  if (channels.length === 0) return 'Aucun';
  const examples = channels.slice(0, 8).map((channel) => `<#${channel.id}>`).join(', ');
  return channels.length > 8 ? `${examples} et ${channels.length - 8} autre(s)` : examples;
}

function roleExamples(roles) {
  if (roles.length === 0) return 'Aucun rôle non géré ne bloque la hiérarchie.';
  const examples = roles.slice(0, 8).map((role) => `<@&${role.id}>`).join(', ');
  const suffix = roles.length > 8 ? ` et ${roles.length - 8} autre(s)` : '';
  return `${examples}${suffix}\nPlacez le rôle FyxBot au-dessus des rôles que le bot doit attribuer ou modérer.`;
}

function buildDiagnosticEmbed(guild, report) {
  const issues = report.missingServerPermissions.length
    + report.blockedTextChannels.length
    + report.blockedVoiceChannels.length;
  const status = report.healthy
    ? '✅ Les permissions principales de FyxBot sont opérationnelles.'
    : `⚠️ ${issues} problème(s) d’accès détecté(s).`;
  const administratorWarning = report.administrator
    ? '\n⚠️ La permission **Administrateur** est active alors que FyxBot est conçu pour fonctionner sans elle.'
    : '';

  return new EmbedBuilder()
    .setColor(report.healthy ? 0x57f287 : 0xf97316)
    .setTitle('🔎 Diagnostic FyxBot')
    .setDescription(`${status}${administratorWarning}`)
    .addFields(
      {
        name: 'Permissions du rôle',
        value: report.missingServerPermissions.length === 0
          ? '✅ Toutes les permissions nécessaires sont présentes.'
          : `❌ Manquantes : ${report.missingServerPermissions.join(', ')}`,
      },
      {
        name: `Salons textuels bloqués · ${report.blockedTextChannels.length}`,
        value: channelExamples(report.blockedTextChannels),
      },
      {
        name: `Salons vocaux bloqués · ${report.blockedVoiceChannels.length}`,
        value: channelExamples(report.blockedVoiceChannels),
      },
      {
        name: `Hiérarchie · rôle le plus haut : ${report.highestRole.name}`,
        value: roleExamples(report.rolesAboveBot),
      },
    )
    .setFooter({ text: `FyxBot • ${guild.name} • Diagnostic sans modification` })
    .setTimestamp();
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('diagnostic')
    .setDescription('Vérifie les permissions, salons et hiérarchie de FyxBot sans rien modifier.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await interaction.guild.channels.fetch();
    const botMember = interaction.guild.members.me || await interaction.guild.members.fetchMe();
    const report = inspectGuild(interaction.guild, botMember);
    await interaction.editReply({ embeds: [buildDiagnosticEmbed(interaction.guild, report)] });
  },

  buildDiagnosticEmbed,
  inspectGuild,
};
