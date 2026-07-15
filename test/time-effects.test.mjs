import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createScreenManager } from '../src/ui/screenManager.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';
import { feel as feelDefinition } from '../src/render/feel.js';

const timeEffectsModule = await import('../src/core/timeEffects.js').catch(() => null);
const runTransitionModule = await import('../src/core/runTransitionGuard.js').catch(() => null);
const writerAuditModule = await import('../scripts/lib/timeScaleWriterAudit.mjs').catch(() => null);

assert.ok(timeEffectsModule, 'time-effects service module must exist');
assert.equal(typeof timeEffectsModule.createTimeEffects, 'function', 'time-effects service must expose createTimeEffects');
assert.ok(runTransitionModule, 'run-transition guard module must exist');
assert.equal(typeof runTransitionModule.createRunTransitionGuard, 'function',
  'run-transition guard must expose createRunTransitionGuard');
assert.ok(writerAuditModule, 'shared timeScale writer-audit module must exist');
assert.equal(typeof writerAuditModule.scanTimeScaleMutations, 'function',
  'writer audit must expose source-fixture scanning');
assert.equal(typeof writerAuditModule.auditTimeScaleWriters, 'function',
  'writer audit must expose the repository audit');
assert.equal(typeof writerAuditModule.formatTimeScaleFindings, 'function',
  'writer audit must expose stable diagnostics');

const { createTimeEffects } = timeEffectsModule;
const { createRunTransitionGuard } = runTransitionModule;
const { scanTimeScaleMutations, auditTimeScaleWriters, formatTimeScaleFindings } = writerAuditModule;

assert.throws(() => createTimeEffects(null), /state/i, 'null state must be rejected');
assert.throws(() => createTimeEffects([]), /state/i, 'array state must be rejected');

const state = { timeScale: 1 };
const effects = createTimeEffects(state);
assert.equal(createTimeEffects(state), effects, 'one service instance must own each state');
assert.deepEqual(Object.keys(effects).sort(), ['clear', 'getEffectiveScale', 'reset', 'set'], 'public API must contain exactly the four contract methods');
assert.equal(effects.getEffectiveScale(), 1);

const staleScalarState = { timeScale: 0 };
const staleScalarEffects = createTimeEffects(staleScalarState);
assert.equal(staleScalarEffects.getEffectiveScale(), 1);
assert.equal(staleScalarState.timeScale, 1,
  'first acquisition must normalize an unowned stale scalar to the empty-request effective value');

for (const source of ['', '   ', null, 4]) {
  assert.throws(() => effects.set(source, { scale: 0.5 }), /source/i, `invalid source ${String(source)} must be rejected`);
  assert.throws(() => effects.clear(source), /source/i, `invalid clear source ${String(source)} must be rejected`);
}
for (const scale of [-0.01, 1.01, NaN, Infinity, '0.5', null]) {
  assert.throws(() => effects.set('invalid-scale', { scale }), /scale/i, `invalid scale ${String(scale)} must be rejected`);
}
assert.throws(() => effects.set('invalid-request'), /scale|request/i, 'missing request must be rejected');

effects.set('flyby-focus', { scale: 0.5 });
assert.equal(state.timeScale, 0.5);
effects.set('feel:hit-stop', { scale: 0.12 });
assert.equal(state.timeScale, 0.12);
effects.set('ui:pausing-screen', { scale: 0 });
assert.equal(state.timeScale, 0);
effects.set('feel:hit-stop', { scale: 0.2 });
assert.equal(state.timeScale, 0, 'same-source replacement must not defeat a lower request');
effects.clear('unknown-source');
assert.equal(state.timeScale, 0, 'clearing an unknown source must be idempotent');
effects.clear('ui:pausing-screen');
assert.equal(state.timeScale, 0.2);
effects.clear('feel:hit-stop');
assert.equal(state.timeScale, 0.5);
effects.clear('flyby-focus');
assert.equal(state.timeScale, 1);

effects.set('ui:pausing-screen', { scale: 0 });
effects.set('flyby-focus', { scale: 0.5 });
effects.clear('flyby-focus');
assert.equal(state.timeScale, 0, 'clear order must preserve remaining pause');
effects.clear('ui:pausing-screen');
assert.equal(state.timeScale, 1);

effects.set('flyby-focus', { scale: 0.5 });
effects.set('feel:hit-stop', { scale: 0.12 });
effects.reset();
assert.equal(state.timeScale, 1, 'reset must clear every transient request');
assert.equal(effects.getEffectiveScale(), 1);

installDomFixture();
await testRunTransitionGuard(createRunTransitionGuard, createTimeEffects);
testScreenManagerComposition(createTimeEffects);
testFeelComposition(createTimeEffects);
await testSaveRestoreComposition(createTimeEffects);
await testSerializedRestoreTransitions(createTimeEffects, createRunTransitionGuard);
testTimeScaleWriterAudit(scanTimeScaleMutations);
testWriterAndRuntimeContracts(auditTimeScaleWriters, formatTimeScaleFindings);

console.log('time-effects: service, UI, feel, save, and writer contracts PASS');

