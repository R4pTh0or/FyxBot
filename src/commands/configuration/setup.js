const { EmbedBuilder, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const { buildAdaptiveBlueprint } = require('../../services/adaptiveServerBlueprint');
const {
  getServerSetupBlueprint,
  saveServerSetupDraft,
} = require('../../database/serverSetupStore');
const {
  backupServer,
  listServerBackups,
  restoreServer,
} = require('../../services/serverBackup');
const { analyzeServerStructure, resetServer, setupServer } = require('../../services/serverSetup');
const { logAction } = require('../../services/logs');

const RECOMMENDATIONS = Object.freeze({
  complete: 'La proposition peut compléter le serveur sans supprimer les éléments existants.',
  synchronize: 'La structure existe ; certaines permissions peuvent être corrigées.',
  hierarchy: 'Placez le rôle FyxBot au-dessus des rôles signalés avant de continuer.',
  review: 'La proposition est applicable. Les éléments supplémentaires seront conservés sauf reconstruction.',
  ready: 'Le serveur correspond déjà à la proposition.',
});

function compactList(values, empty = 'Aucun', maximum = 8) {
  if (!values?.length) return empty;
  const visible = values.slice(0, maximum).join(', ');
  return values.length > maximum ? `${visible}… (+${values.length - maximum})` : visible;
}

function compactLines(values, empty = 'Aucune explication disponible', maximum = 6) {
  if (!values?.length) return empty;
  const visible = values.slice(0, maximum).join('\n');
  const suffix = values.length > maximum ? `\n… et ${values.length - maximum} autre(s) catégorie(s).` : '';
  return `${visible}${suffix}`.slice(0, 1024);
}

function blueprintEmbed(guild, blueprint, analysis) {
  const textChannels = blueprint.channels.filter((channel) => channel.type !== 'voice').map((channel) => `#${channel.name}`);
  const voiceChannels = blueprint.channels.filter((channel) => channel.type === 'voice').map((channel) => `🔊 ${channel.name}`);
  return new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(`✨ Proposition personnalisée pour ${guild.name}`)
    .setDescription(`**Votre description**\n${blueprint.description}\n\nFyxBot a détecté : **${blueprint.detectedNeeds.join(', ')}**.`)
    .addFields(
      { name: `Rôles · ${blueprint.roles.length}`, value: compactList(blueprint.roles.map((role) => role.name), 'Aucun', 12) },
      { name: `Catégories · ${blueprint.categories.length}`, value: compactList(blueprint.categories.map((category) => category.name), 'Aucune', 10) },
      { name: `Salons texte · ${textChannels.length}`, value: compactList(textChannels, 'Aucun', 12) },
      { name: `Salons vocaux · ${voiceChannels.length}`, value: compactList(voiceChannels, 'Aucun', 8) },
      {
        name: 'Pourquoi cette organisation ?',
        value: compactLines((blueprint.explanations || []).map((item) => `**${item.name}** — ${item.reason}`)),
      },
      { name: 'Impact sur le serveur actuel', value: `${analysis.totals.missing} élément(s) à créer · ${analysis.totals.permissionIssues} permission(s) à corriger · ${analysis.totals.extras} élément(s) existant(s) conservé(s).` },
      { name: 'Étape suivante', value: '`/setup completer` conserve tout · `/setup synchroniser` répare aussi les permissions · `/setup reconstruire` sauvegarde puis recrée.' },
    )
    .setFooter({ text: 'Ceci est seulement un aperçu : aucune modification n’a été effectuée.' })
    .setTimestamp();
}

function analysisEmbed(guild, analysis) {
  const blueprint = analysis.blueprint;
  return new EmbedBuilder()
    .setColor(analysis.recommendation === 'ready' ? 0x57f287 : 0xf97316)
    .setTitle(`🔎 Analyse de ${guild.name}`)
    .setDescription(`${RECOMMENDATIONS[analysis.recommendation]}\n\n**Projet décrit :** ${blueprint.description}`)
    .addFields(
      { name: 'Éléments manquants', value: `${analysis.totals.missing}\n${compactList([...analysis.missingRoles, ...analysis.missingCategories, ...analysis.missingChannels, ...analysis.misplacedChannels])}` },
      { name: 'Permissions à corriger', value: `${analysis.totals.permissionIssues}\n${compactList(analysis.permissionIssues)}` },
      { name: 'Éléments supplémentaires conservés', value: `${analysis.totals.extras}\n${compactList([...analysis.extraRoles, ...analysis.extraCategories, ...analysis.extraChannels])}` },
      { name: 'Modifier la proposition', value: 'Relancez `/setup concevoir description:...` avec votre nouvelle description. Rien ne sera appliqué avant confirmation.' },
    )
    .setFooter({ text: 'Une sauvegarde automatique est créée avant chaque application.' })
    .setTimestamp();
}

const MISSING_BLUEPRINT_MESSAGE = 'Commencez par `/setup concevoir description:...` pour décrire librement votre serveur et voir l’aperçu.';

async function replyMissingBlueprint(interaction) {
  return interaction.reply({ content: MISSING_BLUEPRINT_MESSAGE, flags: MessageFlags.Ephemeral });
}

function canReceiveSetupResult(channel, botMember) {
  if (!channel?.isTextBased?.() || typeof channel.send !== 'function') return false;
  const permissions = channel.permissionsFor?.(botMember);
  return permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ]) === true;
}

