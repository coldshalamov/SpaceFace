// A hail press that cannot connect has to say why.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanner } from '../src/systems/scanner.js';

function ask(state, payload = {}) {
  const events = [];
  const sys = Object.assign(Object.create(scanner), {
    state,
    bus: { emit(name, body) { events.push({ name, body }); } },
    _clearContactHail() {},
  });
  const ok = sys._requestContactHail(payload);
  const toast = events.find((event) => event.name === 'toast');
  return { ok, text: toast ? toast.body.text : null };
}

test('a hail with nobody locked says there is no contact', () => {
  const { ok, text } = ask({
    mode: 'flight',
    playerId: 1,
    player: {},
    entities: new Map([[1, { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' }]]),
    simTime: 1,
    tick: 1,
  });
  assert.equal(ok, false);
  assert.equal(text, 'No contact to hail');
});

test('a hail on a wreck says the contact is gone', () => {
  const wreck = { id: 4, alive: false, type: 'ship', pos: { x: 20, z: 0 } };
  const { ok, text } = ask({
    mode: 'flight',
    playerId: 1,
    player: { targetId: 4 },
    entities: new Map([
      [1, { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' }],
      [4, wreck],
    ]),
    simTime: 1,
    tick: 1,
  }, { targetId: 4 });
  assert.equal(ok, false);
  assert.equal(text, 'No answer — that contact is gone');
});

test('a docked ship does not get a flight hail line', () => {
  const { ok, text } = ask({ mode: 'docked', playerId: 1, player: {}, entities: new Map(), simTime: 1, tick: 1 });
  assert.equal(ok, false);
  assert.equal(text, null);
});
