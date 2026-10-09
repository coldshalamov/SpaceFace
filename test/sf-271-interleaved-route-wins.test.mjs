// SF-271 — newest valid route wins under interleaved New Game / Continue / readiness callbacks.
// Scope: the guard alone is proven in test/time-effects.test.mjs; this file drives the REAL
// save._restore serialization queue (deferred transition drain, save:restoring reentrancy) AND
// the REAL runNewGameStartTransition readiness pipeline against one shared guard, so a stale
// finalizer, a stale sector/asset-ready await, a stale progress callback, and a superseded
// destructive error are all tested against the callers that own them — not a re-implemented
// guard model. Assertions pin public effects: mode, timeScale owner, ui:closeAll count,
// flight commits, error/toast channels, and the route that actually entered flight.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createTimeEffects } from '../src/core/timeEffects.js';
import { createRunTransitionGuard } from '../src/core/runTransitionGuard.js';
import { runNewGameStartTransition } from '../src/core/newGameStartTransition.js';
import { save as saveDefinition } from '../src/save/saveSystem.js';

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

// The serialized-restore fixture from time-effects.test.mjs, extended so `requestNewGame`
// runs the REAL readiness pipeline (per-stage gates stand in for library/visual/physics
// readiness — the "sector-ready" callbacks this packet names) instead of a stub begin().
function makeFixture() {
  const state = createGameState(7);
  state.mode = 'flight';
  state.fixtureRoute = 'initial';
  const effects = createTimeEffects(state);
  const guard = createRunTransitionGuard();
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
  const progress = [];
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
    // Mirrors main.js finalizeLoadedGame: the visual gate may only publish flight through the
    // token issued for THIS restore — a stale settle/reject returns { stale: true } instead.
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
  save._restoreSettings = () => {};
  save._callDeserialize = () => {};

  function gateFor(slot) {
    if (!gates.has(slot)) gates.set(slot, deferred());
    return gates.get(slot);
  }

  function dataFor(route) {
    return {
      meta: { route }, player: {}, cargo: {}, economy: {}, factions: {}, world: {},
      entities: {
        simTime: 8, tick: 9, persistent: [],
        player: { type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { defId: 'ship_kestrel' } },
      },
      missions: {}, scenario: {}, automation: {}, crafting: {}, sectorSim: {}, claims: {},
      flight: {}, nav: {}, settings: { route },
    };
  }

  // main.js wires game:new the same way: the whole begin+pipeline serializes behind an active
  // restore via deferRunTransition, otherwise it starts immediately. The transition itself is
  // the production readiness pipeline — prepareRun then the async readiness gates (the
  // sector-ready / asset-ready callbacks) then the one-shot flight commit.
  // `failAt` makes that stage's wait report not-ready so the pipeline throws its coded
  // GameStartReadinessError; all gates resolve so the failure is actually reached (a pending
  // earlier stage would hang the pipeline instead). Hard rejections are exercised by rejecting
  // a stage gate directly from the test.
  function requestNewGame(route, { failAt = null } = {}) {
    const stageGates = {
      library: deferred(), visuals: deferred(), physics: deferred(),
    };
    // A superseded pipeline exits before it ever awaits its remaining gates, so a gate the
    // test rejects directly would otherwise surface as an unhandled rejection rather than
    // the pipeline's stale return — mark the fixture promises handled up front.
    for (const gate of Object.values(stageGates)) gate.promise.catch(() => {});
    if (failAt) {
      stageGates.library.resolve();
      stageGates.visuals.resolve();
      stageGates.physics.resolve();
    }
    let done = null;
    const start = () => {
      const token = guard.begin(`new-game:${route}`);
      newGameStarts += 1;
      state.fixtureRoute = route;
      state.mode = 'loading';
      effects.reset();
      effects.set('runtime:loading', { scale: 0 });
      timeline.push(`new-game:${route}`);
      done = runNewGameStartTransition({
        guard,
        token,
        prepareRun: async () => { timeline.push(`prepare:${route}`); state.preparedRoute = route; },
        waitForLibrary: () => stageGates.library.promise.then(() => failAt !== 'library'),
        waitForVisuals: () => stageGates.visuals.promise.then(() => failAt !== 'visuals'),
        waitForPhysics: () => stageGates.physics.promise.then(() => failAt !== 'physics'),
        yieldForPresentation: () => Promise.resolve(),
        // The pipeline itself must gate stale routes out of this callback — record raw.
        reportProgress: (stage) => { progress.push(`${route}:${stage.id}`); },
        enterFlight: () => {
          state.mode = 'flight';
          effects.clear('runtime:loading');
          flights += 1;
          bus.emit('ui:closeAll', { route });
        },
      });
      return done;
    };
    const queued = save.deferRunTransition(start);
    if (queued) return { queued: true, route, stageGates, done: () => done };
    start();
    return { queued: false, route, stageGates, done: () => done };
  }

  function snapshot() {
    return {
      route: state.fixtureRoute,
      mode: state.mode,
      timeScale: state.timeScale,
      flights,
      closes,
      newGameStarts,
      saveErrors: events.filter((entry) => entry.type === 'save:error').length,
      gameFailures: events.filter((entry) => entry.type === 'game:startFailed').length,
      toasts: events.filter((entry) => entry.type === 'toast').length,
    };
  }

  return {
    state, effects, guard, bus, events, save, dataFor, gateFor, requestNewGame, snapshot,
    finalizerStarts, timeline, progress,
    get newGameStarts() { return newGameStarts; },
    get flights() { return flights; },
    get closes() { return closes; },
  };
}

