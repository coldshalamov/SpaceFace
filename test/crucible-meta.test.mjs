// PQ-133.10a — unlock catalog, local records, challenge mutators, one-hull / one-weapon trials.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { CURRENT_VERSION } from '../src/data/saveVersion.js';
import { SURVIVAL_ARC_LENGTH } from '../src/data/survivalActs.js';
import {
  SURVIVAL_STARTER_DPS,
  SURVIVAL_STARTERS,
  SURVIVAL_UNLOCK_CATALOG,
  ZERO_POWER,
} from '../src/data/survivalUnlocks.js';
import { offerDraft } from '../src/data/survivalDraft.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import {
  applyWeaponsColdLoadout,
  clearQueuedChallenge,
  compileChallenge,
  consumeQueuedWeeklyMutatorId,
  foldMutatorsIntoSeed,
  lastQueuedDailyDateKey,
  lastQueuedGhostHash,
  lastQueuedWeeklyMutatorId,
  normalizeMutators,
  offerDraftForChallenge,
  peekQueuedChallenge,
  queueGhostPlayback,
  queueSurvivalChallenge,
  weeklyTelemetry,
} from '../src/systems/survivalMutators.js';
import {
  availableOptions,
  buildPowerView,
  evaluateUnlocks,
  fullyUnlockedProfile,
  sumProfilePower,
  validateUnlockCatalog,
} from '../src/systems/survivalUnlocks.js';
import {
  CRUCIBLE_HISTORY_LIMIT,
  CRUCIBLE_META_FMT,
  CRUCIBLE_META_STORAGE_KEY,
  canonicalGhostTape,
  compactRunResult,
  dailySeedForDateKey,
  dailySeedForNow,
  emptyCrucibleProfile,
  getGhostPlaybackTape,
  ghostHash,
  ghostPlaybackContract,
  ghostPoseAt,
  loadCrucibleMeta,
  parseCrucibleMeta,
  peekGhostTape,
  recordKey,
  resetCrucibleMetaForTests,
  restorePlayerFromSaveBlob,
  sampleGhostPose,
  saveCrucibleMeta,
  settleCrucibleRun,
  beginGhostRecording,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
  utcDateKeyFromIso,
  utcWeekKeyFromIso,
  utcWeekKeyNow,
  weeklyMutatorForNow,
  weeklyMutatorForWeekKey,
} from '../src/systems/survivalRecords.js';
import { CRUCIBLE_WEEKLY_ROTATION } from '../src/data/survivalMutators.js';

const SEED = 47;
const ARENA = 'helios_core';
const DT = 1 / 60;
const BUILD = Object.freeze({
  hullId: 'ship_kestrel',
  fittings: Object.freeze(['wpn_pulse_laser_s', 'mod_mining_laser_s', 'mod_engine_ion_m', 'mod_shield_booster_s']),
});

function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
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
  useCrucibleMetaClock(() => '2026-08-23T00:00:00.000Z');
}

function resultFixture(overrides = {}) {
  return {
    outcome: 'defeat',
    seed: SEED,
    arenaId: ARENA,
    wave: 10,
    deepestWave: 10,
    wavesCleared: 10,
    kills: 12,
    score: 400,
    credits: 80,
    xp: 200,
    picks: [],
    ...overrides,
  };
}

function runFixture(overrides = {}) {
  const state = createGameState(SEED);
  state.run.kind = 'survival';
  state.run.phase = 'ended';
  state.run.seed = SEED;
  state.run.arenaId = ARENA;
  state.run.ruleset = 'scored';
  state.run.wave = 10;
  Object.assign(state.run, overrides);
  return state.run;
}

test('the catalog is possibility-only: every power axis is zero and nothing self-grants', () => {
  const checked = validateUnlockCatalog();
  assert.equal(checked.ok, true, checked.issues.join('; '));
  for (const entry of SURVIVAL_UNLOCK_CATALOG) {
    assert.deepEqual(entry.power, ZERO_POWER, entry.id);
    if (entry.defaultUnlocked) assert.equal(entry.earn, null, entry.id);
    else assert.ok(entry.earn && entry.earn.kind, entry.id);
  }
});

test('fresh account remains viable: same build, identical power, smaller option set', () => {
  const fresh = emptyCrucibleProfile();
  const full = fullyUnlockedProfile();
  const freshPower = sumProfilePower(fresh);
  const fullPower = sumProfilePower(full);
  const freshView = buildPowerView(BUILD, fresh);
  const fullView = buildPowerView(BUILD, full);

  assert.deepEqual(freshPower, { ...ZERO_POWER });
  assert.deepEqual(fullPower, { ...ZERO_POWER });
  assert.deepEqual(freshPower, fullPower);
  assert.deepEqual(freshView.profilePower, fullView.profilePower);
  assert.deepEqual(freshView.fittings, fullView.fittings);
  assert.equal(freshView.hullId, fullView.hullId);

  const freshOpts = availableOptions(fresh);
  const fullOpts = availableOptions(full);
  assert.deepEqual(freshOpts.starters, ['starter_hitch_pulse']);
  assert.equal(freshOpts.mutators.length, 0);
  assert.equal(freshOpts.trials.length, 0);
  assert.ok(fullOpts.starters.length > freshOpts.starters.length);
  assert.ok(fullOpts.mutators.length > 0);
  assert.ok(fullOpts.trials.includes('trial_one_hull'));
  assert.ok(fullOpts.trials.includes('trial_one_weapon'));
  assert.ok(fullOpts.size > freshOpts.size);
});

