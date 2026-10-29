import test from 'node:test';
import assert from 'node:assert/strict';
import { createRunState } from '../src/core/runState.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { FIELD_KINDS } from '../src/data/fields.js';
import { normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { runSession } from '../src/systems/runSession.js';
import { fields as fieldOwner } from '../src/systems/fields.js';
import { swarmFortify } from '../src/systems/swarmFortify.js';
import { applyFragileCargoImpact } from '../src/systems/fragileCargo.js';
import { fieldBodyProfile } from '../src/systems/fields.js';
import { swarmFortifyCorridorForGate } from '../src/data/swarmFortify.js';
import { materializeWaveBatch, gateBearing } from '../src/systems/waveMaterialization.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { resetFreshRunSystems } from '../src/core/runReset.js';
import { physics } from '../src/core/physics.js';
import { Masks } from '../src/core/entity.js';
import { ActivityKind, setEntityDoctrine } from '../src/ai/doctrine.js';
import { aiPorts } from '../src/systems/aiPorts.js';
import { createTacticalAISystem } from '../src/systems/tacticalAI.js';
import { weapons } from '../src/systems/weapons.js';
import { combat, makeEnemySpawnSpec } from '../src/systems/combat.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { flightV3 } from '../src/systems/flightV3.js';
import {
  SWARM_FORTIFY_COMMAND,
  SWARM_FORTIFY_RELOAD_COMMAND,
  SWARM_FORTIFY_RECEIPT,
  SWARM_FORTIFY_REPAIR_COMMAND,
  SWARM_FORTIFY_STATE,
  SWARM_FORTIFY_STATE_REQUESTED,
} from '../src/data/swarmFortify.js';

function makeBus() {
  const listeners = new Map();
  return {
    on(event, fn) {
      const rows = listeners.get(event) || [];
      rows.push(fn);
      listeners.set(event, rows);
      return () => listeners.set(event, (listeners.get(event) || []).filter((row) => row !== fn));
    },
    emit(event, payload) {
      for (const fn of [...(listeners.get(event) || [])]) fn(payload);
    },
  };
}

function makeRun({ credits = 200, phase = 'draft', wave = 1 } = {}) {
  const run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: 27 });
  run.phase = phase;
  run.wave = wave;
  run.credits = credits;
  return run;
}

function initRunSession(state, bus) {
  runSession.init({ state, bus });
  return () => runSession.destroy();
}

test('run purchase commits only after a successful authoritative world commit', () => {
  const state = { run: makeRun() };
  const bus = makeBus();
  const destroy = initRunSession(state, bus);
  let worldCreates = 0;
  const spent = [];
  bus.on('run:spent', (receipt) => spent.push(receipt));
  try {
    const receipt = runSession.purchase({ requestId: 1, credits: 80, reason: 'swarm_fortify' }, () => {
      worldCreates++;
      return { ok: true, rollback() { throw new Error('accepted purchase must not rollback'); } };
    });
    assert.equal(receipt.accepted, true);
    assert.equal(worldCreates, 1);
    assert.equal(state.run.credits, 120);
    assert.equal(spent.length, 1);
    assert.equal(spent[0].requestId, 1);
  } finally {
    destroy();
  }
});

test('insufficient funds and refused or throwing world commits leave the run wallet unchanged', () => {
  const state = { run: makeRun({ credits: 70 }) };
  const bus = makeBus();
  const destroy = initRunSession(state, bus);
  let calls = 0;
  try {
    assert.equal(runSession.purchase({ requestId: 1, credits: 80 }, () => { calls++; return { ok: true }; }).reason, 'insufficient_funds');
    assert.equal(runSession.purchase({ requestId: 2, credits: 60 }, () => { calls++; return { ok: false, reason: 'spawn_failed' }; }).reason, 'spawn_failed');
    assert.equal(runSession.purchase({ requestId: 3, credits: 60 }, () => { calls++; throw new Error('native spawn fault'); }).reason, 'world_commit_failed');
    assert.equal(calls, 2);
    assert.equal(state.run.credits, 70);
  } finally {
    destroy();
  }
});

test('reentrant wallet changes abort and roll back the created structure', () => {
  const state = { run: makeRun() };
  const bus = makeBus();
  const destroy = initRunSession(state, bus);
  let rolledBack = false;
  try {
    const receipt = runSession.purchase({ requestId: 1, credits: 80 }, () => {
      runSession.award({ credits: 5, reason: 'reentrant_listener' });
      return { ok: true, rollback() { rolledBack = true; } };
    });
    assert.equal(receipt.accepted, false);
    assert.equal(receipt.reason, 'run_changed_during_purchase');
    assert.equal(rolledBack, true);
    assert.equal(state.run.credits, 205);
  } finally {
    destroy();
  }
});

test('purchase command ids are idempotent and a nested purchase cannot interleave', () => {
  const state = { run: makeRun() };
  const bus = makeBus();
  const destroy = initRunSession(state, bus);
  let creates = 0;
  try {
    const first = runSession.purchase({ requestId: 2, credits: 80 }, () => {
      const nested = runSession.purchase({ requestId: 3, credits: 80 }, () => {
        creates++;
        return { ok: true };
      });
      assert.equal(nested.reason, 'purchase_in_progress');
      creates++;
      return { ok: true };
    });
    const replay = runSession.purchase({ requestId: 2, credits: 80 }, () => {
      creates++;
      return { ok: true };
    });
    const stale = runSession.purchase({ requestId: 1, credits: 80 }, () => {
      creates++;
      return { ok: true };
    });
    assert.equal(first.accepted, true);
    assert.equal(replay, first);
    assert.equal(stale.reason, 'stale_request');
    assert.equal(creates, 1);
    assert.equal(state.run.credits, 120);
  } finally {
    destroy();
  }
});

