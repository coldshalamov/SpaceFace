import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { explorationDiscoveryPlates } from '../src/world/explorationJournal.js';

const SECTOR_ID = 'sector_charon_expanse';
const POI_ID = 'poi_charon_tether_wreck';

function definition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID)
    ?.pois.find((poi) => poi.id === POI_ID);
}

function boot(seed = 7007) {
  const sim = createSimulation({ seed, systems: [scanner, recoveryEncounter] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.sectors = state.world.sectors || {};
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -1680, z: 360 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const poi = definition();
  const wreck = sim.spawn({
    type: 'fx', team: 2, pos: { x: -1280, z: 360 }, vel: { x: 0, z: 0 },
    radius: 24, mass: 0, collides: false,
    data: {
      poi: true,
      poiId: poi.id,
      poiType: poi.type,
      name: poi.name,
      scannerSignalKind: poi.scannerSignalKind,
      survivorPod: poi.survivorPod,
      salvagePointId: poi.recoveryEncounter ? poi.id : null,
      flavorTargetRef: poi.flavorTargetRef,
    },
  });
  state.world.activeSector = {
    id: SECTOR_ID,
    pois: [{ id: wreck.id, poiId: POI_ID, type: 'wreck', pos: { ...wreck.pos } }],
  };
  const events = { scans: [], started: [], identified: [], completed: [], credits: [], rep: [], caseCards: [] };
  const discoveryWriter = Object.create(world);
  discoveryWriter.state = state;
  discoveryWriter.bus = bus;
  bus.on('signal:scanResults', (payload) => events.scans.push(payload));
  bus.on('recovery:started', (payload) => events.started.push(payload));
  bus.on('recovery:identified', (payload) => events.identified.push(payload));
  bus.on('recovery:completed', (payload) => events.completed.push(payload));
  bus.on('economy:grantCredits', (payload) => events.credits.push(payload));
  bus.on('faction:repDelta', (payload) => events.rep.push(payload));
  bus.on('landmark:artifactRecovered', (payload) => {
    events.caseCards.push(payload);
    discoveryWriter._onLandmarkArtifactRecovered(payload);
  });
  return { sim, state, bus, player, wreck, events };
}

function pulse(harness) {
  harness.state.input.actions.scanPulse = true;
  harness.sim.runTicks(2);
}

function coolScanner(harness) {
  harness.sim.runTicks(Math.ceil(8.1 / SIM_DT));
}

test('the default Charon POI materializes with durable distress-recovery identity', () => {
  const poi = definition();
  assert.ok(poi);
  assert.equal(poi.name, 'Snapped-Tether Hab-Pod');
  assert.equal(poi.scannerSignalKind, 'distress');
  assert.equal(poi.survivorPod, true);
  assert.equal(poi.recoveryEncounter, true);

  const spawned = [];
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      const entity = { id: spawned.length + 1, alive: true, ...spec };
      spawned.push(entity);
      return entity;
    },
  };
  system._toGlobal = (point) => ({ ...point });
  const active = { id: SECTOR_ID, pois: [] };
  system._spawnPOIs(SECTORS.find((sector) => sector.id === SECTOR_ID), active, { pois: {} }, () => 0.5);
  const hull = spawned.find((entity) => entity.data?.poiId === POI_ID);
  assert.ok(hull);
  assert.equal(hull.data.scannerSignalKind, 'distress');
  assert.equal(hull.data.survivorPod, true);
  assert.equal(hull.data.salvagePointId, POI_ID);
});

