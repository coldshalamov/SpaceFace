import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  beginScreenRegistrationCycle,
  destroyCommsOwner,
  destroyMarketNewsOwner,
  invalidateScreenRegistrationCycle,
  isScreenRegistrationCycleCurrent,
  isScreenRegistrationCycleSettled,
  replaceMarketNewsOwner,
  replaceCommsOwner,
  invalidateDockedStationPresentation,
  reconcileDockedStationPresentation,
  reconcileGameStartedScreens,
  scheduleDockedStationPresentation,
  ui,
} from '../src/ui/uiRoot.js';

function installFakeTimers() {
  const realSetTimeout = globalThis.setTimeout;
  const realClearTimeout = globalThis.clearTimeout;
  const jobs = new Map();
  let nextId = 0;
  globalThis.setTimeout = (callback, delay = 0) => {
    const id = ++nextId;
    jobs.set(id, { callback, delay });
    return id;
  };
  globalThis.clearTimeout = (id) => { jobs.delete(id); };
  return {
    pending() {
      return jobs.size;
    },
    runNext() {
      const next = jobs.entries().next();
      if (next.done) return false;
      jobs.delete(next.value[0]);
      next.value[1].callback();
      return true;
    },
    restore() {
      globalThis.setTimeout = realSetTimeout;
      globalThis.clearTimeout = realClearTimeout;
    },
  };
}

function makeRetryOwner(id) {
  const pushes = [];
  let top = null;
  const manager = {
    pushScreen(screenId) {
      pushes.push(screenId);
      top = screenId;
    },
    top() { return top; },
    destroy() {},
  };
  const owner = Object.create(ui);
  owner.screenManager = manager;
  owner._registeredScreens = new Set();
  owner._gameOverShown = id === 'gameOver';
  owner._crucibleResultsShown = id === 'crucibleResults';
  owner._survivalRunLive = () => false;
  owner.state = {
    mode: 'flight',
    ui: {
      docked: id === 'station',
      dockedStationId: id === 'station' ? 'station-test' : null,
      pendingDrillAsteroidId: id === 'drill' ? 'asteroid-1' : null,
    },
  };
  owner._screenRegistrationCycle = beginScreenRegistrationCycle(owner, manager);
  return { owner, manager, pushes };
}

test('a destroyed or reinitialized uiRoot cannot complete stale screen registrations', () => {
  const firstManager = { id: 'first' };
  const owner = { screenManager: firstManager };
  const firstCycle = beginScreenRegistrationCycle(owner, firstManager);
  assert.equal(isScreenRegistrationCycleCurrent(firstCycle), true);
  assert.equal(isScreenRegistrationCycleSettled(owner), false);
  owner._screenRegistrationSettledGeneration = firstCycle.generation;
  assert.equal(isScreenRegistrationCycleSettled(owner), true);

  invalidateScreenRegistrationCycle(owner);
  owner.screenManager = null;
  assert.equal(isScreenRegistrationCycleCurrent(firstCycle), false);

  owner.screenManager = firstManager;
  assert.equal(
    isScreenRegistrationCycleCurrent(firstCycle),
    false,
    'restoring the old manager reference must not revive a destroyed registration generation',
  );

  const secondManager = { id: 'second' };
  owner.screenManager = secondManager;
  const secondCycle = beginScreenRegistrationCycle(owner, secondManager);
  assert.equal(isScreenRegistrationCycleCurrent(firstCycle), false);
  assert.equal(isScreenRegistrationCycleCurrent(secondCycle), true);
  assert.equal(isScreenRegistrationCycleSettled(owner), false);
});

test('a stale game-over retry is canceled when a new game or dismissal clears its request', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('gameOver');
    owner._pushScreenWhenRegistered('gameOver');
    assert.equal(clock.pending(), 1);

    owner._gameOverShown = false;
    owner._cancelPendingScreenRetry();
    owner._registeredScreens.add('gameOver');
    assert.equal(clock.pending(), 0);
    assert.equal(clock.runNext(), false);
    assert.deepEqual(pushes, []);
  } finally {
    clock.restore();
  }
});

