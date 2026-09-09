// CRU-012 / CRU-013 — the planned wave becomes live hostiles, and reports itself cleared.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { SURVIVAL_WAVE_OWNER_PREFIX, survivalWave, waveOwnerId } from '../src/systems/survivalWave.js';
import {
  GATE_BEARINGS,
  SURVIVAL_COHORT_TAG,
  levelForWave,
  materializeWaveBatch,
} from '../src/systems/waveMaterialization.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

function boot(seed = SEED) {
  const state = createGameState(seed);
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
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = {
        ...spec,
        id,
        alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
      };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  // A player entity so the materializer has an anchor to place gates around.
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;

  // Mirror the spawnBudget system's own lifecycle subscription (spawnBudget.js init) so slots
  // free on death exactly as they do in the real game.
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

function tick(harness, n = 1) {
  for (let i = 0; i < n; i++) {
    survivalWave.update(DT);
    survivalRun.update(DT);
  }
}

/** Destroy every live cohort body the way coreSystem's sweep does: mark dead, then receipt. */
function killCohort(harness) {
  const killed = [];
  for (const entity of [...harness.state.entities.values()]) {
    if (entity.id === harness.player.id) continue;
    if (!entity.alive) continue;
    entity.alive = false;
    harness.state.entities.delete(entity.id);
    killed.push(entity.id);
  }
  for (const id of killed) harness.bus.emit('entity:destroyed', { id });
  return killed.length;
}

function beginAndReachActive(harness) {
  harness.bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA,
  });
  harness.bus.emit('run:loadoutReady', {});
  tick(harness, 1);                            // loadout -> arena_intro
  tick(harness, SURVIVAL_ARENA_INTRO_TICKS);   // arena_intro -> wave_intro (plans wave 1)
  tick(harness, SURVIVAL_WAVE_INTRO_TICKS);    // wave_intro -> active (dispatches tick-0 batches)
  return harness.state.run;
}

test('survivalWave ticks immediately before survivalRun so a clear advances the same tick', () => {
  const wave = PRODUCTION_UPDATE_ORDER.indexOf('survivalWave');
  const run = PRODUCTION_UPDATE_ORDER.indexOf('survivalRun');
  assert.ok(wave >= 0, 'survivalWave is in the production update order');
  assert.equal(run, wave + 1);
});

test('the eight authored gate ids all resolve to distinct unit bearings', () => {
  const ids = Object.keys(GATE_BEARINGS);
  assert.equal(ids.length, 8);
  const seen = new Set();
  for (const id of ids) {
    const b = GATE_BEARINGS[id];
    const length = Math.hypot(b.x, b.z);
    assert.ok(Math.abs(length - 1) < 1e-9, `${id} is a unit vector`);
    const key = `${b.x.toFixed(6)}|${b.z.toFixed(6)}`;
    assert.ok(!seen.has(key), `${id} bearing is distinct`);
    seen.add(key);
  }
});

test('a begun survival run reaches phase active with wave 1 planned and live hostiles on the board', () => {
  const harness = boot();
  const run = beginAndReachActive(harness);

  assert.equal(run.phase, 'active');
  assert.equal(run.wave, 1);
  assert.equal(named(harness.emitted, 'run:wavePlanned').length, 1);

  const plan = named(harness.emitted, 'run:wavePlanned')[0].payload.plan;
  assert.equal(plan.packages[0].enemyId, 'wasp_swarmer');
  assert.equal(plan.packages[0].count, 6);

  // Six live wasps, all bound to the wave's budget owner, all stamped with the run cohort.
  assert.equal(harness.spawned.length, 6);
  for (const entity of harness.spawned) {
    assert.equal(entity.data.runCohort, SURVIVAL_COHORT_TAG);
    assert.equal(entity.data.runWave, 1);
    assert.equal(entity.data.runRole, 'mass');
    assert.equal(entity.team, 1);
    const owner = harness.budget.ownerForEntity(entity.id);
    assert.equal(owner, waveOwnerId(1));
    assert.ok(String(owner).startsWith(SURVIVAL_WAVE_OWNER_PREFIX));
  }
  assert.equal(harness.budget.current(), 6);
});

test('only live ENEMY_TYPES ids reach the materializer and every hostile carries real combat stats', () => {
  const harness = boot();
  beginAndReachActive(harness);
  for (const entity of harness.spawned) {
    assert.equal(typeof entity.hull, 'number');
    assert.ok(entity.hull > 0, 'hull is scaled, not a placeholder');
    assert.ok(Array.isArray(entity.weapons) || entity.data.weapons, 'archetype weapons survived');
    assert.equal(entity.data.ai.spawnContext, 'encounter');
  }
});

test('spawning never exceeds the spawn budget and never raises the cap', () => {
  const harness = boot();
  const maxBefore = harness.budget.max();
  // Ambient traffic already holds the eight-slot headroom world reserves.
  harness.budget.request(8, 'ambient-test');
  beginAndReachActive(harness);
  assert.equal(harness.budget.max(), maxBefore);
  assert.ok(harness.budget.current() <= harness.budget.max());
  assert.equal(harness.budget.current(), 14); // 8 ambient + 6 wave
});

