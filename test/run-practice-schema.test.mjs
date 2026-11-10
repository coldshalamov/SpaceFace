// A queued Best Line practice run must stay a valid run envelope. Before `practice` joined the
// runState schema, survivalRun stamped `run.practice = true` at run:started and every later
// validateRunState read (liveSurvivalRun, runSession._liveRun) failed on the unknown key: the
// machine froze at loadout and run:endRequested was ignored, stranding the launch.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState, validateRunState } from '../src/core/runState.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { clearQueuedChallenge, queuePracticeRun } from '../src/systems/survivalMutators.js';

const DT = 1 / 60;

function boot(seed) {
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

function tick(n = 1) {
  for (let i = 0; i < n; i++) survivalRun.update(DT);
}

function beginSurvival(bus, seed) {
  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed,
    arenaId: 'helios_core',
  });
}

test('a queued practice run stays valid, walks to active, and can still end', () => {
  const { state, bus, emitted } = boot(7);
  queuePracticeRun();
  beginSurvival(bus, 7);

  assert.equal(state.run.phase, 'loadout');
  assert.equal(state.run.practice, true);
  assert.equal(validateRunState(state.run).ok, true);

  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  tick(SURVIVAL_WAVE_INTRO_TICKS);

  assert.equal(state.run.phase, 'active');
  assert.equal(state.run.wave, 1);
  assert.equal(state.run.practice, true, 'the flag survives transition clone-commits');
  assert.equal(emitted.filter((e) => e.event === 'run:wavePlanned').length, 1);

  bus.emit('run:endRequested', { outcome: 'defeat', reason: 'probe', tick: 9 });
  assert.equal(state.run.phase, 'ended');
  assert.equal(state.run.result.outcome, 'defeat');
  assert.equal(state.run.practice, true, 'the settlement record still reads the practice flag');
});

test('an ordinary run carries practice:false and validates', () => {
  const { state, bus } = boot(11);
  clearQueuedChallenge();
  beginSurvival(bus, 11);
  assert.equal(state.run.practice, false);
  assert.equal(validateRunState(state.run).ok, true);
});

test('a non-boolean practice value is rejected by the envelope contract', () => {
  const run = createRunState({ kind: 'survival', seed: 5 });
  run.practice = 'yes';
  const verdict = validateRunState(run);
  assert.equal(verdict.ok, false);
  assert.ok(verdict.issues.some((issue) => issue.startsWith('practice:')));
});
