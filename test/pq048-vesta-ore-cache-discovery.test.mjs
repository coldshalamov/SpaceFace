import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { DEFAULT_MASK } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { physics as physicsProto } from '../src/core/physics.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  VESTA_ORE_CACHE,
  VESTA_ORE_CACHE_CHOICES,
} from '../src/data/vestaOreCache.js';
import { cargo as cargoProto } from '../src/systems/cargo.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { buildShipLedger } from '../src/systems/shipLedger.js';
import { world as worldProto } from '../src/systems/world.js';
import { buildSystemModel, resolveCourseTarget } from '../src/ui/galaxyMap.js';
import { vestaOreCachePromptView } from '../src/ui/recoveryEncounterPrompt.js';
import { vestaOreCacheMapReadouts, vestaOreCacheMapTarget } from '../src/ui/vestaOreCacheMapLayer.js';

const VESTA = SECTORS.find((sector) => sector.id === VESTA_ORE_CACHE.sectorId);

function clone(value) {
  return structuredClone(value);
}

function boot({ seed = 4812, cargoState = null } = {}) {
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
      id: nextId++,
      alive: spec.alive !== false,
      collides: spec.collides !== false,
      collisionMask: spec.collisionMask || DEFAULT_MASK[spec.type] || 0,
      pos: { ...(spec.pos || { x: 0, z: 0 }) },
      vel: { ...(spec.vel || { x: 0, z: 0 }) },
      flags: { ...(spec.flags || {}) },
      data: { ...(spec.data || {}) },
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const helpers = { hash32, mulberry32, spawnEntity };
  const cargo = Object.assign({}, cargoProto);
  const world = Object.assign({}, worldProto);
  const scanner = Object.assign({}, scannerProto);
  const registry = { get: (name) => name === 'cargo' ? cargo : null };
  cargo.init({ state, bus, helpers, registry });
  world.init({ state, bus, helpers, registry });
  scanner.init({ state, bus, helpers, registry });

  state.world.currentSectorId = VESTA_ORE_CACHE.sectorId;
  const active = { id: VESTA_ORE_CACHE.sectorId, stations: [], fields: [], gates: [], pois: [], hazards: [], enemies: [], dressing: [] };
  const discovery = world._discoveryFor(VESTA_ORE_CACHE.sectorId);
  discovery.discovered = true;
  discovery.visitedCount = 1;
  world._spawnPOIs(VESTA, active, discovery, () => 0.5);
  state.world.activeSector = active;

  const relay = state.entityList.find((entity) => entity.data?.poiId === VESTA_ORE_CACHE.relayPoiId);
  const cache = state.entityList.find((entity) => entity.data?.poiId === VESTA_ORE_CACHE.cachePoiId);
  assert.ok(relay && cache, 'authored Vesta POIs materialize physical carriers');
  const player = spawnEntity({
    type: 'ship', team: 0, pos: { ...relay.pos }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { state, bus, log, cargo, world, scanner, player, relay, cache, spawnEntity };
}

function collectVestaPickupThroughActivePhysics(h, pickup) {
  h.player.pos.x = pickup.pos.x;
  h.player.pos.z = pickup.pos.z;
  const decoys = Array.from({ length: 127 }, (_, index) => h.spawnEntity({
    type: 'pickup',
    pos: { x: pickup.pos.x + 2_000 + index * 4, z: pickup.pos.z + 2_000 },
    vel: { x: 0, z: 0 },
    radius: 1,
    collides: true,
    data: { kind: 'ore', commodityId: 'cmdty_ore_iron', amount: 1 },
  }));
  const pickups = [pickup, ...decoys];
  h.state.entityIndex = { pickups, shipLike: [h.player] };
  h.state.spatialHash.rebuild([h.player, ...pickups]);
  assert.ok(h.state.spatialHash.diagnostics.activeBuckets > 0,
    'the production spatial hash is active and contains live colliders');

  const physics = Object.assign({}, physicsProto);
  physics.init({ state: h.state, bus: h.bus, helpers: {} });
  const before = h.log.filter((entry) => entry.event === 'pickup:collected').length;
  physics.collectPickups(h.state);
  assert.ok(physics._diag.pickupSpatialQueries > 0,
    'physics reaches the cache through its active spatial-query branch');
  const receipts = h.log.filter((entry) => entry.event === 'pickup:collected').slice(before);
  assert.equal(receipts.length, 1, 'physical overlap emits one pickup collection receipt');
  assert.equal(receipts[0].payload.pickupId, pickup.id);
  return receipts[0].payload;
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
  assert.equal(h.scanner._trackSignal({ signalId: signal.id }), false, 'manual operation refuses generic course tracking');
  h.bus.emit('signal:investigate', { signalId: signal.id });
  assert.equal(h.state.signalInvestigation.trackedId, signal.id);
  assert.equal(h.log.filter((entry) => entry.event === 'ui:setCourse').length, courseCount,
    'manual investigation never emits a waypoint');
  h.scanner._updateTrackedSignal(h.state);
}

function reachChoice() {
  const h = boot();
  assert.ok(SECTORS.find((sector) => sector.id === 'sector_helios_prime').neighbors.includes(VESTA_ORE_CACHE.sectorId),
    'the default Helios route has a direct Vesta neighbor');
  assert.equal(h.relay.data.placeId, 'place_nav_buoy');
  assert.equal(h.cache.data.placeId, 'place_debris_chunk');
  assert.equal(h.relay.data.requiresActiveScan, true);
  assert.equal(h.cache.data.requiresActiveScan, true);

  const relaySignal = scanSignal(h, VESTA_ORE_CACHE.relayPoiId);
  assert.ok(relaySignal, 'active pulse reads ore residue from the physical relay');
  assert.equal(relaySignal.id, VESTA_ORE_CACHE.relaySignalId);
  assert.equal(relaySignal.sourceKind, 'ore');
  assert.equal(relaySignal.manualInvestigation, true);
  assert.equal(relaySignal.classification, 'ORE-RESIDUE RELAY');
  assert.match(relaySignal.detail, /physical relay/i);
  assert.equal(h.state.signalInvestigation.records[VESTA_ORE_CACHE.cacheSignalId], undefined,
    'the cache signal is unavailable before physical clue acquisition');
  assert.equal((h.state.world.scanPings[VESTA_ORE_CACHE.sectorId] || [])
    .some((ping) => ping.id === VESTA_ORE_CACHE.cachePoiId), false,
  'the pre-clue pulse cannot leak the cache as an exact unknown ping');

  investigateAt(h, relaySignal, h.relay);
  const own = h.state.world.vestaOreCache;
  assert.equal(own.phase, 'searching');
  assert.equal(own.evidence.evidenceId, VESTA_ORE_CACHE.evidenceId);
  assert.equal(own.evidence.sourcePoiId, VESTA_ORE_CACHE.relayPoiId);
  assert.equal(own.evidence.carrier, 'physical_relay_ore_residue');
  const ring = vestaOreCacheMapReadouts(h.state, VESTA_ORE_CACHE.sectorId)[0];
  assert.equal(ring.statusLabel, 'RESIDUE SEARCH');
  assert.equal(ring.fixedPos, null);
  assert.equal(ring.courseTarget, null);
  assert.equal(resolveCourseTarget(vestaOreCacheMapTarget(ring)), null,
    'the approximate search ring is selectable but cannot become a fake course');
  assert.ok(Math.hypot(ring.center.x - h.cache.pos.x, ring.center.z - h.cache.pos.z) < ring.radius,
    'the authored cache lies inside the clue-derived ring');
  assert.notDeepEqual(ring.center, h.cache.pos, 'the clue does not disclose the exact cache position');
  assert.equal(buildSystemModel(h.state, VESTA_ORE_CACHE.sectorId).bearings
    .some((bearing) => bearing.cacheRecordId === VESTA_ORE_CACHE.recordId), true,
  'the unified map includes the world-owned residue memory');

  h.state.simTime += 9;
  h.player.pos.x = h.cache.pos.x;
  h.player.pos.z = h.cache.pos.z;
  const cacheSignal = scanSignal(h, VESTA_ORE_CACHE.cachePoiId);
  assert.ok(cacheSignal, 'a later active pulse inside the ring finds the physical cache');
  assert.equal(cacheSignal.id, VESTA_ORE_CACHE.cacheSignalId);
  assert.equal(cacheSignal.classification, 'SEALED ORE RETURN');
  investigateAt(h, cacheSignal, h.cache);
  assert.equal(h.state.world.vestaOreCache.phase, 'choice');
  assert.equal(h.log.filter((entry) => entry.event === 'vestaOreCache:decisionReady').length, 1);
  const fixed = vestaOreCacheMapReadouts(h.state, VESTA_ORE_CACHE.sectorId)[0];
  assert.deepEqual(fixed.fixedPos, h.cache.pos);
  assert.deepEqual(resolveCourseTarget(fixed.courseTarget).pos, h.cache.pos,
    'only the physically investigated cache becomes a fixed return course');
  const decision = h.log.findLast((entry) => entry.event === 'vestaOreCache:decisionReady').payload;
  assert.deepEqual(decision.choices.map((choice) => choice.id), VESTA_ORE_CACHE_CHOICES.map((choice) => choice.id));
  const prompt = vestaOreCachePromptView(decision);
  assert.deepEqual(prompt.choices.map((choice) => choice.controllerKey), ['A', 'B', 'X']);
  assert.ok(prompt.choices.every((choice) => choice.ariaLabel.includes(choice.consequence)),
    'each reachable button announces its consequence and controller binding');

  h.world._onSignalInvestigated({
    sectorId: VESTA_ORE_CACHE.sectorId,
    sourceId: VESTA_ORE_CACHE.cachePoiId,
    pos: h.cache.pos,
    completedAt: h.state.simTime,
  });
  assert.equal(h.log.filter((entry) => entry.event === 'vestaOreCache:decisionReady').length, 1,
    'replayed scanner completion cannot duplicate the choice');
  return h;
}

test('PQ-048.12 is a sourced manual relay investigation, approximate search, and gated physical cache choice', () => {
  const h = reachChoice();
  const savedWorld = h.world.serialize();
  const savedScanner = h.scanner.serialize();
  const restored = boot();
  restored.world.deserialize(savedWorld);
  restored.scanner.deserialize(savedScanner);
  assert.equal(restored.world._presentVestaOreCacheDecision('sector-enter'), false,
    'Continue defers the re-entry prompt until presentation state is ready');
  restored.bus.emit('save:loaded', {});
  assert.equal(restored.state.world.vestaOreCache.phase, 'choice');
  assert.ok(restored.state.signalInvestigation.completed[VESTA_ORE_CACHE.cacheSignalId]);
  assert.equal(restored.log.filter((entry) => entry.event === 'vestaOreCache:decisionReady').length, 1,
    'Continue rebinds one unresolved decision prompt');
  restored.bus.emit('save:loaded', {});
  assert.equal(restored.log.filter((entry) => entry.event === 'vestaOreCache:decisionReady').length, 1,
    'a repeated lifecycle edge does not duplicate the prompt');
});

for (const choiceId of ['preserve', 'report']) {
  test(`PQ-048.12 ${choiceId.toUpperCase()} writes one durable consequence and no invented cargo or law`, () => {
    const source = reachChoice();
    const savedWorld = source.world.serialize();
    const h = boot();
    h.world.deserialize(savedWorld);
    h.bus.emit('save:loaded', {});
    const beforeCargo = clone(h.state.player.cargo.items);
    assert.equal(h.world._onVestaOreCacheChoice({ recordId: VESTA_ORE_CACHE.recordId, choiceId }), true);
    assert.equal(h.state.world.vestaOreCache.phase, choiceId === 'preserve' ? 'preserved' : 'reported');
    assert.deepEqual(h.state.player.cargo.items, beforeCargo);
    assert.equal(h.world._onVestaOreCacheChoice({ recordId: VESTA_ORE_CACHE.recordId, choiceId }), false,
      'choice replay is rejected after the durable receipt commits');
    const rep = h.log.filter((entry) => entry.event === 'faction:repDelta');
    assert.equal(rep.length, choiceId === 'report' ? 1 : 0);
    if (choiceId === 'report') assert.deepEqual(rep[0].payload, {
      factionId: VESTA_ORE_CACHE.reportFactionId,
      delta: VESTA_ORE_CACHE.reportRepDelta,
      reason: 'vesta_ore_cache_report',
    });
    assert.equal(h.log.some((entry) => /heat|law|wanted|contraband/i.test(entry.event)), false,
      'the operation makes no unsupported law or heat claim');
    const fixed = vestaOreCacheMapReadouts(h.state, VESTA_ORE_CACHE.sectorId)[0];
    assert.ok(fixed.fixedPos && fixed.courseTarget, 'the resolved cache remains a fixed return in map memory');
    const ledger = buildShipLedger(h.state, { pageSize: 24 });
    const row = ledger.entries.find((entry) => entry.sourceKind === 'world.vestaOreCache');
    assert.ok(row);
    assert.equal(row.type, 'unique');
    assert.match(row.text, /cache|Vesta/i);
  });
}

test('PQ-048.12 TAKE conserves one stable provenance lot across partial capacity, Continue, and jettison recovery', () => {
  const source = reachChoice();
  const choiceWorld = source.world.serialize();
  const h = boot();
  h.world.deserialize(choiceWorld);
  h.bus.emit('save:loaded', {});
  h.state.player.cargo.capVolume = 2;
  assert.equal(h.world._onVestaOreCacheChoice({
    recordId: VESTA_ORE_CACHE.recordId,
    choiceId: 'take',
  }), true);
  const pickup = h.state.entityList.find((entity) => entity.alive !== false
    && entity.data?.vestaOreCacheLotId === VESTA_ORE_CACHE.lotId);
  assert.ok(pickup, 'TAKE creates a physical pickup instead of writing cargo directly');
  assert.equal(pickup.collides, true, 'TAKE uses the ordinary physical pickup contract');
  assert.equal(pickup.data.amount, VESTA_ORE_CACHE.totalQty);
  const firstPayload = collectVestaPickupThroughActivePhysics(h, pickup);
  assert.equal(firstPayload.acceptedAmount, 2);
  assert.equal(firstPayload.rejectedAmount, 4);
  assert.equal(pickup.alive, true);
  assert.equal(pickup.data.amount, 4, 'physics retains only the rejected physical remainder');
  assert.equal(h.state.world.vestaOreCache.cargoLot.collectedQty, 2);
  assert.equal(h.state.world.vestaOreCache.cargoLot.remainingQty, 4);
  assert.deepEqual(h.state.player.cargo.richLots.map((lot) => ({
    lotId: lot.lotId, provenanceId: lot.provenanceId, qty: lot.qty,
  })), [{ lotId: VESTA_ORE_CACHE.lotId, provenanceId: VESTA_ORE_CACHE.provenanceId, qty: 2 }]);

  const savedWorld = h.world.serialize();
  const savedCargo = clone(h.state.player.cargo);
  const restored = boot({ cargoState: savedCargo });
  restored.world.deserialize(savedWorld);
  restored.bus.emit('save:loaded', {});
  const remainderPickups = restored.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.vestaOreCacheLotId === VESTA_ORE_CACHE.lotId);
  assert.equal(remainderPickups.length, 1, 'Continue rematerializes one remainder pickup');
  assert.equal(remainderPickups[0].data.amount, 4);
  restored.bus.emit('save:loaded', {});
  assert.equal(restored.state.entityList.filter((entity) => entity.alive !== false
    && entity.data?.vestaOreCacheLotId === VESTA_ORE_CACHE.lotId).length, 1,
  'repeated lifecycle edges cannot duplicate the physical lot');

  restored.state.player.cargo.capVolume = 10;
  const secondPayload = collectVestaPickupThroughActivePhysics(restored, remainderPickups[0]);
  assert.equal(secondPayload.acceptedAmount, 4);
  assert.equal(remainderPickups[0].alive, false, 'accepted Continue remainder is consumed physically');
  assert.equal(restored.state.player.cargo.items[VESTA_ORE_CACHE.commodityId], 6);
  assert.equal(restored.state.world.vestaOreCache.cargoLot.collectedQty, 6);
  assert.equal(restored.state.world.vestaOreCache.cargoLot.remainingQty, 0);
  assert.equal(restored.state.player.cargo.richLots.find((lot) => lot.lotId === VESTA_ORE_CACHE.lotId).qty, 6);

  assert.equal(restored.cargo.jettison(VESTA_ORE_CACHE.commodityId, 6), 6);
  const jettison = restored.state.entityList.find((entity) => entity.alive !== false && entity.data?.jettisonedCargo
    && entity.data?.richLotSource?.lotId === VESTA_ORE_CACHE.lotId);
  assert.ok(jettison);
  assert.equal(restored.state.player.cargo.items[VESTA_ORE_CACHE.commodityId] || 0, 0);
  assert.equal(jettison.data.richLotSource.provenanceId, VESTA_ORE_CACHE.provenanceId);
  const recollect = {
    pickupId: jettison.id,
    collectorId: restored.player.id,
    kind: jettison.data.kind,
    commodityId: jettison.data.commodityId,
    amount: jettison.data.amount,
    pos: { ...jettison.pos },
  };
  restored.bus.emit('pickup:collected', recollect);
  assert.equal(recollect.acceptedAmount, 6);
  assert.equal(restored.state.player.cargo.items[VESTA_ORE_CACHE.commodityId], 6);
  assert.equal(restored.state.player.cargo.richLots.find((lot) => lot.lotId === VESTA_ORE_CACHE.lotId).qty, 6);
  assert.equal(restored.state.world.vestaOreCache.cargoLot.collectedQty, 6,
    'recollecting jettisoned cargo does not count the same source lot twice');
  assert.equal(restored.state.world.vestaOreCache.cargoLot.lostQty, 0);
  assert.equal(restored.log.some((entry) => /heat|law|wanted|contraband/i.test(entry.event)), false);

  const ledger = buildShipLedger(restored.state, { pageSize: 24 });
  assert.equal(ledger.entries.filter((entry) => entry.sourceKind === 'world.vestaOreCache').length, 1);
});
