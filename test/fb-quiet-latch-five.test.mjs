import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { core } from '../src/core/coreSystem.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import {
  combat,
  setCombatQuietLatchForBench,
  getCombatQuietLatchForBench,
} from '../src/systems/combat.js';
import {
  mining,
  setMiningQuietLatchForBench,
  getMiningQuietLatchForBench,
} from '../src/systems/mining.js';
import {
  wingmen,
  setWingmenQuietLatchForBench,
  getWingmenQuietLatchForBench,
} from '../src/systems/wingmen.js';
import {
  collisionConsequences,
  setCollisionConsequencesQuietLatchForBench,
  getCollisionConsequencesQuietLatchForBench,
} from '../src/systems/collisionConsequences.js';
import {
  createChronicler,
  setChroniclerQuietLatchForBench,
  getChroniclerQuietLatchForBench,
} from '../src/systems/chronicler.js';

// FB-090: five owner-local quiet latches — combat, mining, wingmen,
// collisionConsequences, chronicler. Every latch must be production-default-on,
// must skip provably idle per-tick work, must wake on the events that create
// that owner's work, and must preserve exact state across idle/activity cycles.

function boot(seed = 4242) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.tick = 0;
  state.simTime = 0;
  const bus = createBus();
  const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const player = helpers.spawnEntity({
    type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 12, hull: 100, hullMax: 100,
    shield: 50, shieldMax: 50, cap: 50, capMax: 50,
    collides: true, team: 0, data: {},
  });
  player.flags = {};
  state.playerId = player.id;
  const index = helpers.entityIndex();
  index.ready = true;
  index.ships = [player];
  index.shipLike = [player];
  index.pickups = [];
  index.payloads = [];
  index.version = (index.version | 0) + 1;
  return { state, bus, helpers, ctx, player, index };
}

function tick(state, sys, n = 1) {
  for (let i = 0; i < n; i++) {
    state.tick++;
    state.simTime += 1 / 60;
    sys.update(1 / 60, state);
  }
}

// ── combat ──────────────────────────────────────────────────────────────────
test('combat: idle arms quiet latch, dock event wakes, clears, re-arms', () => {
  setCombatQuietLatchForBench(true);
  assert.equal(getCombatQuietLatchForBench(), true);
  const { state, bus, ctx, player } = boot();
  combat.init(ctx);
  tick(state, combat, 3);
  assert.equal(state.combatRuntime.quietLatched, true);

  // Event wake: dock:docked sets invuln → the next tick must run the real scan
  // (needsService) instead of staying latched.
  bus.emit('dock:docked', { stationId: null });
  tick(state, combat, 1);
  assert.equal(state.combatRuntime.quietLatched, false);

  // Return to rest → latch re-arms on the next proved-idle scan.
  player.flags.invuln = false;
  player._invulnUntil = null;
  tick(state, combat, 1);
  assert.equal(state.combatRuntime.quietLatched, true);
});

test('combat: entity-index membership bump wakes the latch, equivalence preserved', () => {
  setCombatQuietLatchForBench(true);
  const run = (quietOn) => {
    setCombatQuietLatchForBench(quietOn);
    const { state, ctx, index } = boot(7777);
    combat.init(ctx);
    tick(state, combat, 5);
    // A damaged ship must be serviced identically on and off the latch.
    const { helpers } = ctx;
    const npc = helpers.spawnEntity({
      type: 'ship', pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 60, hullMax: 60,
      shield: 0, shieldMax: 40, shieldRegenRate: 10, shieldRegenDelay: 0,
      cap: 0, capMax: 40, capRegen: 10,
      collides: true, team: 0, data: {},
    });
    index.ships.push(npc);
    index.version++;
    npc.lastDamageT = -1e9;
    tick(state, combat, 90);
    return npc.shield;
  };
  const latched = run(true);
  const unlatched = run(false);
  setCombatQuietLatchForBench(true);
  assert.equal(latched, unlatched);
  assert.ok(latched > 0, 'regen must actually run');
});

