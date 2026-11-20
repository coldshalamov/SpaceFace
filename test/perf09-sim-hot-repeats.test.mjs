// PERF-09 — repeated per-tick costs pinned by contract.
//
// 1. Activity classification must not rerun its world rescan on projectile-only
//    membership churn: the entity index carries classifiableVersion (every
//    membership move except bare projectile append/remove) and the classifier's
//    discovery gates latch it.
// 2. resolveCollisionProxyManifest caches the resolved manifest on the entity,
//    keyed by every input the resolver reads.
// 3. Hot run-state readers validate once per (run object, tick) via
//    validateRunStateForTick; writer-side validation stays uncached.

import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { createRunState, validateRunState, validateRunStateForTick } from '../src/core/runState.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { liveSwarmRun } from '../src/systems/playerModifiers.js';
import {
  ensureActivityClassified,
  entityNeedsPhysics,
} from '../src/world/activityRuntime.js';

function bootCore(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  const system = Object.create(core);
  system.init({ state, bus, helpers, registry: { get: () => system } });
  return { state, bus, helpers, system };
}

function shipSpec(x = 0) {
  return {
    type: 'ship', team: 1, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 20, data: {},
  };
}

function shotSpec(x = 0) {
  return {
    type: 'projectile', pos: { x, z: 0 }, vel: { x: 40, z: 0 },
    radius: 1, data: {},
  };
}

test('entity index: projectile churn stays off classifiableVersion', () => {
  const { state, helpers } = bootCore();
  const index = state.entityIndex;
  assert.ok(index, 'core init builds the entity index');

  // The first spawn reconciles the index against the live list once; settle it
  // so the assertions below measure pure append deltas.
  helpers.spawnEntity(shipSpec(400));
  const v0 = index.version, c0 = index.classifiableVersion;
  helpers.spawnEntity(shotSpec(4));
  assert.equal(index.version, v0 + 1, 'a shot append bumps global membership');
  assert.equal(index.classifiableVersion, c0, 'a shot append does not bump classifiable membership');
  helpers.spawnEntity(shotSpec(8));
  assert.equal(index.version, v0 + 2);
  assert.equal(index.classifiableVersion, c0);

  helpers.spawnEntity(shipSpec(40));
  assert.equal(index.version, v0 + 3);
  assert.equal(index.classifiableVersion, c0 + 1, 'a ship append is classifier membership');
});

test('entity index: projectile removal stays off classifiableVersion', () => {
  const { state, helpers } = bootCore();
  const index = state.entityIndex;
  const shot = helpers.spawnEntity(shotSpec(4));
  const ship = helpers.spawnEntity(shipSpec(40));
  const v0 = index.version, c0 = index.classifiableVersion;

  assert.equal(helpers.removeEntity(shot.id, { immediate: true }), true);
  assert.equal(index.version, v0 + 1, 'a shot removal bumps global membership');
  assert.equal(index.classifiableVersion, c0, 'a shot removal does not bump classifiable membership');

  assert.equal(helpers.removeEntity(ship.id, { immediate: true }), true);
  assert.equal(index.version, v0 + 2);
  assert.equal(index.classifiableVersion, c0 + 1, 'a ship removal is classifier membership');
});

test('entity index: batch corpse removal counts only non-projectiles', () => {
  const { state, helpers } = bootCore();
  const index = state.entityIndex;
  const a = helpers.spawnEntity(shotSpec(4));
  const b = helpers.spawnEntity(shotSpec(8));
  const c = helpers.spawnEntity(shipSpec(40));
  const v0 = index.version, c0 = index.classifiableVersion;

  const indices = [a, b, c].map((e) => state.entityList.indexOf(e));
  assert.equal(helpers.removeEntitiesAtIndices(indices, { immediate: true }), 3);
  assert.equal(index.version, v0 + 3, 'each corpse bumps global membership');
  assert.equal(index.classifiableVersion, c0 + 1, 'only the ship corpse is classifier membership');
});

function classifyState(entities, extras = {}) {
  const list = entities.slice();
  const map = new Map();
  for (const entity of list) map.set(entity.id, entity);
  return {
    tick: 10,
    simTime: 10,
    playerId: 1,
    mode: 'flight',
    camera: { zoom: 144 },
    settings: { video: { fov: 50 } },
    entities: map,
    entityList: list,
    player: {},
    combat: {},
    runtime: { profileId: 'production' },
    ...extras,
  };
}

