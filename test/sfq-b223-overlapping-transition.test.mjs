// Row 226 / SFQ-B223 — rapid user actions cannot commit a stale async scene or overwrite the
// wrong save. Adversarial cases over the real save seam:
//
//   1. A load requested while another restore is mid-flight (a save:restoring listener that
//      re-enters load()) must defer, drain once, and leave the NEWER envelope's world standing.
//   2. A save requested mid-restore must refuse — writing half-restored live state would
//      clobber the very slot being loaded.
//
// Harness mirrors test/save-restore-atomicity.test.mjs (createGameState + the save definition
// object + stub registry/helpers), with a bus that also supports on() so save:restoring can
// re-enter the seam.

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

function makeHarness() {
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
  const listeners = new Map();
  const bus = {
    emit(name, payload = {}) { events.push({ name, payload }); for (const fn of listeners.get(name) || []) fn(payload); },
    on(name, fn) { (listeners.get(name) || listeners.set(name, []).get(name)).push(fn); return () => {}; },
  };

  const economy = {
    serialize() { return { marker: state.economy.marker }; },
    deserialize(data) { state.economy.marker = data && data.marker; },
  };

  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = bus;
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

  return { save, state, bus, events };
}

function envelopeFor(harness, marker, slot) {
  harness.state.economy.marker = marker;
  const envelope = harness.save.serialize(slot);
  // The test exercises transition arbitration, not checksum rejection.
  delete envelope.checksum;
  return envelope;
}

test('a reentrant load during restore defers, drains once, and the newer envelope wins', () => {
  const harness = makeHarness();
  const { save, state, bus, events } = harness;

  const envA = envelopeFor(harness, 'world-a', 'slot-a');
  const envB = envelopeFor(harness, 'world-b', 'slot-b');

  let innerResult = null;
  bus.on('save:restoring', (p) => {
    // The double-clicked Continue: a second load lands inside the first restore.
    if (p.slot === 'slot-a' && innerResult === null) {
      innerResult = save.loadEnvelope(envB, 'slot-b');
    }
  });

  const ok = save.loadEnvelope(envA, 'slot-a');

  assert.equal(ok, true, 'the first load reports its completed (superseded) restore');
  // The reentrant load deferred through deferRunTransition; _restorePreparedEnvelope reports
  // the queued marker as an accepted request (true), not a destructive mid-restore run.
  assert.equal(innerResult, true, 'the reentrant load is deferred, not run destructively');
  assert.equal(state.economy.marker, 'world-b', 'only the current valid request reaches the world');
  assert.equal(state.save.currentSlot, 'slot-b');
  assert.equal(save._restoring, false, 'restore ownership settles after the drain');
  const loaded = events.filter((e) => e.name === 'save:loaded').map((e) => e.payload.slot);
  assert.deepEqual(loaded, ['slot-a', 'slot-b'],
    'each completed restore publishes once, newest last — the final world is the current request');
});

test('a save requested mid-restore refuses instead of writing half-restored state', () => {
  const harness = makeHarness();
  const { save, state, bus, events } = harness;

  const envA = envelopeFor(harness, 'world-a', 'slot-a');
  let innerSave = 'unset';
  bus.on('save:restoring', (p) => {
    if (p.slot === 'slot-a' && innerSave === 'unset') {
      innerSave = save.save('quick');
    }
  });

  save.loadEnvelope(envA, 'slot-a');

  assert.equal(innerSave, false,
    'a save inside the restore window must refuse — the half-restored state is not the loaded world');
  assert.equal(events.filter((e) => e.name === 'save:started').length, 0,
    'no write begins inside the restore window');
});
