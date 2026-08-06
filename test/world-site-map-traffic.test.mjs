import assert from 'node:assert/strict';
import test from 'node:test';

import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  CINDER_SLUICE_GLOBAL_POS,
  CINDER_SLUICE_SECTOR_ID,
  CINDER_SLUICE_SITE_ID,
  CINDER_SLUICE_TRAFFIC_STAGING_POS,
} from '../src/data/environmentalMachinery.js';
import {
  applyWorldSiteFailure,
  applyWorldSiteOperation,
  createWorldSiteRecord,
  projectWorldSite,
} from '../src/systems/worldSiteKernel.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { traffic } from '../src/systems/traffic.js';
import { buildSystemModel, resolveCourseTarget } from '../src/ui/galaxyMap.js';
import { worldSiteHistoryRows, worldSiteMapMarkers } from '../src/ui/worldSiteMapLayer.js';

const SITE_ID = 'world_site_helios_relay';

function siteState() {
  const manifest = worldSiteManifestById(SITE_ID);
  const record = createWorldSiteRecord(manifest, { tick: 0 });
  return {
    tick: 0,
    meta: { seed: 47 },
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map(),
    entityList: [],
    sites: { worldOrder: [SITE_ID], worldById: { [SITE_ID]: record } },
  };
}

test('projection and normal system-map marker are immutable, searchable, and waypoint-ready', () => {
  const state = siteState();
  const manifest = worldSiteManifestById(SITE_ID);
  const projection = projectWorldSite(manifest, state.sites.worldById[SITE_ID]);
  assert.equal(Object.isFrozen(projection), true);
  assert.deepEqual({
    pos: projection.pos,
    stageLabel: projection.stageLabel,
    mapKind: projection.map.kind,
    trafficId: projection.traffic.id,
    ledgerReceipts: projection.ledger.receiptCount,
  }, {
    pos: { x: 760, z: -620 },
    stageLabel: 'DARK RELAY',
    mapKind: 'world-site',
    trafficId: 'helios_recovery_service',
    ledgerReceipts: 0,
  });

  const marker = buildSystemModel(state, 'sector_helios_prime').points
    .find((point) => point.id === SITE_ID);
  assert.ok(marker);
  assert.equal(marker.kind, 'poi');
  assert.match(marker.searchText, /recovery relay/i);
  assert.deepEqual(resolveCourseTarget(marker), {
    type: 'poi', pos: { x: 760, z: -620 }, label: 'Helios Recovery Relay',
    reason: 'Helios Recovery Relay', waypointKind: 'local', arrivalRadius: 48, autopilot: true,
  });
});

test('Cinder map identity stays on the machinery while course plotting uses its safe approach', () => {
  const manifest = worldSiteManifestById(CINDER_SLUICE_SITE_ID);
  const record = createWorldSiteRecord(manifest, { tick: 0 });
  const state = {
    simTime: 2.25,
    world: { currentSectorId: CINDER_SLUICE_SECTOR_ID },
    entities: new Map(),
    entityList: [],
    sites: {
      worldOrder: [CINDER_SLUICE_SITE_ID],
      worldById: { [CINDER_SLUICE_SITE_ID]: record },
    },
  };

  const marker = buildSystemModel(state, CINDER_SLUICE_SECTOR_ID).points
    .find((point) => point.id === CINDER_SLUICE_SITE_ID);
  assert.ok(marker, 'the live marker reaches the default system-map model');
  assert.deepEqual({ x: marker.x, z: marker.z }, CINDER_SLUICE_GLOBAL_POS,
    'the visible POI remains the physical machinery');
  assert.deepEqual(marker.coursePos, CINDER_SLUICE_TRAFFIC_STAGING_POS);
  assert.equal(marker.statusLine, 'SURGE 7s');
  assert.deepEqual(resolveCourseTarget(marker), {
    type: 'poi',
    pos: { ...CINDER_SLUICE_TRAFFIC_STAGING_POS },
    label: 'Cinder Sluice safe approach',
    reason: 'Cinder Sluice safe approach',
    waypointKind: 'local',
    arrivalRadius: 48,
    autopilot: true,
  });
});