test('a restored defeat can replace a canceled game-over retry after save closeAll', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('gameOver');
    owner._pushScreenWhenRegistered('gameOver');
    owner._gameOverShown = false;
    owner._cancelPendingScreenRetry();

    // save:loaded closes the old stack, then deliberately re-issues the durable defeat surface.
    owner._gameOverShown = true;
    owner._pushScreenWhenRegistered('gameOver');
    owner._registeredScreens.add('gameOver');
    assert.equal(clock.pending(), 1);
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, ['gameOver']);
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('a crucible-results retry cannot open through a replacement registration manager', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes: oldPushes } = makeRetryOwner('crucibleResults');
    owner._pushScreenWhenRegistered('crucibleResults');
    const replacementPushes = [];
    const replacementManager = {
      pushScreen(screenId) {
        replacementPushes.push(screenId);
      },
      destroy() {},
    };
    owner.screenManager = replacementManager;
    owner._screenRegistrationCycle = beginScreenRegistrationCycle(owner, replacementManager);
    owner._registeredScreens = new Set(['crucibleResults']);

    assert.equal(clock.runNext(), true);
    assert.deepEqual(oldPushes, []);
    assert.deepEqual(replacementPushes, []);
    assert.equal(owner._pendingScreenRetry, null);

    owner._pushScreenWhenRegistered('crucibleResults');
    assert.deepEqual(replacementPushes, ['crucibleResults']);
  } finally {
    clock.restore();
  }
});

test('destroy cancels pending screen retries and leaves no timer job', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('gameOver');
    owner._pushScreenWhenRegistered('gameOver');
    assert.equal(clock.pending(), 1);
    owner.destroy();
    assert.equal(clock.pending(), 0);
    assert.equal(clock.runNext(), false);
    assert.deepEqual(pushes, []);
  } finally {
    clock.restore();
  }
});

test('a valid late initial registration opens exactly once after a retry delay', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('gameOver');
    owner._pushScreenWhenRegistered('gameOver');
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, []);
    assert.equal(clock.pending(), 1);

    owner._registeredScreens.add('gameOver');
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, ['gameOver']);
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('a delayed game:start cleanup preserves a committed dock and restores station', () => {
  const calls = [];
  const owner = {
    state: { mode: 'flight', ui: { docked: true, dockedStationId: 'station-helios' } },
    _cancelPendingScreenRetry() { calls.push('cancel-retry'); },
    _pushScreenWhenRegistered(id, attempts) { calls.push(`push:${id}:${attempts}`); },
    screenManager: {
      closeAll() { calls.push('close-all'); },
      releaseScreen(id) { calls.push(`release:${id}`); },
      syncVisibility() { calls.push('sync'); },
    },
  };

  assert.equal(reconcileGameStartedScreens(owner), true);
  assert.deepEqual(calls, [
    'cancel-retry', 'close-all', 'release:newGame', 'release:saveLoad', 'sync', 'push:station:200',
  ]);
});

test('a fresh game:start still closes stale screens without restoring station', () => {
  const calls = [];
  const owner = {
    state: { mode: 'flight', ui: { docked: false, dockedStationId: null } },
    _cancelPendingScreenRetry() { calls.push('cancel-retry'); },
    _pushScreenWhenRegistered() { throw new Error('fresh start must not restore station'); },
    screenManager: {
      closeAll() { calls.push('close-all'); },
      releaseScreen(id) { calls.push(`release:${id}`); },
      syncVisibility() { calls.push('sync'); },
    },
  };

  assert.equal(reconcileGameStartedScreens(owner), false);
  assert.deepEqual(calls, [
    'cancel-retry', 'close-all', 'release:newGame', 'release:saveLoad', 'sync',
  ]);
});

