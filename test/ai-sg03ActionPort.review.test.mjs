import assert from 'node:assert/strict';
import test from 'node:test';

import { createSG03ActionPort } from '../src/ai/sg03ActionPort.js';
import { TacticalAIStack } from '../src/ai/stack.js';

test('SG-03 action-port caches can be released when an entity leaves the tactical roster', () => {
  const actor = {
    id: 42,
    type: 'ship',
    team: 1,
    alive: true,
    cap: 100,
    capMax: 100,
    pos: { x: 0, z: 0 },
    data: {},
  };
  const state = {
    tick: 1,
    playerId: 1,
    player: { heat: 0 },
    entityList: [actor],
    entities: new Map([[actor.id, actor]]),
  };
  const port = createSG03ActionPort({ state, bus: null, helpers: {} });

  port.list(actor.id);
  assert.equal(port.forget(actor.id), true, 'the populated per-entity cache entry is released');
  assert.equal(port.forget(actor.id), false, 'forget is idempotent after release');
});

test('the tactical stack releases action-port state when a roster entity disappears', () => {
  const forgotten = [];
  const stack = new TacticalAIStack({
    ports: {
      sensors: { frameFor() { return null; } },
      actions: {
        list() { return []; },
        canStart() { return { ok: true }; },
        start() { return null; },
        status() { return null; },
        interrupt() {},
        forget(entityId) { forgotten.push(entityId); },
      },
      maneuver: { request() {} },
      roster: { listSquads() { return []; } },
    },
    config: { trace: { enabled: false } },
  });

  stack.forgetEntity(42);
  assert.deepEqual(forgotten, [42]);
});
