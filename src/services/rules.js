const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');
const { getRulesConfig, setRulesConfig } = require('../database/rulesStore');

const ACCEPT_RULES_BUTTON_ID = 'rules:accept';

const RULE_TEMPLATES = Object.freeze({
  communautaire: [
    '**1. Respect et bienveillance**\nLes insultes, le harcèlement, les discriminations et les provocations ne sont pas acceptés.',
    '**2. Contenus autorisés**\nPubliez dans les salons adaptés et évitez le spam, la publicité non autorisée et les contenus choquants.',
    '**3. Vie privée**\nNe partagez aucune information personnelle, conversation privée ou donnée appartenant à un autre membre.',
    '**4. Modération**\nRespectez les décisions du staff. Utilisez le support pour contester calmement une décision.',
  ].join('\n\n'),
  gaming: [
    '**1. Fair-play**\nJouez honnêtement et restez respectueux avec vos coéquipiers comme avec vos adversaires.',
    '**2. Salons adaptés**\nUtilisez les salons et canaux vocaux correspondant à votre jeu ou à votre équipe.',
    '**3. Triche et commerce**\nLa triche, les arnaques, les ventes non autorisées et le partage de comptes sont interdits.',
    '**4. Ambiance**\nLe spam sonore, les cris volontaires et les comportements destinés à gâcher une partie sont interdits.',
  ].join('\n\n'),
  minecraft: [
    '**1. Respect des joueurs**\nLes insultes, menaces, discriminations et provocations répétées sont interdites.',
    '**2. Jeu équitable**\nLa triche, les clients interdits, l’exploitation de bugs et le contournement des sanctions sont interdits.',
    '**3. Constructions et ressources**\nLe grief, le vol et la destruction sans autorisation sont interdits, sauf règle contraire du mode de jeu.',
    '**4. Échanges**\nLes arnaques, ventes contre de l’argent réel et publicités non autorisées sont interdites.',
  ].join('\n\n'),
  createur: [
    '**1. Échanges respectueux**\nLes critiques doivent rester constructives. Le harcèlement et les attaques personnelles sont interdits.',
    '**2. Partage de contenu**\nUtilisez les salons prévus et ne publiez pas de publicité ou de contenu protégé sans autorisation.',
    '**3. Lives et événements**\nRespectez les consignes du créateur, des modérateurs et des invités pendant les événements.',
    '**4. Sécurité**\nNe partagez jamais de données privées, de clés, de mots de passe ou de liens trompeurs.',
  ].join('\n\n'),
});

function rulesPayload(config) {
  const embed = new EmbedBuilder()
    .setColor(0xf97316)
    .setTitle(`📜 ${config.title || 'Règlement du serveur'}`)
    .setDescription(config.content)
    .setFooter({ text: 'FyxBot • Règlement communautaire' })
    .setTimestamp();
  const components = config.verifiedRoleId
    ? [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(ACCEPT_RULES_BUTTON_ID)
        .setLabel('J’accepte le règlement')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success),
    )]
    : [];
  return { embeds: [embed], components };
}

async function publishRules(guild, channel, config) {
  const message = await channel.send(rulesPayload(config));
  const stored = {
    ...config,
    channelId: channel.id,
    messageId: message.id,
    updatedAt: new Date().toISOString(),
  };
  await setRulesConfig(guild.id, stored);
  return stored;
}

async function updateRulesMessage(guild, config) {
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  const message = channel?.isTextBased()
    ? await channel.messages.fetch(config.messageId).catch(() => null)
    : null;
  if (!message) throw new Error('Le message du règlement est introuvable. Publiez un nouveau règlement.');
  await message.edit(rulesPayload(config));
  const stored = { ...config, updatedAt: new Date().toISOString() };
  await setRulesConfig(guild.id, stored);
  return stored;
}

async function handleRulesButton(interaction) {
  if (interaction.customId !== ACCEPT_RULES_BUTTON_ID) return false;
  const config = await getRulesConfig(interaction.guildId);
  if (!config?.verifiedRoleId) {
    await interaction.reply({ content: 'Ce règlement ne possède plus de rôle de validation.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const role = await interaction.guild.roles.fetch(config.verifiedRoleId).catch(() => null);
  if (!role || role.managed || interaction.guild.members.me.roles.highest.comparePositionTo(role) <= 0) {
    await interaction.reply({ content: 'FyxBot ne peut pas attribuer le rôle de validation. Prévenez un administrateur.', flags: MessageFlags.Ephemeral });
    return true;
  }
  if (interaction.member.roles.cache.has(role.id)) {
    await interaction.reply({ content: `Vous avez déjà accepté le règlement et possédez ${role}.`, flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.member.roles.add(role, 'Règlement FyxBot accepté');
  await interaction.reply({ content: `✅ Règlement accepté. Le rôle ${role} vous a été attribué.`, flags: MessageFlags.Ephemeral });
  return true;
}

module.exports = {
  ACCEPT_RULES_BUTTON_ID,
  RULE_TEMPLATES,
  handleRulesButton,
  publishRules,
  rulesPayload,
  updateRulesMessage,
};
