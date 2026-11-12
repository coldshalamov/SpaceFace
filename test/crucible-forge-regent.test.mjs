// PQ-133.07 (CRU-043) — the wave-thirty Forge Regent finale.
//
// Wave 30 of the thirty-wave Foundry arc must not replay the wave-ten Foreman. The composed elite
// is the Forge Regent: the Mirrorjaw core under a wider crown, a different problem rather than a
// bigger health bar. This suite pins the authored identity, the no-HP-inflation contract, the
// composition/caps, the second system event, and the run-machine emission.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';
import {
  SURVIVAL_ARC_LENGTH,
  WAVE_30_FINALE_ENEMY_ID,
  WAVE_30_FINALE_SCORE_ID,
  WAVE_30_SYSTEM_EVENT,
  templateWaveOf,
} from '../src/data/survivalActs.js';
import { peakConcurrentDemand } from '../src/data/survivalWaves.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_CLEANUP_TICKS,
  SURVIVAL_REFIT_EVERY,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { createRunState } from '../src/core/runState.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import { capitalOrderKey } from '../src/ai/capitalBossOrders.js';

const FOUNDRY = 'helios_core';
const OTHER = 'ceres_belt';
const SEED = 47;
const DT = 1 / 60;

function eliteOf(plan) {
  return (plan.packages || []).find((pkg) => pkg.role === 'elite') || null;
}

test('wave 30 crowns the Mirrorjaw core; wave 10 keeps the Foreman', () => {
  const finale = planWave({ seed: SEED, arenaId: FOUNDRY, wave: 30 });
  const ten = planWave({ seed: SEED, arenaId: FOUNDRY, wave: 10 });
  assert.ok(finale && finale.ok !== false, 'the finale plans');
  assert.equal(eliteOf(ten).enemyId, 'mirrorjaw_foreman');
  const finaleElite = eliteOf(finale);
  assert.equal(finaleElite.enemyId, WAVE_30_FINALE_ENEMY_ID);
  assert.equal(finaleElite.count, 1);
  // The crown is a rewrite of the authored elite slot, not an added body: one elite on the
  // same slot shape and schedule the Foreman held.
  assert.deepEqual(
    {
      atTick: finaleElite.atTick,
      count: finaleElite.count,
      batchSize: finaleElite.batchSize,
      batchGapTicks: finaleElite.batchGapTicks,
    },
    { atTick: 0, count: 1, batchSize: 1, batchGapTicks: 0 },
  );
  // The escort around the crown is the act's own composition growth (FB-026 — the arc's
  // difficulty is the company the elite keeps, not hit points). A non-Mirrorjaw arena's
  // uncrowned wave 30 fields the identical escort, gate bearings aside.
  const escortsOf = (plan) => (plan.packages || [])
    .filter((pkg) => pkg.role !== 'elite')
    .map(({ gateGroup, ...rest }) => rest);
  const uncrowned = planWave({ seed: SEED, arenaId: OTHER, wave: 30 });
  assert.deepEqual(escortsOf(finale), escortsOf(uncrowned));
  assert.ok(peakConcurrentDemand(finale.packages) <= 24);
});

test('arenas without a Mirrorjaw core keep their own wave-30 boss', () => {
  const other = planWave({ seed: SEED, arenaId: OTHER, wave: 30 });
  assert.ok(other && other.ok !== false);
  assert.equal(eliteOf(other).enemyId, 'dreadnought_boss');
  assert.equal(
    (other.packages || []).some((pkg) => pkg.enemyId === WAVE_30_FINALE_ENEMY_ID),
    false,
  );
});

test('the Forge Regent is a different problem, not a bigger health bar', () => {
  const regent = ENEMY_TYPES.find((enemy) => enemy.id === WAVE_30_FINALE_ENEMY_ID);
  const foreman = ENEMY_TYPES.find((enemy) => enemy.id === 'mirrorjaw_foreman');
  assert.ok(regent, 'forge_regent is authored');
  assert.ok(foreman);
  assert.equal(regent.hull, foreman.hull, 'no HP inflation');
  assert.equal(regent.armor, foreman.armor);
  assert.equal(regent.shield, foreman.shield);
  // The crown is wider than the Foreman prow: more of the head-on hemisphere is a bank surface.
  assert.equal(regent.prowSurface.arcDeg, 180);
  assert.ok(regent.prowSurface.arcDeg > foreman.prowSurface.arcDeg);
  assert.equal(regent.prowSurface.material, 'plate');
  assert.equal(regent.directionalArmor.frontArcDeg, 180);
  // Sustained furnace beam replaces the light repeater.
  const weaponIds = regent.weapons.map((weapon) => weapon.id);
  assert.ok(weaponIds.includes('wpn_beam_laser_m'));
  assert.ok(!weaponIds.includes('wpn_pulse_laser_s'));
  // A survival boss pays nothing and drops nothing.
  assert.equal(regent.bountyCr, 0);
  assert.equal(regent.loot, null);
  assert.equal(regent.telegraph.line.includes('Forge Regent'), true);
});

