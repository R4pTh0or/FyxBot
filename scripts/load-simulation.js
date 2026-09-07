const { performance } = require('node:perf_hooks');
const pingCommand = require('../src/commands/utility/ping');

const DEFAULT_URL = 'https://fyxbot-panel-production.up.railway.app';
const DEFAULT_USERS = 50;
const MAX_USERS = 250;
const REQUEST_TIMEOUT_MS = 10_000;
const HTTP_PATHS = ['/', '/api/health', '/api/auth/status'];

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.ceil(sorted.length * ratio) - 1, sorted.length - 1)];
}

function formatMs(value) {
  return `${value.toFixed(1)} ms`;
}

async function simulatePing(userId) {
  const startedAt = performance.now();
  let editedReply = '';
  const interaction = {
    createdTimestamp: Date.now(),
    client: { ws: { ping: 42 } },
    async reply() {
      return { resource: { message: { createdTimestamp: Date.now() } } };
    },
    async editReply(message) {
      editedReply = message;
    },
  };

  try {
    await pingCommand.execute(interaction);
    if (!editedReply.includes('Pong')) throw new Error('Réponse /ping invalide.');
    return { userId, ok: true, durationMs: performance.now() - startedAt };
  } catch (error) {
    return { userId, ok: false, durationMs: performance.now() - startedAt, error: error.message };
  }
}

async function requestPath(baseUrl, path, userId, requestTimeoutMs) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Cookie: `fyxbot-load-user=${userId}`,
        'User-Agent': 'FyxBot controlled load simulation/1.0',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const body = await response.text();
    let botConnected = null;
    if (path === '/api/health') {
      try { botConnected = JSON.parse(body).discord === 'connected'; } catch { botConnected = false; }
    }
    return {
      userId,
      path,
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      bytes: Buffer.byteLength(body),
      botConnected,
    };
  } catch (error) {
    return {
      userId,
      path,
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      bytes: 0,
      botConnected: path === '/api/health' ? false : null,
      error: error.message,
    };
  }
}

async function simulateVisitor(baseUrl, userId, requestTimeoutMs, httpPaths) {
  const results = [];
  for (const path of httpPaths) results.push(await requestPath(baseUrl, path, userId, requestTimeoutMs));
  return results;
}

function printMetrics(label, results, elapsedMs) {
  const durations = results.map((result) => result.durationMs);
  const failures = results.filter((result) => !result.ok);
  console.log(`\n${label}`);
  console.log(`- Opérations : ${results.length}`);
  console.log(`- Réussites : ${results.length - failures.length}`);
  console.log(`- Erreurs : ${failures.length}`);
  console.log(`- Temps total : ${formatMs(elapsedMs)}`);
  console.log(`- Latence médiane : ${formatMs(percentile(durations, 0.5))}`);
  console.log(`- Latence p95 : ${formatMs(percentile(durations, 0.95))}`);
  console.log(`- Débit : ${(results.length / (elapsedMs / 1000)).toFixed(1)} opération(s)/s`);
  if (failures.length) {
    const examples = [...new Set(failures.map((failure) => failure.error || `HTTP ${failure.status}`))].slice(0, 3);
    console.log(`- Exemples d'erreurs : ${examples.join(' | ')}`);
  }
}

async function main() {
  const users = Number.parseInt(option('users', String(DEFAULT_USERS)), 10);
  const requestTimeoutMs = Number.parseInt(option('timeout', String(REQUEST_TIMEOUT_MS)), 10);
  const baseUrl = option('url', DEFAULT_URL).replace(/\/$/, '');
  const httpPaths = option('paths', HTTP_PATHS.join(','))
    .split(',').map((path) => path.trim()).filter((path) => path.startsWith('/'));
  if (!Number.isInteger(users) || users < 1 || users > MAX_USERS) {
    throw new Error(`Le nombre d'utilisateurs doit être compris entre 1 et ${MAX_USERS}.`);
  }
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('L’URL cible doit commencer par http:// ou https://.');
  if (!httpPaths.length) throw new Error('Au moins un chemin HTTP commençant par / est requis.');
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1000 || requestTimeoutMs > 60_000) {
    throw new Error('Le délai maximal doit être compris entre 1 000 et 60 000 ms.');
  }

  console.log(`Simulation FyxBot : ${users} utilisateurs simultanés`);
  console.log(`Cible HTTP en lecture seule : ${baseUrl}`);
  console.log(`Délai maximal par requête : ${requestTimeoutMs} ms`);

  const pingStartedAt = performance.now();
  const pingResults = await Promise.all(Array.from({ length: users }, (_, index) => simulatePing(index + 1)));
  const pingElapsedMs = performance.now() - pingStartedAt;
  printMetrics('Commandes /ping simulées', pingResults, pingElapsedMs);

  const httpStartedAt = performance.now();
  const httpResults = (await Promise.all(
    Array.from({ length: users }, (_, index) => simulateVisitor(baseUrl, index + 1, requestTimeoutMs, httpPaths)),
  )).flat();
  const httpElapsedMs = performance.now() - httpStartedAt;
  printMetrics('Parcours du panel et de l’API', httpResults, httpElapsedMs);
  for (const path of httpPaths) {
    const pathResults = httpResults.filter((result) => result.path === path);
    const failures = pathResults.filter((result) => !result.ok).length;
    const durations = pathResults.map((result) => result.durationMs);
    console.log(`  ${path} : ${pathResults.length - failures}/${pathResults.length} réussites · p95 ${formatMs(percentile(durations, 0.95))}`);
  }

  const healthResults = httpResults.filter((result) => result.path === '/api/health');
  const connectedChecks = healthResults.filter((result) => result.botConnected).length;
  const failedPings = pingResults.filter((result) => !result.ok).length;
  const failedHttp = httpResults.filter((result) => !result.ok).length;
  const passed = failedPings === 0 && failedHttp === 0
    && (healthResults.length === 0 || connectedChecks === users);

  if (healthResults.length) console.log(`\nSanté Discord : ${connectedChecks}/${users} réponses indiquent « connected »`);
  console.log(`Résultat global : ${passed ? 'RÉUSSI' : 'ÉCHEC'}`);
  if (!passed) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Simulation impossible : ${error.message}`);
  process.exitCode = 1;
});
