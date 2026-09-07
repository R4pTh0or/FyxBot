const {
  AutoModerationActionType,
  AutoModerationRuleEventType,
  AutoModerationRuleTriggerType,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getLogConfig } = require('../../database/logStore');
const { logAction } = require('../../services/logs');

const RULE_PREFIX = 'FyxBot • ';
const LEGACY_RULE_PREFIX = 'Nexora • ';

function isManagedRule(rule) {
  return [RULE_PREFIX, LEGACY_RULE_PREFIX]
    .some((prefix) => rule.name.startsWith(prefix));
}

function ruleLabel(name) {
  return name.replace(RULE_PREFIX, '').replace(LEGACY_RULE_PREFIX, '');
}

function baseActions(logChannelId, customMessage) {
  const actions = [{
    type: AutoModerationActionType.BlockMessage,
    metadata: { customMessage },
  }];
  if (logChannelId) {
    actions.push({
      type: AutoModerationActionType.SendAlertMessage,
      metadata: { channel: logChannelId },
    });
  }
  return actions;
}

function ruleDefinitions(logChannelId) {
  return [
    {
      name: `${RULE_PREFIX}Liens`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: { regexPatterns: ['https?://[^\\s]+', 'www\\.[^\\s]+'] },
      actions: baseActions(logChannelId, 'Les liens ne sont pas autorisés sur ce serveur.'),
    },
    {
      name: `${RULE_PREFIX}Invitations`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Keyword,
      triggerMetadata: {
        keywordFilter: ['*discord.gg/*', '*discord.com/invite/*', '*discordapp.com/invite/*'],
      },
      actions: baseActions(logChannelId, 'Les invitations Discord ne sont pas autorisées.'),
    },
    {
      name: `${RULE_PREFIX}Spam`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.Spam,
      actions: baseActions(logChannelId, 'Ce message a été identifié comme du spam.'),
    },
    {
      name: `${RULE_PREFIX}Mentions`,
      eventType: AutoModerationRuleEventType.MessageSend,
      triggerType: AutoModerationRuleTriggerType.MentionSpam,
      triggerMetadata: { mentionTotalLimit: 5, mentionRaidProtectionEnabled: true },
      actions: [
        ...baseActions(logChannelId, 'Vous mentionnez trop de membres.'),
        { type: AutoModerationActionType.Timeout, metadata: { durationSeconds: 60 } },
      ],
    },
  ];
}

module.exports = {
  LEGACY_RULE_PREFIX,
  RULE_PREFIX,
  ruleDefinitions,
  data: new SlashCommandBuilder()
    .setName('securite')
    .setDescription('Configure la protection AutoMod FyxBot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('activer')
      .setDescription('Active les protections contre liens, invitations et spam.')
      .addRoleOption((option) => option.setName('role-exempte').setDescription('Rôle autorisé à contourner les filtres'))
      .addChannelOption((option) => option
        .setName('salon-exempte')
        .setDescription('Salon non filtré')
        .addChannelTypes(ChannelType.GuildText)))
    .addSubcommand((subcommand) => subcommand
      .setName('desactiver')
      .setDescription('Désactive toutes les règles AutoMod créées par FyxBot.'))
    .addSubcommand((subcommand) => subcommand
      .setName('statut')
      .setDescription('Affiche l’état des protections FyxBot.')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const subcommand = interaction.options.getSubcommand();
    const rules = await interaction.guild.autoModerationRules.fetch();
    const fyxbotRules = rules.filter(isManagedRule);

    if (subcommand === 'statut') {
      const embed = new EmbedBuilder()
        .setColor(fyxbotRules.some((rule) => rule.enabled) ? 0x57f287 : 0xed4245)
        .setTitle('🛡️ Sécurité FyxBot')
        .setDescription(fyxbotRules.size === 0
          ? 'Aucune protection FyxBot n’est configurée.'
          : fyxbotRules.map((rule) => `${rule.enabled ? '✅' : '⛔'} **${ruleLabel(rule.name)}**`).join('\n'))
        .setFooter({ text: 'FyxBot • AutoMod Discord' })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'desactiver') {
      await Promise.all(fyxbotRules.map((rule) => rule.edit({ enabled: false, reason: `Sécurité désactivée par ${interaction.user.tag}` })));
      await logAction(interaction.guild, {
        title: '🛡️ Sécurité désactivée',
        description: `Les règles AutoMod FyxBot ont été désactivées par ${interaction.user}.`,
        color: 0xed4245,
      });
      return interaction.editReply(`⛔ ${fyxbotRules.size} règle(s) de sécurité désactivée(s).`);
    }

    const exemptRole = interaction.options.getRole('role-exempte');
    const exemptChannel = interaction.options.getChannel('salon-exempte');
    const logConfig = await getLogConfig(interaction.guildId);
    const definitions = ruleDefinitions(logConfig?.channelId || null);
    const results = [];

    for (const definition of definitions) {
      const legacyName = definition.name.replace(RULE_PREFIX, LEGACY_RULE_PREFIX);
      const existing = fyxbotRules.find((rule) => [definition.name, legacyName].includes(rule.name));
      const settings = {
        ...definition,
        enabled: true,
        exemptRoles: exemptRole ? [exemptRole.id] : [],
        exemptChannels: exemptChannel ? [exemptChannel.id] : [],
        reason: `Sécurité activée par ${interaction.user.tag}`,
      };
      if (existing) {
        results.push(await existing.edit({
          name: definition.name,
          triggerMetadata: definition.triggerMetadata,
          actions: definition.actions,
          enabled: true,
          exemptRoles: settings.exemptRoles,
          exemptChannels: settings.exemptChannels,
          reason: settings.reason,
        }));
      } else {
        results.push(await interaction.guild.autoModerationRules.create(settings));
      }
    }

    await logAction(interaction.guild, {
      title: '🛡️ Sécurité activée',
      description: `Les protections contre les liens, invitations, spam et mentions excessives ont été activées par ${interaction.user}.`,
      color: 0x57f287,
    });
    return interaction.editReply(`✅ ${results.length} protections AutoMod sont actives.`);
  },
};
