const { performance } = require('node:perf_hooks');
const { summarizeMonitoring } = require('../src/services/monitoring');

const DEFAULT_URL = 'https://fyxbot-panel-production.up.railway.app';
const DEFAULT_PATHS = ['/', '/api/health', '/api/auth/status'];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function checkPath(baseUrl, path, timeoutMs) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { 'User-Agent': 'FyxBot health monitor/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
    return { path, status: response.status, durationMs: performance.now() - startedAt, body };
  } catch (error) {
    return { path, status: 0, durationMs: performance.now() - startedAt, error: error.message };
  }
}

async function main() {
  const baseUrl = option('url', DEFAULT_URL).replace(/\/$/, '');
  const paths = option('paths', DEFAULT_PATHS.join(','))
    .split(',').map((path) => path.trim()).filter((path) => path.startsWith('/'));
  const timeoutMs = Number.parseInt(option('timeout', '10000'), 10);
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('L’URL doit commencer par http:// ou https://.');
  if (!paths.length) throw new Error('Au moins un chemin HTTP est requis.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 60_000) {
    throw new Error('Le délai doit être compris entre 1 000 et 60 000 ms.');
  }

  const healthChecks = await Promise.all(paths.map((path) => checkPath(baseUrl, path, timeoutMs)));
  const summary = summarizeMonitoring({ healthChecks });
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), baseUrl, healthChecks, ...summary }, null, 2));
  process.exitCode = summary.severity === 'major' ? 2 : summary.severity === 'minor' ? 1 : 0;
}

main().catch((error) => {
  console.error(JSON.stringify({ severity: 'major', error: error.message }));
  process.exitCode = 2;
});
