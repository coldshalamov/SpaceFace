// Focused save/restore receipt for the two AI-packet state slices:
//   state.nemesis + state.nemesisDeployment (Counterexample packet, owner-serialized)
//   state.enemyMind (Enemy Mind packet, plain version-1 cognition namespace)
// Contract under test (integration notes): serialize with version 1; restore BEFORE the
// save:loaded emission so the owners reconcile against restored state; new-game clears; an
// unknown future version throws instead of erasing the previous state.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { nemesis } from '../src/systems/nemesis.js';
import { nemesisEncounter } from '../src/systems/nemesisEncounter.js';
import { createEnemyMindState } from '../src/ai/enemyMind/runtime.js';

function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(other) { this.x = other.x || 0; this.y = other.y || 0; this.z = other.z || 0; return this; },
  };
}

function makeHarness() {
  const state = createGameState(73);
  state.mode = 'flight';
  state.save.currentSlot = 'slot-a';
  state.simTime = 400;
  state.tick = 24_000;
  state.world.currentSectorId = 'sector_helios_prime';

  const player = {
    id: 1,
    type: 'ship',
    alive: true,
    pos: vec(120, -35),
    vel: vec(8, -2),
    rot: 0.35,
    prevRot: 0.35,
    hull: 88,
    hullMax: 100,
    shield: 42,
    shieldMax: 50,
    cap: 12,
    capMax: 20,
    radius: 6,
    team: 0,
    factionId: 'faction_free',
    flags: {},
    data: { defId: 'ship_kestrel', weapons: [{ id: 'wpn_pulse_laser_s' }], fittings: [] },
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const bus = createBus();
  const systems = { nemesis, nemesisEncounter };
  for (const system of Object.values(systems)) system.init({ state, bus, helpers: {} });

  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = bus;
  save.registry = { get: (name) => systems[name] || null };
  save.helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const spawned = {
        ...spec, id, alive: spec.alive !== false,
        pos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: vec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        prevPos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevRot: Number.isFinite(spec.rot) ? spec.rot : 0,
        flags: { ...(spec.flags || {}) }, data: spec.data || {},
      };
      state.entities.set(id, spawned);
      state.entityList.push(spawned);
      return spawned;
    },
    getEntity: (id) => state.entities.get(id),
    player: () => state.entities.get(state.playerId),
  };
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;

  return { save, state, bus };
}

function seedLiveSlices(state) {
  // A mid-encounter memory: pending request invalidated on load, active encounter survives only
  // if its live tagged hulls do (the owners reconcile that on save:loaded — not re-tested here).
  state.nemesis.completed = 2;
  state.nemesis.progress = 1;
  state.nemesis.grudge = 3;
  state.nemesis.phase = 'waiting';
  state.nemesisDeployment.nextCheckAt = 12.5;
  state.enemyMind = createEnemyMindState();
  state.enemyMind.eventSequence = 7;
}

test('serializeData carries the nemesis, deployment and enemy-mind slices with version 1', () => {
  const { save, state } = makeHarness();
  seedLiveSlices(state);
  const data = save.serializeData();

  assert.ok(data.nemesis && data.nemesis.schemaVersion === 1, 'nemesis slice version 1');
  assert.equal(data.nemesis.completed, 2);
  assert.ok(data.nemesisDeployment && data.nemesisDeployment.version === 1, 'deployment slice version 1');
  assert.equal(data.nemesisDeployment.nextCheckAt, 12.5);
  assert.ok(data.enemyMind && data.enemyMind.version === 1, 'enemy mind slice version 1');
  assert.equal(data.enemyMind.eventSequence, 7);
  // Detached copies: mutating the save payload must not alias live state.
  data.nemesis.completed = 99;
  assert.equal(state.nemesis.completed, 2);
});

test('restore applies the slices BEFORE the save:loaded emission', () => {
  const { save, state, bus } = makeHarness();
  seedLiveSlices(state);
  const data = save.serializeData();

  const fresh = makeHarness();
  const restoredState = fresh.state;
  let seenAtLoad = null;
  fresh.bus.on('save:loaded', () => {
    seenAtLoad = {
      nemesisCompleted: restoredState.nemesis && restoredState.nemesis.completed,
      enemyMindSequence: restoredState.enemyMind && restoredState.enemyMind.eventSequence,
      deploymentVersion: restoredState.nemesisDeployment && restoredState.nemesisDeployment.version,
    };
  });
  fresh.save._restore(JSON.parse(JSON.stringify(data)), 'slot-a', {});
  assert.ok(seenAtLoad, 'save:loaded emitted');
  assert.equal(seenAtLoad.nemesisCompleted, 2, 'arc memory restored before save:loaded');
  assert.equal(seenAtLoad.enemyMindSequence, 7, 'cognition namespace restored before save:loaded');
  assert.equal(seenAtLoad.deploymentVersion, 1, 'deployment ledger restored before save:loaded');
  assert.ok(restoredState !== state);
});

test('absent slices (old saves) restore to a fresh arc and cleared cognition', () => {
  const { save, state } = makeHarness();
  seedLiveSlices(state);
  const data = save.serializeData();
  delete data.nemesis;
  delete data.nemesisDeployment;
  delete data.enemyMind;

  save._restore(JSON.parse(JSON.stringify(data)), 'slot-a', {});
  assert.ok(state.nemesis && state.nemesis.schemaVersion === 1);
  assert.deepEqual(state.nemesis.episodes, [], 'old save starts an empty arc');
  assert.ok(state.nemesisDeployment && state.nemesisDeployment.version === 1);
  assert.equal(state.nemesisDeployment.reservation, null);
  assert.equal(state.enemyMind, null, 'cognition starts fresh at the resumed clock');
});

test('unknown future slice versions throw instead of erasing the previous state', () => {
  const { save } = makeHarness();
  seedLiveSlices(save.state);
  const data = save.serializeData();

  for (const [key, mutation] of [
    ['enemyMind', (copy) => { copy.enemyMind = { ...copy.enemyMind, version: 2 }; }],
    ['nemesis', (copy) => { copy.nemesis = { ...copy.nemesis, schemaVersion: 99 }; }],
    ['nemesisDeployment', (copy) => { copy.nemesisDeployment = { ...copy.nemesisDeployment, version: 7 }; }],
  ]) {
    const fresh = makeHarness();
    const copy = JSON.parse(JSON.stringify(data));
    mutation(copy);
    assert.throws(() => fresh.save._restore(JSON.parse(JSON.stringify(copy)), 'slot-a', {}),
      undefined, `${key} future version must throw`);
  }
});
