const { getServerSetupConfig, setServerSetupConfig } = require('../database/serverSetupStore');
const { backupServer } = require('./serverBackup');
const { setupServer } = require('./serverSetup');

const PERMISSION_MODEL_VERSION = 2;
const DISABLED_SCOPES = new Set(['', 'off', 'disabled', 'none']);

function normalizedScope(value) {
  return String(value || '').trim();
}

function permissionMigrationEnabled(scope) {
  return !DISABLED_SCOPES.has(normalizedScope(scope).toLowerCase());
}

function permissionMigrationTargets(client, scope) {
  const selectedScope = normalizedScope(scope);
  if (!permissionMigrationEnabled(selectedScope)) return [];
  const guilds = [...client.guilds.cache.values()].sort((left, right) => {
    if (left.name === 'FyxBot Développement') return -1;
    if (right.name === 'FyxBot Développement') return 1;
    return left.name.localeCompare(right.name, 'fr');
  });
  if (selectedScope.toLowerCase() === 'all') return guilds;
  return guilds.filter((guild) => guild.id === selectedScope || guild.name === selectedScope);
}

async function runPermissionMigration(client, options = {}) {
  const scope = normalizedScope(options.scope ?? process.env.FYXBOT_PERMISSION_MIGRATION_SCOPE);
  const dependencies = {
    getConfig: options.getConfig || getServerSetupConfig,
    setConfig: options.setConfig || setServerSetupConfig,
    backup: options.backup || backupServer,
    synchronize: options.synchronize || setupServer,
    logger: options.logger || console,
  };
  if (!permissionMigrationEnabled(scope)) {
    return { enabled: false, scope, targets: 0, migrated: [], skipped: [], errors: [] };
  }

  const targets = permissionMigrationTargets(client, scope);
  const result = { enabled: true, scope, targets: targets.length, migrated: [], skipped: [], errors: [] };
  if (targets.length === 0) {
    result.errors.push({ guild: scope, error: 'Aucun serveur ne correspond au périmètre demandé.' });
    return result;
  }

  for (const cachedGuild of targets) {
    try {
      const config = await dependencies.getConfig(cachedGuild.id);
      if (!config?.activeBlueprint) {
        result.skipped.push({ guild: cachedGuild.name, reason: 'Aucune configuration /setup active.' });
        continue;
      }
      if (Number(config.permissionModelVersion || 0) >= PERMISSION_MODEL_VERSION) {
        result.skipped.push({ guild: cachedGuild.name, reason: 'Permissions déjà synchronisées.' });
        continue;
      }

      const guild = typeof cachedGuild.fetch === 'function' ? await cachedGuild.fetch() : cachedGuild;
      const backupFile = await dependencies.backup(guild);
      const operation = await dependencies.synchronize(guild, {
        blueprint: config.activeBlueprint,
        synchronizePermissions: true,
      });
      const missing = Number(operation.analysis?.totals?.missing || 0);
      const permissionIssues = Number(operation.analysis?.totals?.permissionIssues || 0);
      if (missing > 0 || permissionIssues > 0) {
        throw new Error(`Vérification incomplète : ${missing} élément(s) manquant(s), ${permissionIssues} problème(s) de permissions.`);
      }

      const latestConfig = await dependencies.getConfig(guild.id) || config;
      await dependencies.setConfig(guild.id, {
        ...latestConfig,
        permissionModelVersion: PERMISSION_MODEL_VERSION,
        permissionModelMigratedAt: new Date().toISOString(),
        permissionModelBackupFile: backupFile,
      });
      result.migrated.push({
        guild: guild.name,
        backupFile,
        created: Number(operation.created || 0),
        updated: Number(operation.updated || 0),
      });
    } catch (error) {
      const failure = { guild: cachedGuild.name, error: error?.message || String(error) };
      result.errors.push(failure);
      dependencies.logger.error('[FyxBot][Permissions v2] Migration interrompue :', failure);
      break;
    }
  }
  return result;
}

module.exports = {
  PERMISSION_MODEL_VERSION,
  permissionMigrationEnabled,
  permissionMigrationTargets,
  runPermissionMigration,
};