test('asteroidSites publishes sorted read-only traffic hooks for the active sector', () => {
  const state = siteState();
  const system = Object.create(asteroidSites);
  system.state = state;
  const hooks = system.worldSiteTrafficHooks('sector_helios_prime');
  assert.equal(Object.isFrozen(hooks), true);
  assert.deepEqual(hooks.map((hook) => hook.id), ['helios_recovery_service']);
  assert.deepEqual(system.worldSiteTrafficHooks('sector_ceres_belt'), []);
});

test('traffic reassigns exactly one existing ambient slot and remains idempotent across triggers', () => {
  const state = siteState();
  const station = { id: 10, type: 'station', alive: true, pos: { x: 1280, z: -420 }, data: { stationId: 'station_helios' } };
  const root = { id: 11, type: 'fx', alive: true, pos: { x: 760, z: -620 }, data: { worldRecordId: `${SITE_ID}/root` } };
  const a = { id: 20, type: 'ship', alive: true, pos: { x: 1000, z: -500 }, data: { worldRecordId: 'traffic:a', trafficRole: 'hauler' } };
  const b = { id: 21, type: 'ship', alive: true, pos: { x: 1010, z: -510 }, data: { worldRecordId: 'traffic:b', trafficRole: 'courier' } };
  state.entities = new Map([station, root, b, a].map((entity) => [entity.id, entity]));
  state.entityList = [station, root, b, a];
  state.traffic = { freighters: [
    { id: b.id, role: 'courier', targetId: station.id, waitT: 0 },
    { id: a.id, role: 'hauler', targetId: station.id, waitT: 0 },
  ], appliedArrivalIds: [], appliedLossIds: [], rngSeed: 1 };
  const owner = Object.create(asteroidSites);
  owner.state = state;
  const system = Object.create(traffic);
  system.state = state;
  system._registry = { get(name) { return name === 'asteroidSites' ? owner : null; } };

  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 1);
  assert.equal(state.traffic.freighters.length, 2, 'no new traffic spawn');
  assert.equal(a.data.worldSiteTrafficHookId, 'helios_recovery_service', 'stable first eligible slot wins');
  assert.equal(b.data.worldSiteTrafficHookId, undefined);
  const snapshot = JSON.stringify(state.traffic.freighters);
  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 0);
  assert.equal(JSON.stringify(state.traffic.freighters), snapshot);

  const secondStation = {
    id: 12, type: 'station', alive: true, pos: { x: 1600, z: -200 }, data: { stationId: 'station_span' },
  };
  const jobAssignments = [];
  system.helpers = { npcJobs: { assign(entity, spec) { jobAssignments.push({ entity, spec }); } } };
  system._maybeAssignJob(a, 'hauler', station, secondStation, [station, secondStation], 'sector_helios_prime');
  assert.equal(jobAssignments.length, 0,
    'the selected World Site service slot must not also be claimed by the NPC job producer');

  // Save rematerialization rebuilds the transient ambient record while preserving entity data.
  // Reconciliation must restore the route onto that same durable slot, not strand the tag.
  delete state.traffic.freighters.find((record) => record.id === a.id).worldSiteRoute;
  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 1);
  assert.equal(a.data.worldSiteTrafficHookId, 'helios_recovery_service');
  assert.equal(state.traffic.freighters.find((record) => record.id === a.id).worldSiteRoute.hookId,
    'helios_recovery_service');

  // Losing both markers must still deterministically reacquire the same one slot.
  delete a.data.worldSiteTrafficHookId;
  delete state.traffic.freighters.find((record) => record.id === a.id).worldSiteRoute;
  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 1);
  assert.equal(state.traffic.freighters.length, 2, 'save/load rebind still does not spawn');
  assert.equal(a.data.worldSiteTrafficHookId, 'helios_recovery_service');
  assert.equal(b.data.worldSiteTrafficHookId, undefined);

  // The reassigned ambient hull can still be destroyed during normal flight. Removing its traffic
  // record must immediately rebind the same one hook to another eligible live slot.
  state.mode = 'flight';
  state.world.currentSectorId = 'sector_helios_prime';
  a.alive = false;
  system._sectorStations = () => [station];
  system._active = [a.id, b.id];
  system.bus = { emit() {} };
  system._onEntityKilled({ id: a.id, sectorId: 'sector_helios_prime' });
  assert.equal(state.traffic.freighters.length, 1, 'destroyed service traffic is pruned normally');
  assert.equal(state.traffic.freighters[0].id, b.id);
  assert.equal(state.traffic.freighters[0].worldSiteRoute.hookId, 'helios_recovery_service',
    'the surviving eligible ambient slot inherits the one service route');
  assert.equal(b.data.worldSiteTrafficHookId, 'helios_recovery_service');
});

