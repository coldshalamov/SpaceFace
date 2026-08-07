import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { SECTORS } from '../src/data/sectors.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { scanner as scannerProto } from '../src/systems/scanner.js';
import { world as worldProto } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const SECTOR_ID = 'sector_proteus_well';
const HULK_ID = 'poi_proteus_hulk';
const CACHE_ID = 'poi_proteus_stash';

function sectorDefinition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID);
}

function poiDefinition(id) {
  return sectorDefinition()?.pois.find((poi) => poi.id === id);
}

function boot(seed = 1010) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.simTime = 12;
  state.tick = 720;
  state.settings.gameplay.tutorialHints = false;
  state.onboarding = { active: false, finished: true };

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

  state.world.currentSectorId = SECTOR_ID;
  const active = { id: SECTOR_ID, stations: [], fields: [], gates: [], pois: [], hazards: [] };
  const discovery = { discovered: true, visitedCount: 1, pois: {}, fieldsDepleted: {} };
  state.world.discovery[SECTOR_ID] = discovery;
  world._spawnPOIs(sectorDefinition(), active, discovery, () => 0.5);
  state.world.activeSector = active;

  const hulk = state.entityList.find((entity) => entity.data?.poiId === HULK_ID);
  const cache = state.entityList.find((entity) => entity.data?.poiId === CACHE_ID);
  const player = spawnEntity({
    type: 'ship', team: 0,
    pos: { x: hulk.pos.x, z: hulk.pos.z },
    vel: { x: 0, z: 0 }, radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  return { state, bus, log, world, scanner, player, hulk, cache };
}

test('the default Proteus hulk and concealed cache carry the Funnel identity on one physical site', () => {
  const hulk = poiDefinition(HULK_ID);
  const cache = poiDefinition(CACHE_ID);
  assert.equal(hulk.name, 'The Funnel');
  assert.equal(hulk.scannerSignalKind, 'archive');
  assert.equal(hulk.repeatableScannerSignal, true);
  assert.equal(hulk.flavorTargetRef, 'landmark_c10_funnel');
  assert.equal(hulk.discoveryPlate.title, 'The Funnel');
  assert.equal(cache.name, 'Below-Deck Cache');
  assert.equal(cache.hidden, true);
  assert.equal(cache.requiresActiveScan, true);

  const distance = Math.hypot(cache.pos.x - hulk.pos.x, cache.pos.z - hulk.pos.z);
  assert.equal(distance, 75, 'the cache sits under the hulk site instead of across the sector');

  const harness = boot();
  assert.equal(harness.hulk.data.flavorTargetRef, 'landmark_c10_funnel');
  assert.equal(harness.hulk.data.scannerSignalKind, 'archive');
  assert.equal(harness.cache.data.requiresActiveScan, true);
  assert.equal(harness.cache.data.landmarkGlb, 'place_debris_chunk');
});

test('passive proximity cannot reveal the cache; one ordinary active pulse and close investigation can', () => {
  const harness = boot(1011);
  const { state, world, scanner } = harness;

  world._tickPOIScan(state);
  const before = state.world.discovery[SECTOR_ID].pois[CACHE_ID];
  assert.equal(before.discovered, false);
  assert.equal(before.identified, false);

  scanner._pulse(state, harness.player, state.simTime);
  const result = harness.log.findLast((entry) => entry.event === 'signal:scanResults')?.payload;
  assert.ok(result);
  assert.equal(result.primary.entityId, harness.hulk.id, 'the landmark archive remains the strongest return');
  assert.equal(result.primary.sourceKind, 'archive');
  const cacheSignal = result.signals.find((signal) => signal.sourceId === CACHE_ID);
  assert.ok(cacheSignal);
  assert.equal(cacheSignal.sourceKind, 'salvage');

  harness.bus.emit('signal:track', { signalId: cacheSignal.id });
  scanner._updateTrackedSignal(state);
  const after = state.world.discovery[SECTOR_ID].pois[CACHE_ID];
  assert.equal(after.discovered, true);
  assert.equal(after.identified, true);
  assert.equal(after.investigated, true);
  assert.equal(harness.log.filter((entry) => entry.event === 'discovery:plateUnlocked'
    && entry.payload.poiId === CACHE_ID).length, 1);

  const plate = explorationDiscoveryPlates(state)
    .find((entry) => entry.sectorId === SECTOR_ID && entry.poiId === CACHE_ID);
  assert.ok(plate);
  assert.equal(plate.title, 'Below-Deck Cache');
  assert.match(plate.body, /active pulse/i);
  assert.match(plate.body, /passive proximity sensors passed over/i);
});

test('Continue preserves the earned Funnel cache record without converting proximity into the gate', () => {
  const first = boot(1012);
  first.scanner._pulse(first.state, first.player, first.state.simTime);
  const cacheSignal = first.log.findLast((entry) => entry.event === 'signal:scanResults')
    ?.payload.signals.find((signal) => signal.sourceId === CACHE_ID);
  first.bus.emit('signal:track', { signalId: cacheSignal.id });
  first.scanner._updateTrackedSignal(first.state);

  const savedWorld = first.world.serialize();
  const savedScanner = first.scanner.serialize();
  const restored = boot(1012);
  restored.world.deserialize(savedWorld);
  restored.scanner.deserialize(savedScanner);

  const record = restored.state.world.discovery[SECTOR_ID].pois[CACHE_ID];
  assert.equal(record.investigated, true);
  assert.ok(restored.state.signalInvestigation.completed[cacheSignal.id]);
  const plate = explorationDiscoveryPlates(restored.state)
    .find((entry) => entry.sectorId === SECTOR_ID && entry.poiId === CACHE_ID);
  assert.equal(plate.title, 'Below-Deck Cache');
  assert.equal(sectorLocalToGlobalForSector(poiDefinition(CACHE_ID).pos, SECTOR_ID).x, restored.cache.pos.x);
});