async function testRunTransitionGuard(createGuard, createEffects) {
  {
    const guard = createGuard();
    assert.deepEqual(Object.keys(guard).sort(), ['begin', 'commit', 'isCurrent'],
      'transition guard public API must contain exactly begin/isCurrent/commit');
    const first = guard.begin('load:A');
    const second = guard.begin('load:B');
    const forged = Object.freeze({ generation: second.generation, label: second.label });
    const spreadClone = { ...second };
    const structuredCloneToken = typeof structuredClone === 'function'
      ? structuredClone(second)
      : JSON.parse(JSON.stringify(second));
    assert.equal(guard.isCurrent(first), false, 'a newer transition must invalidate the older token');
    assert.equal(guard.isCurrent(second), true);
    for (const token of [forged, spreadClone, structuredCloneToken]) {
      assert.equal(guard.isCurrent(token), false, 'forged/cloned current-generation tokens must not be issued identities');
    }
    let actions = 0;
    for (const token of [forged, spreadClone, structuredCloneToken]) {
      assert.equal(guard.commit(token, () => { actions += 1; }), false,
        'forged/cloned tokens must never commit');
    }
    assert.equal(guard.commit(second, () => { actions += 1; }), true);
    assert.equal(guard.commit(second, () => { actions += 1; }), false, 'one issued token must commit at most once');
    assert.equal(actions, 1, 'only the exact issued current token may run one commit action');
  }

  {
    const route = createTransitionRouteFixture(createGuard, createEffects);
    const gateA = deferred();
    const gateB = deferred();
    const runA = route.startLoad('A', gateA.promise);
    const runB = route.startLoad('B', gateB.promise);
    gateA.resolve();
    await runA;
    assert.deepEqual(route.snapshot(), {
      mode: 'loading', timeScale: 0, routeId: 'B', closes: 0, flights: 0, errors: 0, toasts: 0,
    }, 'settling stale A must leave newer B loading and frozen without UI/error effects');
    gateB.resolve();
    await runB;
    assert.deepEqual(route.snapshot(), {
      mode: 'flight', timeScale: 1, routeId: 'B', closes: 1, flights: 1, errors: 0, toasts: 0,
    }, 'settling current B must enter flight and close UI exactly once');
  }

  for (const staleOutcome of ['resolve', 'reject']) {
    const route = createTransitionRouteFixture(createGuard, createEffects);
    const gateA = deferred();
    const runA = route.startLoad('A', gateA.promise);
    route.startNewGame('C');
    const before = route.snapshot();
    if (staleOutcome === 'resolve') gateA.resolve();
    else gateA.reject(new Error('stale A fixture'));
    await runA;
    assert.deepEqual(route.snapshot(), before,
      `${staleOutcome} of stale load A must not change new-game C mode, sources, UI, or errors`);
  }

  {
    const route = createTransitionRouteFixture(createGuard, createEffects);
    const gate = deferred();
    const current = route.startLoad('current-failure', gate.promise);
    gate.reject(new Error('current visual gate'));
    await assert.rejects(current, /current visual gate/);
    assert.deepEqual(route.snapshot(), {
      mode: 'menu', timeScale: 0, routeId: 'current-failure', closes: 0, flights: 0, errors: 1, toasts: 1,
    }, 'current transition failure must surface once, freeze the failure route, and rethrow');
  }
}

function createTransitionRouteFixture(createGuard, createEffects) {
  const guard = createGuard();
  const state = { mode: 'menu', timeScale: 1 };
  const effects = createEffects(state);
  const observed = { routeId: null, closes: 0, flights: 0, errors: 0, toasts: 0 };
  const freeze = { scale: 0 };

  async function startLoad(routeId, readiness) {
    const token = guard.begin(`load:${routeId}`);
    observed.routeId = routeId;
    state.mode = 'loading';
    effects.set('runtime:loading', freeze);
    try {
      await readiness;
      if (!guard.isCurrent(token)) return { stale: true };
      guard.commit(token, () => {
        state.mode = 'flight';
        effects.clear('runtime:loading');
        observed.flights += 1;
        observed.closes += 1;
      });
      return { stale: false };
    } catch (error) {
      if (!guard.isCurrent(token)) return { stale: true };
      state.mode = 'menu';
      effects.set('runtime:start-failed', freeze);
      effects.clear('runtime:loading');
      observed.errors += 1;
      observed.toasts += 1;
      throw error;
    }
  }

  function startNewGame(routeId) {
    guard.begin(`new-game:${routeId}`);
    observed.routeId = routeId;
    state.mode = 'loading';
    effects.reset();
    effects.set('runtime:loading', freeze);
  }

  function snapshot() {
    return {
      mode: state.mode,
      timeScale: state.timeScale,
      routeId: observed.routeId,
      closes: observed.closes,
      flights: observed.flights,
      errors: observed.errors,
      toasts: observed.toasts,
    };
  }

  return { startLoad, startNewGame, snapshot };
}

