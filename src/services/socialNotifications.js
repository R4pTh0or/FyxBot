const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

function validateSocialUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:') throw new Error('Le lien doit utiliser HTTPS.');
    return url.toString();
  } catch (error) {
    throw new Error(error.message === 'Le lien doit utiliser HTTPS.' ? error.message : 'Indiquez un lien social HTTPS valide.');
  }
}

function socialNotificationPayload({ type, platform, creator, title, url, roleId = null }) {
  const safeUrl = validateSocialUrl(url);
  const isLive = type === 'live';
  const embed = new EmbedBuilder()
    .setColor(isLive ? 0xed4245 : 0xf97316)
    .setTitle(isLive ? `🔴 ${creator} est en direct !` : `🎬 Nouvelle vidéo de ${creator}`)
    .setDescription(`**${title}**\n\nRetrouvez ce contenu sur **${platform}**.`)
    .setURL(safeUrl)
    .setFooter({ text: 'FyxBot • Notification sociale' })
    .setTimestamp();
  const components = [new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel(isLive ? 'Rejoindre le live' : 'Voir la vidéo')
      .setStyle(ButtonStyle.Link)
      .setURL(safeUrl),
  )];
  return {
    content: roleId ? `<@&${roleId}>` : undefined,
    embeds: [embed],
    components,
    allowedMentions: { roles: roleId ? [roleId] : [] },
  };
}

module.exports = { socialNotificationPayload, validateSocialUrl };
