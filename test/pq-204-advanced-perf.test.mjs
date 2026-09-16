import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packCombatTable, queryCombatTableRadius, COMBAT_TABLE_FLAGS } from '../src/core/combatTable.js';
import { beginDirtyTick, markDirty, isDirty, collectDirtyIds, DIRTY } from '../src/core/dirtyJournal.js';
import {
  stampNearWorkBudget,
  hasNearWorkSlot,
  NEAR_WORK_TOKEN_BUDGET,
} from '../src/core/activityScheduler.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import { shouldMaintainDynamicSpatialHash } from '../src/core/physics.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { resolveFarEncounters } from '../src/world/farEncounterOutcomes.js';
import { mayRapierIslandSleep } from '../src/core/sg02DynamicBodyOwner.js';
import { createPipelineAdmissionTracker } from '../src/render/pipelineReadiness.js';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  packPresentationWorldToFence,
} from '../src/render/snapshotFence.js';
import { canonicalizeSurfaceProgramFamilyKey } from '../src/render/illustratedSurface.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('combat SoA packs ships and projectiles and answers a radius query', () => {
  const state = {
    tick: 4,
    playerId: 1,
    entityIndex: {
      shipLike: [
        { id: 1, alive: true, isPlayer: true, pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 }, rot: 0.2, radius: 6, team: 0 },
        { id: 2, alive: true, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 1 },
      ],
      projectiles: [
        { id: 9, alive: true, pos: { x: 8, z: 0 }, vel: { x: 20, z: 0 }, rot: 0, radius: 1, team: 0 },
      ],
    },
  };
  const table = packCombatTable(state);
  assert.equal(table.count, 3);
  assert.equal(table.tick, 4);
  assert.equal(table.flags[0] & COMBAT_TABLE_FLAGS.PLAYER, COMBAT_TABLE_FLAGS.PLAYER);
  const ids = queryCombatTableRadius(table, 0, 0, 12, []);
  assert.deepEqual(ids, [1, 9]);
});

test('dirty journal clears per tick and unions bits', () => {
  const state = {};
  beginDirtyTick(state, 10);
  markDirty(state, 3, DIRTY.POSE);
  markDirty(state, 3, DIRTY.CARGO);
  markDirty(state, 8, DIRTY.MEMBERSHIP);
  assert.equal(isDirty(state, 3, DIRTY.POSE), true);
  assert.equal(isDirty(state, 3, DIRTY.CARGO), true);
  assert.equal(isDirty(state, 8, DIRTY.POSE), false);
  assert.deepEqual(collectDirtyIds(state, DIRTY.POSE | DIRTY.MEMBERSHIP).sort((a, b) => a - b), [3, 8]);
  beginDirtyTick(state, 11);
  assert.equal(isDirty(state, 3, DIRTY.POSE), false);
});

test('NEAR token budget always wakes the player and combatants', () => {
  const civilians = Array.from({ length: 40 }, (_, i) => ({
    id: 100 + i,
    alive: true,
    activity: { simTier: SIM_TIER.S1_NEAR },
  }));
  const state = {
    tick: 6,
    playerId: 1,
    entityIndex: {
      shipLike: [
        { id: 1, isPlayer: true, alive: true },
        { id: 2, alive: true, ai: { combatant: true } },
        ...civilians,
      ],
    },
  };
  const set = stampNearWorkBudget(state);
  assert.equal(hasNearWorkSlot(state, state.entityIndex.shipLike[0]), true);
  assert.equal(hasNearWorkSlot(state, state.entityIndex.shipLike[1]), true);
  let granted = 0;
  for (const entity of civilians) {
    if (set.has(entity.id)) granted++;
  }
  assert.equal(granted, NEAR_WORK_TOKEN_BUDGET);
  const later = { ...state, tick: 7 };
  stampNearWorkBudget(later);
  assert.notDeepEqual([...later.nearWorkIds].sort(), [...set].sort());
});

test('spatial hash stays on at sparse density and reuses a still dynamic query', () => {
  assert.equal(shouldMaintainDynamicSpatialHash({
    entityIndex: { __spacefaceEntityIndexV1: true, collidables: [1, 2], asteroids: [] },
  }), true);
  const hash = new SpatialHash(64);
  const a = { id: 1, alive: true, collides: true, pos: { x: 4, z: 4 }, radius: 3 };
  const b = { id: 2, alive: true, collides: true, pos: { x: 12, z: 4 }, radius: 3 };
  hash.rebuildLayers([], [a, b], 1);
  const first = hash.queryRadius(4, 4, 40, []);
  assert.equal(first.length, 2);
  assert.equal(hash.diagnostics.dynamicQueryCacheMisses, 1);
  const second = hash.queryRadius(4, 4, 40, []);
  assert.equal(second.length, 2);
  assert.equal(hash.diagnostics.dynamicQueryCacheHits, 1);
});

