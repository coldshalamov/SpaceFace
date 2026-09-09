// CRU-002 — orthogonal run envelope contract (PQ-133 / §27.1–§27.4).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';

import { createGameState } from '../src/core/gameState.js';
import { FRESH_RUN_SYSTEMS, resetFreshRunSystems } from '../src/core/runReset.js';
import {
  RUN_OUTCOMES,
  RUN_PHASES,
  RUN_PHASE_TRANSITIONS,
  canTransition,
  createRunState,
  validateRunState,
} from '../src/core/runState.js';
import {
  PRODUCTION_INIT_ORDER,
  PRODUCTION_UPDATE_ORDER,
} from '../src/runtime/authoritativeSystemManifest.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { runSession } from '../src/systems/runSession.js';
import { createBus } from '../src/core/eventBus.js';

const EXPECTED_PHASES = Object.freeze([
  'inactive', 'loadout', 'arena_intro', 'wave_intro', 'active',
  'cleanup', 'draft', 'refit', 'victory', 'ended',
]);

const EXPECTED_RUN_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'ruleset', 'seed', 'arenaId', 'phase', 'wave', 'block', 'act',
  'wavePlanId', 'threatBudget', 'spawnedThreat', 'resolvedThreat', 'credits', 'xp', 'level',
  'score', 'style', 'modifiers', 'draftHistory', 'shopHistory', 'arenaMutators', 'buildCode',
  'result', 'telemetry',
]);

const ILLEGAL_TRANSITIONS = Object.freeze([
  ['inactive', 'active'],
  ['active', 'refit'],
  ['ended', 'active'],
  ['victory', 'wave_intro'],
  ['loadout', 'cleanup'],
  ['draft', 'draft'],
]);

const FULL_DRIVE = Object.freeze([
  { expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 'ready', tick: 1 },
  { expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 'intro_done', tick: 2 },
  { expectedPhase: 'wave_intro', nextPhase: 'active', reason: 'wave_start', tick: 3 },
  { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 4 },
  { expectedPhase: 'cleanup', nextPhase: 'draft', reason: 'draft_open', tick: 5 },
  { expectedPhase: 'draft', nextPhase: 'wave_intro', reason: 'pick_done', tick: 6 },
  { expectedPhase: 'wave_intro', nextPhase: 'active', reason: 'wave_start', tick: 7 },
  { expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 8 },
  { expectedPhase: 'cleanup', nextPhase: 'refit', reason: 'refit_open', tick: 9 },
  { expectedPhase: 'refit', nextPhase: 'victory', reason: 'act_complete', tick: 10 },
]);

function jsonRoundTrip(value) {
  return JSON.parse(JSON.stringify(value));
}

function walkObjects(value, visit) {
  if (!value || typeof value !== 'object') return;
  visit(value);
  if (Array.isArray(value)) {
    for (const item of value) walkObjects(item, visit);
    return;
  }
  for (const key of Object.keys(value)) walkObjects(value[key], visit);
}

function bootSession(seed = 1) {
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
  return { state, bus, emitted };
}

function named(emitted, event) {
  return emitted.filter((entry) => entry.event === event);
}

test('createRunState() is inactive adventure JSON with schemaVersion 1', () => {
  const run = createRunState();
  assert.equal(run.schemaVersion, 1);
  assert.equal(run.kind, 'adventure');
  assert.equal(run.phase, 'inactive');
  assert.deepEqual(jsonRoundTrip(run), run);
});

test('createRunState({ kind, ruleset, seed }) carries those values', () => {
  const run = createRunState({ kind: 'survival', ruleset: 'scored', seed: 7 });
  assert.equal(run.kind, 'survival');
  assert.equal(run.ruleset, 'scored');
  assert.equal(run.seed, 7);
  assert.equal(run.phase, 'inactive');
});

test('RUN_PHASES is frozen and matches §27.4 order', () => {
  assert.ok(Object.isFrozen(RUN_PHASES));
  assert.deepEqual([...RUN_PHASES], [...EXPECTED_PHASES]);
});

