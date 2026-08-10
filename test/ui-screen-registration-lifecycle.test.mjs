import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import {
  beginScreenRegistrationCycle,
  destroyMarketNewsOwner,
  invalidateScreenRegistrationCycle,
  isScreenRegistrationCycleCurrent,
  isScreenRegistrationCycleSettled,
  replaceMarketNewsOwner,
  ui,
} from '../src/ui/uiRoot.js';

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
