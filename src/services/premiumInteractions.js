const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const { claimFounderAccess } = require('./premiumFounderAccess');
const { syncPremiumRolesForUser } = require('./premiumRoles');
const logger = require('./logger').logger.child({ component: 'premium-interaction' });

const FOUNDER_CLAIM_BUTTON_ID = 'premium:founder:claim';

async function handlePremiumButton(interaction) {
  if (interaction.customId !== FOUNDER_CLAIM_BUTTON_ID) return false;
  if (!interaction.guildId || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: 'La permission Gérer le serveur est requise pour activer Premium sur ce serveur.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  const result = await claimFounderAccess(interaction.user.id, interaction.guildId);
  await syncPremiumRolesForUser(interaction.client, interaction.user.id).catch((error) => {
    logger.error({ err: error, userId: interaction.user.id }, '[FyxBot] Attribution du rôle Premium offert impossible après activation Fondateur.');
  });
  const expiration = new Date(result.endsAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
  await interaction.update({
    content: `✅ **FyxBot Premium est actif sur ce serveur jusqu’au ${expiration}.**\nAucun moyen de paiement n’a été demandé et aucun abonnement ne sera lancé automatiquement.`,
    embeds: [],
    components: [],
  });
  return true;
}

module.exports = { FOUNDER_CLAIM_BUTTON_ID, handlePremiumButton };
