import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server/http.mjs';

const token = 'a'.repeat(43);
async function launch(t) {
  let calls = 0;
  const server = createApp({ config: { dashboardToken: token, cookieSecure: false }, dashboard: { getSnapshot: async () => { calls++; return { username: 'example', pullRequests: [] }; } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return { base: `http://127.0.0.1:${server.address().port}`, calls: () => calls };
}

test('all dashboard data and assets require authorization, health exposes no metadata', async t => {
  const app = await launch(t);
  for (const route of ['/', '/api/dashboard', '/app.js', '/options.js', '/styles.css', '/.env', '/server/config.mjs']) {
    const response = await fetch(app.base + route);
    assert.equal(response.status, 401, route);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.ok(!(await response.text()).includes(token));
  }
  assert.equal(app.calls(), 0);
  assert.deepEqual(await (await fetch(app.base + '/healthz')).json(), { status: 'ok' });
});

test('URL token bootstraps cookie and redirects without secrets; API never accepts URL token', async t => {
  const app = await launch(t);
  const response = await fetch(`${app.base}/?token=${token}&other=secret&tv=1&lang=en`, { redirect: 'manual' });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/?tv=1');
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.ok(!cookie.includes(token));
  const headers = { cookie: cookie.split(';')[0] };
  const api = await fetch(app.base + '/api/dashboard', { headers });
  assert.equal(api.status, 200);
  assert.equal((await api.json()).username, 'example');
  assert.ok(api.headers.get('set-cookie'));
  for (const route of ['/app.js', '/options.js', '/styles.css', '/favicon.svg', '/']) {
    assert.equal((await fetch(app.base + route, { headers })).status, 200, route);
  }
  assert.equal((await fetch(`${app.base}/api/dashboard?token=${token}`)).status, 401);
  assert.equal((await fetch(`${app.base}/?token=${token}&token=wrong`, { redirect: 'manual' })).status, 401);
  assert.equal((await fetch(`${app.base}/?token=wrong`, { redirect: 'manual' })).status, 401);
  assert.equal((await fetch(app.base + '/.env', { headers })).status, 404);
  assert.equal((await fetch(app.base + '/api/dashboard', { headers: { ...headers, 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await fetch(app.base + '/api/dashboard', { method: 'POST', headers })).status, 405);
});

test('access redirect preserves valid display options and excludes unknown or invalid values', async t => {
  const app = await launch(t);
  const options = new URLSearchParams({ token, tv: '1', rotate: '0', page_seconds: '25', page_size: '8', reload_seconds: '120', repo: 'owner/project', status: 'attention', q: 'fix: retry & cache', evil: 'secret' });
  const response = await fetch(`${app.base}/?${options}`, { redirect: 'manual' });
  assert.equal(response.status, 303);
  const redirect = new URL(response.headers.get('location'), app.base);
  assert.equal(redirect.searchParams.get('token'), null);
  assert.equal(redirect.searchParams.get('evil'), null);
  for (const [key, value] of options) {
    if (!['token', 'evil'].includes(key)) assert.equal(redirect.searchParams.get(key), value, key);
  }
  const bad = await fetch(`${app.base}/?token=${token}&page_seconds=1&reload_seconds=2&tv=oops&repo=invalid`, { redirect: 'manual' });
  assert.equal(bad.headers.get('location'), '/');
});

test('errors never expose exception details', async t => {
  const server = createApp({ config: { dashboardToken: token }, dashboard: { getSnapshot: async () => { throw new Error('private token secret'); } } });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const auth = await fetch(`${base}/?token=${token}`, { redirect: 'manual' });
  const response = await fetch(base + '/api/dashboard', { headers: { cookie: auth.headers.get('set-cookie').split(';')[0] } });
  assert.equal(response.status, 500);
  assert.equal(await response.text(), '{"error":"Unable to serve this request."}');
});