test('unlockable Hitch starters never exceed the public Pulse Laser S damage rate', () => {
  const pulse = SURVIVAL_STARTER_DPS.wpn_pulse_laser_s;
  assert.equal(pulse, 44);
  for (const starter of SURVIVAL_STARTERS) {
    const dps = SURVIVAL_STARTER_DPS[starter.weaponId];
    assert.ok(Number.isFinite(dps), starter.id);
    assert.ok(dps <= pulse, `${starter.id} dps ${dps} > public kit ${pulse}`);
    assert.equal(starter.hullId, 'ship_kestrel');
  }
});

test('loading a profile grants nothing; earning requires the stated condition', () => {
  const fresh = emptyCrucibleProfile();
  const loaded = evaluateUnlocks(fresh, null);
  assert.deepEqual(loaded.newly, []);
  assert.deepEqual(Object.keys(loaded.unlocks), []);

  const fakeTenVictory = evaluateUnlocks(fresh, resultFixture({
    outcome: 'victory', wave: 10, deepestWave: 10, wavesCleared: 0,
  }));
  assert.equal(fakeTenVictory.newly.includes('unlock_mutator_draftless'), false);

  const clearedTen = evaluateUnlocks(fresh, resultFixture({
    outcome: 'defeat', wavesCleared: 10, picks: [{ verb: 'Tag', defId: 'wpn_gravity_marker_s', wave: 4 }],
  }));
  assert.ok(clearedTen.newly.includes('unlock_starter_tag'));
  assert.ok(clearedTen.newly.includes('unlock_trial_one_hull'));
  assert.ok(clearedTen.newly.includes('unlock_trial_one_weapon'));
  assert.equal(clearedTen.newly.includes('unlock_mutator_draftless'), false);

  const authored = evaluateUnlocks(fresh, resultFixture({
    outcome: 'victory',
    wave: SURVIVAL_ARC_LENGTH,
    deepestWave: SURVIVAL_ARC_LENGTH,
    wavesCleared: SURVIVAL_ARC_LENGTH,
    picks: [{ verb: 'Bind', defId: 'wpn_momentum_sink_s', wave: 6 }],
  }));
  assert.ok(authored.newly.includes('unlock_mutator_draftless'));
  assert.ok(authored.newly.includes('unlock_mutator_physics_only'));
  assert.ok(authored.newly.includes('unlock_mark_foundry'));
});

test('a mutator is deterministic: same seed and mutator set, run twice, identical result', () => {
  const mutators = ['shutter_alternating', 'draftless'];
  const a = compileChallenge(SEED, mutators, 'scored');
  const b = compileChallenge(SEED, mutators, 'scored');
  assert.deepEqual(a, b);
  assert.equal(foldMutatorsIntoSeed(SEED, mutators), foldMutatorsIntoSeed(SEED, ['draftless', 'shutter_alternating']));

  const planA = planWave({ seed: SEED, arenaId: ARENA, wave: 4, mutators: a.plannerMutators.slice() });
  const planB = planWave({ seed: SEED, arenaId: ARENA, wave: 4, mutators: b.plannerMutators.slice() });
  assert.notEqual(planA.ok, false, (planA.issues || []).map((row) => row.message).join('; '));
  assert.deepEqual(planA, planB);

  const planPlain = planWave({ seed: SEED, arenaId: ARENA, wave: 4, mutators: [] });
  assert.notEqual(planA.arenaPhase, planPlain.arenaPhase);

  const challenge = compileChallenge(SEED, ['physics_only'], 'scored');
  const draftInput = {
    seed: SEED, wave: 4, pickCount: 0, hullId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s', null, null, null, null, null],
  };
  const d1 = offerDraftForChallenge(draftInput, challenge);
  const d2 = offerDraftForChallenge(draftInput, challenge);
  assert.equal(d1.ok, true);
  assert.deepEqual(d1.offers, d2.offers);
  for (const offer of d1.offers) {
    assert.ok(['Throw', 'Tag', 'Bind', 'Mine', 'Unsteer'].includes(offer.verb));
  }

  const oneWeapon = compileChallenge(SEED, [], 'trial_one_weapon');
  assert.equal(oneWeapon.skipDraft, true);
  const locked = offerDraftForChallenge(draftInput, oneWeapon);
  assert.deepEqual(locked.offers, []);
  const open = offerDraft(draftInput);
  assert.ok(open.offers.length > 0);
});

test('one-hull trial locks Hitch and does not change planner rewards or body count', () => {
  const trial = compileChallenge(SEED, [], 'trial_one_hull');
  assert.equal(trial.hullLocked, true);
  assert.equal(trial.hullId, 'ship_kestrel');
  const withTrial = planWave({
    seed: SEED, arenaId: ARENA, wave: 7, mutators: trial.plannerMutators.slice(),
  });
  const without = planWave({ seed: SEED, arenaId: ARENA, wave: 7, mutators: [] });
  assert.deepEqual(withTrial.rewards, without.rewards);
  assert.deepEqual(withTrial.packages, without.packages);
});

