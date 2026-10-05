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
  const before = rt.pruneSweeps;

  removeRock(state, state.rocks[0]);
  const after = step(state);
  assert.equal(after.pruneSweeps, before + 1, 'the membership move swept exactly once');
  assert.ok(!after.signaturesById.has(state.rocks[0].id), 'the dead id is pruned');
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
