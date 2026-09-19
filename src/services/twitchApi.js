const TWITCH_AUTHORIZATION_URL = 'https://id.twitch.tv/oauth2/authorize';
const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token';
const TWITCH_HELIX_URL = 'https://api.twitch.tv/helix/';

class TwitchApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'TwitchApiError';
    this.code = options.code || 'twitch_api_error';
    this.status = options.status || 502;
    this.retryAfterMs = options.retryAfterMs;
  }
}

function safeRequiredValue(value, label, maximumLength = 4_096) {
  const normalized = String(value || '').trim();
  if (!normalized || normalized.length > maximumLength || /[\r\n\0]/.test(normalized)) {
    throw new TwitchApiError(`${label} Twitch invalide.`, { code: 'invalid_configuration', status: 500 });
  }
  return normalized;
}

function normalizeRedirectUri(value) {
  const normalized = safeRequiredValue(value, 'Adresse de retour', 2_048);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new TwitchApiError('Adresse de retour Twitch invalide.', { code: 'invalid_configuration', status: 500 });
  }

  const localHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname);
  if ((parsed.protocol !== 'https:' && !localHttp) || parsed.username || parsed.password) {
    throw new TwitchApiError('Adresse de retour Twitch non sécurisée.', {
      code: 'invalid_configuration',
      status: 500,
    });
  }
  return parsed.toString();
}

function normalizeScopes(scopes) {
  if (!Array.isArray(scopes)) throw new TwitchApiError('Permissions Twitch invalides.', { status: 400 });
  const normalized = [...new Set(scopes.map((scope) => String(scope || '').trim().toLowerCase()))];
  if (normalized.some((scope) => !/^[a-z0-9:_-]{2,100}$/.test(scope))) {
    throw new TwitchApiError('Permissions Twitch invalides.', { status: 400 });
  }
  return normalized.sort();
}

function normalizeToken(value, label = 'Jeton') {
  const token = String(value || '').trim();
  if (!token || token.length > 8_192 || /[\s\0]/.test(token)) {
    throw new TwitchApiError(`${label} Twitch invalide.`, { code: 'invalid_token', status: 401 });
  }
  return token;
}

function normalizeTwitchTokenSet(value, options = {}) {
  if (!value || typeof value !== 'object') {
    throw new TwitchApiError('Réponse de jeton Twitch invalide.', { code: 'invalid_token_response' });
  }

  const accessToken = normalizeToken(value.accessToken, "Jeton d'accès");
  const refreshToken = value.refreshToken
    ? normalizeToken(value.refreshToken, 'Jeton de renouvellement')
    : options.preservedRefreshToken
      ? normalizeToken(options.preservedRefreshToken, 'Jeton de renouvellement')
      : undefined;
  const expiresAt = value.expiresAt instanceof Date ? new Date(value.expiresAt) : new Date(value.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())) {
    throw new TwitchApiError("Expiration du jeton Twitch invalide.", { code: 'invalid_token_response' });
  }

  return {
    accessToken,
    refreshToken,
    expiresAt,
    scopes: normalizeScopes(value.scopes || []),
  };
}

function tokenSetFromResponse(value, now, preservedRefreshToken) {
  if (!value || typeof value !== 'object') {
    throw new TwitchApiError('Réponse OAuth Twitch invalide.', { code: 'invalid_response' });
  }

  const expiresIn = Number(value.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 31_536_000) {
    throw new TwitchApiError('Expiration OAuth Twitch invalide.', { code: 'invalid_response' });
  }

  return normalizeTwitchTokenSet({
    accessToken: value.access_token,
    refreshToken: value.refresh_token || preservedRefreshToken,
    expiresAt: new Date(now + expiresIn * 1_000),
    scopes: value.scope || [],
  });
}

function readHeader(headers, name) {
  if (!headers) return null;
  if (typeof headers.get === 'function') return headers.get(name);
  const expected = name.toLowerCase();
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === expected);
  return key ? String(headers[key]) : null;
}

function parseRetryAfter(value, now) {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1_000);
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return undefined;
  return Math.max(0, date - now);
}

function parseRateLimitHeaders(headers, now = Date.now()) {
  const remainingValue = readHeader(headers, 'ratelimit-remaining');
  const resetValue = readHeader(headers, 'ratelimit-reset');
  const remaining = /^\d+$/.test(String(remainingValue || '')) ? Number(remainingValue) : undefined;
  const resetSeconds = /^\d+$/.test(String(resetValue || '')) ? Number(resetValue) : undefined;
  const resetAt = resetSeconds === undefined ? undefined : resetSeconds * 1_000;
  const retryAfterMs = parseRetryAfter(readHeader(headers, 'retry-after'), now)
    ?? (remaining === 0 && resetAt ? Math.max(0, resetAt - now) : undefined);

  return { remaining, resetAt, retryAfterMs };
}