test('ordinary scanner play reaches guaranteed life support and the existing rescue outcome', () => {
  const h = boot();
  pulse(h);
  const signal = h.events.scans[0].primary;
  assert.equal(signal.sourceKind, 'distress');
  assert.match(signal.classification, /DISTRESS/);

  h.bus.emit('signal:track', { signalId: signal.id });
  h.player.pos.x = h.wreck.pos.x - 80;
  h.player.pos.z = h.wreck.pos.z;
  h.sim.runTicks(2);
  assert.equal(h.events.started.length, 1);
  assert.equal(h.events.started[0].phase, 'awaiting_scan');

  coolScanner(h);
  pulse(h);
  assert.equal(h.events.identified.length, 1);
  assert.equal(h.events.identified[0].condition, 'life_support');
  assert.equal(h.events.identified[0].hasSurvivor, true);
  assert.equal(h.events.identified[0].hazard, null);
  assert.equal(h.events.identified[0].poweredSurprise, null);

  h.sim.runTicks(Math.ceil(2.7 / SIM_DT));
  const record = Object.values(h.state.recoveryEncounters.records)[0];
  assert.equal(record.phase, 'decision');
  h.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'rescue' });
  assert.equal(h.events.completed.length, 1);
  assert.equal(h.events.completed[0].outcome, 'rescue');
  assert.equal(h.events.credits[0].amount, 620);
  assert.deepEqual(h.events.rep[0], {
    factionId: 'faction_dmc', delta: 12, reason: 'recovery:rescue', recoveryId: record.id,
  });
  assert.equal(h.events.caseCards.length, 1);
  assert.equal(h.events.caseCards[0].targetRef, 'landmark_c7_lung_of_charon');
  assert.equal(h.events.caseCards[0].artifact.id, 'case:lung-of-charon:recovery:poi_charon_tether_wreck');
  const plate = explorationDiscoveryPlates(h.state)
    .find((entry) => entry.sectorId === SECTOR_ID && entry.poiId === POI_ID);
  assert.equal(plate?.title, 'Snapped-Tether Hab-Pod');
  assert.match(plate?.body || '', /The Lung of Charon.*survivors were recovered alive/i);

  h.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'rescue' });
  assert.equal(h.events.credits.length, 1, 'a settled Lung record cannot pay twice');
  assert.equal(h.events.rep.length, 1, 'a settled Lung record cannot grant reputation twice');
  assert.equal(h.events.caseCards.length, 1, 'the case card is one stable outcome');
});

test('continuous and no-teleport membership exits keep an active Lung recovery resumable', () => {
  const h = boot(7010);
  h.bus.emit('signal:investigated', {
    signalId: 'signal:charon-tether',
    sourceKind: 'distress',
    sourceId: POI_ID,
    entityId: h.wreck.id,
    sectorId: SECTOR_ID,
    pos: { ...h.wreck.pos },
    classification: 'DISTRESS COMMUNICATOR',
  });
  const record = h.state.recoveryEncounters.records['recovery:poi_charon_tether_wreck'];
  assert.ok(record);

  h.bus.emit('sector:exit', { sectorId: SECTOR_ID, continuous: true, noTeleport: true });
  h.bus.emit('sector:exit', { sectorId: SECTOR_ID, noTeleport: true });

  assert.equal(h.state.recoveryEncounters.outcomes[record.id], undefined);
  assert.equal(h.state.recoveryEncounters.activeId, record.id);
  assert.equal(h.events.completed.length, 0);
  const saved = h.sim.registry.get('recoveryEncounter').serialize();
  assert.equal(saved.activeId, record.id, 'membership handoffs retain a Continue-resumable operation');
});

test('death-recovery sector exit stays resumable, then an explicit departure abandons exactly once', () => {
  const h = boot(7011);
  h.bus.emit('signal:investigated', {
    signalId: 'signal:charon-tether',
    sourceKind: 'distress',
    sourceId: POI_ID,
    entityId: h.wreck.id,
    sectorId: SECTOR_ID,
    pos: { ...h.wreck.pos },
    classification: 'DISTRESS COMMUNICATOR',
  });
  const record = h.state.recoveryEncounters.records['recovery:poi_charon_tether_wreck'];
  assert.ok(record);

  h.state.combat.lastPlayerDefeat = {
    id: 'defeat:lung-regression',
    recovery: { sectorId: 'sector_helios_prime', stationId: 'station_helios' },
  };
  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  assert.equal(h.state.recoveryEncounters.outcomes[record.id], undefined,
    'the recovery-dock transition cannot be misfiled as voluntary abandonment');
  assert.equal(h.state.recoveryEncounters.activeId, record.id);
  assert.equal(h.events.completed.length, 0);

  h.state.combat.lastPlayerDefeat = null;
  h.bus.emit('player:respawn', { stationId: 'station_helios' });
  h.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  assert.equal(h.state.recoveryEncounters.activeId, record.id, 'the Lung operation remains resumable after respawn');

  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  h.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  assert.equal(h.state.recoveryEncounters.outcomes[record.id].outcome, 'abandoned');
  assert.equal(h.state.recoveryEncounters.outcomes[record.id].failure, 'sector_exit');
  assert.equal(h.events.completed.length, 1, 'an explicit ordinary departure still settles once');
  assert.equal(h.events.credits.length, 0);
  assert.equal(h.events.rep.length, 0);
});

