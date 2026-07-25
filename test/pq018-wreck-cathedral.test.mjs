import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildAtlasIndex } from '../src/core/atlasIndex.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  globalToSectorLocalForSector,
  sectorLocalToGlobalForSector,
} from '../src/data/sectorCoordinates.js';
import {
  WRECK_CATHEDRAL_EVIDENCE_CATALOG,
  WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS,
  wreckCathedralEvidenceCatalogEntry,
} from '../src/data/wreckCathedralEvidenceCatalog.js';
import { worldSiteAssetBinding } from '../src/data/worldSiteAssetBindings.js';
import { worldSiteManifestById } from '../src/data/worldSiteManifests.js';
import {
  applyWorldSiteFailure,
  applyWorldSiteOperation,
  createWorldSiteRecord,
  normalizeWorldSiteRecord,
  planWorldSiteMaterialization,
  projectWorldSite,
  validateWorldSiteManifest,
} from '../src/systems/worldSiteKernel.js';
import { asteroidSites } from '../src/systems/asteroidSites.js';
import { world } from '../src/systems/world.js';
import {
  buildSystemModel,
  resolveCourseTarget,
  resolveInspectorTabAvailability,
} from '../src/ui/galaxyMap.js';

const SITE_ID = 'world_site_wreck_cathedral';
const SECTOR_ID = 'sector_ceres_belt';
const LOCAL_POS = Object.freeze({ x: 300, z: 2700 });
const GLOBAL_POS = Object.freeze({ x: -11988, z: 10892 });

const EVIDENCE_OPERATIONS = Object.freeze([
  Object.freeze({
    operationId: 'extract_bridge_navigation_record',
    componentId: 'bridge_navigation_record',
    pageId: 'wreck_cathedral.missing_convoy',
  }),
  Object.freeze({
    operationId: 'extract_registry_scan',
    componentId: 'registry_scan_array',
    pageId: 'wreck_cathedral.capital_hull_located',
  }),
  Object.freeze({
    operationId: 'repair_emergency_relay_clock',
    componentId: 'emergency_relay_clock',
    pageId: 'wreck_cathedral.clock_stopped_first',
  }),
  Object.freeze({
    operationId: 'cut_cargo_clamp_forensics',
    componentId: 'cargo_clamp_forensics',
    pageId: 'wreck_cathedral.released_from_inside',
  }),
  Object.freeze({
    operationId: 'settle_cathedral_black_box',
    componentId: 'marker_service_spine',
    pageId: 'wreck_cathedral.what_was_carried',
  }),
]);

function manifest() {
  const value = worldSiteManifestById(SITE_ID);
  assert.ok(value, `${SITE_ID} must be registered`);
  return structuredClone(value);
}

function operation(definition, operationId) {
  const value = definition.operations.find((candidate) => candidate.id === operationId);
  assert.ok(value, `missing operation ${operationId}`);
  return value;
}

function deliveryFor(definition, record, operationDefinition) {
  if (!operationDefinition.receiverId) return undefined;
  const payload = definition.payloads.find(
    (candidate) => candidate.id === operationDefinition.payloadId,
  );
  const receiver = definition.receivers.find(
    (candidate) => candidate.id === operationDefinition.receiverId,
  );
  assert.ok(payload, `missing payload ${operationDefinition.payloadId}`);
  assert.ok(receiver, `missing receiver ${operationDefinition.receiverId}`);
  const receiverProxy = planWorldSiteMaterialization(definition, record).components.find(
    (candidate) => candidate.componentId === receiver.componentId,
  );
  assert.ok(receiverProxy, `missing receiver proxy ${receiver.componentId}`);
  const deliveredPosition = {
    x: receiverProxy.pos.x,
    z: receiverProxy.pos.z,
  };
  return {
    payloadId: payload.id,
    payloadWorldObjectId: payload.worldObjectId,
    receiverId: receiver.id,
    payloadPos: deliveredPosition,
    receiverPos: { ...deliveredPosition },
  };
}

function complete(definition, record, operationId, sequence) {
  const operationDefinition = operation(definition, operationId);
  const request = {
    operationId,
    amount: operationDefinition.threshold,
    tick: sequence,
    earnedAtS: sequence / 60,
    requestStreamId: operationDefinition.requestStreamId,
    requestSequence: sequence,
  };
  const delivery = deliveryFor(definition, record, operationDefinition);
  if (delivery) request.delivery = delivery;
  return {
    request,
    result: applyWorldSiteOperation(definition, record, request),
  };
}

