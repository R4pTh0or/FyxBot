const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const { PLANS, getGuildPremiumState } = require('../../services/premiumPlans');
const { FOUNDER_CLAIM_BUTTON_ID } = require('../../services/premiumInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Consulte ou active FyxBot Premium.')
    .addSubcommand((subcommand) => subcommand.setName('statut').setDescription('Affiche le forfait de ce serveur.'))
    .addSubcommand((subcommand) => subcommand.setName('offres').setDescription('Compare les offres Free et Premium.'))
    .addSubcommand((subcommand) => subcommand.setName('activer').setDescription('Active les 30 jours Fondateur gratuits sur ce serveur.')),

  preserveReplySubcommands: ['activer'],

  async execute(interaction) {
    const state = getGuildPremiumState(interaction.guildId, { userId: interaction.user.id });
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'statut') {
      const founderStatus = state.founder.userActive
        ? `Votre accès Fondateur expire le ${new Date(state.founder.endsAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${state.founder.linkedToGuild ? ' et il est appliqué à ce serveur.' : ', mais il n’est pas encore appliqué à ce serveur.'}`
        : state.founder.userExpired
          ? 'Votre accès Fondateur de 30 jours est terminé.'
          : `${state.founder.remaining} accès Fondateur restent disponibles.`;
      return interaction.reply({
        content: `💎 Forfait actuel : **${state.name}**. ${founderStatus} Aucun paiement ni renouvellement automatique.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === 'activer') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'La permission Gérer le serveur est requise.', flags: MessageFlags.Ephemeral });
      }
      if (state.plan === 'premium' && state.founder.linkedToGuild) {
        return interaction.reply({
          content: `✅ Premium est déjà actif sur ce serveur jusqu’au ${new Date(state.founder.endsAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}.`,
          flags: MessageFlags.Ephemeral,
        });
      }
      if (state.founder.userExpired || (!state.founder.userClaimed && !state.founder.available)) {
        return interaction.reply({
          content: state.founder.userExpired
            ? 'Votre accès Fondateur de 30 jours a déjà été utilisé et est terminé.'
            : 'Les 100 accès Fondateur ont déjà été attribués.',
          flags: MessageFlags.Ephemeral,
        });
      }
      const expectedExpiration = state.founder.endsAt
        ? new Date(state.founder.endsAt)
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const embed = new EmbedBuilder()
        .setColor(0xff5a2a)
        .setTitle('💎 Activer l’accès Fondateur FyxBot')
        .setDescription(`Compte concerné : **${interaction.user.username}**\nServeur concerné : **${interaction.guild.name}**`)
        .addFields(
          { name: 'Avantages', value: 'Tous les outils FyxBot, jusqu’à 25 panneaux de tickets, 25 panneaux de rôles et 10 sources sociales.' },
          { name: 'Expiration', value: expectedExpiration.toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) },
          { name: 'Après les 30 jours', value: 'Le serveur revient à Free. Les réglages existants restent conservés, mais aucune nouvelle ressource au-delà des limites Free ne pourra être créée.' },
        )
        .setFooter({ text: 'Aucune carte • Aucun renouvellement automatique • Aucun prélèvement' });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder()
        .setCustomId(FOUNDER_CLAIM_BUTTON_ID)
        .setLabel(state.founder.userActive ? 'Appliquer à ce serveur' : 'Activer gratuitement 30 jours')
        .setEmoji('💎')
        .setStyle(ButtonStyle.Success));
      return interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    }
    const embed = new EmbedBuilder()
      .setColor(0xff5a2a)
      .setTitle('💎 FyxBot Premium')
      .setDescription(`Les ${state.founder.limit} premiers utilisateurs peuvent activer 30 jours Premium gratuitement. **${state.founder.remaining} place(s) restante(s).**`)
      .addFields(Object.values(PLANS).map((plan) => ({
        name: plan.name,
        value: `${plan.description}\n${plan.features.map((feature) => `• ${feature}`).join('\n')}`,
        inline: false,
      })))
      .setFooter({ text: 'Sans carte • Sans renouvellement automatique' });
    return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  },
};