test('traffic reserves one deterministic idle civilian fallback when preferred roles are absent', () => {
  const state = siteState();
  const station = {
    id: 10, type: 'station', alive: true, pos: { x: 1280, z: -420 },
    data: { stationId: 'station_helios' },
  };
  const root = {
    id: 11, type: 'fx', alive: true, pos: { x: 760, z: -620 },
    data: { worldRecordId: `${SITE_ID}/root` },
  };
  const roles = ['escort', 'escort', 'patrol', 'patrol', 'miner', 'patrol', 'express', 'patrol'];
  const ships = roles.map((role, index) => ({
    id: 20 + index,
    type: 'ship',
    alive: true,
    pos: { x: 1000 + index * 10, z: -500 },
    data: {
      worldRecordId: `traffic:${String.fromCharCode(97 + index)}`,
      trafficRole: role,
      ...(role === 'miner' ? { jobId: 'job:mining-shift' } : {}),
    },
  }));
  state.entities = new Map([station, root, ...ships].map((entity) => [entity.id, entity]));
  state.entityList = [station, root, ...ships];
  state.traffic = {
    freighters: ships.map((entity, index) => ({
      id: entity.id, role: roles[index], targetId: station.id, waitT: 0,
    })),
    appliedArrivalIds: [],
    appliedLossIds: [],
    rngSeed: 1,
  };
  const owner = Object.create(asteroidSites);
  owner.state = state;
  const system = Object.create(traffic);
  system.state = state;
  system._registry = { get(name) { return name === 'asteroidSites' ? owner : null; } };
  system._sectorStations = () => [station];

  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 1);
  assert.equal(state.traffic.freighters.length, 8, 'fallback reuses the authored ambient cap');
  const routed = state.traffic.freighters.filter((record) => record.worldSiteRoute);
  assert.equal(routed.length, 1, 'exactly one ambient slot owns the service route');
  assert.equal(routed[0].role, 'express', 'idle civilian wins after combat roles and busy miner are excluded');
  assert.equal(ships[6].data.worldSiteTrafficHookId, 'helios_recovery_service');
  assert.equal(ships[4].data.jobId, 'job:mining-shift', 'existing NPC job ownership is preserved');

  const snapshot = JSON.stringify(state.traffic.freighters);
  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 0);
  assert.equal(JSON.stringify(state.traffic.freighters), snapshot, 'reconciliation is idempotent');

  // A Continue rebuilds the transient record but keeps the durable entity tag. The fallback must
  // restore that same non-preferred slot before considering a different idle civilian.
  delete routed[0].worldSiteRoute;
  assert.equal(system._applyWorldSiteTrafficHooks('sector_helios_prime'), 1);
  assert.equal(state.traffic.freighters.find((record) => record.id === ships[6].id).worldSiteRoute.hookId,
    'helios_recovery_service');
});