function completeEvidenceRoute(definition) {
  let record = createWorldSiteRecord(definition, { tick: 0 });
  let sequence = 10;
  const stabilization = complete(
    definition,
    record,
    'stabilize_cathedral_hull',
    sequence,
  );
  assert.equal(stabilization.result.ok, true);
  assert.equal(stabilization.result.duplicate, false);
  record = stabilization.result.record;

  const completions = [];
  for (const expected of EVIDENCE_OPERATIONS) {
    sequence += 10;
    if (expected.operationId === 'settle_cathedral_black_box') {
      const receiverRepair = complete(
        definition,
        record,
        'repair_marker_service_spine',
        sequence,
      );
      assert.equal(receiverRepair.result.ok, true);
      assert.equal(receiverRepair.result.duplicate, false);
      record = receiverRepair.result.record;
      assert.equal(record.evidenceRevision, completions.length);
      sequence += 10;
    }
    const completion = complete(definition, record, expected.operationId, sequence);
    assert.equal(
      completion.result.ok,
      true,
      `${expected.operationId} failed: ${completion.result.reason}`,
    );
    assert.equal(completion.result.duplicate, false);
    assert.equal(completion.result.receipt.complete, true);
    record = completion.result.record;
    completions.push({ ...completion, expected });
    assert.equal(
      record.evidenceRevision,
      completions.length,
      'each exact physical operation advances evidenceRevision once',
    );
    const replay = applyWorldSiteOperation(definition, record, completion.request);
    assert.equal(replay.ok, true);
    assert.equal(replay.duplicate, true);
    assert.equal(replay.record, record);
    assert.equal(replay.receipt, null);
    assert.deepEqual(replay.intents, []);
    assert.equal(replay.record.evidenceRevision, completions.length);
  }
  return { record, completions, nextSequence: sequence + 10 };
}

function socketWorldPosition(definition, plan, socketId) {
  const binding = worldSiteAssetBinding(plan.root.placeId);
  assert.ok(binding, `missing asset binding ${plan.root.placeId}`);
  const socket = binding.sockets[socketId];
  assert.ok(socket, `missing socket ${socketId}`);
  const center = binding.visualCenterXZ || { x: 0, z: 0 };
  const translation = socket.transform?.translation;
  assert.ok(Array.isArray(translation), `socket ${socketId} lacks a translation`);
  const localX = (translation[0] - center.x) * plan.root.scale;
  const localZ = (translation[2] - center.z) * plan.root.scale;
  const cosine = Math.cos(definition.placement.rot);
  const sine = Math.sin(definition.placement.rot);
  return {
    x: definition.placement.pos.x + localX * cosine - localZ * sine,
    z: definition.placement.pos.z + localX * sine + localZ * cosine,
  };
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared > 0
    ? Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.z - start.z) * dz) / lengthSquared))
    : 0;
  return Math.hypot(point.x - (start.x + t * dx), point.z - (start.z + t * dz));
}

function runtimeHarness() {
  const handlers = new Map();
  const bus = {
    events: [],
    on(name, handler) {
      if (!handlers.has(name)) handlers.set(name, []);
      handlers.get(name).push(handler);
      return () => {};
    },
    emit(name, payload = {}) {
      this.events.push({ name, payload });
      for (const handler of handlers.get(name) || []) handler(payload);
    },
  };
  const player = {
    id: 1, type: 'ship', alive: true, pos: { ...GLOBAL_POS }, vel: { x: 0, z: 0 },
    radius: 8, data: {},
  };
  const state = {
    simTime: 0,
    tick: 0,
    meta: { seed: 47 },
    playerId: player.id,
    player: { targetId: null },
    world: { currentSectorId: SECTOR_ID },
    entities: new Map([[player.id, player]]),
    entityList: [player],
    freeIds: [],
  };
  let nextId = 100;
  const helpers = {
    spawnEntity(spec) {
      const entity = { id: nextId++, alive: true, flags: {}, vel: { x: 0, z: 0 }, ...spec };
      entity.data = spec.data || {};
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      return entity;
    },
    removeEntity(id) {
      const entity = state.entities.get(id);
      if (entity) entity.alive = false;
    },
  };
  const system = Object.create(asteroidSites);
  system.init({ state, bus, helpers, registry: { get() { return null; } } });
  return { system, state, bus };
}

