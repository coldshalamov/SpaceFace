// Dropping a new mass seed while one is live collapses the old one. Say so.
import test from 'node:test';
import assert from 'node:assert/strict';

import { massSeed } from '../src/systems/massSeed.js';

function press(phase) {
  const events = [];
  let retired = null;
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 8 };
  const state = {
    playerId: 1,
    simTime: 3,
    mode: 'flight',
    input: { actions: { deployMassSeed: true } },
    entities: { get(id) { return id === 1 ? player : null; } },
    player: { massSeed: { cooldownUntil: 0 } },
  };
  const sys = Object.assign(Object.create(massSeed), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    helpers: {},
    _retireLiveSeed(_state, _ms, reason) { retired = reason; },
  });
  sys._handleDeploy(state, { phase, seedId: 4 });
  return { events, retired, pressed: state.input.actions.deployMassSeed };
}

test('replacing a live mass seed says the previous one was replaced', () => {
  const { events, retired, pressed } = press('active');
  assert.equal(pressed, false);
  assert.equal(retired, 'seed_replaced');
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Previous mass seed replaced');
});

test('the first mass seed does not claim it replaced one', () => {
  const { events, retired } = press('idle');
  assert.equal(retired, null);
  assert.equal(events.some((event) => event.name === 'toast'), false);
});
