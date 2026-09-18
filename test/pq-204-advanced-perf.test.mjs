import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { packCombatTable, queryCombatTableRadius, COMBAT_TABLE_FLAGS } from '../src/core/combatTable.js';
import { beginDirtyTick, markDirty, isDirty, collectDirtyIds, hasDirty, DIRTY } from '../src/core/dirtyJournal.js';
import {
  stampNearWorkBudget,
  hasNearWorkSlot,
  takeNearWorkSlice,
  NEAR_WORK_TOKEN_BUDGET,
} from '../src/core/activityScheduler.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import { shouldMaintainDynamicSpatialHash } from '../src/core/physics.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { resolveFarEncounters } from '../src/world/farEncounterOutcomes.js';
import { mayRapierIslandSleep, shouldSkipSleepingKinematics } from '../src/core/sg02DynamicBodyOwner.js';
import { npcFlightNeedsCommand } from '../src/systems/flightV3.js';
import { core } from '../src/core/coreSystem.js';
import { beacons } from '../src/systems/beacons.js';
import { createPipelineAdmissionTracker } from '../src/render/pipelineReadiness.js';
import {
  applySnapshotPoseToMesh,
  createSnapshotFence,
  packPresentationWorldToFence,
} from '../src/render/snapshotFence.js';
import { canonicalizeSurfaceProgramFamilyKey } from '../src/render/illustratedSurface.js';
import { installProgramBinaryCache } from '../src/render/programBinaryCache.js';
import { pickNextContactCompileSubject } from '../src/render/nextContactWarm.js';
import {
  shouldFreezeFlightSubmit,
  shouldSkipFullTickSystems,
} from '../src/core/presentationFreeze.js';
import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { world as worldSystem } from '../src/systems/world.js';
import { RESIDENCY_TIER } from '../src/data/sectorCoordinates.js';

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
      wrecks: [
        { id: 4, alive: true, pos: { x: 5, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 4, team: 1 },
      ],
    },
  };
  const table = packCombatTable(state);
  assert.equal(table.count, 4);
  assert.equal(table.tick, 4);
  assert.equal(table.flags[0] & COMBAT_TABLE_FLAGS.PLAYER, COMBAT_TABLE_FLAGS.PLAYER);
  const ids = queryCombatTableRadius(table, 0, 0, 12, []);
  assert.deepEqual(ids, [1, 9, 4]);
  assert.equal(table.flags[3] & COMBAT_TABLE_FLAGS.WRECK, COMBAT_TABLE_FLAGS.WRECK);
});

test('combat SoA reuses last packed columns when pose and membership stay still', () => {
  const state = {
    tick: 8,
    playerId: 1,
    entityIndex: {
      shipLike: [
        { id: 1, alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6, team: 0 },
      ],
      projectiles: [],
      wrecks: [],
    },
  };
  beginDirtyTick(state, 8);
  const first = packCombatTable(state);
  assert.equal(first.count, 1);
  first.x[0] = 99;
  state.tick = 9;
  beginDirtyTick(state, 9);
  assert.equal(hasDirty(state, DIRTY.POSE | DIRTY.MEMBERSHIP), false);
  const reused = packCombatTable(state);
  assert.equal(reused.x[0], 99);
  assert.equal(reused.tick, 9);
  state.tick = 10;
  beginDirtyTick(state, 10);
  markDirty(state, 1, DIRTY.POSE);
  state.entityIndex.shipLike[0].pos.x = 12;
  const packed = packCombatTable(state);
  assert.equal(packed.x[0], 12);
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
  const firstIds = [...set].sort();
  const later = { ...state, tick: 7, nearWorkIds: undefined };
  stampNearWorkBudget(later);
  assert.notDeepEqual([...later.nearWorkIds].sort(), firstIds);
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
  const still = hash.queryRadiusCoherent('proj-1', 4, 4, 40, []);
  assert.equal(still.length, 2);
  assert.equal(hash.diagnostics.coherentQueryMisses, 1);
  const again = hash.queryRadiusCoherent('proj-1', 6, 4, 40, []);
  assert.equal(again.length, 2);
  assert.equal(hash.diagnostics.coherentQueryHits, 1);
  const wide = hash.queryRadiusCoherent('proj-1', 4, 4, 80, []);
  assert.equal(wide.length, 2);
  assert.equal(hash.diagnostics.coherentQueryMisses, 2);
  const nested = hash.queryRadiusCoherent('proj-1', 4, 4, 40, []);
  assert.equal(nested.length, 2);
  assert.equal(hash.diagnostics.coherentQueryHits, 2);
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
  assert.ok(wreck.encounterFingerprint);
  assert.equal(resolveFarEncounters(state, 10), 0);
});