test('a batched package dispatches on its scheduled tick, not all at once', () => {
  // Wave 8 is 14 waspers in two batches of 7, ninety ticks apart.
  const plan = planWave({ seed: SEED, arenaId: ARENA, wave: 8, act: 0, difficulty: 1, mutators: [], buildSummary: null });
  assert.equal(plan.schedule.length, 2);
  assert.equal(plan.schedule[0].count, 7);
  assert.equal(plan.schedule[1].count, 7);
  assert.equal(plan.schedule[1].atTick, 90);

  const harness = boot();
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  harness.bus.emit('run:loadoutReady', {});
  tick(harness, 1);
  tick(harness, SURVIVAL_ARENA_INTRO_TICKS);

  // Walk waves 1..7 by clearing each one, so wave 8 plans through the real phase machine.
  // Ticking past the last scheduled batch first is deliberate: a wave is not cleared while a
  // package is still owed, even if every body already on the board is dead.
  for (let wave = 1; wave <= 7; wave++) {
    tick(harness, SURVIVAL_WAVE_INTRO_TICKS);
    assert.equal(harness.state.run.wave, wave);
    tick(harness, 200);                  // every authored batch of waves 1-7 lands by tick 150
    killCohort(harness);
    tick(harness, 1);                    // survivalWave emits cleared; survivalRun -> cleanup
    assert.equal(harness.state.run.phase, 'cleanup', `wave ${wave} reached cleanup`);
    tick(harness, 181);                  // cleanup -> draft
    harness.bus.emit('run:draftResolved', {});
    tick(harness, 1);                    // draft -> wave_intro
  }

  const before = harness.spawned.length;
  tick(harness, SURVIVAL_WAVE_INTRO_TICKS);  // wave_intro -> active, first batch of 7
  assert.equal(harness.state.run.wave, 8);
  assert.equal(harness.spawned.length - before, 7);
  tick(harness, 88);
  assert.equal(harness.spawned.length - before, 7, 'second batch has not landed yet');
  tick(harness, 3);
  assert.equal(harness.spawned.length - before, 14, 'second batch landed at its scheduled tick');
});

test('run:waveCleared fires from this wave\'s own cohort, not from an entity scan', () => {
  const harness = boot();
  beginAndReachActive(harness);
  assert.equal(named(harness.emitted, 'run:waveCleared').length, 0);

  // An unrelated hostile in the sector must not clear the wave, and must not block it either.
  harness.helpers.spawnEntity({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, data: {} });
  tick(harness, 5);
  assert.equal(named(harness.emitted, 'run:waveCleared').length, 0, 'bystander does not clear');

  killCohort(harness);
  tick(harness, 1);
  const cleared = named(harness.emitted, 'run:waveCleared');
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].payload.wave, 1);
  assert.equal(cleared[0].payload.admitted, 6);
  assert.equal(cleared[0].payload.starved, false);
  assert.equal(harness.state.run.phase, 'cleanup');
});

test('a wave the cap starves resolves instead of stranding the player in active', () => {
  const harness = boot();
  harness.budget.request(harness.budget.max(), 'ambient-flood'); // no slots left at all
  beginAndReachActive(harness);
  assert.equal(harness.spawned.length, 0);
  tick(harness, 1);
  const cleared = named(harness.emitted, 'run:waveCleared');
  assert.equal(cleared.length, 1);
  assert.equal(cleared[0].payload.admitted, 0);
  assert.equal(cleared[0].payload.starved, true, 'the receipt says the room was full');
  assert.equal(harness.state.run.phase, 'cleanup');
});

test('a rejected batch releases its reservation instead of leaking slots', () => {
  const harness = boot();
  const ctx = { ...harness.ctx, helpers: { ...harness.helpers, spawnEntity: () => null } };
  const receipt = materializeWaveBatch(ctx, {
    ownerId: 'survival-wave:test', enemyId: 'wasp_swarmer', count: 5,
    gateGroup: 'nw', seed: SEED, wave: 1, packageIndex: 0, batchIndex: 0, role: 'mass',
  });
  assert.equal(receipt.granted, 5);
  assert.equal(receipt.admitted, 0);
  assert.equal(receipt.rejected, 5);
  assert.equal(harness.budget.current(), 0, 'nothing leaked');
});

test('materialization is deterministic for the same seed and wave', () => {
  // The systems are module singletons, so each arm has to be driven to completion in turn.
  function armPositions(seed) {
    const harness = boot(seed);
    harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed, arenaId: ARENA });
    harness.bus.emit('run:loadoutReady', {});
    tick(harness, 1);
    tick(harness, SURVIVAL_ARENA_INTRO_TICKS);
    tick(harness, SURVIVAL_WAVE_INTRO_TICKS);
    return harness.spawned.map((entity) => `${entity.pos.x}|${entity.pos.z}`);
  }
  const first = armPositions(SEED);
  const second = armPositions(SEED);
  const other = armPositions(SEED + 1);
  assert.equal(first.length, 6);
  assert.deepEqual(second, first, 'same seed reproduces the same wave placement');
  assert.notDeepEqual(other, first, 'a different seed places the wave differently');
});

test('enemy level climbs with the wave without inventing a new scaling knob', () => {
  assert.equal(levelForWave(1), 1);
  assert.equal(levelForWave(3), 1);
  assert.equal(levelForWave(4), 2);
  assert.equal(levelForWave(10), 4);
});

test('survivalWave is a strict no-op outside a live survival run', () => {
  const harness = boot();
  const before = harness.spawned.length;
  for (let i = 0; i < 300; i++) assert.doesNotThrow(() => survivalWave.update(DT));
  assert.equal(harness.spawned.length, before);
  assert.equal(harness.emitted.length, 0);

  // A lab run must not materialize survival waves either.
  harness.bus.emit('run:beginRequested', { kind: 'lab', ruleset: null, seed: SEED, arenaId: ARENA });
  for (let i = 0; i < 300; i++) assert.doesNotThrow(() => survivalWave.update(DT));
  assert.equal(harness.spawned.length, before);
  assert.equal(named(harness.emitted, 'run:waveMaterialized').length, 0);
});