test('save compatibility: a profile saved without this packet still loads, and our bag is not a save slot', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);

  const missing = loadCrucibleMeta(storage);
  assert.deepEqual(missing.unlocks, {});
  assert.equal(missing.history.length, 0);

  const state = createGameState(11);
  state.player.credits = 1800;
  const oldBlob = {
    credits: 900,
    heat: 0.2,
    ownedShips: [{ defId: 'ship_kestrel', fittings: ['wpn_pulse_laser_s'] }],
    stats: { kills: 3 },
  };
  restorePlayerFromSaveBlob(state.player, oldBlob);
  assert.equal(state.player.credits, 900);
  assert.equal(state.player.heat, 0.2);
  assert.ok(state.player.hints);
  assert.equal(state.player.hints.firstFlight, false);
  assert.equal(state.player.stats.kills, 3);
  assert.equal(state.player.stats.missionsDone, 0);
  assert.equal(Object.prototype.hasOwnProperty.call(state.player, 'crucible'), false);
  assert.equal(loadCrucibleMeta(storage).history.length, 0);

  const future = {
    fmt: CRUCIBLE_META_FMT,
    schemaVersion: 2,
    savedAt: '2026-08-23T00:00:00.000Z',
    data: {
      schemaVersion: 2,
      unlocks: { unlock_starter_tag: { condition: 'pick_and_waves', seed: 1, wavesCleared: 10, outcome: 'defeat' } },
      records: { byKey: {}, lifetime: { runs: 1, victories: 0, defeats: 1, aborted: 0, deepestWave: 10, bestScore: 10, bestKills: 2 } },
      history: [],
      futureField: { keep: true },
    },
  };
  storage.setItem(CRUCIBLE_META_STORAGE_KEY, JSON.stringify(future));
  const migrated = loadCrucibleMeta(storage);
  assert.ok(migrated.unlocks.unlock_starter_tag);
  assert.equal(migrated.futureField.keep, true);

  const pretendSlot = {
    fmt: CRUCIBLE_META_FMT,
    schemaVersion: 1,
    data: emptyCrucibleProfile(),
  };
  assert.notEqual(pretendSlot.fmt, 'spaceface-save');
  assert.equal(CURRENT_VERSION >= 1, true);
});

test('settlement writes local history and records without touching campaign credits', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const state = createGameState(SEED);
  const credits = state.player.credits;
  const run = runFixture();
  const first = settleCrucibleRun({
    result: resultFixture({
      picks: [{ verb: 'Tag', defId: 'wpn_gravity_marker_s', wave: 3 }],
    }),
    run,
    storage,
  });
  assert.ok(first.unlocksEarned.includes('unlock_starter_tag'));
  assert.equal(first.profile.history.length, 1);
  const key = recordKey(first.result);
  assert.equal(first.profile.records.byKey[key].attempts, 1);
  assert.equal(first.profile.records.lifetime.runs, 1);
  assert.equal(state.player.credits, credits);

  const second = settleCrucibleRun({
    result: resultFixture({
      picks: [{ verb: 'Tag', defId: 'wpn_gravity_marker_s', wave: 3 }],
    }),
    run,
    storage,
  });
  assert.deepEqual(second.unlocksEarned, []);
  assert.equal(second.profile.records.byKey[key].attempts, 2);
  assert.equal(loadCrucibleMeta(storage).history.length, 2);
});

test('run history is a bounded ring and compact results stay JSON', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const run = runFixture();
  for (let i = 0; i < CRUCIBLE_HISTORY_LIMIT + 5; i++) {
    settleCrucibleRun({
      result: resultFixture({ score: i, seed: SEED }),
      run,
      storage,
    });
  }
  const profile = loadCrucibleMeta(storage);
  assert.equal(profile.history.length, CRUCIBLE_HISTORY_LIMIT);
  assert.equal(profile.history[0].score, 5);
  const compact = compactRunResult(resultFixture(), run, []);
  assert.deepEqual(JSON.parse(JSON.stringify(compact)), compact);
});

test('draftless auto-resolves the draft phase without a pick', () => {
  resetMeta();
  queueSurvivalChallenge({ seed: SEED, mutators: ['draftless'] });
  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  assert.deepEqual(state.run.arenaMutators, ['draftless']);
  bus.emit('run:loadoutReady', {});
  survivalRun.update(DT);
  for (let i = 0; i < SURVIVAL_ARENA_INTRO_TICKS; i++) survivalRun.update(DT);
  for (let i = 0; i < SURVIVAL_WAVE_INTRO_TICKS; i++) survivalRun.update(DT);
  bus.emit(WAVE_CLEARED_SEAM, { wave: 1 });
  survivalRun.update(DT);
  for (let i = 0; i < 180; i++) survivalRun.update(DT);
  assert.equal(state.run.phase, 'draft');
  survivalRun.update(DT);
  assert.equal(state.run.phase, 'wave_intro');
  survivalRun.destroy();
  runSession.destroy();
});

