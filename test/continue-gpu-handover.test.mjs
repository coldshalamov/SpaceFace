import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';

// Execute the production orchestration without booting main.js's browser entrypoint.
// Only its platform/readiness boundaries are substituted; the branching, awaits,
// stale-token checks, failure routing and guarded handover are the real function.
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const start = main.indexOf('async function finalizeLoadedGame(');
const end = main.indexOf('\nconst _loadingClearColor', start);
assert(start >= 0 && end > start, 'production Continue finalizer is available');
const source = main.slice(start, end);

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness({ awaitCook = true, cook = async () => true } = {}) {
  const guard = createRunTransitionGuard();
  const token = guard.begin('load');
  const state = { mode: 'menu', render: { admissionRunGeneration: token.generation } };
  const events = [];
  const calls = { flights: 0, failures: [], pulses: 0, warmups: 0, cookOptions: [] };
  const deps = {
    resetCombatInputMode() {},
    enterLoadingMode(s) { s.mode = 'loading'; },
    startLoadingGatePulse() {
      calls.pulses++;
      return () => { calls.pulses--; };
    },
    nextPaintSliced: async () => {},
    nextFrame: async () => {},
    nowMs: () => 0,
    INITIAL_AUTHORED_VISUAL_TIMEOUT_MS: 180000,
    waitForAuthoredPartLibrary: async () => true,
    authoredCriticalVisualReadiness: () => ({ openingPending: [] }),
    waitForInitialAuthoredVisualsWithRetry: async () => true,
    async waitForRequiredOpeningPicture(s, isActive) {
      assert.equal(s, state);
      assert.equal(typeof isActive, 'function');
      calls.cookOptions.push({ required: true });
      const result = await cook();
      if (result !== true) throw new Error('GPU resources were not accepted');
      return true;
    },
    enterFlightMode(s) { calls.flights++; s.mode = 'flight'; },
    failGameStart(s, bus, error, text, owner, failedToken) {
      assert.equal(owner, guard);
      assert.equal(failedToken, token);
      assert.equal(owner.isCurrent(failedToken), true);
      calls.failures.push(error);
      s.mode = 'menu';
      bus.emit('game:startFailed', { error: error.message });
    },
    SF_DEBUG: false,
    console: { warn() {}, error() {}, log() {} },
  };
  const finalize = new Function(...Object.keys(deps), `${source}; return finalizeLoadedGame;`)(...Object.values(deps));
  const run = () => finalize(state, {
    emit(name, payload) { events.push({ name, payload }); },
  }, { get: () => null }, guard, { transitionToken: token });
  return { guard, token, state, events, calls, run };
}

function assertNoHandover(h) {
  assert.equal(h.calls.flights, 0);
  assert.equal(h.events.some(({ name }) => name === 'ui:closeAll'), false);
  assert.equal(h.events.some(({ payload }) => payload?.id === 'entering-flight'), false);
  assert.equal(h.calls.pulses, 0, 'all completed gate pulses stop');
}

test('Continue holds control until the awaited GPU verdict accepts', async () => {
  const gate = deferred();
  const started = deferred();
  const h = harness({ cook: () => { started.resolve(); return gate.promise; } });
  const run = h.run();
  await started.promise;
  assert.equal(h.state.mode, 'loading');
  assert.equal(h.calls.flights, 0);
  gate.resolve(true);
  assert.deepEqual(await run, { stale: false });
  assert.equal(h.state.mode, 'flight');
  assert.equal(h.calls.flights, 1);
  assert.equal(h.calls.failures.length, 0);
  assert.equal(h.calls.pulses, 0);
  assert.deepEqual(h.calls.cookOptions, [{ required: true }]);
});

for (const verdict of [false, undefined]) {
  test(`Continue refuses a non-accepting GPU verdict (${verdict})`, async () => {
    const h = harness({ cook: async () => verdict });
    await assert.rejects(h.run(), /GPU.*not.*ready|GPU.*not.*accepted/i);
    assert.equal(h.state.mode, 'menu');
    assert.equal(h.calls.failures.length, 1);
    assertNoHandover(h);
  });
}

test('Continue routes GPU rejection through its recoverable failure path', async () => {
  const error = new Error('GPU context replaced during cook');
  const h = harness({ cook: async () => { throw error; } });
  await assert.rejects(h.run(), (received) => received === error);
  assert.deepEqual(h.calls.failures, [error]);
  assert.equal(h.state.mode, 'menu');
  assertNoHandover(h);
});

for (const outcome of ['accept', 'refuse', 'reject']) {
  test(`superseded Continue cannot hand over or fail the newer run (${outcome})`, async () => {
    const gate = deferred();
    const started = deferred();
    const h = harness({ cook: () => { started.resolve(); return gate.promise; } });
    const run = h.run();
    await started.promise;
    const newer = h.guard.begin('new-game');
    h.state.render.admissionRunGeneration = newer.generation;
    h.state.mode = 'newer-run';
    if (outcome === 'reject') gate.reject(new Error('old context lost'));
    else gate.resolve(outcome === 'accept');
    assert.deepEqual(await run, { stale: true });
    assert.equal(h.state.mode, 'newer-run');
    assert.equal(h.calls.failures.length, 0);
    assertNoHandover(h);
  });
}

for (const outcome of ['accept', 'refuse', 'reject']) {
  test(`non-KHR Continue also requires a settled picture (${outcome})`, async () => {
    const gate = deferred();
    const started = deferred();
    const h = harness({ awaitCook: false, cook: () => { started.resolve(); return gate.promise; } });
    const run = h.run();
    await started.promise;
    assert.equal(h.state.mode, 'loading');
    assert.equal(h.calls.flights, 0);
    if (outcome === 'reject') gate.reject(new Error('required cook failed'));
    else gate.resolve(outcome === 'accept');
    if (outcome === 'accept') {
      assert.deepEqual(await run, { stale: false });
      assert.equal(h.calls.flights, 1);
    } else {
      await assert.rejects(run);
      assertNoHandover(h);
      assert.equal(h.state.mode, 'menu');
    }
    assert.deepEqual(h.calls.cookOptions, [{ required: true }]);
  });
}

test('a refused Continue can retry successfully without a previous flight commit', async () => {
  let accepted = false;
  const h = harness({ cook: async () => accepted });
  await assert.rejects(h.run());
  assertNoHandover(h);
  accepted = true;
  assert.deepEqual(await h.run(), { stale: false });
  assert.equal(h.state.mode, 'flight');
  assert.equal(h.calls.flights, 1);
  assert.equal(h.calls.failures.length, 1);
  assert.equal(h.calls.pulses, 0);
});

test('an already-cancelled Continue never starts loading or GPU work', async () => {
  const h = harness();
  h.guard.begin('cancel');
  assert.deepEqual(await h.run(), { stale: true });
  assert.equal(h.state.mode, 'menu');
  assert.deepEqual(h.calls.cookOptions, []);
  assert.equal(h.calls.failures.length, 0);
  assertNoHandover(h);
});
