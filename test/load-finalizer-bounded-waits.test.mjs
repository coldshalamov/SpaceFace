// D35 — a failed or interrupted save restore must never strand the session frozen at
// mode:'loading' with timeScale:0 and no way back. The release-soak evidence showed the load
// leg sitting at loading/scale-0 for the whole 210 s probe wait with frames still executing.
//
// The contract this file pins has two halves:
//
//   1. Every await inside finalizeLoadedGame (src/main.js) is bounded — a promise that never
//      settles, or a starved rAF, cannot hold the restore freeze open forever. The load
//      finalizer therefore always settles, saveSystem's deferred release always clears the
//      save:restore freeze, and a thrown gate lands in the existing recoverable state
//      (mode:'menu' + runtime:start-failed + existing retry controls).
//      The saveSystem half of that landing is already covered behaviorally by
//      test/time-effects.test.mjs ("current finalizer failure must surface exactly once").
//
//   2. A join of physics.prepareBackend's pending SG-02 initialization honors the
//      remaining caller deadline and resolves `false` on expiry. A new initialization
//      retains its finite authored bring-up budget. Both failures take the ordinary
//      recoverable path instead of hanging. The init itself is never cancelled: a late
//      bring-up still installs the owner and an F9 retry can reach flight.
//
// Commands: `node --test test/load-finalizer-bounded-waits.test.mjs`

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { laneSetMode } from '../src/core/simLaneCommands.js';

const MAIN_PATH = new URL('../src/main.js', import.meta.url);
const SOAK_PROBE_PATH = new URL('../scripts/lib/releaseSoakProbe.mjs', import.meta.url);

function bootPhysics() {
  const bus = createBus();
  const sim = createSimulation({ seed: 260926, bus, systems: [physics] });
  const { state } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  return { sim, state, phys: sim.registry.get('physics') };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function settlePromises(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}

// The minimal owner contract _updateSg02DynamicAuthority uses once _sg02 is installed.
function fakeSg02Owner() {
  return {
    publishTelemetry: false,
    setFrameOrigin: () => true,
    syncFromEntityLayers: () => {},
    syncFromEntities: () => {},
    step: () => ({
      bodies: 0, colliders: 0, ccdBodies: 0, dynamicBodies: 0, attachments: 0,
      syncMode: 'none', syncFullEntities: 0, syncStaticEntities: 0, syncDynamicEntities: 0,
    }),
    drainContactImpacts: () => [],
    quantizedSnapshot: () => null,
    dispose: () => {},
  };
}

test('a never-settling SG-02 init fails the backend gate instead of hanging prepareBackend', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, phys } = bootPhysics();
  phys._sg02Init = new Promise(() => {}); // the hang being guarded: pending forever
  let outcome = 'still-pending';
  const preparation = phys.prepareBackend(state, { initTimeoutMs: 40 }).then((value) => { outcome = value; });
  t.mock.timers.tick(39);
  await settlePromises();
  assert.equal(outcome, 'still-pending', 'the join retains its requested envelope');
  t.mock.timers.tick(1);
  await settlePromises();
  assert.equal(outcome, false,
    'prepareBackend must resolve false inside its deadline so the load finalizer can fail closed');
  await preparation;
  assert.equal(phys._diag.sg02Ready, false);
  assert.equal(phys._diag.sg02InitTimedOut, true,
    'the timeout must be recorded on diagnostics so probes can name the wedge');
  assert.equal(state.physicsRuntime.diagnostics.sg02InitTimedOut, true);
});

test('a late SG-02 init is adopted by the next prepareBackend — retry reaches ready', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, phys } = bootPhysics();
  const owner = fakeSg02Owner();
  const gate = deferred();
  // Mirror the real init contract: the pending promise installs this._sg02 when it lands.
  phys._sg02Init = gate.promise.then((resolved) => { phys._sg02 = resolved; return resolved; });

  let outcome = 'still-pending';
  const preparation = phys.prepareBackend(state, { initTimeoutMs: 30 }).then((value) => { outcome = value; });
  t.mock.timers.tick(30);
  await settlePromises();
  assert.equal(outcome, false, 'the interrupted wait fails closed');
  await preparation;
  assert.ok(phys._sg02Init, 'the timed-out init must keep its slot — it is adopted, not rebuilt');

  gate.resolve(owner);
  await settlePromises();
  assert.equal(phys._sg02, owner, 'the pending init must still install the owner after the miss');

  assert.equal(await phys.prepareBackend(state), true,
    'a retry after the late init must report a ready authority');
  assert.equal(phys._diag.sg02InitTimedOut, false);
});

