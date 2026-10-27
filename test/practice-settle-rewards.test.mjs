// RC-CRUCIBLE-DOOR (row 481) — the practice door's promise is "no records, no rewards,
// nothing carried back". Settlement used to bank the run's credits into the Hangar bounty
// and pay profile unlocks BEFORE anything read the practice flag; the receipt then printed
// a bank line over a drill. These pin the gate: a practice settle is an empty write
// everywhere rewards live, and the same facts played for real still pay.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { evaluateUnlocks } from '../src/systems/survivalUnlocks.js';
import {
  emptyCrucibleProfile,
  loadCrucibleMeta,
  resetCrucibleMetaForTests,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
  utcWeekKeyNow,
  weeklyMutatorForWeekKey,
} from '../src/systems/survivalRecords.js';

const SEED = 4242;
const ARENA = 'helios_core';

function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) { return map.has(key) ? map.get(key) : null; },
    setItem(key, value) { map.set(String(key), String(value)); },
    removeItem(key) { map.delete(key); },
  };
}

function resultFixture(overrides = {}) {
  return {
    ruleset: 'swarm',
    arenaId: ARENA,
    seed: SEED,
    outcome: 'defeat',
    wave: 10,
    startWave: 1,
    wavesCleared: 10,
    deepestWave: 10,
    credits: 100,
    kills: 12,
    score: 400,
    xp: 0,
    picks: [{ verb: 'Tag', defId: 'wpn_gravity_marker_s', wave: 3 }],
    runId: 'drill-run',
    endedAt: 't:1',
    ...overrides,
  };
}

function runFixture(overrides = {}) {
  return {
    kind: 'survival',
    ruleset: 'swarm',
    arenaId: ARENA,
    seed: SEED,
    wave: 10,
    arenaMutators: [],
    telemetry: {},
    ...overrides,
  };
}

test('a practice death banks nothing and spends no settle key — the same run played for real still pays', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  const drill = settleCrucibleRun({
    result: resultFixture({ runId: 'drill-vs-real' }),
    run: runFixture({ practice: true }),
    storage,
  });
  assert.equal(drill.result.bankedBounty, 0);
  assert.equal(drill.result.hangarBounty, 0);
  assert.equal(drill.result.recordRules.mode, 'practice');
  assert.equal(drill.profile.hangar.bounty, 0);
  assert.equal(drill.profile.hangar.settledKeys.includes('run:drill-vs-real'), false,
    'a drill must not burn the dedupe key — the run can still be played for real');
  assert.equal(loadCrucibleMeta(storage).hangar.bounty, 0, 'nothing persisted');

  const real = settleCrucibleRun({
    result: resultFixture({ runId: 'drill-vs-real' }),
    run: runFixture(),
    storage,
  });
  assert.equal(real.result.bankedBounty, 50, 'a death on the same run still banks half');
  assert.equal(real.profile.hangar.bounty, 50);
  assert.equal(real.profile.hangar.settledKeys.includes('run:drill-vs-real'), true);
});

test('a practice cash-out after a boss banks nothing — the full purse stays on the floor', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  const settled = settleCrucibleRun({
    result: resultFixture({ outcome: 'extracted', cashOut: true }),
    run: runFixture({ practice: true }),
    storage,
  });
  assert.equal(settled.result.bankedBounty, 0);
  assert.equal(settled.result.cashOut, false);
  assert.equal(settled.profile.hangar.bounty, 0);
  assert.deepEqual(settled.profile.hangar.settledKeys, []);
});

test('every shape the practice truth arrives in gates the bank', () => {
  resetCrucibleMetaForTests();
  for (const [label, result, run] of [
    ['run-side flag', resultFixture(), runFixture({ practice: true })],
    ['result-side flag', resultFixture({ practice: true }), runFixture()],
    ['stamped record mode', resultFixture({ recordRules: { mode: 'practice' } }), runFixture()],
    ['run-side stamped mode', resultFixture(), runFixture({ recordRules: { mode: 'practice' } })],
  ]) {
    const storage = memoryStorage();
    const settled = settleCrucibleRun({ result, run, storage });
    assert.equal(settled.result.bankedBounty, 0, label);
    assert.equal(settled.profile.hangar.bounty, 0, label);
    assert.equal(settled.result.recordRules.mode, 'practice', label);
  }
});

test('a practice clear earns no unlocks — the same facts played for real earn them', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();
  const drill = settleCrucibleRun({
    result: resultFixture(),
    run: runFixture({ practice: true }),
    storage,
  });
  assert.deepEqual(drill.unlocksEarned, []);
  assert.deepEqual(drill.result.unlocksEarned, []);
  assert.deepEqual(drill.profile.unlocks, {});

  const real = settleCrucibleRun({
    result: resultFixture({ runId: 'real-run' }),
    run: runFixture(),
    storage,
  });
  assert.ok(real.unlocksEarned.includes('unlock_kit_physics'));
  assert.ok(real.unlocksEarned.includes('unlock_boss_circuit'));
  assert.ok(Object.keys(real.profile.unlocks).length > 0);
});

