// SFQ-B196 — a running yard machine is heard at the rock, not at the listener.
// The status event carries siteId, not a point. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';

import { machineWorkPosition, resolveMachineWorkCycle } from '../src/audio/audioSystem.js';

const SEED = 4242;

test('machine work uses the site rock when the event has no position (seed 4242)', () => {
  assert.equal(SEED, 4242);
  const entities = new Map([
    [9, { id: 9, alive: true, type: 'asteroid', pos: { x: 40, z: -15 } }],
  ]);
  const state = { entities, sites: { byId: { yard: { id: 'yard', asteroidId: 9 } } } };
  assert.deepEqual(
    machineWorkPosition(state, { siteId: 'yard', machineId: 'm', state: 'running' }),
    { x: 40, z: -15 },
  );
  assert.deepEqual(
    machineWorkPosition(state, { siteId: 'yard', pos: { x: 1, z: 2 } }),
    { x: 1, z: 2 },
  );
  assert.equal(machineWorkPosition(state, { siteId: 'missing', machineId: 'm' }), null);
  assert.equal(resolveMachineWorkCycle('running').recipeId, 'sfx_work_motor');
  assert.equal(resolveMachineWorkCycle('idle').play, false);
});
