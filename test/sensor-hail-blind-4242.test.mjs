// A dead sensor bank closes the hail. A live bank still tries the contact. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { hailAvailabilityThroughSensors } from '../src/systems/scanner.js';
import { scanner } from '../src/systems/scanner.js';
import { contactHailAvailability } from '../src/data/contactHail.js';

function rig(blind) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 6;
  state.entities.set(1, { id: 1, alive: true, pos: { x: 0, y: 0, z: 0 } });
  if (blind) {
    state.combat = {
      entities: {
        '1': { subsystems: { subsystem_sensor: { effectiveDisabled: true } } },
      },
    };
  }
  const toasts = [];
  scanner.state = state;
  scanner.bus = { emit(type, payload) { if (type === 'toast') toasts.push(payload); } };
  scanner._contactHail = null;
  return { state, toasts };
}

test('seed 4242: dead sensors close the hail and say so', () => {
  const { state, toasts } = rig(true);
  const seen = hailAvailabilityThroughSensors(state, contactHailAvailability(state));
  assert.equal(seen.enabled, false);
  assert.equal(seen.reason, 'sensors_blind');
  assert.equal(scanner._requestContactHail({}), false);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'Sensors out — nobody hears the hail');
});

test('seed 4242: a live sensor bank still attempts the hail', () => {
  const { state, toasts } = rig(false);
  const seen = hailAvailabilityThroughSensors(state, contactHailAvailability(state));
  assert.equal(seen.reason, 'unresolved_target');
  assert.equal(scanner._requestContactHail({}), false);
  assert.equal(toasts[0].text, 'No contact to hail');
});