test('delayed game:start releases the canceled dock fade lease before restoring station', () => {
  const clock = installFakeTimers();
  try {
    const calls = [];
    const releases = [];
    const owner = {
      state: { mode: 'flight', ui: { docked: true, dockedStationId: 'station-helios' } },
      _cancelPendingScreenRetry() { calls.push('cancel-retry'); },
      _pushScreenWhenRegistered(id, attempts) { calls.push(`push:${id}:${attempts}`); },
      screenManager: {
        closeAll() { calls.push('close-all'); },
        releaseScreen(id) { calls.push(`release:${id}`); },
        syncVisibility() { calls.push('sync'); },
      },
    };

    scheduleDockedStationPresentation(
      owner,
      'station-helios',
      () => { calls.push('stale-present'); },
      () => { releases.push('dock'); },
    );
    assert.equal(clock.pending(), 1);

    assert.equal(reconcileGameStartedScreens(owner), true);
    assert.deepEqual(releases, ['dock'], 'the canceled presentation releases its own dock lease');
    assert.equal(clock.pending(), 0, 'the canceled 400ms callback cannot run after restoration');
    assert.equal(clock.runNext(), false);
    assert.equal(calls.includes('stale-present'), false);
    assert.equal(calls.at(-1), 'push:station:200');
  } finally {
    clock.restore();
  }
});

test('replacing a dock transition releases only the old transition lease', () => {
  const clock = installFakeTimers();
  try {
    const released = [];
    const owner = {
      state: { mode: 'flight', ui: { docked: true, dockedStationId: 'station-old' } },
    };

    scheduleDockedStationPresentation(owner, 'station-old', () => {}, () => released.push('old'));
    owner.state.ui.dockedStationId = 'station-new';
    scheduleDockedStationPresentation(owner, 'station-new', () => {}, () => released.push('new'));
    assert.deepEqual(released, ['old']);

    invalidateDockedStationPresentation(owner);
    assert.deepEqual(released, ['old', 'new']);
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('worker-lane dock presentation waits for the authoritative main-state mirror', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('station');
    owner.ctx = { simLane: 'worker' };
    owner.state.mode = 'flight';
    // The two lane input folds can land in separate worker replies. Neither partial mirror
    // (docked=true with an old/missing berth, or docked=false) is presentation authority.
    owner.state.ui.docked = true;
    owner.state.ui.dockedStationId = 'old-station';
    owner._registeredScreens.add('station');
    const releases = [];

    scheduleDockedStationPresentation(owner, 'station-test', (finish) => {
      owner._pushScreenWhenRegistered('station');
      setTimeout(finish, 50);
    }, () => releases.push('dock'));

    assert.equal(clock.runNext(), true, 'the dock presentation reaches its 400ms swap');
    assert.deepEqual(pushes, [], 'the presentation does not open before authoritative state arrives');
    assert.deepEqual(releases, [], 'the dock fade stays owned through the mirror wait');
    assert.equal(clock.runNext(), true, 'the mirror-wait path still releases the dock fade');
    assert.deepEqual(releases, ['dock']);

    owner.state.ui.docked = true;
    owner.state.ui.dockedStationId = 'station-test';
    assert.equal(reconcileDockedStationPresentation(owner), true);
    assert.deepEqual(pushes, ['station'], 'the station opens once the main mirror confirms the dock');
    assert.equal(owner._pendingDockedStationPresentation, null);
  } finally {
    clock.restore();
  }
});

test('a deferred dock presentation cannot reopen station after undock/menu invalidation', () => {
  const clock = installFakeTimers();
  try {
    const pushes = [];
    const owner = {
      state: { mode: 'flight', ui: { docked: true, dockedStationId: 'station-helios' } },
    };
    scheduleDockedStationPresentation(owner, 'station-helios', () => pushes.push('station'));
    owner.state.ui.docked = false;
    owner.state.ui.dockedStationId = null;
    invalidateDockedStationPresentation(owner);
    assert.equal(clock.runNext(), false, 'invalidating the transition cancels its timer');
    assert.deepEqual(pushes, []);

    owner.state.mode = 'menu';
    owner.state.ui.docked = true;
    owner.state.ui.dockedStationId = 'station-helios';
    scheduleDockedStationPresentation(owner, 'station-helios', () => pushes.push('stale-menu'));
    owner.state.ui.docked = false;
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, [], 'the live-state guard rejects a menu/undocked callback');

    let canceled = 0;
    owner._pendingScreenRetry = { id: 'station' };
    owner._cancelPendingScreenRetry = () => { canceled += 1; owner._pendingScreenRetry = null; };
    invalidateDockedStationPresentation(owner);
    assert.equal(canceled, 1, 'invalidating a dock also cancels a retry started by its callback');
  } finally {
    clock.restore();
  }
});

