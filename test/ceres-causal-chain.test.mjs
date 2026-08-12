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
import { richSeamOpportunityForEntity } from '../src/systems/fieldDepletion.js';

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

function bootCausalHarness({ simTime = 10, npcJobs = null } = {}) {
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
    npcJobs: { byId: {} },
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
      npcJobs: npcJobs || { assign() { return null; }, get() { return null; } },
    },
    registry: null,
  });
  // init binds listeners but does not auto-arm the chain without sector:enter.
  traffic._active = state.traffic.freighters.map((rec) => rec.id);
  traffic._ensureCeresCausalChain('test_boot');

  return { state, traffic, bus, receipts, tender, station, asteroid };
}

function actorBySlot(state, slotId) {
  const rec = state.traffic.freighters.find((row) => row.activityActorSlotId === slotId);
  assert.ok(rec, `missing traffic row for ${slotId}`);
  const actor = state.entities.get(rec.id);
  assert.ok(actor, `missing entity for ${slotId}`);
  return { rec, actor };
}

function applyCeresMinerWork(traffic, state, asteroid, sequence = 1) {
  const { rec, actor } = actorBySlot(state, 'ceres_seam_miner');
  const context = {
    jobId: actor.data.jobId,
    worldRecordId: actor.data.worldRecordId,
    entity: actor,
    rec,
    slot: { id: 'ceres_seam_miner' },
  };
  const workId = `npc-miner-work:test-rich:${sequence}`;
  return {
    actor,
    rec,
    workId,
    applied: traffic._applyNpcMinerExtraction(context, { seq: sequence }, asteroid, workId),
  };
}

function materializeRichLoad(traffic, state, asteroid, sequence = 1) {
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  const result = applyCeresMinerWork(traffic, state, asteroid, sequence);
  assert.equal(result.applied, true, 'authored seam work should materialize one load');
  return result;
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
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  materializeRichLoad(traffic, state, asteroid);
  let peak = 0;
  for (let t = 24; t <= 600; t += 2) {
    stepTo(traffic, state, t);
    const snap = traffic.getCeresCausalChainSnapshot();
    peak = Math.max(peak, snap.activeCount);
    assert.ok(snap.activeCount <= CERES_CAUSAL_CHAIN_MAX_CONCURRENT,
      `activeCount ${snap.activeCount} at t=${t}`);
  }
  assert.ok(peak >= 2, 'chain should exercise the concurrency cap with an overlap');
});

