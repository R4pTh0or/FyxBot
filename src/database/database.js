const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { getDataDirectory } = require('./dataDirectory');

const dataDirectory = getDataDirectory();
const databaseFile = fs.existsSync(path.join(dataDirectory, 'fyxbot.sqlite'))
  || !fs.existsSync(path.join(dataDirectory, 'nexora.sqlite'))
  ? path.join(dataDirectory, 'fyxbot.sqlite')
  : path.join(dataDirectory, 'nexora.sqlite');
const database = new DatabaseSync(databaseFile);
try { fs.chmodSync(databaseFile, 0o600); } catch { /* Certains volumes Windows ne prennent pas en charge chmod. */ }
database.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA secure_delete = ON;
  CREATE TABLE IF NOT EXISTS configurations (guild_id TEXT NOT NULL, section TEXT NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (guild_id, section));
  CREATE TABLE IF NOT EXISTS warnings (id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, user_id TEXT NOT NULL, moderator_id TEXT NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS warnings_lookup ON warnings(guild_id, user_id, created_at);
  CREATE TABLE IF NOT EXISTS dashboard_sessions (token_hash TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS dashboard_oauth_states (state_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, color INTEGER NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS audit_logs_guild ON audit_logs(guild_id, id DESC);
  CREATE TABLE IF NOT EXISTS suggestions (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    anonymous INTEGER NOT NULL DEFAULT 0,
    idea TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS suggestions_guild ON suggestions(guild_id, created_at DESC);
  CREATE TABLE IF NOT EXISTS guild_installations (
    guild_id TEXT PRIMARY KEY, guild_name TEXT NOT NULL, member_count INTEGER NOT NULL DEFAULT 0,
    first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, removed_at TEXT
  );
  CREATE TABLE IF NOT EXISTS creator_metrics (
    day TEXT PRIMARY KEY, guild_count INTEGER NOT NULL, member_count INTEGER NOT NULL, recorded_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS command_usage (
    day TEXT NOT NULL, guild_id TEXT NOT NULL, command_name TEXT NOT NULL,
    success_count INTEGER NOT NULL DEFAULT 0, failure_count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (day, guild_id, command_name)
  );
  CREATE INDEX IF NOT EXISTS command_usage_day ON command_usage(day);
  CREATE TABLE IF NOT EXISTS guild_activation_progress (
    guild_id TEXT PRIMARY KEY,
    tracking_started_at TEXT NOT NULL,
    last_observed_at TEXT,
    completed_steps INTEGER NOT NULL DEFAULT 0,
    step_keys TEXT NOT NULL DEFAULT '[]',
    activated_at TEXT,
    baseline INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS guild_activation_observed ON guild_activation_progress(last_observed_at);
  CREATE TABLE IF NOT EXISTS premium_entitlements (
    entitlement_id TEXT PRIMARY KEY,
    sku_id TEXT NOT NULL,
    user_id TEXT,
    guild_id TEXT,
    starts_at TEXT,
    ends_at TEXT,
    deleted INTEGER NOT NULL DEFAULT 0,
    test INTEGER NOT NULL DEFAULT 0,
    observed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS premium_entitlements_guild ON premium_entitlements(guild_id, sku_id, deleted, ends_at);
  CREATE TABLE IF NOT EXISTS premium_founder_trials (
    user_id TEXT PRIMARY KEY,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    claimed_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS premium_founder_trials_ends ON premium_founder_trials(ends_at);
  CREATE TABLE IF NOT EXISTS premium_user_guilds (
    user_id TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    linked_at TEXT NOT NULL,
    PRIMARY KEY (user_id, guild_id)
  );
  CREATE INDEX IF NOT EXISTS premium_user_guilds_guild ON premium_user_guilds(guild_id, user_id);
  CREATE TABLE IF NOT EXISTS community_giveaways (
    giveaway_id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    prize TEXT NOT NULL,
    winner_count INTEGER NOT NULL,
    ends_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL,
    ended_at TEXT
  );
  CREATE INDEX IF NOT EXISTS community_giveaways_due ON community_giveaways(status, ends_at);
  CREATE INDEX IF NOT EXISTS community_giveaways_guild ON community_giveaways(guild_id, status, ends_at);
  CREATE TABLE IF NOT EXISTS community_giveaway_entries (
    giveaway_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (giveaway_id, user_id),
    FOREIGN KEY (giveaway_id) REFERENCES community_giveaways(giveaway_id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS community_giveaway_entries_lookup ON community_giveaway_entries(giveaway_id, joined_at);
  CREATE TABLE IF NOT EXISTS support_requests (
    id TEXT PRIMARY KEY,
    guild_id TEXT NOT NULL,
    guild_name TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    requester_name TEXT NOT NULL,
    category TEXT NOT NULL,
    subject TEXT NOT NULL,
    priority TEXT NOT NULL DEFAULT 'normal',
    status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_message_at TEXT NOT NULL,
    closed_at TEXT
  );
  CREATE INDEX IF NOT EXISTS support_requests_requester ON support_requests(requester_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS support_requests_guild ON support_requests(guild_id, updated_at DESC);
  CREATE INDEX IF NOT EXISTS support_requests_status ON support_requests(status, priority, updated_at DESC);
  CREATE TABLE IF NOT EXISTS support_messages (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    author_name TEXT NOT NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS support_messages_request ON support_messages(request_id, created_at);
  CREATE TABLE IF NOT EXISTS support_events (
    id TEXT PRIMARY KEY,
    request_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    event_type TEXT NOT NULL,
    detail TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (request_id) REFERENCES support_requests(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS support_events_request ON support_events(request_id, created_at);
  CREATE TABLE IF NOT EXISTS support_staff (
    user_id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('moderator', 'administrator')),
    granted_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS support_staff_role ON support_staff(role, updated_at DESC);
`);

const premiumEntitlementColumns = new Set(database.prepare('PRAGMA table_info(premium_entitlements)').all().map((column) => column.name));
if (!premiumEntitlementColumns.has('user_id')) {
  database.exec('ALTER TABLE premium_entitlements ADD COLUMN user_id TEXT;');
}
database.exec('CREATE INDEX IF NOT EXISTS premium_entitlements_user ON premium_entitlements(user_id, sku_id, deleted, ends_at);');

function getConfiguration(guildId, section) {
  const row = database.prepare('SELECT value FROM configurations WHERE guild_id = ? AND section = ?').get(guildId, section);
  return row ? JSON.parse(row.value) : null;
}
function setConfiguration(guildId, section, value) {
  database.prepare(`INSERT INTO configurations (guild_id, section, value, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(guild_id, section) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .run(guildId, section, JSON.stringify(value), new Date().toISOString());
  return value;
}
function getGuildConfigurations(guildId) {
  return database.prepare('SELECT section, value FROM configurations WHERE guild_id = ? ORDER BY section').all(guildId)
    .map((row) => ({ section: row.section, value: JSON.parse(row.value) }));
}
function replaceGuildConfigurations(guildId, configurations) {
  const remove = database.prepare('DELETE FROM configurations WHERE guild_id = ?');
  const insert = database.prepare('INSERT INTO configurations (guild_id, section, value, updated_at) VALUES (?, ?, ?, ?)');
  database.exec('BEGIN IMMEDIATE');
  try {
    remove.run(guildId);
    const now = new Date().toISOString();
    for (const configuration of configurations || []) {
      if (!configuration?.section) continue;
      insert.run(guildId, configuration.section, JSON.stringify(configuration.value ?? null), now);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
function migrateJsonConfigurations() {
  const files = { logs: 'logs.json', tickets: 'tickets.json', suggestions: 'suggestions.json', welcome: 'welcome.json' };
  const insert = database.prepare('INSERT OR IGNORE INTO configurations (guild_id, section, value, updated_at) VALUES (?, ?, ?, ?)');
  for (const [section, filename] of Object.entries(files)) {
    const file = path.join(dataDirectory, filename);
    if (!fs.existsSync(file)) continue;
    const records = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const [guildId, value] of Object.entries(records)) insert.run(guildId, section, JSON.stringify(value), value.updatedAt || new Date().toISOString());
  }
}
migrateJsonConfigurations();
module.exports = {
  database,
  getConfiguration,
  getGuildConfigurations,
  replaceGuildConfigurations,
  setConfiguration,
};