test('the arc authors exactly two system events, the finale one on wave 30', () => {
  const flagged = [];
  for (let wave = 1; wave <= SURVIVAL_ARC_LENGTH; wave++) {
    const plan = planWave({ seed: SEED, arenaId: FOUNDRY, wave });
    if (plan.systemEvent) flagged.push({ wave, id: plan.systemEvent.id });
  }
  assert.deepEqual(flagged, [
    { wave: 20, id: 'foundry_plate_theft' },
    { wave: WAVE_30_SYSTEM_EVENT.wave, id: WAVE_30_SYSTEM_EVENT.id },
  ]);
});

test('the finale is seed-deterministic', () => {
  const a = planWave({ seed: 11, arenaId: FOUNDRY, wave: 30 });
  const b = planWave({ seed: 11, arenaId: FOUNDRY, wave: 30 });
  assert.deepEqual(a, b);
  const other = planWave({ seed: 12, arenaId: FOUNDRY, wave: 30 });
  assert.equal(eliteOf(other).enemyId, WAVE_30_FINALE_ENEMY_ID);
});

function boot(seed = 7) {
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
  runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  return { state, bus, emitted };
}

function driveArc(seed = 7) {
  const harness = boot(seed);
  const { bus } = harness;
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed, arenaId: FOUNDRY });
  bus.emit('run:loadoutReady', {});
  survivalRun.update(DT);
  for (let i = 0; i < SURVIVAL_ARENA_INTRO_TICKS; i++) survivalRun.update(DT);
  for (let wave = 1; wave <= SURVIVAL_ARC_LENGTH; wave++) {
    for (let i = 0; i < SURVIVAL_WAVE_INTRO_TICKS; i++) survivalRun.update(DT);
    bus.emit(WAVE_CLEARED_SEAM, { wave });
    survivalRun.update(DT);
    const cleanup = templateWaveOf(wave) === 10 ? 240 : SURVIVAL_CLEANUP_TICKS;
    for (let i = 0; i < cleanup; i++) survivalRun.update(DT);
    if (wave % SURVIVAL_REFIT_EVERY === 0) {
      bus.emit('run:refitClosed', {});
      survivalRun.update(DT);
    } else if (wave < SURVIVAL_ARC_LENGTH) {
      bus.emit('run:draftResolved', {});
      survivalRun.update(DT);
    }
  }
  return harness;
}

test('the run machine emits the finale crown once', () => {
  const { state, emitted } = driveArc(13);
  assert.equal(state.run.phase, 'victory');
  const events = emitted.filter((entry) => entry.event === 'run:systemEvent');
  assert.deepEqual(events.map((entry) => entry.payload.id), ['foundry_plate_theft', 'forge_regent_crown']);
  assert.deepEqual(events.map((entry) => entry.payload.wave), [20, 30]);
  const finalePlans = emitted
    .filter((entry) => entry.event === 'run:wavePlanned' && entry.payload.wave === 30)
    .map((entry) => entry.payload.plan);
  assert.equal(finalePlans.length, 1);
  assert.equal(eliteOf(finalePlans[0]).enemyId, WAVE_30_FINALE_ENEMY_ID);
});