function testScreenManagerComposition(createEffects) {
  const state = createGameState(2);
  state.mode = 'flight';
  const bus = createBus();
  const emitted = [];
  bus.on('sim:pause', () => emitted.push('pause'));
  bus.on('sim:resume', () => emitted.push('resume'));
  const manager = createScreenManager({ state, bus });
  manager.register({ id: 'pause', onShow() { if (state.mode === 'flight') state.mode = 'paused'; } });
  manager.register({ id: 'settings' });

  const effects = createEffects(state);
  effects.set('flyby-focus', { scale: 0.5 });
  manager.syncVisibility();
  assert.equal(state.timeScale, 0.5);

  manager.pushScreen('pause');
  assert.equal(state.timeScale, 0, 'opening a pausing screen must request a UI freeze');
  assert.deepEqual(emitted, ['pause'], 'first pausing screen must emit exactly one pause');
  manager.pushScreen('settings');
  assert.equal(state.timeScale, 0);
  assert.deepEqual(emitted, ['pause'], 'nested pausing screens must not emit another pause');
  manager.popScreen();
  assert.equal(state.timeScale, 0, 'closing one nested screen must retain the UI freeze');
  manager.popScreen();
  assert.equal(state.timeScale, 0.5, 'UI resume must preserve an external Focus request');
  assert.deepEqual(emitted, ['pause', 'resume'], 'closing the last pausing screen must emit one resume');
  assert.equal(state.mode, 'flight');

  state.ui.docked = true;
  manager.syncVisibility();
  assert.equal(state.timeScale, 0, 'docked state must freeze even with an empty stack');
  assert.deepEqual(emitted, ['pause', 'resume', 'pause']);
  state.ui.docked = false;
  manager.syncVisibility();
  assert.equal(state.timeScale, 0.5);
  assert.deepEqual(emitted, ['pause', 'resume', 'pause', 'resume']);

  manager.pushScreen('pause');
  assert.equal(state.timeScale, 0);
  effects.reset();
  assert.equal(state.timeScale, 1, 'service reset intentionally drops every transient request');
  manager.syncVisibility();
  assert.equal(state.timeScale, 0, 'pause reconciliation must repair a reset request while pauseEmitted remains true');
  assert.equal(emitted.filter((event) => event === 'pause').length, 3, 'repair must not duplicate sim:pause');
  effects.reset();
  bus.emit('mode:changed', { mode: state.mode });
  assert.equal(state.timeScale, 0, 'mode changes must reconcile the pausing-screen request');
  effects.reset();
  bus.emit('save:error', { reason: 'fixture' });
  assert.equal(state.timeScale, 0, 'save errors must reconcile the pausing-screen request');
  manager.closeAll();
  assert.equal(state.timeScale, 1, 'closing UI after reset repair must release its request');
}

function testFeelComposition(createEffects) {
  {
    const { state, bus, feel, effects } = makeFeelFixture(createEffects, 3);
    effects.set('flyby-focus', { scale: 0.5 });
    bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
    feel.frame(0, state);
    assert.equal(state.timeScale, 0.12, 'ordinary hit-stop must request its authored floor');
    feel.frame(0.1, state);
    assert.equal(state.timeScale, 0.5, 'hit-stop expiry must reveal, not overwrite, Focus slow-time');

    bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
    feel.frame(0, state);
    effects.set('ui:pausing-screen', { scale: 0 });
    bus.emit('sim:pause', {});
    assert.equal(feel._hsTimer, 0, 'pause must clear the hit-stop timer');
    assert.equal(state.timeScale, 0, 'clearing hit-stop during pause must retain the UI freeze');
    effects.clear('ui:pausing-screen');
    assert.equal(state.timeScale, 0.5);

    for (const event of ['game:new', 'save:restoring', 'save:loaded']) {
      bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
      feel.frame(0, state);
      assert(feel._hsTimer > 0, `${event} fixture must begin with active hit-stop`);
      bus.emit(event, {});
      assert.equal(feel._hsTimer, 0, `${event} must clear the hit-stop timer`);
      assert.equal(state.timeScale, 0.5, `${event} must preserve Focus while clearing hit-stop`);
    }
  }

  {
    const { state, bus, feel } = makeFeelFixture(createEffects, 4);
    state.settings.video.motionReduce = true;
    bus.emit('combat:damage', { brokeShield: true, isPlayer: true, amount: 10, pos: { x: 0, z: 0 } });
    feel.frame(0, state);
    assert.equal(feel._hsTimer, 0, 'reduced motion must suppress ordinary hit-stop');
    assert.equal(state.timeScale, 1);
  }

  {
    const { state, bus, feel } = makeFeelFixture(createEffects, 5);
    bus.emit('player:death', {});
    const samples = [];
    feel.frame(0, state);
    samples.push(state.timeScale);
    for (let i = 0; i < 7; i += 1) {
      feel.frame(0.05, state);
      samples.push(state.timeScale);
    }
    for (let i = 1; i < samples.length; i += 1) {
      assert(samples[i] <= samples[i - 1] + 1e-9,
        `death ramp must be monotonic 1 -> .12; ${samples[i - 1]} -> ${samples[i]}`);
    }
    assert.equal(samples[0], 1, 'death ramp must begin at normal time');
    assert.equal(samples.at(-1), 0.12, 'death ramp must reach the authored floor');
    feel.frame(0.1, state);
    assert.equal(state.timeScale, 0.12, 'death slow-time must hold its floor until the timer expires');
  }
}

function makeFeelFixture(createEffects, seed) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.playerId = 1;
  state.ui.screenStack = [];
  state.ui.docked = false;
  state.entities.set(1, { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 } });
  state.entityList.push(state.entities.get(1));
  const bus = createBus();
  const effects = createEffects(state);
  const feel = Object.create(feelDefinition);
  feel.init({ state, bus, helpers: {}, timeEffects: effects });
  return { state, bus, feel, effects };
}

