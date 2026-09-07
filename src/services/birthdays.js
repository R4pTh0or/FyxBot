const { EmbedBuilder } = require('discord.js');
const { getBirthdayConfig, setBirthdayConfig } = require('../database/birthdayStore');
const { DEFAULT_BIRTHDAY_MESSAGE, configuredMessage } = require('./defaultMessages');
const logger = require('./logger').logger.child({ component: 'birthdays' });

const SUPPORTED_TIMEZONES = Object.freeze([
  'Europe/Paris',
  'UTC',
  'America/Montreal',
  'Indian/Reunion',
]);

function isValidBirthday(day, month) {
  if (!Number.isInteger(day) || !Number.isInteger(month) || month < 1 || month > 12) return false;
  const date = new Date(Date.UTC(2000, month - 1, day));
  return date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function zonedDateParts(date, timeZone) {
  const values = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return {
    day: Number(values.day),
    month: Number(values.month),
    dateKey: `${values.year}-${values.month}-${values.day}`,
  };
}

function renderBirthdayMessage(template, mentions, guildName) {
  return configuredMessage(template, DEFAULT_BIRTHDAY_MESSAGE)
    .replaceAll('{membres}', mentions)
    .replaceAll('{serveur}', guildName);
}

function birthdaySortValue(record, currentMonth, currentDay) {
  const value = record.month * 100 + record.day;
  const current = currentMonth * 100 + currentDay;
  return value >= current ? value : value + 1200;
}

async function announceBirthdaysForGuild(guild, now = new Date()) {
  const config = await getBirthdayConfig(guild.id);
  if (!config?.channelId) return { announced: 0, skipped: true };
  const timeZone = SUPPORTED_TIMEZONES.includes(config.timezone) ? config.timezone : 'Europe/Paris';
  const today = zonedDateParts(now, timeZone);
  if (config.lastAnnouncementDate === today.dateKey) return { announced: 0, skipped: true };

  const records = Object.entries(config.birthdays || {})
    .filter(([, value]) => value.day === today.day && value.month === today.month);
  const members = (await Promise.all(records.map(([userId]) => guild.members.fetch(userId).catch(() => null)))).filter(Boolean);
  const channel = await guild.channels.fetch(config.channelId).catch(() => null);
  const role = config.roleId ? await guild.roles.fetch(config.roleId).catch(() => null) : null;

  if (role && !role.managed && guild.members.me.roles.highest.comparePositionTo(role) > 0) {
    const birthdayIds = new Set(members.map((member) => member.id));
    await Promise.all([...role.members.values()].filter((member) => !birthdayIds.has(member.id))
      .map((member) => member.roles.remove(role, 'Fin du rôle anniversaire FyxBot').catch(() => null)));
    await Promise.all(members.map((member) => member.roles.add(role, 'Anniversaire FyxBot').catch(() => null)));
  }

  if (members.length > 0 && channel?.isTextBased()) {
    const mentions = members.map((member) => member.toString()).join(', ');
    const embed = new EmbedBuilder()
      .setColor(0xff5a2a)
      .setTitle(members.length > 1 ? '🎂 Joyeux anniversaires !' : '🎂 Joyeux anniversaire !')
      .setDescription(renderBirthdayMessage(config.message, mentions, guild.name))
      .setFooter({ text: `FyxBot • ${timeZone}` })
      .setTimestamp();
    await channel.send({ content: mentions, embeds: [embed], allowedMentions: { users: members.map((member) => member.id) } });
  }

  await setBirthdayConfig(guild.id, { ...config, lastAnnouncementDate: today.dateKey, updatedAt: new Date().toISOString() });
  return { announced: members.length, skipped: false };
}

async function checkBirthdays(client, now = new Date()) {
  const results = [];
  for (const guild of client.guilds.cache.values()) {
    try {
      results.push(await announceBirthdaysForGuild(guild, now));
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, '[FyxBot] Erreur pendant l’annonce d’un anniversaire.');
    }
  }
  return results;
}

function startBirthdayScheduler(client, intervalMs = 15 * 60_000) {
  let stopped = false;
  const run = async () => {
    if (!stopped && client.isReady()) await checkBirthdays(client);
  };
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
  setTimeout(() => void run(), 5_000).unref();
  return { stop() { stopped = true; clearInterval(timer); } };
}

module.exports = {
  SUPPORTED_TIMEZONES,
  announceBirthdaysForGuild,
  birthdaySortValue,
  checkBirthdays,
  isValidBirthday,
  renderBirthdayMessage,
  startBirthdayScheduler,
  zonedDateParts,
};
