// PQ-133.10b — deterministic endless, boss circuit, extraction, versioned build codes.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  COMBAT_LAB_BUILD_CODE_VERSION,
  COMBAT_LAB_CONTENT_DIGEST,
  COMBAT_LAB_KNOWN_PRIOR_DIGESTS,
  decodeCombatLabBuildCode,
  encodeCombatLabBuildCode,
  inspectCombatLabBuildCode,
} from '../src/contracts/combatLabBuildCode.js';
import { COMBAT_LAB_SETUP_SCHEMA, normalizeCombatLabSetup } from '../src/contracts/combatLabSetupSchema.js';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  COMBAT_LAB_ARENAS,
  COMBAT_LAB_ENEMY_PACKAGES,
  COMBAT_LAB_STARTER_PACKAGES,
} from '../src/data/combatLabSetups.js';
import { SPAWN_BUDGET_DEFAULT_MAX } from '../src/data/survivalActs.js';
import {
  SURVIVAL_POWER_AXES,
  SURVIVAL_STARTER_DPS,
  SURVIVAL_UNLOCK_CATALOG,
  ZERO_POWER,
} from '../src/data/survivalUnlocks.js';
import {
  SURVIVAL_BOSS_CIRCUIT,
  SURVIVAL_BOSS_CIRCUIT_LENGTH,
  SURVIVAL_LIVE_CIRCUIT_ARENAS,
  isExtractionWindow,
  peakConcurrentDemand,
} from '../src/data/survivalWaves.js';
import { runSession } from '../src/systems/runSession.js';
import { circuitStepForWave, isBossCircuitRuleset } from '../src/systems/survivalCircuit.js';
import { continueSurvivalEndless, isEndlessRuleset } from '../src/systems/survivalEndless.js';
import { canExtract, requestSurvivalExtraction } from '../src/systems/survivalExtraction.js';
import { emptyCrucibleProfile } from '../src/systems/survivalRecords.js';
import { outcomeSentence, survivalResults } from '../src/systems/survivalResults.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_CLEANUP_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import {
  emptyPower,
  fullyUnlockedProfile,
  sumProfilePower,
  validateUnlockCatalog,
} from '../src/systems/survivalUnlocks.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 47;
const ARENA = 'helios_core';
const ENDLESS_WAVES = [31, 60, 120, 300];
const DT = 1 / 60;

function isPlan(value) {
  return value && value.ok !== false && Array.isArray(value.packages);
}

function fightLine(plan) {
  return (plan.packages || []).map((pkg) => (
    `${pkg.role}:${pkg.enemyId}x${pkg.count}@${pkg.gateGroup}`
  )).join(', ');
}

function fnv1aU32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function base36u32(n, width = 7) {
  return (n >>> 0).toString(36).toUpperCase().padStart(width, '0');
}

function stripCode(code) {
  return String(code).replace(/[\s-]/g, '').toUpperCase();
}

function groupCode(raw) {
  const prefix = raw.slice(0, 5);
  const rest = raw.slice(5);
  const parts = [prefix];
  for (let i = 0; i < rest.length; i += 4) parts.push(rest.slice(i, i + 4));
  return parts.join('-');
}

function wrapPayload(digest, payload) {
  return groupCode(
    `SFCR${COMBAT_LAB_BUILD_CODE_VERSION}` + digest + payload + base36u32(fnv1aU32(payload)),
  );
}

test('default wave 31 still fails; endless is opt-in', () => {
  const denied = planWave({ seed: SEED, arenaId: ARENA, wave: 31 });
  assert.equal(denied.ok, false);
  assert.ok((denied.issues || []).some((issue) => issue.path === 'wave'));

  const allowed = planWave({ seed: SEED, arenaId: ARENA, wave: 31, mode: 'endless' });
  assert.ok(isPlan(allowed));
  assert.equal(allowed.mode, 'endless');
});

