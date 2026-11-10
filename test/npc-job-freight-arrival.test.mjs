import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCargoManifest, FREIGHT_CAUSE } from '../src/economy/freightCausality.js';
import { traffic } from '../src/systems/traffic.js';

function eventBus() {
  const listeners = new Map();
  const log = [];
  return {
    log,
    on(event, handler) {
      const handlers = listeners.get(event) || [];
      handlers.push(handler);
      listeners.set(event, handlers);
    },
    emit(event, payload) {
      log.push({ event, payload });
      for (const handler of listeners.get(event) || []) handler(payload);
    },
  };
}

function fixture() {
  const origin = {
    id: 10, type: 'station', alive: true, pos: { x: 0, z: 0 },
    data: { stationId: 'station_origin' },
  };
  const destination = {
    id: 11, type: 'station', alive: true, pos: { x: 500, z: 0 },
    data: { stationId: 'station_destination' },
  };
  const hauler = {
    id: 20, type: 'ship', alive: true, isPlayer: false, pos: { x: 500, z: 0 },
    data: {
      trafficRole: 'hauler',
      worldRecordId: 'wr_working_hauler',
      jobId: 'job:wr_working_hauler',
    },
  };
  const player = {
    id: 1, type: 'ship', alive: true, isPlayer: true, pos: { x: 0, z: 0 }, data: {},
  };
  const market = {
    cmdty_ore_iron: { stock: 100 },
    cmdty_fuel_cells: { stock: 50 },
    cmdty_food: { stock: 80 },
  };
  const manifest = buildCargoManifest({
    seed: 73,
    freighterKey: hauler.data.worldRecordId,
    role: 'hauler',
    market,
  });
  hauler.data.cargoManifest = manifest;
  const rec = {
    id: hauler.id,
    role: 'hauler',
    targetId: destination.id,
    waitT: 0,
    nextTradeT: 0,
    dockSeq: 0,
    manifest,
  };
  const state = {
    meta: { seed: 73 },
    tick: 900,
    simTime: 15,
    world: { currentSectorId: 'sector_working_freight' },
    entities: new Map([[player.id, player], [origin.id, origin], [destination.id, destination], [hauler.id, hauler]]),
    entityList: [player, origin, destination, hauler],
    playerId: player.id,
    player: { credits: 1234, cargo: { items: { cmdty_food: 2 } } },
    economy: { markets: { station_destination: market } },
    traffic: { freighters: [rec], appliedArrivalIds: [], appliedLossIds: [] },
  };
  return { state, origin, destination, hauler, manifest, rec };
}

test('working hauler unload applies its visible manifest exactly once', () => {
  const h = fixture();
  const bus = eventBus();
  traffic.init({ state: h.state, bus, helpers: {}, registry: null });

  const jobSpec = traffic._buildJobSpec(
    'hauler', h.hauler, h.origin, h.destination, [h.origin, h.destination],
    'sector_working_freight',
  );
  assert.deepEqual(jobSpec.payload, { manifest: h.manifest },
    'the job carries the hull manifest rather than an invented commodity');

  const walletBefore = JSON.parse(JSON.stringify(h.state.player));
  const unload = {
    event: 'npcjobs:unload',
    jobId: h.hauler.data.jobId,
    kind: 'hauler',
    seq: 17,
    completed: true,
    destination: 'dest:station_destination',
    payload: jobSpec.payload,
  };
  bus.emit(unload.event, unload);

  const arrivals = bus.log.filter((entry) => entry.event === 'freight:arrival');
  const trades = bus.log.filter((entry) => entry.event === 'aiTrader:requestTrade');
  assert.equal(arrivals.length, 1);
  assert.equal(arrivals[0].payload.cause, FREIGHT_CAUSE.ARRIVAL);
  assert.equal(arrivals[0].payload.manifestId, h.manifest.manifestId);
  assert.ok(trades.length > 0);
  assert.deepEqual(
    trades.map((entry) => [entry.payload.commodityId, entry.payload.qty]),
    arrivals[0].payload.trades.map((entry) => [entry.commodityId, entry.qty]),
    'the economy receives the exact delivered manifest lines',
  );
  assert.equal(h.rec.dockSeq, 18, 'job sequence becomes the next ambient dock sequence floor');
  assert.notEqual(h.rec.manifest.manifestId, h.manifest.manifestId,
    'the delivered manifest is replaced before ambient traffic resumes');
  assert.deepEqual(h.hauler.data.cargoManifest, h.rec.manifest);
  assert.deepEqual(h.state.player, walletBefore, 'traffic never writes player wallet or cargo');

  bus.emit(unload.event, unload);
  assert.equal(bus.log.filter((entry) => entry.event === 'freight:arrival').length, 1,
    'replaying the same job unload does not deliver twice');
  assert.equal(h.rec.dockSeq, 18);
  assert.deepEqual(h.hauler.data.cargoManifest, h.rec.manifest,
    'a replay cannot restore the already-delivered manifest');
});
