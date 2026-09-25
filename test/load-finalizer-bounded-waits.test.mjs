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
//      (mode:'menu' + runtime:start-failed + error toast — where F9/Continue work again).
//      The saveSystem half of that landing is already covered behaviorally by
//      test/time-effects.test.mjs ("current finalizer failure must surface exactly once").
//
//   2. The one owner-side await with no internal bound — physics.prepareBackend's pending
//      SG-02 authority init (Rapier module import + WASM compile) — resolves `false` inside
//      its own deadline, so the finalizer takes the ordinary start-failed path instead of
//      hanging. The init itself is never cancelled: a late bring-up still installs the owner
//      and is adopted by the next prepareBackend, so an F9 retry can reach flight.
//
// Commands: `node --test test/load-finalizer-bounded-waits.test.mjs`

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';

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

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

test('a never-settling SG-02 init fails the backend gate instead of hanging prepareBackend', async () => {
  const { state, phys } = bootPhysics();
  phys._sg02Init = new Promise(() => {}); // the hang being guarded: pending forever
  const outcome = await Promise.race([
    phys.prepareBackend(state, { initTimeoutMs: 40 }),
    delay(3000).then(() => 'still-pending'),
  ]);
  assert.equal(outcome, false,
    'prepareBackend must resolve false inside its deadline so the load finalizer can fail closed');
  assert.equal(phys._diag.sg02Ready, false);
  assert.equal(phys._diag.sg02InitTimedOut, true,
    'the timeout must be recorded on diagnostics so probes can name the wedge');
  assert.equal(state.physicsRuntime.diagnostics.sg02InitTimedOut, true);
});

test('a late SG-02 init is adopted by the next prepareBackend — retry reaches ready', async () => {
  const { state, phys } = bootPhysics();
  const owner = fakeSg02Owner();
  const gate = deferred();
  // Mirror the real init contract: the pending promise installs this._sg02 when it lands.
  phys._sg02Init = gate.promise.then((resolved) => { phys._sg02 = resolved; return resolved; });

  assert.equal(await phys.prepareBackend(state, { initTimeoutMs: 30 }), false,
    'the interrupted wait fails closed');
  assert.ok(phys._sg02Init, 'the timed-out init must keep its slot — it is adopted, not rebuilt');

  gate.resolve(owner);
  await settlePromises();
  assert.equal(phys._sg02, owner, 'the pending init must still install the owner after the miss');

  assert.equal(await phys.prepareBackend(state), true,
    'a retry after the late init must report a ready authority');
  assert.equal(phys._diag.sg02InitTimedOut, false);
});

test('prepareBackend with an already-live authority stays ready', async () => {
  const { state, phys } = bootPhysics();
  phys._sg02 = fakeSg02Owner();
  assert.equal(await phys.prepareBackend(state, { initTimeoutMs: 30 }), true);
});

test('every await in finalizeLoadedGame is a bounded wait', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('async function finalizeLoadedGame');
  const end = main.indexOf('function resetCombatInputMode', start);
  assert(start > 0 && end > start, 'finalizeLoadedGame must exist in src/main.js');
  const body = main.slice(start, end);
  const awaited = [...body.matchAll(/await\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]);
  assert(awaited.length > 0, 'the finalizer must await its readiness stages');
  // Each allowed callee carries its own deadline: nextPaint pairs rAF with a timer, the
  // readiness helpers race a wall-clock timeout, `cook` is waitForOpeningGpuResources'
  // settleWithin-bounded promise, and prepareBackend bounds its init wait (this file).
  const allowed = new Set([
    'nextPaint',
    'waitForAuthoredPartLibrary',
    'waitForInitialAuthoredVisualsWithRetry',
    'cook',
    'physicsSystem',
  ]);
  for (const callee of awaited) {
    assert(allowed.has(callee),
      `finalizeLoadedGame awaits "${callee}" with no declared bound — every load-finalizer wait`
      + ' must carry its own deadline so a never-settling promise cannot freeze mode:loading (D35)');
  }
});

test('frame waits carry a timer fallback so starved rAF cannot hang the load chain', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  assert.match(main, /function nextFrame\(\)[\s\S]{0,500}?setTimeout/,
    'nextFrame must pair requestAnimationFrame with a setTimeout fallback (rAF starvation)');
  assert.match(main, /function nextPaint\(\)[\s\S]{0,500}?setTimeout/,
    'nextPaint must pair requestAnimationFrame with a setTimeout fallback (rAF starvation)');
});

test('a failed restore lands in the recoverable start-failed menu with a visible affordance', () => {
  const main = readFileSync(MAIN_PATH, 'utf8');
  const start = main.indexOf('function failGameStart');
  assert(start > 0, 'failGameStart must exist');
  const body = main.slice(start, start + 1500);
  assert.match(body, /state\.mode = 'menu'/,
    'the failure landing must move the session out of mode:loading to the menu');
  assert.match(body, /emit\('game:startFailed'/);
  assert.match(body, /emit\('toast', \{ text, kind: 'error'/,
    'the failure must surface a visible toast affordance');
  assert.match(body, /set\('runtime:start-failed'/,
    'the landed state must carry the start-failed marker the F9 retry checks for');
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
