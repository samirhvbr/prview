export function loadConfig(env = process.env) {
  const integer = (key, fallback, min, max) => {
    const raw = env[key] ?? String(fallback);
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new Error(`${key} must be an integer between ${min} and ${max}.`);
    }
    return value;
  };
  const username = (env.GITHUB_USERNAME ?? '').trim();
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(username)) {
    throw new Error('Set GITHUB_USERNAME to a valid GitHub username in .env.');
  }
  const githubToken = (env.GITHUB_TOKEN ?? '').trim();
  if (!githubToken || /\s/.test(githubToken) || githubToken === 'your_github_token_here') {
    throw new Error('Set GITHUB_TOKEN in .env to a GitHub token with read access.');
  }
  const dashboardToken = env.DASHBOARD_TOKEN ?? '';
  if (!/^[a-zA-Z0-9_-]{32,256}$/.test(dashboardToken) || dashboardToken === githubToken) {
    throw new Error('DASHBOARD_TOKEN must be a separate random token (32–256 URL-safe characters). Run npm run setup.');
  }
  const cookieSecure = env.COOKIE_SECURE ?? 'false';
  if (!['true', 'false'].includes(cookieSecure)) throw new Error('COOKIE_SECURE must be true or false.');
  return Object.freeze({
    username, githubToken, dashboardToken,
    host: env.HOST || '127.0.0.1',
    port: integer('PORT', 3000, 1, 65535),
    refreshSeconds: integer('REFRESH_SECONDS', 120, 30, 86400),
    pageSeconds: integer('PAGE_SECONDS', 20, 5, 300),
    staleDays: integer('STALE_DAYS', 7, 1, 365),
    cookieSecure: cookieSecure === 'true',
  });
}
