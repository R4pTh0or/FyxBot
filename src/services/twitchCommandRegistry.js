const RESERVED_TWITCH_COMMANDS = new Set([
  'ban',
  'clear',
  'commands',
  'discord',
  'help',
  'mod',
  'modhelp',
  'slow',
  'socials',
  'timeout',
  'unban',
  'uptime',
]);

const TWITCH_MODERATION_COMMANDS = Object.freeze([
  { name: 'mod', usage: '!mod', description: 'Affiche cette aide.' },
  { name: 'ban', usage: '!ban @pseudo [raison]', description: 'Bannit un utilisateur.' },
  { name: 'unban', usage: '!unban @pseudo', description: 'Retire un bannissement ou un timeout.' },
  { name: 'timeout', usage: '!timeout @pseudo [secondes] [raison]', description: 'Isole temporairement un utilisateur (600 s par défaut).' },
  { name: 'clear', usage: '!clear', description: 'Efface le chat visible.' },
  { name: 'slow', usage: '!slow 0|3-120', description: 'Désactive ou règle le mode lent.' },
]);

function normalizeTwitchCommand(value) {
  const normalized = String(value || '').trim().replace(/^!+/, '').toLowerCase();
  if (!/^[a-z0-9_]{2,24}$/.test(normalized)) {
    throw new Error('Le nom doit contenir 2 à 24 lettres, chiffres ou underscores.');
  }
  return normalized;
}

function sanitizeTwitchCommandResponse(value) {
  const sanitized = String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!sanitized) throw new Error('La réponse Twitch ne peut pas être vide.');
  if (sanitized.length > 400) throw new Error('La réponse Twitch est limitée à 400 caractères.');
  return sanitized;
}

function normalizeCooldownSeconds(value, fallback = 5) {
  const cooldown = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(cooldown) || cooldown < 0 || cooldown > 3_600) {
    throw new Error('Le délai Twitch doit être un entier entre 0 et 3600 secondes.');
  }
  return cooldown;
}

function normalizeAccessLevel(value) {
  const accessLevel = value || 'everyone';
  if (!['everyone', 'subscriber', 'moderator', 'broadcaster'].includes(accessLevel)) {
    throw new Error("Le niveau d'accès Twitch est invalide.");
  }
  return accessLevel;
}

function normalizeCommandPrefix(value) {
  const prefix = String(value ?? '!').trim();
  if (!/^[!#$%&*+./:<=>?@\\^_|~-]{1,5}$/.test(prefix)) {
    throw new Error('Le préfixe Twitch doit contenir entre 1 et 5 signes autorisés.');
  }
  return prefix;
}

function canUseCommand(message, accessLevel) {
  if (accessLevel === 'everyone') return true;
  if (accessLevel === 'subscriber') {
    return Boolean(message?.isSubscriber || message?.isModerator || message?.isBroadcaster);
  }
  if (accessLevel === 'moderator') return Boolean(message?.isModerator || message?.isBroadcaster);
  return Boolean(message?.isBroadcaster);
}

function normalizeHttpsUrl(value, fallback) {
  const rawUrl = String(value || fallback || '').trim();
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') throw new Error();
    return parsed.toString();
  } catch {
    throw new Error('Une URL Twitch publique HTTPS valide est requise.');
  }
}