test('Cathedral manifest pins one Ceres identity, exact coordinate frames, seven proxies, and visual radius', () => {
  const definition = manifest();
  assert.deepEqual(validateWorldSiteManifest(definition), { ok: true, errors: [] });
  assert.equal(definition.id, SITE_ID);
  assert.equal(definition.worldObjectId, SITE_ID);
  assert.equal(definition.sectorId, SECTOR_ID);
  assert.deepEqual(definition.placement.pos, GLOBAL_POS);
  assert.deepEqual(globalToSectorLocalForSector(definition.placement.pos, SECTOR_ID), LOCAL_POS);
  assert.deepEqual(sectorLocalToGlobalForSector(LOCAL_POS, SECTOR_ID), GLOBAL_POS);
  assert.equal(definition.visualRoot.visualRadius, 360);
  assert.deepEqual(
    worldSiteAssetBinding('place_landmark_wreck_cathedral').visualCenterXZ,
    { x: 16.00636548, z: -12.99468677 },
  );
  assert.equal(definition.components.length, 7);
  assert.equal(definition.proxies.length, 7);
  assert.equal(definition.collisionProxies.length, 7);
  assert.deepEqual(
    [...definition.proxies.map((proxy) => proxy.componentId)].sort(),
    [...definition.components.map((component) => component.id)].sort(),
    'every truthful component owns exactly one bounded proxy',
  );
  assert.equal(new Set(definition.proxies.map((proxy) => proxy.componentId)).size, 7);

  const ceres = SECTORS.find((sector) => sector.id === SECTOR_ID);
  const authoredPoi = ceres?.pois.find((poi) => poi.id === SITE_ID);
  assert.ok(authoredPoi, 'Ceres owns one stable Cathedral POI');
  assert.equal(authoredPoi.type, 'wreck');
  assert.equal(authoredPoi.runtimeOwner, 'asteroidSites');
  assert.deepEqual(authoredPoi.anchor, LOCAL_POS, 'system map reads the explicit local anchor');
  assert.deepEqual(authoredPoi.pos, LOCAL_POS, 'Atlas reads the same explicit local position');
});

test('the static Atlas POI delegates runtime materialization to the World Site owner', () => {
  const definition = SECTORS.find((sector) => sector.id === SECTOR_ID);
  const spawned = [];
  const system = Object.create(world);
  system.helpers = {
    spawnEntity(spec) {
      spawned.push(spec);
      return { id: spawned.length, ...spec };
    },
  };
  system._toGlobal = (point) => ({ ...point });
  const active = { pois: [] };
  const discovery = { pois: {} };
  system._spawnPOIs(definition, active, discovery, () => 0.5);
  assert.equal(
    spawned.some((entity) => entity.data?.poiId === SITE_ID),
    false,
    'world must not create a second fx representation of the World Site POI',
  );
  assert.ok(discovery.pois[SITE_ID], 'the static Atlas row still owns discovery identity');
});

test('Cathedral has exactly one Atlas node and one normal system-map waypoint', () => {
  const definition = manifest();
  const record = createWorldSiteRecord(definition, { tick: 0 });
  const atlas = buildAtlasIndex();
  const atlasMatches = atlas.nodes.filter((node) => node.id === SITE_ID);
  assert.equal(atlasMatches.length, 1);
  assert.equal(atlasMatches[0].kind, 'poi');
  assert.equal(atlasMatches[0].sectorId, SECTOR_ID);
  assert.deepEqual(atlasMatches[0].globalPos, GLOBAL_POS);

  const state = {
    tick: 0,
    world: { currentSectorId: SECTOR_ID },
    entities: new Map(),
    entityList: [],
    sites: { worldOrder: [SITE_ID], worldById: { [SITE_ID]: record } },
  };
  const markers = buildSystemModel(state, SECTOR_ID).points.filter(
    (point) => point.id === SITE_ID,
  );
  assert.equal(markers.length, 1, 'static Atlas identity suppresses the dynamic duplicate');
  assert.deepEqual({ x: markers[0].x, z: markers[0].z }, GLOBAL_POS);
  assert.deepEqual(markers[0].drawPos, LOCAL_POS);
  assert.equal(markers[0].mapKind, 'world-site');
  assert.ok(markers[0].ledger);
  assert.ok(Array.isArray(markers[0].history?.rows));
  assert.equal(resolveInspectorTabAvailability(state, markers[0]).history.available, true);
  const route = resolveCourseTarget(markers[0]);
  assert.deepEqual(route?.pos, GLOBAL_POS);
  assert.equal(route?.type, 'poi');
  assert.equal(route?.autopilot, true);
});

