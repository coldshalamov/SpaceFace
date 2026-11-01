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

function rematerialize(savedEntity, trafficEnvelope, extraEntities = []) {
  const h = boot();
  const rehydrated = structuredClone(savedEntity);
  rehydrated.id = 'rehydrated-liner';
  const restoredExtras = extraEntities.map((entity) => structuredClone(entity));
  h.state.entities = new Map([
    [h.state.playerId, h.state.entities.get(h.state.playerId)],
    [h.helios.id, h.helios],
    [h.coalition.id, h.coalition],
    [rehydrated.id, rehydrated],
    ...restoredExtras.map((entity) => [entity.id, entity]),
  ]);
  h.state.entityList = [...h.state.entities.values()];
  h.state.traffic.freighters = [];
  h.system._active = [];
  h.system.deserialize(trafficEnvelope);
  h.system._adoptRematerializedTraffic(PASSENGER_LINER_SERVICE.sectorId, [h.helios, h.coalition]);
  return { ...h, rehydrated, rec: h.state.traffic.freighters[0] };
}

function installTowAuthority(h, { tug, target, entry, telemetry = true }) {
  const attachment = {
    id: entry.towAttachmentId,
    defId: 'tether_standard',
    controlMode: 'npc_tow',
    ownerId: tug.id,
    targetId: target.id,
    ownerGeneration: tug.occupantGeneration,
    targetGeneration: target.occupantGeneration,
    physicsHandle: { id: entry.towAttachmentId },
    state: 'active',
  };
  const kernel = {
    attachments: { get: (id) => id === attachment.id ? attachment : null },
    describeCombatPhysicsAttachment: (id) => id === attachment.id ? { id } : null,
  };
  h.system._registry = { get: (name) => name === 'combat' ? { kernel } : null };
  h.system.helpers = {
    npcJobs: { get: (jobId) => jobId === entry.job.id ? entry : null },
    combatPhysics: {
      getAttachmentTelemetry: ({ attachmentId }) => telemetry && attachmentId === attachment.id
        ? { attachmentId }
        : null,
    },
  };
  return attachment;
}

