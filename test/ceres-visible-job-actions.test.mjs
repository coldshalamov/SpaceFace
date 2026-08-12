import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
  CERES_ACTIVITY_SERVICE_SLOTS,
} from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  NPC_JOB_PHASE,
  NPC_JOB_SCHEMA,
  advance,
  createJob,
} from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { economy as economyBase } from '../src/systems/economy.js';
import { fieldDepletion as fieldDepletionBase } from '../src/systems/fieldDepletion.js';
import { traffic as trafficBase } from '../src/systems/traffic.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import { fnv1a } from '../src/save/checksum.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 47;
const TENDER_SLOT_ID = 'ceres_refinery_tender';
const SERVICE_SLOT_ID = 'ceres_cinder_service_hauler';
const ACTION_RECEIPT_EVENT = 'traffic:jobActionReceipt';
const ACTION_RECEIPT_SCHEMA = 'spaceface.trafficJobActionReceipt.v1';

const TRAFFIC_JOB_ROWS = CERES_ACTIVITY_POCKETS.flatMap((pocket) => pocket.actorSlots
  .filter((slot) => slot.id !== TENDER_SLOT_ID)
  .map((slot) => ({ pocket, slot })));
const ROW_BY_SLOT_ID = new Map(TRAFFIC_JOB_ROWS.map((row) => [row.slot.id, row]));

function primaryAction(slot) {
  if (slot.jobKind === 'hauler') return { action: 'unload', field: 'destination', waypointIndex: 1 };
  if (slot.jobKind === 'patrol') return { action: 'hold', field: 'at', waypointIndex: 1 };
  return { action: 'work', field: 'field', waypointIndex: 1 };
}

