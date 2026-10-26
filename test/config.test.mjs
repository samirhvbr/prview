import test from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../server/config.mjs';

const base = { GITHUB_USERNAME: 'someone-else', GITHUB_TOKEN: 'github-test-value', DASHBOARD_TOKEN: 'x'.repeat(43) };
test('generic configuration defaults to loopback with bounded polling', () => {
  const config = loadConfig(base);
  assert.equal(config.username, 'someone-else');
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.refreshSeconds, 120);
  assert.equal(config.cookieSecure, false);
});
test('missing, weak, shared and invalid secrets/config fail closed without echoing values', () => {
  for (const patch of [
    { GITHUB_USERNAME: 'author:x is:closed' }, { GITHUB_TOKEN: '' }, { DASHBOARD_TOKEN: 'short' },
    { DASHBOARD_TOKEN: base.GITHUB_TOKEN }, { COOKIE_SECURE: 'maybe' },
    { PORT: '3000oops' }, { REFRESH_SECONDS: '1' }, { PAGE_SECONDS: '-1' }, { STALE_DAYS: '0' },
  ]) assert.throws(() => loadConfig({ ...base, ...patch }));
});