function attachActiveTugTow(h, { tugPos = { x: -120, z: 0 }, targetPos = { x: 120, z: 0 } } = {}) {
  const tug = {
    id: 'yard-tug', type: 'ship', alive: true, radius: 20,
    occupantGeneration: 'tug-life-1',
    pos: { ...tugPos },
    data: {
      worldRecordId: 'traffic:helios:yard-tug:1',
      trafficRole: 'tug', role: 'tug', jobId: 'job:traffic:helios:yard-tug:1',
      npcTowAttachmentId: 'attachment:yard-tug:1',
      npcTowJobId: 'job:traffic:helios:yard-tug:1',
    },
  };
  const target = {
    id: 'yard-tug-load', type: 'payload', alive: true, radius: 9,
    occupantGeneration: 'target-life-1',
    pos: { ...targetPos },
    data: {
      npcTowAttachmentId: 'attachment:yard-tug:1',
      npcTowedByJobId: 'job:traffic:helios:yard-tug:1',
    },
  };
  const entry = {
    entityId: tug.id,
    worldRecordId: tug.data.worldRecordId,
    job: {
      id: tug.data.jobId,
      kind: 'hauler',
      payload: { role: 'tug', towTargetId: target.id },
    },
    towAttachmentId: 'attachment:yard-tug:1',
    towTargetId: target.id,
  };
  h.state.entities.set(tug.id, tug);
  h.state.entities.set(target.id, target);
  h.state.entityList.push(tug, target);
  h.state.traffic.freighters.push({ id: tug.id, role: 'tug', targetId: h.helios.id, waitT: 0 });
  installTowAuthority(h, { tug, target, entry });
  return { tug, target, entry };
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

test('Helios liner yields at its berth to an attached yard tow, resumes, and recomputes after Continue', () => {
  const h = boot();
  const itinerary = stampLiner(h);
  const tow = attachActiveTugTow(h);
  const originalId = h.express.data.worldRecordId;

  h.state.simTime = itinerary.departureAt;
  h.system.update(0.1, h.state);
  assert.equal(itinerary.state, 'BOARDING', 'a real tow keeps passenger custody at the origin');
  assert.equal(itinerary.custody.state, 'AT_ORIGIN');
  assert.equal(h.express.data.intent.moveZ, 0, 'the existing liner brakes while the attached tow crosses its berth');
  assert.equal(h.express.data.intent.brake, true);
  assert.match(h.express.data.trafficLabel, /YIELDING FOR TOW/);
  assert.ok(itinerary.departureAt > h.state.simTime, 'the saved departure window advances with the live obstruction');
  assert.equal(h.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt').length, 0);

  const savedLiner = structuredClone(h.express);
  const savedTow = [structuredClone(tow.tug), structuredClone(tow.target)];
  const envelope = h.system.serialize();
  const continued = rematerialize(savedLiner, envelope, savedTow);
  const restoredTug = continued.state.entities.get(tow.tug.id);
  const restoredTarget = continued.state.entities.get(tow.target.id);
  const restoredEntry = {
    ...tow.entry,
    entityId: restoredTug.id,
    towTargetId: restoredTarget.id,
    job: { ...tow.entry.job, payload: { ...tow.entry.job.payload, towTargetId: restoredTarget.id } },
  };
  installTowAuthority(continued, { tug: restoredTug, target: restoredTarget, entry: restoredEntry });
  continued.bus.emit('save:loaded');
  const continuedItinerary = continued.rehydrated.data.itinerary;
  continued.state.simTime = continuedItinerary.departureAt + 0.1;
  continued.system.update(0.1, continued.state);
  assert.equal(continuedItinerary.state, 'BOARDING', 'Continue recomputes the still-live physical obstruction');
  assert.equal(continuedItinerary.custody.state, 'AT_ORIGIN');
  assert.equal(continued.rehydrated.data.trafficLabel.includes('YIELDING FOR TOW'), true);

  restoredTug.pos = { x: -900, z: 0 };
  restoredTarget.pos = { x: -700, z: 0 };
  continued.state.simTime = continuedItinerary.departureAt + 0.1;
  continued.system.update(0.1, continued.state);
  assert.equal(continuedItinerary.state, 'EN_ROUTE', 'the same service departs on its next tick after the tow clears');
  assert.equal(continuedItinerary.custody.state, 'ONBOARD');
  assert.equal(continued.rehydrated.data.worldRecordId, originalId);
  assert.equal(continued.rec.id, continued.rehydrated.id);
  assert.doesNotMatch(continued.rehydrated.data.trafficLabel, /YIELDING FOR TOW/);
  assert.equal(continued.bus.events.filter((event) => event.name === 'traffic:passengerLinerReceipt').length, 0);
});

test('Helios liner does not yield to a tug job before its physical attachment exists', () => {
  const h = boot();
  const itinerary = stampLiner(h);
  const tow = attachActiveTugTow(h);
  tow.entry.towAttachmentId = null;
  delete tow.tug.data.npcTowAttachmentId;
  delete tow.target.data.npcTowAttachmentId;
  h.state.simTime = itinerary.departureAt;

  h.system.update(0.1, h.state);

  assert.equal(itinerary.state, 'EN_ROUTE', 'an intended tow target has no right of way until the line is attached');
  assert.equal(itinerary.custody.state, 'ONBOARD');
  assert.doesNotMatch(h.express.data.trafficLabel, /YIELDING FOR TOW/);
});

test('Helios liner does not yield to stale tow markers when the physics attachment is absent', () => {
  const h = boot();
  const itinerary = stampLiner(h);
  const tow = attachActiveTugTow(h);
  // The durable job row, active semantic attachment and both entity markers still agree. The
  // physics owner has no corresponding live constraint, so this cannot block the liner.
  installTowAuthority(h, { ...tow, telemetry: false });
  h.state.simTime = itinerary.departureAt;

  h.system.update(0.1, h.state);

  assert.equal(itinerary.state, 'EN_ROUTE');
  assert.equal(itinerary.custody.state, 'ONBOARD');
  assert.doesNotMatch(h.express.data.trafficLabel, /YIELDING FOR TOW/);
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
