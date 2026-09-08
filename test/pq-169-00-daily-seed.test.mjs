// PQ-169.00 — Daily seed and local board.
//
// Seed 16900. Two machines on the same UTC calendar day must hash to the same
// Crucible run seed. A daily settle must survive load + a second storage JSON.
// The sim never reads wall clock; the date key is calendar input, not Date.now().
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CRUCIBLE_META_STORAGE_KEY,
  dailySeedForDateKey,
  dailySeedForNow,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  settleCrucibleRun,
  utcDateKeyFromIso,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { clearQueuedChallenge } from '../src/systems/survivalMutators.js';
import { todayBoardFigures } from '../src/ui/screens/crucible.js';

const SEED = 16900;
const DATE_A = '2026-09-06';
const DATE_B = '2026-09-07';
const SEED_A = 1537801443;
const SEED_B = 1521023824;

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
    _map: map,
  };
}

function resetMeta() {
  resetCrucibleMetaForTests();
  clearQueuedChallenge();
}

function dailyResult(seed, dateKey, score, deepestWave) {
  return {
    outcome: 'defeat',
    seed,
    arenaId: 'helios_core',
    wave: deepestWave,
    deepestWave,
    wavesCleared: deepestWave,
    kills: 10,
    score,
    credits: 0,
    xp: 0,
    picks: [],
    dailyDateKey: dateKey,
  };
}

function dailyRun(seed, dateKey) {
  return {
    kind: 'survival',
    seed,
    arenaId: 'helios_core',
    ruleset: 'swarm',
    dailyDateKey: dateKey,
  };
}

test('two machines on the same UTC day get the same daily seed', () => {
  resetMeta();
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  assert.notEqual(storageA._map, storageB._map);

  useCrucibleMetaStorage(storageA);
  useCrucibleMetaClock(() => `${DATE_A}T23:59:59.000Z`);
  const seedLate = dailySeedForNow();

  useCrucibleMetaStorage(storageB);
  useCrucibleMetaClock(() => `${DATE_A}T00:00:00.000Z`);
  const seedEarly = dailySeedForNow();

  assert.equal(utcDateKeyFromIso(`${DATE_A}T23:59:59.000Z`), DATE_A);
  assert.equal(utcDateKeyFromIso(`${DATE_A}T00:00:00.000Z`), DATE_A);
  assert.equal(seedLate, seedEarly);
  assert.equal(seedLate, dailySeedForDateKey(DATE_A));
  assert.equal(seedLate, SEED_A);
  assert.equal(dailySeedForDateKey(DATE_B), SEED_B);
  assert.notEqual(seedLate, dailySeedForDateKey(DATE_B));
  assert.ok(seedLate >= 1 && seedLate <= 0xffffffff);

  console.log(`DATES_MATCH=1 DATE_A=${DATE_A} SEED_A=${seedLate} DATE_B=${DATE_B} SEED_B=${SEED_B}`);
});

test('daily board persists across save reload and a second storage JSON', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => `${DATE_A}T12:00:00.000Z`);
  const seed = dailySeedForDateKey(DATE_A);
  assert.equal(seed, SEED_A);

  settleCrucibleRun({
    result: dailyResult(seed, DATE_A, SEED, 12),
    run: dailyRun(seed, DATE_A),
    storage,
  });

  const reloaded = loadCrucibleMeta(storage);
  const row = reloaded.daily.byDate[DATE_A];
  assert.ok(row);
  assert.equal(row.bestScore, SEED);
  assert.equal(row.deepestWave, 12);
  assert.equal(row.seed, seed);
  assert.equal(row.attempts, 1);

  const json = storage.getItem(CRUCIBLE_META_STORAGE_KEY);
  assert.ok(json);
  const independent = memoryStorage();
  independent.setItem(CRUCIBLE_META_STORAGE_KEY, json);
  const otherMachine = loadCrucibleMeta(independent);
  assert.equal(otherMachine.daily.byDate[DATE_A].bestScore, SEED);
  assert.equal(otherMachine.daily.byDate[DATE_A].seed, seed);

  const today = todayBoardFigures(otherMachine, DATE_A);
  assert.ok(today);
  assert.equal(today.label, 'Today');
  assert.equal(today.score, SEED);
  assert.equal(today.wave, 12);

  console.log(`BOARD_PERSIST=1 SCORE=${SEED} WAVE=12 SEED=${seed}`);
});

test('a free run on seed 16900 does not write today\'s daily board', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => `${DATE_A}T12:00:00.000Z`);
  settleCrucibleRun({
    result: dailyResult(SEED, null, SEED, 4),
    run: { kind: 'survival', seed: SEED, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
  const profile = loadCrucibleMeta(storage);
  assert.deepEqual(profile.daily.byDate, {});
  assert.equal(todayBoardFigures(profile, DATE_A), null);
  assert.equal(profile.history.length, 1);
  assert.equal(profile.history[0].seed, SEED);
});
