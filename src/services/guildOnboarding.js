const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const DEFAULT_PANEL_URL = 'https://fyxbot-panel-production.up.railway.app/';

function publicPanelUrl() {
  try {
    const url = new URL(process.env.DASHBOARD_PUBLIC_URL || DEFAULT_PANEL_URL);
    return url.protocol === 'https:' ? url.toString() : DEFAULT_PANEL_URL;
  } catch {
    return DEFAULT_PANEL_URL;
  }
}

function canReceiveOnboarding(channel, botMember) {
  if (!channel?.isTextBased?.() || channel.isThread?.()) return false;
  const permissions = channel.permissionsFor?.(botMember);
  return Boolean(permissions?.has([
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
  ]));
}

async function findOnboardingChannel(guild) {
  const channels = await guild.channels.fetch();
  const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember) return null;
  const systemChannel = guild.systemChannelId ? channels.get(guild.systemChannelId) : guild.systemChannel;
  if (canReceiveOnboarding(systemChannel, botMember)) return systemChannel;
  return [...channels.values()]
    .filter((channel) => canReceiveOnboarding(channel, botMember))
    .sort((left, right) => left.rawPosition - right.rawPosition)[0] || null;
}

function onboardingPayload(guildName) {
  const panelUrl = publicPanelUrl();
  const embed = new EmbedBuilder()
    .setColor(0xff5a2a)
    .setTitle('👋 Merci d’avoir ajouté FyxBot')
    .setDescription(`FyxBot est prêt à accompagner **${guildName}**. Le parcours guidé du panel vous aide à configurer le serveur sans rien oublier.`)
    .addFields(
      { name: '1 · Ouvrir le panel', value: 'Connectez-vous avec Discord puis sélectionnez ce serveur.', inline: false },
      { name: '2 · Suivre le parcours', value: 'Préparez la structure, la sécurité, l’accueil, les tickets et les journaux.', inline: false },
      { name: '3 · Garder le contrôle', value: 'Chaque action sensible reste confirmée avant d’être appliquée.', inline: false },
    )
    .setFooter({ text: 'FyxBot • Configuration guidée' })
    .setTimestamp();
  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setLabel('Ouvrir le panel FyxBot').setEmoji('🚀').setStyle(ButtonStyle.Link).setURL(panelUrl),
    )],
    allowedMentions: { parse: [] },
  };
}

async function sendGuildOnboarding(guild) {
  try {
    const channel = await findOnboardingChannel(guild);
    if (!channel) return { sent: false, reason: 'no-writable-channel' };
    await channel.send(onboardingPayload(guild.name));
    return { sent: true, channelId: channel.id };
  } catch (error) {
    console.warn(`[FyxBot] Message d’arrivée impossible sur ${guild.id} : ${error.message}`);
    return { sent: false, reason: 'send-failed' };
  }
}

module.exports = {
  DEFAULT_PANEL_URL,
  canReceiveOnboarding,
  findOnboardingChannel,
  onboardingPayload,
  publicPanelUrl,
  sendGuildOnboarding,
};
