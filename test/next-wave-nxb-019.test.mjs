// NXB-019 — the arena carries useful physical history across preparation intervals.
//
// The packet's three acceptance asks, pinned at the seams that own them:
//   1. The next round preserves displaced durable cover and surviving wrecks, and never
//      regenerates a supply the player already spent.
//   2. A recipe needing a guaranteed affordance gets it through the authored replacement
//      condition — the cover telegraph tops the bubble up — not a room reset.
//   3. Replaceable debris keeps its established lifecycle (repair cells still expire);
//      meaningful retained facts are not culled because a round number advanced.
//
// Children: NXI-073 (a collected supply stays spent through refit), NXI-074 (disabled
// survivors are counted by the current round's rule — live entity state), NXI-075 (the
// player-moved cover transform survives preparation), NXI-076 (replenishment is explained
// only when a real replacement is admitted).

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { MASSLINE2_FLAGS, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { mines } from '../src/systems/mines.js';
import { survivalArena } from '../src/systems/survivalArena.js';
import { terrainAnchors } from '../src/systems/terrainAnchors.js';
import { swarmSupply, SWARM_REPAIR_KIND } from '../src/systems/swarmSupply.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { SWARM_RULESET } from '../src/data/swarmMode.js';

const SEED = 4242;
const ARENA = 'helios_core';

function makeFakeFields() {
  const live = new Map();
  return {
    name: 'fields',
    live,
    registerEnvironmental(spec) {
      const id = String(spec && spec.id != null ? spec.id : 'field');
      const record = { ...spec, id };
      live.set(id, record);
      return record;
    },
    unregisterExternal(id) { return live.delete(String(id)); },
    updateExternal(id, patch) {
      const record = live.get(String(id));
      if (record && patch) Object.assign(record, patch);
      return record || null;
    },
    hasExternal(id) { return live.has(String(id)); },
  };
}

function boot({ ruleset = SWARM_RULESET, simTime = 100 } = {}) {
  const snap = snapshotFeatureMaps();
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.terrainAnchors = true;
  const state = createGameState(SEED);
  state.simTime = simTime;
  state.entityList = [];
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload });
      raw.emit(event, payload);
    },
  };
  let nextId = 1000;
  const helpers = {
    hash32,
    mulberry32,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: nextId++, alive: true, type: 'ship', pos: { x: 0, z: 0 }, hull: 50, hullMax: 100 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.player = { cargo: { items: {} } };

  const run = createRunState({ kind: 'survival', ruleset, seed: SEED });
  run.arenaId = ARENA;
  run.phase = 'active';
  run.wave = 1;
  state.run = run;

  const fakeFields = makeFakeFields();
  const registry = { get: (name) => (name === 'fields' ? fakeFields : null) };
  const ctx = { state, bus, helpers, registry };
  mines.init(ctx);
  survivalArena.init(ctx);
  const anchors = Object.create(terrainAnchors);
  anchors.init({ state, bus, helpers });
  return { state, bus, emitted, helpers, fakeFields, anchors, run, player, snap };
}

function wavePlan(harness, wave) {
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave, mode: SWARM_RULESET });
  assert.ok(!plan.error, `wave ${wave} plans clean`);
  harness.run.wave = wave;
  harness.bus.emit('run:wavePlanned', { wave, plan, tick: 0 });
  return plan;
}

function liveAnchors(state) {
  return state.entityList.filter((e) => e && e.alive !== false && e.data && e.data.terrainAnchor === true);
}