test('Rapier island sleep is save-safe and skips player, projectiles, and taut lines', () => {
  assert.equal(mayRapierIslandSleep({ isPlayer: true }, { dynamic: true }), false);
  assert.equal(mayRapierIslandSleep({ type: 'projectile' }, { dynamic: true, material: 'projectile' }), false);
  assert.equal(mayRapierIslandSleep({ type: 'ship' }, { dynamic: true }), false);
  assert.equal(mayRapierIslandSleep({
    type: 'ship',
    activity: { simTier: SIM_TIER.S0_EXACT },
  }, { dynamic: true }), false);
  assert.equal(mayRapierIslandSleep({
    type: 'ship',
    activity: { simTier: SIM_TIER.S1_NEAR },
  }, { dynamic: true }), false);
  assert.equal(mayRapierIslandSleep({
    type: 'ship',
    activity: { simTier: SIM_TIER.S2_ABSTRACT },
  }, { dynamic: true }), true);
  assert.equal(mayRapierIslandSleep({
    type: 'ship',
    data: { jobId: 'job:1' },
    activity: { simTier: SIM_TIER.S2_ABSTRACT },
  }, { dynamic: true }), false);
  assert.equal(mayRapierIslandSleep({ type: 'ship' }, { dynamic: false }), false);
  assert.equal(shouldSkipSleepingKinematics({
    type: 'ship',
    activity: { simTier: SIM_TIER.S2_ABSTRACT },
  }, { dynamic: true }, { sleeping: true }), true);
  assert.equal(shouldSkipSleepingKinematics({
    type: 'ship',
    activity: { simTier: SIM_TIER.S2_ABSTRACT },
  }, { dynamic: true }, { sleeping: true, hadCommand: true }), false);
  assert.equal(shouldSkipSleepingKinematics({
    type: 'ship',
    activity: { simTier: SIM_TIER.S0_EXACT },
  }, { dynamic: true }, { sleeping: true }), false);
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
  assert.match(renderer, /installProgramBinaryCache/);
  assert.match(renderer, /pickNextContactCompileSubject/);
  assert.doesNotMatch(renderer, /requestDecodeRunwayPromote\(state, this\._simHelpers\)/);
});

