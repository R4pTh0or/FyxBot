const { ChannelType } = require('discord.js');

const emojiRules = [
  { emoji: '📌', words: ['accueil', 'information', 'infos', 'reglement', 'règlement'] },
  { emoji: '📢', words: ['annonce', 'actualite', 'actualité', 'news'] },
  { emoji: '💬', words: ['communaute', 'communauté', 'general', 'général', 'discussion', 'chat'] },
  { emoji: '🔊', words: ['vocal', 'voice', 'audio'] },
  { emoji: '🎮', words: ['minecraft', 'gaming', 'jeu', 'games', 'survie', 'skyblock'] },
  { emoji: '🎫', words: ['support', 'ticket', 'aide', 'assistance'] },
  { emoji: '🔐', words: ['staff', 'moderation', 'modération', 'admin', 'equipe', 'équipe'] },
  { emoji: '🤝', words: ['partenaire', 'partenariat', 'partner'] },
  { emoji: '🎉', words: ['evenement', 'événement', 'event', 'animation', 'concours'] },
  { emoji: '🎨', words: ['media', 'média', 'creation', 'création', 'photo', 'video', 'vidéo'] },
  { emoji: '🤖', words: ['bot', 'commande', 'automatisation'] },
];

function hasLeadingEmoji(name) {
  return /^\p{Extended_Pictographic}/u.test(String(name).trim());
}

function emojiForCategory(name) {
  const normalized = String(name).toLocaleLowerCase('fr');
  return emojiRules.find((rule) => rule.words.some((word) => normalized.includes(word)))?.emoji || '📁';
}

function categoryNameWithEmoji(name) {
  const trimmed = String(name).trim();
  return hasLeadingEmoji(trimmed) ? trimmed : `${emojiForCategory(trimmed)} ${trimmed}`;
}

async function addMissingCategoryEmojis(guild, actorTag = 'Panel FyxBot') {
  await guild.channels.fetch();
  const categories = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory);
  const renamed = [];
  for (const category of categories.values()) {
    const nextName = categoryNameWithEmoji(category.name).slice(0, 100);
    if (nextName === category.name) continue;
    await category.setName(nextName, `Emojis de catégories appliqués par ${actorTag}`);
    renamed.push({ id: category.id, name: nextName });
  }
  return renamed;
}

module.exports = { addMissingCategoryEmojis, categoryNameWithEmoji, emojiForCategory, hasLeadingEmoji };