async function deliverSetupResult(interaction, content, preferredChannels = []) {
  try {
    return await interaction.editReply(content);
  } catch (error) {
    if (![10003, 10008].includes(Number(error?.code))) throw error;
  }

  const botMember = interaction.guild.members.me;
  const candidates = [
    ...preferredChannels,
    ...interaction.guild.channels.cache
      .filter((channel) => ['logs', 'changelog', 'commandes-bot'].some((name) => channel.name?.includes(name)))
      .values(),
    ...interaction.guild.channels.cache.values(),
  ];
  const target = candidates.find((channel, index) => channel
    && candidates.findIndex((candidate) => candidate?.id === channel.id) === index
    && canReceiveSetupResult(channel, botMember));
  if (target) {
    return target.send({
      content: `${interaction.user} ${content}`,
      allowedMentions: { users: [interaction.user.id], roles: [], repliedUser: false },
    });
  }

  return interaction.user.send(`**${interaction.guild.name}**\n${content}`).catch(() => null);
}

function mention(value) {
  return value ? String(value) : 'non demandé dans la description';
}

module.exports = {
  preserveReplySubcommands: ['analyser', 'apercu', 'concevoir', 'sauvegardes'],
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Conçoit, analyse, applique ou restaure une structure de serveur sur mesure.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((subcommand) => subcommand
      .setName('concevoir')
      .setDescription('Décrivez librement votre serveur pour obtenir une proposition sans rien modifier.')
      .addStringOption((option) => option
        .setName('description')
        .setDescription('Exemple : serveur Minecraft survie avec recrutement, tickets et salons vocaux')
        .setMaxLength(1000)
        .setRequired(true)))
    .addSubcommand((subcommand) => subcommand.setName('analyser').setDescription('Compare le serveur à votre dernière proposition personnalisée.'))
    .addSubcommand((subcommand) => subcommand
      .setName('apercu')
      .setNameLocalization('fr', 'aperçu')
      .setDescription('Réaffiche la dernière proposition sans rien modifier.'))
    .addSubcommand((subcommand) => subcommand
      .setName('completer')
      .setDescription('Crée les éléments proposés qui sont absents, sans rien supprimer.')
      .addStringOption((option) => option.setName('confirmation').setDescription('Écrivez COMPLETER').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('synchroniser')
      .setDescription('Applique la proposition et corrige toutes ses permissions.')
      .addStringOption((option) => option.setName('confirmation').setDescription('Écrivez SYNCHRONISER').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('lancer')
      .setDescription('Ancien raccourci : applique et synchronise la proposition sans supprimer.')
      .addStringOption((option) => option.setName('confirmation').setDescription('Écrivez CONFIRMER').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('reconstruire')
      .setDescription('Sauvegarde, supprime les éléments gérables et applique la proposition.')
      .addStringOption((option) => option.setName('confirmation').setDescription('Écrivez TOUT SUPPRIMER').setRequired(true)))
    .addSubcommand((subcommand) => subcommand
      .setName('sauvegardes')
      .setDescription('Affiche les sauvegardes disponibles pour revenir en arrière.'))
    .addSubcommand((subcommand) => subcommand
      .setName('restaurer')
      .setDescription('Restaure une sauvegarde ; la version actuelle est sauvegardée avant.')
      .addStringOption((option) => option.setName('confirmation').setDescription('Écrivez RESTAURER').setRequired(true))
      .addStringOption((option) => option.setName('sauvegarde').setDescription('Nom du fichier ; laissez vide pour la plus récente.'))),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand === 'concevoir') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const blueprint = buildAdaptiveBlueprint(interaction.options.getString('description', true), { guildName: interaction.guild.name });
      await saveServerSetupDraft(interaction.guild.id, blueprint);
      const analysis = await analyzeServerStructure(interaction.guild, {}, blueprint);
      return interaction.editReply({ embeds: [blueprintEmbed(interaction.guild, blueprint, analysis)] });
    }

    if (subcommand === 'analyser' || subcommand === 'apercu') {
      const blueprint = await getServerSetupBlueprint(interaction.guild.id);
      if (!blueprint) return replyMissingBlueprint(interaction);
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const analysis = await analyzeServerStructure(interaction.guild, {}, blueprint);
      const embed = subcommand === 'apercu'
        ? blueprintEmbed(interaction.guild, blueprint, analysis)
        : analysisEmbed(interaction.guild, analysis);
      return interaction.editReply({ embeds: [embed] });
    }

    if (subcommand === 'sauvegardes') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const backups = await listServerBackups(interaction.guild.id);
      if (backups.length === 0) return interaction.editReply('Aucune sauvegarde n’est encore disponible pour ce serveur.');
      const lines = backups.slice(0, 10).map((backup, index) => {
        const date = backup.createdAt ? new Date(backup.createdAt).toLocaleString('fr-FR') : 'date inconnue';
        return `**${index + 1}.** \`${backup.filename}\`\n${date} · ${backup.roles} rôle(s) · ${backup.channels} salon(s)`;
      });
      return interaction.editReply({
        embeds: [new EmbedBuilder()
          .setColor(0xf97316)
          .setTitle(`💾 Sauvegardes de ${interaction.guild.name}`)
          .setDescription(`${lines.join('\n\n')}\n\nPour revenir à la plus récente : \`/setup restaurer confirmation:RESTAURER\`.`)
          .setFooter({ text: 'Une sauvegarde de sécurité supplémentaire est créée juste avant la restauration.' })],
      });
    }

    if (subcommand === 'restaurer') {
      if (interaction.options.getString('confirmation', true) !== 'RESTAURER') {
        return interaction.reply({ content: 'Confirmation incorrecte. Écrivez exactement **RESTAURER**.', flags: MessageFlags.Ephemeral });
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const result = await restoreServer(interaction.guild, interaction.options.getString('sauvegarde'));
      await logAction(interaction.guild, {
        title: '⏪ Serveur restauré',
        description: `La sauvegarde ${result.restoredFile} a été restaurée par ${interaction.user}.`,
        color: 0xf97316,
      });
      return deliverSetupResult(interaction, `✅ Retour en arrière terminé : **${result.createdRoles} rôle(s)** et **${result.createdChannels} salon(s)** restaurés.\n💾 Une sauvegarde de sécurité de l’état précédent a été conservée : \`${result.safetyBackupFile}\`.`);
    }

    const confirmations = {
      completer: 'COMPLETER',
      synchroniser: 'SYNCHRONISER',
      lancer: 'CONFIRMER',
      reconstruire: 'TOUT SUPPRIMER',
    };
    const expected = confirmations[subcommand];
    if (interaction.options.getString('confirmation', true) !== expected) {
      return interaction.reply({ content: `Confirmation incorrecte. Écrivez exactement **${expected}**.`, flags: MessageFlags.Ephemeral });
    }

    const blueprint = await getServerSetupBlueprint(interaction.guild.id);
    if (!blueprint) return replyMissingBlueprint(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const destructive = subcommand === 'reconstruire';
    const backupFile = destructive ? null : await backupServer(interaction.guild);
    const result = destructive
      ? await resetServer(interaction.guild, { blueprint })
      : await setupServer(interaction.guild, { blueprint, synchronizePermissions: subcommand !== 'completer' });
    await logAction(interaction.guild, {
      title: destructive ? '♻️ Serveur reconstruit' : '🔥 Proposition appliquée',
      description: `${destructive ? 'La structure a été reconstruite' : 'La proposition personnalisée a été appliquée'} par ${interaction.user}.`,
      color: 0xf97316,
    });
    const permissionNotice = result.limitedAdminRoles
      ? '\n⚠️ Les rôles de direction utilisent les permissions disponibles sans la permission Administrateur.'
      : '';
    const deletionNotice = destructive
      ? `\n🗑️ ${result.deletedChannels} salon(s) et ${result.deletedRoles} rôle(s) supprimés après sauvegarde.`
      : '';
    const saved = result.backupFile || backupFile;
    return deliverSetupResult(
      interaction,
      `✅ Opération terminée : **${result.created} créé(s)** et **${result.updated} corrigé(s)**.${deletionNotice}\n💾 Retour arrière disponible : \`${saved}\`.\nChangelog : ${mention(result.changelogChannel)} · Logs : ${mention(result.logChannel)} · Tickets : ${mention(result.ticketChannel)}${permissionNotice}`,
      [result.logChannel, result.changelogChannel, result.ticketChannel],
    );
  },
};

module.exports.analysisEmbed = analysisEmbed;
module.exports.blueprintEmbed = blueprintEmbed;
module.exports.canReceiveSetupResult = canReceiveSetupResult;
module.exports.deliverSetupResult = deliverSetupResult;