test('joining an aged initialization receives only its remaining deadline', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, phys } = bootPhysics();
  phys._sg02Init = new Promise(() => {});
  t.mock.method(globalThis.performance, 'now', () => 1000);
  phys._sg02InitArmedAt = 950;
  let outcome = 'still-pending';
  const preparation = phys.prepareBackend(state, { initTimeoutMs: 40 }).then((value) => { outcome = value; });
  t.mock.timers.tick(0);
  await settlePromises();
  assert.equal(outcome, false, 'an expired existing init cannot receive a fresh sixty-second wait');
  await preparation;
});

test('a newly minted initialization preserves its full authored bring-up budget', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { state, phys } = bootPhysics();
  // Isolate owner creation: the public prepare still owns the real wait and timeout diagnostics.
  // No Rapier module or WASM bring-up is needed to verify the deadline selection.
  t.mock.method(phys, '_updateSg02DynamicAuthority', () => { phys._sg02Init = new Promise(() => {}); });
  let outcome = 'still-pending';
  const preparation = phys.prepareBackend(state, { initTimeoutMs: 40 }).then((value) => { outcome = value; });
  t.mock.timers.tick(59999);
  await settlePromises();
  assert.equal(outcome, 'still-pending', 'a fresh mint retains the authored sixty-second envelope');
  t.mock.timers.tick(1);
  await settlePromises();
  assert.equal(outcome, false, 'a fresh mint still fails closed at its own finite deadline');
  await preparation;
});

test('prepareBackend with an already-live authority stays ready', async () => {
  const { state, phys } = bootPhysics();
  phys._sg02 = fakeSg02Owner();
  assert.equal(await phys.prepareBackend(state, { initTimeoutMs: 30 }), true);
});

test('every await in finalizeLoadedGame is a bounded wait', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('async function finalizeLoadedGame');
  const end = main.indexOf('const _loadingClearColor', start);
  assert(start > 0 && end > start, 'finalizeLoadedGame must exist in src/main.js');
  const body = main.slice(start, end).replace(/\/\/[^\n]*/g, '');
  const awaited = [...body.matchAll(/await\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert(awaited.length > 0, 'the finalizer must await its readiness stages');
  // Frame waits pair rAF with a timer. Library/visual and exact-opening owners carry
  // deadlines. The explicit physics Promise.race is finite even during fresh WASM bring-up.
  const allowed = new Set([
    'nextPaintSliced',
    'nextFrame',
    'waitForAuthoredPartLibrary',
    'waitForInitialAuthoredVisualsWithRetry',
    'waitForRequiredOpeningPicture',
    'Promise',
  ]);
  for (const callee of awaited) {
    assert(allowed.has(callee),
      `finalizeLoadedGame awaits "${callee}" with no declared bound — every load-finalizer wait`
      + ' must carry its own deadline so a never-settling promise cannot freeze mode:loading (D35)');
  }
  assert.match(body, /const physicsReady = await Promise\.race\([\s\S]*?setTimeout\(\(\) => resolve\(false\), 20000\)/,
    'the explicit Promise.race must retain the physics failure deadline');
});

test('frame waits carry a timer fallback so starved rAF cannot hang the load chain', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('function nextFrame()');
  const end = main.indexOf('// A gate that resolves', start);
  assert(start > 0 && end > start, 'the production frame-wait owners exist');
  const frameWaits = new Function('requestAnimationFrame', 'postTaskAtBackgroundPriorityBounded',
    'setTimeout', 'nowMs', 'delay',
    `let frameWaitStarved = 0; const armFrameWaitProbe = () => {};
${main.slice(start, end)}
return { nextFrame, nextPaint };`)(
    () => {}, (callback) => callback(), setTimeout, () => 0, () => Promise.resolve());
  let frame = false;
  frameWaits.nextFrame().then(() => { frame = true; });
  t.mock.timers.tick(47); await settlePromises(); assert.equal(frame, false);
  t.mock.timers.tick(1); await settlePromises(); assert.equal(frame, true);
  let paint = false;
  frameWaits.nextPaint().then(() => { paint = true; });
  t.mock.timers.tick(249); await settlePromises(); assert.equal(paint, false);
  t.mock.timers.tick(1); await settlePromises(); assert.equal(paint, true);
  frame = false;
  frameWaits.nextFrame().then(() => { frame = true; });
  t.mock.timers.tick(0); await settlePromises();
  assert.equal(frame, true, 'repeated compositor starvation takes the bounded task fallback');
});

test('a failed restore lands in the recoverable start-failed menu with a visible affordance', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('function failGameStart');
  const end = main.indexOf('async function waitForAuthoredPartLibrary', start);
  assert(start > 0 && end > start, 'the failure owner exists');
  const fail = new Function('createTimeEffects', 'laneSetMode',
    `${main.slice(start, end)}; return failGameStart;`)(createTimeEffects, laneSetMode);
  const state = { mode: 'loading', timeScale: 0, render: {}, ui: { screenStack: [] } };
  const bus = createBus();
  const events = [];
  bus.on('game:startFailed', (payload) => events.push(['failure', payload]));
  bus.on('toast', (payload) => events.push(['toast', payload]));
  bus.on('ui:pushScreen', (payload) => {
    events.push(['screen', payload]);
    state.ui.screenStack.push(payload.id);
  });
  const effects = createTimeEffects(state);
  effects.set('runtime:loading', { scale: 0 });
  assert.equal(fail(state, bus, new Error('required ship.glb missing'), 'Retry Continue'), true);
  assert.equal(state.mode, 'menu');
  assert.equal(effects.describeRequests()['runtime:loading'], undefined);
  assert.equal(effects.describeRequests()['runtime:start-failed'].scale, 0);
  assert.match(events.find(([name]) => name === 'failure')[1].error, /ship.glb missing/);
  assert.deepEqual(state.ui.screenStack, ['mainMenu'],
    'a quick-load from flight must expose Continue/New Game instead of only a paused HUD');
  assert.equal(events.find(([name]) => name === 'screen')[1].source, 'game-start-failed');
  assert.deepEqual(events.find(([name]) => name === 'toast')[1], { text: 'Retry Continue', kind: 'error', ttl: 8 });
});