test('results settlement is local and labels the challenge without changing score math', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const state = createGameState(SEED);
  const player = { id: 1, alive: true, pos: { x: 0, z: 0 }, type: 'ship' };
  state.entities.set(1, player);
  state.entityList.push(player);
  state.playerId = 1;
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
  survivalResults.init({ state, bus });
  queueSurvivalChallenge({ seed: SEED, mutators: ['shutter_alternating'], ruleset: 'trial_one_weapon' });
  bus.emit('run:beginRequested', {
    kind: 'survival', ruleset: 'trial_one_weapon', seed: SEED, arenaId: ARENA,
  });
  state.run.arenaMutators = ['one_weapon'];
  state.run.wave = SURVIVAL_ARC_LENGTH;
  state.run.score = 1200;
  for (let i = 0; i < SURVIVAL_ARC_LENGTH; i++) bus.emit('run:waveCleared', { wave: i + 1 });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 't', tick: 0,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 't', tick: 0,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'wave_intro', nextPhase: 'active', reason: 't', tick: 0,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'active', nextPhase: 'cleanup', reason: 't', tick: 0,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'cleanup', nextPhase: 'refit', reason: 't', tick: 0,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'refit', nextPhase: 'victory', reason: 'act_complete', tick: 0,
  });
  const ready = emitted.filter((row) => row.event === 'run:resultsReady');
  assert.equal(ready.length, 1);
  const result = ready[0].payload;
  assert.equal(result.score, 1200);
  assert.equal(result.ruleset, 'trial_one_weapon');
  assert.equal(result.trialId, 'trial_one_weapon');
  assert.ok(result.mutators.includes('one_weapon'));
  assert.ok(result.unlocksEarned.includes('unlock_mutator_draftless'));
  assert.equal(loadCrucibleMeta(storage).history.length, 1);
  survivalResults.destroy();
  runSession.destroy();
});

test('normalizeMutators is order-insensitive and drops junk', () => {
  assert.deepEqual(
    normalizeMutators(['draftless', 'one_hull', 'draftless', null, { id: 'physics_only' }]),
    ['draftless', 'one_hull', 'physics_only'],
  );
});

test('same UTC day, two clocks, two storages yield the same daily uint32 seed', () => {
  resetMeta();
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  assert.notEqual(storageA, storageB);
  assert.notEqual(storageA._map, storageB._map);

  useCrucibleMetaStorage(storageA);
  useCrucibleMetaClock(() => '2026-09-06T23:59:59.000Z');
  const keyLate = utcDateKeyFromIso('2026-09-06T23:59:59.000Z');
  const seedA = dailySeedForNow();

  useCrucibleMetaStorage(storageB);
  useCrucibleMetaClock(() => '2026-09-06T00:00:00.000Z');
  const keyEarly = utcDateKeyFromIso('2026-09-06T00:00:00.000Z');
  const seedB = dailySeedForNow();

  assert.equal(keyLate, '2026-09-06');
  assert.equal(keyEarly, '2026-09-06');
  assert.equal(seedA, seedB);
  assert.equal(seedA, dailySeedForDateKey('2026-09-06'));
  assert.equal(Number.isInteger(seedA), true);
  assert.ok(seedA >= 1 && seedA <= 0xffffffff);
  assert.equal(storageA.getItem(CRUCIBLE_META_STORAGE_KEY), null);
  assert.equal(storageB.getItem(CRUCIBLE_META_STORAGE_KEY), null);
  console.log(`SEED_TODAY_EXAMPLE: 2026-09-06 -> ${seedA}`);
});

test('next UTC day produces a different daily seed', () => {
  resetMeta();
  const sameDay = dailySeedForDateKey('2026-09-06');
  const nextDay = dailySeedForDateKey('2026-09-07');
  assert.notEqual(sameDay, nextDay);
  useCrucibleMetaClock(() => '2026-09-07T00:00:00.000Z');
  assert.equal(dailySeedForNow(), nextDay);
  assert.equal(utcDateKeyFromIso('2026-09-07T00:00:00.000Z'), '2026-09-07');
});

test('daily board persists across loadCrucibleMeta reload and a second storage JSON', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-06T12:00:00.000Z');
  const dateKey = '2026-09-06';
  const seed = dailySeedForDateKey(dateKey);
  const settled = settleCrucibleRun({
    result: resultFixture({ seed, score: 777, deepestWave: 12, dailyDateKey: dateKey }),
    run: runFixture({ seed, dailyDateKey: dateKey }),
    storage,
  });
  assert.equal(settled.result.dailyDateKey, dateKey);
  assert.equal(settled.profile.daily.byDate[dateKey].bestScore, 777);
  assert.equal(settled.profile.daily.byDate[dateKey].deepestWave, 12);
  assert.equal(settled.profile.daily.byDate[dateKey].seed, seed);

  const reloaded = loadCrucibleMeta(storage);
  const row = reloaded.daily.byDate[dateKey];
  assert.ok(row);
  assert.equal(row.bestScore, 777);
  assert.equal(row.deepestWave, 12);
  assert.equal(row.seed, seed);
  assert.equal(row.attempts, 1);

  const json = storage.getItem(CRUCIBLE_META_STORAGE_KEY);
  assert.ok(json);
  const independent = memoryStorage();
  independent.setItem(CRUCIBLE_META_STORAGE_KEY, json);
  const otherProcess = loadCrucibleMeta(independent);
  assert.equal(otherProcess.daily.byDate[dateKey].bestScore, 777);
  assert.equal(otherProcess.daily.byDate[dateKey].deepestWave, 12);
  assert.equal(otherProcess.daily.byDate[dateKey].seed, seed);
});

