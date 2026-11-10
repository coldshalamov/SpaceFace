// D130 change-loop leg — classifyWorld's signaturesById prune used to walk every
// historical id on every pass, including fully retained frames. Nothing can have
// become prunable unless sanctioned membership moved (spawn/remove both bump the
// entity index version), so a steady membership skips the sweep outright. These
// pins hold both halves of that contract: quiet classifies cost zero sweeps, and
// a membership move still sweeps exactly once and really prunes the dead id.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureActivityClassified,
  setClassifyFrameQuietRetainForBench,
} from '../src/world/activityRuntime.js';
import { createSimulation } from '../src/core/sim.js';

function makeWorld(rockCount = 24) {
  const rocks = [];
  for (let i = 0; i < rockCount; i++) {
    const a = (i / rockCount) * Math.PI * 2;
    const r = 80 + (i % 7) * 30;
    rocks.push({
      id: 200 + i,
      type: 'asteroid',
      alive: true,
      pos: { x: Math.cos(a) * r, z: Math.sin(a) * r },
      vel: { x: 0, z: 0 },
      radius: 10,
      data: {},
      flags: {},
    });
  }
  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    isPlayer: true,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 6,
    maxSpeed: 120,
    data: { combat: {} },
    flags: {},
  };
  const entities = new Map([[1, player], ...rocks.map((r) => [r.id, r])]);
  return {
    tick: 1,
    simTime: 1,
    playerId: 1,
    entities,
    entityList: [player, ...rocks],
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      ready: true,
      version: 1,
      physicsStaticVersion: 1,
      projectiles: [],
      closedFormMovers: [],
    },
    camera: { zoom: 144, tilt: 60 },
    settings: { video: { fov: 50 } },
    runtime: { profileId: 'production' },
    rocks,
    player,
  };
}

function step(state) {
  state.tick++;
  state.simTime += 1 / 60;
  return ensureActivityClassified(state);
}

function removeRock(state, rock) {
  state.entities.delete(rock.id);
  const i = state.entityList.indexOf(rock);
  assert.ok(i >= 0);
  state.entityList.splice(i, 1);
  state.entityIndex.version++;
  state.entityIndex.physicsStaticVersion++;
}

test('a steady world stops paying the signatures prune sweep', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  const sweepsAfterWarmup = state.activityRuntime && ensureActivityClassified(state).pruneSweeps;
  assert.ok(sweepsAfterWarmup >= 1, 'the first classify still sweeps once');
  step(state);
  step(state);
  step(state);
  step(state);
  const rt = ensureActivityClassified(state);
  assert.equal(rt.pruneSweeps, sweepsAfterWarmup,
    'four more steady ticks must not re-walk the signature keyspace');
});

test('a sanctioned removal re-arms the sweep and prunes the dead id', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  const rt = ensureActivityClassified(state);
  assert.ok(rt.signaturesById.has(state.rocks[0].id), 'the rock id is tracked');
  // These two maps are written unconditionally for every visited entity, so the post-sweep
  // absence pins below are not vacuous.
  assert.ok(rt.reasonsById.has(state.rocks[0].id), 'visited entities always carry a reasons entry');
  assert.ok(rt.signatureCacheById.has(state.rocks[0].id), 'visited entities always carry a signature cache entry');
  const before = rt.pruneSweeps;

  removeRock(state, state.rocks[0]);
  const after = step(state);
  assert.equal(after.pruneSweeps, before + 1, 'the membership move swept exactly once');
  // All five bookkeeping structures drop the dead id, not just the two that drive behavior.
  for (const map of [after.signaturesById, after.reasonsById, after.pinBuffersById, after.signatureCacheById]) {
    assert.ok(!map.has(state.rocks[0].id), `a stale ${map === after.signaturesById ? 'signature' : 'bookkeeping'} entry survived the sweep`);
  }
  assert.ok(!after.seenEntityIds.has(state.rocks[0].id), 'seen-set is pruned with it');

  // Steady again — the gate re-locks.
  step(state);
  step(state);
  assert.equal(ensureActivityClassified(state).pruneSweeps, before + 1);
});