test('NEAR owner slice resumes leftover work in stable id order', () => {
  const items = Array.from({ length: 40 }, (_, i) => ({ id: 200 - i }));
  const state = {};
  const first = takeNearWorkSlice(state, 'traffic', items);
  assert.equal(first.length, NEAR_WORK_TOKEN_BUDGET);
  const second = takeNearWorkSlice(state, 'traffic', items);
  assert.equal(second.length, NEAR_WORK_TOKEN_BUDGET);
  assert.notEqual(first[0].id, second[0].id);
  const ids = [...first, ...second].map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('dirty journal uses generation-skipped typed bitsets', () => {
  const state = {};
  beginDirtyTick(state, 1);
  markDirty(state, 12, DIRTY.POSE);
  assert.equal(state.dirtyJournal.entityBits instanceof Uint32Array, true);
  assert.equal(isDirty(state, 12, DIRTY.POSE), true);
  beginDirtyTick(state, 2);
  assert.equal(isDirty(state, 12, DIRTY.POSE), false);
});

test('program binary cache is a no-op without WEBGL_get_program_binary', () => {
  assert.deepEqual(installProgramBinaryCache(null), { ok: false, reason: 'no-gl' });
  assert.equal(installProgramBinaryCache({ linkProgram() {} }).ok, false);
});

test('next-contact warm picks a real pending inbound mesh', () => {
  const far = { userData: { pipelinesPending: true } };
  const nearInbound = { userData: { pipelinesPending: true } };
  const ready = { userData: { pipelinesPending: false } };
  const meshes = new Map([
    [2, far],
    [3, nearInbound],
    [4, ready],
  ]);
  const state = {
    playerId: 1,
    entities: new Map([[1, { id: 1, pos: { x: 0, z: 0 } }]]),
    entityIndex: {
      shipLike: [
        { id: 1, isPlayer: true, alive: true, pos: { x: 0, z: 0 } },
        { id: 2, alive: true, pos: { x: 400, z: 0 }, data: { intent: { kind: 'loiter' } } },
        { id: 3, alive: true, pos: { x: 80, z: 0 }, data: { intent: { kind: 'intercept' } } },
        { id: 4, alive: true, pos: { x: 10, z: 0 }, data: { intent: { kind: 'travel' } } },
      ],
    },
  };
  assert.equal(pickNextContactCompileSubject(state, meshes), nearInbound);
});

test('still NPCs do not need a flight command; live intent or residual motion does', () => {
  assert.equal(npcFlightNeedsCommand({
    alive: true,
    physicsSleeping: true,
    vel: { x: 0, z: 0 },
    data: { intent: { kind: 'loiter', brake: true } },
  }), false, 'sleeping hulls holding brake stay asleep');
  assert.equal(npcFlightNeedsCommand({
    alive: true,
    physicsSleeping: true,
    vel: { x: 0, z: 0 },
    data: { intent: { kind: 'intercept', moveZ: 1 } },
  }), true, 'sleeping hulls with a move intent still need a command');
  assert.equal(npcFlightNeedsCommand({
    alive: true,
    physicsSleeping: false,
    vel: { x: 0, z: 0 },
    angVel: 0,
    rot: 0,
    data: { intent: { kind: 'loiter', brake: true, aimAngle: 0 } },
  }), false, 'parked NPCs with no residual motion skip the flight command');
  assert.equal(npcFlightNeedsCommand({
    alive: true,
    physicsSleeping: false,
    vel: { x: 3, z: 0 },
    angVel: 0,
    data: { intent: { kind: 'loiter' } },
  }), true, 'coast with leftover velocity still needs a command');
  assert.equal(npcFlightNeedsCommand({
    alive: true,
    physicsSleeping: false,
    vel: { x: 0, z: 0 },
    angVel: 0,
    rot: 0,
    data: { intent: { kind: 'hold', aimAngle: 1.2 } },
  }), true, 'aiming a parked hull still needs a command');
});

test('hitch compile waits for leftover sim and sleeping islands skip extra WASM', () => {
  const runner = fs.readFileSync(path.join(ROOT, 'src/core/presentationRunner.js'), 'utf8');
  assert.match(runner, /if \(!presentFirst\) \{\s*drainAfterPresentCompile/);
  assert.match(runner, /drainAfterPresentCompile\(remainMs\)/);
  assert.match(runner, /drainArrivalSlices\(\)/);
  const owner = fs.readFileSync(path.join(ROOT, 'src/core/sg02DynamicBodyOwner.js'), 'utf8');
  assert.match(owner, /if \(!command && this\._sleepingRecordSkipsCpu\(rec, false\)\) continue/);
  assert.match(owner, /rec\._sleepAllowed !== allow/);
  const weapons = fs.readFileSync(path.join(ROOT, 'src/systems/weapons.js'), 'utf8');
  assert.match(weapons, /physicsSleeping === true && !firing/);
  const coreSrc = fs.readFileSync(path.join(ROOT, 'src/core/coreSystem.js'), 'utf8');
  assert.match(coreSrc, /e\.physicsSleeping === true/);
  const lanes = fs.readFileSync(path.join(ROOT, 'src/systems/travelLanes.js'), 'utf8');
  assert.match(lanes, /const list = indexedShipLikeScan\(state\);/);
});

test('sleeping still dynamics skip spatial-hash cell-span; noInterp still rehashes', () => {
  const hash = new SpatialHash(64);
  const parked = { id: 3, alive: true, collides: true, pos: { x: 4, z: 4 }, radius: 3, vel: { x: 0, z: 0 }, physicsSleeping: true };
  hash.rebuildLayers([], [parked], 1);
  parked.pos.x = 400;
  hash.rebuildLayers([], [parked], 1);
  assert.ok(hash.queryRadius(4, 4, 20, []).includes(parked),
    'a sleeping hull keeps its last hash cell');
  parked.flags = { noInterp: true };
  hash.rebuildLayers([], [parked], 1);
  assert.ok(hash.queryRadius(400, 4, 20, []).includes(parked),
    'a sleeping teleport with noInterp rehashes');
});

test('a teleport without velocity dirties pose so combat SoA repacks', () => {
  function position(x, z) {
    return {
      x,
      z,
      copy(value) {
        this.x = value.x;
        this.z = value.z;
        return this;
      },
    };
  }
  const ship = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: position(0, 0),
    prevPos: position(0, 0),
    vel: { x: 0, z: 0 },
    rot: 0,
    prevRot: 0,
    bank: 0,
    prevBank: 0,
    pitch: 0,
    prevPitch: 0,
    radius: 6,
  };
  const state = {
    tick: 0,
    simTime: 0,
    days: 0,
    meta: { playtimeS: 0 },
    playerId: 1,
    entityList: [ship],
  };
  core.preStep.call({ _lastDay: 0, bus: { emit() {} } }, 1 / 60, state);
  const first = packCombatTable(state);
  assert.equal(first.x[0], 0);
  ship.pos.x = 80;
  core.preStep.call({ _lastDay: 0, bus: { emit() {} } }, 1 / 60, state);
  const packed = packCombatTable(state);
  assert.equal(packed.x[0], 80);
});

test('a claim beacon lures only hostiles inside the lure radius', () => {
  const hash = new SpatialHash(64);
  const player = { id: 1, type: 'ship', alive: true, team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const near = {
    id: 2, type: 'ship', alive: true, team: 1, pos: { x: 40, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { intent: {} },
  };
  const far = {
    id: 3, type: 'ship', alive: true, team: 1, pos: { x: 8000, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { intent: {} },
  };
  hash.rebuildLayers([], [player, near, far], 1);
  const state = {
    playerId: 1,
    spatialHash: hash,
    entityIndex: { ships: [player, near, far] },
    entityList: [player, near, far],
    entities: new Map([[1, player]]),
  };
  const system = Object.create(beacons);
  system._lureScratch = [];
  system._lure(state, { x: 0, z: 0 }, player);
  assert.match(fs.readFileSync(path.join(ROOT, 'src/systems/beacons.js'), 'utf8'), /queryNearbyEntities/);
  assert.ok(near.data.intent.moveZ !== 0 || near.data.intent.moveX !== 0,
    'a nearby hostile is steered toward the beacon');
  assert.equal(far.data.intent.moveZ, undefined);
  assert.equal(far.data.intent.moveX, undefined);
});

test('map, station, and pause freeze 3D submit and skip full-tick systems', () => {
  for (const screen of ['galaxyMap', 'station', 'pause']) {
    const frozen = { ui: { docked: false, screenStack: [screen] } };
    assert.equal(shouldFreezeFlightSubmit(frozen), true, screen);
    assert.equal(shouldSkipFullTickSystems(frozen), true, screen);
  }
  assert.equal(shouldSkipFullTickSystems({ ui: { docked: true, screenStack: [] } }), true);
  assert.equal(shouldSkipFullTickSystems({ ui: { docked: false, screenStack: [] } }), false);
});

test('hidden screens keep input and save while the clock and physics stay still', () => {
  let physicsTicks = 0;
  let inputTicks = 0;
  const input = { name: 'input', update() { inputTicks += 1; } };
  const physics = { name: 'physics', update() { physicsTicks += 1; } };
  const sim = createSimulation({
    seed: 204,
    systems: [input, physics],
    updateOrder: [input, physics],
  });
  const tickBefore = sim.state.tick;
  sim.state.ui.screenStack = ['pause'];
  sim.step();
  assert.equal(inputTicks, 1);
  assert.equal(physicsTicks, 0);
  assert.equal(sim.state.tick, tickBefore, 'core.preStep must not advance the clock behind a menu');
  sim.state.ui.screenStack = [];
  sim.step();
  assert.equal(inputTicks, 2);
  assert.equal(physicsTicks, 1);
  assert.ok(sim.state.tick > tickBefore);
});

test('sector:enter listeners slice by count tokens when a budget is set', () => {
  const bus = createBus();
  const order = [];
  for (let i = 0; i < 5; i++) {
    const id = i;
    bus.on('sector:enter', () => { order.push(id); });
  }
  bus.setEmitSliceBudget('sector:enter', 2);
  bus.emit('sector:enter', { sectorId: 'sector_ceres_belt' });
  assert.deepEqual(order, [0, 1]);
  assert.equal(bus.pendingEmitSliceCount(), 3);
  assert.equal(bus.drainEmitSlice(2), 2);
  assert.deepEqual(order, [0, 1, 2, 3]);
  assert.equal(bus.drainEmitSlice(8), 1);
  assert.deepEqual(order, [0, 1, 2, 3, 4]);
  assert.equal(bus.pendingEmitSliceCount(), 0);
});

test('sector:enter stays synchronous when slice budget is off', () => {
  const bus = createBus();
  const order = [];
  bus.on('sector:enter', () => { order.push('a'); });
  bus.on('sector:enter', () => { order.push('b'); });
  bus.emit('sector:enter', {});
  assert.deepEqual(order, ['a', 'b']);
});

test('arrival slice materializes the current sector now and neighbors on later ticks', () => {
  const HELIOS = 'sector_helios_prime';
  const CERES = 'sector_ceres_belt';
  const TETHYS = 'sector_tethys_junction';
  const state = createGameState(204);
  state.mode = 'flight';
  state.meta.seed = 204;
  state.world.sliceArrival = true;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, radius: 4, mass: 12, hull: 100, hullMax: 100, collides: true,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const world = Object.create(worldSystem);
  world.init(ctx);
  world.enterSector(HELIOS);
  const rs = state.world.residentSectors || {};
  assert.equal(rs[HELIOS] && rs[HELIOS].tier, RESIDENCY_TIER.FULL);
  assert.equal(rs[CERES] && rs[CERES].tier, undefined);
  assert.equal(rs[TETHYS] && rs[TETHYS].tier, undefined);
  world.update(1 / 60, state);
  assert.equal(state.world.residentSectors[CERES].tier, RESIDENCY_TIER.REDUCED);
  assert.equal(state.world.residentSectors[TETHYS] && state.world.residentSectors[TETHYS].tier, undefined);
  world.update(1 / 60, state);
  assert.equal(state.world.residentSectors[TETHYS].tier, RESIDENCY_TIER.REDUCED);
});
