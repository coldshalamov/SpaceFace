// A dash press that cannot fire must not play the success kick, and must say why.
import test from 'node:test';
import assert from 'node:assert/strict';

import { flightV3 } from '../src/systems/flightV3.js';

function press(boost, shipId = 1) {
  const events = [];
  const flight = Object.assign(Object.create(flightV3), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  const ship = { id: shipId, rot: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, mass: 20 };
  const state = { playerId: 1, simTime: 1, entities: { get() { return null; } } };
  const fired = flight._triggerDash(ship, boost, state);
  return { fired, events };
}

const ready = { dashImpulse: 40, dashCdT: 0, energy: 20, dashCost: 8, burnCdS: 1 };

test('a dash on cooldown names the wait and does not fire', () => {
  const { fired, events } = press({ ...ready, dashCdT: 1.2, energy: 20 });
  assert.equal(fired, false);
  assert.equal(events.some((event) => event.name === 'ship:boostPreKick'), false);
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Boost recharging — 2s');
});

test('an empty boost capacitor says so', () => {
  const { fired, events } = press({ ...ready, energy: 1, dashCost: 8 });
  assert.equal(fired, false);
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Boost empty');
});

test('another ship failing a dash does not toast the player', () => {
  const { fired, events } = press({ ...ready, energy: 0 }, 9);
  assert.equal(fired, false);
  assert.equal(events.length, 0);
});