test('map History projects only the last five authoritative operation/failure receipts', () => {
  const state = siteState();
  const manifest = worldSiteManifestById(SITE_ID);
  let record = state.sites.worldById[SITE_ID];
  for (let sequence = 1; sequence <= 6; sequence += 1) {
    record = applyWorldSiteOperation(manifest, record, {
      operationId: 'repair_relay_core', requestStreamId: 'player-industrial-beam',
      requestSequence: sequence, amount: 7, tick: sequence,
    }).record;
  }
  record = applyWorldSiteOperation(manifest, record, {
    operationId: 'recover_safety_coupler', requestStreamId: 'player-industrial-beam',
    requestSequence: 7, amount: 24, tick: 7,
  }).record;
  record = applyWorldSiteFailure(manifest, record, {
    componentId: 'safety_coupler', failureId: 'safety_coupler_impact',
    expectedCycle: 0, tick: 8,
  }).record;
  state.sites.worldById[SITE_ID] = record;

  const projection = projectWorldSite(manifest, record);
  assert.equal(projection.ledger.recentReceipts.length, 5);
  assert.equal(projection.ledger.recentReceipts.at(-1).kind, 'failure');
  assert.equal(projection.ledger.completedCount, 2);
  assert.equal(projection.ledger.failureCount, 1);
  const rows = worldSiteHistoryRows(projection.ledger);
  assert.equal(Object.isFrozen(rows), true);
  assert.equal(rows.length, 5);
  assert.match(rows.at(-1).label, /safety coupler impact/i);

  const marker = worldSiteMapMarkers(state, 'sector_helios_prime')[0];
  assert.equal(marker.mapKind, 'world-site');
  assert.equal(marker.history.stageLabel, 'DARK RELAY');
  assert.equal(marker.history.completedCount, 2);
  assert.equal(marker.history.failureCount, 1);
  assert.equal(marker.history.rows.length, 5);
  const modelMarker = buildSystemModel(state, 'sector_helios_prime').points.find((point) => point.id === SITE_ID);
  assert.equal(modelMarker.history.rows.at(-1).kind, 'failure');
});

test('map History formats fractional work without floating-point noise', () => {
  const rows = worldSiteHistoryRows({
    recentReceipts: [{
      kind: 'operation', sequence: 1, tick: 1, operationId: 'recover_safety_coupler',
      amountApplied: 0.30000000000000007, complete: false,
    }],
  });
  assert.equal(rows[0].detail, '0.3 work applied');
});

test('map completion count survives fixed-step receipt-tail eviction', () => {
  const manifest = worldSiteManifestById(SITE_ID);
  const base = createWorldSiteRecord(manifest, { tick: 0 });
  const completedOperations = Object.fromEntries(manifest.operations.map((operation, index) => [
    operation.id,
    { tick: index + 1, receiptId: `completed:${operation.id}` },
  ]));
  const receipts = Array.from({ length: 63 }, (_, index) => ({
    sequence: index + 1,
    kind: 'operation',
    operationId: 'repair_beacon_array',
    amountApplied: 0.25,
    complete: false,
    tick: index + 10,
  }));
  receipts.push({
    sequence: 64,
    kind: 'operation',
    operationId: 'repair_beacon_array',
    amountApplied: 0.25,
    complete: true,
    tick: 73,
  });
  const projection = projectWorldSite(manifest, {
    ...base,
    completedOperations,
    completionCount: manifest.operations.length,
    receipts,
  });

  assert.equal(projection.ledger.receiptCount, 64, 'bounded audit tail remains visible');
  assert.equal(projection.ledger.completedCount, manifest.operations.length,
    'current operation truth must not collapse to the one completion retained in the receipt tail');
  assert.equal(projection.ledger.recentReceipts.length, 5);
});

test('traffic ignores fixed-step partial receipts and refreshes topology once on completion', () => {
  const state = siteState();
  const listeners = {};
  const system = Object.create(traffic);
  system.init({
    state,
    bus: { on(name, listener) { listeners[name] = listener; } },
    helpers: {},
    registry: null,
  });
  let refreshes = 0;
  system._applyWorldSiteTrafficHooks = (sectorId) => {
    assert.equal(sectorId, 'sector_helios_prime');
    refreshes += 1;
  };

  listeners['worldSite:operationReceipt']({
    siteId: SITE_ID,
    receipt: { kind: 'operation', complete: false, amountApplied: 1 },
  });
  assert.equal(refreshes, 0);
  listeners['worldSite:operationReceipt']({
    siteId: SITE_ID,
    receipt: { kind: 'operation', complete: true, amountApplied: 1 },
  });
  assert.equal(refreshes, 1);
});
