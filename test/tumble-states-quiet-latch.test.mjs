/**
 * tumbleStates quiet latch: skip shipLike walk when no tumble/rcs/recovery/drift.
 * Soft-GPU fps not claimed. Picture contract ON.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import {
  tumbleStates,
  setTumbleStatesQuietLatchForBench,
  getTumbleStatesQuietLatchForBench,
} from '../src/systems/tumbleStates.js';
import {
  recordImpulseProvenance,
  impulseProvenanceGeneration,
  HITSTUN_IMPULSE_EVENT,
} from '../src/combat/impulseKernel.js';

function boot(nNpc = 8) {
  const state = createGameState(91 + nNpc);
  state.mode = 'flight';
  const bus = createBus();
  const helpers = {};
  core.init({ state, bus, helpers, registry: null });
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100, collides: true, team: 1,
  });
  state.playerId = player.id;
  player.isPlayer = true;
  const npcs = [];
  for (let i = 0; i < nNpc; i++) {
    npcs.push(helpers.spawnEntity({
      type: 'ship', pos: { x: 200 + i * 40, z: 100 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 80, hullMax: 80, collides: true, team: 2,
      data: { ai: true, intent: {} },
    }));
  }
  if (state.entityIndex) state.entityIndex.ready = true;
  const sys = Object.create(tumbleStates);
  sys.init({ state, bus, helpers, registry: null });
  return { state, bus, helpers, player, npcs, sys };
}

function tick(sys, state, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick = (state.tick | 0) + 1;
    state.simTime = (state.simTime || 0) + 1 / 60;
    sys.update(1 / 60, state);
  }
}

test('quiet latch arms after a quiet walk and skips subsequent ticks', () => {
  setTumbleStatesQuietLatchForBench(true);
  assert.equal(getTumbleStatesQuietLatchForBench(), true);
  const { state, sys } = boot(12);
  tick(sys, state, 2);
  assert.equal(!!state.tumbleStatesRuntime?.quietLatched, true, 'should latch after quiet walk');
  assert.ok(sys._quietLatch && sys._quietLatch.armed === true);
  const armedTick = sys._quietLatch.armedTick;
  tick(sys, state, 5);
  assert.equal(state.tumbleStatesRuntime.quietLatched, true);
  assert.equal(sys._quietLatch.armedTick, armedTick, 'latched ticks must not re-arm');
});

test('bench toggle OFF forces every-tick walk', () => {
  setTumbleStatesQuietLatchForBench(false);
  const { state, sys } = boot(6);
  tick(sys, state, 3);
  assert.equal(!!state.tumbleStatesRuntime?.quietLatched, false);
  assert.equal(sys._quietLatch, null);
  setTumbleStatesQuietLatchForBench(true);
});

test('impulse provenance generation wakes the quiet latch', () => {
  setTumbleStatesQuietLatchForBench(true);
  const { state, sys, npcs } = boot(6);
  tick(sys, state, 2);
  assert.equal(state.tumbleStatesRuntime.quietLatched, true);
  const before = impulseProvenanceGeneration();
  recordImpulseProvenance(npcs[0], {
    tag: 'rcs_disruptor_spike',
    weaponId: 'rcs_spike',
    appliedTick: state.tick | 0,
    magnitude: 1,
  });
  assert.ok(impulseProvenanceGeneration() !== before);
  tick(sys, state, 1);
  // Wake: full walk runs; may re-arm if still no active tumble/rcs (RCS only arms on specific tag+weapon window).
  // The latch armedTick must advance (or latch briefly cleared).
  assert.ok(
    !sys._quietLatch
    || sys._quietLatch.impulseGen === impulseProvenanceGeneration(),
    'latch must observe new impulse generation',
  );
});

test('hitstun begin clears quiet latch (dirty wake)', () => {
  setTumbleStatesQuietLatchForBench(true);
  const { state, sys, bus, npcs } = boot(4);
  tick(sys, state, 2);
  assert.equal(state.tumbleStatesRuntime.quietLatched, true);
  // Direct clear via begin path (even if schedule fails without combat kernel, clear still runs)
  sys._beginFromImpulse(npcs[0], {
    source: 'weapon',
    kind: 'weapon_tumble',
    cause: 'weapon',
    deltaV: 80,
    attackerId: state.playerId,
    attackerMass: 12,
    hitSide: 1,
    requireMassline: false,
  });
  assert.equal(sys._quietLatch, null, 'begin must clear latch');
  assert.equal(!!state.tumbleStatesRuntime?.quietLatched, false);
});

test('membership spawn wakes quiet latch', () => {
  setTumbleStatesQuietLatchForBench(true);
  const { state, sys, helpers } = boot(4);
  tick(sys, state, 2);
  assert.equal(state.tumbleStatesRuntime.quietLatched, true);
  const prevMembership = sys._quietLatch.membership;
  helpers.spawnEntity({
    type: 'ship', pos: { x: 900, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 10, hull: 50, hullMax: 50, collides: true, team: 2,
  });
  tick(sys, state, 1);
  // Either re-armed with new membership or still walking; must not keep stale membership.
  if (sys._quietLatch) {
    assert.notEqual(sys._quietLatch.membership, prevMembership);
  }
});

test('rescan wakes after RESCAN ticks even when still quiet', () => {
  setTumbleStatesQuietLatchForBench(true);
  const { state, sys } = boot(4);
  tick(sys, state, 2);
  assert.equal(state.tumbleStatesRuntime.quietLatched, true);
  const armed = sys._quietLatch.armedTick;
  tick(sys, state, 30); // RESCAN = 30
  assert.ok(sys._quietLatch);
  assert.ok(sys._quietLatch.armedTick > armed, 'rescan must re-arm with fresh armedTick');
});
