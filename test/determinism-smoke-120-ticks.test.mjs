// Determinism smoke — 120 ticks, two independent processes.
//
// The 720-tick 47-A envelope is the full golden, but it is slow and its hash moves for
// content-only reasons. This test answers the narrower question a reviewer asks first:
// does the same seed and tape produce byte-identical state in two fresh processes over the
// opening two seconds? It runs in the reference tier, not the fast tier.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const TICKS = 120;

function inspect() {
  const stdout = execFileSync(process.execPath, [
    'scripts/sf-sim.mjs', 'inspect', '47a',
    '--seed', '47',
    '--tick', String(TICKS),
    '--inputs', 'test/47a.inputs.json',
  ], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(stdout);
}

test('120 ticks from the same seed and tape are identical in two fresh processes', () => {
  const first = inspect();
  const second = inspect();
  assert.equal(first.schema, 'spaceface.sfSimInspectResult.v1');
  assert.equal(first.tick, TICKS);
  assert.equal(first.seed, 47);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.sha256, second.sha256, 'the canonical snapshot hash must not move between processes');
  assert.deepEqual(first.snapshot, second.snapshot, 'every leaf of the 120-tick snapshot must match');
  assert.ok(first.snapshot.simTime > 0, 'the smoke run actually advanced simulation time');
});
