// The cloak ending because the charge ran out has to say so. A toggle does not.
import test from 'node:test';
import assert from 'node:assert/strict';

import { cloak } from '../src/systems/cloak.js';

function drop(reason) {
  const events = [];
  const sys = Object.assign(Object.create(cloak), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: { massline2: { cloak: { active: true, energy: reason === 'depleted' ? 0 : 0.4 } } },
  });
  sys._drop(reason);
  return events;
}

test('a cloak that runs out of charge says it depleted', () => {
  const events = drop('depleted');
  assert.equal(events.filter((event) => event.name === 'cloak:dropped').length, 1);
  const toast = events.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'Cloak depleted');
  assert.equal(toast.payload.kind, 'warn');
});

test('switching the cloak off does not claim it depleted', () => {
  const events = drop('toggled');
  assert.equal(events.some((event) => event.name === 'toast'), false);
  assert.equal(events.some((event) => event.name === 'cloak:dropped'), true);
});
