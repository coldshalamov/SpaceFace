/**
 * PQ-045.causal-chain — six ambient microevents as one authored Ceres chain.
 *
 * Seconds-scale, seed-pinned characterization of the traffic-owned choreography timer.
 * Does not touch goldens, npcJobsRuntime, or render.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  CERES_CAUSAL_CHAIN,
  CERES_CAUSAL_CHAIN_EVENT,
  CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
  CERES_CAUSAL_CHAIN_SCHEMA,
  traffic as trafficBase,
} from '../src/systems/traffic.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 47;
const TENDER_SLOT_ID = 'ceres_refinery_tender';
const CHAIN_EVENT_IDS = Object.freeze(CERES_CAUSAL_CHAIN.map((entry) => entry.id));

const EXPECTED_CHAIN = Object.freeze([
  'ev_rich_seam_strike',
  'ev_miner_calls_hauler',
  'ev_patrol_scans_suspect',
  'ev_disabled_hauler_recovery',
  'ev_tender_services_miner',
  'ev_cutter_strips_wreck',
]);

function slotWorldRecordId(slot) {
  return stableRecordId(
    SEED,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  );
}

function makeEntity(id, type, data = {}, pos = { x: 0, z: 0 }) {
  return {
    id,
    type,
    alive: true,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    data: {
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      ...data,
    },
  };
}

function pocketActorRows() {
  return CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
    .filter((slot) => slot.id !== TENDER_SLOT_ID)
    .map((slot) => ({ pocket, slot })));
}

function bootCausalHarness({ simTime = 10 } = {}) {
  const station = makeEntity(10, 'station', { stationId: 'station_ceres' }, { x: 100, z: 100 });
  const asteroid = makeEntity(38, 'asteroid', {
    activityObjectSlotId: 'ceres_seam_ore_clast',
    fieldId: 'f_ceres_1',
    typeId: 'ast_metallic',
    yieldU: 32,
    oreHP: 40,
  }, { x: 200, z: 50 });
  const baseEntities = [station, asteroid];
  const state = {
    mode: 'flight',
    tick: 60,
    simTime,
    meta: { seed: SEED },
    world: { currentSectorId: CERES_ACTIVITY_SECTOR_ID, records: { byId: {} } },
    entities: new Map(baseEntities.map((entity) => [entity.id, entity])),
    entityList: baseEntities.slice(),
    entityIndex: {
      __spacefaceEntityIndexV1: true,
      dockStations: [station],
      stations: [station],
      byStationId: new Map([['station_ceres', station]]),
    },
    traffic: {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
      appliedJobActionIds: [],
      rngSeed: 0x5eed0047,
    },
  };

  let nextId = 200;
  for (const { pocket, slot } of pocketActorRows()) {
    const worldRecordId = slotWorldRecordId(slot);
    const pos = sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + slot.spawnOffset.x,
      z: pocket.activityAnchor.localPos.z + slot.spawnOffset.z,
    }, CERES_ACTIVITY_SECTOR_ID);
    const entity = makeEntity(nextId++, 'ship', {
      worldRecordId,
      jobId: `job:${worldRecordId}`,
      activityActorSlotId: slot.id,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: slot.presentationRole,
      freightDockSeq: 0,
    }, pos);
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    state.traffic.freighters.push({
      id: entity.id,
      role: slot.presentationRole,
      dockSeq: 0,
      manifest: null,
      activityActorSlotId: slot.id,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      worldRecordId,
    });
  }

  // Tender is factionPresence-owned; give it a live body under the stable world record so optional
  // recovery/service links can bind without inventing a second movement owner.
  const tenderSlot = CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.actorSlots)
    .find((slot) => slot.id === TENDER_SLOT_ID);
  assert.ok(tenderSlot, 'authored tender slot');
  const tenderWorldRecordId = slotWorldRecordId(tenderSlot);
  const tenderPos = sectorLocalToGlobalForSector({
    x: CERES_ACTIVITY_POCKETS[0].activityAnchor.localPos.x + tenderSlot.spawnOffset.x,
    z: CERES_ACTIVITY_POCKETS[0].activityAnchor.localPos.z + tenderSlot.spawnOffset.z,
  }, CERES_ACTIVITY_SECTOR_ID);
  const tender = makeEntity(nextId++, 'ship', {
    worldRecordId: tenderWorldRecordId,
    activityActorSlotId: TENDER_SLOT_ID,
    trafficRole: 'tender',
    yardTender: true,
  }, tenderPos);
  state.entities.set(tender.id, tender);
  state.entityList.push(tender);

  for (const service of CERES_ACTIVITY_SERVICE_SLOTS) {
    const worldRecordId = slotWorldRecordId(service);
    const entity = makeEntity(nextId++, 'ship', {
      worldRecordId,
      activityActorSlotId: service.id,
      ceresActivityCast: true,
      ceresActivityJobOwned: false,
      trafficRole: service.presentationRole || 'hauler',
    });
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    state.traffic.freighters.push({
      id: entity.id,
      role: service.presentationRole || 'hauler',
      activityActorSlotId: service.id,
      ceresActivityCast: true,
      ceresActivityJobOwned: false,
      worldRecordId,
    });
  }

  const bus = createBus();
  const receipts = [];
  bus.on(CERES_CAUSAL_CHAIN_EVENT, (payload) => { receipts.push(payload); });

  const traffic = {
    ...trafficBase,
    state: null,
    bus: null,
    helpers: null,
    _registry: null,
    _active: [],
    _stationScratch: [],
    _pendingJobActionIds: new Set(),
    _pendingMinerWorkIds: new Set(),
    _pendingArrivalIds: new Set(),
    _pendingJobActionTokens: new Map(),
    _pendingMinerWorkTokens: new Map(),
    _pendingArrivalTokens: new Map(),
    _committedCeresMinerWorkIds: new Set(),
    _committedCeresArrivalIds: new Set(),
    _causalRunEpoch: 0,
    _restoreEpochPending: false,
    _ceresCausal: null,
  };
  traffic.init({
    state,
    bus,
    helpers: {
      spawnEntity() { return null; },
      npcJobs: { assign() { return null; }, get() { return null; } },
    },
    registry: null,
  });
  // init binds listeners but does not auto-arm the chain without sector:enter.
  traffic._active = state.traffic.freighters.map((rec) => rec.id);
  traffic._ensureCeresCausalChain('test_boot');

  return { state, traffic, bus, receipts, tender, station, asteroid };
}

function stepTo(traffic, state, simTime) {
  state.simTime = simTime;
  traffic._stepCeresCausalChain(1 / 60);
}

function runUntil(traffic, state, predicate, { start = state.simTime, maxS = 900, stepS = 5 } = {}) {
  for (let t = start; t <= start + maxS; t += stepS) {
    stepTo(traffic, state, t);
    if (predicate(traffic.getCeresCausalChainSnapshot(), t)) return t;
  }
  return null;
}

test('catalog order is the six admitted microevents', () => {
  assert.deepEqual(CHAIN_EVENT_IDS, [...EXPECTED_CHAIN]);
  assert.equal(CERES_CAUSAL_CHAIN_MAX_CONCURRENT, 2);
  assert.equal(CERES_CAUSAL_CHAIN_SCHEMA, 'spaceface.ceresCausalChain.v1');
});

test('chain arms on ensure and starts the rich-seam link when the cast is live', () => {
  const { traffic, receipts } = bootCausalHarness({ simTime: 10 });
  const snap0 = traffic.getCeresCausalChainSnapshot();
  assert.ok(snap0);
  assert.equal(snap0.schema, CERES_CAUSAL_CHAIN_SCHEMA);
  assert.equal(snap0.activeCount, 0);

  stepTo(traffic, traffic.state, 10);
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.equal(snap.activeCount, 1);
  assert.equal(snap.active[0].eventId, 'ev_rich_seam_strike');
  assert.equal(snap.active[0].phase, 'cutting');
  assert.equal(snap.active[0].cue, 'blind_cone');
  assert.ok(receipts.some((r) => r.kind === 'chain_ready'));
  assert.ok(receipts.some((r) => r.kind === 'event_start' && r.eventId === 'ev_rich_seam_strike'));
});

test('concurrency never exceeds two authored events', () => {
  const { traffic, state } = bootCausalHarness({ simTime: 0 });
  let peak = 0;
  for (let t = 0; t <= 600; t += 2) {
    stepTo(traffic, state, t);
    const snap = traffic.getCeresCausalChainSnapshot();
    peak = Math.max(peak, snap.activeCount);
    assert.ok(snap.activeCount <= CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
      `activeCount ${snap.activeCount} at t=${t}`);
  }
  assert.ok(peak >= 2, 'chain should exercise the concurrency cap with an overlap');
});

test('full chain reaches a believable terminal outcome with no player input', () => {
  const { traffic, state, receipts } = bootCausalHarness({ simTime: 0 });
  // Cycle re-arms clear the seed bag in the same step as the final complete, so the terminal
  // proof is the cycle counter plus per-event completion receipts — not a lingering seed.
  const doneAt = runUntil(
    traffic,
    state,
    (snap) => snap && (snap.cycle | 0) >= 1,
    { start: 0, maxS: 900, stepS: 3 },
  );
  assert.ok(doneAt != null, 'chain should complete inside ten minutes of sim time');
  assert.ok(doneAt <= 600, `expected a sub-ten-minute zero-input resolve, got t=${doneAt}`);

  for (const id of EXPECTED_CHAIN) {
    assert.ok(
      receipts.some((r) => r.eventId === id && r.kind === 'event_complete'),
      `missing event_complete for ${id}`,
    );
    assert.ok(
      receipts.some((r) => r.eventId === id && (r.kind === 'phase' || r.kind === 'event_start')),
      `no visible phase path for ${id}`,
    );
  }
  assert.ok(receipts.some((r) => r.kind === 'cycle_complete' && (r.cycle | 0) >= 1));

  // Intermediate seeds must have been observed on the bus before the re-arm wipe.
  const seedKinds = receipts.filter((r) => r.kind === 'seed');
  for (const key of [
    'rich_seam', 'miner_loaded', 'hauler_ore_manifest', 'scan_complete',
    'miner_wear', 'aftermath_open', 'wreck_stripped', 'chain_complete',
  ]) {
    assert.ok(
      seedKinds.some((r) => r.seeds && r.seeds[key] === true),
      `seed ${key} never observed`,
    );
  }
});

test('miner_loaded seed opens the hauler-call link while rich seam may still be active', () => {
  const { traffic, state } = bootCausalHarness({ simTime: 0 });
  // cutting 15 + strike 8 = 23s → seed; greed still has 30s left.
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.equal(snap.seeds.miner_loaded, true);
  assert.equal(snap.seeds.rich_seam, true);
  const ids = snap.active.map((live) => live.eventId).sort();
  assert.ok(ids.includes('ev_rich_seam_strike') || snap.completed.includes('ev_rich_seam_strike'));
  assert.ok(
    ids.includes('ev_miner_calls_hauler') || snap.completed.includes('ev_miner_calls_hauler'),
    'hauler call should be active or already completed after miner_loaded',
  );
  assert.ok(snap.activeCount <= 2);
});

test('ore handoff moves a real manifest from miner to refinery hauler', () => {
  const { traffic, state } = bootCausalHarness({ simTime: 0 });
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const haulerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_refinery_hauler');
  const miner = state.entities.get(minerRec.id);
  const hauler = state.entities.get(haulerRec.id);

  // Drive into the transfer phase of the hauler-call event.
  // rich: 15+8+30+20 = 73; call opens after strike (~23); call 12 + answer 25 = 37 → transfer at ~60.
  for (let t = 0; t <= 120; t += 2) {
    stepTo(traffic, state, t);
    const snap = traffic.getCeresCausalChainSnapshot();
    if (snap.seeds.hauler_ore_manifest === true) break;
  }
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.equal(snap.seeds.hauler_ore_manifest, true);
  assert.ok(hauler.data.cargoManifest && hauler.data.cargoManifest.totalQty > 0,
    'hauler should carry the handed-off ore');
  assert.ok(
    !miner.data.cargoManifest
      || !miner.data.cargoManifest.totalQty
      || miner.data.cargoManifest.totalQty === 0,
    'miner should be empty after handoff',
  );
  assert.ok(
    hauler.data.cargoManifest.lines.some((line) => line.commodityId && line.qty > 0),
  );
});

test('rich-seam strike stamps a heavier miner load without rewriting field extraction quanta', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24); // strike seeded → haul-capable load stamp
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const miner = state.entities.get(minerRec.id);
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.equal(snap.seeds.rich_seam, true);
  assert.ok(miner.data.cargoManifest && miner.data.cargoManifest.totalQty >= 16,
    'strike aftermath should leave a readable rich load on the miner');
  // Field owner quantum stays the ordinary 8u parcel so existing Ceres owner bridges stay green.
  const context = {
    jobId: miner.data.jobId,
    worldRecordId: miner.data.worldRecordId,
    entity: miner,
    rec: minerRec,
    slot: { id: 'ceres_seam_miner' },
  };
  const workId = `npc-miner-work:test-rich:${state.tick}`;
  const applied = traffic._applyNpcMinerExtraction(context, { seq: 1 }, asteroid, workId);
  assert.equal(applied, true);
  assert.equal(miner.data.cargoManifest.totalQty, 8);
});

test('actor death falls back without soft-locking the chain', () => {
  const { traffic, state } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const miner = state.entities.get(minerRec.id);
  miner.alive = false;
  stepTo(traffic, state, 5);
  const snap = traffic.getCeresCausalChainSnapshot();
  // Active rich-seam link should fall back; concurrency slot freed.
  assert.ok(!snap.active.some((live) => live.eventId === 'ev_rich_seam_strike'));
});

test('chain ledger is transient and clears on save:loaded / newGame', () => {
  const { traffic, state, bus } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  assert.ok(traffic.getCeresCausalChainSnapshot());
  bus.emit('save:loaded', {});
  // save:loaded resets then re-arms because we remain in the Ceres sector.
  const afterLoad = traffic.getCeresCausalChainSnapshot();
  assert.ok(afterLoad);
  assert.equal(afterLoad.activeCount, 0);
  assert.deepEqual(afterLoad.completed, []);
  assert.deepEqual({ ...afterLoad.seeds }, {});

  stepTo(traffic, state, state.simTime);
  assert.equal(traffic.getCeresCausalChainSnapshot().activeCount, 1);
  traffic.newGame();
  assert.equal(traffic.getCeresCausalChainSnapshot(), null);
});

test('same seed and simTime path is deterministic across two harnesses', () => {
  const a = bootCausalHarness({ simTime: 0 });
  const b = bootCausalHarness({ simTime: 0 });
  const times = [0, 20, 40, 80, 120, 200, 320, 480];
  const traceA = [];
  const traceB = [];
  for (const t of times) {
    stepTo(a.traffic, a.state, t);
    stepTo(b.traffic, b.state, t);
    traceA.push(a.traffic.getCeresCausalChainSnapshot());
    traceB.push(b.traffic.getCeresCausalChainSnapshot());
  }
  assert.deepEqual(
    traceA.map((s) => ({
      active: s.active.map((l) => `${l.eventId}:${l.phase}`),
      completed: s.completed,
      seeds: s.seeds,
      cycle: s.cycle,
    })),
    traceB.map((s) => ({
      active: s.active.map((l) => `${l.eventId}:${l.phase}`),
      completed: s.completed,
      seeds: s.seeds,
      cycle: s.cycle,
    })),
  );
});

test('visible cue stamps land on bound actors for the ordinary camera path', () => {
  const { traffic, state } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const miner = state.entities.get(minerRec.id);
  assert.equal(miner.data.ceresCausalEventId, 'ev_rich_seam_strike');
  assert.equal(miner.data.ceresCausalPhase, 'cutting');
  assert.equal(miner.data.ceresCausalCue, 'blind_cone');
});
