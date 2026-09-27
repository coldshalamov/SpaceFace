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
  WAVE_30_SYSTEM_EVENT,
  bodyCount,
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
  assert.equal(eliteOf(finale).enemyId, WAVE_30_FINALE_ENEMY_ID);
  assert.equal(eliteOf(finale).count, 1);
  // The crown is a rewrite of the authored slot, not an added body: same body count and caps.
  assert.equal(bodyCount(finale.packages), bodyCount(ten.packages));
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