test('a non-daily run with a random seed does not write today\'s daily board', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-06T12:00:00.000Z');
  settleCrucibleRun({
    result: resultFixture({ seed: 99, score: 50, deepestWave: 4 }),
    run: runFixture({ seed: 99 }),
    storage,
  });
  const profile = loadCrucibleMeta(storage);
  assert.ok(profile.daily);
  assert.deepEqual(profile.daily.byDate, {});
  assert.equal(profile.history.length, 1);
});

test('migrateProfile of a v1 bag without daily still loads and saving round-trips the field', () => {
  resetMeta();
  const storage = memoryStorage();
  const v1 = {
    fmt: CRUCIBLE_META_FMT,
    schemaVersion: 1,
    savedAt: '2026-08-23T00:00:00.000Z',
    data: {
      schemaVersion: 1,
      unlocks: {},
      records: {
        byKey: {},
        lifetime: { runs: 0, victories: 0, defeats: 0, aborted: 0, deepestWave: 0, bestScore: 0, bestKills: 0 },
      },
      history: [],
    },
  };
  storage.setItem(CRUCIBLE_META_STORAGE_KEY, JSON.stringify(v1));
  const loaded = loadCrucibleMeta(storage);
  assert.ok(loaded.daily);
  assert.deepEqual(loaded.daily.byDate, {});
  assert.equal(loaded.schemaVersion, 1);
  saveCrucibleMeta(loaded, storage);
  const roundTrip = loadCrucibleMeta(storage);
  assert.ok(roundTrip.daily);
  assert.deepEqual(roundTrip.daily.byDate, {});
  assert.ok(roundTrip.ghosts);
  assert.deepEqual(roundTrip.ghosts.byHash, {});
  const envelope = JSON.parse(storage.getItem(CRUCIBLE_META_STORAGE_KEY));
  assert.ok(envelope.data.daily);
  assert.deepEqual(envelope.data.daily.byDate, {});
  assert.ok(envelope.data.ghosts);
  assert.deepEqual(envelope.data.ghosts.byHash, {});
});

test('queued dailyDateKey writes the board even when the run envelope has no extra field', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-06T12:00:00.000Z');
  const dateKey = '2026-09-06';
  const seed = dailySeedForDateKey(dateKey);
  queueSurvivalChallenge({ seed, ruleset: 'swarm', dailyDateKey: dateKey });
  settleCrucibleRun({
    result: resultFixture({ seed, score: 321, deepestWave: 8 }),
    run: runFixture({ seed }),
    storage,
  });
  const row = loadCrucibleMeta(storage).daily.byDate[dateKey];
  assert.equal(row.bestScore, 321);
  assert.equal(row.deepestWave, 8);
  assert.equal(row.seed, seed);
});

test('a later non-daily settle does not inherit a consumed daily stamp', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaClock(() => '2026-09-06T12:00:00.000Z');
  const dateKey = '2026-09-06';
  const seed = dailySeedForDateKey(dateKey);
  queueSurvivalChallenge({ seed, ruleset: 'swarm', dailyDateKey: dateKey });
  settleCrucibleRun({
    result: resultFixture({ seed, score: 10, deepestWave: 2 }),
    run: runFixture({ seed }),
    storage,
  });
  assert.equal(lastQueuedDailyDateKey(), null);
  assert.equal(loadCrucibleMeta(storage).daily.byDate[dateKey].attempts, 1);
  settleCrucibleRun({
    result: resultFixture({ seed: 99, score: 999, deepestWave: 20 }),
    run: runFixture({ seed: 99 }),
    storage,
  });
  const row = loadCrucibleMeta(storage).daily.byDate[dateKey];
  assert.equal(row.attempts, 1);
  assert.equal(row.bestScore, 10);
  assert.equal(row.deepestWave, 2);
});

function exampleGhostTape() {
  return canonicalGhostTape({
    v: 1,
    seed: SEED,
    hullId: 'ship_kestrel',
    frames: [
      { t: 0, x: 0, z: 0, r: 0 },
      { t: 6, x: 6, z: 0, r: 0.5 },
      { t: 12, x: 12, z: 3, r: 1 },
    ],
  });
}

