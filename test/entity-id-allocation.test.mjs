// The entity id allocator must never publish an id that still addresses a live entity or a
// world-ledger row. It skipped ledger ids but not state.entities: a reserved spawn
// (spawn({id})) leaves nextEntityId untouched, so the very next default spawn re-issued the
// reserved id — silently rebinding the Map to a different object while entityList kept both
// corpses. Free-list entries must also be validated: corrupt saves or foreign writers can
// leave non-integer garbage that must never become an entity id.
//   node --test test/entity-id-allocation.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { allocateEntityId } from '../src/core/entity.js';
import { createSimulation } from '../src/core/sim.js';

function bareState(overrides = {}) {
  return {
    entities: new Map(),
    freeIds: [],
    nextEntityId: 1,
    world: {},
    ...overrides,
  };
}

test('a reserved spawn cannot be overwritten by the next default spawn', () => {
  const sim = createSimulation({ seed: 1, systems: [] });
  try {
    const first = sim.spawn({ id: 1, type: 'fx' });
    const second = sim.spawn({ type: 'fx' });
    assert.equal(first.id, 1);
    assert.notEqual(second.id, first.id, 'the default spawn must skip the live reserved id');
    assert.equal(sim.state.entities.size, 2, 'both occupants stay addressable');
    assert.equal(sim.state.entities.get(1), first, 'the reserved occupant still owns id 1');
    assert.equal(sim.state.entities.get(second.id), second);
    const ids = sim.state.entityList.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'entityList ids stay unique');
    const index = sim.state.entityIndex;
    assert.equal(index._indexedIds.has(first.id), true);
    assert.equal(index._indexedIds.has(second.id), true);
    assert.equal(sim.state.entityList.filter((e) => e.type === 'fx').length, 2);
  } finally {
    sim.dispose();
  }
});

test('reserved spawns do not consume the advancing allocator', () => {
  const sim = createSimulation({ seed: 1, systems: [] });
  try {
    const reserved = sim.spawn({ id: 40, type: 'fx' });
    assert.equal(reserved.id, 40);
    const next = sim.spawn({ type: 'fx' });
    assert.equal(next.id, 1, 'the reserved id leaves nextEntityId alone');
    assert.equal(sim.state.entities.size, 2);
  } finally {
    sim.dispose();
  }
});

test('the advancing allocator skips live entity ids and all three world ledgers', () => {
  const state = bareState({
    nextEntityId: 4,
    entities: new Map([[4, {}], [5, {}]]),
    world: {
      farActors: { byId: new Map([[6, {}]]) },
      dressing: { byId: new Map([[7, {}]]) },
      asteroidField: { byId: new Map([[8, {}]]) },
    },
  });
  const id = allocateEntityId(state);
  assert.equal(id, 9, 'live ids 4-5 and ledger ids 6-8 are all skipped');
  assert.equal(state.nextEntityId, 10);
});

test('each world ledger reserves its ids on the free-list and advancing paths', () => {
  for (const name of ['farActors', 'dressing', 'asteroidField']) {
    const held = { byId: new Map([[3, {}]]) };
    const freeList = bareState({ freeIds: [3], nextEntityId: 3, world: { [name]: held } });
    assert.equal(allocateEntityId(freeList), 4, `${name} id skipped on the free list`);
    const advancing = bareState({ nextEntityId: 3, world: { [name]: held } });
    assert.equal(allocateEntityId(advancing), 4, `${name} id skipped while advancing`);
  }
});

test('a free-list id whose occupant is still live is skipped', () => {
  const state = bareState({ freeIds: [5], nextEntityId: 9 });
  state.entities.set(5, {});
  assert.equal(allocateEntityId(state), 9, 'live ids drain to the canonical next id');
});

test('a duplicate free-list id is skipped once its earlier pop went live', () => {
  const state = bareState({ freeIds: [4, 4], nextEntityId: 7 });
  assert.equal(allocateEntityId(state), 4, 'the first pop is free');
  state.entities.set(4, {});
  assert.equal(allocateEntityId(state), 7, 'the duplicate no longer counts as free');
});

test('valid free-list ids keep LIFO ordering ahead of the advancing counter', () => {
  const state = bareState({ freeIds: [7, 3], nextEntityId: 20 });
  assert.equal(allocateEntityId(state), 3, 'last pushed id returns first');
  assert.equal(allocateEntityId(state), 7);
  assert.equal(allocateEntityId(state), 20, 'the free list drains before advancing');
  assert.equal(state.nextEntityId, 21);
});

test('malformed free-list entries are never published as entity ids', () => {
  const state = bareState({ freeIds: [0, -1, NaN, Infinity, 1.5, '2'], nextEntityId: 2 });
  const id = allocateEntityId(state);
  assert.equal(id, 2, 'every malformed entry is skipped to the canonical id');
  assert.equal(Number.isSafeInteger(id) && id > 0, true);
  assert.equal(state.freeIds.length, 0, 'malformed entries are consumed, not re-published');
});

test('the advancing allocator still rejects a corrupt nextEntityId', () => {
  assert.throws(() => allocateEntityId(bareState({ nextEntityId: 0 })), /positive integer/);
  assert.throws(() => allocateEntityId(bareState({ nextEntityId: 1.5 })), /positive integer/);
  assert.throws(() => allocateEntityId(null), TypeError);
});

test('an occupied maximum safe id fails closed instead of publishing an unsafe id', () => {
  const live = bareState({ nextEntityId: Number.MAX_SAFE_INTEGER });
  live.entities.set(Number.MAX_SAFE_INTEGER, {});
  assert.throws(() => allocateEntityId(live), RangeError,
    'skipping a live MAX_SAFE_INTEGER occupant must not return 2^53');
  const ledgerHeld = bareState({
    nextEntityId: Number.MAX_SAFE_INTEGER,
    world: { dressing: { byId: new Map([[Number.MAX_SAFE_INTEGER, {}]]) } },
  });
  assert.throws(() => allocateEntityId(ledgerHeld), RangeError,
    'a ledger-held MAX_SAFE_INTEGER must not return 2^53 either');
});

test('the maximum safe id itself is still a valid final allocation', () => {
  const state = bareState({ nextEntityId: Number.MAX_SAFE_INTEGER });
  assert.equal(allocateEntityId(state), Number.MAX_SAFE_INTEGER,
    'the top of the safe range is allocatable');
  assert.throws(() => allocateEntityId(state), TypeError,
    'the counter lands past the safe range and the next allocation fails closed');
});
