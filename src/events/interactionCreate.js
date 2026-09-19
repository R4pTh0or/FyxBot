const { Events, MessageFlags } = require('discord.js');
const { handleTicketButton } = require('../services/tickets');
const { handleRoleButton } = require('../services/roleButtons');
const { handleRulesButton } = require('../services/rules');
const { scheduleInteractionCleanup } = require('../services/interactionCleanup');
const { recordCommandUsage } = require('../database/commandUsageStore');
const { GIVEAWAY_BUTTON_PREFIX, handleGiveawayButton } = require('../services/communityGiveaways');
const { FOUNDER_CLAIM_BUTTON_ID, handlePremiumButton } = require('../services/premiumInteractions');
const logger = require('../services/logger').logger.child({ component: 'interaction' });

function logInteractionError(error, message, interaction, details = {}) {
  logger.error({
    err: error,
    commandName: interaction?.commandName || null,
    customId: interaction?.customId || null,
    guildId: interaction?.guildId || null,
    userId: interaction?.user?.id || null,
    ...details,
  }, message);
}

async function recordUsageSafely(interaction, succeeded) {
  try {
    await recordCommandUsage(interaction.guildId, interaction.commandName, succeeded);
  } catch (error) {
    logger.warn({ err: error, guildId: interaction.guildId, commandName: interaction.commandName },
      '[FyxBot] Statistique de commande indisponible.');
  }
}

function commandErrorMessage(error) {
  if ([50001, 50013].includes(Number(error?.code))) {
    return 'FyxBot n’a pas accès au salon ou à l’action demandée. Depuis un salon accessible, utilisez `/permissions reparer-fyxbot salon:` ou vérifiez la position du rôle FyxBot.';
  }
  if (Number(error?.code) === 10008) {
    return 'Le message de réponse n’existe plus, généralement parce que son salon vient d’être reconstruit. Vérifiez le nouveau salon de logs FyxBot.';
  }
  return error?.userMessage || 'Une erreur est survenue pendant l’exécution de cette commande.';
}

async function sendCommandError(interaction, content) {
  try {
    const response = { content, flags: MessageFlags.Ephemeral };
    if (interaction.deferred && !interaction.replied) return await interaction.editReply({ content });
    if (interaction.replied) return await interaction.followUp(response);
    return await interaction.reply(response);
  } catch (responseError) {
    if (Number(responseError?.code) !== 10008) {
      logInteractionError(responseError, '[FyxBot] Réponse d’erreur impossible.', interaction);
    }
    return null;
  }
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    const scheduleCleanup = (delayMs) => scheduleInteractionCleanup(interaction, {
      ephemeralOnly: false,
      ...(Number.isFinite(delayMs) ? { delayMs } : {}),
    });

    if (interaction.isButton() && interaction.customId === 'rules:accept') {
      try {
        await handleRulesButton(interaction);
      } catch (error) {
        logInteractionError(error, '[FyxBot] Erreur d’acceptation du règlement.', interaction);
        const response = { content: 'Une erreur est survenue pendant la validation du règlement.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse règlement impossible.', interaction));
        } else {
          await interaction.reply(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse règlement impossible.', interaction));
        }
      }
      scheduleCleanup();
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('role:toggle:')) {
      try {
        await handleRoleButton(interaction);
      } catch (error) {
        logInteractionError(error, '[FyxBot] Erreur de rôle.', interaction);
        const response = { content: 'Une erreur est survenue pendant la modification du rôle.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse rôle impossible.', interaction));
        } else {
          await interaction.reply(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse rôle impossible.', interaction));
        }
      }
      scheduleCleanup();
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith('ticket:')) {
      try {
        await handleTicketButton(interaction);
      } catch (error) {
        logInteractionError(error, '[FyxBot] Erreur de ticket.', interaction);
        const response = { content: 'Une erreur est survenue avec ce ticket.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse ticket impossible.', interaction));
        } else {
          await interaction.reply(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse ticket impossible.', interaction));
        }
      }
      scheduleCleanup();
      return;
    }

    if (interaction.isButton() && interaction.customId.startsWith(GIVEAWAY_BUTTON_PREFIX)) {
      try {
        await handleGiveawayButton(interaction);
      } catch (error) {
        logInteractionError(error, '[FyxBot] Erreur de concours.', interaction);
        const response = { content: 'Une erreur est survenue avec ce concours.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse concours impossible.', interaction));
        } else {
          await interaction.reply(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse concours impossible.', interaction));
        }
      }
      scheduleCleanup();
      return;
    }

    if (interaction.isButton() && interaction.customId === FOUNDER_CLAIM_BUTTON_ID) {
      try {
        await handlePremiumButton(interaction);
      } catch (error) {
        logInteractionError(error, '[FyxBot] Erreur d’activation Premium.', interaction);
        const response = { content: error.userMessage || 'L’activation Premium est momentanément indisponible.', flags: MessageFlags.Ephemeral };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse Premium impossible.', interaction));
        } else {
          await interaction.reply(response).catch((responseError) => logInteractionError(responseError, '[FyxBot] Réponse Premium impossible.', interaction));
        }
      }
      scheduleCleanup();
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) {
      logger.warn({ commandName: interaction.commandName, guildId: interaction.guildId }, '[FyxBot] Commande inconnue.');
      return;
    }
    const subcommand = interaction.options.getSubcommand?.(false) || null;
    const preserveReply = command.preserveReplySubcommands?.includes(subcommand) === true;

    const requiredPermissions = command.data.toJSON().default_member_permissions;
    if (requiredPermissions && !interaction.memberPermissions?.has(BigInt(requiredPermissions))) {
      await interaction.reply({ content: 'Vous n’avez pas les permissions Discord nécessaires pour cette commande.', flags: MessageFlags.Ephemeral });
      scheduleCleanup();
      return;
    }

    try {
      await command.execute(interaction);
      await recordUsageSafely(interaction, true);
      if (!preserveReply) scheduleCleanup(command.cleanupDelayMs);
    } catch (error) {
      await recordUsageSafely(interaction, false);
      logInteractionError(error, '[FyxBot] Erreur pendant l’exécution d’une commande.', interaction);
      await sendCommandError(interaction, commandErrorMessage(error));
      scheduleCleanup();
    }
  },
};

module.exports.commandErrorMessage = commandErrorMessage;
module.exports.sendCommandError = sendCommandError;