test('same canonical tape, two storages yield the same ghost uint32 hash', () => {
  resetMeta();
  const json = JSON.stringify(exampleGhostTape());
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  assert.notEqual(storageA, storageB);
  assert.notEqual(storageA._map, storageB._map);

  const tapeA = canonicalGhostTape(JSON.parse(json));
  const tapeB = canonicalGhostTape(JSON.parse(json));
  const hashA = ghostHash(tapeA);
  const hashB = ghostHash(tapeB);
  assert.equal(hashA, hashB);
  assert.equal(Number.isInteger(hashA), true);
  assert.ok(hashA >= 0 && hashA <= 0xffffffff);
  assert.notEqual(tapeA.frames, tapeB.frames);
  console.log(`GHOST_HASH_EXAMPLE: kestrel 3-frame seed ${SEED} -> ${hashA}`);
});

test('changing one sample changes the ghost hash', () => {
  const tape = exampleGhostTape();
  const mutated = canonicalGhostTape({
    ...tape,
    frames: tape.frames.map((frame, i) => (i === 1 ? { ...frame, x: frame.x + 1 } : frame)),
  });
  assert.notEqual(ghostHash(tape), ghostHash(mutated));
});

test('ghostPoseAt hits a recorded sample and interpolates between samples', () => {
  const tape = exampleGhostTape();
  const atSix = ghostPoseAt(tape, 6);
  assert.equal(atSix.x, 6);
  assert.equal(atSix.z, 0);
  assert.equal(atSix.r, 0.5);
  const mid = ghostPoseAt(tape, 3);
  assert.equal(mid.x, 3);
  assert.equal(mid.z, 0);
  assert.ok(Math.abs(mid.r - 0.25) < 1e-9);
});

test('settle a recorded run persists ghosts.byHash across reload and a second storage JSON', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: SEED, hullId: 'ship_kestrel' });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0.5, seed: SEED, hullId: 'ship_kestrel' });
  sampleGhostPose({ tick: 12, x: 12, z: 3, r: 1, seed: SEED, hullId: 'ship_kestrel' });
  const expected = exampleGhostTape();
  const hash = ghostHash(expected);
  const settled = settleCrucibleRun({
    result: resultFixture(),
    run: runFixture({ seed: SEED }),
    storage,
  });
  assert.equal(settled.result.ghostHash, hash);
  const row = settled.profile.ghosts.byHash[String(hash)];
  assert.ok(row);
  assert.equal(row.hash, hash);
  assert.equal(row.frameCount, 3);
  assert.equal(row.seed, SEED);
  assert.equal(row.hullId, 'ship_kestrel');

  const reloaded = loadCrucibleMeta(storage);
  const loadedRow = reloaded.ghosts.byHash[String(hash)];
  assert.ok(loadedRow);
  assert.equal(loadedRow.hash, hash);
  assert.equal(loadedRow.frameCount, 3);
  assert.equal(ghostHash({
    v: 1,
    seed: loadedRow.seed,
    hullId: loadedRow.hullId,
    frames: loadedRow.frames,
  }), hash);

  const json = storage.getItem(CRUCIBLE_META_STORAGE_KEY);
  assert.ok(json);
  const independent = memoryStorage();
  independent.setItem(CRUCIBLE_META_STORAGE_KEY, json);
  const otherProcess = loadCrucibleMeta(independent);
  const otherRow = otherProcess.ghosts.byHash[String(hash)];
  assert.ok(otherRow);
  assert.equal(otherRow.hash, hash);
  assert.equal(otherRow.frameCount, 3);
  assert.equal(ghostHash({
    v: 1,
    seed: otherRow.seed,
    hullId: otherRow.hullId,
    frames: otherRow.frames,
  }), hash);
});

test('empty tape does not write a ghost row', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  beginGhostRecording({ seed: SEED, hullId: 'ship_kestrel' });
  settleCrucibleRun({
    result: resultFixture({ seed: 99, score: 50 }),
    run: runFixture({ seed: 99 }),
    storage,
  });
  const profile = loadCrucibleMeta(storage);
  assert.ok(profile.ghosts);
  assert.deepEqual(profile.ghosts.byHash, {});
  assert.equal(profile.ghosts.lastHash, null);
  assert.equal(profile.history.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(profile.history[0], 'ghostHash'), false);
});

test('ghost is pose playback, not a combatant: no Rapier, no weapons, no campaign credits', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  const state = createGameState(SEED);
  const credits = state.player.credits;
  const entityCount = state.entityList.length;
  sampleGhostPose({ tick: 0, x: 1, z: 2, r: 0.1, seed: SEED, hullId: 'ship_kestrel' });
  sampleGhostPose({ tick: 6, x: 4, z: 2, r: 0.2, seed: SEED, hullId: 'ship_kestrel' });
  const tape = peekGhostTape();
  const spec = ghostPlaybackContract(tape, 0);
  assert.equal(spec.kind, 'ghost');
  assert.equal(spec.hasRapierBody, false);
  assert.deepEqual(spec.weapons, []);
  assert.equal(spec.writesCampaignCredits, false);
  assert.equal(spec.isCombatant, false);
  assert.equal(spec.pose.x, 1);
  settleCrucibleRun({
    result: resultFixture({ credits: 999 }),
    run: runFixture(),
    storage,
  });
  assert.equal(state.player.credits, credits);
  assert.equal(state.entityList.length, entityCount);
  const profile = loadCrucibleMeta(storage);
  assert.ok(Object.keys(profile.ghosts.byHash).length === 1);
});

