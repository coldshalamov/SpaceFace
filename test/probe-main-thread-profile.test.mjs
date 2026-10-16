import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  flightStartFailureError,
  installFlightStartFailureObserver,
  watchFlightStartFailure,
} from '../scripts/lib/flightStartFailure.mjs';

const WATCH_KEY = '__SF_PROFILE_FLIGHT_FAILURE_WATCH__';

test('profile watcher captures the production game:startFailed payload for fast failure diagnostics', () => {
  const bus = createBus();
  const watch = watchFlightStartFailure(bus);

  // A normal title-menu dwell has no failure event and must not be treated as a failed launch.
  assert.equal(watch.read(), null);

  const payload = {
    error: 'opening GPU admission touch 173 skipped: null-geometry',
    code: 'GPU_RESIDENCY_UNAVAILABLE',
    stage: 'gpu-resources',
    retryable: true,
    text: 'The opening flight materials did not finish preparing. Retry Launch; saved games are unchanged.',
  };
  bus.emit('game:startFailed', payload);

  const captured = watch.read();
  assert.equal(captured.stage, 'gpu-resources');
  assert.equal(captured.phase, 'gpu-resources');
  assert.equal(captured.code, 'GPU_RESIDENCY_UNAVAILABLE');
  assert.equal(captured.message, payload.error);
  assert.equal(captured.text, payload.text);

  const error = flightStartFailureError(captured, 'menu');
  assert.equal(error.name, 'FlightStartFailure');
  assert.match(error.message, /phase=gpu-resources/);
  assert.match(error.message, /code=GPU_RESIDENCY_UNAVAILABLE/);
  assert.match(error.message, /null-geometry/);
  assert.deepEqual(error.flightFailure, captured);
  assert.equal(error.flightMode, 'menu');
});

test('disposing a launch watcher prevents stale failures and a replacement starts empty', () => {
  const bus = createBus();
  const previous = watchFlightStartFailure(bus);
  previous.dispose();
  bus.emit('game:startFailed', {
    error: 'cancelled launch should be ignored',
    code: 'GAME_START_FAILED',
    stage: 'cancelled',
  });
  assert.equal(previous.read(), null);

  const current = watchFlightStartFailure(bus);
  assert.equal(current.read(), null);
  bus.emit('game:startFailed', {
    error: 'new launch failed',
    code: 'RENDER_PIPELINE_UNAVAILABLE',
    stage: 'renderer',
  });
  assert.equal(current.read().code, 'RENDER_PIPELINE_UNAVAILABLE');
  assert.equal(current.read().stage, 'renderer');
  current.dispose();
});

test('the browser installer captures the raw event on the page global and unsubscribes cleanly', () => {
  const priorSf = globalThis.SF;
  const priorWatch = globalThis[WATCH_KEY];
  const bus = createBus();
  const payload = {
    error: 'opening GPU admission touch 173 skipped: null-geometry',
    code: 'GPU_RESIDENCY_UNAVAILABLE',
    stage: 'gpu-resources',
  };
  try {
    globalThis.SF = { bus };
    const result = installFlightStartFailureObserver();
    assert.deepEqual(result, { installed: true });
    assert.equal(globalThis[WATCH_KEY].read(), null);

    bus.emit('game:startFailed', payload);
    assert.equal(globalThis[WATCH_KEY].read(), payload);

    globalThis[WATCH_KEY].dispose();
    bus.emit('game:startFailed', { error: 'stale replacement failure' });
    assert.equal(globalThis[WATCH_KEY].read(), payload);
  } finally {
    if (priorWatch === undefined) delete globalThis[WATCH_KEY];
    else globalThis[WATCH_KEY] = priorWatch;
    if (priorSf === undefined) delete globalThis.SF;
    else globalThis.SF = priorSf;
  }
});

test('the installer stays unarmed until a delayed SF bus is present', () => {
  const priorSf = globalThis.SF;
  const priorWatch = globalThis[WATCH_KEY];
  const bus = createBus();
  const payload = { error: 'delayed bus launch failure', code: 'GAME_START_FAILED', stage: 'startup' };
  try {
    delete globalThis.SF;
    assert.deepEqual(installFlightStartFailureObserver(), { installed: false });
    assert.equal(globalThis[WATCH_KEY].read(), null);

    globalThis.SF = { bus };
    assert.deepEqual(installFlightStartFailureObserver(), { installed: true });
    bus.emit('game:startFailed', payload);
    assert.equal(globalThis[WATCH_KEY].read(), payload);
  } finally {
    if (priorWatch === undefined) delete globalThis[WATCH_KEY];
    else globalThis[WATCH_KEY] = priorWatch;
    if (priorSf === undefined) delete globalThis.SF;
    else globalThis.SF = priorSf;
  }
});
