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

test('a dead sensor bank does not pulse and does not start the recharge', () => {
  const { events, sys } = pulseSystem(12, 0);
  sys.state.combat = {
    entities: { 1: { subsystems: { subsystem_sensor: { effectiveDisabled: true } } } },
  };
  sys._cooldownUntil = 0;
  sys.state.input.actions.scanPulse = true;
  sys.update(1 / 60, sys.state);
  assert.equal(events.filter((event) => event.name === 'pulsed').length, 1);
  const second = events.filter((event) => event.name === 'toast');
  assert.equal(second.length, 1);
  assert.equal(second[0].payload.text, 'Sensors out — the board is blind');
  assert.equal(sys._cooldownUntil, 0);
});

test('a jammed sensor does not pulse either', () => {
  const { events, sys } = pulseSystem(1, 20);
  sys.state.combat = { entities: { 1: { capabilities: { sensor: false }, subsystems: { subsystem_sensor: { effectiveDisabled: false } } } } };
  sys.state.input.actions.scanPulse = true;
  sys.update(1 / 60, sys.state);
  assert.equal(events.some((event) => event.name === 'pulsed'), false);
  assert.equal(events.at(-1).payload.text, 'Sensors aren\'t answering — jammed');
  assert.equal(sys._cooldownUntil, 20);
});