test('validateRunState rejects unknown phase, schema, kind, seed, and non-JSON', () => {
  const base = createRunState();

  const unknownPhase = validateRunState({ ...base, phase: 'combat' });
  assert.equal(unknownPhase.ok, false);
  assert.ok(unknownPhase.issues.some((issue) => issue.includes('phase')));

  const missingSchema = { ...base };
  delete missingSchema.schemaVersion;
  const missing = validateRunState(missingSchema);
  assert.equal(missing.ok, false);
  assert.ok(missing.issues.some((issue) => issue.includes('schemaVersion')));

  const wrongSchema = validateRunState({ ...base, schemaVersion: 2 });
  assert.equal(wrongSchema.ok, false);
  assert.ok(wrongSchema.issues.some((issue) => issue.includes('schemaVersion')));

  const unknownKind = validateRunState({ ...base, kind: 'raid' });
  assert.equal(unknownKind.ok, false);
  assert.ok(unknownKind.issues.some((issue) => issue.includes('kind')));

  const nonIntegerSeed = validateRunState({ ...base, seed: 1.5 });
  assert.equal(nonIntegerSeed.ok, false);
  assert.ok(nonIntegerSeed.issues.some((issue) => issue.includes('seed')));

  const nonJson = validateRunState({ ...base, telemetry: { fn: () => 1 } });
  assert.equal(nonJson.ok, false);
  assert.ok(nonJson.issues.some((issue) => issue.includes('telemetry')));
});

test('validateRunState rejects incomplete objects and names the missing path', () => {
  const incomplete = validateRunState({
    schemaVersion: 1, kind: 'survival', phase: 'active', seed: 0,
  });
  assert.equal(incomplete.ok, false);
  assert.ok(incomplete.issues.some((issue) => issue.includes('wave') && issue.includes('missing')));
});

test('validateRunState never throws and reports circular', () => {
  const cyclic = createRunState();
  cyclic.telemetry.self = cyclic;
  let result;
  assert.doesNotThrow(() => {
    result = validateRunState(cyclic);
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes('circular')));
  assert.doesNotThrow(() => validateRunState(undefined));
  assert.doesNotThrow(() => validateRunState(1));
  assert.equal(validateRunState(undefined).ok, false);
});

test('every §27.4 legal transition is accepted and six illegal ones are rejected', () => {
  assert.ok(Object.isFrozen(RUN_PHASE_TRANSITIONS));
  for (const from of Object.keys(RUN_PHASE_TRANSITIONS)) {
    assert.ok(Object.isFrozen(RUN_PHASE_TRANSITIONS[from]), `${from} adjacency is frozen`);
    for (const to of RUN_PHASE_TRANSITIONS[from]) {
      assert.equal(canTransition(from, to), true, `${from} → ${to} must be legal`);
    }
  }
  assert.equal(canTransition('active', 'draft'), true);
  assert.equal(canTransition('active', 'cleanup'), true);
  for (const [from, to] of ILLEGAL_TRANSITIONS) {
    assert.equal(canTransition(from, to), false, `${from} → ${to} must be illegal`);
  }
});

test('createGameState(1).run exists, is inactive, and is fresh per call', () => {
  const a = createGameState(1);
  const b = createGameState(1);
  assert.ok(a.run);
  assert.equal(a.run.phase, 'inactive');
  assert.equal(a.run.kind, 'adventure');
  assert.notEqual(a.run, b.run);
  assert.deepEqual(Object.keys(a.run), [...EXPECTED_RUN_KEYS]);
  const aNodes = [];
  const bNodes = [];
  walkObjects(a.run, (node) => aNodes.push(node));
  walkObjects(b.run, (node) => bNodes.push(node));
  assert.ok(aNodes.length > 0);
  assert.equal(aNodes.length, bNodes.length);
  for (let i = 0; i < aNodes.length; i++) {
    assert.notEqual(aNodes[i], bNodes[i]);
  }
});