test('station retry still waits for deferred registration after lifecycle restoration', () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('station');
    owner._pushScreenWhenRegistered('station');
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, []);
    owner._registeredScreens.add('station');
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, ['station']);
  } finally {
    clock.restore();
  }
});

test('drill demand load coalesces and opens only after registration', async () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('drill');
    let loads = 0, finishLoad;
    owner._registerScreenEntry = entry => {
      assert.equal(entry.name, 'asteroidScreen'); loads++;
      return new Promise(resolve => { finishLoad = () => { owner._registeredScreens.add('drill'); resolve(); }; });
    };
    const first = owner._ensureDrillScreenRegistered();
    assert.equal(owner._ensureDrillScreenRegistered(), first);
    await Promise.resolve();
    assert.equal(loads, 1);
    const outcomes = [];
    owner._pushScreenWhenRegistered('drill', 200, { onSettled: value => outcomes.push(value) });
    assert.deepEqual(outcomes, [], 'the approach veil remains while registration is pending');
    finishLoad(); await first;
    clock.runNext();
    assert.deepEqual(pushes, ['drill']);
    assert.deepEqual(outcomes, [true], 'the veil can clear only after the screen opens');
  } finally { clock.restore(); }
});

test('failed or cancelled drill registration releases its request and permits a later intent', async () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('drill');
    let loads = 0;
    owner._registerScreenEntry = () => {
      loads++;
      if (loads === 1) return Promise.reject(new Error('chunk unavailable'));
      owner._registeredScreens.add('drill'); return Promise.resolve();
    };
    await assert.rejects(owner._ensureDrillScreenRegistered(), /chunk unavailable/);
    assert.equal(owner._drillScreenRegistration, null);
    const outcomes = [];
    owner._pushScreenWhenRegistered('drill', 1, { onSettled: value => outcomes.push(value) });
    while (clock.runNext()) {}
    assert.deepEqual(outcomes, [false], 'timeout signals failure rather than leaving the veil active');
    await owner._ensureDrillScreenRegistered();
    owner._pushScreenWhenRegistered('drill', 1, { onSettled: value => outcomes.push(value) });
    assert.deepEqual(pushes, ['drill']);
    assert.deepEqual(outcomes, [false, true]);
    owner._registeredScreens.delete('drill');
    owner._pushScreenWhenRegistered('drill', 1, { onSettled: value => outcomes.push(value) });
    owner._cancelPendingScreenRetry();
    assert.deepEqual(outcomes, [false, true, false], 'cancellation releases the waiting presentation');
  } finally { clock.restore(); }
});