async function testSaveRestoreComposition(createEffects) {
  {
    const fixture = makeSaveFixture(createEffects);
    fixture.effects.set('flyby-focus', { scale: 0.5 });
    const ok = fixture.save.loadEnvelope({ fmt: 'wrong', data: {} }, 'invalid');
    assert.equal(ok, false);
    assert.equal(fixture.state.timeScale, 0.5, 'validation failure must preserve every existing effect');
  }

  {
    const fixture = makeSaveFixture(createEffects);
    fixture.effects.set('flyby-focus', { scale: 0.5 });
    fixture.save._restore(fixture.data, 'sync');
    assert.equal(fixture.state.timeScale, 1, 'sync restore without a visual finalizer must release its freeze');
    assert(fixture.events.some((entry) => entry.type === 'save:restoring'), 'destructive restore must announce save:restoring');
  }

  {
    const gate = deferred();
    const fixture = makeSaveFixture(createEffects, () => gate.promise);
    fixture.save._restore(fixture.data, 'deferred');
    assert.equal(fixture.state.timeScale, 0, 'deferred visual finalizer must keep the restore frozen');
    gate.resolve();
    await settlePromises();
    assert.equal(fixture.state.timeScale, 1, 'settled visual finalizer must release its own restore source');
  }

  {
    const fixture = makeSaveFixture(createEffects);
    fixture.save._restoreMeta = () => { throw new Error('destructive fixture'); };
    assert.throws(() => fixture.save._restore(fixture.data, 'destructive-failure'), /destructive fixture/);
    assert.equal(fixture.state.timeScale, 1, 'destructive restore failure must not leave slow-time stuck');
  }

  {
    const fixture = makeSaveFixture(createEffects, () => Promise.reject(new Error('visual fixture')));
    const originalError = console.error;
    console.error = () => {};
    try {
      fixture.save._restore(fixture.data, 'visual-failure');
      assert.equal(fixture.state.timeScale, 0);
      await settlePromises();
      assert.equal(fixture.state.timeScale, 1, 'async visual failure must clear the restore request');
      assert(fixture.events.some((entry) => entry.type === 'save:error' && entry.payload.reason === 'visual_gate_failed'));
    } finally {
      console.error = originalError;
    }
  }

  {
    const first = deferred();
    const second = deferred();
    let call = 0;
    const fixture = makeSaveFixture(createEffects, () => (++call === 1 ? first.promise : second.promise));
    fixture.save._restore(fixture.data, 'first');
    fixture.save._restore(fixture.data, 'second');
    first.resolve();
    await settlePromises();
    assert.equal(fixture.state.timeScale, 0, 'older finalizer must not clear a newer restore freeze');
    second.resolve();
    await settlePromises();
    assert.equal(fixture.state.timeScale, 1, 'newest finalizer settlement must release the newest restore freeze');
  }
}

