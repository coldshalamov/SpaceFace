// Cruise dies beside a large body with no shot and no button. That drop has to say why.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cruise } from '../src/systems/cruise.js';

function drop(reason) {
  const events = [];
  const sys = Object.assign(Object.create(cruise), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: {
      playerId: 7,
      player: { cruise: { phase: 'cruising', t: 3, stumbleT: 0, stumbleCdT: 0 } },
    },
  });
  sys._drop(reason);
  return { events, phase: sys.state.player.cruise.phase };
}

test('a mass lock names itself when it drops cruise', () => {
  const { events, phase } = drop('masslock');
  assert.equal(phase, 'off');
  const toast = events.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'Cruise dropped — mass lock');
  assert.equal(events.filter((event) => event.name === 'cruise:dropped').length, 1);
});

test('a manual cruise cut does not claim a mass lock', () => {
  const { events, phase } = drop('manual');
  assert.equal(phase, 'off');
  assert.equal(events.some((event) => event.name === 'toast'), false);
});