function normalizeHelixUrl(path) {
  const normalized = String(path || '').trim().replace(/^\/+/, '');
  if (
    !normalized
    || normalized.length > 2_048
    || /[\r\n\0\\]/.test(normalized)
    || /^[a-z][a-z0-9+.-]*:/i.test(normalized)
    || normalized.split(/[/?#]/).includes('..')
  ) {
    throw new TwitchApiError('Chemin Twitch Helix invalide.', { code: 'invalid_request', status: 400 });
  }

  const url = new URL(normalized, TWITCH_HELIX_URL);
  if (url.origin !== 'https://api.twitch.tv' || !url.pathname.startsWith('/helix/')) {
    throw new TwitchApiError('Chemin Twitch Helix invalide.', { code: 'invalid_request', status: 400 });
  }
  return url.toString();
}

async function readJsonResponse(response, label) {
  if (!response || typeof response.text !== 'function') {
    throw new TwitchApiError(`Réponse ${label} invalide.`, { code: 'invalid_response' });
  }
  let text;
  try {
    text = await response.text();
  } catch {
    throw new TwitchApiError(`Réponse ${label} illisible.`, { code: 'invalid_response' });
  }
  if (!text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error();
    return parsed;
  } catch {
    throw new TwitchApiError(`Réponse ${label} illisible.`, { code: 'invalid_response' });
  }
}

class TwitchApiClient {
  constructor(credentials = {}, dependencies = {}) {
    this.clientId = safeRequiredValue(credentials.clientId, 'Identifiant client', 255);
    this.clientSecret = safeRequiredValue(credentials.clientSecret, 'Secret client', 512);
    this.redirectUri = normalizeRedirectUri(credentials.redirectUri);
    this.fetchFn = dependencies.fetchFn || globalThis.fetch;
    if (typeof this.fetchFn !== 'function') {
      throw new TwitchApiError('Client HTTP Twitch indisponible.', { code: 'invalid_configuration', status: 500 });
    }
    this.now = dependencies.now || Date.now;
    this.refreshLeewayMs = dependencies.refreshLeewayMs === undefined
      ? 60_000
      : Number(dependencies.refreshLeewayMs);
    if (!Number.isInteger(this.refreshLeewayMs) || this.refreshLeewayMs < 0 || this.refreshLeewayMs > 600_000) {
      throw new TwitchApiError('Marge de renouvellement Twitch invalide.', {
        code: 'invalid_configuration',
        status: 500,
      });
    }
    this.onRateLimit = dependencies.onRateLimit;
    if (this.onRateLimit !== undefined && typeof this.onRateLimit !== 'function') {
      throw new TwitchApiError('Gestionnaire de limite Twitch invalide.', {
        code: 'invalid_configuration',
        status: 500,
      });
    }
    this.rateLimit = { remaining: undefined, resetAt: undefined, retryAfterMs: undefined };
  }

  getAuthorizationUrl(scopes, state) {
    const normalizedState = safeRequiredValue(state, 'État OAuth', 512);
    if (normalizedState.length < 16 || /\s/.test(normalizedState)) {
      throw new TwitchApiError('État OAuth Twitch invalide.', { code: 'invalid_request', status: 400 });
    }

    const url = new URL(TWITCH_AUTHORIZATION_URL);
    url.search = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: normalizeScopes(scopes).join(' '),
      state: normalizedState,
    }).toString();
    return url;
  }

  async exchangeCode(code) {
    const normalizedCode = normalizeToken(code, 'Code OAuth');
    return this.#requestToken({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code: normalizedCode,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });
  }

  async refreshToken(refreshToken) {
    const normalizedRefreshToken = normalizeToken(refreshToken, 'Jeton de renouvellement');
    return this.#requestToken({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: normalizedRefreshToken,
    }, normalizedRefreshToken);
  }

  async helix(path, accessToken, init = {}) {
    const now = this.now();
    if (this.rateLimit.remaining === 0 && this.rateLimit.resetAt > now) {
      throw new TwitchApiError('Limite Twitch atteinte. Réessayez plus tard.', {
        code: 'rate_limited',
        status: 429,
        retryAfterMs: this.rateLimit.resetAt - now,
      });
    }

    const url = normalizeHelixUrl(path);
    const token = normalizeToken(accessToken, "Jeton d'accès");
    const method = String(init.method || 'GET').toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      throw new TwitchApiError('Méthode Twitch Helix invalide.', { code: 'invalid_request', status: 400 });
    }

    const headers = new Headers(init.headers || {});
    headers.set('Client-Id', this.clientId);
    headers.set('Authorization', `Bearer ${token}`);

    let response;
    try {
      response = await this.fetchFn(url, { ...init, method, headers });
    } catch {
      throw new TwitchApiError('Connexion à Twitch impossible.', { code: 'network_error', status: 503 });
    }

    this.rateLimit = parseRateLimitHeaders(response.headers, now);
    if (this.onRateLimit) {
      try {
        this.onRateLimit({ ...this.rateLimit });
      } catch {
        // Un observateur de métriques ne doit jamais interrompre une requête Twitch valide.
      }
    }
    if (!response.ok) throw this.#responseError(response, 'Helix');
    if (response.status === 204) return null;
    return readJsonResponse(response, 'Twitch Helix');
  }

  async helixAuthenticated(path, dependencies = {}, init = {}) {
    if (typeof dependencies.loadTokenSet !== 'function' || typeof dependencies.saveTokenSet !== 'function') {
      throw new TwitchApiError('Gestion sécurisée des jetons Twitch indisponible.', {
        code: 'invalid_configuration',
        status: 500,
      });
    }

    let tokenSet;
    try {
      tokenSet = normalizeTwitchTokenSet(await dependencies.loadTokenSet());
    } catch (error) {
      if (error instanceof TwitchApiError) throw error;
      throw new TwitchApiError('Lecture sécurisée du jeton Twitch impossible.', {
        code: 'token_load_failed',
        status: 503,
      });
    }

    let refreshed = false;
    if (tokenSet.expiresAt.getTime() <= this.now() + this.refreshLeewayMs) {
      tokenSet = await this.#refreshAndPersist(tokenSet, dependencies);
      refreshed = true;
    }

    try {
      return await this.helix(path, tokenSet.accessToken, init);
    } catch (error) {
      if (!(error instanceof TwitchApiError) || error.status !== 401 || refreshed) throw error;
      tokenSet = await this.#refreshAndPersist(tokenSet, dependencies);
      return this.helix(path, tokenSet.accessToken, init);
    }
  }

  getRateLimitState() {
    return { ...this.rateLimit };
  }

  async #requestToken(form, preservedRefreshToken) {
    let response;
    try {
      response = await this.fetchFn(TWITCH_TOKEN_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(form),
      });
    } catch {
      throw new TwitchApiError('Connexion OAuth Twitch impossible.', { code: 'network_error', status: 503 });
    }

    if (!response.ok) throw this.#responseError(response, 'OAuth');
    const body = await readJsonResponse(response, 'OAuth Twitch');
    return tokenSetFromResponse(body, this.now(), preservedRefreshToken);
  }

  async #refreshAndPersist(tokenSet, dependencies) {
    if (!tokenSet.refreshToken) {
      throw new TwitchApiError('La connexion Twitch doit être renouvelée.', {
        code: 'reauthorization_required',
        status: 401,
      });
    }

    const refreshTokenFn = dependencies.refreshTokenFn || ((token) => this.refreshToken(token));
    if (typeof refreshTokenFn !== 'function') {
      throw new TwitchApiError('Renouvellement Twitch indisponible.', {
        code: 'invalid_configuration',
        status: 500,
      });
    }

    let refreshedTokenSet;
    try {
      refreshedTokenSet = normalizeTwitchTokenSet(
        await refreshTokenFn(tokenSet.refreshToken),
        { preservedRefreshToken: tokenSet.refreshToken },
      );
    } catch (error) {
      if (error instanceof TwitchApiError) throw error;
      throw new TwitchApiError('Renouvellement du jeton Twitch impossible.', {
        code: 'token_refresh_failed',
        status: 401,
      });
    }

    try {
      await dependencies.saveTokenSet(refreshedTokenSet);
    } catch {
      throw new TwitchApiError('Enregistrement sécurisé du jeton Twitch impossible.', {
        code: 'token_save_failed',
        status: 503,
      });
    }
    return refreshedTokenSet;
  }

  #responseError(response, operation) {
    const rateLimit = parseRateLimitHeaders(response.headers, this.now());
    if (response.status === 429) {
      return new TwitchApiError('Limite Twitch atteinte. Réessayez plus tard.', {
        code: 'rate_limited',
        status: 429,
        retryAfterMs: rateLimit.retryAfterMs,
      });
    }
    if (response.status === 401 || response.status === 403) {
      return new TwitchApiError(`Autorisation Twitch refusée pour ${operation}.`, {
        code: 'unauthorized',
        status: response.status,
      });
    }
    return new TwitchApiError(`Twitch ${operation} a refusé la requête.`, {
      code: 'upstream_error',
      status: response.status || 502,
    });
  }
}

module.exports = {
  TWITCH_AUTHORIZATION_URL,
  TWITCH_HELIX_URL,
  TWITCH_TOKEN_URL,
  TwitchApiClient,
  TwitchApiError,
  normalizeTwitchTokenSet,
  parseRateLimitHeaders,
};