test('Swarm build validates phase and geometry, places a collidable field-backed beacon, and retires it on run end', () => {
  const state = { run: makeRun(), playerId: 1, tick: 0, entities: new Map(), entityList: [] };
  const player = { id: 1, type: 'ship', alive: true, collides: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = makeBus();
  const destroyRunSession = initRunSession(state, bus);
  const removed = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: state.entities.size + 100, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
    removeEntity(id, options) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      entity.alive = false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      removed.push({ id, options });
      bus.emit('entity:destroyed', { id, entity });
      return true;
    },
  };
  swarmFortify.init({ state, bus, helpers });
  bus.emit('run:wavePlanned', { wave: 1 });
  const receipts = [];
  const readModels = [];
  bus.on(SWARM_FORTIFY_RECEIPT, (receipt) => receipts.push(receipt));
  bus.on(SWARM_FORTIFY_STATE, (readModel) => readModels.push(readModel));
  try {
    bus.emit(SWARM_FORTIFY_STATE_REQUESTED, { requestId: 'screen-open-1' });
    assert.equal(readModels.at(-1).requestId, 'screen-open-1');
    assert.equal(readModels.at(-1).sockets.length, 6);
    assert.equal(readModels.at(-1).sockets.find((socket) => socket.id === 'front-near').z, -280);
    player.pos.x = 500;
    bus.emit(SWARM_FORTIFY_STATE_REQUESTED, { requestId: 'screen-open-2' });
    assert.equal(readModels.at(-1).sockets.find((socket) => socket.id === 'front-near').z, -280);
    player.pos.x = 0;
    const runToken = readModels.at(-1).runToken;
    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).accepted, true);
    assert.equal(state.run.credits, 120);
    const structures = [...state.entities.values()].filter((entity) => entity.data?.swarmFortify);
    assert.equal(structures.length, 1);
    assert.equal(structures[0].type, 'beacon');
    assert.equal(structures[0].collides, true);
    assert.equal(structures[0].physicsBody.dynamic, false);
    assert.equal(structures[0].data.fieldAnchor.defKey, 'well');

    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 2, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).reason, 'socket_blocked');
    assert.equal(state.run.credits, 120);

    const rock = { id: 700, type: 'asteroid', alive: true, collides: true,
      pos: { x: -280, z: 50 }, radius: 4 };
    state.entities.set(rock.id, rock); state.entityList.push(rock);
    const preview = swarmFortify.getReadModel();
    const port = preview.sockets.find(socket => socket.id === 'port-near');
    assert.equal(port.devices.gravity_beacon.blocked, false, 'the center is clear for a single device');
    assert.equal(port.devices.tesla_pair.blocked, true, 'the paired endpoint footprint sees the actual rock');
    assert.ok(preview.terrain.some(body => body.id === rock.id), 'the field preview retains the physical obstacle');
    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 3, runToken, deviceId: 'tesla_pair', socketId: 'port-near' });
    assert.equal(receipts.at(-1).reason, 'socket_blocked', 'commit agrees with the device-specific preview');
    assert.equal(state.run.credits, 120);

    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).accepted, true);
    assert.equal([...state.entities.values()].filter((entity) => entity.data?.swarmFortify).length, 1);
    runSession.transition({ expectedPhase: 'draft', nextPhase: 'wave_intro' });
    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).accepted, true);
    assert.equal([...state.entities.values()].filter((entity) => entity.data?.swarmFortify).length, 1);

    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 4, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).reason, 'phase_closed');
    assert.equal(state.run.credits, 120);

    bus.emit('run:ended', { outcome: 'aborted' });
    assert.equal([...state.entities.values()].some((entity) => entity.data?.swarmFortify), false);
    assert.equal(removed.length, 1);
    assert.equal(removed[0].options.immediate, true);
  } finally {
    swarmFortify.destroy();
    destroyRunSession();
  }
});

test('a synchronous spawn listener that ends or changes the run rolls the body back without charging', () => {
  const state = { run: makeRun(), playerId: 1, tick: 0, entities: new Map(), entityList: [] };
  const player = { id: 1, type: 'ship', alive: true, collides: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8 };
  state.entities.set(1, player);
  state.entityList.push(player);
  const bus = makeBus();
  const destroyRunSession = initRunSession(state, bus);
  let removals = 0;
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: 99, alive: true };
      state.entities.set(99, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      removals++;
      return true;
    },
  };
  swarmFortify.init({ state, bus, helpers });
  bus.emit('run:wavePlanned', { wave: 1 });
  const runToken = swarmFortify.getReadModel().runToken;
  bus.on('entity:spawned', ({ entity }) => {
    if (entity.data?.swarmFortify) runSession.end({ outcome: 'aborted', reason: 'reentrant_end' });
  });
  const results = [];
  bus.on(SWARM_FORTIFY_RECEIPT, (receipt) => results.push(receipt));
  try {
    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(results.at(-1).accepted, false);
    assert.equal(results.at(-1).reason, 'run_changed_during_purchase');
    assert.equal(state.run.credits, 200);
    assert.equal(state.entities.has(99), false);
    assert.equal(removals, 1);
  } finally {
    swarmFortify.destroy();
    destroyRunSession();
  }
});