test('a mapped corpse keeps its bookkeeping until the next membership move', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  const rt = ensureActivityClassified(state);
  const rock = state.rocks[1];
  assert.ok(rt.signaturesById.has(rock.id));

  // alive=false WITHOUT a sanctioned removal: no index bump, no sweep — the stale
  // bookkeeping is allowed to linger (it is bookkeeping only; a dead entity is never
  // visited at line ~1551 so the entry is unreachable for correctness).
  rock.alive = false;
  const before = rt.pruneSweeps;
  step(state);
  assert.equal(ensureActivityClassified(state).pruneSweeps, before,
    'a corpse with steady membership does not trigger a sweep');
  assert.ok(ensureActivityClassified(state).signaturesById.has(rock.id),
    'the dead id lingers until a real membership move');

  removeRock(state, rock);
  const after = step(state);
  assert.equal(after.pruneSweeps, before + 1);
  assert.ok(!after.signaturesById.has(rock.id),
    'the next membership move collects the lingering entry');
});

test('the production removal helper re-arms the sweep — not a fixture version bump', () => {
  // The gate's load-bearing premise is that the SANCTIONED path bumps the membership
  // version: helpers.removeEntity → _removeEntityAtIndex → removeEntityIndex. Drive that
  // path end-to-end on a real simulation so a future change that drops the bump goes red
  // here instead of silently starving the sweep in production.
  const sim = createSimulation({ seed: 6, systems: [] });
  try {
    const state = sim.state;
    const rock = sim.spawn({ type: 'asteroid', pos: { x: 120, z: 0 }, radius: 8, data: {} });
    const warm = ensureActivityClassified(state);
    assert.ok(warm.signaturesById.has(rock.id), 'the spawn is visited and tracked');
    const before = warm.pruneSweeps;
    const versionBefore = state.entityIndex.version;

    sim.helpers.removeEntity(rock.id, { immediate: true });
    assert.ok(state.entityIndex.version > versionBefore,
      'sanctioned removal must bump the entity-index membership version');
    assert.equal(state.entities.get(rock.id), undefined);

    state.tick++;
    const after = ensureActivityClassified(state);
    assert.equal(after.pruneSweeps, before + 1,
      'the real removal path must re-arm exactly one sweep');
    assert.ok(!after.signaturesById.has(rock.id), 'the removed id is pruned');
    assert.ok(!after.seenEntityIds.has(rock.id));
  } finally {
    sim.dispose();
  }
});

test('a raw list splice without an index bump still sweeps on the length change', () => {
  setClassifyFrameQuietRetainForBench(true);
  const state = makeWorld();
  ensureActivityClassified(state);
  step(state);
  step(state);
  const before = ensureActivityClassified(state).pruneSweeps;

  // Unsanctioned edit: map delete + list splice with NO entityIndex.version touch — the
  // raw-list length arm must still catch it (index truth is only consulted for membership,
  // never trusted to cover raw edits).
  const rock = state.rocks[0];
  state.entities.delete(rock.id);
  const i = state.entityList.indexOf(rock);
  state.entityList.splice(i, 1);

  const after = step(state);
  assert.equal(after.pruneSweeps, before + 1,
    'a length delta alone must re-arm the sweep');
  assert.ok(!after.signaturesById.has(rock.id));
});

test('a world with no entity index sweeps every pass — there is no change signal', () => {
  const state = makeWorld();
  delete state.entityIndex;
  const first = step(state).pruneSweeps;
  assert.ok(first >= 1, 'the first classify sweeps');
  const second = step(state).pruneSweeps;
  const third = step(state).pruneSweeps;
  assert.equal(second, first + 1, 'no index → every pass sweeps');
  assert.equal(third, second + 1);
});
