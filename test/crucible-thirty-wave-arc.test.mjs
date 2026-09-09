// PQ-133.07a — thirty-wave Foundry arc: acts, composition, wave-20 event, caps.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import {
  SPAWN_BUDGET_DEFAULT_MAX,
  SPAWN_BUDGET_HARD_MAX,
  SURVIVAL_ARC_LENGTH,
  actIndexForWave,
  bodyCount,
  difficultyForWave,
  templateWaveOf,
} from '../src/data/survivalActs.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { peakConcurrentDemand } from '../src/data/survivalWaves.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_CLEANUP_TICKS,
  SURVIVAL_REFIT_EVERY,
  SURVIVAL_RUN_WAVE_COUNT,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const SEED = 47;
const ARENA = 'helios_core';
const DT = 1 / 60;

function isPlan(value) {
  return value && value.ok !== false && Array.isArray(value.packages) && Array.isArray(value.schedule);
}

function planArc(seed, arenaId) {
  const plans = [];
  for (let wave = 1; wave <= SURVIVAL_ARC_LENGTH; wave++) {
    plans.push(planWave({ seed, arenaId, wave }));
  }
  return plans;
}

test('the thirty-wave arc plans end to end from one seed', () => {
  assert.equal(SURVIVAL_RUN_WAVE_COUNT, 30);
  assert.equal(SURVIVAL_ARC_LENGTH, 30);
  for (const arena of COMBAT_LAB_ARENAS) {
    const plans = planArc(SEED, arena.id);
    assert.equal(plans.length, 30);
    for (let i = 0; i < plans.length; i++) {
      const plan = plans[i];
      const wave = i + 1;
      assert.ok(isPlan(plan), `${arena.id} wave ${wave}`);
      assert.equal(actIndexForWave(wave), wave <= 10 ? 0 : wave <= 20 ? 1 : 2);
      assert.equal(difficultyForWave(wave), actIndexForWave(wave) + 1);
    }
  }
});

function fightOf(plan) {
  return {
    objective: plan.objective,
    packages: plan.packages,
    schedule: plan.schedule,
    arenaPhase: plan.arenaPhase,
    rewards: plan.rewards,
    systemEvent: plan.systemEvent || null,
  };
}

test('same seed replays the same thirty waves; a different seed does not', () => {
  const a = planArc(SEED, ARENA);
  const b = planArc(SEED, ARENA);
  assert.deepEqual(a, b);
  const other = planArc(48, ARENA);
  assert.notDeepEqual(a.map(fightOf), other.map(fightOf), 'a different seed must change fight content, not just plan ids');
});

test('acts change composition, not raw body count, against the template wave', () => {
  for (let wave = 1; wave <= SURVIVAL_ARC_LENGTH; wave++) {
    const template = templateWaveOf(wave);
    const composed = planWave({ seed: SEED, arenaId: ARENA, wave });
    const baseline = planWave({
      seed: SEED,
      arenaId: ARENA,
      wave: template,
      act: 0,
      difficulty: 1,
    });
    assert.ok(isPlan(composed), `wave ${wave}`);
    assert.ok(isPlan(baseline), `template ${template}`);
    assert.equal(bodyCount(composed.packages), bodyCount(baseline.packages), `wave ${wave} body count`);
    assert.equal(peakConcurrentDemand(composed.packages), peakConcurrentDemand(baseline.packages));
    if (wave > 10) {
      const composedGaps = composed.packages.map((pkg) => pkg.batchGapTicks);
      const baselineGaps = baseline.packages.map((pkg) => pkg.batchGapTicks);
      const sameMix = JSON.stringify(composed.packages.map((pkg) => `${pkg.role}:${pkg.enemyId}`))
        === JSON.stringify(baseline.packages.map((pkg) => `${pkg.role}:${pkg.enemyId}`));
      const samePhase = composed.arenaPhase === baseline.arenaPhase;
      const sameGaps = JSON.stringify(composedGaps) === JSON.stringify(baselineGaps);
      assert.equal(
        sameMix && samePhase && sameGaps && !composed.systemEvent,
        false,
        `wave ${wave} must change mix, phase, timing, or event without adding bodies`,
      );
    }
  }
});

