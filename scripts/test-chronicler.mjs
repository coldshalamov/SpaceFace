import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const dir = fileURLToPath(new URL('../tests/chronicler/', import.meta.url));
const paths = readdirSync(dir).filter(n => n.endsWith('.test.mjs')).sort().map(n => `${dir}/${n}`);
const result = spawnSync(process.execPath, ['--test', ...paths], { stdio: 'inherit' });
if (result.error) { console.error(result.error.message); process.exitCode = 1; }
else process.exitCode = result.status ?? 1;