function formatUptime(startedAt, now = Date.now()) {
  const start = Number(startedAt);
  if (!Number.isFinite(start) || start <= 0 || start > now) return 'Le live ne semble pas être démarré.';

  let totalSeconds = Math.floor((now - start) / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  totalSeconds -= hours * 3_600;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `Live depuis ${hours}h ${minutes}m ${seconds}s.`;
}

function normalizeTwitchLogin(value) {
  const login = String(value || '').trim().replace(/^@+/, '').toLowerCase();
  if (!/^[a-z0-9_]{1,25}$/.test(login)) {
    throw new Error('Indiquez un pseudo Twitch valide.');
  }
  return login;
}

function normalizeModerationReason(values) {
  const reason = values.join(' ').trim();
  if (reason.length > 500) throw new Error('Le motif Twitch est limité à 500 caractères.');
  return reason;
}

function inspectTwitchMessage(message, options = {}) {
  if (!message || message.isModerator) return null;

  const text = String(message.text || '').trim();
  const blockLinks = options.blockLinks !== false;
  const maximumCapsRatio = options.maximumCapsRatio === undefined ? 0.75 : Number(options.maximumCapsRatio);
  const maximumRepeatedCharacters = options.maximumRepeatedCharacters === undefined
    ? 6
    : Number(options.maximumRepeatedCharacters);

  if (!Number.isFinite(maximumCapsRatio) || maximumCapsRatio < 0 || maximumCapsRatio > 1) {
    throw new Error('Le ratio de majuscules doit être compris entre 0 et 1.');
  }
  if (!Number.isInteger(maximumRepeatedCharacters) || maximumRepeatedCharacters < 2 || maximumRepeatedCharacters > 100) {
    throw new Error('La répétition maximale doit être comprise entre 2 et 100.');
  }

  if (blockLinks && /(?:https?:\/\/|www\.|discord\.gg\/|twitch\.tv\/)/i.test(text)) return 'link';

  const letters = text.match(/[a-zà-ÿ]/gi) || [];
  if (letters.length >= 10) {
    const uppercase = letters.filter((letter) => letter === letter.toUpperCase()).length;
    if (uppercase / letters.length >= maximumCapsRatio) return 'caps';
  }

  const repetitionPattern = new RegExp(`(.)\\1{${maximumRepeatedCharacters - 1},}`, 'i');
  if (repetitionPattern.test(text)) return 'repetition';
  return null;
}

class TwitchCommandRegistry {
  constructor(options = {}) {
    this.now = options.now || Date.now;
    this.prefix = normalizeCommandPrefix(options.prefix);
    this.defaultCooldownSeconds = normalizeCooldownSeconds(options.defaultCooldownSeconds, 5);
    this.commands = new Map();
    this.cooldowns = new Map();
  }

  registerBuiltIn(name, handler, options = {}) {
    return this.#register(name, handler, { ...options, custom: false });
  }

  registerCustom(command = {}) {
    const name = normalizeTwitchCommand(command.name);
    if (RESERVED_TWITCH_COMMANDS.has(name) || this.commands.has(name)) {
      throw new Error(`La commande !${name} est réservée.`);
    }

    const response = sanitizeTwitchCommandResponse(command.response);
    return this.#register(name, () => response, {
      custom: true,
      enabled: command.enabled,
      cooldownSeconds: command.cooldownSeconds,
      accessLevel: command.accessLevel,
    });
  }

  syncCustom(commands = []) {
    if (!Array.isArray(commands)) throw new TypeError('La liste des commandes Twitch est invalide.');
    for (const [name, command] of this.commands) {
      if (command.custom) this.commands.delete(name);
    }

    const report = { loaded: [], skipped: [] };
    for (const command of commands) {
      try {
        const descriptor = this.registerCustom(command);
        report.loaded.push(descriptor.name);
      } catch (error) {
        report.skipped.push({
          name: String(command?.name || '').trim(),
          reason: error instanceof Error ? error.message : 'Commande invalide.',
        });
      }
    }
    return report;
  }

  list(options = {}) {
    const includeDisabled = options.includeDisabled === true;
    return [...this.commands.values()]
      .filter((command) => includeDisabled || command.enabled)
      .map((command) => ({
        name: command.name,
        enabled: command.enabled,
        cooldownSeconds: command.cooldownSeconds,
        accessLevel: command.accessLevel,
        custom: command.custom,
      }));
  }

  async execute(context = {}) {
    const rawMessage = String(context.message?.text || '').trim();
    if (!rawMessage.startsWith(this.prefix)) return { handled: false };

    const [rawName, ...args] = rawMessage.slice(this.prefix.length).split(/\s+/);
    let name;
    try {
      name = normalizeTwitchCommand(rawName);
    } catch {
      return { handled: false };
    }

    const command = this.commands.get(name);
    if (!command || !command.enabled) return { handled: false };
    if (!canUseCommand(context.message, command.accessLevel)) {
      return { handled: true, commandName: name, blockedReason: 'permission' };
    }

    const now = this.now();
    const identity = String(context.message?.userId || context.message?.username || 'anonymous').toLowerCase();
    const channel = String(context.message?.channel || 'unknown').toLowerCase();
    const cooldownKey = `${channel}:${identity}:${name}`;
    const availableAt = this.cooldowns.get(cooldownKey) || 0;
    if (availableAt > now) {
      return {
        handled: true,
        commandName: name,
        blockedReason: 'cooldown',
        retryAfterMs: availableAt - now,
      };
    }

    const response = sanitizeTwitchCommandResponse(await command.handler({
      ...context,
      args,
      commandName: name,
      now,
    }));

    if (command.cooldownSeconds > 0) {
      this.cooldowns.set(cooldownKey, now + command.cooldownSeconds * 1_000);
      this.#pruneCooldowns(now);
    }

    return { handled: true, commandName: name, custom: command.custom, response };
  }

  #register(name, handler, options) {
    const normalizedName = normalizeTwitchCommand(name);
    if (typeof handler !== 'function') throw new TypeError('Gestionnaire de commande Twitch invalide.');
    if (this.commands.has(normalizedName)) throw new Error(`La commande !${normalizedName} existe déjà.`);

    const command = {
      name: normalizedName,
      handler,
      enabled: options.enabled !== false,
      cooldownSeconds: normalizeCooldownSeconds(options.cooldownSeconds, this.defaultCooldownSeconds),
      accessLevel: normalizeAccessLevel(options.accessLevel),
      custom: options.custom === true,
    };
    this.commands.set(normalizedName, command);
    return { ...command, handler: undefined };
  }

  #pruneCooldowns(now) {
    if (this.cooldowns.size < 5_000) return;
    for (const [key, expiresAt] of this.cooldowns) {
      if (expiresAt <= now) this.cooldowns.delete(key);
    }
  }
}