function routeFor(pocket, slot) {
  return slot.route.marks.map((mark) => ({
    id: mark.id,
    label: mark.id,
    pos: sectorLocalToGlobalForSector({
      x: pocket.activityAnchor.localPos.x + mark.offset.x,
      z: pocket.activityAnchor.localPos.z + mark.offset.z,
    }, CERES_ACTIVITY_SECTOR_ID),
    targetRef: mark.targetRef,
  }));
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

function bootActionHarness() {
  const station = makeEntity(10, 'station', { stationId: 'station_ceres' });
  const asteroid = makeEntity(38, 'asteroid', {
    activityObjectSlotId: 'ceres_seam_ore_clast',
    fieldId: 'f_ceres_1',
    typeId: 'ast_metallic',
    yieldU: 18,
    oreHP: 40,
  });
  const siteRoot = makeEntity(39, 'fx', {
    worldRecordId: 'world_site_wreck_cathedral/root',
  });
  const cargoPod = makeEntity(40, 'fx', {
    activityObjectSlotId: 'ceres_refinery_cargo_pod',
  });
  const graveShard = makeEntity(41, 'fx', {
    activityObjectSlotId: 'ceres_cathedral_grave_shard',
  });
  const baseEntities = [station, asteroid, siteRoot, cargoPod, graveShard];
  const state = {
    mode: 'flight',
    tick: 120,
    simTime: 45,
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
    economy: { markets: {} },
    traffic: {
      freighters: [],
      appliedArrivalIds: [],
      appliedLossIds: [],
      appliedMinerWorkIds: [],
      appliedJobActionIds: [],
      rngSeed: 0x12345678,
    },
  };
  const jobs = Object.create(null);
  const actorBySlotId = new Map();
  let actorId = 100;
  for (const { pocket, slot } of TRAFFIC_JOB_ROWS) {
    const worldRecordId = stableRecordId(
      SEED,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      slot.worldRecordSlotId,
    );
    const jobId = `job:${worldRecordId}`;
    const manifest = slot.id === 'ceres_refinery_hauler'
      ? {
          manifestId: 'manifest_refinery_seed47',
          lines: [{ commodityId: 'cmdty_ore_iron', qty: 8 }],
          totalQty: 8,
        }
      : null;
    const activityRunSeq = slot.jobKind === 'hauler' ? 0 : null;
    const payload = slot.jobKind === 'hauler'
      ? {
          activityRunSeq,
          ...(manifest ? { manifest } : {}),
        }
      : null;
    const entity = makeEntity(actorId++, 'ship', {
      worldRecordId,
      jobId,
      activityActorSlotId: slot.id,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: slot.presentationRole,
      freightDockSeq: activityRunSeq || 0,
      ...(manifest ? { cargoManifest: manifest } : {}),
    });
    const route = routeFor(pocket, slot);
    const speed = Math.hypot(
      route[1].pos.x - route[0].pos.x,
      route[1].pos.z - route[0].pos.z,
    ) / slot.route.durationS;
    const primary = primaryAction(slot);
    jobs[jobId] = {
      job: {
        schema: NPC_JOB_SCHEMA,
        id: jobId,
        kind: slot.jobKind,
        phase: primary.action,
        routeIndex: primary.waypointIndex,
        progress: 1,
        sequence: 0,
        simTime: state.simTime,
        materialized: true,
        corrupt: false,
        speed,
        route,
        payload,
      },
      kind: slot.jobKind,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      worldRecordId,
      entityId: entity.id,
    };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    state.traffic.freighters.push({
      id: entity.id,
      role: slot.presentationRole,
      dockSeq: activityRunSeq || 0,
      manifest,
      activityActorSlotId: slot.id,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      worldRecordId,
    });
    actorBySlotId.set(slot.id, entity);
  }

  const bus = createBus();
  const emitted = [];
  for (const name of [
    ACTION_RECEIPT_EVENT,
    'mining:npcExtraction',
    'field:depletedChanged',
    'freight:arrival',
    'aiTrader:requestTrade',
  ]) {
    bus.on(name, (payload) => emitted.push({ name, payload }));
  }
  const helpers = {
    npcJobs: {
      get(jobId) { return jobs[jobId] || null; },
      list() { return Object.values(jobs); },
    },
  };
  const system = Object.create(trafficBase);
  system.init({ state, bus, helpers, registry: { get() { return null; } } });
  const fieldDepletion = Object.create(fieldDepletionBase);
  fieldDepletion.init({ state, bus });

  return {
    state,
    bus,
    system,
    fieldDepletion,
    jobs,
    actorBySlotId,
    targets: { station, asteroid, siteRoot, cargoPod, graveShard },
    emitted,
    events(name) { return emitted.filter((entry) => entry.name === name).map((entry) => entry.payload); },
  };
}

function primaryIntent(harness, slotId, { seq = 11, payload = undefined } = {}) {
  const { slot } = ROW_BY_SLOT_ID.get(slotId);
  const actor = harness.actorBySlotId.get(slotId);
  const entry = harness.jobs[actor.data.jobId];
  const primary = primaryAction(slot);
  const waypoint = entry.job.route[primary.waypointIndex];
  entry.job.schema = NPC_JOB_SCHEMA;
  entry.job.phase = primary.action;
  entry.job.routeIndex = primary.waypointIndex;
  entry.job.progress = 1;
  entry.job.sequence = seq;
  entry.job.materialized = true;
  entry.job.corrupt = false;
  const intent = {
    jobId: actor.data.jobId,
    kind: slot.jobKind,
    seq,
    simTime: harness.state.simTime,
    phase: primary.action,
    waypointId: waypoint.id,
    completed: true,
    [primary.field]: waypoint.id,
  };
  if (slot.jobKind === 'hauler') {
    intent.payload = payload === undefined
      ? JSON.parse(JSON.stringify(entry.job.payload))
      : payload;
  }
  const rec = harness.state.traffic.freighters.find((row) => row && row.id === actor.id);
  return { action: primary.action, intent, waypoint, actor, entry, rec };
}

function emitPrimary(harness, slotId, options = {}) {
  const primary = primaryIntent(harness, slotId, options);
  harness.bus.emit(`npcjobs:${primary.action}`, primary.intent);
  return primary;
}

function stepUntil(sim, predicate, maxSteps = 120) {
  for (let step = 0; step < maxSteps && !predicate(); step++) sim.step(1);
  return predicate();
}

function activityWorldRecordId(slot) {
  return stableRecordId(
    SEED,
    CERES_ACTIVITY_SECTOR_ID,
    RECORD_KIND.CONVOY,
    slot.worldRecordSlotId,
  );
}

function activityJobId(slot) {
  return `job:${activityWorldRecordId(slot)}`;
}

function withoutTargetRefs(route) {
  return route.map((waypoint) => {
    const copy = { ...waypoint, pos: { ...waypoint.pos } };
    delete copy.targetRef;
    return copy;
  });
}

test('Ceres declares exactly seven traffic-owned stable action jobs; tender and service stay outside', () => {
  assert.equal(TRAFFIC_JOB_ROWS.length, 7);
  assert.deepEqual(TRAFFIC_JOB_ROWS.map(({ slot }) => slot.id), [
    'ceres_refinery_hauler',
    'ceres_seam_miner',
    'ceres_seam_surveyor',
    'ceres_ambush_loaded_hauler',
    'ceres_ambush_escort',
    'ceres_cathedral_salvor',
    'ceres_cathedral_patrol',
  ]);
  assert.equal(TRAFFIC_JOB_ROWS.some(({ slot }) => slot.id === TENDER_SLOT_ID), false,
    'the factionPresence tender is explicitly not traffic-owned');
  assert.equal(CERES_ACTIVITY_SERVICE_SLOTS.length, 1);
  assert.equal(CERES_ACTIVITY_SERVICE_SLOTS[0].id, SERVICE_SLOT_ID);
  assert.equal(CERES_ACTIVITY_SERVICE_SLOTS[0].jobKind, null, 'the Cinder service remains jobless');
  for (const { slot } of TRAFFIC_JOB_ROWS) {
    const primary = primaryAction(slot);
    const targetRef = slot.route.marks[primary.waypointIndex].targetRef;
    assert.match(targetRef, /^[a-z][a-z0-9-]*(?::[a-z_][a-z0-9_.-]*)+$/,
      `${slot.id} primary action uses a stable symbolic ref`);
    assert.doesNotMatch(targetRef, /<|>|\s|:\d+(?::|$)/);
  }
});

test('legacy canonical Ceres routes adopt all seven stable refs without changing job state', () => {
  const harness = bootActionHarness();
  const preserved = new Map();
  for (const { pocket, slot } of TRAFFIC_JOB_ROWS) {
    const jobId = activityJobId(slot);
    const entry = harness.jobs[jobId];
    const canonicalRoute = routeFor(pocket, slot);
    const jobWithoutRoute = { ...entry.job };
    delete jobWithoutRoute.route;
    preserved.set(slot.id, {
      entry,
      jobWithoutRoute: JSON.parse(JSON.stringify(jobWithoutRoute)),
      legacyRoute: withoutTargetRefs(entry.job.route),
      canonicalRoute,
    });
    entry.job.route = withoutTargetRefs(entry.job.route);
  }

  harness.bus.emit('save:loaded', { slot: 'legacy-r5-target-ref-adoption' });

  for (const { slot } of TRAFFIC_JOB_ROWS) {
    const snapshot = preserved.get(slot.id);
    assert.strictEqual(harness.jobs[activityJobId(slot)], snapshot.entry,
      `${slot.id} retains the exact live wrapper`);
    assert.deepEqual(snapshot.entry.job.route, snapshot.canonicalRoute,
      `${slot.id} adopts only the authored stable refs`);
    const jobWithoutRoute = { ...snapshot.entry.job };
    delete jobWithoutRoute.route;
    assert.deepEqual(jobWithoutRoute, snapshot.jobWithoutRoute,
      `${slot.id} preserves phase/progress/sequence/clocks/payload/materialization`);
  }

  const adoptedRoutes = new Map(TRAFFIC_JOB_ROWS.map(({ slot }) => [
    slot.id,
    harness.jobs[activityJobId(slot)].job.route,
  ]));
  harness.bus.emit('save:loaded', { slot: 'already-current-target-ref-noop' });
  for (const { slot } of TRAFFIC_JOB_ROWS) {
    assert.strictEqual(harness.jobs[activityJobId(slot)].job.route, adoptedRoutes.get(slot.id),
      `${slot.id} already-current route is a strict no-op`);
  }

  const cyclicSlots = TRAFFIC_JOB_ROWS
    .map(({ slot }) => slot)
    .filter((slot) => slot.jobKind !== 'hauler');
  for (let index = 0; index < cyclicSlots.length; index++) {
    emitPrimary(harness, cyclicSlots[index].id, { seq: 70 + index });
  }
  assert.deepEqual(
    harness.events(ACTION_RECEIPT_EVENT).map((receipt) => receipt.actorSlotId),
    cyclicSlots.map((slot) => slot.id),
    'all five cyclic legacy jobs resume causal receipts after adoption',
  );
  assert.equal(harness.events('mining:npcExtraction').length, 1,
    'the adopted miner still bridges through the existing extraction owner');
});

test('legacy ref adoption recognizes a virtual Ceres job outside the sector without actor scans', () => {
  const harness = bootActionHarness();
  const { pocket, slot } = ROW_BY_SLOT_ID.get('ceres_cathedral_patrol');
  const jobId = activityJobId(slot);
  const entry = harness.jobs[jobId];
  const actor = harness.actorBySlotId.get(slot.id);
  entry.job.route = withoutTargetRefs(entry.job.route);
  entry.job.materialized = false;
  entry.entityId = null;
  harness.state.world.currentSectorId = 'sector_helios_prime';
  harness.state.entities.delete(actor.id);
  harness.state.entityList = harness.state.entityList.filter((entity) => entity !== actor);
  harness.state.traffic.freighters = harness.state.traffic.freighters
    .filter((record) => record.activityActorSlotId !== slot.id);

  harness.bus.emit('save:loaded', { slot: 'legacy-virtual-canonical-job' });

  assert.deepEqual(entry.job.route, routeFor(pocket, slot));
  assert.equal(entry.job.materialized, false);
  assert.equal(entry.entityId, null);
  assert.equal(harness.state.world.currentSectorId, 'sector_helios_prime');
});

test('legacy Ceres ref adoption rejects partial, mismatched, malformed, and non-authored routes', () => {
  const harness = bootActionHarness();
  const bySlot = (slotId) => {
    const { slot } = ROW_BY_SLOT_ID.get(slotId);
    return harness.jobs[activityJobId(slot)].job.route;
  };

  delete bySlot('ceres_refinery_hauler')[1].targetRef;

  const minerRoute = bySlot('ceres_seam_miner');
  for (const waypoint of minerRoute) delete waypoint.targetRef;
  minerRoute[1].pos.x += 0.25;

  const surveyRoute = bySlot('ceres_seam_surveyor');
  for (const waypoint of surveyRoute) delete waypoint.targetRef;
  surveyRoute[1].label = 'not-the-authored-mark';

  const ambushHaulerRoute = bySlot('ceres_ambush_loaded_hauler');
  for (const waypoint of ambushHaulerRoute) delete waypoint.targetRef;
  ambushHaulerRoute[1].id = 'not-the-authored-waypoint';

  const escortRoute = bySlot('ceres_ambush_escort');
  for (const waypoint of escortRoute) delete waypoint.targetRef;
  harness.jobs[activityJobId(ROW_BY_SLOT_ID.get('ceres_ambush_escort').slot)].sectorId = 'sector_helios_prime';

  const salvor = harness.jobs[activityJobId(ROW_BY_SLOT_ID.get('ceres_cathedral_salvor').slot)];
  salvor.job.route = withoutTargetRefs(salvor.job.route).slice(0, 1);

  const patrol = harness.jobs[activityJobId(ROW_BY_SLOT_ID.get('ceres_cathedral_patrol').slot)];
  patrol.job.route = withoutTargetRefs(patrol.job.route);
  patrol.job.speed += 1;

  const ordinaryRoute = withoutTargetRefs(routeFor(
    ROW_BY_SLOT_ID.get('ceres_cathedral_patrol').pocket,
    ROW_BY_SLOT_ID.get('ceres_cathedral_patrol').slot,
  ));
  harness.jobs['job:ordinary-target-ref-free'] = {
    job: {
      ...harness.jobs[activityJobId(ROW_BY_SLOT_ID.get('ceres_cathedral_patrol').slot)].job,
      id: 'job:ordinary-target-ref-free',
      route: ordinaryRoute,
    },
    kind: 'patrol',
    sectorId: 'sector_helios_prime',
    worldRecordId: 'ordinary-target-ref-free',
    entityId: null,
  };

  const invalidSnapshots = new Map([
    ['ceres_refinery_hauler', JSON.parse(JSON.stringify(bySlot('ceres_refinery_hauler')))],
    ['ceres_seam_miner', JSON.parse(JSON.stringify(minerRoute))],
    ['ceres_seam_surveyor', JSON.parse(JSON.stringify(surveyRoute))],
    ['ceres_ambush_loaded_hauler', JSON.parse(JSON.stringify(ambushHaulerRoute))],
    ['ceres_ambush_escort', JSON.parse(JSON.stringify(escortRoute))],
    ['ceres_cathedral_salvor', JSON.parse(JSON.stringify(salvor.job.route))],
    ['ceres_cathedral_patrol', JSON.parse(JSON.stringify(patrol.job.route))],
  ]);

  harness.bus.emit('save:loaded', { slot: 'legacy-r5-rejection-matrix' });

  for (const [slotId, snapshot] of invalidSnapshots) {
    assert.deepEqual(bySlot(slotId), snapshot, `${slotId} invalid legacy shape remains untouched`);
  }
  assert.deepEqual(harness.jobs['job:ordinary-target-ref-free'].job.route, ordinaryRoute,
    'an ordinary targetRef-free non-Ceres route is never adopted by resemblance');
});

test('real pre-patch save/Continue adopts canonical refs and resumes the miner owner bridge', () => {
  const sim = createSimulation({
    seed: SEED,
    systems: [world, npcJobsRuntime, trafficBase, fieldDepletionBase, save],
  });
  try {
    sim.state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
    });
    sim.state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID);
    for (let step = 0; step < 4; step++) sim.step(1);

    const ordinary = sim.spawn({
      type: 'ship', team: 2, pos: { x: 900, z: 900 }, vel: { x: 0, z: 0 },
      hull: 100, hullMax: 100, radius: 5,
      data: { worldRecordId: 'ordinary-target-ref-free' },
    });
    const ordinaryRoute = [
      { id: 'ordinary-a', label: 'Ordinary A', pos: { x: 900, z: 900 } },
      { id: 'ordinary-b', label: 'Ordinary B', pos: { x: 950, z: 900 } },
    ];
    const ordinaryJobId = sim.helpers.npcJobs.assign(ordinary, {
      kind: 'patrol',
      sectorId: 'sector_helios_prime',
      route: ordinaryRoute,
    });
    assert.equal(ordinaryJobId, 'job:ordinary-target-ref-free');

    const patrolSlot = ROW_BY_SLOT_ID.get('ceres_cathedral_patrol').slot;
    const patrolEntry = sim.helpers.npcJobs.get(activityJobId(patrolSlot));
    Object.assign(patrolEntry.job, {
      phase: NPC_JOB_PHASE.HOLD,
      routeIndex: 1,
      progress: 0.375,
      loopCount: 2,
      sequence: 37,
      simTime: 41.25,
      heading: 1.125,
    });

    const saveSystem = sim.registry.get('save');
    const envelope = saveSystem.serialize('r6a-legacy-target-refs');
    const prePatchChecksum = envelope.checksum;
    assert.match(prePatchChecksum, /^[0-9a-f]{8}$/);
    const preserved = new Map();
    for (const { pocket, slot } of TRAFFIC_JOB_ROWS) {
      const jobId = activityJobId(slot);
      const saved = envelope.data.npcJobs.byId[jobId];
      assert.ok(saved, `${slot.id} is present in the pre-patch envelope`);
      const jobWithoutRoute = JSON.parse(JSON.stringify(saved.job));
      delete jobWithoutRoute.route;
      preserved.set(slot.id, {
        jobWithoutRoute,
        entry: {
          kind: saved.kind,
          sectorId: saved.sectorId,
          worldRecordId: saved.worldRecordId,
          lastAdvanceSimT: saved.lastAdvanceSimT,
        },
        canonicalRoute: routeFor(pocket, slot),
      });
      saved.job.route = withoutTargetRefs(saved.job.route);
      assert.equal(saved.job.route.some((waypoint) => Object.hasOwn(waypoint, 'targetRef')), false);
    }
    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'r6a-legacy-target-refs-stale-checksum',
    ), false, 'the pre-mutation checksum rejects the changed legacy fixture');
    envelope.checksum = fnv1a(JSON.stringify(envelope.data));
    assert.match(envelope.checksum, /^[0-9a-f]{8}$/);
    assert.notEqual(envelope.checksum, prePatchChecksum);
    const ordinarySavedRouteJSON = JSON.stringify(envelope.data.npcJobs.byId[ordinaryJobId].job.route);

    const mining = [];
    const receipts = [];
    sim.bus.on('mining:npcExtraction', (payload) => mining.push({ ...payload }));
    sim.bus.on(ACTION_RECEIPT_EVENT, (payload) => receipts.push({ ...payload }));
    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'r6a-legacy-target-refs',
    ), true);

    for (const { slot } of TRAFFIC_JOB_ROWS) {
      const entry = sim.helpers.npcJobs.get(activityJobId(slot));
      const expected = preserved.get(slot.id);
      assert.ok(entry, `${slot.id} survives Continue under its stable job id`);
      assert.deepEqual(entry.job.route, expected.canonicalRoute, `${slot.id} refs are adopted`);
      const jobWithoutRoute = JSON.parse(JSON.stringify(entry.job));
      delete jobWithoutRoute.route;
      assert.deepEqual(jobWithoutRoute, expected.jobWithoutRoute,
        `${slot.id} preserves every non-route kernel field`);
      assert.deepEqual({
        kind: entry.kind,
        sectorId: entry.sectorId,
        worldRecordId: entry.worldRecordId,
        lastAdvanceSimT: entry.lastAdvanceSimT,
      }, expected.entry, `${slot.id} preserves runtime clocks and stable identity`);
    }
    assert.equal(JSON.stringify(sim.helpers.npcJobs.get(ordinaryJobId).job.route), ordinarySavedRouteJSON,
      'Continue leaves an ordinary targetRef-free non-Ceres route byte/shape compatible');

    assert.equal(stepUntil(
      sim,
      () => receipts.some((receipt) => receipt.actorSlotId === 'ceres_seam_miner'),
      180,
    ), true, 'the adopted real miner reaches a legitimate visible completion');
    assert.equal(mining.length, 1);
    assert.equal(sim.state.fieldDepletion.fields.f_ceres_1.extractedU, 16,
      'the field owner consumes the adopted rich-seam completion once');
  } finally {
    sim.dispose();
  }
});

