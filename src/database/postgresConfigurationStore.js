function tableName(schema) {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) {
    throw new Error('Nom de schéma PostgreSQL invalide.');
  }
  return `"${schema}"."configurations"`;
}

function createPostgresConfigurationStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  const table = tableName(schema);

  async function withGuildWrite(guildId, operation) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`fyxbot:configurations:${guildId}`]);
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* La connexion peut déjà être fermée. */ }
      throw error;
    } finally {
      client.release();
    }
  }

  async function getConfiguration(guildId, section) {
    const result = await pool.query(`SELECT value FROM ${table} WHERE guild_id = $1 AND section = $2`, [guildId, section]);
    return result.rows[0] ? JSON.parse(result.rows[0].value) : null;
  }

  async function setConfiguration(guildId, section, value) {
    return withGuildWrite(guildId, async (client) => {
      await client.query(`INSERT INTO ${table} (guild_id, section, value, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, section) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [guildId, section, JSON.stringify(value), new Date().toISOString()]);
      return value;
    });
  }

  async function updateConfiguration(guildId, section, updater) {
    if (typeof updater !== 'function') throw new TypeError('Une fonction de mise à jour est requise.');
    return withGuildWrite(guildId, async (client) => {
      const current = await client.query(`SELECT value FROM ${table} WHERE guild_id = $1 AND section = $2`, [guildId, section]);
      const value = await updater(current.rows[0] ? JSON.parse(current.rows[0].value) : null);
      if (value === undefined) return current.rows[0] ? JSON.parse(current.rows[0].value) : null;
      await client.query(`INSERT INTO ${table} (guild_id, section, value, updated_at)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, section) DO UPDATE
        SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [guildId, section, JSON.stringify(value), new Date().toISOString()]);
      return value;
    });
  }

  async function getGuildConfigurations(guildId) {
    const result = await pool.query(`SELECT section, value FROM ${table} WHERE guild_id = $1 ORDER BY section`, [guildId]);
    return result.rows.map((row) => ({ section: row.section, value: JSON.parse(row.value) }));
  }

  async function replaceGuildConfigurations(guildId, configurations) {
    await withGuildWrite(guildId, async (client) => {
      await client.query(`DELETE FROM ${table} WHERE guild_id = $1`, [guildId]);
      const now = new Date().toISOString();
      for (const configuration of configurations || []) {
        if (!configuration?.section) continue;
        await client.query(`INSERT INTO ${table} (guild_id, section, value, updated_at) VALUES ($1, $2, $3, $4)`,
          [guildId, configuration.section, JSON.stringify(configuration.value ?? null), now]);
      }
    });
  }

  return {
    getConfiguration,
    getGuildConfigurations,
    replaceGuildConfigurations,
    setConfiguration,
    updateConfiguration,
  };
}

module.exports = { createPostgresConfigurationStore, tableName };
