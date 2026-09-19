const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const { getLogConfig } = require('../database/logStore');
const { addAuditLog } = require('../database/auditLogStore');
const logger = require('./logger').logger.child({ component: 'discord-logs' });

async function getLogChannel(guild) {
  const config = await getLogConfig(guild.id);
  if (!config) return null;
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  return channel?.isTextBased() ? channel : null;
}

async function logAction(guild, { title, description, color = 0xf97316, fields = [] }) {
  await addAuditLog(guild.id, { title, description, color });
  const channel = await getLogChannel(guild);
  if (!channel) return false;
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .addFields(fields)
    .setFooter({ text: 'FyxBot • Journal du serveur' })
    .setTimestamp();
  await channel.send({ embeds: [embed] }).catch((error) => {
    logger.error({ err: error, channelId: channel.id, guildId: guild.id }, '[FyxBot] Envoi du journal Discord impossible.');
  });
  return true;
}

function sanitizeTranscriptContent(value) {
  return String(value || '[message sans texte]')
    .replace(/https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/gi, '[webhook masqué]')
    .replace(/\b(?:DISCORD_TOKEN|BOT_TOKEN|DISCORD_CLIENT_SECRET|CLIENT_SECRET|BACKUP_SECRET|API_KEY|PASSWORD)\s*[:=]\s*\S+/gi, '[secret masqué]')
    .replace(/\b(?:Bot|Bearer)\s+[A-Za-z0-9._~-]{20,}/gi, '[autorisation masquée]')
    .replace(/\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{20,}\b/g, '[jeton masqué]');
}

async function createTranscript(channel) {
  const collected = [];
  let before;
  while (collected.length < 500) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;
    collected.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }

  const lines = collected
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((message) => {
      const date = new Date(message.createdTimestamp).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' });
      const content = sanitizeTranscriptContent(message.content);
      const attachmentNames = [...message.attachments.values()]
        .map((attachment) => sanitizeTranscriptContent(attachment.name || 'pièce jointe'));
      const attachmentSummary = attachmentNames.length
        ? ` [${attachmentNames.length} pièce(s) jointe(s) : ${attachmentNames.join(', ')}]`
        : '';
      return `[${date}] ${message.author.tag} : ${content}${attachmentSummary}`;
    });
  return Buffer.from(lines.join('\n') || 'Aucun message dans ce ticket.', 'utf8');
}

async function sendTicketTranscript(channel, closedBy, ownerId) {
  const logChannel = await getLogChannel(channel.guild);
  if (!logChannel) return false;
  const transcript = await createTranscript(channel);
  const attachment = new AttachmentBuilder(transcript, { name: `transcript-${channel.name}.txt` });
  await logChannel.send({
    content: `📄 Transcript de **${channel.name}** · Propriétaire : <@${ownerId}> · Fermé par : ${closedBy}`,
    files: [attachment],
  });
  return true;
}

module.exports = { createTranscript, logAction, sanitizeTranscriptContent, sendTicketTranscript };