// CRU-043b — the crown is not a dressed elite: the wave-30 Regent carries the authored score's
// stamp through the act's re-clones and the difficulty pass, and a scored run hands the hull to
// `capitalBoss:start` exactly like a Swarm champion row does.
test('the crowned elite carries the authored Regent score through the plan', () => {
  const finale = planWave({ seed: SEED, arenaId: FOUNDRY, wave: 30 });
  assert.equal(eliteOf(finale).characterScoreId, WAVE_30_FINALE_SCORE_ID);
  const scoredRows = (finale.schedule || []).filter((row) => row.characterScoreId);
  assert.equal(scoredRows.length, 1, 'exactly one scheduled body carries the score');
  assert.equal(scoredRows[0].enemyId, WAVE_30_FINALE_ENEMY_ID);
  assert.equal(scoredRows[0].count, 1);
  // The stamp survives both the act re-clones and the wave-30 difficulty pass.
  assert.equal(eliteOf(finale).batchGapTicks, 0);
  // An uncrowned arena keeps its own wave-30 boss and no score handoff.
  const other = planWave({ seed: SEED, arenaId: OTHER, wave: 30 });
  assert.equal((other.schedule || []).some((row) => row.characterScoreId), false);
  // Waves 10 and 20 keep their plain authored elites — no earlier wave borrows the stamp.
  for (const wave of [10, 20, 29]) {
    const plan = planWave({ seed: SEED, arenaId: FOUNDRY, wave });
    assert.equal((plan.schedule || []).some((row) => row.characterScoreId), false,
      `wave ${wave} has no score stamp`);
  }
});

function finaleHarness(seed = 13) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'scored', seed });
  Object.assign(state.run, { arenaId: FOUNDRY, phase: 'active', wave: 30 });
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, rot: 0, radius: 14, hull: 200, hullMax: 200, data: {} };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    routeCombatDamage() {},
    spawnEntity(spec) {
      const e = { ...spec, id: state.nextEntityId++, alive: true, pos: { ...spec.pos } };
      state.entities.set(e.id, e);
      state.entityList.push(e);
      spawned.push(e);
      return e;
    },
  };
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p.id));
  const ctx = { state, bus, helpers };
  const waveSystem = Object.create(survivalWave);
  waveSystem.init(ctx);
  const capital = createProductionCapitalBossEncounters();
  capital.init(ctx);
  bus.emit('run:wavePlanned', { wave: 30, plan: planWave({ seed, arenaId: FOUNDRY, wave: 30 }) });
  bus.emit('run:waveStarted', { wave: 30 });
  const h = { state, bus, emitted, spawned, player, waveSystem, capital };
  h.tick = (count = 1) => {
    for (let i = 0; i < count; i++) {
      state.tick++;
      state.simTime += DT;
      waveSystem.update(DT);
      capital.update(DT);
    }
  };
  h.close = () => { waveSystem.destroy(); capital.destroy(); };
  return h;
}

test('a scored wave-30 run hands the Regent to its authored capital score', () => {
  const h = finaleHarness();
  try {
    h.tick(10);
    const regent = h.spawned.find((e) => e.data?.lootTableId === WAVE_30_FINALE_ENEMY_ID
      || e.data?.enemyTypeId === WAVE_30_FINALE_ENEMY_ID);
    assert.ok(regent, 'the crowned hull materialized');
    assert.equal(regent.data.runCohort, 'survival');
    assert.equal(regent.data.runWave, 30);
    assert.equal(regent.data.missionTag, 'capital_boss');
    assert.equal(h.waveSystem._bossIds.has(regent.id), true, 'the finale is owed like a boss');
    const starts = h.emitted.filter((entry) => entry.event === 'capitalBoss:start');
    assert.equal(starts.length, 1, 'the fight starts once');
    assert.equal(starts[0].payload.encounterId, WAVE_30_FINALE_SCORE_ID);
    assert.equal(starts[0].payload.fightId, `swarm:w30:${WAVE_30_FINALE_SCORE_ID.replace(/^capital_boss_/, '')}`);
    assert.equal(starts[0].payload.bossId, regent.id);
    assert.equal(starts[0].payload.targetId, h.player.id);
    const fight = h.state.capitalBossEncounters.fights[starts[0].payload.fightId];
    assert.ok(fight, 'the fight record lives in the capital ledger');
    assert.equal(fight.bossId, regent.id);
    assert.equal(fight.plates.length, 2, 'the authored rim and crown plates ship with the fight');
    // The stock-fire gate belongs to the score now: no free-firing boss under a suppressed port.
    const order = h.state.capitalBossEncounters.orders[capitalOrderKey(regent.id)];
    assert.ok(order, 'the score holds the boss order');
    assert.equal(order.scoreOwnsAttacks, true);
    assert.equal(order.suppressStockFire, true);
    // The record stays live while the run does — the score, not the cohort owner, steps it.
    h.tick(120);
    assert.equal(h.state.capitalBossEncounters.fights[starts[0].payload.fightId], fight);
  } finally {
    h.close();
  }
});
