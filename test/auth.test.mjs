import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../server/auth.mjs';

const token = 'a'.repeat(43);
test('signed sessions expire, cannot be forged, and are revoked on token rotation', () => {
  let time = 1_800_000_000_000;
  const auth = createAuth({ dashboardToken: token, cookieSecure: false }, () => time);
  const cookie = auth.cookie().split(';')[0];
  assert.ok(auth.authorized({ headers: { cookie } }));
  assert.ok(!auth.authorized({ headers: { cookie: cookie.slice(0, -1) + 'x' } }));
  assert.ok(!auth.authorized({ headers: {} }));
  const rotated = createAuth({ dashboardToken: 'b'.repeat(43), cookieSecure: false }, () => time);
  assert.ok(!rotated.authorized({ headers: { cookie } }));
  time += 30 * 86400 * 1000;
  assert.ok(!auth.authorized({ headers: { cookie } }));
});

test('session flags and separate constant-time access token verification', () => {
  const auth = createAuth({ dashboardToken: token, cookieSecure: true });
  assert.match(auth.cookie(), /^__Host-prview=/);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) assert.ok(auth.cookie().includes(flag));
  assert.ok(auth.acceptsToken(token));
  assert.ok(!auth.acceptsToken(''));
  assert.ok(!auth.acceptsToken(token + 'more'));
  assert.ok(!auth.acceptsToken(null));
});
