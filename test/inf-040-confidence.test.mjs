// INF-040 — confidence as calibration, never as currency.
//
// A per-run estimate moves with one fixed rule (prior plus cleared waves, capped) and is
// read back on the review surface as advice. Nothing spends, stakes, or multiplies it:
// identical play histories produce identical sequences, and repeated destructive
// overconfidence answers with assisted flight, not a wager.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isDestructiveOverconfidence,
  overconfidenceStreak,
  OVERCONFIDENCE_STREAK_AT,
  resetCrucibleMetaForTests,
  runConfidenceFor,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';
import { confidenceLine } from '../src/ui/screens/crucible.js';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function boot() {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-08T12:00:00.000Z');
  useCrucibleMetaStorage(storage);
  return storage;
}

let seed = 40040;
function settleDefeat(storage, wavesCleared) {
  seed += 1;
  return settleCrucibleRun({
    result: {
      outcome: 'defeat', seed, arenaId: 'helios_core', wave: wavesCleared + 1,
      deepestWave: wavesCleared + 1, wavesCleared, kills: 6, score: 900, credits: 120, xp: 0, picks: [],
    },
    run: { kind: 'survival', seed, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
}

test('INF-040: one fixed rule — prior plus cleared waves, capped', () => {
  assert.equal(runConfidenceFor(0), 0.5);
  assert.equal(runConfidenceFor(null), 0.5);
  assert.equal(runConfidenceFor(3), 0.8);
  assert.equal(runConfidenceFor(10), 0.9);
  assert.equal(runConfidenceFor(400), 0.9);
});

test('INF-040: identical play histories produce identical confidence sequences', () => {
  const history = [0, 1, 2, 3, 4, 5];
  const first = history.map(runConfidenceFor);
  const second = history.map(runConfidenceFor);
  assert.deepEqual(first, second);
  assert.deepEqual(first, [0.5, 0.6, 0.7, 0.8, 0.9, 0.9]);
  for (let i = 1; i < first.length; i++) assert.ok(first[i] >= first[i - 1], 'monotone, never a trapdoor');
});

test('INF-040: confidence never touches rewards — no spend, stake, or multiplier', () => {
  const storage = boot();
  const low = settleCrucibleRun({
    result: {
      outcome: 'defeat', seed: 40101, arenaId: 'helios_core', wave: 1, deepestWave: 1,
      wavesCleared: 0, kills: 6, score: 900, credits: 120, xp: 0, picks: [],
    },
    run: { kind: 'survival', seed: 40101, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
  const high = settleCrucibleRun({
    result: {
      outcome: 'defeat', seed: 40102, arenaId: 'helios_core', wave: 9, deepestWave: 9,
      wavesCleared: 8, kills: 6, score: 900, credits: 120, xp: 0, picks: [],
    },
    run: { kind: 'survival', seed: 40102, arenaId: 'helios_core', ruleset: 'swarm' },
    storage,
  });
  assert.equal(low.result.confidence, 0.5);
  assert.equal(high.result.confidence, 0.9);
  assert.equal(high.result.score, low.result.score, 'the estimate moves no score');
  assert.equal(high.result.credits, low.result.credits, 'the estimate moves no wallet');
  for (const key of Object.keys(high.result)) {
    assert.doesNotMatch(key, /wager|stake|bet|debt|multipl/i, 'no wagering vocabulary settles');
  }
});

test('INF-040: repeated destructive overconfidence streaks, then breaks cleanly', () => {
  const storage = boot();
  const first = settleDefeat(storage, 2);
  assert.equal(first.result.confidence, 0.7);
  assert.equal(first.result.overconfidenceStreak, 1);
  const second = settleDefeat(storage, 3);
  assert.equal(second.result.overconfidenceStreak, 2);
  assert.ok(second.result.overconfidenceStreak >= OVERCONFIDENCE_STREAK_AT);
  // A humble run breaks the streak; an extraction is not destruction.
  const humble = settleDefeat(storage, 0);
  assert.equal(humble.result.overconfidenceStreak, 0);
  assert.equal(isDestructiveOverconfidence({ outcome: 'extracted', confidence: 0.9 }), false);
  assert.equal(isDestructiveOverconfidence({ outcome: 'defeat', confidence: 0.6 }), false);
  assert.equal(overconfidenceStreak([]), 0);
  assert.equal(overconfidenceStreak(null), 0);
});

test('INF-040: the review surface reads the estimate back as advice', () => {
  assert.equal(
    confidenceLine({ confidence: 0.7, wave: 3, overconfidenceStreak: 0 }),
    'Confidence 0.70 — held to wave 3.',
  );
  const advised = confidenceLine({ confidence: 0.8, wave: 4, overconfidenceStreak: 2 });
  assert.match(advised, /assisted flight/, 'names a real assist');
  assert.match(advised, /Settings/, 'says where it lives');
  assert.doesNotMatch(advised, /wager|stake|bet/i, 'advice, not a market');
  assert.equal(confidenceLine({ wave: 3 }), null, 'older plates read as before');
  assert.equal(confidenceLine(null), null);
});
