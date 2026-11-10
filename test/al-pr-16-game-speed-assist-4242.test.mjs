// AL-PR-16 — the game-speed assist is a settings-backed time-effects request: 10 s of wall
// clock advances 7 s of sim at 70%, and assisted Crucible runs are stamped so they can never
// file as comparable to a full-speed run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import {
  createTimeEffects,
  GAME_SPEED_STEPS,
  GAME_SPEED_TIME_SOURCE,
  normalizeGameSpeed,
  readTimeEffectsRequests,
} from '../src/core/timeEffects.js';
import { advanceFixedTimestep, LOOP_FIXED_DT } from '../src/core/simulationRunner.js';
import { bulletTime } from '../src/systems/bulletTime.js';
import { save } from '../src/save/saveSystem.js';
import { settingsScreen } from '../src/ui/screens/settings.js';
import { currentStuntRunRules } from '../src/combat/stuntRunRules.js';
import { survivalResults } from '../src/systems/survivalResults.js';
import { ghostComparability, recordRulesFor } from '../src/systems/survivalRecords.js';
import {
  PROFILE_SETTINGS_KEY,
  readProfileSettings,
  mergeProfileSettings,
} from '../src/core/graphicsProfileBootstrap.js';

const local = () => {
  const store = new Map();
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
};

function bootSpeed(speed) {
  const state = createGameState(4242);
  state.settings.gameplay.gameSpeed = speed;
  const bus = createBus();
  const effects = createTimeEffects(state);
  const bt = Object.create(bulletTime);
  bt.init({ state, bus, helpers: {}, registry: null, timeEffects: effects });
  return { state, bus, effects, bt };
}

function liveSurvivalState(speed) {
  const { state } = bootSpeed(speed);
  state.run = createRunState({ kind: 'survival', ruleset: 'arc', seed: 4242 });
  state.run.phase = 'active';
  state.run.arenaId = 'arena_pq146';
  state.run.wave = 1;
  return state;
}

test('10 s of wall clock advances sim in proportion to each game-speed step', () => {
  for (const speed of GAME_SPEED_STEPS) {
    const { state, effects, bt } = bootSpeed(speed);
    bt.update(LOOP_FIXED_DT, state);
    assert.equal(state.timeScale, speed, `speed ${speed} reconciles onto the {scale} channel`);
    assert.equal(effects.getEffectiveScale(), speed);

    let acc = 0;
    let steps = 0;
    for (let i = 0; i < 600; i++) {           // 600 frames x 1/60 s == exactly 10 s wall clock
      const res = advanceFixedTimestep(acc, LOOP_FIXED_DT, state.timeScale, (dt) => {
        assert.equal(dt, LOOP_FIXED_DT, 'the 60 Hz step never changes');
        steps++;
      });
      acc = res.accumulator;
    }
    assert.ok(Math.abs(steps - Math.round(600 * speed)) <= 1,
      `speed ${speed}: expected ~${Math.round(600 * speed)} steps, got ${steps}`);
  }
});

test('speed request min-wins with bullet-time/pause and clears on its own source', () => {
  const { state, effects, bt } = bootSpeed(0.7);
  bt.update(LOOP_FIXED_DT, state);
  assert.equal(state.timeScale, 0.7);

  effects.set('feel:hit-stop', { scale: 0.35 });
  assert.equal(state.timeScale, 0.35, 'a 0.35 hit-stop beats 0.7 without stacking');
  effects.clear('feel:hit-stop');
  assert.equal(state.timeScale, 0.7, 'clearing hit-stop restores the assist, never 1');

  effects.set('ui:pause', { scale: 0 });
  assert.equal(state.timeScale, 0, 'pause 0 beats every request');
  effects.clear('ui:pause');
  assert.equal(state.timeScale, 0.7);

  state.settings.gameplay.gameSpeed = 1;
  bt.update(LOOP_FIXED_DT, state);
  assert.equal(state.timeScale, 1, 'setting back to 100% releases the request');
  assert.equal(readTimeEffectsRequests(state)[GAME_SPEED_TIME_SOURCE], undefined);
});

test('a save restore reset drops every request and the very next update brings the speed back', () => {
  const { state, effects, bt } = bootSpeed(0.8);
  bt.update(LOOP_FIXED_DT, state);
  assert.equal(state.timeScale, 0.8);
  effects.reset();
  assert.equal(state.timeScale, 1, 'save restore clears all time-effects requests');
  bt.update(LOOP_FIXED_DT, state);
  assert.equal(state.timeScale, 0.8, 'the assist is re-requested without touching the setting');
});

test('normalizeGameSpeed admits only the four shipped steps', () => {
  for (const bad of [0, 1.5, '0.7', NaN, null, undefined, {}, [], -0.7, Infinity]) {
    assert.equal(normalizeGameSpeed(bad), 1, `normalizeGameSpeed(${String(bad)}) -> 1`);
  }
  for (const good of GAME_SPEED_STEPS) assert.equal(normalizeGameSpeed(good), good);
});

