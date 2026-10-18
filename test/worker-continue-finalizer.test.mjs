import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { GameStartReadinessError, describeGameStartFailure } from '../src/core/newGameStartTransition.js';
import { holdOpeningPresentationUntilPaint } from '../src/render/pipelineReadiness.js';
import { handleTitleContinueLoadFailure } from '../src/ui/screens/mainMenu.js';
import { shouldToastSaveError } from '../src/ui/saveFeedback.js';
import { mountStartupFailurePresenter } from './helpers/startup-failure-presenter.mjs';

// Run the boot owner's real callback and finalizer without booting the registry or GPU.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const listenerBody = source.match(/bus\.on\('save:loaded', \(payload\) => \{([\s\S]*?)\n    \}\);/)?.[1];
const finalizerAt = source.indexOf('async function finalizeLoadedGame(');
const finalizer = source.slice(finalizerAt, source.indexOf('\n\nconst _loadingClearColor', finalizerAt));
const failureAt = source.indexOf('function failGameStart(');
const failure = source.slice(failureAt, source.indexOf('\nasync function waitForAuthoredPartLibrary', failureAt));
const enterFlightAt = source.indexOf('function enterFlightMode(');
const enterFlightSource = source.slice(enterFlightAt, failureAt);
assert.ok(listenerBody && finalizerAt >= 0 && failureAt >= 0 && enterFlightAt >= 0);

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function createEnterFlightMode(hold = holdOpeningPresentationUntilPaint,
  setMode = (state, _bus, mode) => { state.mode = mode; }) {
  return new Function(
    'createTimeEffects', 'holdOpeningPresentationUntilPaint', 'laneSetMode', 'describeGameStartFailure',
    `${failure}\n${enterFlightSource}\nreturn enterFlightMode;`,
  )(createTimeEffects, hold, setMode, describeGameStartFailure);
}

function fixture(t, { worker = true, library = true, visuals = true, picture = async () => true,
  realFlight = false, holdOptions = {} } = {}) {
  const state = {
    mode: 'menu', timeScale: 0,
    render: realFlight ? { admissionRunGeneration: 1, worldSubmittedFrames: 0 } : {},
    ui: { screenStack: ['mainMenu'] },
  };
  const bus = createBus();
  const failureUi = mountStartupFailurePresenter(t, bus, state);
  const guard = createRunTransitionGuard();
  const errors = [];
  const startsFailed = [];
  const logs = [];
  const toasts = [];
  const attributes = new Map();
  const summary = { textContent: 'Quick saved today',
    setAttribute: (key, value) => attributes.set(key, value), removeAttribute: key => attributes.delete(key) };
  const enterFlightMode = realFlight ? createEnterFlightMode() : null;
  const deps = {
    resetCombatInputMode() {},
    enterLoadingMode: state => { state.mode = 'loading'; },
    enterFlightMode: realFlight
      ? (nextState, nextBus, options) => enterFlightMode(nextState, nextBus, { ...(options || {}), holdOptions })
      : state => { state.mode = 'flight'; },
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
  return { state, bus, guard, errors, startsFailed, logs, summary, attributes, toasts, ...failureUi,
    finalize: payload => finalize(state, bus, { get: () => null }, guard, payload),
    pending: () => pending, finalizerCalls: () => finalizerCalls };
}

test('worker Continue observes an async graphics rejection and retains its classified title failure', async (t) => {
  const gate = deferred();
  const h = fixture(t, { picture: () => gate.promise });
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
  assert.equal(h.overlay.querySelectorAll('[data-startup-failure]').length, 1, 'the failure has one persistent panel');
  assert.equal(h.overlay.classList.contains('hidden'), false);
  assert.equal(h.overlay.querySelector('.sf-state__detail').textContent, rejected.message);
  assert.equal(h.toasts.length, 0, 'the persistent panel and title receipt add no duplicate toast');
  assert.ok(h.logs.some(row => row[0] === '[SpaceFace] lane finalizeLoadedGame failed' && row[1] === rejected));
  await assert.rejects(h.pending(), error => error === rejected,
    'an awaited finalizer still receives the original failure');
});

test('successful worker Continue keeps its normal flight handoff without failure receipts', async (t) => {
  const h = fixture(t);
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

test('a late Continue first-picture failure recovers after finalizer success and emits one durable receipt', async (t) => {
  for (const worker of [true, false]) {
    let deadline;
    const h = fixture(t, {
      worker,
      realFlight: true,
      holdOptions: {
        timeoutMs: 0,
        schedule: (callback) => { deadline = callback; return 1; },
        cancel() {},
      },
    });
    const order = [];
    h.bus.on('game:startFailed', () => order.push('startFailed'));
    h.bus.on('save:error', () => order.push('save:error'));
    if (worker) {
      h.bus.emit('save:loaded', { slot: 'quick' });
      assert.deepEqual(await h.pending(), { stale: false });
    } else {
      assert.deepEqual(await h.finalize({ slot: 'quick' }), { stale: false });
    }
    assert.equal(h.state.mode, 'flight');
    assert.equal(typeof deadline, 'function');

    deadline();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.state.mode, 'menu');
    assert.deepEqual(order, ['startFailed', 'save:error'], 'the title failure mounts before its durable receipt');
    assert.equal(h.startsFailed.length, 1);
    assert.equal(h.startsFailed[0].code, 'GAME_START_FAILED');
    assert.equal(h.startsFailed[0].stage, 'startup');
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].slot, 'quick');
    assert.equal(h.errors[0].reason, 'load_failed');
    assert.equal(h.errors[0].code, 'GAME_START_FAILED');
    assert.equal(h.errors[0].stage, 'startup');
    assert.match(h.errors[0].error, /first world picture/);
    assert.equal(h.overlay.querySelectorAll('[data-startup-failure]').length, 1, 'the classified start failure supplies one visible panel');
    assert.equal(h.overlay.classList.contains('hidden'), false);
    assert.equal(h.overlay.querySelector('.sf-state__detail').textContent, h.errors[0].error);
    assert.equal(h.toasts.length, 0, 'the persistent panel replaces the expiring toast');

    deadline();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.startsFailed.length, 1, 'a duplicate deadline callback cannot recover twice');
    assert.equal(h.errors.length, 1, 'a duplicate deadline callback cannot emit a second save receipt');
    assert.equal(h.overlay.querySelectorAll('[data-startup-failure]').length, 1);
    h.close();
  }
});