test('evaluateUnlocks itself refuses a practice-flagged or practice-stamped result', () => {
  const fresh = emptyCrucibleProfile();
  const flagged = evaluateUnlocks(fresh, resultFixture({ practice: true }));
  assert.deepEqual(flagged.newly, []);
  assert.deepEqual(flagged.unlocks, {});
  const stamped = evaluateUnlocks(fresh, resultFixture({ recordRules: { mode: 'practice' } }));
  assert.deepEqual(stamped.newly, []);
  const real = evaluateUnlocks(fresh, resultFixture());
  assert.ok(real.newly.includes('unlock_kit_physics'), 'the evaluator still pays an honest run');
});

test('a practice run claims no challenge purse and files no daily board row', () => {
  resetCrucibleMetaForTests();
  useCrucibleMetaClock(() => '2026-10-01T12:00:00.000Z');
  try {
    const storage = memoryStorage();
    const weeklyId = weeklyMutatorForWeekKey(utcWeekKeyNow());
    assert.ok(weeklyId, 'the rotation names a mutator this week');
    const weeklyDrill = settleCrucibleRun({
      result: resultFixture({ mutators: [weeklyId], wavesCleared: 12, wave: 12 }),
      run: runFixture({ practice: true, arenaMutators: [weeklyId] }),
      storage,
    });
    assert.deepEqual(weeklyDrill.result.challengeRewards || [], [],
      'the weekly mutator under a drill pays no bounty');
    assert.equal(weeklyDrill.profile.hangar.bounty, 0);
    assert.deepEqual(weeklyDrill.profile.challenges.weekly, {});

    const dailyDrill = settleCrucibleRun({
      result: resultFixture({ dailyDateKey: '2026-10-01' }),
      run: runFixture({ practice: true, dailyDateKey: '2026-10-01' }),
      storage,
    });
    assert.deepEqual(dailyDrill.result.challengeRewards || [], [], 'a dated drill claims no purse');
    assert.deepEqual(dailyDrill.profile.daily.byDate, {},
      'a drill writes no standings on a real date');

    // The same stamps without the flag still pay — the gates are the flag, not the fields.
    const dailyReal = settleCrucibleRun({
      result: resultFixture({ dailyDateKey: '2026-10-01', wavesCleared: 7, wave: 7, runId: 'real-daily' }),
      run: runFixture({ dailyDateKey: '2026-10-01' }),
      storage,
    });
    assert.equal(dailyReal.result.challengeRewards.length, 1);
    assert.equal(dailyReal.result.challengeRewards[0].bounty, 150);
    assert.equal(dailyReal.profile.daily.byDate['2026-10-01'].attempts, 1);
    const weeklyReal = settleCrucibleRun({
      result: resultFixture({ mutators: [weeklyId], wavesCleared: 12, wave: 12, runId: 'real-weekly' }),
      run: runFixture({ arenaMutators: [weeklyId] }),
      storage,
    });
    assert.equal(weeklyReal.result.challengeRewards.length, 1);
    assert.equal(weeklyReal.result.challengeRewards[0].kind, 'weekly');
    assert.equal(weeklyReal.profile.hangar.bounty, 50 + 150 + 50 + 300,
      'the two honest runs banked half each plus both claimed purses');
  } finally {
    useCrucibleMetaClock(null);
  }
});

/* ---- the receipt ---------------------------------------------------------- */

const DEFEAT_RECEIPT = Object.freeze({
  attacker: 'Reaver Corsair',
  faction: 'Crimson Reach',
  weapon: 'Heavy Autocannon M',
  direction: 'behind',
  dominantLayer: 'hull',
  cause: 'Destroyed by Reaver Corsair',
  fatalSummary: 'Autocannon burst through the hull',
  vitalsPct: { shield: 0, armor: 0, hull: 0 },
});

function boot(storage) {
  useCrucibleMetaStorage(storage);
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
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.nextEntityId = 2;
  runSession.init({ state, bus, helpers: {} });
  survivalResults.init({ state, bus, helpers: {} });
  return { state, bus, emitted };
}

function beginActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  let from = 'loadout';
  for (const next of ['arena_intro', 'wave_intro', 'active']) {
    harness.bus.emit('run:transitionRequested', { expectedPhase: from, nextPhase: next, reason: 't', tick: 0 });
    from = next;
  }
}

test('the practice receipt names the drill instead of printing a bank line', () => {
  resetCrucibleMetaForTests();
  const storage = memoryStorage();

  const drill = boot(storage);
  beginActive(drill);
  drill.state.run.practice = true;
  drill.bus.emit('run:awardRequested', { credits: 40, xp: 260, score: 900 });
  drill.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  const drillResult = drill.emitted.filter((e) => e.event === 'run:resultsReady')[0].payload;
  assert.equal(drillResult.bankedBounty, 0);
  assert.deepEqual(drillResult.unlocksEarned, []);
  assert.equal(drillResult.bankLine, 'A drill — nothing carries back to the hangar.');
  assert.equal(loadCrucibleMeta(storage).hangar.bounty, 0, 'the drill settled nothing');

  const real = boot(storage);
  beginActive(real);
  real.bus.emit('run:awardRequested', { credits: 40, xp: 260, score: 900 });
  real.bus.emit('player:death', { ...DEFEAT_RECEIPT });
  const realResult = real.emitted.filter((e) => e.event === 'run:resultsReady')[0].payload;
  assert.equal(realResult.bankedBounty, 20);
  assert.match(realResult.bankLine, /hangar banked 20/);
  assert.equal(loadCrucibleMeta(storage).hangar.bounty, 20, 'the honest run still banks');
});
