import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { buildHeistOffer } from '../src/data/heistMission.js';
import { TETHYS_BLACK_MARKET_DISCOVERY, frontierRumorOffer } from '../src/data/frontierRumors.js';
import { SECTORS } from '../src/data/sectors.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';
import { frontierRumorMapReadouts } from '../src/ui/frontierRumorMapLayer.js';
import { buildReply } from '../src/ui/screens/bar.js';

const DISCOVERY = TETHYS_BLACK_MARKET_DISCOVERY;

function tethysSector() {
  return SECTORS.find((sector) => sector.id === DISCOVERY.sectorId);
}

function boot(seed = 4811) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.player.credits = 20_000;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  state.missions = {
    ...(state.missions || {}),
    boards: {
      ...((state.missions && state.missions.boards) || {}),
      [DISCOVERY.stationId]: { slots: [buildHeistOffer()] },
    },
  };

  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return rawEmit(event, payload);
  };
  const charges = [];
  bus.on('economy:chargeCredits', (payload) => {
    charges.push(payload);
    state.player.credits -= payload.amount;
  });

  let nextId = 1;
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: nextId++,
      alive: spec.alive !== false,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      data: { ...(spec.data || {}) },
      flags: { ...(spec.flags || {}) },
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const helpers = { hash32, mulberry32, spawnEntity };
  const registry = { get: () => null };
  const world = Object.assign({}, worldProto);
  const scanner = Object.assign({}, scannerProto);
  world.init({ state, bus, helpers, registry });
  scanner.init({ state, bus, helpers, registry });

  const sector = tethysSector();
  state.world.currentSectorId = DISCOVERY.sectorId;
  const active = { id: DISCOVERY.sectorId, stations: [], fields: [], gates: [], pois: [], hazards: [] };
  const discovery = { discovered: true, visitedCount: 1, pois: {}, fieldsDepleted: {} };
  state.world.discovery[DISCOVERY.sectorId] = discovery;
  world._spawnPOIs(sector, active, discovery, () => 0.5);
  state.world.activeSector = active;

  const contactBuoy = state.entityList.find((entity) => entity.data?.poiId === DISCOVERY.poiId);
  assert.ok(contactBuoy, 'fixture materializes the authored black-market buoy');
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { ...contactBuoy.pos }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { state, bus, log, charges, world, scanner, player, contactBuoy };
}