test('a swarm wave boundary retains cover bodies — ownership releases, the rocks stay', () => {
  const h = boot();
  try {
    wavePlan(h, 1);
    const rocks = liveAnchors(h.state);
    assert.ok(rocks.length >= 4, `opening cover installed (${rocks.length} anchors)`);
    assert.ok(rocks.every((r) => r.data.terrainAnchorEncounterIds.includes('survival-arena-w1')));
    const ttl = rocks[0].data.despawnAt;
    assert.ok(ttl > h.state.simTime + 45, 'cover spawns with its authored long TTL');

    // The player displaced one — move it, still inside the telegraph bubble.
    const moved = rocks[0];
    moved.pos.x += 60;
    const movedPos = { ...moved.pos };

    h.bus.emit('run:waveCleared', { wave: 1 });
    const resolved = h.emitted.filter((e) => e.event === 'encounter:resolved').pop();
    assert.equal(resolved.payload.retainAnchors, true,
      'a wave clear under the swarm ruleset releases ownership with retention, not a sweep');
    for (const rock of rocks) {
      assert.equal(rock.alive, true, 'cover bodies survive the preparation interval');
      assert.equal(rock.data.despawnAt, ttl,
        'no aftermath clamp — the body keeps the lifetime it was authored with');
    }
    assert.deepEqual(moved.pos, movedPos, 'the displaced rock is exactly where the player left it');
  } finally {
    restoreFeatureMaps(h.snap);
  }
});

test('the next wave re-adopts retained cover and only tops up what is genuinely missing', () => {
  const h = boot();
  try {
    wavePlan(h, 1);
    const first = liveAnchors(h.state);
    const kept = first.length;
    h.bus.emit('run:waveCleared', { wave: 1 });

    const receipts = h.emitted.filter((e) => e.event === 'terrainAnchors:replenished');
    const receiptsBefore = receipts.length;

    // NXI-075 — the moved rock's transform is the one thing preparation must not touch.
    const moved = first[0];
    moved.pos.x += 40;
    const movedPos = { ...moved.pos };

    wavePlan(h, 2);
    const after = liveAnchors(h.state);
    assert.ok(after.includes(moved), 'the moved rock is still in the room');
    assert.deepEqual(moved.pos, movedPos, 'the player-moved transform survives preparation intact');
    assert.ok(moved.data.terrainAnchorEncounterIds.includes('survival-arena-w2'),
      'retained cover is re-adopted by the next wave — owned again, not orphaned');

    // NXI-076 — replenishment is explained when real bodies were admitted. All six retained
    // anchors were still in the bubble, so wave 2 admitted zero new rocks and says so by
    // staying silent.
    const newReceipts = h.emitted.filter((e) => e.event === 'terrainAnchors:replenished').slice(receiptsBefore);
    assert.equal(newReceipts.length, 0,
      'nothing was replaced, so nothing claims replenishment — adoption is bookkeeping, not spawns');

    // Counterexample on the same seam: destroy the cover, and the next wave's telegraph tops
    // the bubble back up through the authored replacement condition — never a room reset.
    for (const rock of after.slice()) rock.alive = false;
    h.bus.emit('run:waveCleared', { wave: 2 });
    wavePlan(h, 3);
    const third = liveAnchors(h.state).filter((r) => r.data.terrainAnchorEncounterIds.includes('survival-arena-w3'));
    assert.ok(third.length >= 4, 'destroyed cover is replaced through the authored top-up, honestly');
    const w3Receipt = h.emitted.filter((e) => e.event === 'terrainAnchors:replenished').pop();
    assert.ok(w3Receipt.payload.spawned >= 1, 'the receipt fires only because real replacements were admitted');
  } finally {
    restoreFeatureMaps(h.snap);
  }
});

test('a scored-ruleset wave clear still sweeps — retention is the swarm contract only', () => {
  const h = boot({ ruleset: 'scored' });
  try {
    // loose_plate is the authored cover phase — it produces cover under any ruleset.
    const plan = { ok: undefined, arenaPhase: 'loose_plate', packages: [{ gateGroup: 'nw' }] };
    h.bus.emit('run:wavePlanned', { wave: 1, plan, tick: 0 });
    const rocks = liveAnchors(h.state);
    assert.ok(rocks.length >= 1, 'scored loose_plate installs cover');
    h.bus.emit('run:waveCleared', { wave: 1 });
    const resolved = h.emitted.filter((e) => e.event === 'encounter:resolved').pop();
    assert.equal(resolved.payload.retainAnchors, false);
    assert.ok(rocks[0].data.despawnAt <= h.state.simTime + 45,
      'outside the swarm interval contract the 45 s aftermath sweep still owns released cover');
  } finally {
    restoreFeatureMaps(h.snap);
  }
});

