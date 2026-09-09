import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PASSENGER_LINER_SERVICE,
  isPassengerLinerItinerary,
} from '../src/data/laneContacts.js';
import {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
  livingWorkStatusText,
} from '../src/data/contactHail.js';
import { traffic } from '../src/systems/traffic.js';

function busHarness() {
  const listeners = new Map();
  const events = [];
  return {
    events,
    on(name, fn) {
      const rows = listeners.get(name) || [];
      rows.push(fn);
      listeners.set(name, rows);
    },
    emit(name, payload = {}) {
      events.push({ name, payload });
      for (const fn of listeners.get(name) || []) fn(payload);
    },
  };
}

function station(id, x, z) {
  return { id, type: 'station', alive: true, pos: { x, z }, data: { stationId: id, name: id } };
}

function boot() {
  const helios = station('station_helios', 0, 0);
  const coalition = station('station_coalition', 2400, 0);
  const player = {
    id: 'player', type: 'ship', alive: true, isPlayer: true, team: 1,
    pos: { x: 240, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  const express = {
    id: 'ambient-express', type: 'ship', alive: true, team: 2, factionId: 'faction_free',
    pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      defId: 'ship_mule', worldRecordId: 'traffic:helios:express:0',
      trafficRole: 'express', role: 'express', hitchable: true,
      ai: { archetype: 'fleeing_trader', passive: true, spawnContext: 'convoy_civilian' },
    },
  };
  const state = {
    mode: 'flight', meta: { seed: 4815 }, tick: 200, simTime: 0,
    runtime: { features: { massline2: { enabled: true, hitchhiking: true } } },
    world: { currentSectorId: PASSENGER_LINER_SERVICE.sectorId },
    entities: new Map([[player.id, player], [helios.id, helios], [coalition.id, coalition], [express.id, express]]),
    entityList: [player, helios, coalition, express], playerId: player.id,
    player: { targetId: null, credits: 5000, cargo: { items: {} } },
    traffic: { freighters: [{
      id: express.id, role: 'express', targetId: coalition.id, waitT: 0,
      nextTradeT: 2, orbitPhase: 0, dockSeq: 0, manifest: null,
    }], appliedArrivalIds: [], appliedLossIds: [] },
  };
  const bus = busHarness();
  const system = Object.create(traffic);
  system.init({ state, bus, helpers: {}, registry: null });
  return { state, bus, system, helios, coalition, express };
}

function stampLiner(h) {
  assert.equal(
    h.system._ensurePassengerLinerService(PASSENGER_LINER_SERVICE.sectorId, [h.helios, h.coalition]),
    true,
  );
  return h.express.data.itinerary;
}

function rematerialize(savedEntity, trafficEnvelope) {
  const h = boot();
  const rehydrated = structuredClone(savedEntity);
  rehydrated.id = 'rehydrated-liner';
  h.state.entities = new Map([
    [h.state.playerId, h.state.entities.get(h.state.playerId)],
    [h.helios.id, h.helios],
    [h.coalition.id, h.coalition],
    [rehydrated.id, rehydrated],
  ]);
  h.state.entityList = [...h.state.entities.values()];
  h.state.traffic.freighters = [];
  h.system._active = [];
  h.system.deserialize(trafficEnvelope);
  h.system._adoptRematerializedTraffic(PASSENGER_LINER_SERVICE.sectorId, [h.helios, h.coalition]);
  return { ...h, rehydrated, rec: h.state.traffic.freighters[0] };
}

test('PQ-048.10 repurposes one Helios express through a passenger leg, durable receipt, and loss suspension', () => {
  const h = boot();
  const actorCount = h.state.entityList.length;
  const rec = h.state.traffic.freighters[0];

  assert.equal(h.system._ensurePassengerLinerService(PASSENGER_LINER_SERVICE.sectorId, [h.helios, h.coalition]), true);
  const itinerary = h.express.data.itinerary;
  assert.equal(h.state.entityList.length, actorCount, 'the service never appends a ninth actor');
  assert.equal(rec.id, h.express.id, 'the existing forced express keeps its live identity');
  assert.equal(rec.manifest, null, 'the liner never carries a freight manifest');
  assert.equal(h.express.data.cargoManifest, undefined);
  assert.equal(isPassengerLinerItinerary(itinerary), true);
  assert.equal(itinerary.state, 'BOARDING');
  assert.equal(itinerary.custody.state, 'AT_ORIGIN');

  h.state.simTime = itinerary.departureAt;
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'EN_ROUTE');
  assert.equal(itinerary.custody.state, 'ONBOARD');
  assert.equal(h.express.data.intent.boost, true, 'the passenger leg uses the real V3 boost route');

  h.express.pos = { ...h.coalition.pos };
  h.system.update(0.1, h.state);
  assert.equal(h.express.data.itinerary.legSeq, 1, 'arrival advances to the opposite boarding leg');
  assert.equal(h.express.data.itinerary.state, 'BOARDING');
  assert.equal(h.express.data.itinerary.custody.state, 'AT_ORIGIN');
  const passengerReceipts = h.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt');
  const passengerNews = h.bus.events.filter((event) => event.name === 'news:publish'
    && event.payload.kind === 'passenger_liner_service');
  assert.equal(passengerReceipts.length, 1);
  assert.equal(passengerReceipts[0].payload.outcome, 'DELIVERED');
  assert.equal(passengerNews.length, 1);
  assert.equal(h.bus.events.filter((event) => event.name === 'freight:arrival').length, 0);
  assert.equal(h.bus.events.filter((event) => event.name === 'aiTrader:requestTrade').length, 0);
  assert.deepEqual(h.system.serialize().passengerReceiptIds, [passengerReceipts[0].payload.receiptId]);
  assert.ok(h.system._passengerLinerClaim(h.express), 'the opposite boarding leg retains its durable claim');
  assert.equal(rec.passengerLinerService, PASSENGER_LINER_SERVICE.id);

  h.bus.emit('entity:killed', { id: h.express.id, killerId: 'pirate' });
  h.bus.emit('entity:killed', { id: h.express.id, killerId: 'pirate' });
  assert.equal(h.state.traffic.freighters.length, 0);
  assert.equal(h.state.traffic.passengerLinerSuspendedIds.includes('traffic:helios:express:0'), true);
  assert.equal(h.bus.events.filter((event) => event.name === 'freight:loss').length, 0,
    'passenger loss never enters the freight/economy loss seam');
  assert.equal(h.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt').length, 2);
  assert.equal(h.bus.events.filter((event) => event.name === 'news:publish'
    && event.payload.kind === 'passenger_liner_service').length, 2);
});

test('PQ-048.10 accepts only a live Coalition law incident, then physically diverts the outbound liner home', () => {
  const h = boot();
  const itinerary = stampLiner(h);
  itinerary.departureAt = 1000;
  itinerary.dwellUntil = 1000;
  h.state.lawSecurity = { incidents: {
    malformed: { id: '', stationId: 'station_coalition', status: 'distress', startedAt: 0 },
  } };
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'BOARDING', 'malformed incident has no authority');

  h.state.simTime = 181;
  h.state.lawSecurity.incidents = {
    stale: { id: 'law:stale', stationId: 'station_coalition', status: 'distress', startedAt: 0 },
    resolved: {
      id: 'law:resolved', stationId: 'station_coalition', status: 'distress', startedAt: 181, resolvedAt: 181,
    },
  };
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'BOARDING', 'stale and resolved incidents have no authority');

  h.state.lawSecurity.incidents = {
    active: { id: 'law:active', stationId: 'station_coalition', status: 'responding', startedAt: 181 },
  };
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'DELAYED');
  assert.equal(itinerary.custody.state, 'AT_ORIGIN');

  h.state.lawSecurity.incidents = {};
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'BOARDING', 'a cleared session incident releases the predeparture hold');
  itinerary.departureAt = h.state.simTime;
  itinerary.dwellUntil = h.state.simTime;
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'EN_ROUTE');
  assert.equal(itinerary.custody.state, 'ONBOARD');

  h.state.lawSecurity.incidents = {
    active: { id: 'law:divert', stationId: 'station_coalition', status: 'monitoring', startedAt: h.state.simTime },
  };
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'DIVERTING');
  assert.equal(h.state.traffic.freighters[0].targetId, h.helios.id, 'the live route points back to Helios');
  assert.equal(h.express.data.intent.boost, true, 'the return burn keeps the real V3 hitch boost');
  h.state.player.targetId = h.express.id;
  const divertAvailability = contactHailAvailability(h.state);
  const divertOffer = createContactHailOffer(h.state, divertAvailability, 'liner-divert-route', 190);
  const divertRoute = createContactHailResponse(h.state, divertOffer, 'route');
  assert.match(divertRoute.lines.join(' '), /RETURNING TO.*HELIOS/i,
    'DIVERTING route names the physical return station and return intent');
  assert.doesNotMatch(divertRoute.lines.join(' '), /COALITION/i,
    'DIVERTING route never advertises the blocked destination');

  h.express.pos = { ...h.helios.pos };
  h.system.update(0.1, h.state);
  assert.equal(h.express.data.itinerary.legSeq, 1);
  assert.equal(h.express.data.itinerary.originStationId, 'station_helios');
  assert.equal(h.express.data.itinerary.destinationStationId, 'station_coalition');
  const returned = h.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt');
  assert.equal(returned.length, 1);
  assert.equal(returned[0].payload.outcome, 'RETURNED');
  assert.equal(h.bus.events.filter((event) => event.name === 'freight:arrival').length, 0);
});

