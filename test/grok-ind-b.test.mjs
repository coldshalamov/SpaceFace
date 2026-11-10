// PB-IND-B — SF-094 physical brace, SF-097 safety interlock bypass.
import assert from 'node:assert/strict';
import test from 'node:test';
import { mulberry32 } from '../src/core/rng.js';
import { stepMachinePreconditions } from '../src/systems/worldSiteRuntime.js';

const SEED = 4242;

test('a braced damaged machine yields only while the brace holds, then a repair replaces it', () => {
  const simTime = mulberry32(SEED)() * 10;
  const base = {
    damaged: true,
    braceHeld: true,
    braceDisturbed: false,
    repaired: false,
    rate: 1,
    unconsumed: 10,
    bypassScale: 0.4,
    simTime,
  };
  const running = stepMachinePreconditions(base, 2.5);
  assert.equal(running.workaround, true);
  assert.equal(running.outputScale, 0.4);
  assert.equal(running.produced, 1);
  assert.equal(running.unconsumed, 9);
  const idle = stepMachinePreconditions(base, 0);
  assert.equal(idle.produced, 0);
  assert.equal(idle.unconsumed, 10);
  const disturbed = stepMachinePreconditions({ ...running, braceDisturbed: true }, 5);
  assert.equal(disturbed.reason, 'brace-lost');
  assert.equal(disturbed.produced, 0);
  assert.equal(disturbed.retained, 9);
  const left = stepMachinePreconditions({ ...base, braceHeld: false }, 8);
  assert.equal(left.produced, 0);
  assert.equal(left.retained, 10);
  const repaired = stepMachinePreconditions({ ...base, repaired: true, braceHeld: false }, 2);
  assert.equal(repaired.superseded, true);
  assert.equal(repaired.workaround, false);
  assert.equal(repaired.outputScale, 1);
  assert.equal(repaired.produced, 2);
  assert.equal(repaired.unconsumed, 8);
});

test('the interlock holds until the safety weight is moved, and a bypass keeps collision authority', () => {
  const seated = {
    safetyWeightSeated: true,
    bypassDeliberate: false,
    damaged: false,
    rate: 1,
    unconsumed: 6,
  };
  const held = stepMachinePreconditions(seated, 3);
  assert.equal(held.reason, 'interlock');
  assert.equal(held.produced, 0);
  assert.equal(held.retained, 6);
  assert.equal(held.accidentalBypass, false);
  const flaggedButSeated = stepMachinePreconditions({ ...seated, bypassDeliberate: true }, 3);
  assert.equal(flaggedButSeated.reason, 'interlock');
  assert.equal(flaggedButSeated.produced, 0);
  const bypass = stepMachinePreconditions({
    ...seated,
    safetyWeightSeated: false,
    bypassDeliberate: true,
    workerNearby: true,
  }, 2);
  assert.equal(bypass.risk, true);
  assert.equal(bypass.produced, 2);
  assert.equal(bypass.collisionAuthority, true);
  assert.equal(bypass.lawNote, 'worker-exposed');
  assert.equal(bypass.accidentalBypass, false);
  const restored = stepMachinePreconditions({ ...bypass, safetyWeightSeated: true, bypassDeliberate: true }, 2);
  assert.equal(restored.reason, 'interlock');
  assert.equal(restored.produced, 0);
  assert.equal(restored.collisionAuthority, true);
});
