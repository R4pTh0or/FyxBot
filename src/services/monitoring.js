const SEVERITY = Object.freeze({
  OK: 'ok',
  MINOR: 'minor',
  MAJOR: 'major',
});

const MAJOR_LOG_PATTERNS = Object.freeze([
  /\b(?:FAILED|CRASHED)\b/i,
  /(?:échec du démarrage|startup failed)/i,
  /(?:uncaughtException|unhandledRejection)/i,
  /(?:invalid token|tokeninvalid)/i,
  /(?:missing access|missing permissions)/i,
  /DiscordAPIError/i,
  /(?:SQLITE_CORRUPT|database is locked)/i,
  /(?:ENOSPC|ENOMEM|out of memory)/i,
  /(?:ECONNREFUSED|connection refused)/i,
]);

const MINOR_LOG_PATTERNS = Object.freeze([
  /\[FyxBot\] Erreur dans \/[^ :]+/i,
  /\[FyxBot\] Erreur (?:de|du|d’)/i,
  /\[FyxBot\] Erreur du panel \((?:400|408|409|422|429)\)/i,
  /\b(?:warn|warning|deprecated|timeout)\b/i,
]);

const EXPECTED_LOG_PATTERNS = Object.freeze([
  /\[FyxBot\] Erreur du panel \((?:401|403|404)\)/i,
]);

function severityRank(severity) {
  return { [SEVERITY.OK]: 0, [SEVERITY.MINOR]: 1, [SEVERITY.MAJOR]: 2 }[severity] ?? 0;
}

function highestSeverity(items) {
  return items.reduce((highest, item) => (
    severityRank(item.severity) > severityRank(highest) ? item.severity : highest
  ), SEVERITY.OK);
}

function normalizeLogFingerprint(message) {
  return String(message || '')
    .replace(/\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z\b/g, '<date>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<uuid>')
    .replace(/\b\d{16,22}\b/g, '<id>')
    .replace(/:\d+:\d+\)?/g, ':<ligne>')
    .replace(/\s+/g, ' ')
    .trim();
}

function classifyLogLine(message) {
  const text = String(message || '').trim();
  if (!text) return { severity: SEVERITY.OK, reason: 'empty', fingerprint: '' };
  const fingerprint = normalizeLogFingerprint(text);
  if (EXPECTED_LOG_PATTERNS.some((pattern) => pattern.test(text))) {
    return { severity: SEVERITY.OK, reason: 'expected-client-error', fingerprint };
  }
  if (MAJOR_LOG_PATTERNS.some((pattern) => pattern.test(text))) {
    return { severity: SEVERITY.MAJOR, reason: 'service-or-feature-impact', fingerprint };
  }
  if (MINOR_LOG_PATTERNS.some((pattern) => pattern.test(text))) {
    return { severity: SEVERITY.MINOR, reason: 'recoverable-or-isolated-error', fingerprint };
  }
  return { severity: SEVERITY.OK, reason: 'informational', fingerprint };
}

function classifyDeployment(status) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCESS') return { severity: SEVERITY.OK, reason: 'deployment-success' };
  if (['FAILED', 'CRASHED', 'NEEDS_APPROVAL'].includes(normalized)) {
    return { severity: SEVERITY.MAJOR, reason: `deployment-${normalized.toLowerCase()}` };
  }
  if (['QUEUED', 'INITIALIZING', 'WAITING', 'BUILDING', 'DEPLOYING', 'SLEEPING'].includes(normalized)) {
    return { severity: SEVERITY.MINOR, reason: `deployment-${normalized.toLowerCase()}` };
  }
  return { severity: SEVERITY.MINOR, reason: 'deployment-unknown' };
}

function classifyHealthCheck(check, slowThresholdMs = 3_000) {
  const path = check?.path || '/';
  const status = Number(check?.status || 0);
  if (check?.error || status === 0) {
    return { severity: SEVERITY.MAJOR, reason: 'endpoint-unreachable', path };
  }
  if (status >= 500) return { severity: SEVERITY.MAJOR, reason: `http-${status}`, path };
  if (status >= 400) return { severity: SEVERITY.MINOR, reason: `http-${status}`, path };
  if (path === '/api/health' && check?.body?.discord !== 'connected') {
    return { severity: SEVERITY.MAJOR, reason: 'discord-not-connected', path };
  }
  if (Number(check?.durationMs || 0) >= slowThresholdMs) {
    return { severity: SEVERITY.MINOR, reason: 'slow-response', path };
  }
  return { severity: SEVERITY.OK, reason: 'endpoint-healthy', path };
}

function summarizeMonitoring({ deployments = [], logs = [], healthChecks = [] } = {}) {
  const deploymentResults = deployments.map((deployment) => ({
    ...classifyDeployment(deployment.status),
    service: deployment.service || null,
    status: deployment.status || null,
  }));
  const logResults = logs.map((entry) => ({
    ...classifyLogLine(entry.message ?? entry),
    service: entry.service || null,
  })).filter((entry) => entry.severity !== SEVERITY.OK);
  const healthResults = healthChecks.map((check) => ({
    ...classifyHealthCheck(check),
    service: check.service || null,
    status: check.status || 0,
  }));
  const incidents = [...deploymentResults, ...logResults, ...healthResults]
    .filter((entry) => entry.severity !== SEVERITY.OK);
  return {
    severity: highestSeverity(incidents),
    incidents,
    counts: {
      major: incidents.filter((entry) => entry.severity === SEVERITY.MAJOR).length,
      minor: incidents.filter((entry) => entry.severity === SEVERITY.MINOR).length,
    },
  };
}

module.exports = {
  SEVERITY,
  classifyDeployment,
  classifyHealthCheck,
  classifyLogLine,
  normalizeLogFingerprint,
  summarizeMonitoring,
};
