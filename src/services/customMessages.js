const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

const DEFAULT_COLOR = 0xef4444;

function limitedText(value, maximum, label) {
  const text = String(value || '').trim();
  if (text.length > maximum) throw new Error(`${label} dépasse la limite de ${maximum} caractères.`);
  return text;
}

function optionalHttpsUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (text.length > 2000) throw new Error(`${label} est trop long.`);
  try {
    const url = new URL(text);
    if (url.protocol !== 'https:') throw new Error(`${label} doit utiliser HTTPS.`);
    return url.toString();
  } catch (error) {
    if (error.message === `${label} doit utiliser HTTPS.`) throw error;
    throw new Error(`${label} doit être une adresse HTTPS valide.`);
  }
}

function normalizeHexColor(value, fallback = DEFAULT_COLOR) {
  const text = String(value || '').trim().replace(/^#/, '');
  if (!text) return fallback;
  if (!/^[0-9a-f]{6}$/i.test(text)) throw new Error('La couleur doit utiliser le format #RRGGBB.');
  return Number.parseInt(text, 16);
}

function customMessagePayload(input = {}) {
  const mode = input.mode === 'changelog' ? 'changelog' : 'message';
  const content = limitedText(input.content, 2000, 'Le texte');
  const rawTitle = limitedText(input.title, mode === 'changelog' ? 250 : 256, 'Le titre');
  const title = mode === 'changelog' && rawTitle ? `◆ ${rawTitle}` : rawTitle;
  const description = limitedText(input.description, 4096, 'La description');
  const footer = limitedText(input.footer, 2048, 'Le pied de page');
  const version = limitedText(input.version, 100, 'La version');
  const environment = limitedText(input.environment, 100, 'L’environnement');
  const buttonLabel = limitedText(input.buttonLabel, 80, 'Le libellé du bouton');
  const imageUrl = optionalHttpsUrl(input.imageUrl, 'L’image');
  const thumbnailUrl = optionalHttpsUrl(input.thumbnailUrl, 'La miniature');
  const linkUrl = optionalHttpsUrl(input.linkUrl, 'Le lien');
  const color = normalizeHexColor(input.color);

  if (mode === 'changelog' && (!version || !rawTitle || !description)) {
    throw new Error('Un changelog nécessite une version, un titre et une description.');
  }

  const hasEmbed = Boolean(title || description || footer || imageUrl || thumbnailUrl || version || environment);
  if (!content && !hasEmbed) throw new Error('Ajoutez au moins du texte, un embed ou une image.');
  if (buttonLabel && !linkUrl) throw new Error('Ajoutez un lien HTTPS pour utiliser un bouton.');

  const payload = { allowedMentions: { parse: [] } };
  if (content) payload.content = content;

  if (hasEmbed) {
    const embed = new EmbedBuilder().setColor(color);
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (linkUrl && title) embed.setURL(linkUrl);
    if (imageUrl) embed.setImage(imageUrl);
    if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);
    if (footer) embed.setFooter({ text: footer });
    if (mode === 'changelog') {
      const fields = [
        { name: 'Version', value: version, inline: true },
        { name: 'Environnement', value: environment || 'production', inline: true },
      ];
      if (linkUrl) fields.push({ name: 'Changelog', value: `[Consulter les détails](${linkUrl})`, inline: false });
      embed.addFields(fields).setTimestamp();
    }
    payload.embeds = [embed];
  }

  if (linkUrl && (buttonLabel || !title)) {
    payload.components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel(buttonLabel || 'Ouvrir le lien')
        .setStyle(ButtonStyle.Link)
        .setURL(linkUrl),
    )];
  }
  return payload;
}

module.exports = {
  DEFAULT_COLOR,
  customMessagePayload,
  normalizeHexColor,
  optionalHttpsUrl,
};