test('seed 47 miner extraction and refinery freight use existing owners and dedupe duplicate delivery', () => {
  const harness = bootActionHarness();

  const miner = emitPrimary(harness, 'ceres_seam_miner', { seq: 17 });
  assert.equal(harness.events('mining:npcExtraction').length, 1);
  assert.equal(harness.events('mining:npcExtraction')[0].asteroidId, harness.targets.asteroid.id);
  assert.equal(harness.state.fieldDepletion.fields.f_ceres_1.extractedU, 8,
    'the existing field-depletion owner consumes the miner extraction');
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 1);
  harness.bus.emit(`npcjobs:${miner.action}`, miner.intent);
  assert.equal(harness.events('mining:npcExtraction').length, 1, 'duplicate miner delivery has one effect');
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 1, 'duplicate miner delivery has one receipt');

  const hauler = emitPrimary(harness, 'ceres_refinery_hauler', { seq: 23 });
  assert.equal(harness.events('freight:arrival').length, 1);
  assert.equal(harness.events('aiTrader:requestTrade').length, 1);
  assert.equal(harness.events('freight:arrival')[0].stationId, 'station_ceres');
  harness.bus.emit(`npcjobs:${hauler.action}`, hauler.intent);
  assert.equal(harness.events('freight:arrival').length, 1, 'duplicate refinery unload has one freight effect');
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 2, 'duplicate refinery unload has one action receipt');

  const receipts = harness.events(ACTION_RECEIPT_EVENT);
  assert.equal(receipts.every((receipt) => receipt.schema === ACTION_RECEIPT_SCHEMA), true);
  assert.deepEqual(receipts.map((receipt) => receipt.actorSlotId), [
    'ceres_seam_miner',
    'ceres_refinery_hauler',
  ]);
  assert.equal(receipts[0].effectType, 'mining:npcExtraction');
  assert.equal(receipts[1].effectType, 'freight:arrival');
});