test('failed startup preserves a mounted retry screen and its error listener', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('function failGameStart');
  const end = main.indexOf('async function waitForAuthoredPartLibrary', start);
  const fail = new Function('createTimeEffects', 'laneSetMode',
    `${main.slice(start, end)}; return failGameStart;`)(createTimeEffects, laneSetMode);
  for (const screen of ['newGame', 'saveLoad']) {
    const state = { mode: 'loading', timeScale: 0, render: {}, ui: { screenStack: ['mainMenu', screen] } };
    const bus = createBus();
    let handled = 0;
    const pushes = [];
    bus.on('game:startFailed', () => { handled += 1; });
    bus.on('ui:pushScreen', payload => pushes.push(payload));
    assert.equal(fail(state, bus, new Error('admission failed'), 'Retry'), true);
    assert.equal(handled, 1);
    assert.deepEqual(state.ui.screenStack, ['mainMenu', screen]);
    assert.deepEqual(pushes, [], 'the mounted screen retains its own retry controls');
  }
});

test('a failure listener starting a replacement route prevents stale recovery navigation', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('function failGameStart');
  const end = main.indexOf('async function waitForAuthoredPartLibrary', start);
  const fail = new Function('createTimeEffects', 'laneSetMode',
    `${main.slice(start, end)}; return failGameStart;`)(createTimeEffects, laneSetMode);
  const state = { mode: 'loading', timeScale: 0, render: {}, ui: { screenStack: [] } };
  const bus = createBus();
  const token = {};
  let current = token;
  const guard = { isCurrent: candidate => candidate === current };
  const pushes = [];
  bus.on('game:startFailed', () => { current = {}; });
  bus.on('ui:pushScreen', payload => pushes.push(payload));
  assert.equal(fail(state, bus, new Error('old admission failed'), 'Retry', guard, token), false);
  assert.deepEqual(pushes, [], 'stale failure cannot open a menu over the replacement route');
});

test('the soak checker waits for the failed-restore landing before retrying F9', () => {
  const probe = readFileSync(SOAK_PROBE_PATH, 'utf8');
  assert.match(probe, /waitForLoadFlight = \(\)/,
    'the load leg must keep its flight wait');
  // After the first wait fails the probe must watch the session land — late flight or the
  // retryable start-failed menu — instead of sampling once and misreading a bounded failure
  // as a permanent mode:loading freeze.
  const catchIdx = probe.indexOf('catch (loadWaitError)');
  assert(catchIdx > 0, 'the load wait must have a failure path');
  const tail = probe.slice(catchIdx, catchIdx + 3000);
  assert.match(tail, /waitForFunction\(\(\) =>[\s\S]{0,400}runtime:start-failed[\s\S]{0,400}polling/,
    'the failure path must poll for the recoverable landing signature, not sample once');
  assert.match(tail, /load-retry-start-failed[\s\S]{0,200}press\('F9'\)/,
    'a start-failed landing must still trigger the D31 F9 retry');
});