test('Cathedral collision proxies leave the authored entry-to-exit cavity traversable', () => {
  const definition = manifest();
  const plan = planWorldSiteMaterialization(
    definition,
    createWorldSiteRecord(definition, { tick: 0 }),
  );
  assert.equal(plan.root.visualRadius, 360);
  assert.equal(plan.components.length, 7);
  assert.equal(plan.collisionProxies.length, 7);
  assert.equal(
    plan.entities.length,
    15,
    'root, seven interaction proxies, and seven invisible exterior collision proxies',
  );

  const entry = socketWorldPosition(
    definition,
    plan,
    'SOCKET_Flythrough_Entry',
  );
  const exit = socketWorldPosition(
    definition,
    plan,
    'SOCKET_Flythrough_Exit',
  );
  assert.ok(Math.hypot(exit.x - entry.x, exit.z - entry.z) >= 500);
  const solidProxies = plan.collisionProxies.filter((candidate) => candidate.bodyType === 'solid');
  assert.equal(solidProxies.length, 7, 'the exterior silhouette uses a bounded seven-circle envelope');
  for (const proxy of solidProxies) {
    for (const [segmentStart, segmentEnd] of [[entry, plan.root.pos], [plan.root.pos, exit]]) {
      assert.ok(
        pointToSegmentDistance(proxy.pos, segmentStart, segmentEnd) > proxy.radius + 8,
        `${proxy.proxyId} exterior proxy blocks one authored fly-through half`,
      );
    }
  }
  for (const point of [
    { x: GLOBAL_POS.x - 265, z: GLOBAL_POS.z - 150 },
    { x: GLOBAL_POS.x - 88, z: GLOBAL_POS.z - 150 },
    { x: GLOBAL_POS.x + 87, z: GLOBAL_POS.z - 150 },
    { x: GLOBAL_POS.x + 264, z: GLOBAL_POS.z - 150 },
    { x: GLOBAL_POS.x - 220, z: GLOBAL_POS.z + 105 },
    { x: GLOBAL_POS.x, z: GLOBAL_POS.z + 105 },
    { x: GLOBAL_POS.x + 220, z: GLOBAL_POS.z + 105 },
  ]) {
    assert.ok(
      solidProxies.some((proxy) => Math.hypot(point.x - proxy.pos.x, point.z - proxy.pos.z)
        <= proxy.radius),
      `visible exterior sample is not represented physically: ${JSON.stringify(point)}`,
    );
  }

  const stabilized = complete(
    definition,
    createWorldSiteRecord(definition, { tick: 0 }),
    'stabilize_cathedral_hull',
    10,
  ).result.record;
  const stabilizedPlan = planWorldSiteMaterialization(definition, stabilized);
  const impactHull = stabilizedPlan.components.find(
    (candidate) => candidate.componentId === 'cathedral_hull',
  );
  assert.equal(impactHull.bodyType, 'sensor', 'interaction topology stays stable after stabilization');
});