async function testSerializedRestoreTransitions(createEffects, createGuard) {
  for (const nestedAt of ['save:restoring', 'save:loaded']) {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    let nestedResult = null;
    fixture.bus.on(nestedAt, ({ slot }) => {
      if (slot === 'A') nestedResult = fixture.save._restore(fixture.dataFor('B'), 'B');
    });

    const outerResult = fixture.save._restore(fixture.dataFor('A'), 'A');
    assert.equal(nestedResult && nestedResult.queued, true,
      `${nestedAt} nested restore must return a queued marker without starting B reentrantly`);
    assert.equal(fixture.state.fixtureRoute, 'B', `${nestedAt} drain must leave B as authoritative state`);
    assert.equal(fixture.state.mode, 'loading');
    assert.equal(fixture.state.timeScale, 0, 'drained B must own the active restore/loading freeze');
    assert.deepEqual(fixture.finalizerStarts, ['A', 'B'],
      'A visual finalizer must start before synchronous ownership releases and drains B');
    assert.equal(outerResult && outerResult.restored, true);
    assert.equal(outerResult && outerResult.drained && outerResult.drained.slot, 'B',
      'outer restore must return after the drained B restore has published its marker/state');

    fixture.gateFor('A').resolve();
    await settlePromises();
    assert.deepEqual(fixture.snapshot(), {
      route: 'B', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    }, 'settling stale A must not alter B mode, UI, errors, or freeze');

    fixture.gateFor('B').resolve();
    await settlePromises();
    assert.deepEqual(fixture.snapshot(), {
      route: 'B', mode: 'flight', timeScale: 1, flights: 1, closes: 1,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    }, 'current B settlement must enter flight and close UI exactly once');
  }

  for (const staleOutcome of ['resolve', 'reject']) {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    let queuedNewGame = null;
    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot === 'A') queuedNewGame = fixture.requestNewGame('C');
    });

    fixture.save._restore(fixture.dataFor('A'), 'A');
    assert.equal(queuedNewGame && queuedNewGame.queued, true,
      'main-style New Game request must defer its entire token/start operation during restore');
    assert.equal(fixture.timeline.indexOf('finalizer:A') < fixture.timeline.indexOf('new-game:C'), true,
      'A visual finalizer must start before restore cleanup drains New Game C');
    assert.deepEqual(fixture.snapshot(), {
      route: 'C', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    });
    assert.equal(fixture.events.filter((entry) => entry.type === 'settings:changed').length, 0,
      'A must not publish stale settings effects when a newer route is queued');

    if (staleOutcome === 'resolve') fixture.gateFor('A').resolve();
    else fixture.gateFor('A').reject(new Error('stale A visual failure'));
    await settlePromises();
    assert.deepEqual(fixture.snapshot(), {
      route: 'C', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    }, `${staleOutcome} of stale A must not change C sources, UI, errors, or toasts`);
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    const queuedMarkers = [];
    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot !== 'A') return;
      queuedMarkers.push(fixture.save._restore(fixture.dataFor('B'), 'B'));
      queuedMarkers.push(fixture.requestNewGame('C'));
      queuedMarkers.push(fixture.save._restore(fixture.dataFor('D'), 'D'));
    });

    fixture.save._restore(fixture.dataFor('A'), 'A');
    assert(queuedMarkers.every((marker) => marker && marker.queued),
      'each nested request must acknowledge deferral');
    assert.equal(fixture.state.fixtureRoute, 'D', 'latest queued route D must win');
    assert.deepEqual(fixture.events
      .filter((entry) => entry.type === 'save:restoring')
      .map((entry) => entry.payload.slot), ['A', 'D'],
    'superseded B and C routes must never start or emit lifecycle events');
    assert.deepEqual(fixture.finalizerStarts, ['A', 'D']);
    assert.equal(fixture.newGameStarts, 0, 'superseded New Game C must never mutate state');

    fixture.gateFor('A').resolve();
    fixture.gateFor('D').resolve();
    await settlePromises();
    assert.deepEqual(fixture.snapshot(), {
      route: 'D', mode: 'flight', timeScale: 1, flights: 1, closes: 1,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    });
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    fixture.save._restore(fixture.dataFor('current-failure'), 'current-failure');
    const originalError = console.error;
    console.error = () => {};
    try {
      fixture.gateFor('current-failure').reject(new Error('current visual failure'));
      await settlePromises();
    } finally {
      console.error = originalError;
    }
    assert.deepEqual(fixture.snapshot(), {
      route: 'current-failure', mode: 'menu', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 1, gameFailures: 1, toasts: 1,
    }, 'current finalizer failure must surface exactly once through each owned player/save channel');
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    assert.throws(() => fixture.save.deferRunTransition(null), /callback/i,
      'save transition deferral must reject non-callable work');
    let ran = false;
    assert.equal(fixture.save.deferRunTransition(() => { ran = true; }), false,
      'deferral outside restore must return false without executing the callback');
    assert.equal(ran, false);
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    const restoreMeta = fixture.save._restoreMeta;
    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot === 'outer-load-error') fixture.save._restore(fixture.dataFor('winner-load'), 'winner-load');
    });
    fixture.save._restoreMeta = (meta) => {
      if (meta.route === 'outer-load-error') throw new Error('superseded outer load error');
      restoreMeta(meta);
    };
    let result = null;
    assert.doesNotThrow(() => {
      result = fixture.save._restore(fixture.dataFor('outer-load-error'), 'outer-load-error');
    }, 'a successful queued load must suppress the superseded outer destructive error');
    assert.equal(result && result.restored, false);
    assert.equal(result && result.stale, true);
    assert.equal(result && result.superseded, true);
    assert.equal(result && result.drained && result.drained.slot, 'winner-load');
    assert.deepEqual(fixture.snapshot(), {
      route: 'winner-load', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    });
    fixture.gateFor('winner-load').resolve();
    await settlePromises();
    assert.deepEqual(fixture.snapshot(), {
      route: 'winner-load', mode: 'flight', timeScale: 1, flights: 1, closes: 1,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    });
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot === 'outer-new-game-error') fixture.requestNewGame('winner-new-game');
    });
    fixture.save._restoreMeta = () => { throw new Error('superseded outer new-game error'); };
    let result = null;
    assert.doesNotThrow(() => {
      result = fixture.save._restore(fixture.dataFor('outer-new-game-error'), 'outer-new-game-error');
    }, 'a queued New Game must suppress the superseded outer destructive error');
    assert.equal(result && result.restored, false);
    assert.equal(result && result.stale, true);
    assert.equal(result && result.superseded, true);
    assert.deepEqual(fixture.snapshot(), {
      route: 'winner-new-game', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    });
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot === 'outer-envelope-error') fixture.requestNewGame('winner-envelope-new-game');
    });
    fixture.save._restoreMeta = () => { throw new Error('superseded envelope restore error'); };
    const loaded = fixture.save.loadEnvelope({
      fmt: 'spaceface-save',
      version: fixture.state.meta.version,
      data: fixture.dataFor('outer-envelope-error'),
    }, 'outer-envelope-error');
    assert.equal(loaded, true,
      'loadEnvelope must report success when its destructive error was superseded by a newer route');
    assert.deepEqual(fixture.snapshot(), {
      route: 'winner-envelope-new-game', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
      saveErrors: 0, gameFailures: 0, toasts: 0,
    });
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);
    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot === 'outer-failed-winner') {
        fixture.save._restore(fixture.dataFor('failed-winner'), 'failed-winner');
      }
    });
    fixture.save._restoreMeta = (meta) => { throw new Error(`${meta.route} destructive error`); };
    const originalError = console.error;
    console.error = () => {};
    let result = null;
    try {
      assert.doesNotThrow(() => {
        result = fixture.save._restore(fixture.dataFor('outer-failed-winner'), 'outer-failed-winner');
      }, 'a failed winning callback must still suppress the superseded outer error');
    } finally {
      console.error = originalError;
    }
    assert.equal(result && result.superseded, true);
    assert.deepEqual(fixture.events.filter((entry) => entry.type === 'save:error').map((entry) => entry.payload), [
      { slot: 'failed-winner', reason: 'load_failed' },
    ], 'only the winning queued load may surface its own error channel');
    assert.equal(fixture.events.filter((entry) => entry.type === 'toast').length, 0);
  }

  {
    const fixture = makeSerializedRestoreFixture(createEffects, createGuard);

    fixture.bus.on('save:restoring', ({ slot }) => {
      if (slot === 'outer-error') fixture.save.deferRunTransition(() => { throw new Error('queued error'); });
    });
    fixture.save._restoreMeta = () => { throw new Error('outer restore error'); };
    const originalError = console.error;
    console.error = () => {};
    let result = null;
    try {
      assert.doesNotThrow(() => {
        result = fixture.save._restore(fixture.dataFor('outer-error'), 'outer-error');
      }, 'a newer queued callback makes the older destructive error superseded');
    } finally {
      console.error = originalError;
    }
    assert.equal(result && result.superseded, true);
    assert.deepEqual(fixture.events.filter((entry) => entry.type === 'save:error')
      .map((entry) => entry.payload), [{ reason: 'deferred_transition_failed' }],
    'winning queued callback errors must surface only through their own slot-neutral save error path');
  }
}