test('a late Continue callback is rejected after a newer transition owns the guard', async (t) => {
  let deadline;
  const h = fixture(t, {
    realFlight: true,
    holdOptions: {
      timeoutMs: 0,
      schedule: (callback) => { deadline = callback; return 1; },
      cancel() {},
    },
  });
  h.bus.emit('save:loaded', { slot: 'quick' });
  assert.deepEqual(await h.pending(), { stale: false });
  h.guard.begin('new-game');
  h.state.mode = 'flight';
  deadline();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.state.mode, 'flight');
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.startsFailed, []);
  assert.deepEqual(h.toasts, []);
});

test('a guarded worker Continue failure survives the brief main mode mirror lag', async () => {
  const state = {
    mode: 'loading',
    timeScale: 0,
    render: { admissionRunGeneration: 1, worldSubmittedFrames: 0 },
    ui: { screenStack: [] },
  };
  const bus = createBus();
  const guard = createRunTransitionGuard();
  const token = guard.begin('load');
  const errors = [];
  const startsFailed = [];
  bus.on('save:error', payload => errors.push(payload));
  bus.on('game:startFailed', payload => startsFailed.push(payload));
  let deadline;
  const workerSetMode = (nextState, _bus, mode) => {
    // The worker receives this command first; its authoritative mode reply would update
    // the facade later. Failure recovery still owns the guarded transition in this gap.
    if (mode !== 'flight') nextState.mode = mode;
  };
  createEnterFlightMode((nextState, _timeEffects, onFailure, options) => {
    // Keep the production hold seam, but make the timer deterministic for this worker mirror.
    return holdOpeningPresentationUntilPaint(nextState, _timeEffects, onFailure, {
      ...options,
      timeoutMs: 0,
      schedule: callback => { deadline = callback; return 1; },
      cancel() {},
    });
  }, workerSetMode)(state, bus, { runTransitionGuard: guard, transitionToken: token, continueSlot: 'quick' });
  assert.equal(state.mode, 'loading', 'the worker command has not mirrored flight yet');
  deadline();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.mode, 'menu');
  assert.equal(startsFailed.length, 1);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].slot, 'quick');
});

test('a late New Game callback remains classified but never fabricates a save receipt', async (t) => {
  const state = {
    mode: 'loading',
    timeScale: 0,
    render: { admissionRunGeneration: 1, worldSubmittedFrames: 0 },
    ui: { screenStack: ['newGame'] },
  };
  const bus = createBus();
  const { overlay } = mountStartupFailurePresenter(t, bus, state);
  const guard = createRunTransitionGuard();
  const token = guard.begin('new-game');
  const startsFailed = [];
  const errors = [];
  const toasts = [];
  bus.on('game:startFailed', payload => startsFailed.push(payload));
  bus.on('save:error', payload => errors.push(payload));
  bus.on('toast', payload => toasts.push(payload));
  let deadline;
  createEnterFlightMode()(state, bus, {
    runTransitionGuard: guard,
    transitionToken: token,
    holdOptions: {
      timeoutMs: 0,
      schedule: (callback) => { deadline = callback; return 1; },
      cancel() {},
    },
  });
  assert.equal(state.mode, 'flight');
  deadline();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(state.mode, 'menu');
  assert.equal(startsFailed.length, 1);
  assert.deepEqual(errors, []);
  assert.equal(overlay.querySelectorAll('[data-startup-failure]').length, 1);
  assert.equal(overlay.classList.contains('hidden'), false);
  assert.match(overlay.querySelector('.sf-state__detail').textContent, /first world picture/);
  assert.equal(toasts.length, 0, 'New Game retains its failure without adding an expiring toast');
});

test('a superseded worker Continue cannot publish late failure or erase the newer route', async (t) => {
  const gate = deferred();
  const h = fixture(t, { picture: () => gate.promise });
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

test('main-lane save:loaded does not run or observe its save-owner finalizer twice', async (t) => {
  const h = fixture(t, { worker: false, picture: async () => { throw new Error('awaited failure'); } });
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
  test(`worker Continue classifies a rejected ${kind} gate before returning to the title`, async (t) => {
    const h = fixture(t, options);
    h.bus.emit('save:loaded', { slot: 'quick' });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.errors.length, 1);
    assert.equal(h.errors[0].code, code);
    assert.equal(h.errors[0].stage, stage);
    assert.equal(h.attributes.get('role'), 'alert');
  });
}
