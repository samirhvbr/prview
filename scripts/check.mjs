import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

for (const folder of ['server', 'public', 'scripts', 'test']) {
  const files = await readdir(new URL(`../${folder}/`, import.meta.url));
  for (const file of files.filter(name => /\.m?js$/.test(name))) {
    const path = new URL(`../${folder}/${file}`, import.meta.url);
    const result = spawnSync(process.execPath, ['--check', path.pathname], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log('JavaScript syntax checks passed.');
