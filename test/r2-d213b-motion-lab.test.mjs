import assert from 'node:assert/strict';
import { test } from 'node:test';

import { runM8 } from '../src/testing/motionScenarios.js';

const SEED = 4242;

test('D213 B: the intact wing regroups before its thrown member (M8 formation recovery)', async () => {
  const { metrics, trace } = await runM8({ seed: SEED });
  assert.ok(trace.samples.some((sample) => sample.tick < 210), 'the unshoved approach is exercised');
  assert.equal(metrics.impulseApplied, true);
  assert.equal(metrics.morphAborted, true, 'a shove interrupts the formation sequence');
  assert.ok(metrics.integrityMin < 0.95, 'the wing visibly loses its shape');
  assert.ok(metrics.intactReformTimeS <= 5.5, 'intact members must reform within 5.5 seconds');
  assert.ok(metrics.disruptedRejoinTimeS > metrics.intactReformTimeS, 'the thrown member must rejoin later');
  assert.ok(metrics.disruptedRejoinTimeS < 8.5, 'the thrown member must actually rejoin before the timeout fallback');
  assert.equal(metrics.asymmetricRecovery, true);
  assert.equal(metrics.physicsPreserved, true);
  assert.equal(metrics.collisions, 0);
});