test('survivalRun samples the live player pose onto the ghost tape', () => {
  resetMeta();
  const state = createGameState(SEED);
  state.run.kind = 'survival';
  state.run.phase = 'active';
  state.run.seed = SEED;
  state.run.arenaId = ARENA;
  const player = {
    id: 1,
    alive: true,
    pos: { x: 0, z: 0 },
    rot: 0,
    type: 'ship',
    data: { defId: 'ship_kestrel' },
  };
  state.entities.set(1, player);
  state.entityList.push(player);
  state.playerId = 1;
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  survivalRun.init({ state, bus });
  bus.emit('run:started', { kind: 'survival', phase: 'active' });
  state.tick = 0;
  survivalRun.update(DT);
  player.pos.x = 6;
  player.rot = 0.25;
  state.tick = 6;
  survivalRun.update(DT);
  const tape = peekGhostTape();
  assert.ok(tape);
  assert.ok(tape.frames.length >= 2);
  assert.equal(tape.frames[0].x, 0);
  assert.equal(tape.frames[1].x, 6);
  assert.equal(tape.hullId, 'ship_kestrel');
  survivalRun.destroy();
});

test('queueGhostPlayback does not stamp mutators onto a later take', () => {
  resetMeta();
  queueGhostPlayback(42);
  assert.equal(lastQueuedGhostHash(), 42);
  assert.equal(lastQueuedDailyDateKey(), null);
  clearQueuedChallenge();
  assert.equal(lastQueuedGhostHash(), null);
});

test('a non-survival start does not arm leftover ghost playback', () => {
  resetMeta();
  const storage = memoryStorage();
  useCrucibleMetaStorage(storage);
  sampleGhostPose({ tick: 0, x: 0, z: 0, r: 0, seed: SEED, hullId: 'ship_kestrel' });
  sampleGhostPose({ tick: 6, x: 6, z: 0, r: 0.5, seed: SEED, hullId: 'ship_kestrel' });
  const settled = settleCrucibleRun({
    result: resultFixture(),
    run: runFixture({ seed: SEED }),
    storage,
  });
  const hash = settled.result.ghostHash;
  assert.ok(Number.isInteger(hash));
  queueGhostPlayback(hash);
  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  survivalRun.init({ state, bus });
  bus.emit('run:started', { kind: 'campaign' });
  assert.equal(getGhostPlaybackTape(), null);
  assert.equal(lastQueuedGhostHash(), hash);
  survivalRun.destroy();
});

test('same UTC week, two clocks, two storages yield the same weekly mutator id', () => {
  resetMeta();
  const storageA = memoryStorage();
  const storageB = memoryStorage();
  assert.notEqual(storageA, storageB);

  useCrucibleMetaStorage(storageA);
  useCrucibleMetaClock(() => '2026-08-31T00:00:00.000Z');
  const keyA = utcWeekKeyNow();
  const idA = weeklyMutatorForNow();

  useCrucibleMetaStorage(storageB);
  useCrucibleMetaClock(() => '2026-09-06T23:59:59.000Z');
  const keyB = utcWeekKeyNow();
  const idB = weeklyMutatorForNow();

  assert.equal(keyA, keyB);
  assert.equal(keyA, utcWeekKeyFromIso('2026-08-31T12:00:00.000Z'));
  assert.equal(idA, idB);
  assert.equal(idA, weeklyMutatorForWeekKey(keyA));
  assert.ok(CRUCIBLE_WEEKLY_ROTATION.includes(idA));
  console.log(`WEEKLY_EXAMPLE: ${keyA} -> ${idA}`);
});

test('four consecutive UTC weeks are a permutation of the four weekly mutators', () => {
  resetMeta();
  const starts = [
    '2026-08-31T12:00:00.000Z',
    '2026-09-07T12:00:00.000Z',
    '2026-09-14T12:00:00.000Z',
    '2026-09-21T12:00:00.000Z',
  ];
  const ids = [];
  for (const iso of starts) {
    useCrucibleMetaClock(() => iso);
    ids.push(weeklyMutatorForNow());
  }
  assert.equal(new Set(ids).size, 4);
  for (const id of CRUCIBLE_WEEKLY_ROTATION) {
    assert.equal(ids.filter((row) => row === id).length, 1, id);
  }
  console.log(`ROTATION: ${ids.join(', ')}`);
});

