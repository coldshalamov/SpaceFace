import assert from 'node:assert/strict';
import test from 'node:test';

import { ANVIL_WORK, anvilTrafficMethods, anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { PLANET_SITE } from '../src/data/planets.js';
import { STORMSHIFT_COLLECTOR_COLLISION } from '../src/data/stormshiftCollectorCollision.js';
import { registerEntityWorldRecordId } from '../src/world/livingWorldViews.js';

// D130 far-actor query leg — src/systems/anvilWork.js `actor()` ran one FULL entityList
// `.some()` ambiguity walk per call (two calls per traffic tick in sector_tethys_junction
// via _stepAnvilWork), plus a redundant second full-list `.find()` behind
// indexedWorldRecordEntity's own same-population fallback. The entity index already
// maintains `byWorldRecordIdCount` (coreSystem append/remove) — count <= 1 answers
// "no second carrier" in O(1); count > 1 still walks so soft-dead carriers keep the
// old live-only verdict. This fixture pins both: the decision table (resolution and
// ambiguity verdicts are unchanged) and the workload (a steady _stepAnvilWork tick
// reads ZERO bystander worldRecordId values — the walk-shaped fast path).

const BYSTANDER_COUNT = 48;
const WORKER_RECORD = {
  collector: null,
  receiver: null,
};

function countingData(reads, recordId, extra = {}) {
  const data = {
    jobId: null,
    ...extra,
    __recordId: recordId,
  };
  Object.defineProperty(data, 'worldRecordId', {
    get() {
      reads.count += 1;
      return this.__recordId;
    },
  });
  return data;
}

function makeIndex({ withCount = true } = {}) {
  const index = {
    __spacefaceEntityIndexV1: true,
    ready: true,
    version: 1,
    laneVersions: {},
    byWorldRecordId: new Map(),
  };
  if (withCount) index.byWorldRecordIdCount = new Map();
  return index;
}

function indexRecord(state, entity) {
  registerEntityWorldRecordId(state.entityIndex, entity);
  // The fixture relies on the production count-map contract: every registration counts.
  if (!(state.entityIndex.byWorldRecordIdCount instanceof Map)) return;
  const id = entity.data.worldRecordId;
  assert.ok((state.entityIndex.byWorldRecordIdCount.get(id) || 0) >= 1,
    'fixture index mirrors the production carrier count');
}

function makeWorker(id, role, phase, reads, recordId) {
  return {
    id,
    type: 'ship',
    alive: true,
    team: 2,
    hull: 100,
    hullMax: 100,
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    rot: 0,
    maxSpeed: 100,
    // bindCollectorCollision no-ops when the proxy manifest already matches.
    physicsBody: { collisionProxyManifest: { id: STORMSHIFT_COLLECTOR_COLLISION.id } },
    data: countingData(reads, recordId, {
      itinerary: {
        kind: ANVIL_WORK.kind,
        role,
        phase,
        sequence: 0,
        center: { x: 512, z: 512 },
      },
      cargoManifest: role === 'collector'
        ? { totalQty: 0, lines: [] }
        : { totalQty: ANVIL_WORK.receiverCapacity, lines: [] },
    }),
  };
}

function makeBystander(id, reads) {
  return {
    id,
    type: 'ship',
    alive: true,
    hull: 100,
    pos: { x: id * 10, z: 0 },
    vel: { x: 0, z: 0 },
    data: countingData(reads, `bystander-${id}`),
  };
}

function makeState(reads, { index = makeIndex(), register = true } = {}) {
  const state = {
    meta: { seed: 424213 },
    tick: 120,
    simTime: 2,
    mode: 'flight',
    world: { currentSectorId: PLANET_SITE.sectorId },
    entities: new Map(),
    entityList: [],
    entityIndex: index,
    planet: null,
    traffic: { freighters: [] },
    __reads: reads,
  };
  const collectorId = 9001;
  const receiverId = 9002;
  const collectorRecord = WORKER_RECORD.collector ?? `anvil:collector:${collectorId}`;
  const receiverRecord = WORKER_RECORD.receiver ?? `anvil:receiver:${receiverId}`;
  const recordIds = {
    collector: anvilWorkerRecordId({ meta: state.meta }, 'collector'),
    receiver: anvilWorkerRecordId({ meta: state.meta }, 'receiver'),
  };
  const collector = makeWorker(collectorId, 'collector', 'berthed', reads, recordIds.collector);
  const receiver = makeWorker(receiverId, 'receiver', 'receiving', reads, recordIds.receiver);
  void collectorRecord;
  void receiverRecord;
  for (let i = 0; i < BYSTANDER_COUNT; i++) {
    const bystander = makeBystander(i + 1, reads);
    state.entityList.push(bystander);
    state.entities.set(bystander.id, bystander);
  }
  state.entityList.push(collector, receiver);
  state.entities.set(collector.id, collector);
  state.entities.set(receiver.id, receiver);
  state.collector = collector;
  state.receiver = receiver;
  if (register && index && index.byWorldRecordId) {
    indexRecord(state, collector);
    indexRecord(state, receiver);
  }
  return state;
}

function makeOwner(state) {
  return {
    state,
    bus: { emit() {} },
    _registry: { get: () => null },
    _active: [],
    _ensureState() { return {}; },
    _stampTrafficDurableIdentity() {},
    _setTrafficManifest() {},
    _buildMinerManifest(e, sequence, commodityId, qty) {
      return {
        totalQty: qty,
        lines: [{ commodityId, qty }],
        lotId: `lot:${e.data.worldRecordId}:${sequence}`,
      };
    },
  };
}

function stepAnvilWork(owner) {
  anvilTrafficMethods._stepAnvilWork.call(owner, 1 / 60, owner.state);
}

test('steady anvil tick answers the ambiguity check without walking the entity list', () => {
  const reads = { count: 0 };
  const state = makeState(reads);
  const owner = makeOwner(state);
  reads.count = 0;
  stepAnvilWork(owner);
  // Parity: both workers resolved; the parked berthed collector holds (receiver full).
  assert.equal(state.collector.data.intent?.brake, true, 'unique workers: collector holds');
  assert.equal(state.receiver.data.intent?.brake, true, 'unique workers: receiver holds');
  // The counted delta: before the count-map fast path this tick read the bystander
  // worldRecordId of every entity on BOTH actor() walks — 2 × (BYSTANDER_COUNT + 1)
  // reads (98 at 48 bystanders). The fast path reads none.
  assert.equal(reads.count, 0,
    `expected 0 worldRecordId reads per steady anvil tick, saw ${reads.count}`);
});

test('accept harvest still resolves the unique collector', () => {
  const reads = { count: 0 };
  const state = makeState(reads);
  const owner = makeOwner(state);
  state.collector.data.itinerary.phase = 'collect';
  reads.count = 0;
  const taken = anvilTrafficMethods.acceptAnvilHarvest.call(owner, state.collector, {
    siteId: PLANET_SITE.id,
    commodityId: PLANET_SITE.harvest.commodityShallow,
    qty: 5,
  });
  assert.equal(taken, 5, 'unique collector accepts the authored harvest');
});

test('a live twin carrier is still rejected exactly as before', () => {
  const reads = { count: 0 };
  const state = makeState(reads);
  const owner = makeOwner(state);
  const recordId = anvilWorkerRecordId({ meta: state.meta }, 'collector');
  const twin = {
    id: 9100,
    type: 'ship',
    alive: true,
    hull: 100,
    pos: { x: 7, z: 7 },
    vel: { x: 0, z: 0 },
    data: countingData(reads, recordId),
  };
  state.entityList.push(twin);
  state.entities.set(twin.id, twin);
  indexRecord(state, twin);
  state.collector.data.itinerary.phase = 'collect';
  reads.count = 0;
  const taken = anvilTrafficMethods.acceptAnvilHarvest.call(owner, state.collector, {
    siteId: PLANET_SITE.id,
    commodityId: PLANET_SITE.harvest.commodityShallow,
    qty: 5,
  });
  assert.equal(taken, 0, 'live twin carrier keeps the ambiguity rejection');
  // The fast path declines on count > 1: the live-only walk must still have run.
  assert.ok(reads.count > 0, 'ambiguous shape still walks the list (live-only verdict)');
});

test('a soft-dead twin carrier never blocks the live worker', () => {
  const reads = { count: 0 };
  const state = makeState(reads);
  const owner = makeOwner(state);
  const recordId = anvilWorkerRecordId({ meta: state.meta }, 'collector');
  const twin = {
    id: 9101,
    type: 'ship',
    alive: false,
    hull: 0,
    pos: { x: 7, z: 7 },
    vel: { x: 0, z: 0 },
    data: countingData(reads, recordId),
  };
  state.entityList.push(twin);
  state.entities.set(twin.id, twin);
  indexRecord(state, twin);
  state.collector.data.itinerary.phase = 'collect';
  reads.count = 0;
  const taken = anvilTrafficMethods.acceptAnvilHarvest.call(owner, state.collector, {
    siteId: PLANET_SITE.id,
    commodityId: PLANET_SITE.harvest.commodityShallow,
    qty: 5,
  });
  assert.equal(taken, 5, 'soft-dead twin is invisible to the ambiguity verdict');
  assert.ok(reads.count > 0, 'stale count still falls through to the live-only walk');
});

test('without a ready index the walk remains the authority', () => {
  const reads = { count: 0 };
  const state = makeState(reads, { index: null });
  const owner = makeOwner(state);
  state.collector.data.itinerary.phase = 'collect';
  reads.count = 0;
  const taken = anvilTrafficMethods.acceptAnvilHarvest.call(owner, state.collector, {
    siteId: PLANET_SITE.id,
    commodityId: PLANET_SITE.harvest.commodityShallow,
    qty: 5,
  });
  assert.equal(taken, 5, 'no-index fallback still resolves the live worker');
  assert.ok(reads.count > 0, 'no-index fallback still scans for ambiguity');
});

test('an index without the count map keeps the walk fallback', () => {
  const reads = { count: 0 };
  const state = makeState(reads, { index: makeIndex({ withCount: false }) });
  const owner = makeOwner(state);
  state.collector.data.itinerary.phase = 'collect';
  reads.count = 0;
  const taken = anvilTrafficMethods.acceptAnvilHarvest.call(owner, state.collector, {
    siteId: PLANET_SITE.id,
    commodityId: PLANET_SITE.harvest.commodityShallow,
    qty: 5,
  });
  assert.equal(taken, 5, 'map-only index still resolves the live worker');
  assert.ok(reads.count > 0, 'missing count map falls back to the walk');
});