test('missing or partially throwing spawn helpers never debit or leave an orphan beacon', () => {
  const state = { run: makeRun(), playerId: 1, tick: 0, entities: new Map(), entityList: [] };
  const player = { id: 1, type: 'ship', alive: true, collides: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8 };
  state.entities.set(1, player);
  state.entityList.push(player);
  const bus = makeBus();
  const destroyRunSession = initRunSession(state, bus);
  const removed = [];
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: 77, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      throw new Error('post-insert spawn failure');
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      removed.push(id);
      return true;
    },
  };
  swarmFortify.init({ state, bus, helpers });
  bus.emit('run:wavePlanned', { wave: 1 });
  const runToken = swarmFortify.getReadModel().runToken;
  const receipts = [];
  bus.on(SWARM_FORTIFY_RECEIPT, (receipt) => receipts.push(receipt));
  try {
    bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).reason, 'spawn_failed');
    assert.equal(state.run.credits, 200);
    assert.equal([...state.entities.values()].some((entity) => entity.data?.swarmFortify), false);
    assert.deepEqual(removed, [77]);
  } finally {
    swarmFortify.destroy();
    destroyRunSession();
  }
});

test('anchored field owner unregisters a run structure field immediately at lifecycle teardown', () => {
  const previousEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const state = { entities: new Map(), entityList: [], tick: 0, simTime: 0, fields: null };
  const entity = {
    id: 42,
    type: 'beacon',
    alive: true,
    team: 1,
    pos: { x: 20, z: 30 },
    data: { fieldAnchor: { defKey: 'well', fieldId: 'fortify-field-test', radius: 190, strength: 110 } },
  };
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  const bus = makeBus();
  try {
    fieldOwner.init({ state, bus, helpers: {} });
    bus.emit('entity:spawned', { id: entity.id, entity });
    assert.equal(fieldOwner._kernel.has('fortify-field-test'), true);
    assert.equal(state.fields.anchored['fortify-field-test'].sourceId, entity.id);
    assert.equal(fieldOwner.unregisterAnchoredFields(state, entity.id, 'run_ended'), 1);
    assert.equal(fieldOwner._kernel.has('fortify-field-test'), false);
    assert.equal(state.fields.anchored['fortify-field-test'], undefined);
  } finally {
    for (const off of fieldOwner._lifecycleUnsubs || []) if (typeof off === 'function') off();
    fieldOwner._lifecycleUnsubs = [];
    fieldOwner._kernel?.clear?.();
    fieldOwner.state = null;
    fieldOwner.bus = null;
    FIELD_FLAGS.enabled = previousEnabled;
  }
});

test('Repulsor Pylon cadence protects its team-zero pilot and arms the field without writing entity velocity', () => {
  const previousEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const state = { run: makeRun(), playerId: 1, tick: 0, simTime: 0, entities: new Map(), entityList: [], fields: null };
  const player = { id: 1, type: 'ship', alive: true, collides: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = makeBus();
  const destroyRunSession = initRunSession(state, bus);
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: state.entities.size + 100, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { id: entity.id, entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      return true;
    },
  };
  try {
    fieldOwner.init({ state, bus, helpers: {} });
    swarmFortify.init({ state, bus, helpers });
    bus.emit('run:wavePlanned', { wave: 1 });
    const runToken = swarmFortify.getReadModel().runToken;
    const beforeVelocity = { ...player.vel };
    const receipt = swarmFortify.build({ requestId: 1, runToken, deviceId: 'repulsor_pylon', socketId: 'front-near' });
    assert.equal(receipt.accepted, true);
    assert.deepEqual(player.vel, beforeVelocity);
    const pylon = [...state.entities.values()].find((entity) => entity.data?.swarmFortify?.deviceId === 'repulsor_pylon');
    const fieldId = pylon.data.fieldAnchor.fieldId;
    fieldOwner._syncAnchoredFields(state, state.fields);
    assert.equal(fieldOwner._kernel.get(fieldId).strength, 0);

    state.run.phase = 'active';
    state.tick = 90;
    swarmFortify.update();
    fieldOwner._syncAnchoredFields(state, state.fields);
    assert.equal(fieldOwner._kernel.get(fieldId).strength, 180);
    const liveField = fieldOwner._kernel.get(fieldId);
    const nearby = { x: pylon.pos.x + 35, z: pylon.pos.z };
    assert.deepEqual(sampleFieldAcceleration(nearby, player.vel, [liveField], 0,
      fieldBodyProfile(player, state)), { ax: 0, az: 0 }, 'the ordinary team-zero pilot is excluded by identity');
    const ore = { id: 'unowned-ore', type: 'pickup', team: 0, pos: nearby,
      physicsBody: { dynamic: true, mass: 0.1 } };
    assert.ok(sampleFieldAcceleration(nearby, { x: 0, z: 0 }, [liveField], 0,
      fieldBodyProfile(ore, state)).ax > 0, 'neutral unowned matter still feels the repulsor');
    assert.equal(pylon.data.swarmFortify.offline, false);

    state.tick = 108;
    swarmFortify.update();
    fieldOwner._syncAnchoredFields(state, state.fields);
    assert.equal(fieldOwner._kernel.get(fieldId).strength, 0);
    assert.ok(pylon.data.swarmFortify.heat > 0);
    assert.deepEqual(player.vel, beforeVelocity);
  } finally {
    swarmFortify.destroy();
    destroyRunSession();
    for (const off of fieldOwner._lifecycleUnsubs || []) if (typeof off === 'function') off();
    fieldOwner._lifecycleUnsubs = [];
    fieldOwner._kernel?.clear?.();
    fieldOwner.state = null;
    fieldOwner.bus = null;
    FIELD_FLAGS.enabled = previousEnabled;
  }
});

