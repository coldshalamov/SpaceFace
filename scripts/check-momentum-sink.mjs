#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, [
  '--test',
  'test/momentum-sink.test.mjs',
  'test/momentum-sink-presentation.test.mjs',
], { cwd: root, stdio: 'inherit', windowsHide: true });

process.exitCode = Number.isInteger(result.status) ? result.status : 1;
