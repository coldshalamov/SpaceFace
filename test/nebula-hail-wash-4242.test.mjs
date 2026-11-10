// A nebula eats the hail channel. Clear air and other hazards still attempt the contact. Seed 4242.
import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { contactHailAvailability } from '../src/data/contactHail.js';
import { scanner } from '../src/systems/scanner.js';

function rig(presence) {
  const state = createGameState(4242);
  state.meta.seed = 4242;
  state.mode = 'flight';
  state.playerId = 1;
  state.simTime = 5;
  state.world = state.world || {};
  state.world.hazardPresence = presence;
  const toasts = [];
  scanner.state = state;
  scanner.bus = { emit(type, payload) { if (type === 'toast') toasts.push(payload); } };
  scanner._contactHail = null;
  return { state, toasts };
}

test('seed 4242: the nebula eats a hail and says so', () => {
  const { state, toasts } = rig({ nebula: true });
  const availability = contactHailAvailability(state);
  assert.equal(availability.enabled, false);
  assert.equal(availability.reason, 'nebula_wash');
  assert.equal(scanner._requestContactHail({}), false);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].text, 'The nebula ate the hail');
  assert.equal(toasts[0].kind, 'warn');
});

test('seed 4242: clear air and a radiation disc still attempt the hail', () => {
  const clear = rig(null);
  assert.equal(contactHailAvailability(clear.state).reason, 'unresolved_target');
  assert.equal(scanner._requestContactHail({}), false);
  assert.equal(clear.toasts[0].text, 'No contact to hail');

  const rad = rig({ radiation: true, nebula: false });
  assert.equal(contactHailAvailability(rad.state).reason, 'unresolved_target');
  assert.equal(scanner._requestContactHail({}), false);
  assert.equal(rad.toasts[0].text, 'No contact to hail');
});
