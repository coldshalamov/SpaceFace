// Flying to a logged loss while four wrecks are already live must say why nothing appears.
import test from 'node:test';
import assert from 'node:assert/strict';

import { intervention } from '../src/systems/intervention.js';

function arrive() {
  const events = [];
  let spawned = 0;
  const pending = { id: 9, sectorId: 'sector_test', kind: 'drone' };
  const sys = Object.assign(Object.create(intervention), {
    state: {
      world: { currentSectorId: 'sector_test' },
      interventions: [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }],
      pendingInterventions: [pending],
      entities: { get() { return { id: 1, pos: { x: 0, z: 0 } }; } },
    },
    bus: { emit(name, payload) { events.push({ name, payload }); } },
    helpers: { spawnEntity() { spawned += 1; return { id: 50 }; } },
  });
  return { sys, events, pending, spawned: () => spawned };
}

test('a full recovery list says so once and does not spawn another wreck', () => {
  const { sys, events, pending, spawned } = arrive();
  sys._materializePendings();
  sys._materializePendings();
  assert.equal(spawned(), 0);
  assert.equal(pending.capTold, true);
  const toasts = events.filter((event) => event.name === 'toast');
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].payload.text, 'Recovery sites are full — finish one before the next wreck appears');
});