test('field ownership protects real fragile cargo spills and allies while still pulling unowned ore', () => {
  const player = {
    id: 'pilot-7', type: 'ship', team: 1, alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    physicsBody: { dynamic: true, mass: 50 },
  };
  const state = {
    playerId: player.id,
    player: { cargo: { items: { cmdty_art: 20 } } },
    simTime: 2, tick: 120,
    entities: new Map([[player.id, player]]),
  };
  let spillSpec = null;
  const loss = applyFragileCargoImpact(state, {
    playerInvolved: true, playerDeltaV: 36, simTime: 2, tick: 120,
  }, {
    cooldown: false,
    helpers: { spawnEntity(spec) { spillSpec = spec; return { ...spec, id: 'fragile-spill-1' }; } },
  });
  assert.ok(loss?.spillPods > 0);
  assert.equal(spillSpec.ownerId, player.id);
  assert.equal(spillSpec.data.ownerId, player.id);

  const field = normalizeField({
    id: 'fortify-owned-well', kind: FIELD_KINDS.WELL,
    center: { x: 0, z: 0 }, radius: 190, strength: 110, falloff: 1.6,
    filters: { excludeOwnerIds: [player.id], excludeTeams: [player.team] },
  });
  const spill = { ...spillSpec, id: 'fragile-spill-1', team: 0, physicsBody: { dynamic: true, mass: 0.1 } };
  const ore = { id: 'unowned-ore', type: 'pickup', team: 0, pos: { x: 35, z: 0 }, mass: 0.1, data: { kind: 'ore' }, physicsBody: { dynamic: true, mass: 0.1 } };
  const ally = { id: 'allied-drone', type: 'drone', team: 1, pos: { x: 35, z: 0 }, mass: 5, physicsBody: { dynamic: true, mass: 5 } };
  const hostile = { id: 'hostile-drone', type: 'drone', team: 2, pos: { x: 35, z: 0 }, mass: 5, physicsBody: { dynamic: true, mass: 5 } };
  const acceleration = (entity) => sampleFieldAcceleration(
    entity.pos || spill.pos, entity.vel || { x: 0, z: 0 }, [field], 0,
    fieldBodyProfile(entity, state),
  );
  assert.deepEqual(acceleration(spill), { ax: 0, az: 0 });
  assert.deepEqual(acceleration(ally), { ax: 0, az: 0 });
  assert.ok(acceleration(ore).ax < 0, 'unowned ore remains pulled toward the beacon');
  assert.ok(acceleration(hostile).ax < 0, 'hostile craft remain affected by the beacon');
});

