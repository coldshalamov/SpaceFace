import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { SECTORS } from '../src/data/sectors.js';
import { cargo } from '../src/systems/cargo.js';
import { recoveryEncounter } from '../src/systems/recoveryEncounter.js';
import { scanner } from '../src/systems/scanner.js';
import { world } from '../src/systems/world.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';

// INFERENCE-11 — the Bounty Wrecks landmark used to be a picture and a discovery
// line: no scanner signal, no entity, nothing to decide over. It now carries the
// same salvage-signal + recovery contract as poi_pwreck/poi_charon_tether_wreck,
// so the dead hulk becomes a real salvage decision.

const SECTOR_ID = 'sector_sker_haven';
const POI_ID = 'poi_bounty';
const RECOVERY_ID = 'recovery:poi_bounty';

function definition() {
  return SECTORS.find((sector) => sector.id === SECTOR_ID)
    ?.pois.find((poi) => poi.id === POI_ID);
}

function boot(seed = 4242) {
  const sim = createSimulation({ seed, systems: [scanner, recoveryEncounter, cargo] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.input.actions = state.input.actions || {};
  state.world.sectors = state.world.sectors || {};
  state.world.currentSectorId = SECTOR_ID;
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 1100, z: 920 }, vel: { x: 0, z: 0 },
    radius: 10, hull: 100, hullMax: 100, data: {},
  });
  state.playerId = player.id;
  const poi = definition();
  const wreck = sim.spawn({
    type: 'fx', team: 2, pos: { x: 1180, z: 920 }, vel: { x: 0, z: 0 },
    radius: 24, mass: 0, collides: false,
    data: {
      poi: true,
      poiId: poi.id,
      poiType: poi.type,
      name: poi.name,
      scannerSignalKind: poi.scannerSignalKind,
      manualInvestigation: poi.manualInvestigation === true,
      requiresActiveScan: poi.requiresActiveScan === true,
      salvagePointId: poi.recoveryEncounter ? poi.id : null,
    },
  });
  state.world.activeSector = {
    id: SECTOR_ID,
    pois: [{ id: wreck.id, poiId: POI_ID, type: 'wreck', pos: { ...wreck.pos } }],
  };
  const events = { scans: [], started: [], identified: [], completed: [], credits: [], rep: [], cargo: [] };
  bus.on('signal:scanResults', (payload) => events.scans.push(payload));
  bus.on('recovery:started', (payload) => events.started.push(payload));
  bus.on('recovery:identified', (payload) => events.identified.push(payload));
  bus.on('recovery:completed', (payload) => events.completed.push(payload));
  bus.on('economy:grantCredits', (payload) => events.credits.push(payload));
  bus.on('faction:repDelta', (payload) => events.rep.push(payload));
  bus.on('cargo:add', (payload) => events.cargo.push(payload));
  return { sim, state, bus, player, wreck, events };
}

function investigate(harness) {
  harness.bus.emit('signal:investigated', {
    signalId: 'signal:bounty-wrecks',
    sourceKind: 'salvage',
    sourceId: POI_ID,
    entityId: harness.wreck.id,
    sectorId: SECTOR_ID,
    pos: { ...harness.wreck.pos },
    classification: 'DERELICT SALVAGE',
  });
}

function driveToDecision(harness) {
  const record = harness.state.recoveryEncounters.records[RECOVERY_ID];
  harness.bus.emit('scan:pulse');
  assert.ok(record.scanned, 'a scan pulse identifies the wreck');
  if (record.phase === 'hazard') {
    harness.bus.emit('salvage:reactorVented', { wreckId: record.entityId });
    assert.equal(record.phase, 'stabilizing', 'venting clears the hazard into stabilization');
  }
  harness.sim.runTicks(Math.ceil(2.7 / SIM_DT));
  assert.equal(record.phase, 'decision');
}

test('the Bounty Wrecks POI carries the live salvage contract and spawns a real actor', () => {
  const poi = definition();
  assert.ok(poi);
  assert.equal(poi.name, 'Bounty Wrecks');
  assert.equal(poi.type, 'wreck');
  assert.equal(poi.scannerSignalKind, 'salvage');
  assert.equal(poi.requiresActiveScan, true);
  assert.equal(poi.manualInvestigation, true);
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
  assert.ok(hull, 'the landmark is a live actor, not a dressing row');
  assert.equal(hull.data.scannerSignalKind, 'salvage');
  assert.equal(hull.data.salvagePointId, POI_ID);
  assert.equal(hull.data.manualInvestigation, true);
  assert.equal(hull.data.requiresActiveScan, true);
});