test('combat: bench toggle disables the latch', () => {
  const { state, ctx } = boot(9001);
  combat.init(ctx);
  setCombatQuietLatchForBench(false);
  tick(state, combat, 3);
  assert.equal(state.combatRuntime.quietLatched, false);
  setCombatQuietLatchForBench(true);
});

// ── mining ──────────────────────────────────────────────────────────────────
test('mining: idle arms quiet latch, pickup/event/fire wakes, re-arms', () => {
  setMiningQuietLatchForBench(true);
  assert.equal(getMiningQuietLatchForBench(), true);
  const { state, bus, ctx, index } = boot();
  mining.init(ctx);
  tick(state, mining, 3);
  assert.equal(state.miningRuntime.quietLatched, true);

  // Event wake: a foreign pickup collection creates dirty-cargo work.
  bus.emit('pickup:collected', { pickupId: null, collectorId: 9999 });
  tick(state, mining, 1);
  // After the wake scan the world is still empty → re-arms.
  assert.equal(state.miningRuntime.quietLatched, true);

  // Fire-group wake: holding the mining beam disarms immediately.
  state.input.fireGroup = 2;
  tick(state, mining, 1);
  assert.equal(state.miningRuntime.quietLatched, false);
  state.input.fireGroup = null;
  tick(state, mining, 2);
  assert.equal(state.miningRuntime.quietLatched, true);

  // Pickup-index membership wake: a live pickup in the authoritative index disarms.
  const { helpers } = ctx;
  const pickup = helpers.spawnEntity({
    type: 'pickup', pos: { x: 5000, z: 5000 }, vel: { x: 0, z: 0 },
    radius: 2, mass: 1, collides: false, data: {},
  });
  index.pickups.push(pickup);
  index.version++;
  tick(state, mining, 1);
  assert.equal(state.miningRuntime.quietLatched, false);
  index.pickups.length = 0;
  index.version++;
  tick(state, mining, 2);
  assert.equal(state.miningRuntime.quietLatched, true);
});

test('mining: heat decay never skips — beam heat drains identically latched or not', () => {
  const run = (quietOn) => {
    setMiningQuietLatchForBench(quietOn);
    const { state, ctx } = boot(3131);
    ctx.state.player.miningBeam = { tierId: 'beam_mk1' };
    const beam = ctx.state.player.miningBeam;
    mining.init(ctx);
    tick(state, mining, 2);          // settle: cold receipt emitted, field primed
    beam.heat = 30;                  // external warm (as if a beam window just released)
    tick(state, mining, 240);        // ~4s of cooling — must run every tick unlatched
    return { heat: beam.heat, noise: ctx.state.player.miningNoise };
  };
  const latched = run(true);
  const unlatched = run(false);
  setMiningQuietLatchForBench(true);
  assert.deepEqual(latched, unlatched);
});

// ── wingmen ─────────────────────────────────────────────────────────────────
test('wingmen: empty fleet latches; ledger row gaining a live id wakes then re-arms', () => {
  setWingmenQuietLatchForBench(true);
  assert.equal(getWingmenQuietLatchForBench(), true);
  const { state, ctx } = boot();
  wingmen.init(ctx);
  const row = { id: 'fs-a', order: 'escort', hp: 100, hullPct: 1, status: 'escort', _liveId: null };
  state.automation.fleet = [row];
  tick(state, wingmen, 3);
  assert.equal(state.wingmenRuntime.quietLatched, true);

  // Ledger row claims a live hull that does not exist → death path must run live.
  row._liveId = 987654;
  tick(state, wingmen, 1);
  assert.equal(state.wingmenRuntime.quietLatched, false);
  assert.equal(row.hp, 0, 'death bookkeeping must have run through the real loop');
  assert.equal(row._liveId, null);
  tick(state, wingmen, 2);
  assert.equal(state.wingmenRuntime.quietLatched, true);
});

