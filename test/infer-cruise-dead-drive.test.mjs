// Cruise on a dead drive would lock the guns for a charge the hull cannot finish.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cruise } from '../src/systems/cruise.js';

function run({ disabled, phase, press }) {
  const events = [];
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 } };
  const state = {
    mode: 'flight',
    playerId: 1,
    simTime: 1,
    entities: new Map([[1, player]]),
    player: { cruise: { phase, t: phase === 'off' ? 0 : 1, stumbleT: 0, stumbleCdT: 0 } },
    input: { actions: { cruise: press } },
    combat: {
      entities: {
        1: { subsystems: { subsystem_drive: { effectiveDisabled: disabled } } },
      },
    },
  };
  const sys = Object.assign(Object.create(cruise), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state,
    _wasCruiseAction: false,
  });
  sys.update(1 / 60, state);
  return { events, cruise: state.player.cruise };
}

function toast(events) {
  const hit = events.find((event) => event.name === 'toast');
  return hit ? hit.payload.text : null;
}

test('a dead drive refuses a new cruise and does not lock the guns behind a charge', () => {
  const { events, cruise: row } = run({ disabled: true, phase: 'off', press: true });
  assert.equal(row.phase, 'off');
  assert.equal(toast(events), 'Drive out — cruise can\'t hold');
  assert.equal(events.some((event) => event.name === 'cruise:charging'), false);
});

test('a cruise already up drops when the drive dies, without a yaw stumble', () => {
  const { events, cruise: row } = run({ disabled: true, phase: 'cruising', press: false });
  assert.equal(row.phase, 'off');
  assert.equal(row.stumbleT, 0);
  assert.equal(toast(events), 'Drive out — cruise can\'t hold');
  assert.equal(events.find((event) => event.name === 'cruise:dropped').payload.reason, 'drive');
});

test('a live drive still begins the charge', () => {
  const { events, cruise: row } = run({ disabled: false, phase: 'off', press: true });
  assert.equal(row.phase, 'charging');
  assert.equal(toast(events), null);
  assert.equal(events.some((event) => event.name === 'cruise:charging'), true);
});
