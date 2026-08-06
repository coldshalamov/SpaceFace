#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [
  '--test',
  'test/massline-tractor-head.test.mjs',
  'test/massline-elastic-whip-head.test.mjs',
  'test/massline-frame-coupler-head.test.mjs',
  'test/massline-monofilament-sweep-head.test.mjs',
  'test/massline-transverse-snare-head.test.mjs',
], { cwd: root, stdio: 'inherit', windowsHide: true });

process.exitCode = Number.isInteger(result.status) ? result.status : 1;