function testShip(id, x, extras = {}) {
  return {
    id,
    type: 'ship',
    alive: true,
    collides: true,
    radius: 8,
    pos: { x, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    angVel: 0,
    team: extras.team == null ? 1 : extras.team,
    isPlayer: extras.isPlayer === true,
    data: extras.data || {},
    flags: extras.flags || {},
  };
}

function testShot(id, x) {
  return {
    id,
    type: 'projectile',
    alive: true,
    collides: true,
    radius: 1,
    pos: { x, z: 0 },
    vel: { x: 40, z: 0 },
    data: {},
    flags: {},
  };
}

test('cross-tick projectile churn does not rerun the world rescan', () => {
  const player = testShip(1, 0, { isPlayer: true, team: 0 });
  const far = [];
  for (let i = 0; i < 32; i++) far.push(testShip(100 + i, 4000 + i * 10));
  const list = [player, ...far];
  const state = classifyState(list, {
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 4,
      classifiableVersion: 4,
      ready: true,
      shipLike: [player, ...far],
      projectiles: [],
    },
  });
  const first = ensureActivityClassified(state);
  assert.equal(first.classifyMode, 'full');
  const firstVisits = first.classifyVisits;

  // A shot spawned after this tick's classify: global membership moved, the
  // classifiable counter did not. Next tick must not rescan the fat list.
  const shot = testShot(9001, 2);
  state.entityList.push(shot);
  state.entities.set(shot.id, shot);
  state.entityIndex.projectiles.push(shot);
  state.entityIndex.version = 5;
  state.tick += 1;
  state.simTime += 1 / 60;

  const second = ensureActivityClassified(state);
  assert.equal(second.classifyMode, 'incremental');
  assert.ok(second.classifyVisits < list.length / 2,
    `expected neighborhood classify on projectile churn, got ${second.classifyVisits}`);
  // The round still reaches the visit through the projectiles lane.
  assert.equal(entityNeedsPhysics(shot), true);
  assert.ok(second.physicsDynamics.includes(shot));
  assert.ok(second.classifyVisits < firstVisits);
});

test('a classifiable membership move still triggers discovery', () => {
  const player = testShip(1, 0, { isPlayer: true, team: 0 });
  const far = [];
  for (let i = 0; i < 32; i++) far.push(testShip(100 + i, 4000 + i * 10));
  const list = [player, ...far];
  const state = classifyState(list, {
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 4,
      classifiableVersion: 4,
      ready: true,
      shipLike: [player, ...far],
      projectiles: [],
    },
  });
  const first = ensureActivityClassified(state);
  assert.equal(first.classifyMode, 'full');

  // A ship spawns after the classify: both counters move, discovery must run
  // and stamp the newcomer on the next tick.
  const lateShip = testShip(5000, 30);
  lateShip.data = { combat: { targetId: 1 }, ai: { combatant: true, passive: false } };
  state.entityList.push(lateShip);
  state.entities.set(lateShip.id, lateShip);
  state.entityIndex.shipLike.push(lateShip);
  state.entityIndex.version = 5;
  state.entityIndex.classifiableVersion = 5;
  state.tick += 1;
  state.simTime += 1 / 60;

  const second = ensureActivityClassified(state);
  assert.notEqual(lateShip.activity, null, 'classifiable membership move discovers the spawn');
  assert.ok(lateShip.activity, 'new ship is stamped after classifiable bump');
  assert.equal(second.classifiedClassifiableMembership, 5);
});

test('a pre-field index falls back to the full version', () => {
  const player = testShip(1, 0, { isPlayer: true, team: 0 });
  const far = [];
  for (let i = 0; i < 32; i++) far.push(testShip(100 + i, 4000 + i * 10));
  const list = [player, ...far];
  const state = classifyState(list, {
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      version: 4,
      // No classifiableVersion — the old shape.
      ready: true,
      shipLike: [player, ...far],
      projectiles: [],
    },
  });
  const first = ensureActivityClassified(state);
  assert.equal(first.classifyMode, 'full');

  // With no classifiable counter the version bump alone must keep the old
  // behavior: the rescan runs and can discover anything appended in place.
  const lateShip = testShip(5000, 30);
  state.entityList.push(lateShip);
  state.entities.set(lateShip.id, lateShip);
  state.entityIndex.shipLike.push(lateShip);
  state.entityIndex.version = 5;
  state.tick += 1;
  state.simTime += 1 / 60;

  const second = ensureActivityClassified(state);
  assert.ok(lateShip.activity, 'old-shape index still rescans on any membership bump');
  assert.equal(second.classifiedClassifiableMembership, 5,
    'classifiable stamp falls back to the global version');
});