test('repair commands use the combat hull owner, charge once, and return the updated structure read model', () => {
  const state = { run: makeRun(), playerId: 1, tick: 0, simTime: 0, entities: new Map(), entityList: [] };
  const player = { id: 1, type: 'ship', alive: true, collides: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 8, team: 1 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = makeBus();
  const destroyRunSession = initRunSession(state, bus);
  const repairReceipts = [];
  bus.on('swarm:fortifyBuildResolved', (receipt) => repairReceipts.push(receipt));
  let entity = null;
  const paidHullSnapshots = [];
  bus.on('run:spent', () => paidHullSnapshots.push(entity?.hull));
  bus.on('combat:hullRepair', () => bus.emit('run:awardRequested', { credits: 5, reason: 'repair_listener_reentry' }));
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: state.entities.size + 100, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      return true;
    },
    prepareRepairCombatHulls(rows, source) {
      const targets = rows.map((row) => ({ entity: state.entities.get(row.entityId), ...row }));
      if (targets.some((row) => !row.entity || row.entity.alive === false)) return { ok: false, reason: 'target_unavailable' };
      const repairs = targets.map((row) => {
        const after = Math.min(row.entity.hullMax, row.entity.hull + row.amount);
        return { entityId: row.entityId, before: row.entity.hull, after, applied: Math.max(0, after - row.entity.hull) };
      });
      let status = 'prepared';
      return {
        ok: true,
        repairs,
        commit() {
          for (let i = 0; i < targets.length; i++) targets[i].entity.hull = repairs[i].after;
          status = 'committed';
          return { ok: true };
        },
        rollback() {
          if (status !== 'committed') return false;
          for (let i = 0; i < targets.length; i++) targets[i].entity.hull = repairs[i].before;
          status = 'rolled_back';
          return true;
        },
        finalize() {
          if (status !== 'committed') return false;
          status = 'finalized';
          bus.emit('combat:hullRepair', { source, repairs });
          return true;
        },
      };
    },
  };
  try {
    swarmFortify.init({ state, bus, helpers });
    bus.emit('run:wavePlanned', { wave: 1 });
    const runToken = swarmFortify.getReadModel().runToken;
    const built = swarmFortify.build({ requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(built.accepted, true);
    entity = state.entities.get(built.structureId);
    paidHullSnapshots.length = 0;
    entity.hull = 50;
    const beforeCredits = state.run.credits;
    const receipt = swarmFortify.repair({ requestId: 2, runToken, entityId: built.structureId });
    assert.equal(receipt.accepted, true);
    assert.equal(receipt.repaired, true);
    assert.equal(entity.hull, entity.hullMax);
    assert.equal(state.run.credits, beforeCredits - 24 + 5);
    assert.deepEqual(paidHullSnapshots, [entity.hullMax], 'the wallet debit is observable only after the silent canonical repair commit');
    assert.equal(receipt.readModel.structures[0].hull, entity.hullMax);
    assert.equal(swarmFortify.repair({ requestId: 2, runToken, entityId: built.structureId }).accepted, true);
    assert.equal(state.run.credits, beforeCredits - 24 + 5);
    bus.emit(SWARM_FORTIFY_REPAIR_COMMAND, { requestId: 3, runToken, entityId: built.structureId });
    assert.equal(repairReceipts.at(-1).accepted, false);
    assert.equal(repairReceipts.at(-1).reason, 'repair_refused');
    assert.equal(state.run.credits, beforeCredits - 24 + 5);
  } finally {
    swarmFortify.destroy();
    destroyRunSession();
  }
});

test('siege orders follow the authored wave gate and choose the weakest reachable defense', () => {
  assert.equal(swarmFortifyCorridorForGate('ne', 2), 'front');
  assert.equal(swarmFortifyCorridorForGate('sw', 2), 'diagonal_a');
  assert.equal(swarmFortifyCorridorForGate('rear', 2), 'diagonal_a');
  const state = { run: makeRun(), playerId: 1, tick: 0, simTime: 0, entities: new Map(), entityList: [] };
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, radius: 8, team: 0 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  const bus = makeBus();
  const destroyRunSession = initRunSession(state, bus);
  const helpers = {
    spawnEntity(spec) {
      const entity = { ...spec, id: state.entities.size + 100, alive: true };
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      bus.emit('entity:spawned', { entity });
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (!entity) return false;
      state.entities.delete(id);
      state.entityList.splice(state.entityList.indexOf(entity), 1);
      return true;
    },
  };
  try {
    swarmFortify.init({ state, bus, helpers });
    bus.emit('run:wavePlanned', { wave: 1 });
    const runToken = swarmFortify.getReadModel().runToken;
    const first = swarmFortify.build({ requestId: 1, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    const second = swarmFortify.build({ requestId: 2, runToken, deviceId: 'gravity_beacon', socketId: 'front-far' });
    assert.equal(first.accepted && second.accepted, true);
    state.run.phase = 'active';
    state.entities.get(first.structureId).hull = 40;
    state.entities.get(second.structureId).hull = 20;
    const hostile = {
      id: 404, type: 'ship', alive: true, pos: { x: 0, z: -650 }, radius: 10, team: 1,
      data: { runWave: 1, swarmGateGroup: 'ne', ai: { forcePlayerTarget: true,
        activity: { kind: 'attack_run', reason: 'survival_pursuit', targetId: player.id } } },
    };
    state.entities.set(hostile.id, hostile);
    state.entityList.push(hostile);
    bus.emit('entity:spawned', { entity: hostile });
    assert.equal(hostile.data.ai.activity.reason, 'swarm_fortify:siege');
    assert.equal(hostile.data.ai.activity.targetId, second.structureId);
    assert.deepEqual(hostile.data.ai.activity.anchor, state.entities.get(second.structureId).pos);

    const ordinary = { id: 405, type: 'ship', alive: true, pos: { x: 0, z: -650 }, team: 1,
      data: { runWave: 1, ai: { activity: { kind: 'attack_run', reason: 'survival_pursuit', targetId: player.id } } } };
    bus.emit('entity:spawned', { entity: ordinary });
    assert.equal(ordinary.data.ai.activity.targetId, player.id);
    assert.equal(ordinary.data.ai.activity.reason, 'survival_pursuit');
  } finally {
    swarmFortify.destroy();
    destroyRunSession();
  }
});

test('tacticalAI fires at an ordered Fortify beacon and hostile projectiles damage its real hull', async () => {
  const tactical = createTacticalAISystem({ config: { enemyMind: { enabled: false } } });
  const sim = createSimulation({ seed: 7271, systems: [aiPorts, tactical, flightV3, weapons, combat, physics] });
  try {
    sim.state.mode = 'flight';
    sim.state.run = makeRun({ phase: 'active' });
    sim.state.world.currentSectorId = 'sector_helios_gate';
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12,
      factionId: 'faction_free', data: { defId: 'ship_kestrel', ai: {} },
    });
    sim.state.playerId = player.id;
    const target = sim.spawn({
      type: 'beacon', team: 0, ownerId: player.id, factionId: 'faction_player', pos: { x: 0, z: -240 }, radius: 14,
      hull: 120, hullMax: 120, collides: true,
      collisionMask: Masks.SHIP | Masks.ASTEROID | Masks.STATION | Masks.PROJECTILE,
      physicsBody: { schemaVersion: 1, radius: 14, mass: 650, dynamic: false, revision: 0 },
      data: { swarmFortify: { schemaVersion: 1, deviceId: 'gravity_beacon', runToken: 1,
        ordinal: 1, socketId: 'front-near', operational: true } },
    });
    const attacker = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 4, { x: 40, z: -350 }, { startedTick: 0 }));
    attacker.data.runWave = 2;
    attacker.data.swarmGateGroup = 'front';
    attacker.data.runCohort = 'survival';
    attacker.data.ai.forcePlayerTarget = true;
    attacker.data.ai.huntPlayer = true;
    attacker.rot = Math.atan2(target.pos.z - attacker.pos.z, target.pos.x - attacker.pos.x);
    setEntityDoctrine(attacker, {
      activity: { kind: ActivityKind.ATTACK_RUN, reason: 'swarm_fortify:siege', targetId: target.id,
        anchor: { ...target.pos }, preferredRange: 70 },
    });
    attacker.data.combat.targetId = null;
    const combatOwner = sim.registry.get('combat');
    const friendlyHit = combatOwner.onHit({ targetId: target.id, ownerId: player.id,
      damage: 5, damageType: 'kinetic', pos: target.pos });
    assert.equal(friendlyHit.reason, 'friendly_fire');
    assert.equal(target.hull, target.hullMax, 'the Fortify opt-in must retain ordinary friendly-fire refusal');
    const ordinaryBeacon = sim.spawn({ type: 'beacon', team: 0, pos: { x: 90, z: -240 }, radius: 10,
      hull: 50, hullMax: 50, collides: true,
      physicsBody: { schemaVersion: 1, radius: 10, mass: 100, dynamic: false, revision: 0 }, data: {} });
    const ordinaryHit = combatOwner.onHit({ targetId: ordinaryBeacon.id, ownerId: attacker.id,
      damage: 5, damageType: 'kinetic', pos: ordinaryBeacon.pos });
    assert.equal(ordinaryHit.reason, 'target_not_damageable', 'ordinary beacons must not gain the Fortify damage exception');
    const fires = [];
    const hits = [];
    sim.bus.on('combat:fire', (event) => { if (event.ownerId === attacker.id) fires.push(event); });
    sim.bus.on('combat:damage', (event) => { if (event.targetId === target.id) hits.push(event); });
    const projectileHits = [];
    sim.bus.on('projectile:hit', (event) => { if (event.ownerId === attacker.id) projectileHits.push(event); });
    const projectiles = [];
    sim.bus.on('entity:spawned', (event) => { if (event.entity?.type === 'projectile' && event.entity.ownerId === attacker.id) projectiles.push(event.entity); });

    assert.equal(await sim.registry.get('physics').prepareBackend(sim.state, { initTimeoutMs: 5000 }), true,
      'the default Rapier authority should be ready before the fixed-step siege scenario');
    for (let tick = 0; tick < 240 && target.hull > 0; tick++) sim.step();
    assert.ok(fires.length > 0, `real tactical AI/weapon path should launch a shot; combat=${JSON.stringify(attacker.data.combat)}`);
    assert.ok(hits.length > 0, `the hostile projectile should resolve against the physical beacon; fires=${JSON.stringify(fires.map((event) => ({ tick: event.tick, weaponId: event.weaponId })))} projectiles=${JSON.stringify(projectiles.map((projectile) => ({ pos: projectile.pos, vel: projectile.vel, targetId: projectile.data?.targetId })))} projectileHits=${JSON.stringify(projectileHits.map((event) => ({ targetId: event.targetId, projectileId: event.projectileId })))} hull=${target.hull}`);
    assert.ok(target.hull < target.hullMax, 'canonical combat damage must reduce beacon hull');
    assert.equal(target.alive, false, 'continued siege fire must retire the Fortify body through combat death');
  } finally {
    sim.dispose();
  }
});

