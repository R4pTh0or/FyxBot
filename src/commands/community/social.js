const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getSocialConfig, setSocialConfig } = require('../../database/socialStore');
const { normalizeSocialSource } = require('../../services/socialAutomation');
const { socialNotificationPayload } = require('../../services/socialNotifications');
const { assertPremiumLimit } = require('../../services/premiumPlans');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('social')
    .setDescription('Configure les notifications automatiques de lives et vidéos.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addSubcommand((subcommand) => subcommand
      .setName('configurer')
      .setDescription('Choisit le salon et le rôle à notifier.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon des notifications').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addRoleOption((option) => option.setName('role').setDescription('Rôle mentionné lors des notifications')))
    .addSubcommand((subcommand) => subcommand
      .setName('ajouter')
      .setDescription('Ajoute une chaîne YouTube ou Twitch à surveiller.')
      .addStringOption((option) => option.setName('plateforme').setDescription('Plateforme automatique').setRequired(true)
        .addChoices({ name: 'YouTube', value: 'youtube' }, { name: 'Twitch', value: 'twitch' }))
      .addStringOption((option) => option.setName('identifiant').setDescription('ID YouTube UC… ou nom de chaîne Twitch').setMaxLength(80).setRequired(true))
      .addStringOption((option) => option.setName('nom').setDescription('Nom affiché dans le panel').setMaxLength(80)))
    .addSubcommand((subcommand) => subcommand
      .setName('retirer')
      .setDescription('Arrête la surveillance d’une source sociale.')
      .addStringOption((option) => option.setName('source').setDescription('Identifiant affiché par /social sources').setMaxLength(120).setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('notifier')
      .setDescription('Annonce immédiatement un live ou une nouvelle vidéo.')
      .addStringOption((option) => option.setName('type').setDescription('Type de contenu').setRequired(true)
        .addChoices({ name: 'Lancement d’un live', value: 'live' }, { name: 'Nouvelle vidéo', value: 'video' }))
      .addStringOption((option) => option.setName('plateforme').setDescription('Plateforme').setRequired(true)
        .addChoices(
          { name: 'YouTube', value: 'YouTube' },
          { name: 'Twitch', value: 'Twitch' },
          { name: 'TikTok', value: 'TikTok' },
          { name: 'Instagram', value: 'Instagram' },
          { name: 'Kick', value: 'Kick' },
          { name: 'Autre', value: 'Autre plateforme' },
        ))
      .addStringOption((option) => option.setName('createur').setDescription('Nom du créateur').setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName('titre').setDescription('Titre du live ou de la vidéo').setMaxLength(250).setRequired(true))
      .addStringOption((option) => option.setName('lien').setDescription('Lien HTTPS du contenu').setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('sources').setDescription('Liste les chaînes surveillées.'))
    .addSubcommand((subcommand) => subcommand.setName('statut').setDescription('Affiche la configuration sociale.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const current = await getSocialConfig(interaction.guildId) || { sources: [] };
    const sources = Array.isArray(current.sources) ? current.sources : [];
    if (subcommand === 'statut') {
      return interaction.reply({
        content: current.channelId
          ? `📣 Notifications publiées dans <#${current.channelId}>${current.roleId ? ` avec <@&${current.roleId}>` : ''}. **${sources.length}** source(s) automatique(s).`
          : 'Les notifications sociales ne sont pas configurées.',
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === 'sources') {
      const content = sources.length
        ? sources.map((source) => `• \`${source.id}\` — **${source.label}** (${source.status || 'en attente'})`).join('\n')
        : 'Aucune source automatique. Utilisez `/social ajouter`.';
      return interaction.reply({ content: `📡 **Sources surveillées**\n${content}`, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'configurer') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'La permission Gérer le serveur est requise.', flags: MessageFlags.Ephemeral });
      }
      const channel = interaction.options.getChannel('salon', true);
      const role = interaction.options.getRole('role');
      await setSocialConfig(interaction.guildId, { ...current, channelId: channel.id, roleId: role?.id || null, sources, updatedAt: new Date().toISOString() });
      return interaction.reply({ content: `✅ Notifications sociales configurées dans ${channel}.`, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'ajouter') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'La permission Gérer le serveur est requise.', flags: MessageFlags.Ephemeral });
      }
      if (!current.channelId) return interaction.reply({ content: 'Configurez d’abord le salon avec `/social configurer`.', flags: MessageFlags.Ephemeral });
      const source = normalizeSocialSource({
        platform: interaction.options.getString('plateforme', true),
        identifier: interaction.options.getString('identifiant', true),
        label: interaction.options.getString('nom') || '',
      });
      if (sources.some((item) => item.id === source.id)) return interaction.reply({ content: 'Cette source est déjà surveillée.', flags: MessageFlags.Ephemeral });
      assertPremiumLimit(interaction.guildId, 'socialSources', sources.length);
      if (sources.length >= 10) return interaction.reply({ content: 'La limite technique actuelle est de 10 sources par serveur.', flags: MessageFlags.Ephemeral });
      await setSocialConfig(interaction.guildId, { ...current, sources: [...sources, source], updatedAt: new Date().toISOString() });
      return interaction.reply({ content: `✅ **${source.label}** sera vérifiée automatiquement. La première lecture n’enverra aucune ancienne publication.`, flags: MessageFlags.Ephemeral });
    }
    if (subcommand === 'retirer') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'La permission Gérer le serveur est requise.', flags: MessageFlags.Ephemeral });
      }
      const sourceId = interaction.options.getString('source', true);
      const filtered = sources.filter((source) => source.id !== sourceId);
      if (filtered.length === sources.length) return interaction.reply({ content: 'Source introuvable. Consultez `/social sources`.', flags: MessageFlags.Ephemeral });
      await setSocialConfig(interaction.guildId, { ...current, sources: filtered, updatedAt: new Date().toISOString() });
      return interaction.reply({ content: '✅ Surveillance supprimée.', flags: MessageFlags.Ephemeral });
    }
    if (!current.channelId) return interaction.reply({ content: 'Configurez d’abord le module avec `/social configurer`.', flags: MessageFlags.Ephemeral });
    const channel = await interaction.guild.channels.fetch(current.channelId).catch(() => null);
    if (!channel?.isTextBased()) return interaction.reply({ content: 'Le salon configuré n’existe plus.', flags: MessageFlags.Ephemeral });
    const payload = socialNotificationPayload({
      type: interaction.options.getString('type', true),
      platform: interaction.options.getString('plateforme', true),
      creator: interaction.options.getString('createur', true),
      title: interaction.options.getString('titre', true),
      url: interaction.options.getString('lien', true),
      roleId: current.roleId,
    });
    await channel.send(payload);
    return interaction.reply({ content: `✅ Notification publiée dans ${channel}.`, flags: MessageFlags.Ephemeral });
  },
};