function makeSerializedRestoreFixture(createEffects, createGuard) {
  const state = createGameState(7);
  state.mode = 'flight';
  state.fixtureRoute = 'initial';
  const effects = createEffects(state);
  const guard = createGuard();
  const rawBus = createBus();
  const events = [];
  const bus = {
    ...rawBus,
    emit(type, payload = {}) {
      events.push({ type, payload });
      rawBus.emit(type, payload);
    },
  };
  const gates = new Map();
  const finalizerStarts = [];
  const timeline = [];
  let flights = 0;
  let closes = 0;
  let newGameStarts = 0;

  bus.on('ui:closeAll', () => { closes += 1; });

  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = bus;
  save.registry = { get() { return null; } };
  save._restoring = false;
  save._pendingRunTransition = null;
  save._restoreSequence = 0;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  save.helpers = {
    beginLoadedGameTransition() { return guard.begin('load'); },
    finalizeLoadedGame({ slot, transitionToken }) {
      finalizerStarts.push(slot);
      timeline.push(`finalizer:${slot}`);
      state.mode = 'loading';
      effects.set('runtime:loading', { scale: 0 });
      const gate = gateFor(slot);
      return gate.promise.then(
        () => {
          if (!guard.isCurrent(transitionToken)) return { stale: true };
          guard.commit(transitionToken, () => {
            state.mode = 'flight';
            effects.clear('runtime:loading');
            flights += 1;
            bus.emit('ui:closeAll', { slot });
          });
          return { stale: false };
        },
        (error) => {
          if (!guard.isCurrent(transitionToken)) return { stale: true };
          state.mode = 'menu';
          effects.set('runtime:start-failed', { scale: 0 });
          effects.clear('runtime:loading');
          bus.emit('game:startFailed', { error: error.message });
          bus.emit('toast', { kind: 'error' });
          throw error;
        },
      );
    },
  };

  for (const method of [
    '_clearMissionRuntimeForRestore', '_clearEntities', '_restorePlayer', '_restoreCargo',
    '_spawnPlayer', '_applySavedVitals', '_applySavedPose', '_spawnPersistentEntities',
    '_clearStaleTargets', '_restoreCombat', '_restoreMissions', '_restoreScenario',
    '_restoreAutomation', '_restoreCrafting', '_restoreFlight', '_restoreNav',
    '_reconcileFlightReadyAfterLoad',
  ]) save[method] = () => {};
  save._restoreMeta = (meta) => {
    state.fixtureRoute = meta.route;
    timeline.push(`restore:${meta.route}`);
  };
  save._restoreSettings = (settings) => { state.fixtureSettingsRoute = settings.route; };
  save._callDeserialize = () => {};

  function gateFor(slot) {
    if (!gates.has(slot)) gates.set(slot, deferred());
    return gates.get(slot);
  }

  function dataFor(route) {
    return {
      meta: { route }, player: {}, cargo: {}, economy: {}, factions: {}, world: {},
      entities: {
        simTime: 8,
        tick: 9,
        persistent: [],
        player: {
          type: 'ship',
          pos: { x: 0, z: 0 },
          vel: { x: 0, z: 0 },
          data: { defId: 'ship_kestrel' },
        },
      },
      missions: {}, scenario: {},
      automation: {}, crafting: {}, sectorSim: {}, claims: {}, flight: {}, nav: {},
      settings: { route },
    };
  }

  function requestNewGame(route) {
    const start = () => {
      guard.begin(`new-game:${route}`);
      newGameStarts += 1;
      state.fixtureRoute = route;
      state.mode = 'loading';
      effects.reset();
      effects.set('runtime:loading', { scale: 0 });
      timeline.push(`new-game:${route}`);
    };
    if (save.deferRunTransition(start)) return { queued: true, route };
    start();
    return { queued: false, route };
  }

  function snapshot() {
    return {
      route: state.fixtureRoute,
      mode: state.mode,
      timeScale: state.timeScale,
      flights,
      closes,
      saveErrors: events.filter((entry) => entry.type === 'save:error').length,
      gameFailures: events.filter((entry) => entry.type === 'game:startFailed').length,
      toasts: events.filter((entry) => entry.type === 'toast').length,
    };
  }

  return {
    state, effects, guard, bus, events, save, dataFor, gateFor, requestNewGame, snapshot,
    finalizerStarts, timeline,
    get newGameStarts() { return newGameStarts; },
  };
}

function makeSaveFixture(createEffects, finalizeLoadedGame = null) {
  const state = createGameState(6);
  state.mode = 'flight';
  const effects = createEffects(state);
  const events = [];
  const bus = {
    emit(type, payload = {}) { events.push({ type, payload }); },
  };
  const save = Object.create(saveDefinition);
  save.state = state;
  save.bus = bus;
  save.helpers = finalizeLoadedGame ? { finalizeLoadedGame } : {};
  save.registry = { get() { return null; } };
  save._restoring = false;
  save._lastAutosaveAt = 0;
  save._lastAutosavePlaytime = 0;
  for (const method of [
    '_restoreMeta', '_clearMissionRuntimeForRestore', '_clearEntities', '_restorePlayer',
    '_restoreCargo', '_spawnPlayer', '_applySavedVitals', '_applySavedPose',
    '_spawnPersistentEntities', '_clearStaleTargets', '_restoreCombat', '_restoreMissions',
    '_restoreScenario', '_restoreAutomation', '_restoreCrafting', '_restoreFlight', '_restoreNav',
    '_restoreSettings', '_reconcileFlightReadyAfterLoad',
  ]) save[method] = () => {};
  save._callDeserialize = () => {};
  const data = {
    meta: {}, player: {}, cargo: {}, economy: {}, factions: {}, world: {},
    entities: { simTime: 8, tick: 9, persistent: [] }, missions: {}, scenario: {},
    automation: {}, crafting: {}, sectorSim: {}, claims: {}, flight: {}, nav: {}, settings: {},
  };
  return { state, effects, events, bus, save, data };
}