test('forked simulation runtimes charge only their own runSession wallet over the public command bus', () => {
  const makeRuntime = (credits) => {
    const state = createGameState(911);
    state.run = makeRun({ credits });
    const sim = createSimulation({ seed: 911, state, systems: [runSession, fieldOwner, swarmFortify] });
    const player = sim.spawn({ type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 8 });
    sim.state.playerId = player.id;
    sim.bus.emit('run:wavePlanned', { wave: 1 });
    return sim;
  };
  const first = makeRuntime(100);
  const second = makeRuntime(35);
  try {
    const firstFortify = first.registry.get('swarmFortify');
    const secondFortify = second.registry.get('swarmFortify');
    const firstToken = firstFortify.getReadModel().runToken;
    const secondToken = secondFortify.getReadModel().runToken;
    const firstReceipts = [];
    const secondReceipts = [];
    first.bus.on('swarm:fortifyBuildResolved', (receipt) => firstReceipts.push(receipt));
    second.bus.on('swarm:fortifyBuildResolved', (receipt) => secondReceipts.push(receipt));
    first.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken: firstToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    second.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken: secondToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(firstReceipts.at(-1).accepted, true, JSON.stringify(firstReceipts.at(-1)));
    assert.equal(secondReceipts.at(-1).reason, 'insufficient_funds');
    assert.equal(first.state.run.credits, 20);
    assert.equal(second.state.run.credits, 35);
    assert.equal([...second.state.entities.values()].some((entity) => entity.data?.swarmFortify), false);
  } finally {
    first.dispose();
    second.dispose();
  }
});

