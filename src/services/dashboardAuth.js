const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { database } = require('../database/database');

const defaultSessionHours = 24;
const SESSION_COOKIE = 'fyxbot_session';
const HOST_SESSION_COOKIE = '__Host-fyxbot_session';
const LEGACY_SESSION_COOKIE = 'nexora_session';
const OAUTH_STATE_COOKIE = 'fyxbot_oauth_state';
const HOST_OAUTH_STATE_COOKIE = '__Host-fyxbot_oauth_state';

function settings() {
  const apiPort = Number(process.env.DASHBOARD_API_PORT || process.env.PORT || 3001);
  const environment = process.env.NODE_ENV?.trim() || 'development';
  const sessionHours = Math.min(Math.max(Number(process.env.DASHBOARD_SESSION_HOURS) || defaultSessionHours, 1), 168);
  const panelUrl = process.env.DASHBOARD_PUBLIC_URL?.trim() || 'http://127.0.0.1:3000';
  const callbackUrl = process.env.DISCORD_OAUTH_CALLBACK?.trim() || `http://127.0.0.1:${apiPort}/api/auth/callback`;
  const clientId = process.env.CLIENT_ID?.trim();
  const clientSecret = process.env.DISCORD_CLIENT_SECRET?.trim();
  const productionUrlsAreSecure = environment !== 'production'
    || (panelUrl.startsWith('https://') && callbackUrl.startsWith('https://'));
  return {
    enabled: Boolean(clientId && clientSecret && productionUrlsAreSecure),
    configurationValid: Boolean(clientId && clientSecret && productionUrlsAreSecure),
    allowUnauthenticatedLocal: environment !== 'production' && process.env.ALLOW_UNAUTHENTICATED_LOCAL === 'true',
    clientId,
    clientSecret,
    environment,
    panelUrl,
    callbackUrl,
    secureCookies: panelUrl.startsWith('https://') || callbackUrl.startsWith('https://'),
    sessionLifetime: sessionHours * 60 * 60 * 1000,
  };
}

function sessionCookieName() {
  return settings().secureCookies ? HOST_SESSION_COOKIE : SESSION_COOKIE;
}

function oauthStateCookieName() {
  return settings().secureCookies ? HOST_OAUTH_STATE_COOKIE : OAUTH_STATE_COOKIE;
}

function cookie(value, maxAge, name = sessionCookieName()) {
  const secure = settings().secureCookies ? '; Secure' : '';
  return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}

function parseCookie(request, name) {
  const entry = String(request.headers.cookie || '').split(';').map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : null;
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function safeEqual(left, right) {
  if (!left || !right) return false;
  return timingSafeEqual(
    createHash('sha256').update(String(left)).digest(),
    createHash('sha256').update(String(right)).digest(),
  );
}

function readFirstCookie(request, names) {
  for (const name of names) {
    const value = parseCookie(request, name);
    if (value) return value;
  }
  return null;
}

function purgeExpiredDashboardAuth(targetDatabase = database, now = Date.now()) {
  const sessions = targetDatabase.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(now).changes;
  const oauthStates = targetDatabase.prepare('DELETE FROM dashboard_oauth_states WHERE expires_at <= ?').run(now).changes;
  return { oauthStates, sessions };
}

function startDashboardAuthCleanup({ targetDatabase = database, intervalMs = 15 * 60 * 1000 } = {}) {
  purgeExpiredDashboardAuth(targetDatabase);
  const timer = setInterval(() => purgeExpiredDashboardAuth(targetDatabase), intervalMs);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}

function getSession(request) {
  const now = Date.now();
  purgeExpiredDashboardAuth(database, now);
  for (const name of [HOST_SESSION_COOKIE, SESSION_COOKIE, LEGACY_SESSION_COOKIE]) {
    const token = parseCookie(request, name);
    if (!token) continue;
    const tokenHash = hash(token);
    const row = database.prepare('SELECT value, expires_at FROM dashboard_sessions WHERE token_hash = ?').get(tokenHash);
    if (!row || row.expires_at < now) {
      if (row) database.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(tokenHash);
      continue;
    }
    try {
      const session = JSON.parse(row.value);
      if (!session.csrfToken) {
        session.csrfToken = randomBytes(32).toString('hex');
        database.prepare('UPDATE dashboard_sessions SET value = ? WHERE token_hash = ?').run(JSON.stringify(session), tokenHash);
      }
      return session;
    } catch {
      database.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(tokenHash);
    }
  }
  return null;
}

function storeOAuthState(state, expiresAt) {
  purgeExpiredDashboardAuth(database);
  database.prepare('INSERT INTO dashboard_oauth_states (state_hash, expires_at) VALUES (?, ?)').run(hash(state), expiresAt);
}

function consumeOAuthState(state) {
  if (!state) return false;
  const stateHash = hash(state);
  const now = Date.now();
  database.exec('BEGIN IMMEDIATE');
  try {
    const row = database.prepare('SELECT expires_at FROM dashboard_oauth_states WHERE state_hash = ?').get(stateHash);
    database.prepare('DELETE FROM dashboard_oauth_states WHERE state_hash = ?').run(stateHash);
    database.prepare('DELETE FROM dashboard_oauth_states WHERE expires_at < ?').run(now);
    database.exec('COMMIT');
    return Boolean(row && row.expires_at >= now);
  } catch (error) {
    try { database.exec('ROLLBACK'); } catch { /* La transaction a pu être annulée automatiquement. */ }
    throw error;
  }
}

function startLogin(response) {
  const config = settings();
  if (!config.enabled) throw new Error('La connexion Discord n’est pas configurée.');
  const state = randomBytes(24).toString('hex');
  storeOAuthState(state, Date.now() + 10 * 60 * 1000);
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.callbackUrl);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  const activeCookie = oauthStateCookieName();
  response.writeHead(302, {
    Location: url.toString(),
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Set-Cookie': [
      cookie(state, 600, activeCookie),
      ...[HOST_OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE]
        .filter((name) => name !== activeCookie)
        .map((name) => cookie('', 0, name)),
    ],
  });
  response.end();
}

