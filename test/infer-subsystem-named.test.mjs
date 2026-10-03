// Losing the player's own drive, guns, or sensors has to say which part. Another hull stays generic.
import test from 'node:test';
import assert from 'node:assert/strict';

import { presentationAdapters } from '../src/systems/presentationAdapters.js';

function host() {
  const events = [];
  const sys = Object.assign(Object.create(presentationAdapters), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: { playerId: 7 },
  });
  return { sys, events };
}

function alerts(events) {
  return events.filter((event) => event.name === 'alert').map((event) => event.payload.text);
}

function captions(events) {
  return events.filter((event) => event.name === 'presentation:caption').map((event) => event.payload.text);
}

test('the player hull names the part that died and the part that comes back', () => {
  const { sys, events } = host();
  sys._applyUi({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_drive' });
  sys._applyAccessibility({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_drive' });
  sys._applyUi({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_weapon' });
  sys._applyUi({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_sensor' });
  sys._applyUi({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_tether_spool' });
  sys._applyUi({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_transport_clamp' });
  sys._applyUi({ id: 'subsystem.restored', targetId: 7, subsystemId: 'subsystem_drive' });
  sys._applyUi({ id: 'subsystem.restored', targetId: 7, subsystemId: 'subsystem_tether_spool' });
  assert.deepEqual(alerts(events), [
    'Drive out — the ship is not pushing',
    'Guns out — the battery is dark',
    'Sensors out — the board is blind',
    'Massline spool out — the rope will not hold',
    'Clamp out — the load is no longer held',
    'Drive back online',
    'Massline spool back online',
  ]);
  assert.deepEqual(captions(events), ['Drive out — the ship is not pushing']);
});

test('another hull and an unnamed part keep the generic line', () => {
  const { sys, events } = host();
  sys._applyUi({ id: 'subsystem.disabled', targetId: 3, subsystemId: 'subsystem_weapon' });
  sys._applyUi({ id: 'subsystem.disabled', targetId: 7, subsystemId: 'subsystem_cargo' });
  sys._applyAccessibility({
    id: 'subsystem.disabled',
    targetId: 7,
    subsystemId: 'subsystem_drive',
    accessibilityText: 'Owner line',
  });
  assert.deepEqual(alerts(events), ['SUBSYSTEM DISABLED', 'SUBSYSTEM DISABLED']);
  assert.deepEqual(captions(events), ['Owner line']);
});