test('an empty full-hull turret reload is paid once and fires again in the next wave', () => {
  const state = createGameState(1818);
  state.run = makeRun({ credits: 500 });
  const sim = createSimulation({ seed: 1818, state, systems: [runSession, fieldOwner, swarmFortify, weapons, combat, physics] });
  try {
    sim.state.mode = 'flight';
    const player = sim.spawn({ type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 8,
      factionId: 'faction_player', data: { defId: 'ship_kestrel' } });
    sim.state.playerId = player.id;
    sim.bus.emit('run:wavePlanned', { wave: 1 });
    const owner = sim.registry.get('swarmFortify');
    const runToken = owner.getReadModel().runToken;
    const receipts = [];
    sim.bus.on(SWARM_FORTIFY_RECEIPT, (receipt) => receipts.push(receipt));
    sim.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 1, runToken, deviceId: 'kinetic_turret', socketId: 'front-near' });
    assert.equal(receipts.at(-1).accepted, true);
    const turret = sim.state.entities.get(receipts.at(-1).structureId);
    assert.ok(turret);
    assert.equal(turret.hull, turret.hullMax);

    // Represent the finite magazine consumed in the completed wave while keeping the hull intact.
    turret.data.swarmFortify.ammo = 0;
    sim.state.run.phase = 'refit';
    const beforeService = owner.getReadModel().structures.find((row) => row.deviceId === 'kinetic_turret');
    assert.equal(beforeService.ammo, 0);
    assert.equal(beforeService.ammoMax, 32);
    assert.equal(beforeService.repairCost, 42);
    assert.equal(beforeService.serviceCost, 64);
    sim.bus.emit(SWARM_FORTIFY_RELOAD_COMMAND, { requestId: 2, runToken, entityId: turret.id });
    assert.equal(receipts.at(-1).serviced, true, JSON.stringify(receipts.at(-1)));
    assert.equal(receipts.at(-1).credits, 64);
    assert.equal(turret.data.swarmFortify.ammo, 32);
    assert.equal(turret.hull, turret.hullMax, 'ammo service does not repair or damage hull');
    const creditsAfterService = sim.state.run.credits;

    sim.bus.emit(SWARM_FORTIFY_RELOAD_COMMAND, { requestId: 2, runToken, entityId: turret.id });
    assert.equal(receipts.at(-1).serviced, true, 'a retry returns its prior accepted receipt');
    assert.equal(sim.state.run.credits, creditsAfterService, 'the same command cannot charge twice');
    sim.bus.emit(SWARM_FORTIFY_RELOAD_COMMAND, { requestId: 3, runToken, entityId: turret.id });
    assert.equal(receipts.at(-1).reason, 'already_full');
    assert.equal(receipts.at(-1).credits, undefined);
    assert.equal(sim.state.run.credits, creditsAfterService, 'a full magazine cannot charge the wallet');

    sim.state.run.phase = 'active';
    sim.state.run.wave = 2;
    const enemy = sim.spawn(makeEnemySpawnSpec('reaver_pirate', 17, { x: turret.pos.x + 80, z: turret.pos.z }, { startedTick: 0 }));
    enemy.team = 1;
    enemy.data.ai.forcePlayerTarget = true;
    enemy.data.runWave = 2;
    enemy.data.runCohort = 'survival';
    assert.equal(isHostileToPlayer(enemy, player.team, sim.state), true);
    assert.ok(sim.state.entityList.includes(enemy));
    const fire = [];
    sim.bus.on('combat:fire', (event) => { if (event.ownerId === turret.id) fire.push(event); });
    for (let tick = 0; tick < 3; tick++) sim.step();
    assert.ok(fire.length > 0, 'the reloaded turret must fire through the canonical weapons owner in wave two');
    assert.equal(turret.data.swarmFortify.ammo, 31, 'the real shot consumes one finite round');
  } finally {
    sim.dispose();
  }
});

