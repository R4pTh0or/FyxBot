const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { randomUUID } = require('node:crypto');
const { getRolePanelConfig, setRolePanelConfig } = require('../../database/rolePanelStore');
const { ROLE_BUTTON_PREFIX } = require('../../services/roleButtons');
const { assertPremiumLimit } = require('../../services/premiumPlans');

function addOptionalRole(command, index, required = false) {
  return command.addRoleOption((option) => option
    .setName(`role${index}`)
    .setDescription(`Rôle ${index} proposé dans le panneau`)
    .setRequired(required));
}

let builder = new SlashCommandBuilder()
  .setName('role-panel')
  .setDescription('Publie un panneau de rôles accessibles par boutons.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((option) => option
    .setName('titre')
    .setDescription('Titre du panneau')
    .setRequired(true)
    .setMaxLength(100));

builder = addOptionalRole(builder, 1, true)
  .addStringOption((option) => option
    .setName('description')
    .setDescription('Instructions affichées aux membres')
    .setMaxLength(1000));

for (let index = 2; index <= 5; index += 1) {
  builder = addOptionalRole(builder, index);
}

module.exports = {
  data: builder,

  async execute(interaction) {
    const roles = [];
    for (let index = 1; index <= 5; index += 1) {
      const role = interaction.options.getRole(`role${index}`);
      if (role) roles.push(role);
    }

    if (new Set(roles.map((role) => role.id)).size !== roles.length) {
      return interaction.reply({ content: 'Un même rôle ne peut pas apparaître plusieurs fois.', flags: MessageFlags.Ephemeral });
    }
    const invalidRole = roles.find((role) => role.id === interaction.guild.id || role.managed
      || interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0);
    if (invalidRole) {
      return interaction.reply({
        content: `FyxBot ne peut pas gérer ${invalidRole}. Placez son rôle au-dessus et vérifiez que le rôle choisi n’est pas géré par une intégration.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (!interaction.channel?.isTextBased()) {
      return interaction.reply({ content: 'Utilisez cette commande dans un salon textuel.', flags: MessageFlags.Ephemeral });
    }
    const current = await getRolePanelConfig(interaction.guildId);
    assertPremiumLimit(interaction.guildId, 'rolePanels', current?.panels?.length || 0);

    const embed = new EmbedBuilder()
      .setColor(0xf97316)
      .setTitle(interaction.options.getString('titre', true))
      .setDescription(interaction.options.getString('description') || 'Cliquez sur un bouton pour ajouter ou retirer le rôle correspondant.')
      .addFields({ name: 'Rôles disponibles', value: roles.map((role) => `• ${role}`).join('\n') })
      .setFooter({ text: 'FyxBot • Rôles personnalisables' })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(roles.map((role, index) => new ButtonBuilder()
      .setCustomId(`${ROLE_BUTTON_PREFIX}${role.id}`)
      .setLabel(role.name.slice(0, 80))
      .setStyle(index % 2 === 0 ? ButtonStyle.Primary : ButtonStyle.Secondary)));

    const message = await interaction.channel.send({ embeds: [embed], components: [row] });
    const panel = {
      id: randomUUID().split('-')[0],
      title: interaction.options.getString('titre', true),
      description: interaction.options.getString('description') || 'Cliquez sur un bouton pour ajouter ou retirer le rôle correspondant.',
      channelId: interaction.channelId,
      messageId: message.id,
      roleIds: roles.map((role) => role.id),
      updatedAt: new Date().toISOString(),
    };
    await setRolePanelConfig(interaction.guildId, {
      panels: [...(current?.panels || []), panel],
      updatedAt: panel.updatedAt,
    });
    return interaction.reply({ content: `✅ Panneau publié avec ${roles.length} rôle(s).`, flags: MessageFlags.Ephemeral });
  },
};