test('PQ-048.11 requires a purchased approximate rumor, physical pulse, and investigation before the Quiet contact is remembered', () => {
  const t = boot();
  const offer = frontierRumorOffer(t.state, DISCOVERY.stationId);
  assert.ok(offer);
  assert.equal(offer.id, DISCOVERY.rumorId, 'Tethys always offers the authored lead before ordinary rotation');
  assert.equal(offer.targetId, DISCOVERY.poiId);
  assert.equal(offer.kind, 'cache');
  assert.equal(Object.hasOwn(offer, 'targetPos'), false, 'the card exposes no exact target');
  assert.equal(Object.hasOwn(offer, 'courseTarget'), false, 'the card cannot issue a course');

  const creditsBefore = t.state.player.credits;
  assert.equal(t.world._onPurchaseFrontierRumor({ rumorId: offer.id, stationId: DISCOVERY.stationId }), true);
  assert.equal(t.charges.length, 1, 'existing economy charge authority runs exactly once');
  assert.equal(t.state.player.credits, creditsBefore - offer.price);
  assert.equal(t.world._acquireFrontierRumor(offer, { charge: true }), true, 'repeated acquisition is idempotent');
  assert.equal(t.charges.length, 1, 'an acquired lead cannot charge twice');

  const mapReadout = frontierRumorMapReadouts(t.state, DISCOVERY.sectorId);
  assert.equal(mapReadout.length, 1);
  assert.equal(mapReadout[0].rumorId, DISCOVERY.rumorId);
  assert.equal(mapReadout[0].fixedPos, null, 'the discovery map remains a search ring');
  assert.equal(mapReadout[0].courseTarget, null, 'the discovery map cannot plot the buoy');
  assert.equal(t.state.world.frontierRumors.byId[offer.id].phase, 'rumored');

  assert.equal(t.contactBuoy.data.landmarkGlb, 'place_nav_buoy', 'the route reuses the existing physical POI');
  assert.equal(t.contactBuoy.data.requiresActiveScan, true);
  assert.equal(t.contactBuoy.data.scannerSignalKind, 'ambush');
  t.world._tickPOIScan(t.state);
  assert.equal(t.state.world.discovery[DISCOVERY.sectorId].pois[DISCOVERY.poiId].discovered, false,
    'passive proximity at the buoy cannot discover the contact');

  t.scanner._pulse(t.state, t.player, t.state.simTime);
  const scan = t.log.findLast((entry) => entry.event === 'signal:scanResults')?.payload;
  const signal = scan?.signals.find((row) => row.sourceId === DISCOVERY.poiId);
  assert.ok(signal, 'an active pulse exposes the physical POI as a scanner return');
  assert.equal(signal.id, `signal:poi:${DISCOVERY.poiId}`);
  assert.equal(signal.sourceId, DISCOVERY.poiId, 'the scanner path keeps the authored string identity');
  assert.equal(signal.sourceKind, 'ambush');
  assert.equal(signal.entityId, t.contactBuoy.id);
  assert.doesNotMatch(`${signal.classification} ${signal.detail}`, /hostile|pirate|ambush/i,
    'the traffic return does not lie about intent');
  assert.equal(t.state.signalInvestigation.records[`signal:entity:${t.contactBuoy.id}`], undefined,
    'the physical POI never emits a duplicate transient-entity signal');
  assert.equal(t.state.world.frontierRumors.byId[offer.id].phase, 'rumored',
    'a pulse alone cannot create the contact');

  const courseEventsBeforeManualInvestigation = t.log.filter((entry) => entry.event === 'ui:setCourse').length;
  assert.equal(t.scanner._trackSignal({ signalId: signal.id }), false,
    'the authored return declines the generic course-plot action');
  assert.equal(t.log.filter((entry) => entry.event === 'ui:setCourse').length, courseEventsBeforeManualInvestigation,
    'the generic action cannot mutate navigation for this lead');

  t.bus.emit('signal:investigate', { signalId: signal.id });
  assert.equal(t.state.signalInvestigation.trackedId, signal.id,
    'manual investigation remains in the durable scanner state until the physical return is resolved');
  assert.equal(t.log.filter((entry) => entry.event === 'signal:investigating'
    && entry.payload.id === signal.id).length, 1, 'manual arming has its own presenter seam');
  assert.equal(t.log.filter((entry) => entry.event === 'ui:setCourse').length, courseEventsBeforeManualInvestigation,
    'manual investigation emits no course request');

  const armedWorld = t.world.serialize();
  const armedScanner = t.scanner.serialize();
  const reloadedWhileSearching = boot();
  reloadedWhileSearching.world.deserialize(armedWorld);
  reloadedWhileSearching.scanner.deserialize(armedScanner);
  assert.equal(reloadedWhileSearching.state.world.frontierRumors.byId[offer.id].phase, 'rumored',
    'Continue retains the purchased clue before it is resolved');
  assert.equal(reloadedWhileSearching.state.signalInvestigation.trackedId, signal.id,
    'Continue retains the manually armed physical investigation');
  assert.equal(reloadedWhileSearching.state.signalInvestigation.records[signal.id].manualInvestigation, true,
    'the manual-only route is still protected after reload');

  t.scanner._updateTrackedSignal(t.state);
  const remembered = t.state.world.frontierRumors.byId[offer.id];
  assert.equal(remembered.phase, 'contacted');
  assert.equal(remembered.contactId, DISCOVERY.contactId);
  assert.deepEqual(remembered.opportunity, {
    type: DISCOVERY.opportunityType,
    stationId: DISCOVERY.stationId,
    status: 'available',
  });
  assert.match(remembered.risk, /law attention/i);
  assert.equal(t.log.filter((entry) => entry.event === 'poi:discovered'
    && entry.payload.poiId === DISCOVERY.poiId).length, 1, 'physical completion emits the normal POI seam once');
  assert.equal(t.log.filter((entry) => entry.event === 'poi:identified'
    && entry.payload.poiId === DISCOVERY.poiId).length, 1);
  assert.equal(t.log.filter((entry) => entry.event === 'frontierRumor:contacted'
    && entry.payload.rumorId === DISCOVERY.rumorId).length, 1);

  const reply = buildReply('barkeep', 'rumors', { state: t.state, bus: t.bus }, DISCOVERY.stationId);
  assert.equal(reply.missionOffer?.type, 'heist_intercept', 'the remembered contact points to the existing PQ019C offer');
  assert.match(reply.text, /law response, confiscation, heat, or a lost capsule/i);
  const existingOffer = t.state.missions.boards[DISCOVERY.stationId].slots[0];
  assert.equal(reply.missionOffer, existingOffer, 'the Bar presents rather than creates or accepts the mission');

  t.state.missions.boards[DISCOVERY.stationId].slots = [];
  const absent = buildReply('barkeep', 'rumors', { state: t.state, bus: t.bus }, DISCOVERY.stationId);
  assert.equal(absent.missionOffer, undefined);
  assert.match(absent.text, /no Capsule Run packet is live/i, 'absence never fabricates downstream access');
  t.state.missions.boards[DISCOVERY.stationId].slots = [existingOffer];

  const savedWorld = t.world.serialize();
  const savedScanner = t.scanner.serialize();
  const restored = boot();
  restored.world.deserialize(savedWorld);
  restored.scanner.deserialize(savedScanner);
  assert.equal(restored.state.world.frontierRumors.byId[DISCOVERY.rumorId].phase, 'contacted',
    'Continue keeps the remembered contact');
  assert.equal(restored.state.world.frontierRumors.byId[DISCOVERY.rumorId].contactId, DISCOVERY.contactId);
  assert.ok(restored.state.signalInvestigation.completed[signal.id], 'scanner completion also survives Continue');

  restored.world._onSignalInvestigated({
    sectorId: DISCOVERY.sectorId,
    sourceId: DISCOVERY.poiId,
    completedAt: restored.state.simTime,
  });
  assert.equal(restored.log.filter((entry) => entry.event === 'frontierRumor:contacted').length, 0,
    'replayed investigation after Continue cannot create a second contact receipt');
});
