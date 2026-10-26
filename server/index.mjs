import { loadConfig } from './config.mjs';
import { createGitHubClient } from './github.mjs';
import { createDashboard } from './dashboard.mjs';
import { createApp } from './http.mjs';

try {
  const config = loadConfig();
  const github = createGitHubClient({ token: config.githubToken, username: config.username });
  const dashboard = createDashboard({ ...config, fetchPullRequests: github.fetchPullRequests });
  const server = createApp({ config, dashboard });
  server.listen(config.port, config.host, () => {
    console.log(`PRVIEW listening on ${config.host}:${config.port} for @${config.username}.`);
    console.log('Open your saved dashboard URL with ?token=… to authorize this browser.');
  });
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? 'PORT is already in use. Choose another PORT in .env.' : 'Unable to start the HTTP server.');
    process.exitCode = 1;
  });
  const stop = () => {
    dashboard.close?.();
    server.close();
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
} catch (error) {
  console.error(`PRVIEW configuration: ${error.message}`);
  process.exitCode = 1;
}
