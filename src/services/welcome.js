const { EmbedBuilder } = require('discord.js');
const { getWelcomeConfig } = require('../database/welcomeStore');
const { logAction } = require('./logs');
const {
  DEFAULT_LEAVE_MESSAGE,
  DEFAULT_WELCOME_MESSAGE,
  configuredMessage,
} = require('./defaultMessages');
const logger = require('./logger').logger.child({ component: 'welcome' });

function renderTemplate(template, member, fallback = DEFAULT_WELCOME_MESSAGE) {
  return configuredMessage(template, fallback)
    .replaceAll('{membre}', member.toString())
    .replaceAll('{serveur}', member.guild.name)
    .replaceAll('{nombre}', member.guild.memberCount.toString());
}

async function handleMemberAdd(member) {
  const config = await getWelcomeConfig(member.guild.id);
  if (config?.autoRoleId) {
    const role = await member.guild.roles.fetch(config.autoRoleId).catch(() => null);
    if (role && !role.managed && member.guild.members.me.roles.highest.comparePositionTo(role) > 0) {
      await member.roles.add(role, 'Rôle automatique FyxBot').catch((error) => {
        logger.error({ err: error, guildId: member.guild.id, memberId: member.id, roleId: role.id }, '[FyxBot] Attribution du rôle automatique impossible.');
      });
    }
  }

  if (config?.welcomeChannelId) {
    const channel = await member.guild.channels.fetch(config.welcomeChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0x57f287)
        .setAuthor({ name: `Bienvenue ${member.user.username} !`, iconURL: member.user.displayAvatarURL() })
        .setDescription(renderTemplate(config.welcomeMessage, member, DEFAULT_WELCOME_MESSAGE))
        .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
        .setFooter({ text: 'FyxBot • Bienvenue' })
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch((error) => {
        logger.error({ err: error, channelId: channel.id, guildId: member.guild.id }, '[FyxBot] Message de bienvenue impossible.');
      });
    }
  }

  await logAction(member.guild, {
    title: '📥 Membre arrivé',
    description: `${member.user} (${member.id}) a rejoint le serveur.\nCompte créé <t:${Math.floor(member.user.createdTimestamp / 1000)}:R>.`,
    color: 0x57f287,
  });
}

async function handleMemberRemove(member) {
  const config = await getWelcomeConfig(member.guild.id);
  if (config?.leaveChannelId) {
    const channel = await member.guild.channels.fetch(config.leaveChannelId).catch(() => null);
    if (channel?.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0xed4245)
        .setAuthor({ name: `${member.user.tag} est parti`, iconURL: member.user.displayAvatarURL() })
        .setDescription(renderTemplate(config.leaveMessage, member, DEFAULT_LEAVE_MESSAGE))
        .setThumbnail(member.user.displayAvatarURL({ size: 512 }))
        .setFooter({ text: 'FyxBot • Départ' })
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch((error) => {
        logger.error({ err: error, channelId: channel.id, guildId: member.guild.id }, '[FyxBot] Message de départ impossible.');
      });
    }
  }

  await logAction(member.guild, {
    title: '📤 Membre parti',
    description: `**${member.user.tag}** (${member.id}) a quitté le serveur.`,
    color: 0xed4245,
  });
}

module.exports = { handleMemberAdd, handleMemberRemove, renderTemplate };