test('runSession is init-only: in PRODUCTION_INIT_ORDER, absent from UPDATE_ORDER', () => {
  assert.ok(PRODUCTION_INIT_ORDER.includes('runSession'));
  assert.ok(!PRODUCTION_UPDATE_ORDER.includes('runSession'));
  const initSet = new Set(PRODUCTION_INIT_ORDER);
  const missing = PRODUCTION_UPDATE_ORDER.filter((id) => !initSet.has(id));
  assert.deepEqual(missing, []);
});

test('runSession is event-only and has no update method', () => {
  assert.equal(runSession.name, 'runSession');
  assert.notEqual(typeof runSession.update, 'function');
});

test('production Node runtime constructs with runSession among its systems', () => {
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    createSimulation: false,
  });
  assert.ok(runtime);
  assert.ok(runtime.manifest);
  const systems = runtime.manifest.authoritativeSystems || [];
  assert.ok(systems.some((system) => system && system.name === 'runSession'));
  assert.ok(runtime.manifest.authoritativeSystemIds.includes('runSession'));
});

test('transition compare-and-swap rejects mismatched expectedPhase without mutate or emit', () => {
  const { state, bus, emitted } = bootSession(11);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  const begun = state.run;
  assert.equal(begun.phase, 'loadout');
  const before = jsonRoundTrip(begun);
  bus.emit('run:transitionRequested', {
    expectedPhase: 'active',
    nextPhase: 'cleanup',
    reason: 'stale',
    tick: 4,
  });
  assert.equal(state.run, begun);
  assert.equal(state.run.phase, 'loadout');
  assert.deepEqual(jsonRoundTrip(state.run), before);
  assert.ok(!emitted.some((entry) => entry.event === 'run:transitioned'));
});

test('successful begin emits run:started with the loadout payload', () => {
  const { state, bus, emitted } = bootSession(12);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  assert.equal(state.run.phase, 'loadout');
  const started = named(emitted, 'run:started');
  assert.equal(started.length, 1);
  assert.deepEqual(started[0].payload, {
    schemaVersion: 1,
    kind: 'survival',
    ruleset: 'scored',
    seed: 7,
    phase: 'loadout',
  });
});

test('begin is a no-op unless the live phase is inactive', () => {
  const { state, bus, emitted } = bootSession(13);
  bus.emit('run:beginRequested', { kind: 'survival', seed: 3 });
  const first = state.run;
  const startedCount = named(emitted, 'run:started').length;
  bus.emit('run:beginRequested', { kind: 'adventure', seed: 9 });
  assert.equal(state.run, first);
  assert.equal(state.run.kind, 'survival');
  assert.equal(state.run.seed, 3);
  assert.equal(named(emitted, 'run:started').length, startedCount);
});

test('each successful transition mutates phase and emits one matching run:transitioned', () => {
  const { state, bus, emitted } = bootSession(14);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  const beforeCount = named(emitted, 'run:transitioned').length;
  bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 'ready', tick: 1,
  });
  assert.equal(state.run.phase, 'arena_intro');
  const transitioned = named(emitted, 'run:transitioned');
  assert.equal(transitioned.length, beforeCount + 1);
  assert.deepEqual(transitioned[transitioned.length - 1].payload, {
    previousPhase: 'loadout',
    phase: 'arena_intro',
    reason: 'ready',
    tick: 1,
  });
});

test('full drive emits the ordered run:transitioned pair sequence', () => {
  const { state, bus, emitted } = bootSession(15);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  for (const step of FULL_DRIVE) {
    bus.emit('run:transitionRequested', step);
  }
  assert.equal(state.run.phase, 'victory');
  const pairs = named(emitted, 'run:transitioned').map((entry) => [
    entry.payload.previousPhase, entry.payload.phase,
  ]);
  assert.deepEqual(pairs, FULL_DRIVE.map((step) => [step.expectedPhase, step.nextPhase]));
  for (let i = 0; i < FULL_DRIVE.length; i++) {
    const step = FULL_DRIVE[i];
    assert.deepEqual(named(emitted, 'run:transitioned')[i].payload, {
      previousPhase: step.expectedPhase,
      phase: step.nextPhase,
      reason: step.reason,
      tick: step.tick,
    });
  }
});

