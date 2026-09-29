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
const {
  configurePremiumRoles,
  disablePremiumRoles,
  getPremiumRoleConfiguration,
  syncPremiumRolesInGuild,
} = require('../../services/premiumRoles');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('premium')
    .setDescription('Consulte ou active FyxBot Premium.')
    .addSubcommand((subcommand) => subcommand.setName('statut').setDescription('Affiche le forfait de ce serveur.'))
    .addSubcommand((subcommand) => subcommand.setName('offres').setDescription('Compare les offres Free et Premium.'))
    .addSubcommand((subcommand) => subcommand.setName('activer').setDescription('Active les 30 jours Fondateur gratuits sur ce serveur.'))
    .addSubcommand((subcommand) => subcommand
      .setName('roles-configurer')
      .setDescription('Configure les rôles attribués automatiquement aux utilisateurs Premium.')
      .addRoleOption((option) => option
        .setName('role-premium')
        .setDescription('Rôle attribué aux abonnés Premium payants')
        .setRequired(true))
      .addRoleOption((option) => option
        .setName('role-offert')
        .setDescription('Rôle attribué aux essais et accès Premium offerts')
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('roles-desactiver')
      .setDescription('Désactive la synchronisation automatique des rôles Premium.')),

  preserveReplySubcommands: ['activer'],

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'roles-configurer') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'La permission Gérer le serveur est requise.', flags: MessageFlags.Ephemeral });
      }
      const paidRole = interaction.options.getRole('role-premium', true);
      const complimentaryRole = interaction.options.getRole('role-offert', true);
      const config = await configurePremiumRoles(interaction.guild, {
        paidRole,
        complimentaryRole,
        actorMember: interaction.member,
        actorIsOwner: interaction.guild.ownerId === interaction.user.id,
      });
      const sync = await syncPremiumRolesInGuild(interaction.guild, { config });
      return interaction.reply({
        content: `✅ Rôles Premium configurés : ${paidRole} pour les abonnements payants et ${complimentaryRole} pour les accès offerts. ${sync.added} rôle(s) ajouté(s), ${sync.removed} retiré(s).`,
        flags: MessageFlags.Ephemeral,
      });
    }
    if (subcommand === 'roles-desactiver') {
      if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return interaction.reply({ content: 'La permission Gérer le serveur est requise.', flags: MessageFlags.Ephemeral });
      }
      const result = await disablePremiumRoles(interaction.guild);
      return interaction.reply({
        content: `✅ Synchronisation des rôles Premium désactivée. ${result.removed} attribution(s) automatique(s) retirée(s)${result.failed ? `, ${result.failed} retrait(s) à vérifier manuellement` : ''}.`,
        flags: MessageFlags.Ephemeral,
      });
    }
    const state = await getGuildPremiumState(interaction.guildId, { userId: interaction.user.id });
    if (subcommand === 'statut') {
      const roleConfig = await getPremiumRoleConfiguration(interaction.guildId);
      const roleStatus = roleConfig.paidRoleId || roleConfig.complimentaryRoleId
        ? ` Rôles automatiques : ${roleConfig.paidRoleId ? `<@&${roleConfig.paidRoleId}>` : 'non configuré'} / ${roleConfig.complimentaryRoleId ? `<@&${roleConfig.complimentaryRoleId}>` : 'non configuré'}.`
        : '';
      const founderStatus = state.founder.userActive
        ? `Votre accès Fondateur expire le ${new Date(state.founder.endsAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}${state.founder.linkedToGuild ? ' et il est appliqué à ce serveur.' : ', mais il n’est pas encore appliqué à ce serveur.'}`
        : state.founder.userExpired
          ? 'Votre accès Fondateur de 30 jours est terminé.'
          : `${state.founder.remaining} accès Fondateur restent disponibles.`;
      return interaction.reply({
        content: `💎 Forfait actuel : **${state.name}**. ${founderStatus} Aucun paiement ni renouvellement automatique.${roleStatus}`,
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
