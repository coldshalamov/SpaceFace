#!/usr/bin/env node
// Fails when a whole-ship required by a live entity does not load and no substitute is published.
// Playable used to treat that as a passing warning, which left invisible hostiles on the route.
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const child = spawn(process.execPath, ['--test', 'test/live-whole-ship-admission.test.mjs'], {
  cwd: ROOT,
  stdio: 'inherit',
  windowsHide: true,
});
child.on('exit', (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code == null ? 1 : code);
});