test('no planned wave exceeds the spawn caps, including act III', () => {
  for (const arena of COMBAT_LAB_ARENAS) {
    for (let wave = 1; wave <= SURVIVAL_ARC_LENGTH; wave++) {
      const plan = planWave({ seed: SEED, arenaId: arena.id, wave });
      assert.ok(isPlan(plan), `${arena.id} ${wave}`);
      const peak = peakConcurrentDemand(plan.packages);
      assert.ok(peak <= SPAWN_BUDGET_DEFAULT_MAX, `${arena.id} wave ${wave} peak ${peak} > 24`);
      assert.ok(peak <= SPAWN_BUDGET_HARD_MAX, `${arena.id} wave ${wave} peak ${peak} > 40`);
    }
  }
  const beyond = planWave({ seed: SEED, arenaId: ARENA, wave: 31 });
  assert.equal(beyond.ok, false);
  assert.ok((beyond.issues || []).some((issue) => issue.path === 'wave'));
});

test('the wave-20 system event is on the plan exactly once in the arc', () => {
  const plans = planArc(SEED, ARENA);
  const flagged = [];
  for (let i = 0; i < plans.length; i++) {
    if (plans[i].systemEvent) flagged.push(i + 1);
  }
  assert.deepEqual(flagged, [20]);
  assert.equal(plans[19].systemEvent.id, 'foundry_plate_theft');
  assert.equal(plans[19].objective.kind, 'system_event');
  assert.equal(bodyCount(plans[19].packages), bodyCount(plans[9].packages));
});

test('waves 1, 5 and 10 stay the authored ten-wave plans', () => {
  for (const wave of [1, 5, 10]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave });
    assert.ok(!Object.prototype.hasOwnProperty.call(plan, 'systemEvent'));
    assert.equal(plan.objective.kind === 'system_event', false);
  }
});

test('refit sits after waves 10, 20 and 30', () => {
  for (const wave of [10, 20, 30]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave });
    assert.equal(plan.draftExpectation.kind, 'refit');
  }
  for (const wave of [9, 11, 19, 21, 29]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave });
    assert.equal(plan.draftExpectation.kind, 'draft');
  }
  assert.equal(SURVIVAL_REFIT_EVERY, 10);
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

function tick(n = 1) {
  for (let i = 0; i < n; i++) survivalRun.update(DT);
}

function cleanupTicksForWave(wave) {
  return templateWaveOf(wave) === 10 ? 240 : SURVIVAL_CLEANUP_TICKS;
}

function driveArc(seed = 7) {
  const harness = boot(seed);
  const { bus } = harness;
  bus.emit('run:beginRequested', {
    kind: 'survival',
    ruleset: 'scored',
    seed,
    arenaId: ARENA,
  });
  bus.emit('run:loadoutReady', {});
  tick(1);
  tick(SURVIVAL_ARENA_INTRO_TICKS);
  for (let wave = 1; wave <= SURVIVAL_RUN_WAVE_COUNT; wave++) {
    tick(SURVIVAL_WAVE_INTRO_TICKS);
    bus.emit(WAVE_CLEARED_SEAM, { wave });
    tick(1);
    tick(cleanupTicksForWave(wave));
    if (wave % SURVIVAL_REFIT_EVERY === 0) {
      bus.emit('run:refitClosed', {});
      tick(1);
    } else if (wave < SURVIVAL_RUN_WAVE_COUNT) {
      bus.emit('run:draftResolved', {});
      tick(1);
    }
  }
  return harness;
}

test('the run machine fires the wave-20 event once and cannot double-fire it', () => {
  const { state, emitted } = driveArc(11);
  assert.equal(state.run.phase, 'victory');
  assert.equal(state.run.wave, 30);
  assert.equal(state.run.act, 2);
  const events = emitted.filter((entry) => entry.event === 'run:systemEvent');
  assert.equal(events.length, 1);
  assert.equal(events[0].payload.wave, 20);
  assert.equal(events[0].payload.id, 'foundry_plate_theft');

  const planned = emitted.filter((entry) => entry.event === 'run:wavePlanned');
  assert.equal(planned.length, 30);
  assert.equal(planned.filter((entry) => entry.payload.plan && entry.payload.plan.systemEvent).length, 1);
});

test('a second run of the same seed plans the same thirty waves from the machine', () => {
  const a = driveArc(23);
  const b = driveArc(23);
  const plansA = a.emitted.filter((e) => e.event === 'run:wavePlanned').map((e) => e.payload.plan);
  const plansB = b.emitted.filter((e) => e.event === 'run:wavePlanned').map((e) => e.payload.plan);
  assert.deepEqual(plansA, plansB);
  assert.equal(plansA.length, 30);
});