function testTimeScaleWriterAudit(scan) {
  const malicious = `
state.timeScale = 0;
state['timeScale'] += 0.1;
state["timeScale"] ??= 1;
state[\`timeScale\`]--;
++state.timeScale;
delete state['timeScale'];
Object.assign(state, { timeScale: 0 });
Object.assign(state, { ['timeScale']: 0 });
Reflect.set(state, 'timeScale', 0);
Object.defineProperty(state, "timeScale", { value: 0 });
Object.defineProperties(state, { timeScale: { value: 0 } });
Object.defineProperties(state, { ['timeScale']: { value: 0 } });
const apply = \`(() => { state.timeScale = 0; })()\`;
const applyInterpolated = \`(() => { state.timeScale = \${value}; })()\`;
[state.timeScale] = [0];
({ x: state.timeScale } = { x: 0 });
for (state.timeScale of [0]) {}
for (state.timeScale in { 0: true }) {}
Object['assign'](state, { timeScale: 0 });
Object['defineProperty'](state, 'timeScale', { value: 0 });
Object['defineProperties'](state, { timeScale: { value: 0 } });
Reflect['set'](state, 'timeScale', 0);
Reflect['defineProperty'](state, 'timeScale', { value: 0 });
const escapedApply = \`(() => { state.time\\u0053cale = 0; })()\`;
`;
  const findings = scan(malicious, 'fixture/malicious.mjs');
  assert.equal(findings.length, 24,
    `writer audit must catch every mutation fixture; got ${findings.map((finding) => finding.kind).join(', ')}`);
  assert(findings.every((finding) => finding.file === 'fixture/malicious.mjs'));
  assert(findings.every((finding) => Number.isInteger(finding.line) && finding.line > 0));
  assert(findings.every((finding) => Number.isInteger(finding.column) && finding.column > 0));
  const embedded = findings.find((finding) => finding.snippet.includes('const apply'));
  assert.equal(embedded && embedded.line, 14,
    'executable template-string findings must retain the usable outer source line');
  const interpolated = findings.find((finding) => finding.snippet.includes('applyInterpolated'));
  assert.equal(interpolated && interpolated.line, 15,
    'interpolated executable templates must preserve and audit raw code around substitutions');
  const escapedIdentifier = findings.find((finding) => finding.snippet.includes('escapedApply'));
  assert.equal(escapedIdentifier && escapedIdentifier.line, 25,
    'statically resolvable identifier escapes in executable templates must retain outer diagnostics');

  const benign = `
const scale = state.timeScale;
if (state.timeScale === 0) consume(scale);
const snapshot = { timeScale: state.timeScale };
const key = 'timeScale';
Object.assign(state, { playbackRate: 0.5 });
Object.assign({ timeScale: 1 }, patch);
const [arrayRead] = [state.timeScale];
const { x: objectRead } = { x: state.timeScale };
for (const read of [state.timeScale]) consume(read);
Object['merge'](state, { timeScale: 0 });
Reflect['get'](state, 'timeScale');
Object['defineProperty'](state, 'playbackRate', { value: 1 });
const escapedSpaceProgram = \`(() => { const value = 1;\\u0020return value; })()\`;
Reflect.get(state, 'timeScale');
Object.defineProperty(state, 'playbackRate', { value: 1 });
`;
  assert.deepEqual(scan(benign, 'fixture/benign.mjs'), [],
    'writer audit must allow reads, equality checks, strings, and unrelated object writes');
}

