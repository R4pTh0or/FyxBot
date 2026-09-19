function createSqliteDashboardAuthStore(database) {
  if (!database || typeof database.prepare !== 'function') {
    throw new TypeError('Une base SQLite est requise.');
  }

  function purgeExpiredDashboardAuth(now = Date.now()) {
    const sessions = database.prepare('DELETE FROM dashboard_sessions WHERE expires_at <= ?').run(now).changes;
    const oauthStates = database.prepare('DELETE FROM dashboard_oauth_states WHERE expires_at <= ?').run(now).changes;
    return { oauthStates, sessions };
  }

  function getSession(tokenHash, now = Date.now()) {
    const row = database.prepare('SELECT value, expires_at FROM dashboard_sessions WHERE token_hash = ?').get(tokenHash);
    if (!row || row.expires_at <= now) {
      if (row) deleteSession(tokenHash);
      return null;
    }
    try {
      const session = JSON.parse(row.value);
      return session && typeof session === 'object' && !Array.isArray(session) ? session : null;
    } catch {
      deleteSession(tokenHash);
      return null;
    }
  }

  function createSession(tokenHash, value, expiresAt) {
    database.prepare('INSERT INTO dashboard_sessions (token_hash, value, expires_at) VALUES (?, ?, ?)')
      .run(tokenHash, JSON.stringify(value), expiresAt);
  }

  function updateSession(tokenHash, value) {
    return database.prepare('UPDATE dashboard_sessions SET value = ? WHERE token_hash = ?')
      .run(JSON.stringify(value), tokenHash).changes === 1;
  }

  function deleteSession(tokenHash) {
    return database.prepare('DELETE FROM dashboard_sessions WHERE token_hash = ?').run(tokenHash).changes === 1;
  }

  function storeOAuthState(stateHash, expiresAt) {
    database.prepare('INSERT INTO dashboard_oauth_states (state_hash, expires_at) VALUES (?, ?)').run(stateHash, expiresAt);
  }

  function consumeOAuthState(stateHash, now = Date.now()) {
    database.exec('BEGIN IMMEDIATE');
    try {
      const row = database.prepare('SELECT expires_at FROM dashboard_oauth_states WHERE state_hash = ?').get(stateHash);
      database.prepare('DELETE FROM dashboard_oauth_states WHERE state_hash = ?').run(stateHash);
      database.prepare('DELETE FROM dashboard_oauth_states WHERE expires_at < ?').run(now);
      database.exec('COMMIT');
      return Boolean(row && row.expires_at >= now);
    } catch (error) {
      try { database.exec('ROLLBACK'); } catch { /* Transaction déjà annulée. */ }
      throw error;
    }
  }

  return {
    consumeOAuthState,
    createSession,
    deleteSession,
    getSession,
    purgeExpiredDashboardAuth,
    storeOAuthState,
    updateSession,
  };
}

module.exports = { createSqliteDashboardAuthStore };
