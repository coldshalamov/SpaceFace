import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { DEFAULT_MASK } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics as physicsProto } from '../src/core/physics.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  PALLAS_HIDDEN_CACHE,
  PALLAS_HIDDEN_CACHE_CHOICES,
  PALLAS_HIDDEN_CACHE_LOTS,
  PALLAS_HIDDEN_CACHE_RESOLUTION_ID,
  normalizePallasHiddenCacheState,
  pallasHiddenCacheSignalAvailable,
} from '../src/data/pallasHiddenCache.js';
import { cargo as cargoProto } from '../src/systems/cargo.js';
import { economy as economyProto } from '../src/systems/economy.js';
import { heat as heatProto } from '../src/systems/heat.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { world as worldProto } from '../src/systems/world.js';
import { buildSystemModel, resolveCourseTarget } from '../src/ui/galaxyMap.js';
import { pallasHiddenCachePromptView } from '../src/ui/recoveryEncounterPrompt.js';
import { pallasHiddenCacheMapReadouts, pallasHiddenCacheMapTarget } from '../src/ui/pallasHiddenCacheMapLayer.js';

const PALLAS = SECTORS.find((sector) => sector.id === PALLAS_HIDDEN_CACHE.sectorId);

function clone(value) {
  return structuredClone(value);
}