test('endless waves 31 / 60 / 120 / 300 are deterministic and stay under the spawn cap', () => {
  for (const wave of ENDLESS_WAVES) {
    const a = planWave({ seed: SEED, arenaId: ARENA, wave, mode: 'endless' });
    const b = planWave({ seed: SEED, arenaId: ARENA, wave, mode: 'endless' });
    assert.ok(isPlan(a), `wave ${wave} must plan`);
    assert.deepEqual(a, b, `wave ${wave} must replay identically`);
    const peak = peakConcurrentDemand(a.packages);
    assert.ok(peak <= SPAWN_BUDGET_DEFAULT_MAX, `wave ${wave} peak ${peak} > 24`);
    assert.ok(peak <= 24);
    assert.ok(a.packages.length > 0);
    assert.ok(fightLine(a).length > 0);
  }

  const lines = ENDLESS_WAVES.map((wave) => {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, mode: 'endless' });
    return fightLine(plan);
  });
  assert.notEqual(lines[0], lines[1], 'wave 31 and 60 must not be the same fight');
  assert.notEqual(lines[1], lines[2], 'wave 60 and 120 must not be the same fight');
});

test('boss circuit is five authored bosses with compressed refits', () => {
  assert.equal(SURVIVAL_BOSS_CIRCUIT_LENGTH, 5);
  assert.equal(SURVIVAL_LIVE_CIRCUIT_ARENAS.length, 5);
  assert.equal(isBossCircuitRuleset('boss_circuit'), true);
  assert.equal(isBossCircuitRuleset('scored'), false);

  for (let wave = 1; wave <= 5; wave++) {
    const step = circuitStepForWave(wave);
    assert.ok(step);
    assert.equal(step.arenaId, SURVIVAL_BOSS_CIRCUIT[wave - 1].arenaId);
    const plan = planWave({
      seed: SEED,
      arenaId: ARENA,
      wave,
      mode: 'boss_circuit',
    });
    assert.ok(isPlan(plan), `circuit step ${wave}`);
    assert.equal(plan.mode, 'boss_circuit');
    assert.equal(plan.draftExpectation.kind, 'refit');
    assert.equal(plan.draftExpectation.choices, null);
    const peak = peakConcurrentDemand(plan.packages);
    assert.ok(peak <= 24, `circuit ${wave} peak ${peak}`);
    assert.ok(plan.packages.some((pkg) => pkg.enemyId === 'dreadnought_boss'));
  }

  const missing = planWave({ seed: SEED, arenaId: ARENA, wave: 6, mode: 'boss_circuit' });
  assert.equal(missing.ok, false);
});

test('extraction is a cash-out at ten-wave boundaries, not a victory', () => {
  assert.equal(isExtractionWindow(10), true);
  assert.equal(isExtractionWindow(20), true);
  assert.equal(isExtractionWindow(30), true);
  assert.equal(isExtractionWindow(9), false);
  assert.equal(isExtractionWindow(31), false);
  assert.equal(canExtract({ kind: 'survival', phase: 'refit', wave: 10 }), true);
  assert.equal(canExtract({ kind: 'survival', phase: 'active', wave: 10 }), false);
  assert.match(outcomeSentence('extracted', { wave: 10 }), /extracted/i);

  const state = createGameState(SEED);
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
  survivalResults.init({ state, bus });
  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed: SEED,
    arenaId: ARENA,
  });
  bus.emit('run:loadoutReady', {});
  survivalRun.update(DT);
  for (let i = 0; i < SURVIVAL_ARENA_INTRO_TICKS + 2; i++) survivalRun.update(DT);
  for (let wave = 1; wave <= 10; wave++) {
    for (let i = 0; i < SURVIVAL_WAVE_INTRO_TICKS + 2; i++) survivalRun.update(DT);
    bus.emit(WAVE_CLEARED_SEAM, { wave });
    survivalRun.update(DT);
    for (let i = 0; i < SURVIVAL_CLEANUP_TICKS + 2; i++) survivalRun.update(DT);
    if (wave === 10) break;
    bus.emit('run:draftResolved', {});
    survivalRun.update(DT);
  }
  assert.equal(state.run.wave, 10);
  assert.ok(state.run.phase === 'cleanup' || state.run.phase === 'refit');
  assert.equal(canExtract(state.run), true);
  requestSurvivalExtraction(bus);
  survivalRun.update(DT);
  const ended = emitted.filter((row) => row.event === 'run:ended');
  assert.ok(ended.length >= 1);
  assert.equal(ended[ended.length - 1].payload.reason, 'extracted');
  const ready = emitted.filter((row) => row.event === 'run:resultsReady');
  assert.ok(ready.length >= 1);
  const result = ready[ready.length - 1].payload;
  assert.equal(result.outcome, 'extracted');
  assert.equal(result.extracted, true);
  runSession.destroy();
  survivalRun.destroy();
  survivalResults.destroy();
});

