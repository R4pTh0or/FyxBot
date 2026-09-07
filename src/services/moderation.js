const { MessageFlags } = require('discord.js');

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

function canModerate(interaction, target) {
  if (target.id === interaction.user.id) return 'Vous ne pouvez pas vous modérer vous-même.';
  if (target.id === interaction.guild.ownerId) return 'Le propriétaire du serveur ne peut pas être modéré.';
  if (interaction.member.roles.highest.comparePositionTo(target.roles.highest) <= 0) {
    return 'Votre rôle doit être placé au-dessus de celui de ce membre.';
  }
  return null;
}

function auditReason(interaction, reason) {
  return `${reason} | Modérateur : ${interaction.user.tag} (${interaction.user.id})`.slice(0, 512);
}

module.exports = { auditReason, canModerate, ephemeral };