test('the stabilized hull owns a reachable runtime impact and recovery path', () => {
  const { system, state, bus } = runtimeHarness();
  const definition = manifest();
  const stabilized = complete(
    definition,
    state.sites.worldById[SITE_ID],
    'stabilize_cathedral_hull',
    10,
  ).result.record;
  state.sites.worldById[SITE_ID] = stabilized;
  bus.emit('sector:enter', { sectorId: SECTOR_ID });

  const componentEntities = [...state.entities.values()].filter(
    (entity) => entity.alive !== false && entity.data?.worldSiteComponentId,
  );
  assert.equal(componentEntities.length, 7);
  assert.ok(
    componentEntities.every((entity) => entity._noMesh === true),
    'the authored root is the only visible Cathedral identity',
  );
  assert.ok(componentEntities.every((entity) => entity.collides === false));
  assert.ok(componentEntities.every((entity) => entity.data?.worldSiteTargetable === true));

  const hull = [...state.entities.values()].find(
    (entity) => entity.alive !== false
      && entity.data?.worldRecordId === `${SITE_ID}/component/cathedral_hull`,
  );
  assert.ok(hull);
  assert.equal(hull.collides, false);
  const collisionEntities = [...state.entities.values()].filter(
    (entity) => entity.alive !== false && entity.data?.role === 'world_site_collision',
  );
  assert.equal(collisionEntities.length, 7);
  assert.ok(collisionEntities.every((entity) => entity._noMesh === true));
  assert.ok(collisionEntities.every((entity) => entity.collides === true));
  assert.ok(collisionEntities.every((entity) => entity.data?.worldSiteTargetable === false));

  bus.emit('physics:impact', {
    aId: collisionEntities[0].id,
    bId: state.playerId,
    dp: 220,
    tick: 20,
  });
  const failed = state.sites.worldById[SITE_ID];
  assert.equal(failed.components.cathedral_hull.status, 'failed');
  assert.equal(failed.stageId, 'dark');
  assert.equal(
    bus.events.filter((event) => event.name === 'worldSite:failureReceipt').length,
    1,
  );
  assert.equal(
    [...state.entities.values()].some(
      (entity) => entity.alive !== false
        && entity.data?.role === 'world_site_collision'
        && entity.collides,
    ),
    true,
    'the stable exterior envelope remains physical while the interaction proxy stays reachable',
  );

  state.tick = 30;
  state.simTime = 0.5;
  const recovered = system.applyWorldSiteBeamOperation({
    siteId: SITE_ID,
    componentId: 'cathedral_hull',
    verb: 'repair',
    amount: operation(definition, 'stabilize_cathedral_hull').threshold,
    requestStreamId: 'player-industrial-beam',
    requestSequence: 30,
    tick: 30,
  });
  assert.equal(recovered.ok, true);
  assert.equal(recovered.duplicate, false);
  assert.equal(state.sites.worldById[SITE_ID].components.cathedral_hull.status, 'stabilized');
  assert.equal(state.sites.worldById[SITE_ID].stageId, 'stabilized');
});