test('a live dock request loads the station screen once and preserves its first open', async () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('station');
    let loadCount = 0;
    let finishLoad;
    owner._registerScreenEntry = (entry) => {
      loadCount++;
      assert.equal(entry.name, 'stationScreen');
      return new Promise((resolve) => {
        finishLoad = () => {
          owner._registeredScreens.add('station');
          resolve(true);
        };
      });
    };

    assert.equal(loadCount, 0, 'the station module has not been requested before a dock open');
    owner._pushScreenWhenRegistered('station');
    await Promise.resolve();
    assert.equal(loadCount, 1, 'the first live station request starts its module load');
    assert.deepEqual(pushes, [], 'the request waits rather than dropping the first open');

    owner._pushScreenWhenRegistered('station');
    assert.equal(loadCount, 1, 'a repeated dock request shares the in-flight module load');
    assert.deepEqual(pushes, []);

    finishLoad();
    await Promise.resolve();
    assert.equal(clock.runNext(), true, 'the pending screen request retries after registration');
    assert.deepEqual(pushes, ['station'], 'the first dock request opens the newly registered screen');
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('Ship F2 registration coalesces, opens once, and a pending F2 cancellation cannot open later', async () => {
  const bus = createBus();
  const cues = [];
  bus.on('audio:cue', ({ id }) => cues.push(id));
  const pushes = [];
  let top = null;
  const manager = {
    pushScreen(id) { pushes.push(id); top = id; },
    top() { return top; },
    destroy() {},
  };
  const owner = Object.create(ui);
  owner.screenManager = manager;
  owner._registeredScreens = new Set();
  owner.state = { mode: 'flight', ui: {} };
  owner.bus = bus;
  owner._screenRegistrationCycle = beginScreenRegistrationCycle(owner, manager);
  let loads = 0;
  let finishLoad;
  owner._registerScreenEntry = (entry) => {
    loads++;
    assert.equal(entry.name, 'shipScreen');
    assert.equal(entry.path, './ship/shipScreen.js');
    return new Promise((resolve) => {
      finishLoad = () => { owner._registeredScreens.add('ship'); resolve(true); };
    });
  };

  assert.equal(owner._toggleShipScreenOpenRequest(), 'requested');
  assert.equal(owner._shipScreenOpenRequest != null, true);
  await Promise.resolve();
  assert.equal(loads, 1, 'the screen module is requested only after the first live F2 intent');
  assert.equal(owner._toggleShipScreenOpenRequest(), 'cancelled');
  finishLoad();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(pushes, [], 'a completed import cannot honor a canceled F2 request');

  assert.equal(owner._toggleShipScreenOpenRequest(), 'opened');
  assert.deepEqual(pushes, ['ship'], 'the registered screen opens through the existing shared manager');
  assert.deepEqual(cues, ['ui_open', 'ui_back', 'ui_open']);
});

test('failed Shipworks registration clears the request so a later F2 can retry', async () => {
  const { owner, pushes } = makeRetryOwner('ship');
  owner.bus = createBus();
  let attempts = 0;
  owner._registerScreenEntry = (entry) => {
    attempts++;
    assert.equal(entry.name, 'shipScreen');
    if (attempts === 1) return Promise.resolve(false);
    owner._registeredScreens.add('ship');
    return Promise.resolve(true);
  };

  assert.equal(owner._toggleShipScreenOpenRequest(), 'requested');
  await assert.rejects(owner._shipScreenRegistration.promise, /failed to register/);
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(owner._shipScreenOpenRequest, null,
    'the settled failed registration releases its pending intent');
  assert.equal(owner._shipScreenRegistration, null,
    'a failed registration is not cached as a successful screen');
  assert.equal(owner._toggleShipScreenOpenRequest(), 'requested');
  await owner._shipScreenRegistration.promise;
  await Promise.resolve();
  assert.equal(attempts, 2, 'a later F2 intent performs a fresh module registration attempt');
  assert.deepEqual(pushes, ['ship']);
});

test('Shipworks request is canceled when the registration cycle is torn down', async () => {
  const { owner, pushes, manager } = makeRetryOwner('ship');
  let finishLoad;
  owner._registerScreenEntry = () => new Promise((resolve) => {
    finishLoad = () => { owner._registeredScreens.add('ship'); resolve(true); };
  });
  assert.equal(owner._toggleShipScreenOpenRequest(), 'requested');
  await Promise.resolve();
  owner._cancelShipScreenOpenRequest({ cue: false });
  invalidateScreenRegistrationCycle(owner);
  owner.screenManager = null;
  finishLoad();
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(pushes, []);
  assert.equal(owner._shipScreenOpenRequest, null);
  assert.equal(isScreenRegistrationCycleCurrent(owner._screenRegistrationCycle), false);
  manager.destroy();
});

test('mode and screen-stack invalidation listeners cancel pending Shipworks intent and teardown cleanly', () => {
  const bus = createBus();
  const owner = Object.create(ui);
  owner.state = { mode: 'flight', ui: {} };
  owner.bus = bus;
  owner._shipScreenOpenRequest = { cancelled: false };
  owner._bindShipScreenRequestInvalidation();

  owner.state.mode = 'pause';
  bus.emit('mode:changed', { mode: 'pause' });
  assert.equal(owner._shipScreenOpenRequest, null,
    'a transition out of flight invalidates an import before it can present');
  assert.equal(bus._listeners.get('mode:changed')?.size, 1);
  owner._shipModeOff();
  owner._shipModeOff = null;
  assert.equal(bus._listeners.get('mode:changed')?.size || 0, 0,
    'the owner removes its only mode listener on teardown');
  owner._shipScreenTopOff();
  owner._shipScreenTopOff = null;
  assert.equal(bus._listeners.get('ui:screenTop')?.size || 0, 0,
    'the owner removes its screen-stack listener on teardown');
});

test('a newer Map or Pause screen prevents a pending F2 import from taking the top of the stack', async () => {
  for (const newerScreen of ['galaxyMap', 'pause']) {
    const bus = createBus();
    const state = { mode: 'flight', ui: { screenStack: [] } };
    const pushes = [];
    let top = null;
    const manager = {
      top() { return top; },
      pushScreen(id) {
        pushes.push(id);
        top = id;
        state.ui.screenStack.push(id);
        bus.emit('ui:screenTop', { id });
      },
    };
    const owner = Object.create(ui);
    owner.state = state;
    owner.bus = bus;
    owner.screenManager = manager;
    owner._registeredScreens = new Set();
    owner._screenRegistrationCycle = beginScreenRegistrationCycle(owner, manager);
    owner._bindShipScreenRequestInvalidation();
    let finishLoad;
    owner._registerScreenEntry = () => new Promise((resolve) => {
      finishLoad = () => { owner._registeredScreens.add('ship'); resolve(true); };
    });

    assert.equal(owner._toggleShipScreenOpenRequest(), 'requested');
    await Promise.resolve();
    manager.pushScreen(newerScreen);
    assert.equal(owner._shipScreenOpenRequest, null,
      `opening ${newerScreen} cancels the older F2 intent while the import is pending`);
    finishLoad();
    await owner._shipScreenRegistration.promise;
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(pushes, [newerScreen], `Shipworks cannot open over the newer ${newerScreen} choice`);
    owner._shipModeOff?.();
    owner._shipScreenTopOff?.();
  }
});

test('a failed station load remains visible and a later dock intent retries successfully', async () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('station');
    const loadError = new Error('station chunk failed to load');
    let loadCount = 0;
    owner._registerScreenEntry = (entry) => {
      loadCount++;
      assert.equal(entry.name, 'stationScreen');
      if (loadCount === 1) return Promise.reject(loadError);
      return Promise.resolve().then(() => {
        owner._registeredScreens.add('station');
        return true;
      });
    };

    await assert.rejects(owner._ensureStationScreenRegistered(), (error) => error === loadError,
      'the first load failure remains observable to its caller');
    assert.equal(owner._stationScreenRegistration, null,
      'a settled failure is not cached as a successful registration');

    owner._pushScreenWhenRegistered('station');
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(loadCount, 2, 'the later live dock intent starts a fresh module load');
    assert.equal(clock.runNext(), true, 'the dock request retries after the second registration');
    assert.deepEqual(pushes, ['station'], 'the later dock intent reaches the loaded station screen');
    assert.equal(owner._stationScreenRegistration.generation,
      owner._screenRegistrationCycle.generation,
      'successful registration remains reusable for this cycle');
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('a pending lazy station load cannot open after the dock intent is invalidated', async () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('station');
    let finishLoad;
    owner._registerScreenEntry = () => new Promise((resolve) => {
      finishLoad = () => {
        owner._registeredScreens.add('station');
        resolve(true);
      };
    });
    owner._pushScreenWhenRegistered('station');
    await Promise.resolve();
    owner.state.ui.docked = false;
    owner.state.ui.dockedStationId = null;
    finishLoad();
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, [], 'a stale dock retry must not present station after undock');
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('a Continue-docked game start requests station and opens it after lazy registration', async () => {
  const clock = installFakeTimers();
  try {
    const { owner, pushes } = makeRetryOwner('station');
    owner.state.mode = 'flight';
    let finishLoad;
    owner._registerScreenEntry = (entry) => {
      assert.equal(entry.name, 'stationScreen');
      return new Promise((resolve) => {
        finishLoad = () => {
          owner._registeredScreens.add('station');
          resolve(true);
        };
      });
    };

    assert.equal(reconcileGameStartedScreens(owner), true,
      'a loaded game already at a berth takes the existing dock restore path');
    assert.deepEqual(pushes, [], 'Continue waits for the requested station module to register');
    await Promise.resolve();
    finishLoad();
    assert.equal(clock.runNext(), true);
    assert.deepEqual(pushes, ['station'], 'Continue-docked opens the station once registration completes');
    assert.equal(clock.pending(), 0);
  } finally {
    clock.restore();
  }
});

test('uiRoot replacement and destroy leave one then zero marketNews subscribers', () => {
  const bus = createBus();
  const voices = [];
  const headlines = [];
  const state = { meta: { seed: 47047 }, simTime: 12, ui: {} };
  const ctx = {
    bus,
    state,
    helpers: {
      voice: {
        say(payload) {
          voices.push(payload);
          return true;
        },
      },
    },
  };
  const owner = ui;
  bus.on('news:headline', (payload) => headlines.push(payload));

  replaceMarketNewsOwner(owner, ctx);
  assert.equal(bus._listeners.get('freight:loss')?.size, 1);
  replaceMarketNewsOwner(owner, ctx);
  assert.equal(bus._listeners.get('freight:loss')?.size, 1, 'reinit destroys the prior subscriber');

  const payload = {
    kind: 'loss',
    cause: 'freight_loss',
    intentId: 'fl_ui_lifecycle',
    encounterId: 'enc_ui_lifecycle',
    stationId: 'st_tethys_hub',
    sectorId: 'sector_tethys_junction',
    manifestId: 'manifest_ui_lifecycle',
    freighterKey: 'encounter:enc_ui_lifecycle',
    primaryCommodityId: 'cmdty_fuel_cells',
  };
  bus.emit('freight:loss', payload);
  assert.equal(headlines.length, 1);
  assert.equal(voices.length, 1);
  assert.equal(owner.marketNews.getLog().length, 1);

  destroyMarketNewsOwner(owner);
  assert.equal(owner.marketNews, null);
  assert.equal(bus._listeners.get('freight:loss')?.size || 0, 0);
  bus.emit('freight:loss', { ...payload, intentId: 'fl_ui_lifecycle_after_destroy' });
  assert.equal(headlines.length, 1, 'destroyed owner cannot relay another headline');
  assert.equal(voices.length, 1, 'destroyed owner cannot speak another headline');
});

test('uiRoot replacement and destroy own exactly one then zero comms recovery subscribers', () => {
  const bus = createBus();
  const owner = {};
  const ctx = { bus, state: { mode: 'flight', ui: {} }, helpers: {} };
  let roots = 0;
  const factory = () => {
    roots++;
    const off = bus.on('surrender:option', () => {});
    let destroyed = false;
    return {
      destroy() {
        if (destroyed) return;
        destroyed = true;
        roots--;
        off();
      },
    };
  };

  replaceCommsOwner(owner, ctx, factory);
  assert.equal(roots, 1);
  assert.equal(bus._listeners.get('surrender:option')?.size, 1);
  replaceCommsOwner(owner, ctx, factory);
  assert.equal(roots, 1, 'replacement destroys the prior root before mounting its successor');
  assert.equal(bus._listeners.get('surrender:option')?.size, 1, 'replacement retains one subscriber');
  destroyCommsOwner(owner);
  assert.equal(owner.comms, null);
  assert.equal(roots, 0);
  assert.equal(bus._listeners.get('surrender:option')?.size || 0, 0);
});