test('PQ-048.10 rematerializes a saved diversion and clears only a stale saved delay', () => {
  const outbound = boot();
  const outboundItinerary = stampLiner(outbound);
  outboundItinerary.departureAt = 0;
  outboundItinerary.dwellUntil = 0;
  outbound.system.update(0.1, outbound.state);
  outbound.state.lawSecurity = { incidents: {
    active: { id: 'law:save-diversion', stationId: 'station_coalition', status: 'distress', startedAt: 0 },
  } };
  outbound.system.update(0.1, outbound.state);
  assert.equal(outboundItinerary.state, 'DIVERTING');
  const ticketId = outboundItinerary.custody.ticketId;
  const continued = rematerialize(outbound.express, outbound.system.serialize());
  assert.ok(continued.rec);
  assert.equal(continued.rehydrated.data.itinerary.state, 'DIVERTING');
  assert.equal(continued.rehydrated.data.itinerary.custody.ticketId, ticketId);
  continued.bus.emit('save:loaded');
  assert.equal(continued.rehydrated.data.itinerary.state, 'DIVERTING', 'a physical diversion survives absent session law state');
  continued.rehydrated.pos = { ...continued.helios.pos };
  continued.system.update(0.1, continued.state);
  const returned = continued.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt');
  assert.equal(returned.length, 1);
  assert.equal(returned[0].payload.outcome, 'RETURNED');
  continued.system.update(0.1, continued.state);
  assert.equal(continued.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt').length, 1,
    'the returned receipt cannot replay after rehydration');

  const delayed = boot();
  const delayedItinerary = stampLiner(delayed);
  delayed.state.lawSecurity = { incidents: {
    active: { id: 'law:save-delay', stationId: 'station_coalition', status: 'distress', startedAt: 0 },
  } };
  delayed.system.update(0.1, delayed.state);
  assert.equal(delayedItinerary.state, 'DELAYED');
  const delayedTicketId = delayedItinerary.custody.ticketId;
  const resumed = rematerialize(delayed.express, delayed.system.serialize());
  resumed.bus.emit('save:loaded');
  assert.equal(resumed.rehydrated.data.itinerary.state, 'BOARDING');
  assert.equal(resumed.rehydrated.data.itinerary.delayedBy, null);
  assert.equal(resumed.rehydrated.data.itinerary.custody.ticketId, delayedTicketId);
});

