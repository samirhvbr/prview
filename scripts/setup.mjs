import { randomBytes } from 'node:crypto';
import { writeFile, readFile } from 'node:fs/promises';

try {
  const template = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  const token = randomBytes(32).toString('base64url');
  await writeFile(new URL('../.env', import.meta.url), template.replace(/^DASHBOARD_TOKEN=.*$/m, `DASHBOARD_TOKEN=${token}`), { flag: 'wx', mode: 0o600 });
  console.log('Created .env with a random dashboard token and owner-only permissions.');
  console.log('Set GITHUB_USERNAME and GITHUB_TOKEN in .env, then run npm start.');
  console.log('Open http://localhost:3000/?token=<DASHBOARD_TOKEN from .env> on your display.');
} catch (error) {
  if (error.code === 'EEXIST') {
    console.error('.env already exists. It was not changed.');
  } else {
    console.error('Unable to create .env. Check that .env.example exists and this folder is writable.');
  }
  process.exitCode = 1;
}
