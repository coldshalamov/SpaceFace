#!/usr/bin/env node
// Check the live frame-budget contracts. Historical PERF_BUDGET prose was retired;
// matching its vocabulary cannot establish frame pacing or preserve the picture.
// Current direction lives in design/program/finish/README.md and docs/visual-assets/LOOK.md.
// These focused contracts check capped presentation without starving simulation,
// unchanged HUD write suppression, and stable propulsion-profile caching.
// Actual frame-time acceptance still requires the relevant measured gameplay route.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const result = spawnSync(process.execPath, ['--test',
  'test/frame-cap-loop.test.mjs',
  'test/pq-210-01-frame-budget.test.mjs',
], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
