// A second scan pulse during the recharge used to vanish. The cooldown stays 8s.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanner } from '../src/systems/scanner.js';

function pulseSystem(simTime, cooldownUntil) {
  const events = [];
  const actions = { scanPulse: true };
  const state = {
    mode: 'flight',
    simTime,
    tick: 0,
    playerId: 1,
    input: { actions },
    entities: { get() { return { id: 1, alive: true, pos: { x: 0, z: 0 } }; } },
  };
  const sys = Object.assign(Object.create(scanner), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state,
    _cooldownUntil: cooldownUntil,
    _updateContactHail() {},
    _updateTrackedSignal() {},
    _tickGhostContacts() {},
    _pulse() { events.push({ name: 'pulsed' }); },
  });
  sys.update(1 / 60, state);
  return { events, actions, sys };
}

test('a scan pulse during recharge says how long is left and does not pulse', () => {
  const { events, actions, sys } = pulseSystem(3.2, 10);
  assert.equal(actions.scanPulse, false);
  assert.equal(events.some((event) => event.name === 'pulsed'), false);
  assert.equal(sys._cooldownUntil, 10);
  const toast = events.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'Scanner recharging — 7s');
  assert.equal(toast.payload.kind, 'warn');
});

test('a ready scanner does not invent a recharge toast', () => {
  const { events } = pulseSystem(12, 10);
  assert.equal(events.some((event) => event.name === 'toast'), false);
  assert.equal(events.some((event) => event.name === 'pulsed'), true);
});