// ── collisionConsequences ───────────────────────────────────────────────────
test('collisionConsequences: empty queues latch; stranded pending contact wakes and drains', () => {
  const prevFlag = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  try {
    setCollisionConsequencesQuietLatchForBench(true);
    assert.equal(getCollisionConsequencesQuietLatchForBench(), true);
    const { state, ctx, helpers } = boot();
    const npcA = helpers.spawnEntity({
      type: 'ship', pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 50, hullMax: 50, collides: true, team: 1, data: {},
    });
    const npcB = helpers.spawnEntity({
      type: 'ship', pos: { x: 110, z: 0 }, vel: { x: 0, z: 0 },
      radius: 8, mass: 10, hull: 50, hullMax: 50, collides: true, team: 1, data: {},
    });
    collisionConsequences.init(ctx);
    tick(state, collisionConsequences, 3);
    assert.equal(state.collisionConsequenceRuntime.quietLatched, true);

    // Synthetic wake injection: a deferred craft contact the stranded sweep must resolve.
    const contactTick = state.tick - 1;
    collisionConsequences._pendingCraftContacts.set('k0', {
      key: 'k0', a: npcA, b: npcB,
      payload: Object.freeze({ tick: contactTick, pos: { x: 0, z: 0 }, normal: { x: 0, z: 1 } }),
      exchangedMomentum: 12, tick: contactTick, causalProvenance: null,
    });
    tick(state, collisionConsequences, 1);
    assert.equal(state.collisionConsequenceRuntime.quietLatched, false,
      'queued consequence work must disarm the latch');
    assert.equal(collisionConsequences._pendingCraftContacts.size, 0, 'stranded contact drained');
    tick(state, collisionConsequences, 2);
    assert.equal(state.collisionConsequenceRuntime.quietLatched, true);
  } finally {
    COMBAT_FLAGS.weaponImpulseConsequences = prevFlag;
    setCollisionConsequencesQuietLatchForBench(true);
  }
});

// ── chronicler ──────────────────────────────────────────────────────────────
test('chronicler: empty archive latches, fact event wakes, settles back to quiet', () => {
  setChroniclerQuietLatchForBench(true);
  assert.equal(getChroniclerQuietLatchForBench(), true);
  const { state, bus } = boot();
  const chr = createChronicler();
  chr.init({ state, bus });
  tick(state, chr, 1);               // first publish pass seeds _nextWake
  tick(state, chr, 3);
  assert.equal(state.chroniclerRuntime.quietLatched, true);
  const clockWhileLatched = state.chronicler.clock;
  tick(state, chr, 2);
  assert.ok(state.chronicler.clock > clockWhileLatched,
    'm.clock must keep advancing while latched — persisted state stays byte-identical');

  // Fact wake: a kill lands in pending → unlatched ingest on the next update.
  bus.emit('entity:killed', { victimId: 4242, killerId: state.playerId, victimName: 'Test Hull' });
  tick(state, chr, 1);
  assert.equal(state.chroniclerRuntime.quietLatched, false);
  assert.ok(chr.diagnostics().stories >= 1, 'ingest produced a story');

  // Settle → story publishes → wake schedule pushes out → latch re-arms.
  tick(state, chr, 240);
  assert.equal(state.chroniclerRuntime.quietLatched, true);
  chr.destroy();
});

test('chronicler: serialize output identical latched vs unlatched through an ingest cycle', () => {
  const run = (quietOn) => {
    setChroniclerQuietLatchForBench(quietOn);
    const { state, bus } = boot(555);
    const chr = createChronicler();
    chr.init({ state, bus });
    tick(state, chr, 4);
    bus.emit('entity:killed', { victimId: 9001, killerId: state.playerId, victimName: 'A' });
    bus.emit('entity:killed', { victimId: 9002, killerId: 77, victimName: 'B' });
    tick(state, chr, 400);
    const out = chr.serialize();
    chr.destroy();
    return out;
  };
  const latched = run(true);
  const unlatched = run(false);
  setChroniclerQuietLatchForBench(true);
  assert.deepEqual(latched, unlatched);
});