test('proxy manifest resolution caches on the entity and tracks its inputs', () => {
  const entity = {
    id: 7,
    type: 'station',
    collides: true,
    radius: 60,
    mass: 1e6,
    pos: { x: 0, z: 0 },
    data: { placeId: 'test_place' },
    physicsBody: {
      dynamic: false,
      material: 'station',
      radius: 60,
      revision: 0,
      shape: 'disc',
    },
  };

  const m1 = resolveCollisionProxyManifest(entity);
  const m2 = resolveCollisionProxyManifest(entity);
  assert.equal(m2, m1, 'unchanged inputs return the cached manifest object');
  assert.ok(entity._collisionProxyResolve, 'the fingerprint slot lives on the entity');

  // A declared proxy id is one resolver input — changing it must re-resolve.
  entity.data.collisionProxy = 'gate_jump_ring';
  const m3 = resolveCollisionProxyManifest(entity);
  assert.notEqual(m3, m1, 'declared proxy id change invalidates the slot');
  assert.equal(m3 && m3.id, 'gate_jump_ring');

  // An authored manifest on the body wins over a different declared id — the
  // body object identity is part of the key. The authored candidate is a real
  // schema-valid manifest so authoredProxyManifest accepts it.
  entity.data.collisionProxy = 'helios_trade_hub';
  entity.physicsBody.collisionProxyManifest = m3;
  const m4 = resolveCollisionProxyManifest(entity);
  assert.equal(m4 && m4.id, 'gate_jump_ring', 'authored manifest outranks the declared id');
  assert.notEqual(m4, m3, 'the authored spread is a fresh object, not the registry row');

  // A body revision bump re-resolves even with identical content.
  entity.physicsBody.revision = 1;
  entity.physicsBody.collisionProxyManifest = null;
  entity.data.collisionProxy = 'gate_jump_ring';
  const m5 = resolveCollisionProxyManifest(entity);
  assert.notEqual(m5, m4, 'body revision invalidates');
  assert.equal(m5 && m5.id, 'gate_jump_ring');

  // A data-object swap (new identity, same content) re-resolves — in-place
  // readers must never see a manifest bound to a stale data object.
  entity.data = { placeId: 'test_place', collisionProxy: 'gate_jump_ring' };
  const m6 = resolveCollisionProxyManifest(entity);
  assert.equal(m6 && m6.id, 'gate_jump_ring');
  assert.notEqual(entity._collisionProxyResolve.fp, undefined);

  // A collides flip is a resolver input (the furniture gate): the slot must be
  // rebuilt even though this particular entity re-resolves to the same manifest.
  const slotBefore = entity._collisionProxyResolve;
  entity.collides = false;
  resolveCollisionProxyManifest(entity);
  assert.notEqual(entity._collisionProxyResolve, slotBefore,
    'collides flip re-resolves — the fingerprint is rebuilt');
});

test('frozen entities still resolve — the slot is best-effort', () => {
  const entity = Object.freeze({
    id: 9,
    type: 'ship',
    collides: true,
    radius: 8,
    mass: 20,
    data: Object.freeze({ collisionProxy: 'gate_jump_ring' }),
    physicsBody: Object.freeze({ dynamic: true, material: 'ship', radius: 8, revision: 0 }),
  });
  const m1 = resolveCollisionProxyManifest(entity);
  const m2 = resolveCollisionProxyManifest(entity);
  assert.equal(m1 && m1.id, 'gate_jump_ring');
  assert.equal(m2 && m2.id, 'gate_jump_ring', 'frozen entity resolves fresh every call');
});

test('run-state readers validate once per (run, tick)', () => {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 7 });
  run.phase = 'active';

  const a = validateRunStateForTick(run, 10);
  const b = validateRunStateForTick(run, 10);
  assert.equal(a, b, 'same tick returns the memoized verdict');
  assert.equal(a.ok, true);

  // Mutate to an invalid shape mid-tick: the cached verdict stands (readers
  // must not pay the walk again); the next tick re-validates and rejects.
  run.phase = 'bogus';
  assert.equal(validateRunStateForTick(run, 10).ok, true, 'same-tick memo holds');
  assert.equal(validateRunStateForTick(run, 11).ok, false, 'next tick revalidates the mutation');

  // A non-finite tick means no cheap change signal — always the full check.
  assert.equal(validateRunStateForTick(run, undefined).ok, false);
  run.phase = 'active';
  assert.equal(validateRunStateForTick(run, undefined).ok, true);

  // A replacement run object must not inherit its predecessor's verdict.
  const fresh = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 8 });
  fresh.phase = 'bogus';
  assert.equal(validateRunStateForTick(fresh, 10).ok, false,
    'a different object at the same tick validates on its own');
});

test('liveSwarmRun uses the tick-aware validator', () => {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 11 });
  run.phase = 'active';
  const state = { tick: 20, run };

  assert.equal(liveSwarmRun(state), run, 'a live swarm run validates and reads through');

  run.phase = 'bogus';
  assert.equal(liveSwarmRun(state), run,
    'same-tick readers see the memoized verdict, not a second deep walk');
  state.tick = 21;
  assert.equal(liveSwarmRun(state), null,
    'the next tick revalidates and the invalid run is refused');

  // The uncached validator still guards writer-side paths.
  assert.equal(validateRunState(run).ok, false);
});
