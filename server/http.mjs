import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createAuth } from './auth.mjs';
import { sanitizeDisplayParams } from '../public/options.js';

const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/options.js', ['options.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

export function createApp({ config, dashboard, now }) {
  const auth = createAuth(config, now);
  const headers = {
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  };
  if (config.cookieSecure) headers['Strict-Transport-Security'] = 'max-age=31536000';
  const denied = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>PRVIEW · Acesso restrito</title><body><main><h1>PRVIEW</h1><h2>Acesso restrito / Restricted access</h2><p>Abra o link do painel com o token de acesso configurado no servidor.</p><p>Open the dashboard link containing the access token configured on your server.</p></main></body></html>';
  return createServer({ requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (request, response) => {
    const send = (status, type, body, extra = {}) => {
      response.writeHead(status, { ...headers, 'Content-Type': type, ...extra });
      response.end(request.method === 'HEAD' ? undefined : body);
    };
    const json = (status, body, extra) => send(status, 'application/json; charset=utf-8', JSON.stringify(body), extra);
    try {
      if (!['GET', 'HEAD'].includes(request.method)) return json(405, { error: 'Method not allowed.' }, { Allow: 'GET, HEAD' });
      const url = new URL(request.url, 'http://prview.local');
      if (url.pathname === '/healthz') return json(200, { status: 'ok' });
      if (url.pathname === '/robots.txt') return send(200, 'text/plain; charset=utf-8', 'User-agent: *\nDisallow: /\n');
      if (url.pathname === '/' && url.searchParams.has('token')) {
        if (url.searchParams.getAll('token').length !== 1 || !auth.acceptsToken(url.searchParams.get('token'))) return send(401, 'text/html; charset=utf-8', denied);
        // Never forward credentials or arbitrary query strings into the redirect.
        const clean = sanitizeDisplayParams(url.searchParams);
        const location = clean.size ? `/?${clean}` : '/';
        return send(303, 'text/plain; charset=utf-8', 'Authorized. Redirecting.', { Location: location, 'Set-Cookie': auth.cookie() });
      }
      if (!auth.authorized(request)) {
        if (url.pathname.startsWith('/api/')) return json(401, { error: 'Access expired. Reopen the original dashboard link.' });
        return send(401, 'text/html; charset=utf-8', denied);
      }
      if (url.pathname === '/api/dashboard') {
        if (request.headers['sec-fetch-site'] === 'cross-site') return json(403, { error: 'Cross-site request denied.' });
        return json(200, await dashboard.getSnapshot(), { 'Set-Cookie': auth.cookie() });
      }
      const asset = assets.get(url.pathname);
      if (!asset) return json(404, { error: 'Not found.' });
      const body = await readFile(new URL(`../public/${asset[0]}`, import.meta.url));
      send(200, asset[1], body);
    } catch {
      // Intentionally omit request URLs, headers and upstream errors from logs.
      if (!response.headersSent) json(500, { error: 'Unable to serve this request.' });
      else response.end();
    }
  });
}
