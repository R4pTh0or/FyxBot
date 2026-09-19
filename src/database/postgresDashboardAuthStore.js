function createPostgresDashboardAuthStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new TypeError('Une connexion PostgreSQL est requise.');
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const sessions = `"${schema}"."dashboard_sessions"`;
  const states = `"${schema}"."dashboard_oauth_states"`;

  async function purgeExpiredDashboardAuth(now = Date.now()) {
    const [sessionResult, stateResult] = await Promise.all([
      pool.query(`DELETE FROM ${sessions} WHERE expires_at <= $1`, [now]),
      pool.query(`DELETE FROM ${states} WHERE expires_at <= $1`, [now]),
    ]);
    return { sessions: sessionResult.rowCount, oauthStates: stateResult.rowCount };
  }

  async function getSession(tokenHash, now = Date.now()) {
    const result = await pool.query(`SELECT value FROM ${sessions}
      WHERE token_hash = $1 AND expires_at > $2`, [tokenHash, now]);
    const row = result.rows[0];
    if (!row) return null;
    try {
      const session = JSON.parse(row.value);
      return session && typeof session === 'object' && !Array.isArray(session) ? session : null;
    } catch {
      await deleteSession(tokenHash);
      return null;
    }
  }

  async function createSession(tokenHash, value, expiresAt) {
    await pool.query(`INSERT INTO ${sessions} (token_hash, value, expires_at)
      VALUES ($1, $2, $3)`, [tokenHash, JSON.stringify(value), expiresAt]);
  }

  async function updateSession(tokenHash, value) {
    const result = await pool.query(`UPDATE ${sessions} SET value = $1 WHERE token_hash = $2
      RETURNING token_hash`, [JSON.stringify(value), tokenHash]);
    return result.rows.length === 1;
  }

  async function deleteSession(tokenHash) {
    const result = await pool.query(`DELETE FROM ${sessions} WHERE token_hash = $1 RETURNING token_hash`, [tokenHash]);
    return result.rows.length === 1;
  }

  async function storeOAuthState(stateHash, expiresAt) {
    await pool.query(`INSERT INTO ${states} (state_hash, expires_at) VALUES ($1, $2)`, [stateHash, expiresAt]);
  }

  async function consumeOAuthState(stateHash, now = Date.now()) {
    const result = await pool.query(`DELETE FROM ${states}
      WHERE state_hash = $1 RETURNING expires_at`, [stateHash]);
    return Boolean(result.rows[0] && Number(result.rows[0].expires_at) >= now);
  }

  async function removeGuildFromSessions(guildId) {
    // Le format historique des sessions est JSON textuel ; verrouiller les lignes
    // une à une évite d'écraser une mise à jour simultanée de la session.
    if (!pool.connect) throw new TypeError('Une connexion transactionnelle PostgreSQL est requise.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(`SELECT token_hash, value FROM ${sessions} FOR UPDATE`);
      let updated = 0;
      for (const row of result.rows) {
        let session;
        try { session = JSON.parse(row.value); } catch { continue; }
        const current = Array.isArray(session?.manageableGuildIds) ? session.manageableGuildIds : [];
        const manageableGuildIds = current.filter((candidate) => candidate !== guildId);
        if (manageableGuildIds.length === current.length) continue;
        await client.query(`UPDATE ${sessions} SET value = $1 WHERE token_hash = $2`,
          [JSON.stringify({ ...session, manageableGuildIds }), row.token_hash]);
        updated += 1;
      }
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion déjà fermée. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    consumeOAuthState, createSession, deleteSession, getSession, purgeExpiredDashboardAuth,
    removeGuildFromSessions, storeOAuthState, updateSession,
  };
}

module.exports = { createPostgresDashboardAuthStore };