test('the profile round trip keeps 0.7 and a legacy profile restores 1', () => {
  const state = createGameState(4242);
  state.settings.gameplay.gameSpeed = 0.7;
  const storage = local();
  globalThis.localStorage = storage;
  const bus = createBus();
  save.init({ state, bus, helpers: {}, registry: { get: () => null } });
  bus.emit('settings:changed', { section: 'gameplay' });

  const stored = readProfileSettings(storage);
  assert.equal(stored.gameplay.gameSpeed, 0.7, 'profile snapshot carries the numeric speed');
  const merged = mergeProfileSettings(createGameState(4243).settings, stored);
  assert.equal(merged.gameplay.gameSpeed, 0.7);

  const legacyProfile = readProfileSettings(storage);
  delete legacyProfile.gameplay.gameSpeed;
  const mergedLegacy = mergeProfileSettings(createGameState(4243).settings, legacyProfile);
  assert.equal(mergedLegacy.gameplay.gameSpeed, 1, 'a profile without the key restores 100%');
  assert.equal(normalizeGameSpeed(legacyProfile.gameplay.gameSpeed), 1);
});

test('Gameplay page reset restores 100%', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const events = [];
  bus.on('settings:changed', (p) => events.push(p));
  const ctx = { state, bus };
  state.settings.gameplay.gameSpeed = 0.7;
  settingsScreen._resetPage(ctx, 'Gameplay');
  assert.equal(state.settings.gameplay.gameSpeed, 1);
});

test('the settings row writes a numeric speed and emits settings:changed', () => {
  const state = createGameState(4242);
  const bus = createBus();
  const events = [];
  bus.on('settings:changed', (p) => events.push(p));
  const ctx = { state, bus };

  assert.equal(GAME_SPEED_STEPS.length, 4, 'four shipped options 100/90/80/70');
  const src = readFileSync(fileURLToPath(new URL('../src/ui/screens/settings.js', import.meta.url)), 'utf8');
  const rowLine = src.split('\n').find((line) => line.includes("rowSelect('Game speed'"));
  assert.ok(rowLine, 'a Game speed row sits beside Stunt moments');
  assert.equal((rowLine.match(/\['0?\.\d'|\['1'/g) || []).length, 4, 'the row offers four options');

  settingsScreen._set(ctx, 'gameplay', 'gameSpeed', 0.7);
  assert.equal(state.settings.gameplay.gameSpeed, 0.7);
  assert.equal(typeof state.settings.gameplay.gameSpeed, 'number', 'stored as a number, not a string');
  const evt = events.find((e) => e.key === 'gameSpeed');
  assert.ok(evt, 'settings:changed emitted');
  assert.equal(evt.section, 'gameplay');
  assert.equal(evt.value, 0.7);
});

test('Crucible rules stamp the speed only when assisted and normalize to a record field', () => {
  const HEAD_UNASSISTED = {
    balanceRevision: 'pq146-threat-2',
    physicsRevision: 'rapier-dynamic-pq146-2',
    scoringRevision: '2',
    mode: 'arc',
    arenaId: 'arena_pq146',
    difficulty: 'authored',
    loadoutRules: '{"ruleset":"arc","mutators":[],"starter":null,"stake":null}',
    simulationAssistProfile: 'cinematic',
  };

  const full = liveSurvivalState(1);
  const fullRules = currentStuntRunRules(full, 'arc');
  assert.equal(fullRules.simulationSpeedAssist, undefined, 'at 100% the key is absent');
  assert.deepEqual(fullRules, HEAD_UNASSISTED, 'a 100% run is byte-identical to HEAD behaviour');

  const assisted = liveSurvivalState(0.7);
  const assistedRules = currentStuntRunRules(assisted, 'arc');
  assert.equal(assistedRules.simulationSpeedAssist, 0.7);

  // A run launched at 100% that drops to 70% before the next wave is marked mixed.
  const mid = liveSurvivalState(1);
  const sr = Object.create(survivalResults);
  sr.init({ state: mid, bus: createBus(), helpers: {}, registry: null });
  sr._onWaveStarted({ wave: 1 });
  assert.equal(sr._stuntRules.simulationSpeedAssist, undefined);
  mid.settings.gameplay.gameSpeed = 0.7;
  sr._onWaveStarted({ wave: 2 });
  assert.equal(sr._stuntRules.simulationSpeedAssist, 'mixed');

  // Record comparability: absent/legacy speed normalizes to 1; assisted never compares equal.
  const fullRecord = recordRulesFor({ recordRules: fullRules });
  const assistedRecord = recordRulesFor({ recordRules: assistedRules });
  const mixedRecord = recordRulesFor({ recordRules: { ...assistedRules, simulationSpeedAssist: 'mixed' } });
  assert.equal(fullRecord.simulationSpeedAssist, 1, 'unstamped speed reads as a full-speed run');
  assert.equal(assistedRecord.simulationSpeedAssist, 0.7);
  const race = ghostComparability(
    { ...fullRecord, mutators: fullRecord.mutators },
    { ...assistedRecord, mutators: assistedRecord.mutators },
  );
  assert.equal(race.status, 'incompatible');
  assert.deepEqual(race.mismatches, ['simulationSpeedAssist']);
  const mixedRace = ghostComparability(fullRecord, mixedRecord);
  assert.equal(mixedRace.status, 'incompatible');
  assert.equal(fullRecord.complete, true, 'an unassisted run still files a complete record');
});