test('four physical Fortify devices coexist and consecutive waves use the latched three-corridor arena', async () => {
  const previousFieldsEnabled = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const state = createGameState(1919);
  state.run = makeRun({ credits: 1000 });
  const sim = createSimulation({ seed: 1919, state,
    systems: [runSession, fieldOwner, spawnBudget, swarmFortify, weapons, combat, physics] });
  try {
    sim.state.mode = 'flight';
    assert.equal(await sim.registry.get('physics').prepareBackend(sim.state, { initTimeoutMs: 5000 }), true,
      'the default Rapier authority is ready for physical purchases and wave arrivals');
    const player = sim.spawn({ type: 'ship', team: 0, alive: true, pos: { x: 0, z: 0 }, radius: 8,
      factionId: 'faction_player', data: { defId: 'ship_kestrel' } });
    sim.state.playerId = player.id;
    sim.bus.emit('run:wavePlanned', { wave: 1 });
    const fortify = sim.registry.get('swarmFortify');
    const runToken = fortify.getReadModel().runToken;
    // A real first-wave pilot can kite well outside the original spawn field before the
    // paused build screen opens. Its query and purchase must refer to the same local field.
    player.pos.x = 2400;
    player.pos.z = -1800;
    player.rot = 0.73;
    sim.bus.emit(SWARM_FORTIFY_STATE_REQUESTED, { requestId: 1 });
    assert.deepEqual(fortify.getArenaAnchor(), { x: 2400, z: -1800, rotation: player.rot || 0 });
    assert.equal(fortify.getReadModel().fortified, false, 'the authored Swarm policy is untouched until construction');
    const receipts = [];
    sim.bus.on(SWARM_FORTIFY_RECEIPT, (receipt) => receipts.push(receipt));
    const purchases = [
      ['gravity_beacon', 'front-near'],
      ['repulsor_pylon', 'port-near'],
      ['tesla_pair', 'starboard-near'],
      ['kinetic_turret', 'front-far'],
    ];
    purchases.forEach(([deviceId, socketId], index) => {
      sim.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: index + 1, runToken, deviceId, socketId });
      assert.equal(receipts.at(-1).accepted, true, `${deviceId}: ${JSON.stringify(receipts.at(-1))}`);
      assert.equal(receipts.at(-1).modeActivated, index === 0, 'only first accepted construction activates ingress');
    });
    const model = fortify.getReadModel();
    assert.equal(model.fortified, true);
    assert.equal(model.structures.length, 4);
    assert.deepEqual(new Set(model.structures.map((row) => row.deviceId)),
      new Set(['gravity_beacon', 'repulsor_pylon', 'tesla_pair', 'kinetic_turret']));
    assert.equal([...sim.state.entities.values()].filter((entity) => entity.data?.swarmFortify).length, 5,
      'the four devices include both physical Tesla endpoints');
    for (const structure of sim.state.entities.values()) {
      if (!structure.data?.swarmFortify) continue;
      assert.equal(structure.type, 'beacon');
      assert.equal(structure.collides, true);
      assert.ok(structure.physicsBody, 'every device endpoint has a canonical physical body');
    }
    const creditsAfterBuild = sim.state.run.credits;
    sim.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 5, runToken, deviceId: 'gravity_beacon', socketId: 'front-near' });
    assert.equal(receipts.at(-1).accepted, false);
    assert.equal(receipts.at(-1).reason, 'socket_blocked');
    assert.equal(sim.state.run.credits, creditsAfterBuild, 'blocked placement cannot debit the authoritative wallet');

    const anchor = fortify.getArenaAnchor();
    player.pos.x = 5400;
    player.pos.z = 2200;
    sim.bus.emit(SWARM_FORTIFY_STATE_REQUESTED, { requestId: 2 });
    assert.deepEqual(fortify.getArenaAnchor(), anchor, 'the existing base never follows a later build query');
    sim.bus.emit(SWARM_FORTIFY_COMMAND, { requestId: 6, runToken, deviceId: 'gravity_beacon', socketId: 'port-far' });
    assert.equal(receipts.at(-1).accepted, true, 'a paused pilot can maintain the fixed field from outside the initial build radius');
    const arrivals = [];
    for (const [wave, sourceGate] of [[1, 'ne'], [2, 'rear']]) {
      sim.state.run.phase = 'active';
      sim.state.run.wave = wave;
      const receipt = materializeWaveBatch(sim.registry.ctx, {
        ownerId: `survival-wave:fortify-test:w${wave}`,
        enemyId: 'detonator_dart', count: 1, gateGroup: sourceGate,
        distance: 600, wave, packageIndex: 0, batchIndex: 0, seed: 1919, swarm: true,
      });
      assert.equal(receipt.admitted, 1, `wave ${wave} arrived through the real spawn budget`);
      const enemy = sim.state.entities.get(receipt.spawnedIds[0]);
      arrivals.push({ enemy, receipt });
      const expectedGroup = swarmFortifyCorridorForGate(sourceGate, wave);
      assert.equal(enemy.data.swarmGateGroup, expectedGroup);
      assert.equal(enemy.data.swarmSourceGateGroup, sourceGate);
      assert.equal(receipt.gateGroup, expectedGroup);
      assert.equal(receipt.sourceGateGroup, sourceGate);
      assert.equal(receipt.ingressPose.origin.x, anchor.x);
      assert.equal(receipt.ingressPose.origin.z, anchor.z);
      const distance = Math.hypot(enemy.pos.x - anchor.x, enemy.pos.z - anchor.z);
      assert.ok(distance > 490 && distance < 710, `wave ${wave} uses the fixed Fortify arena origin`);
      const bearing = gateBearing(expectedGroup);
      const expectedAngle = Math.atan2(bearing.z, bearing.x) + anchor.rotation;
      const actualAngle = Math.atan2(enemy.pos.z - anchor.z, enemy.pos.x - anchor.x);
      assert.ok(Math.abs(Math.atan2(Math.sin(actualAngle - expectedAngle), Math.cos(actualAngle - expectedAngle))) < Math.PI / 8,
        `wave ${wave} approaches the same rotated corridor shown by the build sockets`);
    }
    assert.equal(arrivals.length, 2);
    assert.equal(fortify.getArenaAnchor().x, anchor.x);
    assert.equal(fortify.getArenaAnchor().z, anchor.z);
    assert.equal(fortify.getReadModel().structures.length, 5, 'all built devices persist across both waves');
    resetFreshRunSystems(sim.registry);
    assert.equal([...sim.state.entities.values()].some(entity => entity.data?.swarmFortify), false,
      'the real fresh-run reset retires the previous run devices without relying on a main-only event');
    assert.equal(fortify.getReadModel().structures.length, 0);
  } finally {
    sim.dispose();
    FIELD_FLAGS.enabled = previousFieldsEnabled;
  }
});
