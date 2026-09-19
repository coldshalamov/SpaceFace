#!/usr/bin/env node
// Explicit discovery: Windows cmd.exe does not expand shell globs like bash.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../', import.meta.url));
const folder = new URL('../repo/tests/tension-director/', import.meta.url);
const names = (await fs.readdir(folder)).filter((n) => n.endsWith('.test.mjs')).sort();
if (!names.length) throw new Error('No tests found');
const result = spawnSync(process.execPath, ['--experimental-vm-modules', '--test',
  ...names.map((n) => fileURLToPath(new URL(n, folder)))], { cwd: root, stdio: 'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