test('owner identities reserve before reentry and reject post-emit authority changes', () => {
  const minerHarness = bootActionHarness();
  const miner = primaryIntent(minerHarness, 'ceres_seam_miner', { seq: 41 });
  const authenticatedActorId = miner.actor.id;
  const authenticatedSimTime = miner.entry.job.simTime;
  let minerReentered = false;
  let minerReservation = null;
  minerHarness.bus.on('mining:npcExtraction', () => {
    if (minerReentered) return;
    minerReentered = true;
    minerReservation = {
      action: minerHarness.system._pendingJobActionIds.size,
      effect: minerHarness.system._pendingMinerWorkIds.size,
    };
    minerHarness.bus.emit('npcjobs:work', miner.intent);
    miner.actor.id = 999_001;
    miner.entry.job.simTime = authenticatedSimTime + 99;
  });
  minerHarness.bus.emit('npcjobs:work', miner.intent);
  assert.deepEqual(minerReservation, { action: 1, effect: 1 },
    'action and effect identities are reserved before the mining owner runs');
  assert.equal(minerHarness.events('mining:npcExtraction').length, 1);
  assert.equal(minerHarness.events(ACTION_RECEIPT_EVENT).length, 0,
    'mutated live actor/job authority suppresses the obsolete post-owner receipt');
  assert.equal(minerHarness.state.traffic.appliedMinerWorkIds.length, 0,
    'the obsolete completion cannot commit its effect identity');
  assert.deepEqual([
    minerHarness.system._pendingJobActionIds.size,
    minerHarness.system._pendingMinerWorkIds.size,
  ], [0, 0]);

  miner.actor.id = authenticatedActorId;
  miner.entry.job.simTime = authenticatedSimTime;
  minerHarness.state.fieldDepletion.fields = {};
  minerHarness.bus.emit('npcjobs:work', miner.intent);
  assert.equal(minerHarness.events('mining:npcExtraction').length, 2,
    'after authoritative owner rewind, the same completion may retry once');
  assert.equal(minerHarness.events(ACTION_RECEIPT_EVENT).length, 1);
  assert.equal(minerHarness.events(ACTION_RECEIPT_EVENT)[0].actorId, authenticatedActorId);
  assert.equal(minerHarness.events(ACTION_RECEIPT_EVENT)[0].simTime, authenticatedSimTime);
  assert.equal(new Set(minerHarness.state.traffic.appliedMinerWorkIds).size, 1);

  const freightHarness = bootActionHarness();
  const freight = primaryIntent(freightHarness, 'ceres_refinery_hauler', { seq: 43 });
  let freightReentered = false;
  let freightReservation = null;
  freightHarness.bus.on('freight:arrival', () => {
    if (freightReentered) return;
    freightReentered = true;
    freightReservation = {
      action: freightHarness.system._pendingJobActionIds.size,
      effect: freightHarness.system._pendingArrivalIds.size,
    };
    freightHarness.bus.emit('npcjobs:unload', freight.intent);
  });
  freightHarness.bus.emit('npcjobs:unload', freight.intent);
  assert.deepEqual(freightReservation, { action: 1, effect: 1 },
    'action and effect identities are reserved before the freight owner runs');
  assert.equal(freightHarness.events('freight:arrival').length, 1);
  assert.equal(freightHarness.events(ACTION_RECEIPT_EVENT).length, 1);
  assert.equal(new Set(freightHarness.state.traffic.appliedArrivalIds).size, 1);
});

test('the action identity is committed before a receipt listener can re-enter the completion', () => {
  const harness = bootActionHarness();
  const primary = primaryIntent(harness, 'ceres_seam_surveyor', { seq: 47 });
  let observed = null;
  harness.bus.on(ACTION_RECEIPT_EVENT, (receipt) => {
    if (receipt.actorSlotId !== 'ceres_seam_surveyor' || observed) return;
    observed = {
      applied: harness.state.traffic.appliedJobActionIds.includes(receipt.receiptId),
      pending: harness.system._pendingJobActionIds.has(receipt.receiptId),
    };
    harness.bus.emit('npcjobs:work', primary.intent);
  });

  harness.bus.emit('npcjobs:work', primary.intent);

  assert.deepEqual(observed, { applied: true, pending: true });
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 1,
    'receipt callback re-entry cannot publish the same action twice');
});

