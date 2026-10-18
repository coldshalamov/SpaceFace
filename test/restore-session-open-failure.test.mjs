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

// Same fixture shape as save-restore-atomicity.test.mjs, with the economy
// deserialize that does NOT throw — the failure under test happens earlier,
// inside _openRestoreSession itself.
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
  let deserializeCalls = 0;
  const economy = {
    serialize() { return { marker: state.economy.marker }; },
    deserialize(data) {
      deserializeCalls++;
      state.economy.marker = data && data.marker;
    },
  };
  const save = Object.create(saveDefinition);
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

function targetEnvelope(harness, marker = 'target') {
  const envelope = harness.save.serialize('target-slot');
  envelope.data.economy = { marker };
  // The test exercises restore transactionality, not checksum rejection.
  delete envelope.checksum;
  return envelope;
}

// The restore gate (_restoring) is taken at the TOP of _openRestoreSession, before the
// session object exists — a throw anywhere between it and the session's construction
// (a foreign transition helper, a save:restoring emit, a slice-budget arm, the
// time-effects install) used to latch the gate permanently: every later save refused
// as 'restoring', every later load deferred into a queue that no close ever drained.
test('a throw inside restore-session open releases the gate and still rolls back', () => {
  const harness = makeHarness();
  let openFaults = 1;
  harness.save.helpers.beginLoadedGameTransition = () => {
    if (openFaults > 0) {
      openFaults--;
      throw new Error('synthetic transition reservation failure');
    }
    return null;
  };

  const ok = harness.save.loadEnvelope(targetEnvelope(harness), 'target-slot');
  assert.equal(ok, false, 'the failed open must still report a failed load');
  assert.equal(harness.save._restoring, false,
    'the restore gate must release when the session never existed');
  assert.equal(harness.save._pendingRunTransition, null,
    'no queued route may be stranded by a session that never opened');
  assert.equal(harness.state.economy.marker, 'original',
    'the live run must survive — the rollback restore has to actually run');
  assert.equal(harness.deserializeCalls, 1,
    'exactly one deserialize — the rollback — must run; the target never reached chunks');
  const errors = harness.events.filter((event) => event.name === 'save:error');
  assert.equal(errors.length, 1, 'one truthful load error must be emitted');
  assert.equal(errors[0].payload.reason, 'load_failed');
  assert.equal(errors[0].payload.rollback, 'restored',
    'the released gate lets the rollback restore the live run');

  // The latch is not a one-way door: a later ordinary load still works.
  const retry = harness.save.loadEnvelope(targetEnvelope(harness, 'second'), 'target-slot');
  assert.equal(retry, true, 'a later load must run after the failed open, not defer forever');
  assert.equal(harness.state.economy.marker, 'second');
  assert.equal(harness.deserializeCalls, 2, 'the retry must reach the restore walk');
});

// A route deferred inside save:restoring is a legitimate newer intent (game:new/load).
// When the open leg that follows it throws, close-session semantics apply: the drained
// route wins, the dead request is superseded (not failed), and nothing rolls back over
// the world the newer route now owns.
test('a queued transition drains when the restore session fails to open', () => {
  const harness = makeHarness();
  const state = harness.state;
  const save = harness.save;

  let queuedRuns = 0;
  let budgetFaults = 1;
  save.bus.emit = (name, payload = {}) => {
    harness.events.push({ name, payload });
    if (name === 'save:restoring') {
      save.deferRunTransition(() => {
        queuedRuns++;
        state.fixtureRoute = 'queued-route';
        state.economy.marker = 'queued-route';
        return { route: 'queued-route' };
      });
    }
  };
  save.bus.setEmitSliceBudget = () => {
    if (budgetFaults > 0) {
      budgetFaults--;
      throw new Error('synthetic slice budget fault');
    }
  };

  const ok = save.loadEnvelope(targetEnvelope(harness), 'target-slot');
  assert.equal(ok, true, 'a superseded failed open reports the drained route, not failure');
  assert.equal(queuedRuns, 1, 'the queued route must drain exactly once');
  assert.equal(state.fixtureRoute, 'queued-route', 'the drained route must own the world');
  assert.equal(state.economy.marker, 'queued-route',
    'no rollback may run over the route that just drained');
  assert.equal(save._restoring, false, 'the restore gate must release');
  assert.equal(save._pendingRunTransition, null, 'the queue must be empty after the drain');
  assert.equal(save.events, undefined);
  assert.equal(harness.events.filter((event) => event.name === 'save:error').length, 0,
    'a superseded open must not publish the loser\'s error');
});
