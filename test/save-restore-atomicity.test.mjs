import assert from 'node:assert/strict';
import test from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

function vec(x = 0, z = 0) {
  return {
    x, y: 0, z,
    set(nx, ny, nz) { this.x = nx; this.y = ny || 0; this.z = nz; return this; },
    copy(other) { this.x = other.x || 0; this.y = other.y || 0; this.z = other.z || 0; return this; },
  };
}

function makeHarness({
  failEveryDeserialize = false,
  failRollbackSerialize = false,
  queueTransitionOnDeserialize = false,
} = {}) {
  const state = createGameState(73);
  state.mode = 'flight';
  state.save.currentSlot = 'original-slot';
  state.meta.playtimeS = 31;
  state.simTime = 31;
  state.tick = 1_860;
  state.world.currentSectorId = 'sector_helios_prime';
  state.economy.marker = 'original';

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
    data: {
      defId: 'ship_kestrel',
      weapons: [{ id: 'wpn_pulse_laser_s' }],
      fittings: [],
    },
  };
  state.playerId = player.id;
  state.nextEntityId = 2;
  state.entities.set(player.id, player);
  state.entityList.push(player);

  const events = [];
  let deserializeCalls = 0;
  let save;
  const economy = {
    serialize() {
      if (failRollbackSerialize && save && save._rollbackCaptureActive) {
        throw new Error('synthetic rollback snapshot failure');
      }
      return { marker: state.economy.marker };
    },
    deserialize(data) {
      deserializeCalls++;
      state.economy.marker = data && data.marker;
      if (queueTransitionOnDeserialize) {
        save.deferRunTransition(() => {
          state.fixtureRoute = 'newer-route';
          state.mode = 'loading';
          state.economy.marker = 'newer-route';
          return { route: 'newer-route' };
        });
      }
      if (failEveryDeserialize || deserializeCalls === 1) throw new Error('synthetic economy restore failure');
    },
  };
  save = Object.create(saveDefinition);
  save.state = state;
  save.bus = { emit(name, payload = {}) { events.push({ name, payload }); } };
  save.registry = { get(name) { return name === 'economy' ? economy : null; } };
  save.helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const spawned = {
        ...spec,
        id,
        alive: spec.alive !== false,
        pos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        vel: vec(spec.vel && spec.vel.x, spec.vel && spec.vel.z),
        prevPos: vec(spec.pos && spec.pos.x, spec.pos && spec.pos.z),
        prevRot: Number.isFinite(spec.rot) ? spec.rot : 0,
        flags: { ...(spec.flags || {}) },
        data: spec.data || {},
      };
      state.entities.set(id, spawned);
      state.entityList.push(spawned);
      return spawned;
    },
    getEntity(id) { return state.entities.get(id); },
    player() { return state.entities.get(state.playerId); },
  };
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save._rollbackCaptureActive = false;
  save._rollbackInProgress = false;

  return {
    save,
    state,
    events,
    get deserializeCalls() { return deserializeCalls; },
  };
}

function targetEnvelope(harness) {
  const envelope = harness.save.serialize('target-slot');
  envelope.data.economy = { marker: 'target' };
  // The test exercises restore transactionality, not checksum rejection.
  delete envelope.checksum;
  return envelope;
}

function liveSnapshot(state) {
  const player = state.entities.get(state.playerId);
  return {
    mode: state.mode,
    simTime: state.simTime,
    tick: state.tick,
    currentSlot: state.save.currentSlot,
    economyMarker: state.economy.marker,
    player: {
      pos: { x: player.pos.x, z: player.pos.z },
      vel: { x: player.vel.x, z: player.vel.z },
      hull: player.hull,
      shield: player.shield,
      cap: player.cap,
    },
    entityIds: state.entityList.map((entity) => entity.id),
  };
}

