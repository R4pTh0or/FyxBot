const {
  ChannelType,
  GuildScheduledEventEntityType,
  GuildScheduledEventPrivacyLevel,
  PermissionFlagsBits,
} = require('discord.js');
const { SUPPORTED_TIMEZONES } = require('./birthdays');

function zonedParts(date, timeZone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
}

function localDateTimeToUtc({ year, month, day, hour, minute }, timeZone) {
  const expected = Date.UTC(year, month - 1, day, hour, minute, 0);
  let timestamp = expected;
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = zonedParts(new Date(timestamp), timeZone);
    const represented = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    timestamp += expected - represented;
  }
  const result = new Date(timestamp);
  const verified = zonedParts(result, timeZone);
  if (verified.year !== year || verified.month !== month || verified.day !== day
    || verified.hour !== hour || verified.minute !== minute) {
    throw new Error('Cette heure locale n’existe pas dans le fuseau choisi, probablement à cause du changement d’heure.');
  }
  return result;
}

function parseCommunityEventDate(dateValue, timeValue, timeZone = 'Europe/Paris', now = new Date()) {
  const dateMatch = String(dateValue || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const timeMatch = String(timeValue || '').trim().match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) throw new Error('Utilisez le format JJ/MM/AAAA pour la date et HH:MM pour l’heure.');
  if (!SUPPORTED_TIMEZONES.includes(timeZone)) throw new Error('Fuseau horaire non pris en charge.');
  const [, dayText, monthText, yearText] = dateMatch;
  const [, hourText, minuteText] = timeMatch;
  const parts = {
    year: Number(yearText), month: Number(monthText), day: Number(dayText),
    hour: Number(hourText), minute: Number(minuteText),
  };
  const calendarDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (calendarDate.getUTCFullYear() !== parts.year || calendarDate.getUTCMonth() !== parts.month - 1
    || calendarDate.getUTCDate() !== parts.day || parts.hour > 23 || parts.minute > 59) {
    throw new Error('La date ou l’heure indiquée est invalide.');
  }
  const result = localDateTimeToUtc(parts, timeZone);
  if (result.getTime() < new Date(now).getTime() + 5 * 60_000) throw new Error('L’événement doit commencer dans au moins 5 minutes.');
  if (result.getTime() > new Date(now).getTime() + 365 * 24 * 60 * 60_000) throw new Error('L’événement doit être programmé dans les 12 prochains mois.');
  return result;
}

function normalizeCommunityEvent(input, { now = new Date() } = {}) {
  const name = String(input.name || '').trim().slice(0, 100);
  const description = String(input.description || '').trim().slice(0, 1000);
  const timeZone = SUPPORTED_TIMEZONES.includes(input.timeZone) ? input.timeZone : 'Europe/Paris';
  const scheduledStartTime = parseCommunityEventDate(input.date, input.time, timeZone, now);
  const durationMinutes = Math.min(Math.max(Number(input.durationMinutes) || 60, 30), 24 * 60);
  const scheduledEndTime = new Date(scheduledStartTime.getTime() + durationMinutes * 60_000);
  const type = input.type === 'voice' ? 'voice' : 'external';
  if (name.length < 3) throw new Error('Le nom de l’événement doit contenir au moins 3 caractères.');
  const location = String(input.location || 'Discord').trim().slice(0, 100);
  if (type === 'external' && !location) throw new Error('Indiquez le lieu de l’événement.');
  return { name, description, timeZone, scheduledStartTime, scheduledEndTime, type, location };
}

async function createCommunityEvent(guild, input, { actorLabel = 'Panel FyxBot', now = new Date() } = {}) {
  const details = normalizeCommunityEvent(input, { now });
  const botMember = guild.members.me;
  if (!botMember?.permissions.has(PermissionFlagsBits.CreateEvents)) {
    throw new Error('FyxBot a besoin de la permission Créer des événements. Réinvitez-le avec le lien actualisé ou accordez cette permission à son rôle.');
  }
  const options = {
    name: details.name,
    description: details.description || undefined,
    scheduledStartTime: details.scheduledStartTime,
    scheduledEndTime: details.scheduledEndTime,
    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
    reason: `Événement FyxBot créé par ${String(actorLabel).slice(0, 120)}`,
  };
  if (details.type === 'voice') {
    const channel = await guild.channels.fetch(input.channelId).catch(() => null);
    if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
      throw new Error('Choisissez un salon vocal ou une scène de ce serveur.');
    }
    if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.CreateEvents, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])) {
      throw new Error('FyxBot doit pouvoir voir, rejoindre et créer des événements dans ce salon vocal.');
    }
    options.entityType = channel.type === ChannelType.GuildStageVoice
      ? GuildScheduledEventEntityType.StageInstance
      : GuildScheduledEventEntityType.Voice;
    options.channel = channel.id;
  } else {
    options.entityType = GuildScheduledEventEntityType.External;
    options.entityMetadata = { location: details.location };
  }
  const event = await guild.scheduledEvents.create(options);
  return {
    event,
    details,
    url: `https://discord.com/events/${guild.id}/${event.id}`,
  };
}

module.exports = {
  createCommunityEvent,
  normalizeCommunityEvent,
  parseCommunityEventDate,
};
