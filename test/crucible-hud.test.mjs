// Survival run readout — the figures a player reads while flying, and the census behind them.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { RUN_PHASES, runXpForLevel } from '../src/core/runState.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
  SYSTEM_CAPABILITIES,
} from '../src/runtime/authoritativeSystemManifest.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { survivalRun, SURVIVAL_ARENA_INTRO_TICKS, SURVIVAL_WAVE_INTRO_TICKS } from '../src/systems/survivalRun.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import {
  PHASE_WORDS,
  arenaLabel,
  phaseWord,
  objectiveWord,
  earnLine,
  levelProgress,
  survivalHud,
  threatCensus,
} from '../src/ui/survivalHud.js';

const DT = 1 / 60;
const ARENA = 'helios_core';
const SEED = 7;

function boot(seed = SEED) {
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
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true, pos: { x: spec.pos.x, z: spec.pos.z } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, pos: { x: 400, z: 0 }, type: 'ship' };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const ctx = { state, bus, helpers };
  runSession.init(ctx);
  survivalWave.init(ctx);
  survivalRun.init(ctx);
  survivalHud.init(ctx);
  return { state, bus, emitted, helpers, budget, spawned, ctx, player };
}

function tick(harness, n = 1) {
  for (let i = 0; i < n; i++) {
    survivalWave.update(DT);
    survivalRun.update(DT);
    survivalHud.update(DT, harness.state);
  }
}

function reachActive(harness) {
  harness.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: SEED, arenaId: ARENA });
  harness.bus.emit('run:loadoutReady', {});
  tick(harness, 1);
  tick(harness, SURVIVAL_ARENA_INTRO_TICKS);
  tick(harness, SURVIVAL_WAVE_INTRO_TICKS);
  return harness.state.run;
}

test('every visible run phase has a word a player can read — no raw phase ids on the glass', () => {
  for (const phase of RUN_PHASES) {
    // 'inactive' hides the readout entirely, so it needs no word.
    if (phase === 'inactive') continue;
    assert.equal(typeof PHASE_WORDS[phase], 'string', `${phase} has a word`);
    assert.ok(PHASE_WORDS[phase].length > 0);
    assert.ok(!PHASE_WORDS[phase].includes('_'), `${phase} word is not the id`);
  }
  // Even a phase this file has never heard of renders as words, not as an id.
  assert.equal(phaseWord('some_future_phase'), 'SOME FUTURE PHASE');
  assert.equal(phaseWord(null), 'RUN');
});

test('a boss or elite wave says which it is instead of reading as an ordinary fight', () => {
  assert.equal(objectiveWord('boss'), 'BOSS');
  assert.equal(objectiveWord('elite_hunt'), 'ELITE');
  // The ordinary case stays null on purpose: the phase word already says FIGHT, and a second
  // label saying the same thing is noise.
  assert.equal(objectiveWord('resolve_hostiles'), null);
  assert.equal(objectiveWord('something_new'), null, 'an unknown objective invents no label');
  assert.equal(objectiveWord(undefined), null);
});

test('the arena label is derived, so a new arena needs no edit here', () => {
  assert.equal(arenaLabel('helios_core'), 'HELIOS CORE');
  assert.equal(arenaLabel('ceres_belt'), 'CERES BELT');
  assert.equal(arenaLabel(null), 'ARENA');
});

test('the threat census reports how many are still out there', () => {
  assert.deepEqual(threatCensus({ threatBudget: 6, spawnedThreat: 6, resolvedThreat: 2 }),
    { alive: 4, total: 6, remaining: 4, resolved: 2 });
  // A wave still owing bodies counts them: 6 planned, 4 admitted so far, 1 dead -> 5 to go.
  assert.equal(threatCensus({ threatBudget: 6, spawnedThreat: 4, resolvedThreat: 1 }).remaining, 5);
  // Nothing negative, ever.
  assert.equal(threatCensus({ threatBudget: 0, spawnedThreat: 0, resolvedThreat: 9 }).remaining, 0);
  assert.equal(threatCensus(null).remaining, 0);
});

test('level progress is a real fraction of the current level band', () => {
  assert.equal(levelProgress({ xp: 0, level: 1 }), 0);
  assert.equal(levelProgress({ xp: runXpForLevel(2), level: 2 }), 0);
  const mid = levelProgress({ xp: Math.round((runXpForLevel(2) + runXpForLevel(3)) / 2), level: 2 });
  assert.ok(mid > 0.4 && mid < 0.6, `midpoint reads as ${mid}`);
  assert.equal(levelProgress(null), 0);
});