test('SF-271 a load finalizer resolving after New Game begins cannot publish or unfreeze', async () => {
  const fixture = makeFixture();
  fixture.save._restore(fixture.dataFor('A'), 'A');
  assert.deepEqual(fixture.snapshot(), {
    route: 'A', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
    newGameStarts: 0, saveErrors: 0, gameFailures: 0, toasts: 0,
  });

  // New Game supersedes the pending visual finalizer — the real readiness pipeline, not a stub.
  const ng = fixture.requestNewGame('N');
  assert.equal(ng.queued, false, 'restore synchronous ownership ended; new game starts directly');

  fixture.gateFor('A').resolve();
  await settlePromises();
  assert.deepEqual(fixture.snapshot(), {
    route: 'N', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  }, 'resolved stale finalizer must leave N loading under N\'s own freeze');

  ng.stageGates.library.resolve();
  ng.stageGates.visuals.resolve();
  ng.stageGates.physics.resolve();
  const result = await ng.done();
  assert.deepEqual(result, { stale: false, enteredFlight: true });
  assert.deepEqual(fixture.snapshot(), {
    route: 'N', mode: 'flight', timeScale: 1, flights: 1, closes: 1,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  }, 'the newest valid route enters flight exactly once');
});

test('SF-271 a load finalizer REJECTING after New Game begins cannot fail or unfreeze N', async () => {
  const fixture = makeFixture();
  fixture.save._restore(fixture.dataFor('A'), 'A');
  const ng = fixture.requestNewGame('N');
  assert.equal(ng.queued, false);

  fixture.gateFor('A').reject(new Error('stale A visual failure'));
  await settlePromises();
  assert.deepEqual(fixture.snapshot(), {
    route: 'N', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  }, 'rejected stale finalizer must not surface A-channel errors or release N\'s freeze');

  ng.stageGates.library.resolve();
  ng.stageGates.visuals.resolve();
  ng.stageGates.physics.resolve();
  const result = await ng.done();
  assert.deepEqual(result, { stale: false, enteredFlight: true });
  assert.deepEqual(fixture.snapshot(), {
    route: 'N', mode: 'flight', timeScale: 1, flights: 1, closes: 1,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  });
});