test('full chain reaches a believable terminal outcome after authored miner work', () => {
  const { traffic, state, receipts, asteroid } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  assert.equal(applyCeresMinerWork(traffic, state, asteroid).applied, true,
    'the authored miner work materializes the load needed by the next link');
  // Cycle re-arms clear the seed bag in the same step as the final complete, so the terminal
  // proof is the cycle counter plus per-event completion receipts — not a lingering seed.
  const doneAt = runUntil(
    traffic,
    state,
    (snap) => snap && (snap.cycle | 0) >= 1,
    { start: 24, maxS: 900, stepS: 3 },
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

test('real miner work opens the hauler-call link while rich seam may still be active', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  // cutting 15 + strike 8 = 23s → the opportunity opens; greed still has 30s left.
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  let snap = traffic.getCeresCausalChainSnapshot();
  assert.notEqual(snap.seeds.miner_loaded, true, 'a timer cannot claim cargo exists');
  assert.equal(richSeamOpportunityForEntity(state, asteroid).state, 'open');
  assert.equal(applyCeresMinerWork(traffic, state, asteroid).applied, true);
  stepTo(traffic, state, 25);
  snap = traffic.getCeresCausalChainSnapshot();
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

test('hauler-call seeds ledger flags without minting additional ore into cargo', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  materializeRichLoad(traffic, state, asteroid);
  const { actor: miner } = actorBySlot(state, 'ceres_seam_miner');
  const { actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
  const haulerManifestBefore = hauler.data.cargoManifest;
  const minerQtyBefore = miner.data.cargoManifest && miner.data.cargoManifest.totalQty || 0;
  const haulerQtyBefore = hauler.data.cargoManifest && hauler.data.cargoManifest.totalQty || 0;

  // Drive into the transfer seed of the hauler-call event.
  for (let t = 24; t <= 144; t += 2) {
    stepTo(traffic, state, t);
    const snap = traffic.getCeresCausalChainSnapshot();
    if (snap.seeds.hauler_ore_manifest === true) break;
  }
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.equal(snap.seeds.hauler_ore_manifest, true);
  assert.equal(snap.seeds.ore_handoff, true);
  // MAJOR 4: chain must not mint or move ore through a second cargo writer.
  const minerQtyAfter = miner.data.cargoManifest && miner.data.cargoManifest.totalQty || 0;
  const haulerQtyAfter = hauler.data.cargoManifest && hauler.data.cargoManifest.totalQty || 0;
  assert.equal(minerQtyAfter, minerQtyBefore, 'miner cargo untouched by chain handoff beat');
  assert.equal(haulerQtyAfter, haulerQtyBefore, 'hauler cargo untouched by chain handoff beat');

  const completedAt = runUntil(
    traffic,
    state,
    (s) => s && s.completed.includes('ev_miner_calls_hauler'),
    { start: state.simTime, maxS: 120, stepS: 2 },
  );
  assert.ok(completedAt != null, 'hauler-call link should terminate');
  assert.equal(hauler.data.cargoManifest, haulerManifestBefore,
    'hauler cargo manifest must remain unchanged after hauler-call termination');
});

test('rich-seam strike opens one material opportunity and exact miner work loads it once', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24); // strike seeded
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const miner = state.entities.get(minerRec.id);
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.equal(snap.seeds.rich_seam, true);
  assert.notEqual(snap.seeds.miner_loaded, true);
  const open = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(open.state, 'open');
  assert.equal(open.bonusU, 8);
  // No fabricated rich load — cargo only appears via the extraction owner path.
  assert.ok(
    !miner.data.cargoManifest
      || !miner.data.cargoManifest.totalQty
      || miner.data.cargoManifest.totalQty === 0,
    'strike must not mint ore onto the miner',
  );
  const work = applyCeresMinerWork(traffic, state, asteroid, state.tick);
  assert.equal(work.applied, true);
  assert.equal(miner.data.cargoManifest.totalQty, 16);
  assert.equal(miner.data.cargoManifest.lotSource.richOpportunityId, open.opportunityId);
  assert.equal(miner.data.cargoManifest.lotSource.richBonusU, 8);
  assert.equal(traffic.getCeresCausalChainSnapshot().seeds.miner_loaded, true);
  assert.equal(richSeamOpportunityForEntity(state, asteroid).state, 'worked');
  assert.equal(traffic._applyNpcMinerExtraction({
    jobId: miner.data.jobId,
    worldRecordId: miner.data.worldRecordId,
    entity: miner,
    rec: minerRec,
    slot: { id: 'ceres_seam_miner' },
  }, { seq: state.tick }, asteroid, work.workId), false);
  assert.equal(miner.data.cargoManifest.totalQty, 16, 'duplicate work cannot mint a second rich lot');
});

test('actor death falls back and plants interrupt seeds (divergent from complete)', () => {
  const { traffic, state } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const miner = state.entities.get(minerRec.id);
  miner.alive = false;
  stepTo(traffic, state, 5);
  let snap = traffic.getCeresCausalChainSnapshot();
  // Active rich-seam link should fall back; concurrency slot freed.
  assert.ok(!snap.active.some((live) => live.eventId === 'ev_rich_seam_strike'));
  // D1: interrupt plants aftermath_open, NOT miner_loaded (complete path).
  assert.equal(snap.seeds.rich_seam, true);
  assert.equal(snap.seeds.aftermath_open, true);
  assert.notEqual(snap.seeds.miner_loaded, true);
  assert.ok(snap.completed.includes('ev_rich_seam_strike'));

  // Terminal-destroy the miner so superseded mid-chain links skip and the cycle can close.
  state.world.records.byId[miner.data.worldRecordId] = {
    recordId: miner.data.worldRecordId,
    kind: RECORD_KIND.CONVOY,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    alive: false,
    outcome: 'destroyed',
  };
  const continuedAt = runUntil(
    traffic,
    state,
    (s) => s && (
      s.activeCount >= 1
      || s.seeds.chain_complete === true
      || (s.cycle | 0) >= 1
    ),
    { start: 5, maxS: 600, stepS: 3 },
  );
  assert.ok(continuedAt != null, 'chain must continue after an interrupted rich-seam link');
  snap = traffic.getCeresCausalChainSnapshot();
  assert.ok(
    snap.activeCount >= 1
      || snap.seeds.chain_complete === true
      || (snap.cycle | 0) >= 1,
    'expected progress past the interrupted rich-seam link',
  );
});

test('D1: kill hauler mid-scan seeds aftermath_open, not hauler_stressed', () => {
  const { traffic, state, receipts, asteroid } = bootCausalHarness({ simTime: 0 });
  materializeRichLoad(traffic, state, asteroid);
  const entered = runUntil(
    traffic,
    state,
    (snap) => snap && snap.active.some((l) => l.eventId === 'ev_patrol_scans_suspect'),
    { start: 24, maxS: 400, stepS: 2 },
  );
  assert.ok(entered != null, 'patrol scan link should open under zero input');
  const haulerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_refinery_hauler');
  const hauler = state.entities.get(haulerRec.id);
  assert.ok(hauler, 'hauler cast present');
  // Kill the hauler mid-scan and stamp durable destruction (player-kill world path).
  hauler.alive = false;
  state.world.records.byId[hauler.data.worldRecordId] = {
    recordId: hauler.data.worldRecordId,
    kind: RECORD_KIND.CONVOY,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    alive: false,
    outcome: 'destroyed',
  };
  stepTo(traffic, state, state.simTime + 2);
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.ok(!snap.active.some((l) => l.eventId === 'ev_patrol_scans_suspect'),
    'patrol link should fall back on hauler death');
  assert.equal(snap.seeds.aftermath_open, true, 'interrupt seeds aftermath for salvor');
  assert.notEqual(snap.seeds.hauler_stressed, true, 'must NOT plant complete-path hauler_stressed');
  assert.ok(
    receipts.some((r) => r.kind === 'event_interrupt' && r.eventId === 'ev_patrol_scans_suspect'),
    'interrupt receipt for patrol scan',
  );
  // Full cycle still closes with the divergent branch (no softlock).
  const doneAt = runUntil(
    traffic,
    state,
    (s) => s && (s.cycle | 0) >= 1,
    { start: state.simTime, maxS: 900, stepS: 3 },
  );
  assert.ok(doneAt != null, 'cycle must complete after mid-scan interrupt');
});

test('D1: every chain entry authors interruptSeeds distinct from complete seeds where story diverges', () => {
  for (const entry of CERES_CAUSAL_CHAIN) {
    assert.ok(Array.isArray(entry.seeds) && entry.seeds.length > 0, `${entry.id} seeds`);
    assert.ok(Array.isArray(entry.interruptSeeds) && entry.interruptSeeds.length > 0,
      `${entry.id} interruptSeeds`);
  }
  const patrol = CERES_CAUSAL_CHAIN.find((e) => e.id === 'ev_patrol_scans_suspect');
  assert.ok(patrol.seeds.includes('hauler_stressed'));
  assert.ok(!patrol.interruptSeeds.includes('hauler_stressed'));
  assert.ok(patrol.interruptSeeds.includes('aftermath_open'));
});

test('terminal cast destruction skips the dead link and still completes a cycle', () => {
  const { traffic, state, receipts } = bootCausalHarness({ simTime: 0 });
  const minerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_seam_miner');
  const miner = state.entities.get(minerRec.id);
  const worldRecordId = miner.data.worldRecordId;
  assert.ok(worldRecordId, 'miner has a durable world record id');

  // Permanently destroy the seam miner cast hull (survives Continue via durable outcome).
  state.world.records.byId[worldRecordId] = {
    recordId: worldRecordId,
    kind: RECORD_KIND.CONVOY,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    alive: false,
    outcome: 'destroyed',
  };
  miner.alive = false;

  const doneAt = runUntil(
    traffic,
    state,
    (snap) => snap && (snap.cycle | 0) >= 1,
    { start: 0, maxS: 900, stepS: 3 },
  );
  assert.ok(doneAt != null, 'chain should complete a cycle despite a destroyed cast hull');
  const snap = traffic.getCeresCausalChainSnapshot();
  assert.ok((snap.cycle | 0) >= 1);
  // Miner-required links must have been seed-skipped rather than waited on forever.
  assert.ok(
    receipts.some((r) => r.outcome === 'skip_terminal_cast' && r.eventId === 'ev_rich_seam_strike'),
    'rich-seam link should skip on terminal miner loss',
  );
  assert.ok(
    receipts.some((r) => r.outcome === 'skip_terminal_cast' && r.eventId === 'ev_miner_calls_hauler'),
    'hauler-call link should skip on terminal miner loss',
  );
  assert.ok(receipts.some((r) => r.kind === 'cycle_complete' && (r.cycle | 0) >= 1));
});

test('save mid-recovery clears ceresCausal stamps from a persistent civilian', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  materializeRichLoad(traffic, state, asteroid);
  // Drive into the disabled-hauler recovery window (needs hauler_stressed seed first).
  const entered = runUntil(
    traffic,
    state,
    (snap) => snap && snap.active.some((l) => l.eventId === 'ev_disabled_hauler_recovery'),
    { start: 24, maxS: 600, stepS: 2 },
  );
  assert.ok(entered != null, 'recovery link should open under zero input');
  const haulerRec = state.traffic.freighters.find((r) => r.activityActorSlotId === 'ceres_refinery_hauler');
  const hauler = state.entities.get(haulerRec.id);
  assert.equal(hauler.data.ceresCausalDisabled, true);
  assert.ok(hauler.data.ceresCausalEventId);

  // Surrender/recovery path marks disabled civilians persistent — the leak surface.
  hauler.flags = hauler.flags || {};
  hauler.flags.persistent = true;

  // Chain reset (save:loaded / sector leave) must wipe every ceresCausal* key.
  traffic._resetCeresCausalChain('save_loaded');
  const residual = Object.keys(hauler.data).filter((k) => k.startsWith('ceresCausal'));
  assert.deepEqual(residual, [], `ceresCausal keys leaked into save surface: ${residual.join(',')}`);
  assert.equal(Object.prototype.hasOwnProperty.call(haulerRec, 'ceresCausalDisabled'), false);

  // Also assert a save-shaped clone of entity.data has no residual stamps.
  const serializedData = JSON.parse(JSON.stringify(hauler.data));
  const serializedResidual = Object.keys(serializedData).filter((k) => k.startsWith('ceresCausal'));
  assert.deepEqual(serializedResidual, []);
});

test('traffic cleanup clears ceresCausal stamps from all entity-scoped actors', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  materializeRichLoad(traffic, state, asteroid);
  const entered = runUntil(
    traffic,
    state,
    (snap) => snap && snap.active.some((l) => l.eventId === 'ev_disabled_hauler_recovery'),
    { start: 24, maxS: 600, stepS: 2 },
  );
  assert.ok(entered != null, 'recovery link should open under zero input');
  const { actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
  assert.ok(Object.keys(hauler.data).some((k) => k.startsWith('ceresCausal')),
    'test should enter with a stamped hauler');

  traffic._cleanup();

  const residual = [];
  for (const entity of state.entityList) {
    if (!entity || !entity.data) continue;
    for (const key of Object.keys(entity.data)) {
      if (key.startsWith('ceresCausal')) residual.push(`${entity.id}:${key}`);
    }
  }
  assert.deepEqual(residual, [], `ceresCausal keys survived cleanup: ${residual.join(',')}`);
});

test('failed patrol redirect does not tear down the actor job at link termination', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  materializeRichLoad(traffic, state, asteroid);
  const { actor: patrol } = actorBySlot(state, 'ceres_cathedral_patrol');
  const priorJobId = patrol.data.jobId;

  const startedAt = runUntil(
    traffic,
    state,
    (snap) => snap && snap.active.some((l) => l.eventId === 'ev_patrol_scans_suspect'),
    { start: 24, maxS: 240, stepS: 2 },
  );
  assert.ok(startedAt != null, 'patrol scan link should start');
  assert.equal(patrol.data.jobId, priorJobId, 'failed redirect should restore the prior job immediately');

  const completedAt = runUntil(
    traffic,
    state,
    (snap) => snap && snap.completed.includes('ev_patrol_scans_suspect'),
    { start: state.simTime, maxS: 120, stepS: 2 },
  );
  assert.ok(completedAt != null, 'patrol scan link should terminate');
  assert.equal(patrol.data.jobId, priorJobId, 'failed redirect must not be restored as a fresh job');
});