test('far hostile pairs in one cell resolve on a seeded delay', () => {
  const pirate = {
    id: 11, type: 'ship', team: 1, trafficRole: 'pirate', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 }, nextEventAtT: 10, hull: 40,
  };
  const trader = {
    id: 12, type: 'ship', team: 0, trafficRole: 'hauler', alive: true,
    pos: { x: 8, z: 0 }, vel: { x: 0, z: 0 }, nextEventAtT: 10, hull: 40,
  };
  const state = {
    meta: { seed: 47 },
    world: {
      farActors: {
        rows: [pirate, trader],
        grid: new Map([['0:0', [pirate, trader]]]),
      },
    },
  };
  assert.equal(resolveFarEncounters(state, 9), 0);
  assert.equal(resolveFarEncounters(state, 10), 1);
  const wreck = [pirate, trader].find((row) => row.type === 'wreck');
  const winner = [pirate, trader].find((row) => row.type !== 'wreck');
  assert.ok(wreck);
  assert.equal(wreck.hull, 0);
  assert.ok(winner.nextEventAtT > 10);
  assert.equal(resolveFarEncounters(state, 10), 0);
});

test('Rapier island sleep is save-safe and skips player, projectiles, and taut lines', () => {
  assert.equal(mayRapierIslandSleep({ isPlayer: true }, { dynamic: true }), false);
  assert.equal(mayRapierIslandSleep({ type: 'projectile' }, { dynamic: true, material: 'projectile' }), false);
  assert.equal(mayRapierIslandSleep({ type: 'ship' }, { dynamic: true }), true);
  assert.equal(mayRapierIslandSleep({ type: 'ship' }, { dynamic: false }), false);
});

test('after-present compile admits one queued subject', async () => {
  const compiled = [];
  const tracker = createPipelineAdmissionTracker((subjects) => {
    compiled.push(...subjects);
    return { n: subjects.length };
  }, { quietMs: 10_000, maxWaitMs: 10_000 });
  const first = tracker.compile('hull-a');
  const second = tracker.compile('hull-b');
  await tracker.flushOneAfterPresent();
  assert.deepEqual(compiled, ['hull-a']);
  await tracker.flushOneAfterPresent();
  assert.deepEqual(compiled, ['hull-a', 'hull-b']);
  await first;
  await second;
});

test('snapshot fence packs and interpolates bank/pitch without entity refs', () => {
  const fence = createSnapshotFence({ capacity: 4 });
  const world = {
    getDiagnostics() { return { active: 1 }; },
    activeSlots: [0],
    alive: [1],
    entityIds: [7],
    typeCodes: [1],
    x: [10],
    y: [0],
    z: [4],
    rot: [0],
    flags: [1],
    bank: [0.2],
    pitch: [-0.1],
  };
  packPresentationWorldToFence(world, fence, 1, 3);
  world.x[0] = 20;
  world.bank[0] = 0.6;
  world.pitch[0] = 0.1;
  packPresentationWorldToFence(world, fence, 2, 3);
  const hull = { rotation: { x: 0, y: 0, z: 0 } };
  const mesh = { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, userData: { hull } };
  applySnapshotPoseToMesh(mesh, fence.latestSnapshot(), 7, { x: 0, z: 0 }, fence.previousSnapshot(), 0.5);
  assert.equal(mesh.position.x, 15);
  assert.ok(Math.abs(hull.rotation.x - 0.4) < 1e-5);
  assert.ok(Math.abs(hull.rotation.z) < 1e-5);
});

test('packed-ORM family keys drop compile-source concatenation', () => {
  const noisy = 'MeshStandardMaterial|float roughnessFactor = roughness;|spaceface-packed-orm-single-sample-v1|deadbeef-dead-beef-dead-beefdeadbeef';
  assert.equal(
    canonicalizeSurfaceProgramFamilyKey(noisy, 'spaceface-packed-orm-single-sample-v1'),
    'spaceface-packed-orm-single-sample-v1',
  );
  const partsLibrary = fs.readFileSync(path.join(ROOT, 'src/render/partsLibrary.js'), 'utf8');
  assert.match(partsLibrary, /canonicalizeSurfaceProgramFamilyKey/);
  const renderer = fs.readFileSync(path.join(ROOT, 'src/render/renderer.js'), 'utf8');
  assert.match(renderer, /this\._opaqueBatchEnabled = false/);
  assert.match(renderer, /drainAfterPresentCompile/);
});
