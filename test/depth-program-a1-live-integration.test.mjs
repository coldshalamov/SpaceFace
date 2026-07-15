import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRegistry } from '../src/core/registry.js';
import { BINDINGS } from '../src/ui/bindings.js';
import { bandRadio, deriveBandEventKeys, numbersBearingDue } from '../src/systems/bandRadio.js';
import { uniqueWrecks } from '../src/systems/uniqueWrecks.js';
import { uniqueWreckById } from '../src/data/uniqueWrecks.js';

test('new games leave audio unmuted so the Band and game are audible', () => {
  const state = createGameState(0xa1);
  assert.equal(state.settings.audio.muted, false);
});

test('production registry places Band after settled world readers and before onboarding/voice', () => {
  const state = createGameState(0xa1);
  const registry = createRegistry({ state, bus: createBus(), helpers: {} });
  const systems = registry.systems.map((system) => system.name);
  const order = registry.updateOrder.map((system) => system.name);
  assert.ok(systems.includes('bandRadio'));
  assert.ok(order.indexOf('bandRadio') > order.indexOf('world'));
  assert.ok(order.indexOf('bandRadio') < order.indexOf('onboarding'));
  assert.ok(order.indexOf('bandRadio') < order.indexOf('voiceArbiter'));
  assert.deepEqual(BINDINGS.band, { key: 'O', code: 'KeyO', label: 'Shift+O', shift: true });
});

test('Band deed gates derive only from canonical gameplay receipts', () => {
  const player = { id: 7, hull: 24, hullMax: 100 };
  const state = { playerId: 7, entities: new Map([[7, player]]) };
  assert.deepEqual(deriveBandEventKeys('freight:loss', { killerId: 7 }, state),
    ['player.destroy_freighter']);
  assert.deepEqual(deriveBandEventKeys('freight:loss', { killerId: 8 }, state), []);
  assert.deepEqual(deriveBandEventKeys('freight:loss', {}, {}), []);
  assert.deepEqual(deriveBandEventKeys('mission:completed', { type: 'patrol_clear' }, state),
    ['player.clear_lane']);
  assert.deepEqual(deriveBandEventKeys('mission:completed', {
    source: 'economyContract', type: 'cargo_delivery', causeTag: 'infrastructure_disruption',
  }, state), ['player.break_blockade']);
  assert.deepEqual(deriveBandEventKeys('mission:completed', {
    source: 'economyContract', type: 'salvage_retrieval', causeTag: 'infrastructure_disruption',
  }, state), []);
  assert.deepEqual(deriveBandEventKeys('dock:docked', {}, state), ['player.dock_heavily_damaged']);
  player.hull = 25;
  assert.deepEqual(deriveBandEventKeys('dock:docked', {}, state), []);
  assert.deepEqual(deriveBandEventKeys('player.cross_vale_closure', {}, state), [],
    'Vale closure copy stays dependency-bound until a real tagged crossing producer exists');
});

test('numbers station synchronously records one real canonical fuzzy wreck bearing', () => {
  const bus = createBus();
  const state = {
    meta: { seed: 9001 },
    simTime: 0,
    mode: 'flight',
    ui: { docked: false },
    player: { flags: {} },
    factions: {},
    world: {
      currentSectorId: 'sector_integration_test',
      sectors: {
        sector_integration_test: {
          id: 'sector_integration_test', factionId: 'faction_quiet', tier: 3, security: 0.4, stations: [],
        },
      },
    },
  };
  const resolutions = [];
  const requests = [];
  bus.on('band:bearingResolved', (payload) => resolutions.push(structuredClone(payload)));
  bus.on('band:bearingRequest', (payload) => requests.push(structuredClone(payload)));

  const wreckRuntime = Object.create(uniqueWrecks);
  wreckRuntime.init({ state, bus, helpers: {}, registry: null });
  wreckRuntime.newGame();
  const radioRuntime = Object.create(bandRadio);
  radioRuntime.init({
    state,
    bus,
    helpers: { voice: { say() { return true; } } },
    registry: { get() { return null; } },
  });
  radioRuntime.newGame();
  bus.emit('band:tune', { channelId: 'numbers_station' });
  radioRuntime.update(0, state);

  let sequence = 0;
  while (!numbersBearingDue(state.meta.seed, sequence) && sequence < 10000) sequence += 1;
  assert.ok(sequence < 10000);
  state.bandRadio.sequence = sequence;
  state.bandRadio.identPending = false;
  state.bandRadio.nextLineAtS = 0;
  state.simTime = 40;
  radioRuntime.update(40, state);

  assert.equal(requests.length, 1);
  assert.equal(resolutions.length, 1);
  const resolution = resolutions[0];
  const def = uniqueWreckById(resolution.wreckId);
  assert.ok(def, 'resolver must name a registered D-wreck');
  assert.equal(resolution.canonical, true);
  assert.equal(resolution.sourceRef, def.bearingSourceRef);
  assert.match(resolution.bearingLabel, /^\d{3}-\d{3}$/);
  const record = state.player.uniqueWrecks.bearings[def.id];
  assert.ok(record, 'canonical unique-wreck owner must create the actual map bearing');
  assert.equal(record.phase, 'rumored');
  assert.equal(record.channelId, 'band');
  assert.deepEqual(
    Object.fromEntries(Object.entries(state.bandRadio.numbersReceipt).filter(([key]) => key !== 'resolvedAtS')),
    resolution,
  );

  bus.emit('band:bearingRequest', requests[0]);
  assert.equal(Object.keys(state.player.uniqueWrecks.bearings).length, 1,
    're-delivery of one request cannot mint a second bearing');
  assert.equal(resolutions.length, 1, 'the settled one-per-save receipt rejects duplicate transport');

  bus.emit('band:bearingRequest', {
    ...requests[0],
    requestId: `${requests[0].requestId}-forged-second`,
  });
  assert.equal(Object.keys(state.player.uniqueWrecks.bearings).length, 1,
    'a different request id after settlement cannot mint a second bearing');

  radioRuntime.destroy();
  wreckRuntime.destroy();
});

test('unique-wreck authority rejects forged Band requests while the radio is off', () => {
  const bus = createBus();
  const state = {
    meta: { seed: 9002 },
    simTime: 0,
    mode: 'flight',
    ui: { docked: false },
    player: { flags: {} },
    factions: {},
    world: { currentSectorId: 'sector_forgery_test', sectors: {} },
    bandRadio: {
      channelId: null,
      pendingBearingRequest: null,
      numbersReceipt: null,
    },
  };
  const resolutions = [];
  bus.on('band:bearingResolved', (payload) => resolutions.push(structuredClone(payload)));
  const wreckRuntime = Object.create(uniqueWrecks);
  wreckRuntime.init({ state, bus, helpers: {}, registry: null });
  wreckRuntime.newGame();

  bus.emit('band:bearingRequest', {
    requestId: 'forged-off-band',
    channelId: 'numbers_station',
    requestedAtS: 0,
    sequence: 0,
    contractVersion: 1,
  });

  assert.equal(resolutions.length, 0);
  assert.equal(Object.keys(state.player.uniqueWrecks.bearings).length, 0);
  wreckRuntime.destroy();
});
