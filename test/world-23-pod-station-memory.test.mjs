// WORLD-23 — a station remembers the survivor pod you delivered or the one that was
// promoted. survivorPod:promoted and survivorPod:delivered were emitted into silence; now
// each lands one line on the receiving station's traffic rail, which the berth-arrival view
// already reads. Handoff pickups write nothing — the hull's later delivered receipt is the
// line that counts — and an unclaimed rescue notice survives Continue.
import test from 'node:test';
import assert from 'node:assert/strict';

import { stationContacts } from '../src/systems/stationContacts.js';
import { stationContactLoadBoundary } from '../src/systems/stationContactLoadBoundary.js';
import { SECTORS } from '../src/data/sectors.js';

const SECTOR = SECTORS[0];
const STATION_ID = SECTOR.stations[0].id;
const STATION_ENTITY_ID = 9100;

function makeBus() {
  const handlers = {};
  const traffic = [];
  return {
    traffic,
    on(event, handler) { (handlers[event] = handlers[event] || []).push(handler); },
    emit(event, payload) {
      traffic.push({ event, payload });
      for (const handler of handlers[event] || []) handler(payload);
    },
    off(event, handler) {
      const list = handlers[event] || [];
      const i = list.indexOf(handler);
      if (i >= 0) list.splice(i, 1);
    },
  };
}

function boot({ withBoundary = false } = {}) {
  const bus = makeBus();
  const stationEntity = {
    id: STATION_ENTITY_ID, type: 'station', alive: true,
    data: { stationId: STATION_ID },
  };
  const state = {
    simTime: 500,
    player: {},
    entities: new Map([[STATION_ENTITY_ID, stationEntity]]),
  };
  stationContacts.init({ state, bus });
  if (withBoundary) stationContactLoadBoundary.init({ state, bus });
  return { state, bus, traffic: bus.traffic };
}

function podLines(state, stationId = STATION_ID) {
  return (state.stationLife.traffic || [])
    .filter((entry) => entry && entry.kind === 'survivor_pod' && entry.stationId === stationId);
}

test('a promoted pod is announced at its destination station, once', () => {
  const { state, bus } = boot();
  const payload = {
    salvagePointId: 'salv_k7', entityId: 44, sectorId: SECTOR.id,
    destStationId: STATION_ID, destSectorId: SECTOR.id,
  };
  bus.emit('survivorPod:promoted', payload);
  assert.equal(podLines(state).length, 1, 'the destination station hears the pod is inbound');
  assert.match(podLines(state)[0].text, /medical berth/i);
  bus.emit('survivorPod:promoted', { ...payload });
  assert.equal(podLines(state).length, 1, 'a sector promotes one pod ever — no repeat line');
});

test('a rescue-hull delivery signs the pod in at the receiving station', () => {
  const { state, bus } = boot();
  // The receipt names the station ENTITY id; the rail keys on the station def id.
  bus.emit('survivorPod:delivered', {
    rescueHullId: 7, stationId: STATION_ENTITY_ID, simTime: 500,
  });
  assert.equal(podLines(state).length, 1, 'the entity id resolves to the station record');
  bus.emit('survivorPod:delivered', {
    rescueHullId: 7, stationId: STATION_ENTITY_ID, simTime: 500,
  });
  assert.equal(podLines(state).length, 1, 'a replayed delivery writes no second line');
  bus.emit('survivorPod:delivered', {
    rescueHullId: 7, stationId: STATION_ENTITY_ID, simTime: 512,
  });
  assert.equal(podLines(state).length, 2, 'a genuinely later delivery is a new line');
});

test('the pilot\'s own station delivery is remembered; a hull handoff is not', () => {
  const { state, bus } = boot();
  bus.emit('survivorPod:rescued', {
    id: 'survivor:44', outcome: 'rescued', entityId: 44,
    reason: 'station_delivery', stationId: STATION_ID, sectorId: SECTOR.id, t: 500,
  });
  assert.equal(podLines(state).length, 1, 'the pilot\'s delivery lands one line');
  bus.emit('survivorPod:rescued', {
    id: 'survivor:44', outcome: 'rescued', entityId: 44,
    reason: 'station_delivery', stationId: STATION_ID, sectorId: SECTOR.id, t: 501,
  });
  assert.equal(podLines(state).length, 1, 'the same pod never logs twice');
  bus.emit('survivorPod:rescued', {
    id: 'survivor:55', outcome: 'rescued', entityId: 55,
    reason: 'player_handoff_rescue_hull', stationId: null, sectorId: SECTOR.id, t: 502,
  });
  bus.emit('survivorPod:rescued', {
    id: 'survivor:56', outcome: 'rescued', entityId: 56,
    reason: 'rescue_hull', stationId: null, sectorId: SECTOR.id, t: 503,
  });
  assert.equal(podLines(state).length, 1, 'handoff pickups write nothing — pickup is not delivery');
});

test('the pod path writes records only — no rep, credits, or cargo', () => {
  const { bus, traffic } = boot();
  bus.emit('survivorPod:promoted', {
    salvagePointId: 'salv_k7', destStationId: STATION_ID,
  });
  bus.emit('survivorPod:rescued', {
    id: 'survivor:44', reason: 'station_delivery', stationId: STATION_ID, t: 500,
  });
  const writes = traffic.filter(({ event }) => /^(economy|faction|cargo|reputation):/.test(event));
  assert.equal(writes.length, 0, 'the memory path moves nothing but its own line');
  const changed = traffic.filter(({ event }) => event === 'stationLife:trafficChanged');
  assert.equal(changed.length, 2, 'each receipt publishes through the existing channel');
});

test('an unclaimed rescue notice survives Continue through the load boundary', () => {
  const { state, bus } = boot({ withBoundary: true });
  bus.emit('recovery:completed', {
    id: 'recovery-receipt:rec-1', recoveryId: 'rec-1', sectorId: SECTOR.id,
    outcome: 'rescue', pos: { x: 1, z: 2 }, credits: 0, repDelta: 0, cargo: {}, completedAt: 500,
  });
  assert.ok(state.stationLife.rescueNotices[SECTOR.id], 'precondition: the notice posted');
  bus.emit('save:loaded', {});
  assert.ok(state.stationLife.rescueNotices[SECTOR.id],
    'the boundary no longer wipes durable notices on load');
  bus.emit('survivorPod:rescued', {
    id: 'survivor:44', reason: 'station_delivery', stationId: STATION_ID, t: 505,
  });
  assert.equal(podLines(state).length, 1, 'new receipts still land after a load');
});
