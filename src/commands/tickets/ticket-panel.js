const {
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { setTicketConfig } = require('../../database/ticketStore');
const { createPanelComponents } = require('../../services/tickets');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-panel')
    .setDescription('Configure et publie le panneau de tickets FyxBot.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addChannelOption((option) => option
      .setName('categorie')
      .setDescription('Catégorie dans laquelle créer les tickets')
      .addChannelTypes(ChannelType.GuildCategory)
      .setRequired(true))
    .addRoleOption((option) => option
      .setName('staff')
      .setDescription('Rôle autorisé à voir et gérer les tickets')
      .setRequired(true)),

  async execute(interaction) {
    const category = interaction.options.getChannel('categorie', true);
    const staffRole = interaction.options.getRole('staff', true);
    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({ content: 'Utilisez cette commande dans un salon textuel.', flags: MessageFlags.Ephemeral });
    }

    await setTicketConfig(interaction.guildId, {
      categoryId: category.id,
      staffRoleId: staffRole.id,
      panelChannelId: interaction.channelId,
      updatedAt: new Date().toISOString(),
    });

    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle('🎫 Assistance FyxBot')
      .setDescription('Vous avez besoin d’aide ? Cliquez sur le bouton ci-dessous pour ouvrir un ticket privé avec notre équipe.\n\nMerci de ne créer qu’un ticket par demande.')
      .setFooter({ text: 'FyxBot • Système de tickets' })
      .setTimestamp();
    await interaction.channel.send({ embeds: [embed], components: createPanelComponents() });
    return interaction.reply({ content: `✅ Panneau publié. Les tickets seront créés dans **${category.name}** pour le rôle ${staffRole}.`, flags: MessageFlags.Ephemeral });
  },
};
