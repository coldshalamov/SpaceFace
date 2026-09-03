/**
 * PQ-045.causal-chain — six ambient microevents as one authored Ceres chain.
 *
 * Seconds-scale, seed-pinned characterization of the traffic-owned choreography timer.
 * Does not touch goldens, npcJobsRuntime, or render.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { getCombatKernel } from '../src/combat/kernel.js';
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
import {
  claimRichSeamOpportunity,
  fieldDepletion as fieldDepletionBase,
  richSeamOpportunityForEntity,
} from '../src/systems/fieldDepletion.js';
import { richSeamTargetReadout } from '../src/ui/targetPanel.js';
import { livingWorkStatusText } from '../src/data/contactHail.js';
import { save } from '../src/save/saveSystem.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { world } from '../src/systems/world.js';

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
  'ev_rock_calving',
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

function prepareCombatShip(entity) {
  Object.assign(entity, {
    radius: 18,
    hull: 140,
    hullMax: 140,
    shield: 60,
    shieldMax: 60,
    armorHp: 0,
    armorMax: 0,
    armorFlat: 0,
    cap: 100,
    capMax: 100,
  });
  return entity;
}

function pocketActorRows() {
  return CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
    .filter((slot) => slot.id !== TENDER_SLOT_ID)
    .map((slot) => ({ pocket, slot })));
}

function bootCausalHarness({ simTime = 10, npcJobs = null, withTenderCombat = false } = {}) {
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
    jobId: `job:${tenderWorldRecordId}`,
    activityActorSlotId: TENDER_SLOT_ID,
    trafficRole: 'tender',
    durable: true,
    factionPresence: { yardTender: true },
  }, tenderPos);
  if (withTenderCombat) prepareCombatShip(tender);
  state.entities.set(tender.id, tender);
  state.entityList.push(tender);

  if (withTenderCombat) {
    const { actor: miner } = actorBySlot(state, 'ceres_seam_miner');
    const { actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
    prepareCombatShip(miner);
    prepareCombatShip(hauler);
  }

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

  const controlClaims = new Map();
  const jobs = npcJobs || { assign() { return null; }, get() { return null; } };
  if (typeof jobs.claimControl !== 'function') {
    jobs.claimControl = (jobId, { claimId } = {}) => {
      const existing = controlClaims.get(jobId);
      if (existing && existing !== claimId) return { granted: false, reason: 'already_claimed' };
      controlClaims.set(jobId, claimId);
      return { granted: true };
    };
  }
  if (typeof jobs.releaseControl !== 'function') {
    jobs.releaseControl = (jobId, claimId) => {
      if (controlClaims.get(jobId) === claimId) controlClaims.delete(jobId);
      return { released: true };
    };
  }
  const helpers = {
    spawnEntity() { return null; },
    npcJobs: jobs,
  };
  let registry = null;
  let combatKernel = null;
  const combat = {
    ensureKernel() {
      if (!combatKernel) combatKernel = getCombatKernel({ state, bus, helpers, registry });
      return combatKernel;
    },
  };
  if (withTenderCombat) {
    registry = {
      get(systemId) {
        return systemId === 'combat' ? combat : null;
      },
    };
  }
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
    helpers,
    registry,
  });
  // init binds listeners but does not auto-arm the chain without sector:enter.
  traffic._active = state.traffic.freighters.map((rec) => rec.id);
  traffic._ensureCeresCausalChain('test_boot');

  return {
    state,
    traffic,
    bus,
    receipts,
    tender,
    station,
    asteroid,
    controlClaims,
    combatKernel: withTenderCombat ? combat.ensureKernel() : null,
  };
}

function actorBySlot(state, slotId) {
  const rec = state.traffic.freighters.find((row) => row.activityActorSlotId === slotId);
  assert.ok(rec, `missing traffic row for ${slotId}`);
  const actor = state.entities.get(rec.id);
  assert.ok(actor, `missing entity for ${slotId}`);
  return { rec, actor };
}

function rematerializeActor(state, slotId, id) {
  const { rec, actor } = actorBySlot(state, slotId);
  const replacement = {
    ...actor,
    id,
    pos: { ...actor.pos },
    vel: { ...actor.vel },
    data: { ...actor.data },
  };
  state.entities.delete(actor.id);
  state.entities.set(replacement.id, replacement);
  state.entityList = state.entityList.map((entity) => entity === actor ? replacement : entity);
  rec.id = replacement.id;
  return { rec, actor: replacement };
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

function materializeRichLoad(traffic, state, asteroid, sequence = 1, { rendezvous = true } = {}) {
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  const result = applyCeresMinerWork(traffic, state, asteroid, sequence);
  assert.equal(result.applied, true, 'authored seam work should materialize one load');
  if (rendezvous) {
    const { actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
    hauler.pos = { ...result.actor.pos };
  }
  return result;
}

function stepTo(traffic, state, simTime) {
  state.simTime = simTime;
  traffic._stepCeresCausalChain(1 / 60);
  traffic._stepCeresMinerHaulerHandoffs(1 / 60);
}

function runUntil(traffic, state, predicate, { start = state.simTime, maxS = 900, stepS = 5 } = {}) {
  for (let t = start; t <= start + maxS; t += stepS) {
    stepTo(traffic, state, t);
    if (predicate(traffic.getCeresCausalChainSnapshot(), t)) return t;
  }
  return null;
}

test('catalog order is the seven admitted microevents', () => {
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
  const {
    traffic,
    state,
    receipts,
    asteroid,
    tender,
    combatKernel,
  } = bootCausalHarness({ simTime: 0, withTenderCombat: true });
  assert.ok(combatKernel, 'the tender link uses the live combat-kernel registry seam');
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  assert.equal(applyCeresMinerWork(traffic, state, asteroid).applied, true,
    'the authored miner work materializes the load needed by the next link');
  // Cycle re-arms clear the seed bag in the same step as the final complete, so the terminal
  // proof is the cycle counter plus per-event completion receipts — not a lingering seed.
  let doneAt = null;
  let sawDriveDisabled = false;
  let sawRepair = false;
  for (let t = 24; t <= 924; t += 3) {
    // This timer-only harness has no flight integrator; keep the actual pair together after the
    // rendezvous-specific test above has already proven the hauler drives there under its intent.
    const { actor: miner } = actorBySlot(state, 'ceres_seam_miner');
    const { actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
    hauler.pos = { ...miner.pos };
    const disabledIncident = state.traffic.ceresDisabledHaulerIncident;
    if (disabledIncident && !['repaired', 'recovered', 'stolen', 'abandoned', 'destroyed', 'failed'].includes(disabledIncident.state)) {
      const standoff = traffic._ceresTenderServiceStandoff(tender, hauler);
      tender.pos = { x: hauler.pos.x + standoff, z: hauler.pos.z };
    }
    const incident = state.traffic.ceresTenderServiceIncident;
    if (incident && incident.state !== 'succeeded' && incident.state !== 'failed') {
      const standoff = traffic._ceresTenderServiceStandoff(tender, miner);
      tender.pos = { x: miner.pos.x + standoff, z: miner.pos.z };
    }
    stepTo(traffic, state, t);
    state.tick += 1;
    combatKernel.prePhysics(1 / 60);
    const drive = state.combat.entities[String(miner.id)]?.subsystems?.subsystem_drive;
    sawDriveDisabled ||= drive?.destroyed === true || drive?.effectiveDisabled === true;
    sawRepair ||= state.traffic.ceresTenderServiceIncident?.state === 'repair';
    if ((traffic.getCeresCausalChainSnapshot().cycle | 0) >= 1) {
      doneAt = t;
      break;
    }
  }
  assert.ok(doneAt != null, 'chain should complete inside ten minutes of sim time');
  assert.ok(doneAt <= 600, `expected a sub-ten-minute zero-input resolve, got t=${doneAt}`);
  assert.equal(sawDriveDisabled, true, 'the real combat drive transitions to disabled before repair');
  assert.equal(sawRepair, true, 'tender service waits at standoff before requesting combat repair');
  assert.equal(state.traffic.ceresTenderServiceIncident.state, 'succeeded');

  for (const id of EXPECTED_CHAIN.filter((id) => id !== 'ev_cutter_strips_wreck')) {
    assert.ok(
      receipts.some((r) => r.eventId === id && r.kind === 'event_complete'),
      `missing event_complete for ${id}`,
    );
    assert.ok(
      receipts.some((r) => r.eventId === id && (r.kind === 'phase' || r.kind === 'event_start')),
      `no visible phase path for ${id}`,
    );
  }
  assert.ok(receipts.some((r) => r.eventId === 'ev_cutter_strips_wreck'
    && r.kind === 'event_interrupt' && r.outcome === 'skip_service_success'),
  'a successful repair skips wreck aftermath instead of manufacturing it');
  assert.ok(receipts.some((r) => r.eventId === 'ev_cutter_strips_wreck'
    && r.kind === 'event_interrupt' && r.outcome === 'skip_service_success'
    && Array.isArray(r.seeded) && r.seeded.includes('chain_complete')),
  'the skipped aftermath still closes the causal cycle');
  assert.ok(receipts.some((r) => r.kind === 'cycle_complete' && (r.cycle | 0) >= 1));

  // Intermediate seeds must have been observed on the bus before the re-arm wipe.
  const seedKinds = receipts.filter((r) => r.kind === 'seed');
  for (const key of [
    'rich_seam', 'miner_loaded', 'scan_complete',
    'miner_wear', 'miner_serviced', 'rock_calved',
  ]) {
    assert.ok(
      seedKinds.some((r) => r.seeds && r.seeds[key] === true),
      `seed ${key} never observed`,
    );
  }
  assert.equal(seedKinds.some((r) => r.seeds && r.seeds.aftermath_open === true), false,
    'the repaired miner does not open aftermath');

  // The calving coda ran its authored environmental phases on the shared cue vocabulary.
  for (const [phase, cue] of [
    ['groan', 'blind_cone'],
    ['calve', 'breaking_the_pattern'],
    ['drift', 'home_under_rock'],
  ]) {
    assert.ok(
      receipts.some((r) => r.eventId === 'ev_rock_calving'
        && (r.kind === 'phase' || r.kind === 'event_start')
        && r.phase === phase && r.cue === cue),
      `missing calving phase receipt ${phase}/${cue}`,
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

test('miner-to-hauler handoff drives a physical rendezvous, transfers one conserved lot, and reaches the refinery sink', () => {
  const { traffic, state, bus, station, asteroid, controlClaims } = bootCausalHarness({ simTime: 0 });
  const { actor: miner } = materializeRichLoad(traffic, state, asteroid, 1, { rendezvous: false });
  const { rec: haulerRec, actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
  const sourceQty = miner.data.cargoManifest.totalQty;
  assert.equal(sourceQty, 16);

  stepTo(traffic, state, 25);
  const requested = state.traffic.ceresMinerHaulerHandoff;
  assert.ok(requested, 'real miner work requests one durable handoff');
  assert.equal(requested.state, 'rendezvous');
  assert.equal(hauler.data.intent.moveZ, 1, 'hauler physically drives toward the held miner');
  assert.equal(miner.data.ceresHandoffTargetId, hauler.id);
  assert.match(miner.data.ceresHandoffStatus, /HOLDING FOR HAULER/);
  assert.match(livingWorkStatusText(miner), /HOLDING FOR HAULER/);

  // The transfer stays closed until the actual actors meet and the authored transfer phase opens.
  hauler.pos = { ...miner.pos };
  const transferredAt = runUntil(
    traffic,
    state,
    () => state.traffic.ceresMinerHaulerHandoff.state === 'in_transit',
    { start: 26, maxS: 180, stepS: 1 },
  );
  assert.ok(transferredAt != null, 'physical range + authored transfer window should hand over the lot');
  const handoff = state.traffic.ceresMinerHaulerHandoff;
  const moved = hauler.data.cargoManifest;
  assert.equal(miner.data.cargoManifest.totalQty, 0, 'miner only resumes after its hold is empty');
  assert.equal(moved.totalQty, sourceQty);
  assert.equal(moved.custody.handoffId, handoff.handoffId);
  assert.equal(moved.custody.holderId, hauler.data.worldRecordId);
  assert.equal(moved.lotSource.rootLotId, handoff.rootLotId);
  assert.equal(miner.data.cargoManifest.totalQty + moved.totalQty, sourceQty, 'manifest total is conserved');
  const transferSeq = handoff.transferSeq;
  stepTo(traffic, state, transferredAt + 1);
  assert.equal(handoff.transferSeq, transferSeq, 'duplicate traffic ticks cannot transfer the same lot twice');
  assert.equal(hauler.data.cargoManifest.totalQty, sourceQty);

  const tradeRequests = [];
  bus.on('aiTrader:requestTrade', (intent) => tradeRequests.push(intent));
  const delivered = traffic._emitArrival(hauler, haulerRec, station, {
    dockSeq: haulerRec.dockSeq,
    manifest: moved,
    ceresAction: true,
  });
  assert.equal(delivered, true, 'the transferred manifest enters the existing refinery arrival owner');
  assert.equal(traffic._markCeresHandoffDelivered(moved, {
    entity: hauler,
    receiptId: `test-refinery:${handoff.handoffId}:${transferSeq}`,
  }), true);
  traffic._setTrafficManifest(hauler, haulerRec, traffic._buildMinerManifest(hauler, haulerRec.dockSeq, null, 0, 'hauler'));
  assert.equal(handoff.state, 'delivered');
  assert.equal(handoff.deliveredQty, sourceQty);
  assert.equal(tradeRequests.reduce((sum, intent) => sum + intent.qty, 0), sourceQty);
  assert.equal(controlClaims.size, 0, 'terminal handoff releases both existing job controls');
});

test('partial handoff survives Continue by stable identity and hauler death routes only its transferred share to loss', () => {
  const { traffic, state, bus, asteroid, controlClaims } = bootCausalHarness({ simTime: 0 });
  const { actor: miner } = materializeRichLoad(traffic, state, asteroid, 2, { rendezvous: false });
  const { actor: hauler } = actorBySlot(state, 'ceres_refinery_hauler');
  hauler.data.ceresHandoffCapacityU = 8;
  hauler.pos = { ...miner.pos };
  const transferAt = runUntil(
    traffic,
    state,
    () => state.traffic.ceresMinerHaulerHandoff.transferSeq === 1,
    { start: 25, maxS: 180, stepS: 1 },
  );
  assert.ok(transferAt != null);
  const handoff = state.traffic.ceresMinerHaulerHandoff;
  assert.equal(miner.data.cargoManifest.totalQty, 8);
  assert.equal(hauler.data.cargoManifest.totalQty, 8);
  assert.equal(handoff.remainingQty, 8);
  assert.equal(controlClaims.size, 1, 'the miner stays held while its remainder waits for the hauler');

  const minerWorldRecordId = miner.data.worldRecordId;
  const haulerWorldRecordId = hauler.data.worldRecordId;
  const continuedMiner = rematerializeActor(state, 'ceres_seam_miner', 9101);
  const continuedHauler = rematerializeActor(state, 'ceres_refinery_hauler', 9102);
  bus.emit('save:loaded', {});
  stepTo(traffic, state, transferAt + 1);
  assert.equal(handoff.minerWorldRecordId, minerWorldRecordId);
  assert.equal(handoff.haulerWorldRecordId, haulerWorldRecordId);
  assert.equal(continuedMiner.actor.data.cargoManifest.totalQty, 8);
  assert.equal(continuedHauler.actor.data.cargoManifest.totalQty, 8);
  assert.equal(controlClaims.size, 0, 'Continue does not retain a dead control lease by numeric id');

  const losses = [];
  bus.on('freight:loss', (intent) => losses.push(intent));
  continuedHauler.actor.alive = false;
  bus.emit('entity:killed', { id: continuedHauler.actor.id, killerId: 1 });
  assert.equal(handoff.state, 'interrupted');
  assert.equal(continuedMiner.actor.data.cargoManifest.totalQty, 8,
    'the miner remainder stays in its original custody after the other hull dies');
  assert.equal(losses.length, 1, 'the transferred share enters the existing loss owner once');
  assert.equal(losses[0].totalQty, 8);
  assert.equal(controlClaims.size, 0, 'death cannot leave a Ceres handoff control lock behind');
});

test('miner loss after a partial transfer preserves the live hauler fragment through one refinery settlement', () => {
  const { traffic, state, bus, station, asteroid } = bootCausalHarness({ simTime: 0 });
  const { actor: miner } = materializeRichLoad(traffic, state, asteroid, 3, { rendezvous: false });
  const { actor: hauler, rec: haulerRec } = actorBySlot(state, 'ceres_refinery_hauler');
  hauler.data.ceresHandoffCapacityU = 8;
  hauler.pos = { ...miner.pos };
  assert.ok(runUntil(traffic, state,
    () => state.traffic.ceresMinerHaulerHandoff.transferSeq === 1,
    { start: 25, maxS: 180, stepS: 1 }) != null);
  const handoff = state.traffic.ceresMinerHaulerHandoff;
  const moved = hauler.data.cargoManifest;
  const losses = [];
  bus.on('freight:loss', (intent) => losses.push(intent));
  miner.alive = false;
  bus.emit('entity:killed', { id: miner.id, killerId: 1 });
  assert.equal(handoff.state, 'in_transit');
  assert.equal(handoff.terminalizedQty, 8);
  assert.equal(hauler.data.cargoManifest.totalQty, 8);
  assert.equal(losses.length, 1);
  assert.equal(losses[0].totalQty, 8, 'only the miner-held remainder enters loss');
  assert.equal(traffic._emitArrival(hauler, haulerRec, station, {
    dockSeq: haulerRec.dockSeq, manifest: moved, ceresAction: true,
  }), true);
  assert.equal(traffic._markCeresHandoffDelivered(moved, {
    entity: hauler, receiptId: `miner-loss:${handoff.handoffId}:1`,
  }), true);
  assert.equal(handoff.state, 'delivered');
  assert.equal(handoff.deliveredQty, 8);
});

test('asymmetric rendezvous control acquisition releases the one lease it obtained', () => {
  const releases = [];
  let claimCount = 0;
  const npcJobs = {
    assign() { return null; },
    get() { return null; },
    claimControl() {
      claimCount += 1;
      return { granted: claimCount === 1 };
    },
    releaseControl(jobId, claimId) {
      releases.push({ jobId, claimId });
      return { released: true };
    },
  };
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0, npcJobs });
  materializeRichLoad(traffic, state, asteroid, 4, { rendezvous: false });
  stepTo(traffic, state, 25);
  claimCount = 0;
  releases.length = 0;
  traffic._stepCeresMinerHaulerHandoffs(1 / 60);
  assert.equal(claimCount, 2);
  assert.equal(releases.length, 1);
  assert.match(releases[0].claimId, /:miner$/);
});

test('malformed persisted handoff is cleared and cannot block the next real extraction', () => {
  const { traffic, state, asteroid } = bootCausalHarness({ simTime: 0 });
  state.traffic.ceresMinerHaulerHandoff = { state: 'requested' };
  const { actor } = materializeRichLoad(traffic, state, asteroid, 5, { rendezvous: false });
  stepTo(traffic, state, 25);
  const handoff = state.traffic.ceresMinerHaulerHandoff;
  assert.equal(handoff.schema, 'spaceface.ceresMinerHaulerHandoff.v1');
  assert.equal(handoff.minerWorldRecordId, actor.data.worldRecordId);
  traffic.deserialize({ schema: 'wrong', ceresMinerHaulerHandoff: handoff });
  assert.equal(state.traffic.ceresMinerHaulerHandoff, null,
    'schema-mismatched save data replaces rather than retaining outgoing state');
});

test('real save envelope restores the in-transit lot into a fresh runtime and reaches the refinery', () => {
  const systems = [world, npcJobsRuntime, trafficBase, save];
  const original = createSimulation({ seed: SEED, systems });
  original.state.mode = 'flight';
  const player = original.spawn({
    type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
  });
  original.state.playerId = player.id;
  original.state.nextEntityId = 5000;
  original.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID);
  const originalTraffic = original.registry.get('traffic');
  const minerSlot = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots)
    .find((slot) => slot.id === 'ceres_seam_miner');
  const miner = original.state.entityList.find((entity) => entity && entity.data
    && entity.data.activityActorSlotId === minerSlot.id);
  const hauler = original.state.entityList.find((entity) => entity && entity.data
    && entity.data.activityActorSlotId === 'ceres_refinery_hauler');
  const minerRec = original.state.traffic.freighters.find((row) => row.id === miner.id);
  const haulerRec = original.state.traffic.freighters.find((row) => row.id === hauler.id);
  const manifest = originalTraffic._buildMinerManifest(
    miner, 6, 'cmdty_ore_iron', 8, 'ore_carrier', { rootLotId: 'continue-root-lot' },
  );
  originalTraffic._setTrafficManifest(miner, minerRec, manifest);
  const handoff = originalTraffic._requestCeresMinerHaulerHandoff({
    entity: miner, rec: minerRec, slot: minerSlot, worldRecordId: miner.data.worldRecordId,
  }, manifest);
  hauler.pos = { ...miner.pos };
  assert.equal(originalTraffic._transferCeresMinerHaulerHandoff(handoff,
    { entity: miner, rec: minerRec, worldRecordId: miner.data.worldRecordId },
    { entity: hauler, rec: haulerRec, worldRecordId: hauler.data.worldRecordId }, 0), true);
  const envelope = original.registry.get('save').serialize('handoff-continue');
  assert.equal(envelope.data.traffic.ceresMinerHaulerHandoff.handoffId, handoff.handoffId);

  const continued = createSimulation({ seed: SEED, systems });
  const arrivals = [];
  continued.bus.on('freight:arrival', (intent) => arrivals.push(intent));
  assert.equal(continued.registry.get('save').loadEnvelope(
    JSON.parse(JSON.stringify(envelope)), 'handoff-continue',
  ), true);
  continued.state.mode = 'flight';
  const restored = continued.state.traffic.ceresMinerHaulerHandoff;
  const restoredHauler = continued.state.entityList.find((entity) => entity && entity.data
    && entity.data.worldRecordId === handoff.haulerWorldRecordId);
  assert.ok(restoredHauler);
  assert.notEqual(restoredHauler.id, hauler.id, 'Continue rematerializes numeric ids');
  assert.equal(restoredHauler.data.cargoManifest.custody.handoffId, handoff.handoffId);
  const station = continued.state.entityList.find((entity) => entity && entity.data
    && entity.data.stationId === 'station_ceres');
  restoredHauler.pos = { x: station.pos.x + 72, z: station.pos.z };
  for (const entity of continued.state.entityList) {
    if (entity && entity.type === 'ship' && entity.team === 1 && entity.pos) {
      entity.pos = { x: station.pos.x + 10_000, z: station.pos.z + 10_000 };
    }
  }
  for (let i = 0; i < 18_000 && restored.state !== 'delivered'; i++) continued.step(1 / 60);
  const restoredJob = continued.helpers.npcJobs.get(`job:${handoff.haulerWorldRecordId}`);
  assert.equal(restored.state, 'delivered', JSON.stringify({
    phase: restoredJob && restoredJob.job.phase,
    progress: restoredJob && restoredJob.job.progress,
    routeIndex: restoredJob && restoredJob.job.routeIndex,
    jobId: restoredHauler.data.jobId,
    status: restoredHauler.data.ceresHandoffStatus,
    arrivals: arrivals.length,
  }));
  assert.equal(arrivals.length, 1);
  assert.equal(restored.deliveredQty, 8);
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

test('explicit HELP reserves the seam for the NPC owner and changes the resolved lot', () => {
  const { traffic, state, bus, asteroid } = bootCausalHarness({ simTime: 0 });
  const depletion = { ...fieldDepletionBase };
  depletion.init({ state, bus });
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  const { actor: miner } = actorBySlot(state, 'ceres_seam_miner');
  const open = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(open.state, 'open');

  bus.emit('contactHail:response', {
    requestId: 'contact-hail:worker:rich-help',
    targetId: miner.id,
    choice: 'help',
  });
  const reserved = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(reserved.state, 'open');
  assert.equal(reserved.reservedByKind, 'npc');
  assert.equal(reserved.reservedById, miner.id);
  assert.equal(reserved.reservedByStableId, miner.data.worldRecordId);
  assert.equal(reserved.reservedByActivityActorSlotId, 'ceres_seam_miner');
  assert.equal(reserved.reservedByJobId, miner.data.jobId);
  assert.match(richSeamTargetReadout(asteroid, state).text, /NPC HELP LOCK/);
  assert.equal(claimRichSeamOpportunity(state, {
    fieldId: asteroid.data.fieldId,
    activityObjectSlotId: asteroid.data.activityObjectSlotId,
    claimId: 'player-exploit-after-help',
    claimedByKind: 'player',
    claimedById: 1,
    resolution: 'exploit',
    simTime: state.simTime,
  }), null, 'HELP cedes the open opportunity to the named NPC miner');

  const work = applyCeresMinerWork(traffic, state, asteroid, 901);
  assert.equal(work.applied, true);
  const worked = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(worked.state, 'worked');
  assert.equal(worked.resolution, 'help');
  assert.equal(miner.data.cargoManifest.lotSource.richResolution, 'help');
  assert.equal(state.fieldDepletion.fields[asteroid.data.fieldId].extractedU, 16);
  assert.equal(applyCeresMinerWork(traffic, state, asteroid, 901).applied, false);
  assert.equal(state.fieldDepletion.fields[asteroid.data.fieldId].extractedU, 16);
  depletion.destroy();
});

test('HELP reservation survives Continue rematerialization by stable miner identity only', () => {
  const { traffic, state, bus, asteroid } = bootCausalHarness({ simTime: 0 });
  const depletion = { ...fieldDepletionBase };
  depletion.init({ state, bus });
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  const { actor: miner } = actorBySlot(state, 'ceres_seam_miner');
  bus.emit('contactHail:response', { requestId: 'stable-help', targetId: miner.id, choice: 'help' });
  const saved = depletion.serialize();

  const continuedState = { ...state, simTime: 25, fieldDepletion: {} };
  const continuedBus = createBus();
  const continuedDepletion = { ...fieldDepletionBase };
  continuedDepletion.init({ state: continuedState, bus: continuedBus });
  continuedDepletion.deserialize(saved);
  const rematerialized = { ...miner, id: 999, data: { ...miner.data } };
  continuedState.entities = new Map([...state.entities.entries()].map(([id, entity]) => [id === miner.id ? 999 : id, id === miner.id ? rematerialized : entity]));
  continuedState.entityList = [...continuedState.entities.values()];
  const open = richSeamOpportunityForEntity(continuedState, asteroid);
  assert.equal(open.reservedByStableId, miner.data.worldRecordId);
  const partialSaved = JSON.parse(JSON.stringify(saved));
  const partialOpportunity = Object.values(partialSaved.opportunities)[0];
  delete partialOpportunity.reservedByStableId;
  delete partialOpportunity.reservedByWorldRecordId;
  delete partialOpportunity.reservedByActivityActorSlotId;
  delete partialOpportunity.reservedByJobId;
  const partialState = { ...state, fieldDepletion: {} };
  const partialDepletion = { ...fieldDepletionBase };
  partialDepletion.init({ state: partialState, bus: createBus() });
  partialDepletion.deserialize(partialSaved);
  assert.equal(richSeamOpportunityForEntity(partialState, asteroid).reservationId, null,
    'partial legacy reservation fails closed instead of retaining an id-only lock');
  const resumedClaim = claimRichSeamOpportunity(continuedState, {
    fieldId: asteroid.data.fieldId,
    activityObjectSlotId: asteroid.data.activityObjectSlotId,
    claimId: 'continued-work',
    claimedByKind: 'npc',
    claimedById: rematerialized.id,
    claimedByStableId: rematerialized.data.worldRecordId,
    claimedByWorldRecordId: rematerialized.data.worldRecordId,
    claimedByActivityActorSlotId: rematerialized.data.activityActorSlotId,
    claimedByJobId: rematerialized.data.jobId,
    simTime: 25,
  });
  assert.equal(resumedClaim.state, 'worked');

  const wrongState = { ...state, fieldDepletion: JSON.parse(JSON.stringify(saved)) };
  assert.equal(claimRichSeamOpportunity(wrongState, {
    fieldId: asteroid.data.fieldId,
    activityObjectSlotId: asteroid.data.activityObjectSlotId,
    claimId: 'wrong-owner',
    claimedByKind: 'npc',
    claimedById: 1000,
    claimedByStableId: 'other-world-record',
    claimedByWorldRecordId: 'other-world-record',
    claimedByActivityActorSlotId: 'ceres_seam_miner',
    claimedByJobId: 'job:other-world-record',
    simTime: 25,
  }), null);
  continuedDepletion.destroy();
  partialDepletion.destroy();
  depletion.destroy();
});

test('reserved HELP seam resolves immediately to MISS when its stable miner dies', () => {
  const { traffic, state, bus, asteroid } = bootCausalHarness({ simTime: 0 });
  stepTo(traffic, state, 0);
  stepTo(traffic, state, 24);
  const { actor: miner } = actorBySlot(state, 'ceres_seam_miner');
  bus.emit('contactHail:response', { requestId: 'death-help', targetId: miner.id, choice: 'help' });
  assert.equal(richSeamOpportunityForEntity(state, asteroid).state, 'open');
  bus.emit('entity:killed', { id: miner.id });
  const missed = richSeamOpportunityForEntity(state, asteroid);
  assert.equal(missed.state, 'missed');
  assert.equal(missed.resolution, 'miss');
  assert.doesNotMatch(richSeamTargetReadout(asteroid, state).text, /NPC HELP LOCK/);
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
    assert.ok(Array.isArray(entry.seeds), `${entry.id} seeds array`);
    assert.ok(Array.isArray(entry.interruptSeeds) && entry.interruptSeeds.length > 0,
      `${entry.id} interruptSeeds`);
  }
  const handoff = CERES_CAUSAL_CHAIN.find((e) => e.id === 'ev_miner_calls_hauler');
  assert.deepEqual(handoff.seeds, [], 'the event phase cannot claim cargo before a physical transfer');
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
  assert.ok(
    receipts.some((r) => r.outcome === 'skip_terminal_cast' && r.eventId === 'ev_rock_calving')
      && receipts.some((r) => r.eventId === 'ev_rock_calving' && Array.isArray(r.seeded)
        && r.seeded.includes('rock_calved')),
    'calving coda should skip on terminal miner loss and still plant rock_calved',
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
  assert.equal(Object.prototype.hasOwnProperty.call(hauler.data, 'ceresCausalDisabled'), false,
    'the real incident never uses a decorative disabled flag');
  assert.equal(state.traffic.ceresDisabledHaulerIncident.manifestId,
    hauler.data.cargoManifest.manifestId);
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
  const patrolAssignments = assignments.filter((assignment) => assignment.entityId === patrol.id);
  assert.equal(patrolAssignments.length, 1, 'patrol redirect should assign once for the scan window');
  assert.equal(patrolAssignments[0].spec.kind, 'patrol');
  assert.equal(patrolAssignments[0].spec.route[1].targetRef, 'actor:ceres_refinery_hauler');
  assert.deepEqual(releases.filter((jobId) => jobId === priorJobId), [priorJobId, priorJobId]);
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