test('departing an active Lung recovery records one zero-settlement abandonment and reprojects it after Continue', () => {
  const first = boot(7009);
  first.bus.emit('signal:investigated', {
    signalId: 'signal:charon-tether',
    sourceKind: 'distress',
    sourceId: POI_ID,
    entityId: first.wreck.id,
    sectorId: SECTOR_ID,
    pos: { ...first.wreck.pos },
    classification: 'DISTRESS COMMUNICATOR',
  });
  const record = first.state.recoveryEncounters.records['recovery:poi_charon_tether_wreck'];
  assert.ok(record);

  first.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  first.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  const receipt = first.state.recoveryEncounters.outcomes[record.id];
  assert.equal(receipt.outcome, 'abandoned');
  assert.equal(receipt.failure, 'sector_exit');
  assert.equal(receipt.credits, 0);
  assert.equal(receipt.repDelta, 0);
  assert.deepEqual(receipt.cargo, {});
  assert.equal(first.events.completed.length, 1);
  assert.equal(first.events.credits.length, 0);
  assert.equal(first.events.rep.length, 0);
  assert.equal(first.events.caseCards.length, 1);
  const firstPlate = explorationDiscoveryPlates(first.state)
    .find((entry) => entry.sectorId === SECTOR_ID && entry.poiId === POI_ID);
  assert.match(firstPlate?.body || '', /abandoned on departure/i);

  first.bus.emit('signal:investigated', {
    signalId: 'signal:charon-tether', sourceKind: 'distress', sourceId: POI_ID,
    entityId: first.wreck.id, sectorId: SECTOR_ID, pos: { ...first.wreck.pos },
  });
  assert.equal(first.events.completed.length, 1, 're-entry returns the saved receipt instead of reopening the case');
  assert.equal(first.events.credits.length, 0);
  assert.equal(first.events.caseCards.length, 1);

  const saved = first.sim.registry.get('recoveryEncounter').serialize();
  const restored = boot(7009);
  restored.sim.registry.get('recoveryEncounter').deserialize(saved);
  const restoredReceipt = restored.state.recoveryEncounters.outcomes[record.id];
  assert.equal(restoredReceipt.outcome, 'abandoned');
  assert.equal(restored.events.credits.length, 0, 'case projection cannot settle the recovery again');
  assert.equal(restored.events.rep.length, 0);
  assert.equal(restored.events.caseCards.length, 1, 'Continue replays the same stable case-card identity once');
  assert.equal(restored.events.caseCards[0].artifact.id, 'case:lung-of-charon:recovery:poi_charon_tether_wreck');
  const restoredPlate = explorationDiscoveryPlates(restored.state)
    .find((entry) => entry.sectorId === SECTOR_ID && entry.poiId === POI_ID);
  assert.match(restoredPlate?.body || '', /abandoned on departure/i);
});

test('Continue rebinds the saved recovery to the static hull instead of spawning a duplicate', () => {
  const first = boot(7008);
  first.bus.emit('signal:investigated', {
    signalId: 'signal:charon-tether',
    sourceKind: 'distress',
    sourceId: POI_ID,
    entityId: first.wreck.id,
    sectorId: SECTOR_ID,
    pos: { ...first.wreck.pos },
    classification: 'DISTRESS COMMUNICATOR',
  });
  const saved = first.sim.registry.get('recoveryEncounter').serialize();

  const restored = boot(7008);
  restored.sim.registry.get('recoveryEncounter').deserialize(saved);
  const before = restored.state.entityList.length;
  restored.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const record = Object.values(restored.state.recoveryEncounters.records)[0];
  assert.equal(restored.state.entityList.length, before);
  assert.equal(record.entityId, restored.wreck.id);
  assert.equal(restored.wreck.data.recoveryEncounterId, record.id);
});