test('ordinary scanner play reaches a real recovery decision and settles once', () => {
  const h = boot();
  h.state.input.actions.scanPulse = true;
  h.sim.runTicks(2);
  const signal = h.events.scans[0].primary;
  assert.equal(signal.sourceKind, 'salvage');
  assert.match(signal.classification, /SALVAGE|DERELICT/i);

  h.bus.emit('signal:track', { signalId: signal.id });
  assert.equal(h.events.started.length, 0, 'a manual-investigation signal cannot be auto-tracked');
  h.bus.emit('signal:investigate', { signalId: signal.id });
  h.player.pos.x = h.wreck.pos.x - 80;
  h.player.pos.z = h.wreck.pos.z;
  h.sim.runTicks(2);
  assert.equal(h.events.started.length, 1);
  assert.equal(h.events.started[0].phase, 'awaiting_scan');

  h.sim.runTicks(Math.ceil(8.1 / SIM_DT));
  h.state.input.actions.scanPulse = true;
  h.sim.runTicks(2);
  assert.equal(h.events.identified.length, 1, 'a second pulse identifies the wreck');

  h.sim.runTicks(Math.ceil(2.7 / SIM_DT));
  const record = Object.values(h.state.recoveryEncounters.records)[0];
  assert.equal(record.phase, 'decision');
  h.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'blackbox' });
  assert.equal(h.events.completed.length, 1);
  assert.equal(h.events.completed[0].outcome, 'blackbox');
  assert.equal(h.events.credits[0].amount, 360);
  assert.equal(h.events.rep[0].delta, 4);
  assert.equal(h.events.rep[0].reason, 'recovery:blackbox');

  h.bus.emit('recovery:choose', { recoveryId: record.id, choice: 'blackbox' });
  assert.equal(h.events.credits.length, 1, 'a settled record cannot pay twice');
  assert.equal(h.events.rep.length, 1, 'a settled record cannot grant reputation twice');
});

test('duplicate investigation returns one record and settlement replays the receipt', () => {
  const h = boot();
  investigate(h);
  const record = h.state.recoveryEncounters.records[RECOVERY_ID];
  assert.ok(record, 'investigation creates the POI recovery record');
  assert.equal(record.entityId, h.wreck.id, 'the fx marker is the bound wreck body');

  investigate(h);
  assert.equal(Object.keys(h.state.recoveryEncounters.records).length, 1, 'no duplicate record');

  driveToDecision(h);
  h.bus.emit('recovery:choose', { recoveryId: RECOVERY_ID, choice: 'strip' });
  assert.equal(h.events.completed.length, 1);
  const creditsAtSettle = h.events.credits.length;
  const repAtSettle = h.events.rep.length;

  investigate(h);
  assert.equal(h.events.credits.length, creditsAtSettle, 're-investigation replays the receipt without grants');
  assert.equal(h.events.rep.length, repAtSettle);
});

test('save/reload binds the recovery to exactly one body across re-entry', () => {
  const first = boot(7008);
  investigate(first);
  const saved = first.sim.registry.get('recoveryEncounter').serialize();

  const restored = boot(7008);
  restored.sim.registry.get('recoveryEncounter').deserialize(saved);
  restored.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const record = Object.values(restored.state.recoveryEncounters.records)[0];
  const bound = restored.state.entityList.filter(
    (e) => e.data && e.data.recoveryEncounterId === record.id,
  );
  assert.equal(bound.length, 1, 'exactly one entity carries the recovery binding');
  assert.equal(record.entityId, bound[0].id);
  assert.equal(bound[0].data.salvagePointId, POI_ID);

  const afterReentry = restored.state.entityList.length;
  restored.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  assert.equal(restored.state.entityList.length, afterReentry, 're-entry does not spawn a second body');
  assert.equal(
    restored.state.entityList.filter((e) => e.data && e.data.recoveryEncounterId === record.id).length,
    1,
    'still exactly one bound body',
  );
});

test('the authored D7 wreck keeps its own hazard site untouched', () => {
  const nestbreaker = UNIQUE_WRECKS.find((w) => w.id === 'wreck_nestbreaker');
  assert.ok(nestbreaker, 'the authored Sker wreck exists');
  assert.equal(nestbreaker.hazardContext.zoneId, 'zone_sker_belt');
  const sector = SECTORS.find((s) => s.id === SECTOR_ID);
  assert.equal(
    sector.pois.filter((p) => p.id === POI_ID).length, 1,
    'one POI record, not a second body beside the hulk',
  );
});
