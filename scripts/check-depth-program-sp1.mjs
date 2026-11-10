import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { SET_PIECE_MISSIONS } from '../src/data/missions.js';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const steps = [
  {
    label: 'SP1 focused contracts and modeled native-event duration regression',
    args: [
      '--test',
      'test/depth-program-sp1-setpieces.test.mjs',
      'test/depth-program-sp1-clauses.test.mjs',
      'test/career-repeatable-contracts.test.mjs',
      'test/post-ending-replay-chains.test.mjs',
      'test/depth-program-sp1-duration.test.mjs',
    ],
  },
  {
    label: 'SP1 contract-clause checker',
    args: ['scripts/check-contract-clauses.mjs'],
  },
  {
    label: 'SP1 modeled deterministic native-event route-duration audit',
    args: ['scripts/check-depth-program-sp1-duration.mjs'],
  },
];

for (const step of steps) {
  console.log(`\n== ${step.label} ==`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

const authoredRouteCount = SET_PIECE_MISSIONS.reduce((sum, definition) => (
  sum + (definition.branches || []).length
), 0);
console.log(`\nPASS SP1 aggregate: focused contracts, clause checker, and ${authoredRouteCount} modeled deterministic native-event routes.`);
console.log('Duration evidence is modeled deterministic native-event route duration, not human playtime.');
