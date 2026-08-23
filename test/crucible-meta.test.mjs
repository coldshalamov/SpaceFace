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
  clearQueuedChallenge,
  compileChallenge,
  foldMutatorsIntoSeed,
  normalizeMutators,
  offerDraftForChallenge,
  queueSurvivalChallenge,
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
  compactRunResult,
  emptyCrucibleProfile,
  loadCrucibleMeta,
  parseCrucibleMeta,
  recordKey,
  resetCrucibleMetaForTests,
  restorePlayerFromSaveBlob,
  saveCrucibleMeta,
  settleCrucibleRun,
  useCrucibleMetaClock,
  useCrucibleMetaStorage,
} from '../src/systems/survivalRecords.js';

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