test('proximity, catalog presence, fabrication, and out-of-order work cannot mint evidence', () => {
  const definition = manifest();
  const initial = createWorldSiteRecord(definition, { tick: 0 });
  assert.equal(initial.evidenceRevision, 0);
  assert.deepEqual(initial.evidenceReceiptsByPageId, {});

  for (const pageId of WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS) {
    const catalog = wreckCathedralEvidenceCatalogEntry(pageId);
    assert.ok(catalog);
    assert.notEqual(catalog.body, catalog.fragment, `${pageId} needs page copy beyond its flight fragment`);
  }
  assert.deepEqual(
    [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort(),
    Object.keys(WRECK_CATHEDRAL_EVIDENCE_CATALOG).sort(),
  );
  const nearbyState = {
    world: { currentSectorId: SECTOR_ID },
    entities: new Map([[
      1,
      { id: 1, type: 'ship', alive: true, pos: { ...GLOBAL_POS }, data: { isPlayer: true } },
    ]]),
    entityList: [],
    sites: { worldOrder: [SITE_ID], worldById: { [SITE_ID]: initial } },
  };
  buildSystemModel(nearbyState, SECTOR_ID);
  assert.equal(initial.evidenceRevision, 0);
  assert.deepEqual(initial.evidenceReceiptsByPageId, {});

  const fabricated = structuredClone(initial);
  fabricated.evidenceRevision = 99;
  fabricated.evidenceReceiptsByPageId['wreck_cathedral.missing_convoy'] = {
    receiptId: 'fabricated',
    pageId: 'wreck_cathedral.missing_convoy',
    operationId: 'not_an_operation',
  };
  const sanitized = normalizeWorldSiteRecord(definition, fabricated);
  assert.equal(sanitized.evidenceRevision, 0);
  assert.deepEqual(sanitized.evidenceReceiptsByPageId, {});

  const premature = complete(
    definition,
    initial,
    'settle_cathedral_black_box',
    1,
  ).result;
  assert.equal(premature.ok, false);
  assert.match(premature.reason, /dependency|payload/);
  assert.equal(premature.record, initial);
  assert.equal(premature.record.evidenceRevision, 0);
});

test('five immutable catalog rows match their earning operations and exact media bytes', () => {
  const definition = manifest();
  assert.equal(WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS.length, 5);
  assert.deepEqual(
    [...WRECK_CATHEDRAL_EVIDENCE_PAGE_IDS].sort(),
    EVIDENCE_OPERATIONS.map((entry) => entry.pageId).sort(),
  );
  for (const expected of EVIDENCE_OPERATIONS) {
    const catalogRow = WRECK_CATHEDRAL_EVIDENCE_CATALOG[expected.pageId];
    const earningOperation = operation(definition, expected.operationId);
    assert.ok(catalogRow);
    assert.equal(catalogRow.provenanceRef, earningOperation.evidenceProvenanceRef);
    assert.deepEqual(catalogRow.mapRef, {
      sectorId: SECTOR_ID,
      siteId: SITE_ID,
      componentId: expected.componentId,
    });
    assert.match(
      catalogRow.media.path,
      /^assets\/ships\/release\/media\/wreck-cathedral\//,
      'accepted media must live under the production-bundled release root',
    );
    const mediaBytes = readFileSync(
      new URL(`../${catalogRow.media.path.replaceAll('\\', '/')}`, import.meta.url),
    );
    assert.equal(mediaBytes.byteLength, catalogRow.media.bytes);
    assert.equal(
      createHash('sha256').update(mediaBytes).digest('hex'),
      catalogRow.media.sha256,
    );
  }
});

test('five exact operations mint five direct-keyed receipts and physical settlement only once', () => {
  const definition = manifest();
  assert.deepEqual(
    EVIDENCE_OPERATIONS.map(({ operationId, componentId, pageId }) => {
      const operationDefinition = operation(definition, operationId);
      return {
        operationId: operationDefinition.id,
        componentId: operationDefinition.componentId,
        pageId: operationDefinition.evidencePageId,
      };
    }),
    EVIDENCE_OPERATIONS,
  );
  assert.equal(new Set(EVIDENCE_OPERATIONS.map((entry) => entry.componentId)).size, 5);
  assert.equal(new Set(EVIDENCE_OPERATIONS.map((entry) => entry.pageId)).size, 5);

  const { record, completions } = completeEvidenceRoute(definition);
  assert.equal(record.evidenceRevision, 5);
  assert.deepEqual(
    Object.keys(record.evidenceReceiptsByPageId).sort(),
    EVIDENCE_OPERATIONS.map((entry) => entry.pageId).sort(),
  );
  for (const { expected, request } of completions) {
    const evidence = record.evidenceReceiptsByPageId[expected.pageId];
    const completed = record.completedOperations[expected.operationId];
    assert.ok(evidence);
    assert.equal(evidence.pageId, expected.pageId);
    assert.equal(evidence.componentId, expected.componentId);
    assert.equal(evidence.operationId, expected.operationId);
    assert.equal(evidence.operationReceiptId, completed.receiptId);
    assert.equal(evidence.earnedTick, request.tick);
    assert.equal(evidence.siteRecordId, SITE_ID);
    assert.equal(evidence.catalogRevision, 1);
  }

  const settlement = operation(definition, 'settle_cathedral_black_box');
  const payload = record.payloads[settlement.payloadId];
  const receiver = record.receivers[settlement.receiverId];
  assert.equal(payload.status, 'settled');
  assert.equal(receiver.status, 'settled');
  assert.equal(payload.settledReceiptId, receiver.settledReceiptId);
  assert.equal(
    payload.settledReceiptId,
    record.completedOperations.settle_cathedral_black_box.receiptId,
  );
  assert.equal(
    record.receipts.filter(
      (receipt) => receipt.operationId === 'settle_cathedral_black_box' && receipt.complete,
    ).length,
    1,
  );

  const settlementCompletion = completions.find(
    (entry) => entry.expected.operationId === 'settle_cathedral_black_box',
  );
  assert.deepEqual(
    settlementCompletion.result.intents.map((intent) => [intent.domain, intent.type]),
    [
      ['economy', 'economy:grantCredits'],
      ['faction', 'faction:repDelta'],
    ],
    'settlement emits owner intents once rather than writing resources directly',
  );
  const replay = applyWorldSiteOperation(definition, record, settlementCompletion.request);
  assert.equal(replay.ok, true);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.record, record);
  assert.equal(replay.receipt, null);
  assert.deepEqual(replay.intents, []);
  assert.equal(replay.record.evidenceRevision, 5);
  assert.equal(
    replay.record.receipts.filter(
      (receipt) => receipt.operationId === 'settle_cathedral_black_box' && receipt.complete,
    ).length,
    1,
  );

  const projection = projectWorldSite(definition, record);
  assert.equal(projection.evidenceRevision, 5);
  assert.deepEqual(projection.evidenceReceiptsByPageId, record.evidenceReceiptsByPageId);
});