test('end-from-inactive is a no-op', () => {
  const { state, bus, emitted } = bootSession(16);
  const before = jsonRoundTrip(state.run);
  bus.emit('run:endRequested', { outcome: 'victory', reason: 'premature', tick: 1 });
  assert.equal(state.run.phase, 'inactive');
  assert.deepEqual(jsonRoundTrip(state.run), before);
  assert.equal(named(emitted, 'run:ended').length, 0);
});

test('end twice emits run:ended once and unknown outcome is a no-op', () => {
  const { state, bus, emitted } = bootSession(17);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 'ready', tick: 1,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 'intro_done', tick: 2,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'wave_intro', nextPhase: 'active', reason: 'wave_start', tick: 3,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 4,
  });
  bus.emit('run:endRequested', { outcome: 'not-a-real-outcome', reason: 'nope', tick: 5 });
  assert.equal(state.run.phase, 'cleanup');
  assert.equal(named(emitted, 'run:ended').length, 0);

  bus.emit('run:endRequested', { outcome: 'victory', reason: 'act_complete', tick: 5 });
  assert.equal(state.run.phase, 'victory');
  const ended = named(emitted, 'run:ended');
  assert.equal(ended.length, 1);
  assert.deepEqual(ended[0].payload, {
    outcome: 'victory',
    reason: 'act_complete',
    seed: 7,
    phase: 'victory',
  });
  assert.ok(validateRunState(state.run).ok);

  bus.emit('run:endRequested', { outcome: 'victory', reason: 'again', tick: 6 });
  assert.equal(named(emitted, 'run:ended').length, 1);
  assert.equal(state.run.phase, 'victory');
  assert.ok(Object.isFrozen(RUN_OUTCOMES));
});

test('end coerces a function reason and NaN tick and the run still validates', () => {
  const { state, bus } = bootSession(18);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'loadout', nextPhase: 'arena_intro', reason: 'ready', tick: 1,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'arena_intro', nextPhase: 'wave_intro', reason: 'intro_done', tick: 2,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'wave_intro', nextPhase: 'active', reason: 'wave_start', tick: 3,
  });
  bus.emit('run:transitionRequested', {
    expectedPhase: 'active', nextPhase: 'cleanup', reason: 'wave_clear', tick: 4,
  });
  bus.emit('run:endRequested', { outcome: 'victory', reason: () => {}, tick: Number.NaN });
  assert.equal(state.run.phase, 'victory');
  assert.equal(state.run.result.reason, null);
  assert.equal(state.run.result.tick, 0);
  assert.equal(validateRunState(state.run).ok, true);
});

test('newGame repairs {run:null} and no-ops when the run key is absent', () => {
  const { state } = bootSession(19);
  state.run = null;
  runSession.newGame();
  assert.equal(state.run.kind, 'adventure');
  assert.equal(state.run.phase, 'inactive');

  const empty = {};
  runSession.state = empty;
  runSession.newGame();
  assert.equal(Object.prototype.hasOwnProperty.call(empty, 'run'), false);
});

test('resetFreshRunSystems clears a live survival run through runSession.newGame', () => {
  const { state, bus } = bootSession(20);
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'scored', seed: 7 });
  assert.equal(state.run.kind, 'survival');
  assert.equal(FRESH_RUN_SYSTEMS[0], 'runSession');
  const registry = {
    get(name) { return name === 'runSession' ? runSession : null; },
  };
  resetFreshRunSystems(registry);
  assert.equal(state.run.kind, 'adventure');
  assert.equal(state.run.phase, 'inactive');
});

test('resetRunState assigns state.run = fresh.run', () => {
  const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
  const start = source.indexOf('function resetRunState');
  assert.ok(start >= 0);
  const nextFn = source.indexOf('\nfunction ', start + 1);
  const body = source.slice(start, nextFn === -1 ? undefined : nextFn);
  assert.match(body, /state\.run\s*=\s*fresh\.run/);
});