async function finishLogin(request, url, response) {
  const config = settings();
  if (!config.enabled) throw new Error('La connexion Discord n’est pas configurée.');
  const state = url.searchParams.get('state');
  const code = url.searchParams.get('code');
  const browserState = readFirstCookie(request, [HOST_OAUTH_STATE_COOKIE, OAUTH_STATE_COOKIE]);
  if (!state || !code || !safeEqual(state, browserState) || !consumeOAuthState(state)) {
    throw new Error('Connexion Discord expirée ou invalide.');
  }
  const tokenResponse = await fetch('https://discord.com/api/v10/oauth2/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: 'authorization_code', code, redirect_uri: config.callbackUrl }),
  });
  if (!tokenResponse.ok) throw new Error('Discord a refusé la connexion. Vérifiez l’adresse de redirection.');
  const token = await tokenResponse.json();
  const headers = { Authorization: `Bearer ${token.access_token}` };
  const [userResponse, guildsResponse] = await Promise.all([fetch('https://discord.com/api/v10/users/@me', { headers }), fetch('https://discord.com/api/v10/users/@me/guilds', { headers })]);
  if (!userResponse.ok || !guildsResponse.ok) throw new Error('Impossible de lire le compte Discord.');
  const [user, guilds] = await Promise.all([userResponse.json(), guildsResponse.json()]);
  const manageableGuildIds = guilds.filter((guild) => guild.owner || (BigInt(guild.permissions) & 0x28n) !== 0n).map((guild) => guild.id);
  const sessionToken = randomBytes(32).toString('hex');
  const session = {
    user: { id: user.id, username: user.global_name || user.username, avatar: user.avatar },
    manageableGuildIds,
    authenticatedAt: Date.now(),
    csrfToken: randomBytes(32).toString('hex'),
  };
  database.prepare('INSERT INTO dashboard_sessions (token_hash, value, expires_at) VALUES (?, ?, ?)').run(hash(sessionToken), JSON.stringify(session), Date.now() + config.sessionLifetime);
  const activeSessionCookie = sessionCookieName();
  response.writeHead(302, {
    Location: config.panelUrl,
    'Cache-Control': 'no-store',
    Pragma: 'no-cache',
    'Set-Cookie': [
      cookie(sessionToken, config.sessionLifetime / 1000, activeSessionCookie),
      ...[HOST_SESSION_COOKIE, SESSION_COOKIE, LEGACY_SESSION_COOKIE]
        .filter((name) => name !== activeSessionCookie)
        .map((name) => cookie('', 0, name)),
      cookie('', 0, HOST_OAUTH_STATE_COOKIE),
      cookie('', 0, OAUTH_STATE_COOKIE),
    ],
  });
  response.end();
}

function csrfTokenMatches(request, session) {
  const provided = request.headers['x-fyxbot-csrf'];
  return typeof provided === 'string' && safeEqual(provided, session?.csrfToken);
}

function logout(request, response, origin) {
  for (const name of [HOST_SESSION_COOKIE, SESSION_COOKIE, LEGACY_SESSION_COOKIE]) {
    const token = parseCookie(request, name);
    if (token) database.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(hash(token));
  }
  response.writeHead(200, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Cache-Control': 'no-store',
    'Set-Cookie': [HOST_SESSION_COOKIE, SESSION_COOKIE, LEGACY_SESSION_COOKIE].map((name) => cookie('', 0, name)),
  });
  response.end(JSON.stringify({ ok: true }));
}

module.exports = {
  csrfTokenMatches,
  finishLogin,
  getSession,
  logout,
  purgeExpiredDashboardAuth,
  settings,
  startDashboardAuthCleanup,
  startLogin,
};
