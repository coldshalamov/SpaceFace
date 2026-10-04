// A hit or a snare that kills cruise says so. The pilot's own cut stays quiet.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cruise } from '../src/systems/cruise.js';
import { admitReceipt } from '../src/ui/hudAttention.js';

function host(phase) {
  const events = [];
  const sys = Object.assign(Object.create(cruise), {
    state: { playerId: 1, player: { cruise: { phase, t: 2, stumbleCdT: 0, stumbleT: 0 } } },
    bus: { emit(name, payload) { events.push({ name, payload }); } },
  });
  return { sys, events };
}

function texts(events) {
  return events.filter((event) => event.name === 'toast').map((event) => event.payload.text);
}

test('a hit that drops cruise says the ship took it', () => {
  const { sys, events } = host('cruising');
  sys._drop('damage');
  sys._drop('damage');
  assert.equal(sys.state.player.cruise.phase, 'off');
  assert.equal(events.find((event) => event.name === 'toast').payload.kind, 'error');
  assert.deepEqual(texts(events), ['Cruise lost — the ship took damage']);
  assert.equal(admitReceipt({ text: texts(events)[0], kind: 'error', combat: true }).admit, true);
});

test('a snare that drops cruise names the snare', () => {
  const { sys, events } = host('cruising');
  sys._drop('snared', 9);
  assert.equal(events.some((event) => event.name === 'cruise:snared'), true);
  assert.deepEqual(texts(events), ['Cruise lost — mass snare']);
});

test('boosting out of a charge does not claim a hit', () => {
  const { sys, events } = host('charging');
  sys._drop('boost');
  assert.equal(sys.state.player.cruise.phase, 'off');
  assert.deepEqual(texts(events), []);
});

test('the pilot cutting cruise does not get a warning', () => {
  const { sys, events } = host('cruising');
  sys._drop('manual');
  assert.deepEqual(texts(events), []);
});