test('failure, recovery, replay, and save normalization preserve earned evidence at a fixed point', () => {
  const definition = manifest();
  const completed = completeEvidenceRoute(definition);
  const earnedEvidence = structuredClone(completed.record.evidenceReceiptsByPageId);
  const hull = completed.record.components.cathedral_hull;
  const failed = applyWorldSiteFailure(definition, completed.record, {
    componentId: 'cathedral_hull',
    failureId: 'cathedral_hull_impact',
    expectedCycle: hull.cycle,
    tick: completed.nextSequence,
  });
  assert.equal(failed.ok, true);
  assert.equal(failed.duplicate, false);
  assert.equal(failed.record.components.cathedral_hull.status, 'failed');
  assert.equal(failed.record.stageId, 'dark');
  assert.equal(failed.record.evidenceRevision, 5);
  assert.deepEqual(failed.record.evidenceReceiptsByPageId, earnedEvidence);

  const failureReplay = applyWorldSiteFailure(definition, failed.record, {
    componentId: 'cathedral_hull',
    failureId: 'cathedral_hull_impact',
    expectedCycle: hull.cycle,
    tick: completed.nextSequence,
  });
  assert.equal(failureReplay.ok, true);
  assert.equal(failureReplay.duplicate, true);
  assert.equal(failureReplay.record, failed.record);
  assert.deepEqual(failureReplay.record.evidenceReceiptsByPageId, earnedEvidence);

  const recovered = complete(
    definition,
    failed.record,
    'stabilize_cathedral_hull',
    completed.nextSequence + 10,
  ).result;
  assert.equal(recovered.ok, true);
  assert.equal(recovered.duplicate, false);
  assert.equal(recovered.record.components.cathedral_hull.status, 'stabilized');
  assert.equal(recovered.record.stageId, 'archived');
  assert.equal(recovered.record.evidenceRevision, 5);
  assert.deepEqual(recovered.record.evidenceReceiptsByPageId, earnedEvidence);

  const serialized = JSON.parse(JSON.stringify(recovered.record));
  const normalizedOnce = normalizeWorldSiteRecord(definition, serialized);
  const normalizedTwice = normalizeWorldSiteRecord(
    definition,
    JSON.parse(JSON.stringify(normalizedOnce)),
  );
  assert.deepEqual(normalizedTwice, normalizedOnce, 'save normalization is a fixed point');
  assert.equal(normalizedOnce.evidenceRevision, 5);
  assert.deepEqual(normalizedOnce.evidenceReceiptsByPageId, earnedEvidence);
  assert.equal(normalizedOnce.payloads.cathedral_black_box.status, 'settled');

  const tampered = structuredClone(recovered.record);
  tampered.evidenceReceiptsByPageId['wreck_cathedral.missing_convoy'].earnedTick += 1;
  tampered.evidenceReceiptsByPageId['wreck_cathedral.clock_stopped_first'].earnedAtS += 0.5;
  const repaired = normalizeWorldSiteRecord(definition, tampered);
  assert.deepEqual(
    repaired.evidenceReceiptsByPageId,
    earnedEvidence,
    'Continue reconstructs altered timestamps only from the exact operation completion',
  );

  const polluted = structuredClone(recovered.record);
  Object.assign(polluted.evidenceReceiptsByPageId['wreck_cathedral.missing_convoy'], {
    title: 'foreign saved copy',
    body: 'must not survive normalization',
    imageUrl: 'https://invalid.example/evidence.png',
    media: { path: 'foreign.png' },
  });
  const stripped = normalizeWorldSiteRecord(definition, polluted);
  assert.deepEqual(
    Object.keys(stripped.evidenceReceiptsByPageId['wreck_cathedral.missing_convoy']).sort(),
    [
      'catalogRevision',
      'componentId',
      'earnedAtS',
      'earnedTick',
      'operationId',
      'operationReceiptId',
      'pageId',
      'provenanceRef',
      'receiptId',
      'revision',
      'siteRecordId',
      'stateFrom',
      'stateTo',
    ].sort(),
    'normalization must reconstruct the canonical causal row and strip all foreign presentation',
  );
});