test('endless continue stamps the existing ruleset field and does not add run keys', () => {
  const state = { run: { kind: 'survival', phase: 'refit', wave: 30, ruleset: 'scored' } };
  const keys = Object.keys(state.run).sort();
  assert.equal(continueSurvivalEndless(state), true);
  assert.equal(isEndlessRuleset(state.run.ruleset), true);
  assert.deepEqual(Object.keys(state.run).sort(), keys);
  assert.equal(continueSurvivalEndless({ run: { kind: 'survival', phase: 'active', wave: 30 } }), false);
});

test('versioned build codes name an earlier catalog and refuse to decode it', () => {
  const starter = COMBAT_LAB_STARTER_PACKAGES[0];
  const setup = {
    schema: COMBAT_LAB_SETUP_SCHEMA,
    hullId: starter.hullId,
    loadout: starter.loadout.map((entry) => ({ slotIndex: entry.slotIndex, defId: entry.defId })),
    enemyPackageId: COMBAT_LAB_ENEMY_PACKAGES[0].id,
    arenaId: COMBAT_LAB_ARENAS[0].id,
    seed: 47,
    wave: 1,
  };
  const live = encodeCombatLabBuildCode(setup);
  assert.equal(typeof live, 'string');
  const decoded = decodeCombatLabBuildCode(live);
  assert.equal(decoded.ok, true);
  assert.deepEqual(decoded.value, normalizeCombatLabSetup(setup));
  const liveInspect = inspectCombatLabBuildCode(live);
  assert.equal(liveInspect.ok, true);
  assert.equal(liveInspect.catalog, 'current');
  assert.equal(liveInspect.digest, COMBAT_LAB_CONTENT_DIGEST);

  const raw = stripCode(live);
  const payload = raw.slice(12, -7);
  const priorDigest = COMBAT_LAB_KNOWN_PRIOR_DIGESTS[0];
  assert.ok(priorDigest);
  assert.notEqual(priorDigest, COMBAT_LAB_CONTENT_DIGEST);
  const priorCode = wrapPayload(priorDigest, payload);
  const priorDecoded = decodeCombatLabBuildCode(priorCode);
  assert.equal(priorDecoded.ok, false);
  assert.equal(priorDecoded.value, null);
  const priorPaths = (priorDecoded.issues || []).map((issue) => issue.path);
  assert.ok(priorPaths.includes('contentDigest'));
  const priorMessage = (priorDecoded.issues || []).map((issue) => issue.message).join(' ');
  assert.match(priorMessage, /earlier catalog/i);

  const inspected = inspectCombatLabBuildCode(priorCode);
  assert.equal(inspected.ok, false);
  assert.equal(inspected.catalog, 'prior');
  assert.equal(inspected.digest, priorDigest);

  const garbage = decodeCombatLabBuildCode('not-a-build-code');
  assert.equal(garbage.ok, false);
  const garbagePaths = (garbage.issues || []).map((issue) => issue.path);
  assert.equal(garbagePaths.includes('contentDigest'), false);
});

test('a fresh account is still viable: power axes stay zero and Pulse still leads', () => {
  const checked = validateUnlockCatalog();
  assert.equal(checked.ok, true, (checked.issues || []).join('; '));
  for (const entry of SURVIVAL_UNLOCK_CATALOG) {
    assert.deepEqual(entry.power, ZERO_POWER, entry.id);
  }
  const fresh = sumProfilePower(emptyCrucibleProfile());
  const earned = sumProfilePower(fullyUnlockedProfile());
  const zeros = emptyPower();
  for (const axis of SURVIVAL_POWER_AXES) {
    assert.equal(fresh[axis], 0, axis);
    assert.equal(earned[axis], 0, axis);
    assert.equal(zeros[axis], 0, axis);
  }
  const pulse = SURVIVAL_STARTER_DPS.wpn_pulse_laser_s;
  assert.ok(pulse >= SURVIVAL_STARTER_DPS.wpn_flak_turret_s);
  assert.ok(pulse >= SURVIVAL_STARTER_DPS.wpn_autocannon_s);
  assert.ok(pulse >= SURVIVAL_STARTER_DPS.wpn_gravity_marker_s);
  assert.ok(pulse >= SURVIVAL_STARTER_DPS.wpn_momentum_sink_s);
});
