// scripts/check-crucible-run.mjs — focused gate for the PQ-133.02 ten-wave shell.
//
// Runs the deterministic node:test files behind the ten-wave shell as child
// processes and honours their exit codes (per CANONICAL_BUILD_MAP.md §7, awaiting
// an import of a node:test module cannot fail). Covers the wave schema + planner
// (CRU-009/010), the phase machine (CRU-011), materialization + completion
// (CRU-012/013), wallet/XP (CRU-014), credit chips (CRU-015), draft + refit
// (CRU-016/017), results + restart (CRU-018), and the campaign-contamination
// boundary (Appendix A.8, mandatory from .02 onward).
//
//   node scripts/check-crucible-run.mjs
//
// This is the headless half of the leaf. The player-route half stays in
// `npm run check:crucible:route` (real browser, real buttons).

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const SUITES = [
  'test/crucible-wave-schema.test.mjs',
  'test/crucible-wave-planner.test.mjs',
  'test/crucible-wave-materialization.test.mjs',
  'test/crucible-survival-run.test.mjs',
  'test/crucible-run-state.test.mjs',
  'test/crucible-run-economy.test.mjs',
  'test/crucible-run-seal.test.mjs',
  'test/crucible-credit-pickup.test.mjs',
  'test/crucible-draft.test.mjs',
  'test/crucible-refit.test.mjs',
  'test/crucible-results.test.mjs',
  'test/crucible-ten-wave-shell.test.mjs',
  'test/crucible-contamination.test.mjs',
  'test/crucible-arena.test.mjs',
];

let failed = 0;
for (const suite of SUITES) {
  const result = spawnSync(process.execPath, ['--test', join(ROOT, suite)], {
    cwd: ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    failed += 1;
    const cause = result.error ? `spawn error: ${result.error.message}`
      : (result.signal ? `signal: ${result.signal}` : `exit: ${result.status}`);
    console.error(`check-crucible-run: FAIL ${suite} (${cause})`);
  }
}

if (failed > 0) {
  console.error(`check-crucible-run: ${failed}/${SUITES.length} suites failed`);
  process.exit(1);
}
console.log(`check-crucible-run: ${SUITES.length}/${SUITES.length} suites green`);