test('Ceres action events authenticate the exact current kernel completion and job-owned payload', async (t) => {
  const rejected = [
    ['stale sequence', 'ceres_seam_miner', (primary) => { primary.intent.seq -= 1; }],
    ['stale completion time', 'ceres_seam_miner', (primary) => { primary.intent.simTime -= 1; }],
    ['premature phase progress', 'ceres_seam_miner', (primary) => { primary.entry.job.progress = 0.999; }],
    ['wrong live phase', 'ceres_seam_miner', (primary) => { primary.entry.job.phase = NPC_JOB_PHASE.APPROACH; }],
    ['alternate route waypoint', (primary) => {
      primary.intent.at = primary.entry.job.route[0].id;
      primary.intent.waypointId = primary.entry.job.route[0].id;
    }, 'ceres_cathedral_patrol'],
    ['mismatched waypoint identity', 'ceres_cathedral_patrol', (primary) => {
      primary.intent.waypointId = primary.entry.job.route[0].id;
    }],
    ['malformed job schema', 'ceres_seam_miner', (primary) => { primary.entry.job.schema = 'npc_jobs_bogus'; }],
    ['corrupt live job', 'ceres_seam_miner', (primary) => { primary.entry.job.corrupt = true; }],
    ['virtual job', 'ceres_seam_miner', (primary) => { primary.entry.job.materialized = false; }],
    ['corrupt Ceres actor cannot fall through with a legacy numeric field target', 'ceres_seam_miner', (primary) => {
      primary.actor.data.sectorId = 'sector_elsewhere';
      primary.intent.field = `field:${primary.actor.id === 38 ? 39 : 38}`;
      primary.intent.waypointId = primary.intent.field;
    }],
    ['traffic record identity mismatch', 'ceres_seam_miner', (primary) => {
      primary.rec.worldRecordId = 'wr_wrong_owner';
    }],
    ['mutated activity route position', 'ceres_seam_surveyor', (primary) => {
      primary.entry.job.route[primary.entry.job.routeIndex].pos.x += 1;
    }],
  ];
  for (const row of rejected) {
    const [label, first, second] = row;
    const slotId = typeof first === 'string' ? first : second;
    const mutate = typeof first === 'function' ? first : second;
    await t.test(label, () => {
      const harness = bootActionHarness();
      const primary = primaryIntent(harness, slotId, { seq: 71 });
      mutate(primary);
      harness.bus.emit(`npcjobs:${primary.action}`, primary.intent);
      assert.equal(harness.events('mining:npcExtraction').length, 0);
      assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);
    });
  }

  await t.test('event payload substitution cannot replace the authoritative hauler run or manifest', () => {
    const harness = bootActionHarness();
    const entry = harness.jobs[harness.actorBySlotId.get('ceres_refinery_hauler').data.jobId];
    const authoritativeManifest = JSON.parse(JSON.stringify(entry.job.payload.manifest));
    const primary = primaryIntent(harness, 'ceres_refinery_hauler', {
      seq: 73,
      payload: {
        activityRunSeq: 999,
        manifest: {
          manifestId: 'injected',
          lines: [{ commodityId: 'cmdty_illicit_artifacts', qty: 999 }],
          totalQty: 999,
        },
      },
    });
    harness.bus.emit('npcjobs:unload', primary.intent);
    assert.equal(harness.events('freight:arrival').length, 0,
      'a substituted event payload is not an authenticated kernel completion');
    assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);

    primary.intent.payload = JSON.parse(JSON.stringify(entry.job.payload));
    harness.bus.emit('npcjobs:unload', primary.intent);
    assert.equal(harness.events('freight:arrival').length, 1);
    const arrival = harness.events('freight:arrival')[0];
    assert.equal(arrival.manifestId, authoritativeManifest.manifestId);
    assert.equal(harness.events('aiTrader:requestTrade')[0].commodityId,
      authoritativeManifest.lines[0].commodityId);
    assert.equal(harness.events(ACTION_RECEIPT_EVENT)[0].sequence, 0,
      'the job-owned durable run token remains authoritative');
  });

  const malformedManifests = [
    ['missing line identity and quantity', { lines: [{}], totalQty: 0 }],
    ['unstable commodity identity', { lines: [{ commodityId: 'cmdty ore', qty: 8 }], totalQty: 8 }],
    ['non-positive line quantity', { lines: [{ commodityId: 'cmdty_ore_iron', qty: 0 }], totalQty: 0 }],
    ['fractional line quantity', { lines: [{ commodityId: 'cmdty_ore_iron', qty: 1.5 }], totalQty: 1.5 }],
    ['inconsistent total quantity', { lines: [{ commodityId: 'cmdty_ore_iron', qty: 8 }], totalQty: 9 }],
  ];
  for (const [label, manifest] of malformedManifests) {
    await t.test(`malformed authoritative manifest: ${label}`, () => {
      const harness = bootActionHarness();
      const primary = primaryIntent(harness, 'ceres_refinery_hauler', { seq: 74 });
      const malformedPayload = {
        activityRunSeq: primary.entry.job.payload.activityRunSeq,
        manifest: { manifestId: 'manifest_malformed', ...manifest },
      };
      primary.entry.job.payload = JSON.parse(JSON.stringify(malformedPayload));
      primary.intent.payload = JSON.parse(JSON.stringify(malformedPayload));
      harness.bus.emit('npcjobs:unload', primary.intent);
      assert.equal(harness.events('freight:arrival').length, 0);
      assert.equal(harness.events('aiTrader:requestTrade').length, 0);
      assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);
    });
  }
});

test('a failed owner effect rolls back its provisional action reservation for a valid retry', () => {
  const harness = bootActionHarness();
  const primary = primaryIntent(harness, 'ceres_seam_miner', { seq: 79 });
  const setTrafficManifest = harness.system._setTrafficManifest;
  let rejectedAfterReservation = false;
  harness.system._setTrafficManifest = function rejectOnce(...args) {
    if (!rejectedAfterReservation) {
      rejectedAfterReservation = true;
      assert.equal(this._pendingJobActionIds.size, 1);
      assert.equal(this._pendingMinerWorkIds.size, 1,
        'the effect identity is reserved before the failing owner seam');
      return false;
    }
    return setTrafficManifest.call(this, ...args);
  };

  harness.bus.emit('npcjobs:work', primary.intent);
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);
  assert.equal(harness.state.traffic.appliedJobActionIds.length, 0,
    'failed effect leaves no provisional action identity behind');
  assert.equal(harness.system._pendingJobActionIds.size, 0);
  assert.equal(harness.system._pendingMinerWorkIds.size, 0,
    'failure removes only the provisional effect reservation');

  harness.bus.emit('npcjobs:work', primary.intent);
  assert.equal(harness.events('mining:npcExtraction').length, 1);
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 1,
    'the same authenticated completion can succeed after the owner ledger is reconciled');
});

test('private Ceres ledger indexes stay bounded with their public ledgers and newGame clears reservations', () => {
  const harness = bootActionHarness();
  for (let index = 0; index < 513; index++) {
    const id = `stale-ceres-work:${index}`;
    harness.system._committedCeresMinerWorkIds.add(id);
  }
  harness.state.traffic.appliedMinerWorkIds = Array.from(
    { length: 512 },
    (_, index) => `generic-work:${index}`,
  );

  emitPrimary(harness, 'ceres_seam_miner', { seq: 81 });

  assert.equal(harness.state.traffic.appliedMinerWorkIds.length, 512);
  assert.deepEqual(
    [...harness.system._committedCeresMinerWorkIds],
    harness.state.traffic.appliedMinerWorkIds.filter((id) => id.startsWith('npc-miner-work:')),
    'the private rewind index cannot retain IDs evicted from the capped public ledger',
  );

  harness.system._pendingJobActionIds.add('pending-action');
  harness.system._pendingMinerWorkIds.add('pending-miner');
  harness.system._pendingArrivalIds.add('pending-arrival');
  harness.system._committedCeresArrivalIds.add('committed-arrival');
  harness.system.newGame();
  assert.deepEqual([
    harness.system._pendingJobActionIds.size,
    harness.system._pendingMinerWorkIds.size,
    harness.system._pendingArrivalIds.size,
    harness.system._committedCeresMinerWorkIds.size,
    harness.system._committedCeresArrivalIds.size,
  ], [0, 0, 0, 0, 0]);
});