test('run end sweeps the room — retention is bounded to the preparation interval', () => {
  const h = boot();
  try {
    wavePlan(h, 1);
    const rocks = liveAnchors(h.state);
    assert.ok(rocks.length >= 1);
    h.bus.emit('run:ended', { reason: 'test' });
    const resolved = h.emitted.filter((e) => e.event === 'encounter:resolved').pop();
    assert.equal(resolved.payload.retainAnchors, false, 'a run ending sweeps — nothing is kept past it');
    assert.ok(rocks[0].data.despawnAt <= h.state.simTime + 45);
  } finally {
    restoreFeatureMaps(h.snap);
  }
});

test('NXI-073 — a collected supply stays spent through the refit interval', () => {
  const h = boot();
  const supply = Object.create(swarmSupply);
  supply.init({ state: h.state, bus: h.bus, helpers: h.helpers });
  try {
    // A cohort kill drops one cell; the player scoops it — index 0 enters the spent ledger.
    const victim = h.helpers.spawnEntity({
      type: 'fighter', pos: { x: 30, z: 10 }, data: { runCohort: 'survival' },
    });
    for (let i = 0; i < 14; i++) {
      h.bus.emit('entity:killed', { id: victim.id, pos: victim.pos });
    }
    const cell = h.state.entityList.find((e) => e && e.type === 'pickup' && e.data && e.data.kind === SWARM_REPAIR_KIND);
    assert.ok(cell, 'a run-owned kill while hurt drops a repair cell');
    const dropIndex = cell.data.swarmDropIndex;
    h.bus.emit('pickup:collected', { pickupId: cell.id, collectorId: h.player.id });
    assert.ok(!supply._live.has(cell.id));
    assert.ok(supply._spent.has(dropIndex), 'the spent ledger owns the collected cell');

    // The refit interval passes — the ledger must not forget.
    h.bus.emit('run:transitioned', { phase: 'draft' });
    h.bus.emit('run:transitioned', { phase: 'active' });
    assert.ok(supply._spent.has(dropIndex), 'a collected supply stays spent through refit');

    // And a receipt path that re-materializes the same index cannot re-arm it.
    const ghost = h.helpers.spawnEntity({
      type: 'pickup', pos: { x: 0, z: 0 },
      data: { kind: SWARM_REPAIR_KIND, swarmRepair: true, swarmDropIndex: dropIndex, despawnAt: 999 },
    });
    h.bus.emit('entity:spawned', { entity: ghost });
    assert.ok(!supply._live.has(ghost.id), 'a spent index can never pay twice, even re-spawned');
  } finally {
    supply.destroy?.();
    restoreFeatureMaps(h.snap);
  }
});

test('NXI-074 — disabled survivors are counted by live state under the cohort rule', () => {
  const wave = Object.create(survivalWave);
  const state = createGameState(SEED);
  const entities = new Map();
  const live1 = { id: 11, alive: true };
  const dead = { id: 12, alive: false };
  const disabled = { id: 13, alive: true, data: { disabled: true } };
  entities.set(11, live1); entities.set(12, dead); entities.set(13, disabled);
  state.entities = entities;
  wave.state = state;
  wave._cohort = new Map([[11, {}], [12, {}], [13, {}]]);
  // The current round rule resolves at clear-check time: the dead body is disabled history,
  // the disabled survivor counts once — from the entity's live state, not a stale member flag.
  assert.equal(wave._disabledCohortCount(), 2);
  disabled.data.disabled = false;
  assert.equal(wave._disabledCohortCount(), 1, 'the count tracks live state — a re-enabled hull stops counting');
});
