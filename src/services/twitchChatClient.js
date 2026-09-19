const TWITCH_IRC_URL = 'wss://irc-ws.chat.twitch.tv:443';
const SOCKET_CONNECTING = 0;
const SOCKET_OPEN = 1;
const MAX_CHAT_BYTES = 450;

function normalizeIrcName(value, label) {
  const normalized = String(value || '')
    .trim()
    .replace(/^#/, '')
    .toLowerCase();

  if (!/^[a-z0-9_]{2,25}$/.test(normalized)) {
    throw new Error(`${label} Twitch invalide.`);
  }

  return normalized;
}

function normalizeAccessToken(value) {
  const token = String(value || '').trim().replace(/^oauth:/i, '');
  if (!token || /[\r\n\s]/.test(token)) {
    throw new Error('Jeton Twitch invalide.');
  }
  return token;
}

function truncateUtf8(value, maximumBytes) {
  if (Buffer.byteLength(value, 'utf8') <= maximumBytes) return value;

  let result = '';
  let byteLength = 0;
  for (const character of value) {
    const characterBytes = Buffer.byteLength(character, 'utf8');
    if (byteLength + characterBytes > maximumBytes) break;
    result += character;
    byteLength += characterBytes;
  }
  return result;
}

function sanitizeChatMessage(value, maximumBytes = MAX_CHAT_BYTES) {
  const sanitized = String(value || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return truncateUtf8(sanitized, maximumBytes);
}

function parseTags(rawTags) {
  return Object.fromEntries(
    String(rawTags || '')
      .split(';')
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        if (separator < 0) return [entry, ''];
        return [entry.slice(0, separator), entry.slice(separator + 1)];
      }),
  );
}

