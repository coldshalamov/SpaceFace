import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { GameStartReadinessError, describeGameStartFailure } from '../src/core/newGameStartTransition.js';
import { handleTitleContinueLoadFailure } from '../src/ui/screens/mainMenu.js';
import { shouldToastSaveError } from '../src/ui/saveFeedback.js';

// Run the boot owner's real callback and finalizer without booting the registry or GPU.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const listenerBody = source.match(/bus\.on\('save:loaded', \(payload\) => \{([\s\S]*?)\n    \}\);/)?.[1];
const finalizerAt = source.indexOf('async function finalizeLoadedGame(');
const finalizer = source.slice(finalizerAt, source.indexOf('\n\nconst _loadingClearColor', finalizerAt));
const failureAt = source.indexOf('function failGameStart(');
const failure = source.slice(failureAt, source.indexOf('\nasync function waitForAuthoredPartLibrary', failureAt));
assert.ok(listenerBody && finalizerAt >= 0 && failureAt >= 0);

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function fixture({ worker = true, library = true, visuals = true, picture = async () => true } = {}) {
  const state = { mode: 'menu', timeScale: 0, render: {}, ui: { screenStack: ['mainMenu'] } };
  const bus = createBus();
  const guard = createRunTransitionGuard();
  const errors = [];
  const startsFailed = [];
  const logs = [];
  const toasts = [];
  const attributes = new Map();
  const summary = { textContent: 'Quick saved today',
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const deps = {
    resetCombatInputMode() {},
    enterLoadingMode: state => { state.mode = 'loading'; },
    enterFlightMode: state => { state.mode = 'flight'; },
    startLoadingGatePulse: () => () => {},
    nextPaintSliced: async () => {}, nextFrame: async () => {}, nowMs: () => 0,
    waitForAuthoredPartLibrary: async () => library,
    waitForInitialAuthoredVisualsWithRetry: async () => visuals,
    waitForRequiredOpeningPicture: picture,
    INITIAL_AUTHORED_VISUAL_TIMEOUT_MS: 20000,
    GameStartReadinessError, describeGameStartFailure, createTimeEffects,
    laneSetMode: (state, bus, mode) => { state.mode = mode; },
    laneCommandSink: () => worker ? () => {} : null,
    SF_DEBUG: false, console: { error: (...args) => logs.push(args) },
  };
  const finalize = new Function(...Object.keys(deps), `${failure}\n${finalizer}\nreturn finalizeLoadedGame;`)(...Object.values(deps));
  let pending = null;
  let finalizerCalls = 0;
  const helpers = { finalizeLoadedGame(payload) {
    finalizerCalls++;
    return pending = finalize(state, bus, { get: () => null }, guard, payload);
  } };
  const listener = new Function('helpers', 'laneCommandSink', 'console', `return (payload) => {${listenerBody}\n};`)(
    helpers, deps.laneCommandSink, deps.console,
  );
  bus.on('save:loaded', listener);
  bus.on('save:error', payload => {
    errors.push(payload);
    handleTitleContinueLoadFailure({ screenManager: { top: () => 'mainMenu' } }, { saveSummary: summary }, payload);
    if (shouldToastSaveError(payload, true)) toasts.push(payload);
  });
  bus.on('game:startFailed', payload => startsFailed.push(payload));
  bus.on('toast', payload => toasts.push(payload));
  return { state, bus, guard, errors, startsFailed, logs, summary, attributes, toasts,
    finalize: payload => finalize(state, bus, { get: () => null }, guard, payload),
    pending: () => pending, finalizerCalls: () => finalizerCalls };
}

test('worker Continue observes an async graphics rejection and retains its classified title failure', async () => {
  const gate = deferred();
  const h = fixture({ picture: () => gate.promise });
  const rejected = new GameStartReadinessError('GPU_RESIDENCY_UNAVAILABLE', 'gpu-resources',
    'WebGL context was lost while preparing the first picture');
  h.bus.emit('save:loaded', { slot: 'quick' });
  await new Promise(resolve => setImmediate(resolve));
  gate.reject(rejected);
  // Leave the original Promise to its actual fire-and-forget owner. node:test also
  // fails on any unhandled rejection after this event-loop turn.
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.mode, 'menu');
  assert.equal(h.errors.length, 1);
  assert.equal(h.errors[0].code, rejected.code);
  assert.equal(h.errors[0].stage, rejected.stage);
  assert.equal(h.errors[0].error, rejected.message);
  assert.equal(h.startsFailed.length, 1);
  assert.equal(h.startsFailed[0].code, rejected.code);
  assert.equal(h.attributes.get('role'), 'alert');
  assert.equal(h.attributes.get('aria-live'), 'assertive');
  assert.match(h.summary.textContent, /WebGL context was lost/);
  assert.equal(h.toasts.length, 1, 'the persistent title receipt adds no duplicate toast');
  assert.ok(h.logs.some(row => row[0] === '[SpaceFace] lane finalizeLoadedGame failed' && row[1] === rejected));
  await assert.rejects(h.pending(), error => error === rejected,
    'an awaited finalizer still receives the original failure');
});

test('successful worker Continue keeps its normal flight handoff without failure receipts', async () => {
  const h = fixture();
  const closed = [];
  h.bus.on('ui:closeAll', payload => closed.push(payload));
  h.bus.emit('save:loaded', { slot: 'quick' });
  assert.deepEqual(await h.pending(), { stale: false });
  assert.equal(h.state.mode, 'flight');
  assert.equal(closed.length, 1);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.startsFailed, []);
  assert.deepEqual(h.logs, []);
});

test('a superseded worker Continue cannot publish late failure or erase the newer route', async () => {
  const gate = deferred();
  const h = fixture({ picture: () => gate.promise });
  h.bus.emit('save:loaded', { slot: 'quick' });
  await new Promise(resolve => setImmediate(resolve));
  h.guard.begin('new-game');
  h.state.mode = 'flight';
  gate.reject(new Error('retired context failed'));
  assert.deepEqual(await h.pending(), { stale: true });
  assert.equal(h.state.mode, 'flight');
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.startsFailed, []);
  assert.deepEqual(h.logs, []);
});

test('main-lane save:loaded does not run or observe its save-owner finalizer twice', async () => {
  const h = fixture({ worker: false, picture: async () => { throw new Error('awaited failure'); } });
  h.bus.emit('save:loaded', { slot: 'quick' });
  assert.equal(h.finalizerCalls(), 0);
  await assert.rejects(h.finalize({ slot: 'quick' }), /awaited failure/);
  assert.equal(h.startsFailed.length, 1);
  assert.deepEqual(h.errors, [], 'the existing main-lane save generator owns its receipt');
});

for (const [kind, options, code, stage] of [
  ['library', { library: false }, 'AUTHORED_LIBRARY_UNAVAILABLE', 'authored-library'],
  ['visuals', { visuals: false }, 'AUTHORED_VISUALS_UNAVAILABLE', 'authored-visuals'],
]) {
  test(`worker Continue classifies a rejected ${kind} gate before returning to the title`, async () => {
    const h = fixture(options);
    h.bus.emit('save:loaded', { slot: 'quick' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].code, code);
    assert.equal(h.errors[0].stage, stage);
    assert.equal(h.attributes.get('role'), 'alert');
  });
}