test('weeklyTelemetry on seed 47 wave 1: four mutators, four strategy signatures', () => {
  resetMeta();
  const before = compileChallenge(SEED, [], 'swarm');
  assert.equal(before.wellCount, 0);
  assert.equal(before.physicsOnly, false);
  assert.equal(before.reefLayoutId, null);
  assert.deepEqual(before.mutators, []);

  const rows = {};
  for (const id of CRUCIBLE_WEEKLY_ROTATION) {
    rows[id] = weeklyTelemetry(id, SEED, 1);
  }
  const slalom = rows.gravity_slalom;
  const heavies = rows.heavies_only;
  const cold = rows.weapons_cold;
  const reef = rows.reef;

  assert.equal(slalom.wellCount, 3);
  assert.equal(heavies.wellCount, 0);
  assert.ok(heavies.heavyCount > 0);
  assert.equal(heavies.fodder, 0);
  for (const role of heavies.roles) {
    assert.ok(role === 'anchor' || role === 'elite', role);
  }
  const heaviesPlan = planWave({
    seed: SEED, arenaId: ARENA, wave: 1, mutators: ['heavies_only'], ruleset: 'swarm',
  });
  assert.notEqual(heaviesPlan.ok, false);
  for (const pkg of heaviesPlan.packages) {
    assert.ok(pkg.role === 'anchor' || pkg.role === 'elite', pkg.role);
    assert.notEqual(pkg.role, 'mass');
    assert.notEqual(pkg.enemyId, 'wasp_swarmer');
  }

  assert.equal(cold.physicsOnly, true);
  assert.equal(cold.skipDraft, true);
  assert.equal(cold.weaponLock, 'starting');
  const coldChallenge = compileChallenge(SEED, ['weapons_cold'], 'swarm');
  const draftInput = {
    seed: SEED, wave: 1, pickCount: 0, hullId: 'ship_kestrel',
    fittings: ['wpn_pulse_laser_s', null, null, null, null, null],
  };
  assert.deepEqual(offerDraftForChallenge(draftInput, coldChallenge).offers, []);

  const coldLoadout = applyWeaponsColdLoadout([
    { slotIndex: 0, defId: 'wpn_concussion_cannon_m' },
    { slotIndex: 1, defId: 'wpn_gravity_marker_s' },
    { slotIndex: 7, defId: 'mod_elastic_whip_m' },
  ]);
  assert.deepEqual(coldLoadout.map((slot) => slot.defId), ['mod_elastic_whip_m']);

  assert.ok(reef.reefLayoutId);
  assert.notEqual(reef.reefLayoutId, 'helios_core');
  assert.notEqual(reef.arenaId === 'helios_core' && !reef.reefLayoutId, true);
  assert.equal(reef.reefLayoutId, 'crucible_reef');

  const signatures = CRUCIBLE_WEEKLY_ROTATION.map((id) => JSON.stringify({
    wellCount: rows[id].wellCount,
    heavyCount: rows[id].heavyCount,
    fodder: rows[id].fodder,
    physicsOnly: rows[id].physicsOnly,
    skipDraft: rows[id].skipDraft,
    weaponLock: rows[id].weaponLock,
    reefLayoutId: rows[id].reefLayoutId,
  }));
  assert.equal(new Set(signatures).size, 4);

  console.log(
    'TELEMETRY: '
    + `gravity_slalom wellCount=${slalom.wellCount}`
    + ` | heavies_only heavyCount=${heavies.heavyCount} fodder=${heavies.fodder}`
    + ` | weapons_cold physicsOnly=${cold.physicsOnly} skipDraft=${cold.skipDraft}`
    + ` | reef arena=${reef.reefLayoutId}`,
  );
});

test('a non-weekly Swarm/Gauntlet/Daily launch does not inherit this week\'s mutator', () => {
  resetMeta();
  useCrucibleMetaClock(() => '2026-09-06T12:00:00.000Z');
  const weekId = weeklyMutatorForNow();
  assert.ok(weekId);

  const swarm = compileChallenge(SEED, [], 'swarm');
  const gauntlet = compileChallenge(SEED, [], 'scored');
  assert.equal(swarm.mutators.includes(weekId), false);
  assert.equal(gauntlet.mutators.includes(weekId), false);
  assert.equal(swarm.wellCount, 0);
  assert.equal(gauntlet.wellCount, 0);

  queueSurvivalChallenge({ seed: SEED, ruleset: 'swarm', dailyDateKey: '2026-09-06' });
  const dailyQueued = peekQueuedChallenge();
  assert.equal(dailyQueued.weeklyMutatorId, undefined);
  assert.equal(dailyQueued.mutators.includes(weekId), false);
  assert.equal(lastQueuedWeeklyMutatorId(), null);
  clearQueuedChallenge();

  queueSurvivalChallenge({
    seed: SEED, ruleset: 'swarm', weeklyMutatorId: weekId,
  });
  assert.equal(lastQueuedWeeklyMutatorId(), weekId);
  assert.ok(peekQueuedChallenge().mutators.includes(weekId));

  const state = createGameState(SEED);
  const raw = createBus();
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit: raw.emit.bind(raw),
  };
  runSession.init({ state, bus });
  survivalRun.init({ state, bus });
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: SEED, arenaId: ARENA });
  assert.ok(state.run.arenaMutators.includes(weekId));
  assert.equal(lastQueuedWeeklyMutatorId(), null);
  consumeQueuedWeeklyMutatorId();

  const laterFree = compileChallenge(SEED, [], 'swarm');
  assert.equal(laterFree.mutators.includes(weekId), false);
  queueSurvivalChallenge({ seed: SEED, ruleset: 'swarm' });
  assert.equal(lastQueuedWeeklyMutatorId(), null);
  assert.equal(peekQueuedChallenge().mutators.includes(weekId), false);

  survivalRun.destroy();
  runSession.destroy();
});
