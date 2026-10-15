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
  const manager = {
    pushScreen(screenId) {
      pushes.push(screenId);
    },
    destroy() {},
  };
  const owner = Object.create(ui);
  owner.screenManager = manager;
  owner._registeredScreens = new Set();
  owner._gameOverShown = id === 'gameOver';
  owner._crucibleResultsShown = id === 'crucibleResults';
  owner._survivalRunLive = () => false;
  owner.state = {
    ui: {
      docked: id === 'station',
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
