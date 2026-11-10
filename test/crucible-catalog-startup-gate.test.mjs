// Review-found defect fix: the content-catalog validators used to run only in tests, so a
// typo'd enemyId in SURVIVAL_QUESTION_PROPS / SURVIVAL_ROLE_PROBLEMS / SURVIVAL_ENDLESS_OVERLAYS
// / SWARM_ROSTER / SWARM_BOSS_ROTATION surfaced only at spawn time as a silent wasp fallback.
// survivalWave.init now audits every catalog once at startup (console.error + per-issue
// console.warn + a `survival:contentIssues` bus event) without ever failing the route.
//
//   • collectContentCatalogIssues is the same collector init() calls — one seam for
//     catalogQuestionIssues (which itself runs catalogEnemyIdIssues), swarmCatalogIssues and
//     validateCombatChoreography.
//   • planWave's swarm branch used to return early without validateWaveRecipe; the generated
//     packages now pass through the same recipe validator as authored waves.
//
// Headless; fixed seeds; no wall clock.

import test from 'node:test';
import assert from 'node:assert/strict';

import { SURVIVAL_WAVES } from '../src/data/survivalWaves.js';
import { SWARM_ROSTER, SWARM_RULESET } from '../src/data/swarmMode.js';
import { collectContentCatalogIssues, survivalWave } from '../src/systems/survivalWave.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';

const ARENA = 'helios_core';
const SEED = 47;

function captureConsole() {
  const errors = [];
  const warns = [];
  const origError = console.error;
  const origWarn = console.warn;
  console.error = (...args) => { errors.push(args.map(String).join(' ')); };
  console.warn = (...args) => { warns.push(args.map(String).join(' ')); };
  return {
    errors,
    warns,
    restore() { console.error = origError; console.warn = origWarn; },
  };
}

function makeBus() {
  const emitted = [];
  const handlers = new Map();
  return {
    emitted,
    on(name, fn) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(fn);
    },
    emit(name, payload) {
      emitted.push({ name, payload });
      for (const fn of handlers.get(name) || []) fn(payload);
    },
  };
}

test('the live wave catalogs pass the startup audit clean', () => {
  assert.deepEqual(collectContentCatalogIssues(), [],
    'a real catalog regression would now surface at boot instead of at spawn time');
});

test('a typo\'d recipe enemyId is reported through the audit collector', () => {
  const broken = JSON.parse(JSON.stringify(SURVIVAL_WAVES[0]));
  broken.packages[0].enemyId = 'wasp_swarmer_typo';
  const issues = collectContentCatalogIssues({ recipes: [broken] });
  // validateWaveRecipe names the field, not the value: `packages[0].enemyId: unknown enemyId`.
  assert.ok(
    issues.some((item) => item.source === 'survivalWaves'
      && item.path === 'packages[0].enemyId' && item.message === 'unknown enemyId'),
    'the wired collector flags the unknown package enemyId',
  );
  // And the question gate reports the semantic loss — the wave's named body no longer ships.
  assert.ok(
    issues.some((item) => item.message.includes('wasp_swarmer')),
    'the question gate reports the missing named body',
  );
});

test('a typo\'d SWARM_ROSTER id reaches console + bus through survivalWave.init', () => {
  const saved = SWARM_ROSTER[0].enemyId;
  const captured = captureConsole();
  const bus = makeBus();
  try {
    SWARM_ROSTER[0].enemyId = 'wasp_swarmer_typo';
    const sys = Object.create(survivalWave);
    // The wired seam: the same init the default route performs. Must report, must not throw.
    sys.init({ state: { entities: new Map() }, bus, helpers: {} });
  } finally {
    SWARM_ROSTER[0].enemyId = saved;
    captured.restore();
  }
  const events = bus.emitted.filter((e) => e.name === 'survival:contentIssues');
  assert.equal(events.length, 1, 'init emits one contentIssues report');
  assert.ok(
    events[0].payload.issues.some((item) => item.message.includes('wasp_swarmer_typo')),
    'the report names the bad roster id',
  );
  assert.ok(captured.errors.some((line) => line.includes('[survivalWave]')), 'console.error fires');
  assert.ok(
    captured.warns.some((line) => line.includes('wasp_swarmer_typo')),
    'a systems warn lists the issue',
  );
});

test('init stays quiet when the catalogs are clean', () => {
  const captured = captureConsole();
  const bus = makeBus();
  try {
    const sys = Object.create(survivalWave);
    sys.init({ state: { entities: new Map() }, bus, helpers: {} });
  } finally {
    captured.restore();
  }
  assert.equal(bus.emitted.filter((e) => e.name === 'survival:contentIssues').length, 0);
  assert.equal(captured.errors.length, 0, 'no console.error on a clean audit');
});

test('generated swarm waves still pass the recipe-schema gate', () => {
  for (const wave of [1, 5, 9, 10, 20, 37]) {
    const plan = planWave({ seed: SEED, arenaId: ARENA, wave, ruleset: SWARM_RULESET });
    assert.ok(plan && plan.ok !== false && !plan.error, `swarm wave ${wave} plans clean`);
    assert.ok(Array.isArray(plan.schedule) && plan.schedule.length > 0, `wave ${wave} schedules bodies`);
  }
  const lesson = planWave({ seed: SEED, arenaId: ARENA, wave: 1, ruleset: SWARM_RULESET, teachOpening: true });
  assert.ok(lesson && lesson.ok !== false && !lesson.error, 'the taught opening still validates');
  assert.ok(lesson.openingLesson, 'teachOpening still decorates wave 1');
  // Determinism through the new gate: identical inputs still produce identical plans.
  assert.deepEqual(
    planWave({ seed: SEED, arenaId: ARENA, wave: 13, ruleset: SWARM_RULESET }),
    planWave({ seed: SEED, arenaId: ARENA, wave: 13, ruleset: SWARM_RULESET }),
  );
});