test('PQ-048.10 Hail exposes one boarding assist and completes it only in the physical formation band', () => {
  const h = boot();
  const itinerary = stampLiner(h);
  h.state.player.targetId = h.express.id;
  h.state.entities.get(h.state.playerId).pos = { x: h.express.pos.x + 150, z: h.express.pos.z };
  const availability = contactHailAvailability(h.state);
  const offer = createContactHailOffer(h.state, availability, 'liner-assist', 8);
  assert.equal(availability.passengerLinerItinerary, itinerary);
  assert.deepEqual(offer.actions.map((action) => action.id), ['status', 'route', 'assist']);
  assert.deepEqual(offer.actions.map((action) => action.label), ['STATUS', 'ROUTE', 'ASSIST BOARDING']);
  assert.match(livingWorkStatusText(h.express), /SERVICE · HELIOS CIVIC LINER · BOARDING/);
  const response = createContactHailResponse(h.state, offer, 'assist');
  assert.match(response.lines.join(' '), /FORM UP/i);
  h.bus.emit('contactHail:response', response);
  assert.equal(itinerary.assist.active, true);
  h.system.update(7.9, h.state);
  assert.equal(itinerary.assist.usedLegSeq, null, 'the hold is not a button press');
  h.system.update(0.1, h.state);
  assert.equal(itinerary.assist.usedLegSeq, 0);
  assert.equal(itinerary.state, 'EN_ROUTE');
  h.bus.emit('contactHail:response', response);
  assert.equal(itinerary.assist.usedLegSeq, 0, 'replayed assist cannot re-open or settle the leg');
});