test('obsolete epoch cleanup cannot erase a same-ID successor reservation', () => {
  const harness = bootActionHarness();
  const id = 'ceres-job-action:job:stable:work:1:field:slot:stable';
  const oldToken = harness.system._reserveCausalId(
    id,
    '_pendingJobActionIds',
    '_pendingJobActionTokens',
  );
  const oldEpoch = harness.system._causalRunEpoch;
  assert.ok(oldToken);

  harness.bus.emit('save:restoring', { slot: 'epoch-token-test' });
  assert.equal(harness.system._causalRunEpoch > oldEpoch, true);
  assert.equal(harness.system._pendingJobActionIds.has(id), false);
  const successorToken = harness.system._reserveCausalId(
    id,
    '_pendingJobActionIds',
    '_pendingJobActionTokens',
  );
  assert.ok(successorToken);
  assert.equal(harness.system._releaseCausalReservation(
    oldToken,
    '_pendingJobActionIds',
    '_pendingJobActionTokens',
  ), false, 'the obsolete token has no authority over the successor reservation');
  assert.equal(harness.system._pendingJobActionIds.has(id), true);
  assert.equal(harness.system._pendingJobActionTokens.get(id), successorToken);

  const pairedEpoch = harness.system._causalRunEpoch;
  harness.bus.emit('save:loaded', { slot: 'epoch-token-test' });
  assert.equal(harness.system._causalRunEpoch, pairedEpoch,
    'paired save:loaded does not invalidate the successor epoch a second time');
  assert.equal(harness.system._pendingJobActionIds.has(id), true,
    'paired completion leaves a deliberately successor-owned reservation intact');

  const standaloneToken = harness.system._reserveCausalId(
    `${id}:standalone`,
    '_pendingJobActionIds',
    '_pendingJobActionTokens',
  );
  assert.ok(standaloneToken);
  harness.system._releaseCausalReservation(
    successorToken,
    '_pendingJobActionIds',
    '_pendingJobActionTokens',
  );
  const standaloneEpoch = harness.system._causalRunEpoch;
  harness.bus.emit('save:loaded', { slot: 'standalone-compat-signal' });
  assert.equal(harness.system._causalRunEpoch > standaloneEpoch, true,
    'standalone save:loaded remains a fail-closed authority boundary');
  assert.equal(harness.system._pendingJobActionIds.size, 0);
});

test('all seven traffic jobs emit one detached typed receipt from their canonical primary action', () => {
  const harness = bootActionHarness();
  for (let index = 0; index < TRAFFIC_JOB_ROWS.length; index++) {
    emitPrimary(harness, TRAFFIC_JOB_ROWS[index].slot.id, { seq: 30 + index });
  }

  const receipts = harness.events(ACTION_RECEIPT_EVENT);
  assert.equal(receipts.length, 7);
  assert.deepEqual(receipts.map((receipt) => receipt.actorSlotId),
    TRAFFIC_JOB_ROWS.map(({ slot }) => slot.id));
  assert.equal(new Set(receipts.map((receipt) => receipt.receiptId)).size, 7);
  assert.equal(receipts.some((receipt) => receipt.actorSlotId === TENDER_SLOT_ID), false);
  assert.equal(receipts.some((receipt) => receipt.actorSlotId === SERVICE_SLOT_ID), false);
  assert.equal(harness.events('mining:npcExtraction').length, 1,
    'only the exact seam miner bridges to mining ownership');
  assert.equal(harness.events('freight:arrival').length, 1,
    'only the exact refinery hauler bridges to freight ownership');

  for (const receipt of receipts) {
    assert.equal(receipt.schema, ACTION_RECEIPT_SCHEMA);
    assert.equal(receipt.sectorId, CERES_ACTIVITY_SECTOR_ID);
    assert.equal(receipt.receiptId,
      `ceres-job-action:${receipt.jobId}:${receipt.action}:${receipt.sequence}:${receipt.targetRef}`,
      'durable identity uses only the stable job, action, sequence, and target ref');
    assert.equal(Object.isFrozen(receipt), false, 'bus payload is an ordinary detached record');
  }
});

test('entity-backed targets fail closed when missing, dead, wrong-sector, wrong-kind, or mismatched', async (t) => {
  const cases = [
    ['missing field slot', (h) => {
      h.state.entities.delete(h.targets.asteroid.id);
      h.state.entityList = h.state.entityList.filter((entity) => entity !== h.targets.asteroid);
    }, 'ceres_seam_miner'],
    ['dead field slot', (h) => { h.targets.asteroid.alive = false; }, 'ceres_seam_miner'],
    ['wrong-sector field slot', (h) => {
      h.targets.asteroid.data.sectorId = 'sector_elsewhere';
    }, 'ceres_seam_miner'],
    ['ambiguous field slot', (h) => {
      const duplicate = makeEntity(903, 'asteroid', {
        ...h.targets.asteroid.data,
        sectorId: CERES_ACTIVITY_SECTOR_ID,
      });
      h.state.entities.set(duplicate.id, duplicate);
      h.state.entityList.push(duplicate);
    }, 'ceres_seam_miner'],
    ['wrong-kind field slot', (h) => { h.targets.asteroid.type = 'fx'; }, 'ceres_seam_miner'],
    ['wrong-sector actor', (h) => {
      h.actorBySlotId.get('ceres_seam_miner').data.sectorId = 'sector_elsewhere';
    }, 'ceres_seam_miner'],
    ['dead escort ward', (h) => { h.actorBySlotId.get('ceres_ambush_loaded_hauler').alive = false; }, 'ceres_ambush_escort'],
    ['tombstoned escort ward', (h) => {
      const ward = h.actorBySlotId.get('ceres_ambush_loaded_hauler');
      h.state.world.records.byId[ward.data.worldRecordId] = {
        recordId: ward.data.worldRecordId,
        alive: false,
        outcome: 'destroyed',
      };
    }, 'ceres_ambush_escort'],
    ['wrong-kind world-site root', (h) => { h.targets.siteRoot.type = 'station'; }, 'ceres_cathedral_salvor'],
  ];
  for (const [label, mutate, slotId] of cases) {
    await t.test(label, () => {
      const harness = bootActionHarness();
      mutate(harness);
      emitPrimary(harness, slotId);
      assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);
      assert.equal(harness.events('mining:npcExtraction').length, 0);
      assert.equal(harness.events('freight:arrival').length, 0);
    });
  }

  await t.test('wrong job kind and wrong current sector', () => {
    const harness = bootActionHarness();
    const primary = primaryIntent(harness, 'ceres_seam_miner');
    primary.intent.kind = 'surveyor';
    harness.bus.emit('npcjobs:work', primary.intent);
    assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);
    primary.intent.kind = 'miner';
    harness.state.world.currentSectorId = 'sector_elsewhere';
    harness.bus.emit('npcjobs:work', primary.intent);
    assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0);
  });
});