test('SF-271 readiness awaits settling after a newer load begins are inert — B owns flight', async () => {
  const fixture = makeFixture();
  const ng = fixture.requestNewGame('N');
  assert.equal(ng.queued, false);
  // The sector/asset readiness of N is still pending when the player hits Continue.
  fixture.save._restore(fixture.dataFor('B'), 'B');
  assert.equal(fixture.state.fixtureRoute, 'B', 'newer load took the route while N was unready');
  // N may legitimately publish its earliest stage before B begins; once B owns the token the
  // pipeline's publishProgress gate must silence every later N stage.
  const nProgressAtSupersede = fixture.progress.filter((entry) => entry.startsWith('N:')).length;

  // Every stale N stage settles in order — none may publish progress, flight, or errors.
  ng.stageGates.library.resolve();
  ng.stageGates.visuals.resolve();
  ng.stageGates.physics.resolve();
  const result = await ng.done();
  assert.equal(result.stale, true);
  assert.equal(result.enteredFlight, false);
  await settlePromises();
  assert.deepEqual(fixture.snapshot(), {
    route: 'B', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  }, 'settling every stale readiness gate must not touch B mode, freeze, UI, or error channels');
  const nProgressAfterSettle = fixture.progress.filter((entry) => entry.startsWith('N:')).length;
  assert.equal(nProgressAfterSettle, nProgressAtSupersede,
    'the stale route published no progress after it lost the token');

  fixture.gateFor('B').resolve();
  await settlePromises();
  assert.deepEqual(fixture.snapshot(), {
    route: 'B', mode: 'flight', timeScale: 1, flights: 1, closes: 1,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  }, 'the newest valid route enters flight exactly once');
});

test('SF-271 a New Game queued mid-restore drains as winner and runs the real pipeline once', async () => {
  const fixture = makeFixture();
  let ng = null;
  fixture.bus.on('save:restoring', ({ slot }) => {
    if (slot === 'A') ng = fixture.requestNewGame('N');
  });
  const outer = fixture.save._restore(fixture.dataFor('A'), 'A');
  assert.equal(ng && ng.queued, true, 'the whole begin+pipeline serializes behind the restore');
  assert.equal(fixture.state.fixtureRoute, 'N', 'drained new game owns the route');
  assert.deepEqual(fixture.finalizerStarts, ['A'],
    'A\'s finalizer began before synchronous ownership released and N drained');
  assert.deepEqual(fixture.snapshot(), {
    route: 'N', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  });
  assert.equal(outer && outer.restored, true, 'A itself restored; only its route lost');

  fixture.gateFor('A').resolve();
  await settlePromises();
  assert.equal(fixture.flights, 0, 'stale A finalizer cannot enter flight for N');

  ng.stageGates.library.resolve();
  ng.stageGates.visuals.resolve();
  ng.stageGates.physics.resolve();
  const result = await ng.done();
  assert.deepEqual(result, { stale: false, enteredFlight: true });
  assert.equal(fixture.flights, 1);
  assert.equal(fixture.closes, 1);
  assert.equal(fixture.state.mode, 'flight');
});

test('SF-271 a stale route\'s failed readiness is suppressed — it never throws or surfaces errors', async () => {
  const fixture = makeFixture();
  const ng = fixture.requestNewGame('N');
  fixture.save._restore(fixture.dataFor('B'), 'B');

  // N's library wait REJECTS after losing the token: the pipeline must swallow it as stale,
  // not run discardRun/game:startFailed against B's in-flight world.
  ng.stageGates.library.reject(new Error('stale N library failure'));
  const result = await ng.done();
  assert.deepEqual(result, { stale: true, enteredFlight: false });
  await settlePromises();
  assert.deepEqual(fixture.snapshot(), {
    route: 'B', mode: 'loading', timeScale: 0, flights: 0, closes: 0,
    newGameStarts: 1, saveErrors: 0, gameFailures: 0, toasts: 0,
  }, 'a superseded route\'s failure must be quiet — B owns every channel');
});

test('SF-271 a current route\'s failed readiness still surfaces through its own channel', async () => {
  const fixture = makeFixture();
  const ng = fixture.requestNewGame('N', { failAt: 'visuals' });
  const result = await ng.done().then(
    () => ({ threw: false }),
    (error) => ({ threw: true, error }),
  );
  assert.equal(result.threw, true, 'the CURRENT route\'s readiness failure must propagate to its caller');
  assert.equal(result.error && result.error.code, 'AUTHORED_VISUALS_UNAVAILABLE');
  await settlePromises();
  assert.equal(fixture.flights, 0, 'a failed current route never commits flight');
  assert.equal(fixture.state.fixtureRoute, 'N', 'the failed route still owns the route until a newer begin');
});