test('patrol redirect restores the prior job id after a successful assign round trip', () => {
  const releases = [];
  const assignments = [];
  let jobState = null;
  const npcJobs = {
    assign(entity, spec) {
      const jobId = `job:${entity.data.worldRecordId}`;
      assignments.push({ entityId: entity.id, jobId, spec });
      entity.data.jobId = jobId;
      jobState.npcJobs.byId[jobId] = {
        entityId: entity.id,
        job: { route: spec.route },
        kind: spec.kind,
      };
      return jobId;
    },
    release(jobId) {
      releases.push(jobId);
      delete jobState.npcJobs.byId[jobId];
    },
    get(jobId) {
      return jobState.npcJobs.byId[jobId] || null;
    },
  };
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0, npcJobs });
  jobState = state;
  materializeRichLoad(traffic, state, asteroid);
  const { actor: patrol } = actorBySlot(state, 'ceres_cathedral_patrol');
  const priorJobId = patrol.data.jobId;
  const priorEntry = {
    entityId: patrol.id,
    job: { route: [{ id: 'patrol-a' }, { id: 'patrol-b' }] },
    kind: 'patrol',
  };
  state.npcJobs.byId[priorJobId] = priorEntry;

  const completedAt = runUntil(
    traffic,
    state,
    (snap) => snap && snap.completed.includes('ev_patrol_scans_suspect'),
    { start: 24, maxS: 360, stepS: 2 },
  );

  assert.ok(completedAt != null, 'patrol scan link should complete');
  assert.equal(patrol.data.jobId, priorJobId, 'patrol redirect should restore the prior job id');
  assert.equal(assignments.length, 1, 'patrol redirect should assign once for the scan window');
  assert.equal(assignments[0].spec.kind, 'patrol');
  assert.equal(assignments[0].spec.route[1].targetRef, 'actor:ceres_refinery_hauler');
  assert.deepEqual(releases, [priorJobId, assignments[0].jobId]);
  assert.equal(state.npcJobs.byId[priorJobId], priorEntry);
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