test('Continue-style numeric id reassignment resolves from stable refs and tombstones emit nothing', () => {
  const harness = bootActionHarness();
  const miner = harness.actorBySlotId.get('ceres_seam_miner');
  const oldActorId = miner.id;
  const oldTargetId = harness.targets.asteroid.id;
  const newActorId = 901;
  const newTargetId = 902;

  harness.state.entities.delete(oldActorId);
  miner.id = newActorId;
  harness.state.entities.set(newActorId, miner);
  const entry = harness.jobs[miner.data.jobId];
  entry.entityId = newActorId;
  const rec = harness.state.traffic.freighters.find((row) => row.activityActorSlotId === 'ceres_seam_miner');
  rec.id = newActorId;

  harness.state.entities.delete(oldTargetId);
  harness.targets.asteroid.id = newTargetId;
  harness.state.entities.set(newTargetId, harness.targets.asteroid);

  emitPrimary(harness, 'ceres_seam_miner', { seq: 61 });
  const receipt = harness.events(ACTION_RECEIPT_EVENT)[0];
  assert.equal(receipt.actorId, newActorId);
  assert.equal(receipt.targetId, newTargetId);
  assert.equal(JSON.stringify(entry.job.route).includes(String(oldActorId)), false);
  assert.equal(JSON.stringify(entry.job.route).includes(String(oldTargetId)), false);
  assert.equal(entry.job.route[1].targetRef, 'field:slot:ceres_seam_ore_clast');

  harness.state.world.records.byId[miner.data.worldRecordId] = {
    recordId: miner.data.worldRecordId,
    alive: false,
    outcome: 'destroyed',
  };
  emitPrimary(harness, 'ceres_seam_miner', { seq: 62 });
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 1,
    'a durable tombstone suppresses a stale live actor body');
});

test('offscreen no-sink catch-up emits no history; the next live ore cycle emits each owner effect once', () => {
  const harness = bootActionHarness();
  const actor = harness.actorBySlotId.get('ceres_seam_miner');
  const entry = harness.jobs[actor.data.jobId];
  entry.job = createJob({
    id: actor.data.jobId,
    kind: 'miner',
    route: entry.job.route,
    speed: 1e6,
    commissionS: 0.01,
    departS: 0.01,
    approachS: 0.01,
    workS: 0.01,
    unloadS: 0.01,
  }, SEED);

  const historical = advance(entry.job, 4);
  assert.equal(historical.some((intent) => intent.event === 'npcjobs:work'), true,
    'the kernel advanced through real offscreen work boundaries');
  assert.equal(harness.events(ACTION_RECEIPT_EVENT).length, 0,
    'no sink means traffic receives no historical action');
  assert.equal(harness.events('mining:npcExtraction').length, 0);

  for (let i = 0; i < 100 && harness.events(ACTION_RECEIPT_EVENT).length === 0; i++) {
    advance(entry.job, 0.05, (intent) => harness.bus.emit(intent.event, intent));
  }
  const liveReceipts = harness.events(ACTION_RECEIPT_EVENT);
  assert.equal(liveReceipts.length, 2, 'one work receipt plus one refinery-unload receipt');
  assert.deepEqual(liveReceipts.map((receipt) => receipt.action).sort(), ['unload', 'work']);
  assert.equal(harness.events('mining:npcExtraction').length, 1);
  assert.equal(harness.events('freight:arrival').length, 1);
});

test('real save/Continue rewinds owner state and transient Ceres dedupe before the job completes again', () => {
  const sim = createSimulation({
    seed: SEED,
    systems: [world, npcJobsRuntime, trafficBase, fieldDepletionBase, save],
  });
  try {
    sim.state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship',
      team: 0,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      hull: 200,
      hullMax: 200,
      radius: 6,
      flags: { persistent: true },
    });
    sim.state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID);

    const mining = [];
    const receipts = [];
    sim.bus.on('mining:npcExtraction', (payload) => mining.push({ ...payload }));
    sim.bus.on(ACTION_RECEIPT_EVENT, (payload) => receipts.push({ ...payload }));

    const saveSystem = sim.registry.get('save');
    const envelope = saveSystem.serialize('r6a-ledger-rewind');
    assert.equal(Object.keys(envelope.data.npcJobs.byId).length, 7,
      'the pre-completion envelope owns the exact seven traffic jobs');
    assert.deepEqual(envelope.data.fieldDepletion.fields, {},
      'the owner snapshot precedes the first extraction');

    assert.equal(stepUntil(sim, () => mining.length === 1), true,
      'the real materialized kernel reaches the first miner completion');
    assert.equal(sim.state.fieldDepletion.fields.f_ceres_1.extractedU, 16);
    const firstMinerReceipt = receipts.find((receipt) => receipt.actorSlotId === 'ceres_seam_miner');
    assert.ok(firstMinerReceipt);
    assert.equal(sim.state.traffic.appliedMinerWorkIds.length > 0, true);
    assert.equal(sim.state.traffic.appliedJobActionIds.includes(firstMinerReceipt.receiptId), true);

    const beforeLoadCounts = { mining: mining.length, receipts: receipts.length };
    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'r6a-ledger-rewind',
    ), true);
    assert.deepEqual({ mining: mining.length, receipts: receipts.length }, beforeLoadCounts,
      'Continue does not replay historical offscreen actions while restoring');
    assert.equal(sim.state.fieldDepletion.fields.f_ceres_1, undefined,
      'the authoritative owner snapshot rewinds the prior extraction');
    assert.equal(sim.state.traffic.appliedMinerWorkIds.some((id) => id.startsWith('npc-miner-work:')), false);
    assert.equal(sim.state.traffic.appliedJobActionIds.length, 0,
      'the transient action ledger reconciles to the earlier save boundary');
    assert.equal(sim.helpers.npcJobs.list().length, 7);

    assert.equal(stepUntil(sim, () => mining.length === 2), true,
      'the restored real kernel surfaces the legitimate completion again');
    assert.equal(sim.state.fieldDepletion.fields.f_ceres_1.extractedU, 16,
      'the restored owner applies once rather than retaining or doubling the future action');
    const minerReceipts = receipts.filter((receipt) => receipt.actorSlotId === 'ceres_seam_miner');
    assert.equal(minerReceipts.length, 2);
    assert.equal(minerReceipts[1].receiptId, minerReceipts[0].receiptId,
      'the same saved completion identity is legitimate again only after the authoritative rewind');
  } finally {
    sim.dispose();
  }
});

test('reentrant real Continue during miner ownership discards the obsolete completion epoch', () => {
  const sim = createSimulation({
    seed: SEED,
    systems: [world, npcJobsRuntime, trafficBase, fieldDepletionBase, save],
  });
  try {
    sim.state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
    });
    sim.state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID);

    const saveSystem = sim.registry.get('save');
    const trafficSystem = sim.registry.get('traffic');
    const envelope = saveSystem.serialize('r6a-reentrant-miner');
    const mining = [];
    const receipts = [];
    let restored = false;
    let oldActionId = null;
    sim.bus.on('mining:npcExtraction', (payload) => {
      mining.push({ ...payload });
      if (restored) return;
      oldActionId = [...trafficSystem._pendingJobActionIds][0] || null;
      restored = saveSystem.loadEnvelope(
        JSON.parse(JSON.stringify(envelope)),
        'r6a-reentrant-miner',
      ) === true;
    });
    sim.bus.on(ACTION_RECEIPT_EVENT, (payload) => receipts.push({ ...payload }));

    assert.equal(stepUntil(sim, () => restored, 180), true,
      'the real materialized miner reaches the owner callback that invokes Continue');
    assert.equal(mining.length, 1, 'the obsolete run emitted only the owner event already in flight');
    assert.ok(oldActionId);
    assert.equal(receipts.some((row) => row.actorSlotId === 'ceres_seam_miner'), false,
      'the obsolete miner run emits no post-Continue action receipt');
    assert.equal(sim.state.fieldDepletion.fields.f_ceres_1, undefined,
      'Continue restores the owner snapshot after the in-flight extraction');
    assert.equal(sim.state.traffic.appliedMinerWorkIds.length, 0);
    assert.equal(sim.state.traffic.appliedJobActionIds.length, 0);
    assert.deepEqual([
      trafficSystem._pendingJobActionIds.size,
      trafficSystem._pendingMinerWorkIds.size,
      trafficSystem._pendingArrivalIds.size,
    ], [0, 0, 0], 'the obsolete run leaves no pending reservation in restored authority');

    assert.equal(stepUntil(sim, () => receipts.some((row) => row.actorSlotId === 'ceres_seam_miner'), 180), true,
      'the restored kernel can surface the same legitimate completion once');
    const minerReceipts = receipts.filter((row) => row.actorSlotId === 'ceres_seam_miner');
    assert.equal(minerReceipts.length, 1);
    assert.equal(minerReceipts[0].receiptId, oldActionId,
      'the public action identity remains epoch-free across the rewind');
    assert.equal(mining.length, 2);
    assert.equal(mining[1].workId, mining[0].workId,
      'the restored owner legitimately reuses the same stable effect identity');
    assert.equal(sim.state.fieldDepletion.fields.f_ceres_1.extractedU, 16);
  } finally {
    sim.dispose();
  }
});

