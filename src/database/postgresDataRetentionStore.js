const { randomUUID } = require('node:crypto');

function createPostgresDataRetentionStore(pool, { schema = 'fyxbot' } = {}) {
  if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
    throw new TypeError('Une connexion PostgreSQL est requise.');
  }
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Nom de schéma PostgreSQL invalide.');
  const table = (name) => `"${schema}"."${name}"`;
  const installations = table('guild_installations');
  const sessions = table('dashboard_sessions');
  const supportRequests = table('support_requests');
  const supportMessages = table('support_messages');
  const supportEvents = table('support_events');
  const giveaways = table('community_giveaways');
  const giveawayEntries = table('community_giveaway_entries');

  async function purgeGuildDatabaseData(guildId, {
    anonymousId = () => `removed:${randomUUID()}`,
    now = new Date().toISOString(),
  } = {}) {
    if (!/^\d{17,20}$/.test(String(guildId))) throw new Error('Identifiant de serveur invalide.');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const installation = await client.query(`SELECT first_seen_at FROM ${installations}
        WHERE guild_id = $1 FOR UPDATE`, [guildId]);
      const counts = {};
      const simpleTables = [
        ['configurations', 'configurations'],
        ['warnings', 'warnings'],
        ['auditLogs', 'audit_logs'],
        ['changeHistory', 'change_history'],
        ['suggestions', 'suggestions'],
        ['commandUsage', 'command_usage'],
        ['activationProgress', 'guild_activation_progress'],
        ['premiumEntitlements', 'premium_entitlements'],
        ['premiumGuildLinks', 'premium_user_guilds'],
        ['twitchConnections', 'twitch_connections'],
        ['twitchOAuthStates', 'twitch_oauth_states'],
        ['twitchCommands', 'twitch_custom_commands'],
        ['twitchChatConfig', 'twitch_chat_config'],
        ['twitchRuntime', 'twitch_runtime_status'],
        ['twitchProcessedMessages', 'twitch_processed_messages'],
        ['twitchEventSubMessages', 'twitch_eventsub_messages'],
      ];
      for (const [label, name] of simpleTables) {
        const result = await client.query(`DELETE FROM ${table(name)} WHERE guild_id = $1`, [guildId]);
        counts[label] = result.rowCount;
      }

      const supportIdsResult = await client.query(`SELECT id FROM ${supportRequests} WHERE guild_id = $1 FOR UPDATE`, [guildId]);
      const supportIds = supportIdsResult.rows.map((row) => row.id);
      counts.supportMessages = 0;
      counts.supportEvents = 0;
      if (supportIds.length) {
        const messages = await client.query(`DELETE FROM ${supportMessages} WHERE request_id = ANY($1::text[])`, [supportIds]);
        const events = await client.query(`DELETE FROM ${supportEvents} WHERE request_id = ANY($1::text[])`, [supportIds]);
        counts.supportMessages = messages.rowCount;
        counts.supportEvents = events.rowCount;
      }
      counts.supportRequests = (await client.query(`DELETE FROM ${supportRequests} WHERE guild_id = $1`, [guildId])).rowCount;

      const giveawayIdsResult = await client.query(`SELECT giveaway_id FROM ${giveaways}
        WHERE guild_id = $1 FOR UPDATE`, [guildId]);
      const giveawayIds = giveawayIdsResult.rows.map((row) => row.giveaway_id);
      counts.giveawayEntries = giveawayIds.length
        ? (await client.query(`DELETE FROM ${giveawayEntries} WHERE giveaway_id = ANY($1::text[])`, [giveawayIds])).rowCount
        : 0;
      counts.giveaways = (await client.query(`DELETE FROM ${giveaways} WHERE guild_id = $1`, [guildId])).rowCount;

      const sessionRows = await client.query(`SELECT token_hash, value FROM ${sessions} FOR UPDATE`);
      counts.sessions = 0;
      for (const row of sessionRows.rows) {
        let session;
        try { session = JSON.parse(row.value); } catch { continue; }
        const current = Array.isArray(session?.manageableGuildIds) ? session.manageableGuildIds : [];
        const manageableGuildIds = current.filter((candidate) => candidate !== guildId);
        if (manageableGuildIds.length === current.length) continue;
        await client.query(`UPDATE ${sessions} SET value = $1 WHERE token_hash = $2`,
          [JSON.stringify({ ...session, manageableGuildIds }), row.token_hash]);
        counts.sessions += 1;
      }
      await client.query(`DELETE FROM ${installations} WHERE guild_id = $1`, [guildId]);
      await client.query(`INSERT INTO ${installations}
        (guild_id, guild_name, member_count, first_seen_at, last_seen_at, removed_at)
        VALUES ($1, 'Serveur supprimé', 0, $2, $3, $3)`,
      [anonymousId(), installation.rows[0]?.first_seen_at || now, now]);
      await client.query('COMMIT');
      return counts;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { /* Connexion fermée. */ }
      throw error;
    } finally { client.release(); }
  }

  return { purgeGuildDatabaseData };
}

module.exports = { createPostgresDataRetentionStore };