function testWriterAndRuntimeContracts(auditWriters, formatFindings) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  for (const broadGate of ['check', 'check:ci']) {
    const command = packageJson.scripts[broadGate];
    const matches = command.match(/npm run check:time-effects/g) || [];
    assert.equal(matches.length, 1, `${broadGate} must execute check:time-effects exactly once`);
    assert.match(command, /npm run check:launch-policy && npm run check:time-effects/,
      `${broadGate} must run time-effects immediately after launch-policy`);
  }
  const writerFindings = auditWriters(root);
  assert.deepEqual(writerFindings, [],
    `time-effects service must be the sole scalar writer:\n${formatFindings(writerFindings)}`);

  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  const newGameStart = fs.readFileSync(path.join(root, 'src/core/newGameStartTransition.js'), 'utf8');
  assert(main.indexOf('createTimeEffects(state)') < main.indexOf('createRegistry(ctx)'),
    'main must create time-effects before registry initialization');
  assert.match(main, /ctx\s*=\s*\{[^}]*timeEffects/s, 'main context must expose the service');
  assert.match(main, /window\.SF[^;]*timeEffects/s, 'debug surface must expose the service');
  assert.match(main, /runtime:boot-menu/);
  assert.match(main, /runtime:loading/);
  assert.match(main, /runtime:start-failed/);
  assert.match(main, /createRunTransitionGuard/);
  assert.match(main, /const runTransitionGuard = createRunTransitionGuard\(\);/,
    'boot must create one transition generation owner');
  assert.match(main, /beginLoadedGameTransition\s*=\s*\(\)\s*=>\s*runTransitionGuard\.begin\('load'\)/,
    'save restore must reserve its load token before reentrant lifecycle events');
  assert.match(
    main,
    /bus\.on\('game:new',[\s\S]*const startNewGameTransition\s*=\s*\(\)\s*=>\s*\{[\s\S]*runTransitionGuard\.begin\('new-game'\)[\s\S]*startNewGame\([\s\S]*registry\.get\('save'\)[\s\S]*deferRunTransition\(startNewGameTransition\)[\s\S]*startNewGameTransition\(\)/,
    'the entire new-game token/start operation must serialize behind an active save restore',
  );
  assert((main.match(/runTransitionGuard\.isCurrent\(transitionToken\)/g) || []).length >= 7,
    'main must check transition ownership after every readiness await and in both failure paths');
  const guardedCommits = (main.match(/runTransitionGuard\.commit\(transitionToken/g) || []).length
    + (newGameStart.match(/guard\.commit\(token/g) || []).length;
  assert(guardedCommits >= 2,
    'new-game and load success must commit through the one-shot guard');
  assert.match(main, /catch \(error\)[\s\S]*failGameStart\([^;]+;[\s\S]*throw error;/,
    'loaded-game visual startup failure must be surfaced and rethrown to save');

  const saveSource = fs.readFileSync(path.join(root, 'src/save/saveSystem.js'), 'utf8');
  assert.match(saveSource, /deferRunTransition\(callback\)[\s\S]*typeof callback !== 'function'[\s\S]*if \(!this\._restoring\) return false;[\s\S]*this\._pendingRunTransition = callback;/,
    'save must expose one validated latest-wins transition queue');
  const restoreEntry = saveSource.search(/\b_restore\(data,\s*slot(?:,\s*options\s*=\s*\{\})?\)\s*\{/);
  const nestedGuard = saveSource.indexOf('if (this._restoring)', restoreEntry);
  const tokenReservation = saveSource.indexOf('beginLoadedGameTransition', restoreEntry);
  assert(restoreEntry >= 0 && nestedGuard > restoreEntry && nestedGuard < tokenReservation,
    'nested restore must queue before reserving a token or entering destructive lifecycle work');
  assert(saveSource.indexOf('beginLoadedGameTransition') < saveSource.indexOf("this.bus.emit('save:restoring'"),
    'validated restore must reserve the transition token before save:restoring can reenter');
  assert.match(
    saveSource,
    /const finalizerPayload\s*=\s*transitionToken\s*\?\s*\{\s*slot,\s*transitionToken\s*\}\s*:\s*\{\s*slot\s*\};[\s\S]*finalizeLoadedGame\(finalizerPayload\)/,
    'save must pass the restore-start token into the authored-visual finalizer when the runtime transition hook is installed',
  );
  assert.match(saveSource, /const pendingRunTransition\s*=\s*this\._pendingRunTransition;[\s\S]*this\._pendingRunTransition\s*=\s*null;[\s\S]*this\._restoring\s*=\s*false;[\s\S]*pendingRunTransition\(\)/,
    'restore cleanup must release synchronous ownership before draining the one latest route');
  assert.match(saveSource, /if \(!this\._pendingRunTransition\)\s*(?:\{\s*)?this\.bus\.emit\('settings:changed'/,
    'a superseded restore must not publish stale settings effects before its queued route drains');

  const probe = fs.readFileSync(path.join(root, 'scripts/probe-performance-profile.mjs'), 'utf8');
  assert.match(probe, /probe:performance-profile/);
  assert.doesNotMatch(probe, /VARIANT_RESTORE__\.timeScale/,
    'performance probe must not snapshot or restore the scalar directly');
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function settlePromises() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function installDomFixture() {
  const elements = new Map();
  class FakeClassList {
    constructor() { this.values = new Set(); }
    add(...values) { values.forEach((value) => this.values.add(value)); }
    remove(...values) { values.forEach((value) => this.values.delete(value)); }
    toggle(value, force) {
      if (force === undefined) force = !this.values.has(value);
      if (force) this.values.add(value); else this.values.delete(value);
      return force;
    }
  }
  class FakeElement {
    constructor(tagName = 'div') {
      this.tagName = String(tagName).toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.dataset = {};
      this.classList = new FakeClassList();
      this.attributes = new Map();
      this.hidden = false;
      this.disabled = false;
      this.isConnected = true;
      this.inert = false;
      this.id = '';
    }
    appendChild(child) { child.parentNode = this; this.children.push(child); if (child.id) elements.set(child.id, child); return child; }
    addEventListener() {}
    removeEventListener() {}
    querySelectorAll() { return []; }
    querySelector() { return null; }
    setAttribute(name, value) { this.attributes.set(name, String(value)); }
    removeAttribute(name) { this.attributes.delete(name); }
    getAttribute(name) { return this.attributes.get(name) ?? null; }
    contains(candidate) { for (let node = candidate; node; node = node.parentNode) if (node === this) return true; return false; }
    focus() { document.activeElement = this; }
    blur() { if (document.activeElement === this) document.activeElement = document.body; }
    getContext() {
      return {
        clearRect() {}, fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        createRadialGradient() { return { addColorStop() {} }; },
        createLinearGradient() { return { addColorStop() {} }; },
        set globalCompositeOperation(_value) {},
      };
    }
  }
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const screens = new FakeElement('div'); screens.id = 'screens'; elements.set('screens', screens); body.appendChild(screens);
  const backdrop = new FakeElement('div'); backdrop.id = 'modal-backdrop'; elements.set('modal-backdrop', backdrop); body.appendChild(backdrop);
  const hud = new FakeElement('div'); hud.id = 'hud'; elements.set('hud', hud); body.appendChild(hud);
  globalThis.document = {
    body, head, activeElement: body,
    getElementById(id) { return elements.get(id) || null; },
    createElement(tagName) { return new FakeElement(tagName); },
    addEventListener() {},
    removeEventListener() {},
  };
  globalThis.window = { innerWidth: 1920, innerHeight: 1080, addEventListener() {}, removeEventListener() {} };
  globalThis.requestAnimationFrame = (callback) => { callback(0); return 1; };
  globalThis.cancelAnimationFrame = () => {};
}