test('reentrant real Continue during first freight line aborts the obsolete manifest tail', () => {
  const sim = createSimulation({
    seed: SEED,
    systems: [world, npcJobsRuntime, economyBase, trafficBase, fieldDepletionBase, save],
  });
  try {
    sim.state.mode = 'flight';
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
      hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
    });
    sim.state.playerId = player.id;
    sim.registry.get('world').enterSector(CERES_ACTIVITY_SECTOR_ID);
    for (const entity of sim.state.entities.values()) {
      if (!entity || entity.type !== 'ship' || entity.team !== 1 || !entity.data) continue;
      entity.data.ai = { ...(entity.data.ai || {}), passive: true, roe: 'hold_fire' };
    }

    const hauler = [...sim.state.entities.values()].find((entity) => entity && entity.alive
      && entity.data && entity.data.activityActorSlotId === 'ceres_refinery_hauler');
    assert.ok(hauler);
    const haulerWorldRecordId = hauler.data.worldRecordId;
    const entry = sim.helpers.npcJobs.get(hauler.data.jobId);
    const rec = sim.state.traffic.freighters.find((row) => row && row.id === hauler.id);
    assert.ok(entry && rec);
    const manifest = {
      manifestId: 'manifest_r6a_reentrant_freight',
      lines: [
        { commodityId: 'cmdty_ore_iron', qty: 3 },
        { commodityId: 'cmdty_ore_copper', qty: 5 },
      ],
      totalQty: 8,
    };
    entry.job.payload = { activityRunSeq: rec.dockSeq | 0, manifest: JSON.parse(JSON.stringify(manifest)) };
    rec.manifest = JSON.parse(JSON.stringify(manifest));
    hauler.data.cargoManifest = JSON.parse(JSON.stringify(manifest));
    hauler.data.freightDockSeq = rec.dockSeq | 0;

    const saveSystem = sim.registry.get('save');
    const trafficSystem = sim.registry.get('traffic');
    const envelope = saveSystem.serialize('r6a-reentrant-freight');
    const beforeStock = Object.fromEntries(manifest.lines.map(({ commodityId }) => [
      commodityId,
      sim.state.economy.markets.station_ceres[commodityId].stock,
    ]));
    const trades = [];
    const arrivals = [];
    const receipts = [];
    let restored = false;
    let oldActionId = null;
    let oldEffectId = null;
    sim.bus.on('aiTrader:requestTrade', (payload) => {
      if (oldEffectId == null ? payload.freighterId !== hauler.id : payload.intentId !== oldEffectId) return;
      trades.push({ ...payload });
      if (restored) return;
      oldEffectId = payload.intentId;
      oldActionId = [...trafficSystem._pendingJobActionIds][0] || null;
      restored = saveSystem.loadEnvelope(
        JSON.parse(JSON.stringify(envelope)),
        'r6a-reentrant-freight',
      ) === true;
      if (restored) {
        for (const entity of sim.state.entities.values()) {
          if (!entity || entity.type !== 'ship' || entity.team !== 1 || !entity.data) continue;
          entity.data.ai = { ...(entity.data.ai || {}), passive: true, roe: 'hold_fire' };
        }
      }
    });
    sim.bus.on('freight:arrival', (payload) => {
      if (payload.intentId === oldEffectId) arrivals.push({ ...payload });
    });
    sim.bus.on(ACTION_RECEIPT_EVENT, (payload) => receipts.push({ ...payload }));

    assert.equal(stepUntil(sim, () => restored, 240), true,
      'the real refinery hauler reaches the first owner trade that invokes Continue');
    assert.ok(oldActionId);
    assert.equal(trades.length, 1, 'the obsolete multi-line manifest aborts before its second trade');
    assert.equal(arrivals.length, 0, 'the obsolete run cannot publish freight arrival after Continue');
    assert.equal(receipts.some((row) => row.actorSlotId === 'ceres_refinery_hauler'), false,
      'the obsolete refinery run cannot publish an action receipt after Continue');
    for (const { commodityId } of manifest.lines) {
      assert.equal(sim.state.economy.markets.station_ceres[commodityId].stock, beforeStock[commodityId],
        `${commodityId} owner state rewinds to the saved boundary`);
    }
    assert.equal(sim.state.traffic.appliedArrivalIds.length, 0);
    assert.equal(sim.state.traffic.appliedJobActionIds.length, 0);
    assert.deepEqual([
      trafficSystem._pendingJobActionIds.size,
      trafficSystem._pendingMinerWorkIds.size,
      trafficSystem._pendingArrivalIds.size,
    ], [0, 0, 0], 'the obsolete freight stack leaves no restored reservation');

    const restoredCompleted = stepUntil(
      sim,
      () => receipts.some((row) => row.actorSlotId === 'ceres_refinery_hauler'),
      240,
    );
    const restoredEntry = sim.helpers.npcJobs.get(`job:${haulerWorldRecordId}`);
    const restoredActor = [...sim.state.entities.values()].find((entity) => entity && entity.alive
      && entity.data && entity.data.worldRecordId === haulerWorldRecordId);
    assert.equal(restoredCompleted, true,
      `the restored refinery completion can apply exactly once: ${JSON.stringify({
        receiptSlots: receipts.map((row) => row.actorSlotId),
        trades: trades.map((row) => ({ intentId: row.intentId, commodityId: row.commodityId })),
        arrivals: arrivals.length,
        job: restoredEntry && {
          phase: restoredEntry.job && restoredEntry.job.phase,
          progress: restoredEntry.job && restoredEntry.job.progress,
          sequence: restoredEntry.job && restoredEntry.job.sequence,
          materialized: restoredEntry.job && restoredEntry.job.materialized,
          entityId: restoredEntry.entityId,
        },
        actor: restoredActor && { id: restoredActor.id, jobId: restoredActor.data.jobId },
      })}`);
    const haulerReceipts = receipts.filter((row) => row.actorSlotId === 'ceres_refinery_hauler');
    assert.equal(haulerReceipts.length, 1);
    assert.equal(haulerReceipts[0].receiptId, oldActionId,
      'the restored completion reuses the same epoch-free public action identity');
    assert.equal(trades.length, 3, 'one obsolete first line plus exactly two restored manifest lines');
    assert.equal(arrivals.length, 1);
    assert.equal(trades[1].intentId, trades[0].intentId);
    assert.equal(trades[2].intentId, trades[0].intentId);
    assert.equal(sim.state.traffic.appliedArrivalIds.filter((id) => id === oldEffectId).length, 1,
      'the owner bridge commits the restored freight identity exactly once');
    assert.equal(sim.state.traffic.appliedJobActionIds.includes(oldActionId), true);
  } finally {
    sim.dispose();
  }
});
