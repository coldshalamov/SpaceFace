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
  'test/massline-twin-bridle-head.test.mjs',
  // Twin Bridle NPC counterplay: an ace cuts the line and a heavy shrugs it by mass. The
  // twin-bridle head test's heavy census leans on this proof, so it runs with the heads.
  'test/pq-031-02-npc-counterplay.test.mjs',
], { cwd: root, stdio: 'inherit', windowsHide: true });

process.exitCode = Number.isInteger(result.status) ? result.status : 1;
