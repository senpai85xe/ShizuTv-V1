import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApiCorsHeaders,
  DEFAULT_CAPACITOR_ALLOWED_ORIGINS,
  getAllowedCorsOrigins,
  isAllowedCorsOrigin,
  normalizeOriginEntry,
} from './corsConfig.ts';

test('getAllowedCorsOrigins includes Capacitor origins, local dev, APP_URL, and CORS_ALLOWED_ORIGINS without wildcards', () => {
  assert.equal(normalizeOriginEntry('*'), null);
  assert.equal(normalizeOriginEntry('https://app.shizutv.example/some/path'), 'https://app.shizutv.example');

  const allowed = getAllowedCorsOrigins({
    appUrl: 'https://web.shizutv.example/',
    extraOrigins: 'https://staging.shizutv.example, http://10.0.2.2:5173, *',
    port: 3000,
  });

  for (const capOrigin of DEFAULT_CAPACITOR_ALLOWED_ORIGINS) {
    assert.equal(allowed.has(capOrigin), true, `Missing Capacitor origin ${capOrigin}`);
  }
  assert.equal(allowed.has('http://localhost:3000'), true);
  assert.equal(allowed.has('https://web.shizutv.example'), true);
  assert.equal(allowed.has('https://staging.shizutv.example'), true);
  assert.equal(allowed.has('http://10.0.2.2:5173'), true);
  assert.equal(allowed.has('*'), false);
});

test('buildApiCorsHeaders echoes allowlisted Capacitor origins with credentials and rejects untrusted origins', () => {
  const allowed = getAllowedCorsOrigins({ port: 3000 });

  assert.equal(isAllowedCorsOrigin('https://localhost', allowed), 'https://localhost');
  assert.equal(isAllowedCorsOrigin('capacitor://localhost', allowed), 'capacitor://localhost');
  assert.equal(isAllowedCorsOrigin('https://evil.example', allowed), null);

  const capHeaders = buildApiCorsHeaders('https://localhost', allowed);
  assert.equal(capHeaders['Access-Control-Allow-Origin'], 'https://localhost');
  assert.equal(capHeaders['Access-Control-Allow-Credentials'], 'true');
  assert.equal(capHeaders.Vary, 'Origin');
  assert.notEqual(capHeaders['Access-Control-Allow-Origin'], '*');

  const capSchemeHeaders = buildApiCorsHeaders('capacitor://localhost', allowed);
  assert.equal(capSchemeHeaders['Access-Control-Allow-Origin'], 'capacitor://localhost');
  assert.equal(capSchemeHeaders['Access-Control-Allow-Credentials'], 'true');

  const blockedHeaders = buildApiCorsHeaders('https://untrusted.example', allowed);
  assert.deepEqual(blockedHeaders, {});
});
