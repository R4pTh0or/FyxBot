const { MessageFlags } = require('discord.js');
const { logAction } = require('./logs');
const { getRolePanelConfig } = require('../database/rolePanelStore');

const ROLE_BUTTON_PREFIX = 'role:toggle:';

function isRegisteredRolePanel(config, interaction, roleId) {
  const registered = config?.panels?.some((item) => item.messageId === interaction.message.id
    && item.channelId === interaction.channelId
    && item.roleIds?.includes(roleId));
  const legacySignedPanel = interaction.message.author?.id === interaction.client?.user?.id
    && interaction.message.embeds?.some((embed) => ['FyxBot • Rôles personnalisables', 'Nexora • Rôles personnalisables']
      .includes(embed.footer?.text))
    && interaction.message.components?.some((row) => row.components?.some((component) => component.customId === `${ROLE_BUTTON_PREFIX}${roleId}`));
  return Boolean(registered || legacySignedPanel);
}

async function handleRoleButton(interaction) {
  if (!interaction.customId.startsWith(ROLE_BUTTON_PREFIX)) return false;

  const roleId = interaction.customId.slice(ROLE_BUTTON_PREFIX.length);
  const config = await getRolePanelConfig(interaction.guildId);
  if (!isRegisteredRolePanel(config, interaction, roleId)) {
    await interaction.reply({ content: 'Ce bouton ne correspond plus à un panneau FyxBot actif.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
  if (!role) {
    await interaction.reply({ content: 'Ce rôle n’existe plus.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (role.managed || interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
    await interaction.reply({
      content: 'FyxBot ne peut pas gérer ce rôle. Placez le rôle FyxBot au-dessus dans la hiérarchie.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const hasRole = member.roles.cache.has(role.id);
  if (hasRole) {
    await member.roles.remove(role, 'Rôle retiré via le panneau FyxBot');
    await interaction.reply({ content: `➖ Le rôle ${role} vous a été retiré.`, flags: MessageFlags.Ephemeral });
  } else {
    await member.roles.add(role, 'Rôle ajouté via le panneau FyxBot');
    await interaction.reply({ content: `➕ Le rôle ${role} vous a été ajouté.`, flags: MessageFlags.Ephemeral });
  }

  await logAction(interaction.guild, {
    title: hasRole ? '➖ Rôle retiré' : '➕ Rôle ajouté',
    description: `${interaction.user} a ${hasRole ? 'retiré' : 'ajouté'} le rôle ${role} via un panneau.`,
    color: hasRole ? 0xed4245 : 0x57f287,
  });
  return true;
}

module.exports = { handleRoleButton, isRegisteredRolePanel, ROLE_BUTTON_PREFIX };
