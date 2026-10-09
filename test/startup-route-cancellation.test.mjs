import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createBus } from '../src/core/eventBus.js';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import { runNewGameStartTransition } from '../src/core/newGameStartTransition.js';
import { createPresentationRuntimeCloser } from '../src/core/presentationRunner.js';

// Execute the boot owner's actual route/teardown callbacks without initializing a GPU or loading
// the entire system registry. The transition and close transaction remain their production owners.
const source = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const menuBody = source.match(/bus\.on\('game:exitToMenu', \(\) => \{([\s\S]*?)\n    \}\);/)?.[1];
const stopBody = source.match(/stopPresentation\(\) \{([\s\S]*?)\n      \},\n      detachProducers:/)?.[1];
assert.ok(menuBody && stopBody, 'the main route and terminal close callbacks must be available');

function fixture() {
  const state = { mode: 'loading', render: { admissionRunGeneration: 0 } };
  const guard = createRunTransitionGuard();
  const bus = createBus();
  const exitToMenu = new Function('state', 'bus', 'runTransitionGuard', `return () => {${menuBody}\n};`)(
    state, bus, guard,
  );
  const stopPresentation = new Function(
    'state', 'runTransitionGuard', 'loadingPresenter', 'loopController',
    `return () => {${stopBody}\n};`,
  )(state, guard, { destroy() {} }, { stop() {} });
  bus.on('game:exitToMenu', exitToMenu);
  const close = createPresentationRuntimeCloser({ stopPresentation });
  return { state, guard, bus, close };
}

function pendingStart(h) {
  let resolve, reject, started;
  const gate = new Promise((res, rej) => { resolve = res; reject = rej; });
  const reached = new Promise(res => { started = res; });
  const token = h.guard.begin('new-game');
  h.state.render.admissionRunGeneration = token.generation;
  let discarded = 0;
  const result = runNewGameStartTransition({
    guard: h.guard, token,
    prepareRun() {},
    waitForLibrary() { started(); return gate; },
    waitForVisuals: () => true,
    enterFlight() { h.state.mode = 'flight'; },
    discardRun() { discarded += 1; },
  });
  return { token, reached, result, resolve, reject, discarded: () => discarded };
}

test('returning to the menu cancels an outstanding startup before it publishes flight', async () => {
  const h = fixture();
  const pending = pendingStart(h);
  await pending.reached;
  h.bus.emit('game:exitToMenu', { source: 'pause' });
  assert.equal(h.state.mode, 'menu');
  pending.resolve(true);
  assert.deepEqual(await pending.result, { stale: true, enteredFlight: false });
  assert.equal(h.state.mode, 'menu', 'late readiness must not reopen flight');
  assert.equal(h.guard.isCurrent(pending.token), false);
  assert.ok(h.state.render.admissionRunGeneration > pending.token.generation,
    'GPU admissions must retire with the startup token');
});

test('terminal runtime close cancels startup even if its readiness later succeeds', async () => {
  const h = fixture();
  const pending = pendingStart(h);
  await pending.reached;
  assert.equal(h.close().closed, true);
  pending.resolve(true);
  assert.deepEqual(await pending.result, { stale: true, enteredFlight: false });
  assert.equal(h.state.mode, 'loading', 'a stopped loop must never hand over flight control');
  assert.ok(h.state.render.admissionRunGeneration > pending.token.generation);
});

test('a gate rejecting after terminal close cannot discard the retired world', async () => {
  const h = fixture();
  const pending = pendingStart(h);
  await pending.reached;
  h.close();
  pending.reject(new Error('the disposed renderer finished with a failure'));
  assert.deepEqual(await pending.result, { stale: true, enteredFlight: false });
  assert.equal(pending.discarded(), 0, 'late failure cleanup must not mutate the retired scene');
});