test('an earn receipt names what was earned, and says nothing when nothing was', () => {
  assert.equal(earnLine({ credits: 2, score: 10, xp: 3 }), '+2 CR   +10 SCORE   +3 XP');
  assert.equal(earnLine({ credits: 0, score: 25, xp: 0 }), '+25 SCORE');
  assert.equal(earnLine({ credits: 0, score: 0, xp: 0 }), null);
  assert.equal(earnLine(null), null);
});

test('the wave census reaches state.run through runSession, written by nobody else', () => {
  const harness = boot();
  const run = reachActive(harness);
  assert.equal(run.phase, 'active');
  // Wave 1 is six waspers; all six admitted, none dead yet.
  assert.equal(run.threatBudget, 6);
  assert.equal(run.spawnedThreat, 6);
  assert.equal(run.resolvedThreat, 0);
  assert.equal(threatCensus(run).remaining, 6);

  // Kill two the way core's sweep reports it.
  const cohort = harness.spawned.slice(0, 2);
  for (const entity of cohort) {
    entity.alive = false;
    harness.state.entities.delete(entity.id);
    harness.bus.emit('entity:destroyed', { id: entity.id });
  }
  assert.equal(harness.state.run.resolvedThreat, 2);
  assert.equal(threatCensus(harness.state.run).remaining, 4);
});

test('a recycled entity id never drops a live hostile out of the wave census', () => {
  // core recycles a dead body's id immediately but queues its entity:destroyed to end of tick, so
  // a batch dispatched the same tick can be handed that id. Acting on the stale receipt would
  // shrink the census by a body that is alive and shooting — and could clear the wave.
  const harness = boot();
  reachActive(harness);
  const victim = harness.spawned[0];
  const recycledId = victim.id;

  // The old body dies and its id is immediately reissued to a fresh cohort hostile...
  victim.alive = false;
  harness.state.entities.delete(recycledId);
  const replacement = {
    id: recycledId, alive: true, type: 'ship', team: 1, pos: { x: 10, z: 10 },
    data: { runCohort: 'survival', runWave: 1, runRole: 'mass', level: 1 },
  };
  harness.state.entities.set(recycledId, replacement);

  // ...and only THEN does the old body's queued receipt arrive.
  harness.bus.emit('entity:destroyed', { id: recycledId });

  assert.equal(harness.state.run.resolvedThreat, 0, 'the live occupant was not counted as dead');
  assert.equal(threatCensus(harness.state.run).remaining, 6, 'still six hostiles to fight');

  // When the replacement itself dies for real, the receipt lands normally.
  replacement.alive = false;
  harness.state.entities.delete(recycledId);
  harness.bus.emit('entity:destroyed', { id: recycledId });
  assert.equal(harness.state.run.resolvedThreat, 1);
});

test('a starved wave never asks the player to kill bodies that were never admitted', () => {
  const harness = boot();
  // Ambient traffic holds every slot, so wave 1 admits nothing.
  harness.budget.request(harness.budget.max(), 'ambient-flood');
  const run = reachActive(harness);
  assert.equal(harness.spawned.length, 0);
  assert.equal(run.spawnedThreat, 0);
  assert.equal(run.threatBudget, 0, 'the refused bodies left the census');
  assert.equal(threatCensus(run).remaining, 0);
});

test('the readout is a strict no-op headless and outside a live survival run', () => {
  const harness = boot();
  assert.equal(typeof document, 'undefined', 'this test runs without a DOM');
  for (let i = 0; i < 200; i++) {
    assert.doesNotThrow(() => survivalHud.update(DT, harness.state));
  }
  reachActive(harness);
  for (let i = 0; i < 200; i++) {
    assert.doesNotThrow(() => survivalHud.update(DT, harness.state));
  }
  // It reads; it never writes.
  const before = JSON.stringify(harness.state.run);
  for (let i = 0; i < 50; i++) survivalHud.update(DT, harness.state);
  assert.equal(JSON.stringify(harness.state.run), before);
});

test('the readout is registered as a DOM-guarded sim system, after the phase machine', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('survivalHud'), 'in init order');
  const hud = PRODUCTION_UPDATE_ORDER.indexOf('survivalHud');
  assert.ok(hud >= 0, 'in update order');
  assert.ok(hud > PRODUCTION_UPDATE_ORDER.indexOf('survivalRun'), 'after the phase machine');
  assert.ok(hud > PRODUCTION_UPDATE_ORDER.indexOf('survivalWave'), 'after the wave owner');
  assert.deepEqual(SYSTEM_CAPABILITIES.survivalHud,
    { nodeSafe: true, phase: 'sim', capability: 'hud', domGuarded: true });
});