function parseTwitchChatMessage(line) {
  const match = String(line || '').match(/^@([^ ]+) :([^!]+)![^ ]+ PRIVMSG #([^ ]+) :(.*)$/);
  if (!match) return null;

  const tags = parseTags(match[1]);
  const badges = String(tags.badges || '').split(',');
  const isBroadcaster = badges.includes('broadcaster/1');
  const isSubscriber = badges.some((badge) => /^(?:subscriber|founder)\//.test(badge));

  return {
    username: match[2].toLowerCase(),
    channel: match[3].toLowerCase(),
    text: match[4],
    messageId: tags.id || undefined,
    userId: tags['user-id'] || undefined,
    isBroadcaster,
    isModerator: tags.mod === '1' || isBroadcaster,
    isSubscriber: isSubscriber || isBroadcaster,
  };
}

class TwitchChatClient {
  constructor(options = {}) {
    this.username = normalizeIrcName(options.username, 'Nom utilisateur');
    this.channel = normalizeIrcName(options.channel, 'Chaîne');
    this.accessToken = normalizeAccessToken(options.accessToken);
    this.webSocketFactory = options.webSocketFactory || ((url) => new WebSocket(url));
    this.setTimeoutFn = options.setTimeoutFn || setTimeout;
    this.clearTimeoutFn = options.clearTimeoutFn || clearTimeout;
    this.now = options.now || Date.now;
    this.reconnectDelayMs = this.#boundedInteger(options.reconnectDelayMs, 1_000, 100, 60_000);
    this.maximumReconnectDelayMs = this.#boundedInteger(
      options.maximumReconnectDelayMs,
      30_000,
      this.reconnectDelayMs,
      300_000,
    );
    this.maximumReconnectAttempts = this.#boundedInteger(options.maximumReconnectAttempts, 8, 0, 100);
    this.maximumRememberedMessageIds = this.#boundedInteger(options.maximumRememberedMessageIds, 1_000, 1, 10_000);
    this.maximumMessagesPerWindow = this.#boundedInteger(options.maximumMessagesPerWindow, 18, 1, 100);
    this.outputWindowMs = this.#boundedInteger(options.outputWindowMs, 30_000, 1_000, 120_000);

    this.socket = null;
    this.connected = false;
    this.stopped = true;
    this.reconnectAttempts = 0;
    this.reconnectTimer = null;
    this.messageHandlers = new Set();
    this.statusHandlers = new Set();
    this.errorHandlers = new Set();
    this.seenMessageIds = new Set();
    this.sentMessageTimes = [];
  }

  #boundedInteger(value, fallback, minimum, maximum) {
    if (value === undefined) return fallback;
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      throw new Error(`Valeur Twitch attendue entre ${minimum} et ${maximum}.`);
    }
    return value;
  }

  onMessage(handler) {
    if (typeof handler !== 'function') throw new TypeError('Gestionnaire de message Twitch invalide.');
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onStatus(handler) {
    if (typeof handler !== 'function') throw new TypeError('Gestionnaire de statut Twitch invalide.');
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  onError(handler) {
    if (typeof handler !== 'function') throw new TypeError("Gestionnaire d'erreur Twitch invalide.");
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  async connect() {
    this.stopped = false;
    if (this.socket && [SOCKET_CONNECTING, SOCKET_OPEN].includes(this.socket.readyState)) return;
    await this.#openSocket();
  }

  disconnect() {
    this.stopped = true;
    this.connected = false;
    this.reconnectAttempts = 0;
    if (this.reconnectTimer) {
      this.clearTimeoutFn(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    const socket = this.socket;
    this.socket = null;
    if (socket && [SOCKET_CONNECTING, SOCKET_OPEN].includes(socket.readyState)) socket.close();
    this.#emitStatus(false);
  }

  sendMessage(message) {
    const sanitized = sanitizeChatMessage(message);
    if (!sanitized) return false;
    if (!this.connected || !this.socket || this.socket.readyState !== SOCKET_OPEN) return false;

    const now = this.now();
    this.sentMessageTimes = this.sentMessageTimes.filter((sentAt) => now - sentAt < this.outputWindowMs);
    if (this.sentMessageTimes.length >= this.maximumMessagesPerWindow) return false;

    this.#sendRaw(`PRIVMSG #${this.channel} :${sanitized}`);
    this.sentMessageTimes.push(now);
    return true;
  }

  async #openSocket() {
    if (this.stopped) return;

    let socket;
    try {
      socket = this.webSocketFactory(TWITCH_IRC_URL);
    } catch (error) {
      this.#emitError(error);
      this.#scheduleReconnect();
      return;
    }

    this.socket = socket;

    await new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      socket.addEventListener('open', () => {
        if (this.stopped || socket !== this.socket) {
          socket.close();
          finish();
          return;
        }

        this.#sendRaw(`PASS oauth:${this.accessToken}`);
        this.#sendRaw(`NICK ${this.username}`);
        this.#sendRaw('CAP REQ :twitch.tv/tags twitch.tv/commands');
        this.#sendRaw(`JOIN #${this.channel}`);
      });

      socket.addEventListener('message', (event) => {
        this.#handleFrame(event.data, socket);
        if (this.connected) finish();
      });

      socket.addEventListener('error', (event) => {
        this.#emitError(event?.error || new Error('Connexion Twitch interrompue.'));
        if (!this.connected) {
          finish();
          this.#scheduleReconnect();
        }
      });

      socket.addEventListener('close', () => {
        const wasCurrentSocket = socket === this.socket;
        if (wasCurrentSocket) this.socket = null;
        this.connected = false;
        this.#emitStatus(false);
        finish();
        if (wasCurrentSocket) this.#scheduleReconnect();
      });
    });
  }

  #handleFrame(frame, socket = this.socket) {
    if (socket !== this.socket) return;

    for (const line of String(frame || '').split(/\r?\n/).filter(Boolean)) {
      if (line.startsWith('PING')) {
        this.#sendRaw(line.replace(/^PING/, 'PONG'));
        continue;
      }

      if (/^:[^ ]+\s+001\s+/i.test(line)) {
        if (!this.connected) {
          this.connected = true;
          this.reconnectAttempts = 0;
          this.#emitStatus(true);
        }
        continue;
      }

      if (/\bNOTICE\b.*:Login authentication failed\.?$/i.test(line)) {
        this.#emitError(new Error('Authentification Twitch refusée.'));
        this.connected = false;
        if ([SOCKET_CONNECTING, SOCKET_OPEN].includes(socket.readyState)) socket.close();
        continue;
      }

      const message = parseTwitchChatMessage(line);
      if (!message || message.channel !== this.channel || message.username === this.username) continue;
      if (message.messageId && this.#isDuplicateMessage(message.messageId)) continue;

      for (const handler of this.messageHandlers) {
        try {
          const result = handler(message);
          if (result && typeof result.catch === 'function') result.catch((error) => this.#emitError(error));
        } catch (error) {
          this.#emitError(error);
        }
      }
    }
  }

  #isDuplicateMessage(messageId) {
    if (this.seenMessageIds.has(messageId)) return true;
    this.seenMessageIds.add(messageId);
    while (this.seenMessageIds.size > this.maximumRememberedMessageIds) {
      this.seenMessageIds.delete(this.seenMessageIds.values().next().value);
    }
    return false;
  }

  #scheduleReconnect() {
    if (this.stopped || this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maximumReconnectAttempts) {
      this.#emitError(new Error('Nombre maximal de reconnexions Twitch atteint.'));
      return;
    }

    const delay = Math.min(
      this.reconnectDelayMs * 2 ** this.reconnectAttempts,
      this.maximumReconnectDelayMs,
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = this.setTimeoutFn(() => {
      this.reconnectTimer = null;
      void this.#openSocket();
    }, delay);
  }

  #sendRaw(payload) {
    if (!this.socket || this.socket.readyState !== SOCKET_OPEN) return false;
    this.socket.send(`${payload}\r\n`);
    return true;
  }

  #emitStatus(connected) {
    for (const handler of this.statusHandlers) handler(Boolean(connected));
  }

  #emitError(error) {
    const safeError = error instanceof Error ? error : new Error('Erreur Twitch inconnue.');
    for (const handler of this.errorHandlers) handler(safeError);
  }
}

module.exports = {
  MAX_CHAT_BYTES,
  TWITCH_IRC_URL,
  TwitchChatClient,
  normalizeIrcName,
  parseTwitchChatMessage,
  sanitizeChatMessage,
};