function boot({ seed = 4813, cargoState = null, withEconomy = false } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };
  if (cargoState) state.player.cargo = clone(cargoState);

  const bus = createBus();
  const log = [];
  const rawEmit = bus.emit.bind(bus);
  bus.emit = (event, payload) => {
    log.push({ event, payload });
    return rawEmit(event, payload);
  };
  let nextId = 1;
  const spawnEntity = (spec) => {
    const entity = {
      ...spec,
      id: nextId++, alive: spec.alive !== false, collides: spec.collides !== false,
      collisionMask: spec.collisionMask || DEFAULT_MASK[spec.type] || 0,
      pos: { ...(spec.pos || { x: 0, z: 0 }) }, vel: { ...(spec.vel || { x: 0, z: 0 }) },
      flags: { ...(spec.flags || {}) }, data: { ...(spec.data || {}) },
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const cargo = Object.assign({}, cargoProto);
  const world = Object.assign({}, worldProto);
  const scanner = Object.assign({}, scannerProto);
  const economy = withEconomy ? Object.assign({}, economyProto) : null;
  const heat = withEconomy ? Object.assign({}, heatProto) : null;
  const registry = { get: (name) => (name === 'cargo' ? cargo : name === 'economy' ? economy : null) };
  const helpers = { hash32, mulberry32, spawnEntity };
  cargo.init({ state, bus, helpers, registry });
  world.init({ state, bus, helpers, registry });
  scanner.init({ state, bus, helpers, registry });
  if (economy) {
    economy.init({ state, bus, helpers, registry });
    heat.init({ state, bus, helpers, registry });
  }

  state.world.currentSectorId = PALLAS_HIDDEN_CACHE.sectorId;
  const active = { id: PALLAS_HIDDEN_CACHE.sectorId, stations: [], fields: [], gates: [], pois: [], hazards: [], enemies: [], dressing: [] };
  const discovery = world._discoveryFor(PALLAS_HIDDEN_CACHE.sectorId);
  discovery.discovered = true;
  discovery.visitedCount = 1;
  world._spawnPOIs(PALLAS, active, discovery, () => 0.5);
  state.world.activeSector = active;
  const wreck = state.entityList.find((entity) => entity.data?.poiId === PALLAS_HIDDEN_CACHE.cluePoiId);
  const cache = state.entityList.find((entity) => entity.data?.poiId === PALLAS_HIDDEN_CACHE.cachePoiId);
  assert.ok(wreck && cache, 'authored Pallas POIs materialize physical carriers');
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { ...wreck.pos }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { state, bus, log, cargo, world, scanner, economy, heat, player, wreck, cache, spawnEntity };
}

function scanSignal(h, sourceId) {
  h.scanner._pulse(h.state, h.player, h.state.simTime);
  const payload = h.log.findLast((entry) => entry.event === 'signal:scanResults')?.payload;
  return payload?.signals.find((signal) => signal.sourceId === sourceId) || null;
}

function investigateAt(h, signal, entity) {
  h.player.pos.x = entity.pos.x;
  h.player.pos.z = entity.pos.z;
  const courseCount = h.log.filter((entry) => entry.event === 'ui:setCourse').length;
  assert.equal(h.scanner._trackSignal({ signalId: signal.id }), false, 'manual cache operations refuse generic course tracking');
  h.bus.emit('signal:investigate', { signalId: signal.id });
  assert.equal(h.state.signalInvestigation.trackedId, signal.id);
  assert.equal(h.log.filter((entry) => entry.event === 'ui:setCourse').length, courseCount,
    'manual investigation never emits a waypoint');
  h.scanner._updateTrackedSignal(h.state);
}

function collectThroughActivePhysics(h, pickup) {
  h.player.pos.x = pickup.pos.x;
  h.player.pos.z = pickup.pos.z;
  const decoys = Array.from({ length: 127 }, (_, index) => h.spawnEntity({
    type: 'pickup', pos: { x: pickup.pos.x + 2_000 + index * 4, z: pickup.pos.z + 2_000 },
    vel: { x: 0, z: 0 }, radius: 1, collides: true,
    data: { kind: 'cargo', commodityId: 'cmdty_ore_iron', amount: 1 },
  }));
  const pickups = [pickup, ...decoys];
  h.state.entityIndex = { pickups, shipLike: [h.player] };
  h.state.spatialHash.rebuild([h.player, ...pickups]);
  assert.ok(h.state.spatialHash.diagnostics.activeBuckets > 0,
    'the production spatial hash contains live cache and decoy colliders');
  const physics = Object.assign({}, physicsProto);
  physics.init({ state: h.state, bus: h.bus, helpers: {} });
  const before = h.log.filter((entry) => entry.event === 'pickup:collected').length;
  physics.collectPickups(h.state);
  assert.ok(physics._diag.pickupSpatialQueries > 0, 'physics reaches the Pallas lot through active spatial queries');
  const receipt = h.log.filter((entry) => entry.event === 'pickup:collected').slice(before);
  assert.equal(receipt.length, 1, 'physical overlap emits one pickup collection receipt');
  return receipt[0].payload;
}

function reachChoice({ withEconomy = false } = {}) {
  const h = boot({ withEconomy });
  const ceres = SECTORS.find((sector) => sector.id === 'sector_ceres_belt');
  assert.ok(SECTORS.find((sector) => sector.id === 'sector_helios_prime').neighbors.includes(ceres.id)
    && ceres.neighbors.includes(PALLAS_HIDDEN_CACHE.sectorId), 'Pallas has a charted default-route approach through Ceres');
  assert.equal(h.wreck.data.placeId, 'place_dead_hulk');
  assert.equal(h.cache.data.placeId, 'place_debris_chunk');
  assert.equal(h.wreck.data.requiresActiveScan, true);
  assert.equal(h.cache.data.requiresActiveScan, true);

  const wreckSignal = scanSignal(h, PALLAS_HIDDEN_CACHE.cluePoiId);
  assert.ok(wreckSignal, 'active pulse reads the physical pirate-wreck manifest');
  assert.equal(wreckSignal.id, PALLAS_HIDDEN_CACHE.clueSignalId);
  assert.equal(wreckSignal.manualInvestigation, true);
  assert.equal(wreckSignal.classification, 'BLACK-WAKE WEAPONS TRACE');
  assert.equal(h.state.signalInvestigation.records[PALLAS_HIDDEN_CACHE.cacheSignalId], undefined,
    'the undiscovered cache signal is absent before the physical clue');
  assert.equal((h.state.world.scanPings[PALLAS_HIDDEN_CACHE.sectorId] || [])
    .some((ping) => ping.id === PALLAS_HIDDEN_CACHE.cachePoiId), false,
  'a pre-clue scan cannot leak the hidden cache as an exact ping');

  investigateAt(h, wreckSignal, h.wreck);
  const ring = pallasHiddenCacheMapReadouts(h.state, PALLAS_HIDDEN_CACHE.sectorId)[0];
  assert.equal(h.state.world.pallasHiddenCache.phase, 'searching');
  assert.equal(ring.statusLabel, 'BLACK-WAKE SEARCH');
  assert.equal(ring.fixedPos, null);
  assert.equal(resolveCourseTarget(pallasHiddenCacheMapTarget(ring)), null,
    'the approximate ring cannot become a fabricated course');
  assert.ok(Math.hypot(ring.center.x - h.cache.pos.x, ring.center.z - h.cache.pos.z) < ring.radius,
    'the authored cache lies inside the clue-derived search ring');
  assert.notDeepEqual(ring.center, h.cache.pos, 'the clue does not disclose an exact cache course');
  assert.equal(buildSystemModel(h.state, PALLAS_HIDDEN_CACHE.sectorId).bearings
    .some((bearing) => bearing.cacheRecordId === PALLAS_HIDDEN_CACHE.recordId), true,
  'the unified map retains world-owned Pallas search evidence');

  h.state.simTime += 9;
  h.player.pos.x = h.cache.pos.x;
  h.player.pos.z = h.cache.pos.z;
  const cacheSignal = scanSignal(h, PALLAS_HIDDEN_CACHE.cachePoiId);
  const crowdedSignals = h.log.findLast((entry) => entry.event === 'signal:scanResults')?.payload?.signals || [];
  assert.equal(crowdedSignals.length, 6, 'the crowded Pallas scanner readout retains its production cap');
  assert.ok(cacheSignal, 'a later active pulse inside the ring finds the physical cache in the live scanner readout');
  assert.equal(crowdedSignals.at(-1).id, cacheSignal.id,
    'the close manual cache is visible without outranking higher-kind Quiessence signals');
  assert.equal(cacheSignal.id, PALLAS_HIDDEN_CACHE.cacheSignalId);
  assert.equal(cacheSignal.classification, 'SEALED WEAPONS CACHE');
  investigateAt(h, cacheSignal, h.cache);
  assert.equal(h.state.world.pallasHiddenCache.phase, 'choice');
  const decision = h.log.findLast((entry) => entry.event === 'pallasHiddenCache:decisionReady')?.payload;
  assert.ok(decision);
  assert.deepEqual(decision.choices.map((choice) => choice.id), PALLAS_HIDDEN_CACHE_CHOICES.map((choice) => choice.id));
  assert.deepEqual(decision.choices.map((choice) => choice.label), ['RECOVER', 'REPORT', 'CRIMINAL USE']);
  assert.equal(decision.reportAvailable, false);
  const prompt = pallasHiddenCachePromptView(decision);
  assert.deepEqual(prompt.choices.map((choice) => choice.controllerKey), ['A', 'B', 'X']);
  assert.equal(prompt.choices.find((choice) => choice.id === 'report').available, false);
  assert.match(prompt.choices.find((choice) => choice.id === 'report').ariaLabel, /Drift Market/i);
  return h;
}

test('PQ-048.13 is a sourced manual wreck investigation, approximate Pallas ring, and gated cache choice', () => {
  const h = reachChoice();
  h.world._onPallasHiddenCacheSignalInvestigated({
    sectorId: PALLAS_HIDDEN_CACHE.sectorId, poiId: PALLAS_HIDDEN_CACHE.cachePoiId,
    pos: h.cache.pos, completedAt: h.state.simTime,
  });
  assert.equal(h.log.filter((entry) => entry.event === 'pallasHiddenCache:decisionReady').length, 1,
    'replayed scanner completion cannot duplicate the choice');

  const savedWorld = h.world.serialize();
  const savedScanner = h.scanner.serialize();
  const restored = boot();
  restored.world.deserialize(savedWorld);
  restored.scanner.deserialize(savedScanner);
  assert.equal(restored.world._presentPallasHiddenCacheDecision('sector-enter'), false,
    'Continue defers the re-entry prompt until presentation state is ready');
  restored.bus.emit('save:loaded', {});
  assert.equal(restored.log.filter((entry) => entry.event === 'pallasHiddenCache:decisionReady').length, 1);
  restored.bus.emit('save:loaded', {});
  assert.equal(restored.log.filter((entry) => entry.event === 'pallasHiddenCache:decisionReady').length, 1,
    'repeated Continue edges cannot duplicate the unresolved prompt');
});

test('PQ-048.13 REPORT is available only at truthful Drift Market and settles once', () => {
  const h = reachChoice();
  assert.equal(h.world._onPallasHiddenCacheChoice({
    recordId: PALLAS_HIDDEN_CACHE.recordId, choiceId: 'report',
  }), false, 'field report is refused');
  h.state.ui = { docked: true, dockedStationId: 'station_smuggler' };
  assert.equal(h.world._onPallasHiddenCacheChoice({
    recordId: PALLAS_HIDDEN_CACHE.recordId, choiceId: 'report',
  }), false, 'black-market berth cannot impersonate Drift Market');
  h.state.ui.dockedStationId = PALLAS_HIDDEN_CACHE.reportStationId;
  assert.equal(h.world._presentPallasHiddenCacheDecision('dock:docked', PALLAS_HIDDEN_CACHE.reportStationId), true);
  assert.equal(h.world._onPallasHiddenCacheChoice({
    recordId: PALLAS_HIDDEN_CACHE.recordId, choiceId: 'report',
  }), true);
  assert.equal(h.state.world.pallasHiddenCache.phase, 'reported');
  assert.equal(h.state.world.pallasHiddenCache.receipt.id, PALLAS_HIDDEN_CACHE_RESOLUTION_ID);
  assert.equal(h.world._onPallasHiddenCacheChoice({
    recordId: PALLAS_HIDDEN_CACHE.recordId, choiceId: 'report',
  }), false, 'receipt prevents replayed reports');
  assert.deepEqual(h.log.filter((entry) => entry.event === 'faction:repDelta').map((entry) => entry.payload), [{
    factionId: PALLAS_HIDDEN_CACHE.reportFactionId,
    delta: PALLAS_HIDDEN_CACHE.reportRepDelta,
    reason: 'pallas_hidden_cache_report',
  }]);
  const ledger = buildShipLedger(h.state, { pageSize: 24 });
  assert.equal(ledger.entries.filter((entry) => entry.sourceKind === 'world.pallasHiddenCache').length, 1,
    'the resolved Pallas disposition remains visible in the existing unique ledger family');
});

test('PQ-048.13 RECOVER leaves a finite physical weapons case for standard cargo pickup', () => {
  const h = reachChoice();
  h.state.player.cargo.capVolume = 10;
  assert.equal(h.world._onPallasHiddenCacheChoice({
    recordId: PALLAS_HIDDEN_CACHE.recordId, choiceId: 'recover',
  }), true);
  const lot = PALLAS_HIDDEN_CACHE_LOTS.recover;
  const pickup = h.state.entityList.find((entity) => entity.alive !== false
    && entity.data?.pallasHiddenCacheLotId === lot.lotId);
  assert.ok(pickup && pickup.collides, 'recovery creates a collidable weapons case instead of direct cargo');
  assert.equal(h.state.player.cargo.items.cmdty_weapons || 0, 0, 'the cache choice does not write cargo directly');
  assert.equal(pickup.data.commodityId, 'cmdty_weapons');
  assert.equal(pickup.data.amount, lot.totalQty);
  const receipt = collectThroughActivePhysics(h, pickup);
  assert.equal(receipt.acceptedAmount, lot.totalQty);
  assert.equal(h.state.player.cargo.items.cmdty_weapons, lot.totalQty);
  assert.equal(h.state.world.pallasHiddenCache.cargoLot.remainingQty, 0);
});

test('PQ-048.13 malformed terminal saves fail closed before Continue can repeat a consequence', () => {
  const h = reachChoice();
  const forged = structuredClone(h.state.world.pallasHiddenCache);
  forged.phase = 'criminal_used';
  forged.choiceId = 'criminal_use';
  forged.receipt = {
    id: 'forged-cache-resolution',
    recordId: PALLAS_HIDDEN_CACHE.recordId,
    sectorId: PALLAS_HIDDEN_CACHE.sectorId,
    cachePoiId: PALLAS_HIDDEN_CACHE.cachePoiId,
    choiceId: 'criminal_use',
    outcome: 'criminal_used',
    lotId: PALLAS_HIDDEN_CACHE_LOTS.criminal_use.lotId,
    commodityId: 'cmdty_stolen_goods',
    totalQty: PALLAS_HIDDEN_CACHE_LOTS.criminal_use.totalQty,
  };
  forged.cargoLot = {
    ...PALLAS_HIDDEN_CACHE_LOTS.criminal_use,
    collectedQty: 0,
    lostQty: 0,
    remainingQty: PALLAS_HIDDEN_CACHE_LOTS.criminal_use.totalQty,
    collectionReceipts: [],
  };
  const normalized = normalizePallasHiddenCacheState(forged);
  assert.equal(normalized.phase, 'choice');
  assert.equal(normalized.receipt, null);
  assert.equal(normalized.cargoLot, null);
});

test('PQ-048.13 malformed intermediate saves cannot reveal the hidden cache signal', () => {
  const malformed = {
    schemaVersion: PALLAS_HIDDEN_CACHE.schemaVersion,
    recordId: PALLAS_HIDDEN_CACHE.recordId,
    phase: 'choice',
    evidence: { evidenceId: 'forged-physical-clue' },
    search: {
      center: { x: -21_460, z: 19_720 },
      radius: PALLAS_HIDDEN_CACHE.searchRadiusWu,
      sourceEvidenceId: PALLAS_HIDDEN_CACHE.evidenceId,
    },
    cache: {
      poiId: PALLAS_HIDDEN_CACHE.cachePoiId,
      fixedPos: { x: -22_040, z: 20_200 },
      foundAt: 12,
    },
  };
  const normalized = normalizePallasHiddenCacheState(malformed);
  assert.equal(normalized.phase, 'unfound');
  assert.equal(pallasHiddenCacheSignalAvailable({ world: { pallasHiddenCache: malformed } },
    PALLAS_HIDDEN_CACHE.cachePoiId), false);
});

test('PQ-048.13 CRIMINAL USE conserves a physical stolen-goods lot and reaches black-market/patrol/heat seams', () => {
  const h = reachChoice({ withEconomy: true });
  const blackMarket = h.economy.ensureMarket('station_smuggler');
  const lawfulMarket = h.economy.ensureMarket(PALLAS_HIDDEN_CACHE.reportStationId);
  assert.ok(blackMarket.cmdty_stolen_goods, 'existing black-market economy seam trades stolen goods');
  assert.equal(lawfulMarket.cmdty_stolen_goods, undefined, 'Drift Market does not silently buy contraband');

  h.state.player.cargo.capVolume = 2;
  const creditsBeforeChoice = h.state.player.credits;
  const heatBeforeChoice = h.state.player.heat;
  assert.equal(h.world._onPallasHiddenCacheChoice({
    recordId: PALLAS_HIDDEN_CACHE.recordId, choiceId: 'criminal_use',
  }), true);
  const lot = PALLAS_HIDDEN_CACHE_LOTS.criminal_use;
  const pickup = h.state.entityList.find((entity) => entity.alive !== false && entity.data?.pallasHiddenCacheLotId === lot.lotId);
  assert.ok(pickup && pickup.collides, 'criminal use creates a reachable physical pickup, not direct cargo');
  assert.equal(pickup.data.commodityId, 'cmdty_stolen_goods');
  assert.equal(pickup.data.amount, lot.totalQty);
  assert.equal(h.state.player.cargo.items.cmdty_stolen_goods || 0, 0, 'criminal use does not mint cargo directly');
  assert.equal(h.state.player.credits, creditsBeforeChoice, 'criminal use does not write credits');
  assert.equal(h.state.player.heat, heatBeforeChoice, 'criminal use delegates heat consequences to patrol/law');
  const first = collectThroughActivePhysics(h, pickup);
  assert.equal(first.acceptedAmount, 2);
  assert.equal(first.rejectedAmount, 2);
  assert.equal(h.state.world.pallasHiddenCache.cargoLot.remainingQty, 2);

  const savedWorld = h.world.serialize();
  const savedCargo = clone(h.state.player.cargo);
  const restored = boot({ cargoState: savedCargo, withEconomy: true });
  restored.world.deserialize(savedWorld);
  restored.bus.emit('save:loaded', {});
  const remainder = restored.state.entityList.find((entity) => entity.alive !== false && entity.data?.pallasHiddenCacheLotId === lot.lotId);
  assert.ok(remainder);
  assert.equal(remainder.data.amount, 2, 'Continue rematerializes the one finite physical remainder');
  restored.state.player.cargo.capVolume = 10;
  const second = collectThroughActivePhysics(restored, remainder);
  assert.equal(second.acceptedAmount, 2);
  assert.equal(restored.state.player.cargo.items.cmdty_stolen_goods, lot.totalQty);
  assert.equal(restored.state.world.pallasHiddenCache.cargoLot.collectedQty, lot.totalQty);
  assert.equal(restored.state.world.pallasHiddenCache.cargoLot.remainingQty, 0);

  restored.economy._rng = () => 0;
  restored.bus.emit('patrol:proximity', { security: 1, factionId: 'faction_mts' });
  const scan = restored.log.findLast((entry) => entry.event === 'contraband:scanned')?.payload;
  assert.ok(scan?.found, 'the existing patrol/economy scan consumes the criminal lot');
  assert.deepEqual(scan.confiscated, [{ commodityId: 'cmdty_stolen_goods', qty: lot.totalQty }]);
  assert.ok(restored.state.player.heat > 0, 'the existing heat owner receives the scan consequence');
  assert.equal(restored.state.player.cargo.items.cmdty_stolen_goods || 0, 0);
});
