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

test('firing drops the cloak and says so', () => {
  const events = drop('fired');
  const toast = events.find((event) => event.name === 'toast');
  assert.equal(toast.payload.text, 'Cloak dropped — you fired');
  assert.equal(events.filter((event) => event.name === 'cloak:dropped').length, 1);
});

test('the player\'s own scan burns the cloak and says so', () => {
  const events = [];
  const player = { id: 1, pos: { x: 0, z: 0 } };
  const sys = Object.assign(Object.create(cloak), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: {
      playerId: 1,
      simTime: 4,
      runtime: { features: { massline2: { enabled: true, cloak: true } } },
      entities: new Map([[1, player]]),
      massline2: { cloak: { active: true, energy: 0.8, radius: 80 } },
    },
  });
  sys._onScanPulse({ pos: { x: 0, z: 0 }, radius: 400, source: 'player-scanner', scannerId: 1 });
  assert.ok(sys.state.massline2.cloak.revealUntil > 4);
  assert.equal(events.find((event) => event.name === 'toast').payload.text, 'Cloak burned — your scan lit you up');
});

test('a ship caught in the same pulse does not get the player line', () => {
  const events = [];
  const player = { id: 1, pos: { x: 0, z: 0 } };
  const other = { id: 9, pos: { x: 30, z: 0 }, data: { cloak: { active: true, radius: 80 } } };
  const sys = Object.assign(Object.create(cloak), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: {
      playerId: 1,
      simTime: 4,
      runtime: { features: { massline2: { enabled: true, cloak: true } } },
      entities: new Map([[1, player], [9, other]]),
      massline2: { cloak: { active: false, energy: 1, radius: 0 } },
    },
  });
  sys._onScanPulse({ pos: { x: 0, z: 0 }, radius: 400, source: 'player-scanner', scannerId: 1 });
  assert.equal(events.some((event) => event.name === 'toast'), false);
  assert.equal(events.filter((event) => event.name === 'cloak:burned').length, 1);
  assert.equal(events[0].payload.entityId, 9);
});

test('a pulse that misses the player does not burn the cloak', () => {
  const events = [];
  const player = { id: 1, pos: { x: 0, z: 0 } };
  const sys = Object.assign(Object.create(cloak), {
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    state: {
      playerId: 1,
      simTime: 4,
      runtime: { features: { massline2: { enabled: true, cloak: true } } },
      entities: new Map([[1, player]]),
      massline2: { cloak: { active: true, energy: 0.8, radius: 80 } },
    },
  });
  sys._onScanPulse({ pos: { x: 5000, z: 5000 }, radius: 100, source: 'player-scanner', scannerId: 1 });
  assert.equal(events.length, 0);
  assert.equal(sys.state.massline2.cloak.revealUntil, undefined);
});

test('switching the cloak off does not claim it depleted', () => {
  const events = drop('toggled');
  assert.equal(events.some((event) => event.name === 'toast'), false);
  assert.equal(events.some((event) => event.name === 'cloak:dropped'), true);
});
