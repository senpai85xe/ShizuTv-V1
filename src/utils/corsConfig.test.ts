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
  assert.equal(capHeaders['Access-Control-Max-Age'], '86400');
});

test('isAllowedCorsOrigin supports AI Studio *.run.app origins, subdomain patterns, same-host headers, and rejects broad wildcards/HTTP spoofs', () => {
  const allowed = getAllowedCorsOrigins({
    appUrl: 'https://ais-dev-mqayabnftr75vumlbgu2e6-875290452825.asia-northeast1.run.app',
    extraOrigins: 'https://*.apps.mistral.run, https://*.com, *',
    port: 3000,
  });

  const devRunOrigin = 'https://ais-dev-mqayabnftr75vumlbgu2e6-875290452825.asia-northeast1.run.app';
  const preRunOrigin = 'https://ais-pre-mqayabnftr75vumlbgu2e6-875290452825.asia-northeast1.run.app';

  const devHeaders = buildApiCorsHeaders(devRunOrigin, allowed, {
    extraOrigins: 'https://*.apps.mistral.run',
  });
  assert.equal(devHeaders['Access-Control-Allow-Origin'], devRunOrigin);
  assert.equal(devHeaders['Access-Control-Allow-Credentials'], 'true');

  const preHeaders = buildApiCorsHeaders(preRunOrigin, allowed);
  assert.equal(preHeaders['Access-Control-Allow-Origin'], preRunOrigin);

  // HTTP scheme to .run.app must be rejected
  assert.equal(isAllowedCorsOrigin('http://fake.run.app', allowed), null);

  // Disabling allowRunAppOrigins enforces strict allowlist / pattern / same-host
  assert.equal(
    isAllowedCorsOrigin(preRunOrigin, allowed, { allowRunAppOrigins: false }),
    null,
  );

  // Configured multi-label wildcard subdomain pattern works, while top-level *.com is rejected
  assert.equal(
    isAllowedCorsOrigin('https://sub.apps.mistral.run', allowed, {
      extraOrigins: 'https://*.apps.mistral.run, https://*.com',
    }),
    'https://sub.apps.mistral.run',
  );
  assert.equal(
    isAllowedCorsOrigin('https://evil.com', allowed, {
      extraOrigins: 'https://*.com',
    }),
    null,
  );

  // Same-host request matching works behind reverse proxies
  assert.equal(
    isAllowedCorsOrigin('https://my-koyeb-app.example.org', allowed, {
      requestHost: 'my-koyeb-app.example.org',
      allowRunAppOrigins: false,
    }),
    'https://my-koyeb-app.example.org',
  );

  // Embedded credentials in Origin header must never be echoed
  assert.equal(
    isAllowedCorsOrigin('https://user:pass@ais-pre.run.app', allowed),
    null,
  );
});
