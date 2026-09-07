const {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { getRulesConfig } = require('../../database/rulesStore');
const {
  RULE_TEMPLATES,
  publishRules,
  updateRulesMessage,
} = require('../../services/rules');

const REQUIRED_RULES_CHANNEL_PERMISSIONS = Object.freeze([
  [PermissionFlagsBits.ViewChannel, 'Voir le salon'],
  [PermissionFlagsBits.SendMessages, 'Envoyer des messages'],
  [PermissionFlagsBits.EmbedLinks, 'Intégrer des liens'],
  [PermissionFlagsBits.ReadMessageHistory, 'Voir les anciens messages'],
]);

function validatePublishChannel(guild, channel) {
  const permissions = channel.permissionsFor?.(guild.members.me);
  const missing = REQUIRED_RULES_CHANNEL_PERMISSIONS
    .filter(([permission]) => !permissions?.has(permission))
    .map(([, label]) => label);
  if (missing.length > 0) {
    throw new Error(`FyxBot ne peut pas publier dans ${channel}. Permissions manquantes : ${missing.join(', ')}.`);
  }
  return channel;
}

function validateRole(interaction, role) {
  if (!role) return null;
  if (role.managed || role.id === interaction.guild.id
    || interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
    throw new Error(`FyxBot ne peut pas attribuer ${role}. Placez son rôle au-dessus dans Discord.`);
  }
  return role;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('reglement')
    .setDescription('Crée et gère le règlement du serveur.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('publier')
      .setDescription('Publie un règlement personnalisé.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('titre').setDescription('Titre du règlement').setMaxLength(100).setRequired(true))
      .addStringOption((option) => option.setName('texte').setDescription('Articles du règlement').setMaxLength(3900).setRequired(true))
      .addRoleOption((option) => option.setName('role-verifie').setDescription('Rôle attribué après acceptation')))
    .addSubcommand((subcommand) => subcommand
      .setName('modele')
      .setDescription('Publie un modèle de règlement prêt à personnaliser.')
      .addChannelOption((option) => option.setName('salon').setDescription('Salon de publication').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption((option) => option.setName('type').setDescription('Type de communauté').setRequired(true)
        .addChoices(
          { name: 'Communautaire', value: 'communautaire' },
          { name: 'Gaming', value: 'gaming' },
          { name: 'Serveur Minecraft', value: 'minecraft' },
          { name: 'Créateur de contenu', value: 'createur' },
        ))
      .addRoleOption((option) => option.setName('role-verifie').setDescription('Rôle attribué après acceptation')))
    .addSubcommand((subcommand) => subcommand
      .setName('modifier')
      .setDescription('Modifie le règlement publié par FyxBot.')
      .addStringOption((option) => option.setName('titre').setDescription('Nouveau titre').setMaxLength(100))
      .addStringOption((option) => option.setName('texte').setDescription('Nouveau contenu').setMaxLength(3900))
      .addRoleOption((option) => option.setName('role-verifie').setDescription('Nouveau rôle attribué après acceptation')))
    .addSubcommand((subcommand) => subcommand.setName('statut').setDescription('Affiche la configuration du règlement.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'statut') {
      const config = await getRulesConfig(interaction.guildId);
      if (!config) return interaction.reply({ content: 'Aucun règlement FyxBot n’est configuré.', flags: MessageFlags.Ephemeral });
      return interaction.reply({
        content: `📜 **${config.title}** est publié dans <#${config.channelId}>.${config.verifiedRoleId ? ` Rôle de validation : <@&${config.verifiedRoleId}>.` : ''}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // Accuse réception avant les appels à l’API Discord et à la base de données.
    // Une interaction qui reste sans réponse plus de trois secondes expire.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (subcommand === 'modifier') {
      const current = await getRulesConfig(interaction.guildId);
      if (!current) return interaction.editReply({ content: 'Publiez d’abord un règlement avec `/reglement publier` ou `/reglement modele`.' });
      const title = interaction.options.getString('titre');
      const content = interaction.options.getString('texte');
      const role = validateRole(interaction, interaction.options.getRole('role-verifie'));
      if (!title && !content && !role) return interaction.editReply({ content: 'Indiquez au moins un élément à modifier.' });
      await updateRulesMessage(interaction.guild, {
        ...current,
        title: title || current.title,
        content: content || current.content,
        verifiedRoleId: role?.id || current.verifiedRoleId || null,
      });
      return interaction.editReply({ content: '✅ Le règlement a été mis à jour.' });
    }

    const channel = validatePublishChannel(interaction.guild, interaction.options.getChannel('salon', true));
    const role = validateRole(interaction, interaction.options.getRole('role-verifie'));
    const template = subcommand === 'modele' ? interaction.options.getString('type', true) : null;
    const config = {
      title: subcommand === 'modele' ? `Règlement ${interaction.guild.name}` : interaction.options.getString('titre', true),
      content: subcommand === 'modele' ? RULE_TEMPLATES[template] : interaction.options.getString('texte', true),
      verifiedRoleId: role?.id || null,
    };
    await publishRules(interaction.guild, channel, config);
    return interaction.editReply({ content: `✅ Règlement publié dans ${channel}.${role ? ` Le rôle ${role} sera attribué après acceptation.` : ''}` });
  },
};

module.exports.validatePublishChannel = validatePublishChannel;
