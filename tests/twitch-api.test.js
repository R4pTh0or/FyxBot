const assert = require('node:assert/strict');
const test = require('node:test');

const {
  TwitchApiClient,
  TwitchApiError,
  parseRateLimitHeaders,
} = require('../src/services/twitchApi');

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const CREDENTIALS = {
  clientId: 'client123',
  clientSecret: 'private-client-secret',
  redirectUri: 'https://fyxbot.example/api/twitch/auth/callback',
};

function jsonResponse(body, options = {}) {
  return new Response(JSON.stringify(body), {
    status: options.status || 200,
    headers: options.headers,
  });
}

test('construit une URL OAuth bornée sans exposer le secret client', () => {
  const client = new TwitchApiClient(CREDENTIALS, { fetchFn: async () => jsonResponse({}) });
  const url = client.getAuthorizationUrl(['chat:read', 'chat:edit', 'chat:read'], 'state-token-secure-1234');

  assert.equal(url.origin, 'https://id.twitch.tv');
  assert.equal(url.searchParams.get('scope'), 'chat:edit chat:read');
  assert.equal(url.searchParams.get('state'), 'state-token-secure-1234');
  assert.equal(url.toString().includes(CREDENTIALS.clientSecret), false);
});

test('échange un code et valide strictement la réponse OAuth', async () => {
  let request;
  const client = new TwitchApiClient(CREDENTIALS, {
    now: () => NOW,
    fetchFn: async (url, init) => {
      request = { url, init };
      return jsonResponse({
        access_token: 'access-token',
        refresh_token: 'refresh-token',
        expires_in: 3_600,
        scope: ['chat:read'],
      });
    },
  });

  const tokenSet = await client.exchangeCode('oauth-code');
  assert.equal(request.url, 'https://id.twitch.tv/oauth2/token');
  assert.equal(request.init.body.get('grant_type'), 'authorization_code');
  assert.equal(tokenSet.accessToken, 'access-token');
  assert.equal(tokenSet.expiresAt.getTime(), NOW + 3_600_000);
  assert.deepEqual(tokenSet.scopes, ['chat:read']);
});

test('refuse une réponse OAuth incomplète sans reprendre son contenu dans l’erreur', async () => {
  const secretPayload = 'secret-from-upstream';
  const client = new TwitchApiClient(CREDENTIALS, {
    fetchFn: async () => jsonResponse({ access_token: secretPayload, expires_in: -1 }),
  });

  await assert.rejects(client.exchangeCode('oauth-code'), (error) => {
    assert.ok(error instanceof TwitchApiError);
    assert.equal(error.code, 'invalid_response');
    assert.equal(error.message.includes(secretPayload), false);
    return true;
  });
});

test('appelle Helix uniquement sur l’origine Twitch avec les en-têtes imposés', async () => {
  let request;
  const client = new TwitchApiClient(CREDENTIALS, {
    now: () => NOW,
    fetchFn: async (url, init) => {
      request = { url, init };
      return jsonResponse({ data: [{ id: '42' }] }, {
        headers: { 'ratelimit-remaining': '799', 'ratelimit-reset': String(NOW / 1_000 + 60) },
      });
    },
  });

  const body = await client.helix('users?login=rapto', 'access-token', {
    headers: { Authorization: 'Bearer attacker-value' },
  });
  assert.deepEqual(body, { data: [{ id: '42' }] });
  assert.equal(request.url, 'https://api.twitch.tv/helix/users?login=rapto');
  assert.equal(request.init.headers.get('Authorization'), 'Bearer access-token');
  assert.equal(request.init.headers.get('Client-Id'), CREDENTIALS.clientId);
  await assert.rejects(
    client.helix('https://evil.example/token', 'access-token'),
    /Chemin Twitch Helix invalide/,
  );
});

test('respecte les limites Helix et fournit un délai sûr', async () => {
  let fetchCalls = 0;
  const resetAt = NOW + 30_000;
  const client = new TwitchApiClient(CREDENTIALS, {
    now: () => NOW,
    fetchFn: async () => {
      fetchCalls += 1;
      return jsonResponse({ error: 'limited' }, {
        status: 429,
        headers: { 'ratelimit-remaining': '0', 'ratelimit-reset': String(resetAt / 1_000) },
      });
    },
  });

  await assert.rejects(client.helix('users', 'access-token'), (error) => {
    assert.equal(error.code, 'rate_limited');
    assert.equal(error.retryAfterMs, 30_000);
    return true;
  });
  await assert.rejects(client.helix('users', 'access-token'), /Limite Twitch atteinte/);
  assert.equal(fetchCalls, 1);
  assert.deepEqual(parseRateLimitHeaders({ 'retry-after': '2' }, NOW).retryAfterMs, 2_000);
});

test('renouvelle un jeton expirant et l’enregistre avant l’appel Helix', async () => {
  const events = [];
  const client = new TwitchApiClient(CREDENTIALS, {
    now: () => NOW,
    fetchFn: async (_url, init) => {
      events.push(`fetch:${init.headers.get('Authorization')}`);
      return jsonResponse({ data: ['ok'] });
    },
  });

  const result = await client.helixAuthenticated('streams', {
    loadTokenSet: async () => ({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      expiresAt: new Date(NOW + 20_000),
      scopes: ['chat:read'],
    }),
    refreshTokenFn: async (refreshToken) => {
      events.push(`refresh:${refreshToken}`);
      return {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: new Date(NOW + 3_600_000),
        scopes: ['chat:read'],
      };
    },
    saveTokenSet: async (tokenSet) => events.push(`save:${tokenSet.accessToken}`),
  });

  assert.deepEqual(result, { data: ['ok'] });
  assert.deepEqual(events, ['refresh:old-refresh', 'save:new-access', 'fetch:Bearer new-access']);
});

test('renouvelle une seule fois après un refus 401 et masque toute erreur réseau', async () => {
  let fetchCalls = 0;
  let refreshCalls = 0;
  const client = new TwitchApiClient(CREDENTIALS, {
    now: () => NOW,
    fetchFn: async () => {
      fetchCalls += 1;
      if (fetchCalls === 1) return jsonResponse({ message: 'invalid oauth token' }, { status: 401 });
      return jsonResponse({ data: ['ok'] });
    },
  });

  const result = await client.helixAuthenticated('streams', {
    loadTokenSet: async () => ({
      accessToken: 'old-access',
      refreshToken: 'private-refresh',
      expiresAt: new Date(NOW + 3_600_000),
      scopes: [],
    }),
    refreshTokenFn: async () => {
      refreshCalls += 1;
      return {
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        expiresAt: new Date(NOW + 3_600_000),
        scopes: [],
      };
    },
    saveTokenSet: async () => {},
  });

  assert.deepEqual(result, { data: ['ok'] });
  assert.equal(fetchCalls, 2);
  assert.equal(refreshCalls, 1);

  const failingClient = new TwitchApiClient(CREDENTIALS, {
    fetchFn: async () => { throw new Error('leaked-access-token'); },
  });
  await assert.rejects(failingClient.helix('users', 'very-private-token'), (error) => {
    assert.equal(error.code, 'network_error');
    assert.equal(error.message.includes('very-private-token'), false);
    assert.equal(error.message.includes('leaked-access-token'), false);
    return true;
  });
});
