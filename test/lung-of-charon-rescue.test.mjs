import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';

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
  const events = { scans: [], started: [], identified: [], completed: [], credits: [], rep: [] };
  bus.on('signal:scanResults', (payload) => events.scans.push(payload));
  bus.on('recovery:started', (payload) => events.started.push(payload));
  bus.on('recovery:identified', (payload) => events.identified.push(payload));
  bus.on('recovery:completed', (payload) => events.completed.push(payload));
  bus.on('economy:grantCredits', (payload) => events.credits.push(payload));
  bus.on('faction:repDelta', (payload) => events.rep.push(payload));
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