function createDefaultTwitchCommands(options = {}) {
  const registry = new TwitchCommandRegistry({
    now: options.now,
    defaultCooldownSeconds: options.defaultCooldownSeconds,
    prefix: options.prefix,
  });
  const discordUrl = normalizeHttpsUrl(options.discordUrl, 'https://discord.gg/fyxbot');
  const websiteUrl = normalizeHttpsUrl(options.websiteUrl, 'https://fyxbot-panel-production.up.railway.app/');
  const moderate = typeof options.moderationHandler === 'function'
    ? options.moderationHandler
    : async () => 'La modération Twitch doit être activée depuis le panel FyxBot.';

  registry.registerBuiltIn('commands', () => {
    const commandNames = registry.list().map((command) => `${registry.prefix}${command.name}`).join(', ');
    const response = `Commandes FyxBot : ${commandNames}`;
    return response.length <= 400 ? response : `${response.slice(0, 397)}…`;
  });
  registry.registerBuiltIn('discord', () => `Rejoins la communauté FyxBot : ${discordUrl}`);
  registry.registerBuiltIn('socials', () => `Retrouve FyxBot et ses liens : ${websiteUrl}`);
  registry.registerBuiltIn('uptime', ({ streamStartedAt, now }) => formatUptime(streamStartedAt, now));
  const moderationHelp = () => `Modération FyxBot : ${TWITCH_MODERATION_COMMANDS.map((command) => command.usage).join(' · ')}`;
  registry.registerBuiltIn('mod', moderationHelp, { accessLevel: 'moderator', cooldownSeconds: 2 });
  registry.registerBuiltIn('modhelp', moderationHelp, { accessLevel: 'moderator', cooldownSeconds: 2 });
  registry.registerBuiltIn('ban', ({ args, message }) => {
    const targetLogin = normalizeTwitchLogin(args[0]);
    return moderate({ action: 'ban', targetLogin, reason: normalizeModerationReason(args.slice(1)), message });
  }, { accessLevel: 'moderator', cooldownSeconds: 2 });
  registry.registerBuiltIn('unban', ({ args, message }) => moderate({
    action: 'unban',
    targetLogin: normalizeTwitchLogin(args[0]),
    message,
  }), { accessLevel: 'moderator', cooldownSeconds: 2 });
  registry.registerBuiltIn('timeout', ({ args, message }) => {
    const targetLogin = normalizeTwitchLogin(args[0]);
    const hasDuration = /^\d+$/.test(String(args[1] || ''));
    const durationSeconds = hasDuration ? Number(args[1]) : 600;
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 1_209_600) {
      throw new Error('Le timeout Twitch doit durer entre 1 seconde et 2 semaines.');
    }
    return moderate({
      action: 'timeout',
      targetLogin,
      durationSeconds,
      reason: normalizeModerationReason(args.slice(hasDuration ? 2 : 1)),
      message,
    });
  }, { accessLevel: 'moderator', cooldownSeconds: 2 });
  registry.registerBuiltIn('clear', ({ message }) => moderate({ action: 'clear', message }), {
    accessLevel: 'moderator',
    cooldownSeconds: 2,
  });
  registry.registerBuiltIn('slow', ({ args, message }) => {
    const seconds = Number(args[0]);
    if (!Number.isInteger(seconds) || (seconds !== 0 && (seconds < 3 || seconds > 120))) {
      throw new Error('Utilisez !slow 0 pour désactiver, ou une valeur de 3 à 120 secondes.');
    }
    return moderate({ action: 'slow', seconds, message });
  }, { accessLevel: 'moderator', cooldownSeconds: 2 });

  return registry;
}

module.exports = {
  RESERVED_TWITCH_COMMANDS,
  TWITCH_MODERATION_COMMANDS,
  TwitchCommandRegistry,
  createDefaultTwitchCommands,
  formatUptime,
  inspectTwitchMessage,
  normalizeCommandPrefix,
  normalizeHttpsUrl,
  normalizeModerationReason,
  normalizeTwitchCommand,
  normalizeTwitchLogin,
  sanitizeTwitchCommandResponse,
};