test('mutating deserialize failure rolls back the target load and returns false', () => {
  const harness = makeHarness();
  const before = liveSnapshot(harness.state);
  const ok = harness.save.loadEnvelope(targetEnvelope(harness), 'target-slot');

  assert.equal(ok, false, 'a thrown restore must not report a target success');
  assert.deepEqual(liveSnapshot(harness.state), before, 'rollback must restore the prior live snapshot');
  assert.equal(harness.state.save.currentSlot, 'original-slot', 'rollback must preserve the prior slot');
  assert.equal(harness.save._restoring, false, 'restore ownership must settle after rollback');
  assert.equal(harness.save._rollbackInProgress, false, 'rollback guard must settle');
  assert.equal(harness.events.filter((event) => event.name === 'save:loaded' && event.payload.slot === 'target-slot').length, 0);
  const errors = harness.events.filter((event) => event.name === 'save:error');
  assert.equal(errors.length, 1, 'one truthful load error must be emitted');
  assert.deepEqual(errors[0].payload, {
    slot: 'target-slot',
    reason: 'load_failed',
    rollback: 'restored',
    error: 'synthetic economy restore failure',
  });
});

test('rollback failure is fail-closed and does not recursively retry rollback', () => {
  const harness = makeHarness({ failEveryDeserialize: true });
  const ok = harness.save.loadEnvelope(targetEnvelope(harness), 'target-slot');

  assert.equal(ok, false);
  assert.equal(harness.deserializeCalls, 2, 'exactly one target attempt and one rollback attempt are allowed');
  assert.equal(harness.save._restoring, false, 'target and rollback restore ownership must settle');
  assert.equal(harness.save._rollbackInProgress, false, 'rollback guard must not remain armed');
  const errors = harness.events.filter((event) => event.name === 'save:error');
  assert.equal(errors.length, 1, 'rollback failure must still emit one error receipt');
  assert.deepEqual(errors[0].payload, {
    slot: 'target-slot',
    reason: 'load_failed',
    rollback: 'failed',
    error: 'synthetic economy restore failure',
    rollbackError: 'synthetic economy restore failure',
  });
  assert.equal(harness.events.filter((event) => event.name === 'save:loaded').length, 0,
    'a failed target and failed rollback must not publish a loaded success');
});

test('a newer transition queued during restore error runs once and wins over rollback', () => {
  const harness = makeHarness({ queueTransitionOnDeserialize: true });
  let transitionRuns = 0;
  const originalDefer = harness.save.deferRunTransition.bind(harness.save);
  harness.save.deferRunTransition = (callback) => originalDefer(() => {
    transitionRuns++;
    return callback();
  });

  const before = liveSnapshot(harness.state);
  const ok = harness.save.loadEnvelope(targetEnvelope(harness), 'target-slot');

  assert.equal(ok, false, 'the superseded failing restore must not report target success');
  assert.equal(transitionRuns, 1, 'the newer queued transition must run exactly once');
  assert.equal(harness.state.fixtureRoute, 'newer-route', 'the newer route must remain authoritative');
  assert.equal(harness.state.mode, 'loading', 'the newer transition result must not be rolled back');
  assert.notEqual(harness.state.economy.marker, before.economyMarker,
    'the winning transition must not be replaced by the old live snapshot');
  assert.equal(harness.save._restoring, false, 'restore ownership must settle');
  assert.equal(harness.events.filter((event) => event.name === 'save:loaded' && event.payload.slot === 'target-slot').length, 0);
});

test('rollback serializer failure rejects before target deserialize or mutation', () => {
  const harness = makeHarness({ failRollbackSerialize: true });
  const before = liveSnapshot(harness.state);
  const ok = harness.save.loadEnvelope(targetEnvelope(harness), 'target-slot');

  assert.equal(ok, false, 'a missing rollback copy must reject the load');
  assert.equal(harness.deserializeCalls, 0, 'target deserialization must not begin');
  assert.deepEqual(liveSnapshot(harness.state), before, 'pre-destructive rejection must preserve live state');
  assert.equal(harness.save._rollbackCaptureActive, false, 'strict serializer mode must settle');
  const errors = harness.events.filter((event) => event.name === 'save:error');
  assert.equal(errors.length, 1, 'rollback preparation failure must emit one error receipt');
  assert.deepEqual(errors[0].payload, {
    slot: 'target-slot',
    reason: 'restore_prepare_failed',
    rollback: 'unavailable',
    error: 'synthetic rollback snapshot failure',
  });
});
