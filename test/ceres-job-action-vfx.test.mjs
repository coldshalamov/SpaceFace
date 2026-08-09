import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import { createBus } from '../src/core/eventBus.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import {
  CERES_JOB_ACTION_VFX_CAPACITY,
  CERES_JOB_ACTION_VFX_CONTRACTS,
  CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY,
  CERES_JOB_ACTION_VFX_PROFILES,
  createCeresJobActionVfxController,
} from '../src/render/ceresJobActionVfx.js';
import { vfx } from '../src/render/vfx.js';
import { NPC_JOB_SCHEMA } from '../src/systems/npcJobs.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 47;

// Independent oracle: these literals are intentionally not derived from the production catalogue.
// A production-contract typo must make the focused suite red instead of rewriting its own fixture.
const EXPECTED_ACTION_ROWS = Object.freeze([
  Object.freeze({
    slotId: 'ceres_refinery_hauler', worldRecordSlotId: 'ceres:activity:ceres_refinery_hauler',
    routeId: 'ceres_refinery_freight_loop', jobKind: 'hauler', action: 'unload',
    waypointIndex: 1, waypointId: 'refinery_station_approach', targetRef: 'dest:station_ceres',
    targetKind: 'station', targetMatch: 'station', targetValue: 'station_ceres',
    effectType: 'freight:arrival', effectApplied: true, profileId: 'transfer',
  }),
  Object.freeze({
    slotId: 'ceres_seam_miner', worldRecordSlotId: 'ceres:activity:ceres_seam_miner',
    routeId: 'ceres_seam_extraction_loop', jobKind: 'miner', action: 'work',
    waypointIndex: 1, waypointId: 'seam_miner_ore_face',
    targetRef: 'field:slot:ceres_seam_ore_clast', targetKind: 'field-slot',
    targetMatch: 'field-slot', targetValue: 'ceres_seam_ore_clast',
    effectType: 'mining:npcExtraction', effectApplied: true, profileId: 'ore-cut',
  }),
  Object.freeze({
    slotId: 'ceres_seam_surveyor', worldRecordSlotId: 'ceres:activity:ceres_seam_surveyor',
    routeId: 'ceres_seam_survey_sweep', jobKind: 'surveyor', action: 'work',
    waypointIndex: 1, waypointId: 'seam_survey_mark_b', targetRef: 'activity:scan-mark-b',
    targetKind: 'activity', targetMatch: 'activity', targetValue: null,
    effectType: null, effectApplied: false, profileId: 'survey',
  }),
  Object.freeze({
    slotId: 'ceres_ambush_loaded_hauler',
    worldRecordSlotId: 'ceres:activity:ceres_ambush_loaded_hauler',
    routeId: 'ceres_ambush_loaded_crossing', jobKind: 'hauler', action: 'unload',
    waypointIndex: 1, waypointId: 'ambush_hauler_outbound',
    targetRef: 'activity:throughline-outbound', targetKind: 'activity',
    targetMatch: 'activity', targetValue: null,
    effectType: null, effectApplied: false, profileId: 'transfer',
  }),
  Object.freeze({
    slotId: 'ceres_ambush_escort', worldRecordSlotId: 'ceres:activity:ceres_ambush_escort',
    routeId: 'ceres_ambush_escort_crossing', jobKind: 'patrol', action: 'hold',
    waypointIndex: 1, waypointId: 'ambush_escort_outbound',
    targetRef: 'actor:ceres_ambush_loaded_hauler', targetKind: 'actor',
    targetMatch: 'actor-slot', targetValue: 'ceres_ambush_loaded_hauler',
    effectType: null, effectApplied: false, profileId: 'escort',
  }),
  Object.freeze({
    slotId: 'ceres_cathedral_salvor', worldRecordSlotId: 'ceres:activity:ceres_cathedral_salvor',
    routeId: 'ceres_cathedral_salvage_loop', jobKind: 'salvor', action: 'work',
    waypointIndex: 1, waypointId: 'cathedral_salvor_hulk',
    targetRef: 'world-site:world_site_wreck_cathedral', targetKind: 'world-site',
    targetMatch: 'world-site', targetValue: 'world_site_wreck_cathedral/root',
    effectType: null, effectApplied: false, profileId: 'salvage',
  }),
  Object.freeze({
    slotId: 'ceres_cathedral_patrol', worldRecordSlotId: 'ceres:activity:ceres_cathedral_patrol',
    routeId: 'ceres_cathedral_patrol_perimeter', jobKind: 'patrol', action: 'hold',
    waypointIndex: 1, waypointId: 'cathedral_patrol_beat_b',
    targetRef: 'activity:grave-perimeter-b', targetKind: 'activity',
    targetMatch: 'activity', targetValue: null,
    effectType: null, effectApplied: false, profileId: 'patrol',
  }),
]);

function ceresEntity(id, type, pos, data = {}) {
  return {
    id,
    type,
    alive: true,
    homeSectorId: CERES_ACTIVITY_SECTOR_ID,
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    rot: 0,
    radius: 5,
    data: {
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      ...data,
    },
  };
}

function makeAuthorityHarness({ motionReduce = false, flashReduce = false } = {}) {
  const player = {
    id: 'player', type: 'ship', alive: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6,
  };
  const entities = new Map([[player.id, player]]);
  const entityList = [player];
  const jobs = Object.create(null);
  const actors = new Map();
  const targets = new Map();
  const receipts = new Map();

  for (let i = 0; i < EXPECTED_ACTION_ROWS.length; i++) {
    const contract = EXPECTED_ACTION_ROWS[i];
    const worldRecordId = stableRecordId(
      SEED,
      CERES_ACTIVITY_SECTOR_ID,
      RECORD_KIND.CONVOY,
      contract.worldRecordSlotId,
    );
    const jobId = `job:${worldRecordId}`;
    const actor = ceresEntity(100 + i, 'ship', { x: 10 + i * 13, z: 20 + i * 7 }, {
      worldRecordId,
      jobId,
      activityActorSlotId: contract.slotId,
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
    });
    entities.set(actor.id, actor);
    entityList.push(actor);
    actors.set(contract.slotId, actor);
    jobs[jobId] = {
      job: {
        schema: NPC_JOB_SCHEMA,
        id: jobId,
        kind: contract.jobKind,
        phase: contract.action,
        progress: 1,
        sequence: 10 + i,
        simTime: 30 + i,
        routeIndex: contract.waypointIndex,
        materialized: true,
        corrupt: false,
        payload: contract.jobKind === 'hauler'
          ? { activityRunSeq: contract.slotId === 'ceres_refinery_hauler' ? 0 : 4 }
          : null,
        route: [
          { id: `${contract.slotId}:start`, pos: { x: -100 - i, z: -200 - i } },
          {
            id: contract.waypointId,
            targetRef: contract.targetRef,
            pos: { x: 120 + i * 11, z: 230 + i * 9 },
          },
        ],
      },
      kind: contract.jobKind,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      worldRecordId,
      entityId: actor.id,
    };
  }

  const station = ceresEntity(501, 'station', { x: 180, z: 260 }, { stationId: 'station_ceres' });
  const asteroid = ceresEntity(502, 'asteroid', { x: 210, z: 290 }, {
    activityObjectSlotId: 'ceres_seam_ore_clast',
  });
  const site = ceresEntity(503, 'fx', { x: 240, z: 320 }, {
    worldRecordId: 'world_site_wreck_cathedral/root',
  });
  for (const entity of [station, asteroid, site]) {
    entities.set(entity.id, entity);
    entityList.push(entity);
  }

  for (let i = 0; i < EXPECTED_ACTION_ROWS.length; i++) {
    const contract = EXPECTED_ACTION_ROWS[i];
    const actor = actors.get(contract.slotId);
    let target = null;
    if (contract.targetMatch === 'station') target = station;
    else if (contract.targetMatch === 'field-slot') target = asteroid;
    else if (contract.targetMatch === 'world-site') target = site;
    else if (contract.targetMatch === 'actor-slot') target = actors.get(contract.targetValue);
    targets.set(contract.slotId, target);
    const job = jobs[actor.data.jobId].job;
    const durableSequence = contract.jobKind === 'hauler'
      ? job.payload.activityRunSeq
      : job.sequence;
    const receiptId = `ceres-job-action:${job.id}:${contract.action}:${durableSequence}:${contract.targetRef}`;
    receipts.set(contract.slotId, {
      schema: 'spaceface.trafficJobActionReceipt.v1',
      receiptId,
      actionId: receiptId,
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      routeId: contract.routeId,
      jobId: job.id,
      jobKind: contract.jobKind,
      action: contract.action,
      sequence: durableSequence,
      kernelSequence: job.sequence,
      actorSlotId: contract.slotId,
      actorId: actor.id,
      targetRef: contract.targetRef,
      targetKind: contract.targetKind,
      targetId: target ? target.id : null,
      effectType: contract.effectType,
      effectApplied: contract.effectApplied,
      simTime: job.simTime,
    });
  }

  const state = {
    meta: { seed: SEED },
    world: { currentSectorId: CERES_ACTIVITY_SECTOR_ID, records: { byId: Object.create(null) } },
    playerId: player.id,
    player: { targetId: null, tether: { active: false } },
    entities,
    entityList,
    settings: {
      video: {
        particleQuality: 'high', motionReduce, flashReduce,
        energyMaterials: false, engineTrails: false, bloom: true,
      },
      accessibility: { flashReduce },
    },
    input: { turnIntent: 0 },
    render: { scene: new THREE.Scene() },
    ui: { radarRange: 4000 },
    combat: { attachments: { byId: {} }, beams: [] },
    content: {},
  };
  const helpers = {
    player: () => player,
    npcJobs: { get(jobId) { return jobs[jobId] || null; } },
  };
  const bus = createBus();
  return { actors, bus, entities, entityList, helpers, jobs, player, receipts, state, targets };
}

function makeVfxHarness(options = {}) {
  const harness = makeAuthorityHarness(options);
  const system = Object.create(vfx);
  system.init({ state: harness.state, bus: harness.bus, helpers: harness.helpers });
  return { ...harness, system };
}

function resequence(harness, slotId, sequence) {
  const receipt = { ...harness.receipts.get(slotId) };
  const entry = harness.jobs[receipt.jobId];
  entry.job.sequence = sequence;
  entry.job.simTime = 100 + sequence;
  receipt.sequence = sequence;
  receipt.kernelSequence = sequence;
  receipt.simTime = entry.job.simTime;
  receipt.receiptId = `ceres-job-action:${receipt.jobId}:${receipt.action}:${sequence}:${receipt.targetRef}`;
  receipt.actionId = receipt.receiptId;
  return receipt;
}

test('R6B declares a fixed action pool and exactly six immutable non-color profiles', () => {
  assert.equal(CERES_JOB_ACTION_VFX_CAPACITY, 8);
  assert.equal(Object.keys(CERES_JOB_ACTION_VFX_PROFILES).length, 6);
  assert.ok(Object.isFrozen(CERES_JOB_ACTION_VFX_PROFILES));
  assert.ok(Object.values(CERES_JOB_ACTION_VFX_PROFILES).every(Object.isFrozen));
  assert.equal(new Set(Object.values(CERES_JOB_ACTION_VFX_PROFILES).map((entry) => entry.geometry)).size, 6);
  assert.equal(new Set(Object.values(CERES_JOB_ACTION_VFX_PROFILES).map((entry) => entry.rhythm)).size, 6);
  assert.equal(CERES_JOB_ACTION_VFX_PROFILES.survey.streakCount, 3,
    'survey is a directional structural fan, not a generic primary ring');
  assert.equal(CERES_JOB_ACTION_VFX_PROFILES.oreCut.maxPulses, 3,
    'three-cut-bites is an explicit lifetime contract, not a cadence accident');
  assert.deepEqual(
    CERES_JOB_ACTION_VFX_CONTRACTS.map((entry) => ({
      slotId: entry.slotId,
      worldRecordSlotId: entry.worldRecordSlotId,
      routeId: entry.routeId,
      jobKind: entry.jobKind,
      action: entry.action,
      waypointIndex: entry.waypointIndex,
      waypointId: entry.waypointId,
      targetRef: entry.targetRef,
      targetKind: entry.targetKind,
      targetMatch: entry.targetMatch,
      targetValue: entry.targetValue,
      effectType: entry.effectType,
      effectApplied: entry.effectApplied,
      profileId: Object.values(CERES_JOB_ACTION_VFX_PROFILES)[entry.profileIndex].id,
    })),
    EXPECTED_ACTION_ROWS,
    'production exact-seven contract must match the independent literal oracle',
  );
  assert.ok(createCeresJobActionVfxController());
});

test('all seven exact canonical tuples validate before detached scalar slots emit six profiles', () => {
  const harness = makeAuthorityHarness();
  const controller = createCeresJobActionVfxController();
  for (const contract of EXPECTED_ACTION_ROWS) {
    assert.equal(controller.accept(
      harness.receipts.get(contract.slotId), harness.state, harness.helpers,
    ), true, contract.slotId);
  }
  const emitted = [];
  controller.update(0.01, false, false, (slot, profile, pulse) => {
    emitted.push({ slot, profile, pulse });
  });
  assert.deepEqual(emitted.map((entry) => entry.profile.id), [
    'transfer', 'ore-cut', 'survey', 'transfer', 'escort', 'salvage', 'patrol',
  ]);
  assert.equal(new Set(emitted.map((entry) => entry.profile.id)).size, 6,
    'only the two authored haulers share transfer language');
  for (const { slot } of emitted) {
    assert.ok(Object.values(slot).every((value) => value == null
      || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string'),
    'resident slots retain detached scalars only');
  }
});

test('malformed, inherited, spoofed, and duplicate receipts fail closed without poisoning dedupe', () => {
  const harness = makeAuthorityHarness();
  const valid = harness.receipts.get('ceres_refinery_hauler');
  const mutations = [
    ['schema', 'spaceface.trafficJobActionReceipt.v2'],
    ['receiptId', `${valid.receiptId}:spoof`],
    ['actionId', `${valid.actionId}:spoof`],
    ['sectorId', 'sector_helios_prime'],
    ['routeId', 'ceres_fake_route'],
    ['jobId', `${valid.jobId}:spoof`],
    ['jobKind', 'miner'],
    ['action', 'work'],
    ['sequence', -1],
    ['kernelSequence', 0],
    ['actorSlotId', 'ceres_refinery_tender'],
    ['actorId', String(valid.actorId)],
    ['targetRef', 'dest:not_ceres'],
    ['targetKind', 'activity'],
    ['targetId', String(valid.targetId)],
    ['effectType', null],
    ['effectApplied', false],
    ['simTime', Number.NaN],
  ];
  for (const [field, value] of mutations) {
    const controller = createCeresJobActionVfxController();
    assert.equal(controller.accept({ ...valid, [field]: value }, harness.state, harness.helpers), false,
      `spoofed ${field}`);
  }

  const missing = { ...valid };
  delete missing.effectType;
  assert.equal(createCeresJobActionVfxController().accept(missing, harness.state, harness.helpers), false);
  const inheritedOnly = Object.create(valid);
  assert.equal(createCeresJobActionVfxController().accept(inheritedOnly, harness.state, harness.helpers), false);
  const partlyInherited = { ...valid };
  delete partlyInherited.actionId;
  Object.setPrototypeOf(partlyInherited, { actionId: valid.actionId });
  assert.equal(createCeresJobActionVfxController().accept(
    partlyInherited, harness.state, harness.helpers,
  ), false, 'every required v1 field must be an own property');

  const controller = createCeresJobActionVfxController();
  assert.equal(controller.accept({ ...valid, actionId: 'malformed' }, harness.state, harness.helpers), false);
  assert.equal(controller.accept(valid, harness.state, harness.helpers), true,
    'a malformed claimed id cannot poison later valid intake');
  assert.equal(controller.accept(valid, harness.state, harness.helpers), false);
  assert.deepEqual(
    {
      invalid: controller.inspect().rejectedInvalid,
      duplicate: controller.inspect().rejectedDuplicate,
      dedupe: controller.inspect().dedupe,
    },
    { invalid: 1, duplicate: 1, dedupe: 1 },
  );
});

test('live actor, job, target, and exact Ceres sector authority are mandatory without ID coercion', () => {
  const cases = [
    (h, r) => h.entities.delete(r.actorId),
    (h, r) => { h.entities.get(r.actorId).alive = false; },
    (h, r) => { h.entities.get(r.actorId).data.sectorId = 'sector_helios_prime'; },
    (h, r) => { delete h.jobs[r.jobId]; },
    (h, r) => { h.jobs[r.jobId].job.materialized = false; },
    (h, r) => h.entities.delete(r.targetId),
    (h, r) => { h.entities.get(r.targetId).alive = false; },
    (h, r) => { h.entities.get(r.targetId).homeSectorId = 'sector_helios_prime'; },
    (h) => { h.state.world.currentSectorId = 'sector_helios_prime'; },
  ];
  for (const mutate of cases) {
    const harness = makeAuthorityHarness();
    const receipt = harness.receipts.get('ceres_refinery_hauler');
    mutate(harness, receipt);
    assert.equal(createCeresJobActionVfxController().accept(
      receipt, harness.state, harness.helpers,
    ), false);
  }

  const forged = makeAuthorityHarness();
  const forgedReceipt = forged.receipts.get('ceres_refinery_hauler');
  const actor = forged.entities.get(forgedReceipt.actorId);
  actor.data.worldRecordId = 'attacker-selected-world-record';
  forgedReceipt.jobId = 'job:attacker-selected-world-record';
  forgedReceipt.receiptId = `ceres-job-action:${forgedReceipt.jobId}:${forgedReceipt.action}:${forgedReceipt.sequence}:${forgedReceipt.targetRef}`;
  forgedReceipt.actionId = forgedReceipt.receiptId;
  assert.equal(createCeresJobActionVfxController().accept(
    forgedReceipt, forged.state, forged.helpers,
  ), false, 'world-record authority is derived from seed, Ceres, kind, and authored slot');

  const split = makeAuthorityHarness();
  const survey = { ...split.receipts.get('ceres_seam_surveyor'), sequence: 3 };
  survey.receiptId = `ceres-job-action:${survey.jobId}:${survey.action}:${survey.sequence}:${survey.targetRef}`;
  survey.actionId = survey.receiptId;
  assert.equal(createCeresJobActionVfxController().accept(survey, split.state, split.helpers), false,
    'cyclic non-hauler receipts cannot split durable and kernel sequence');
  const hauler = { ...split.receipts.get('ceres_refinery_hauler'), sequence: 3 };
  hauler.receiptId = `ceres-job-action:${hauler.jobId}:${hauler.action}:${hauler.sequence}:${hauler.targetRef}`;
  hauler.actionId = hauler.receiptId;
  assert.equal(createCeresJobActionVfxController().accept(hauler, split.state, split.helpers), false,
    'a positive hauler sequence cannot disagree with the durable live run');
  split.jobs[hauler.jobId].job.payload.activityRunSeq = 3;
  assert.equal(createCeresJobActionVfxController().accept(hauler, split.state, split.helpers), true,
    'one-shot haulers retain their durable run sequence distinct from kernel sequence');
  delete split.jobs[hauler.jobId].job.payload.activityRunSeq;
  assert.equal(createCeresJobActionVfxController().accept(hauler, split.state, split.helpers), false,
    'hauler run identity must be a present safe nonnegative integer');

  const actorTarget = makeAuthorityHarness();
  const escort = actorTarget.receipts.get('ceres_ambush_escort');
  actorTarget.entities.get(escort.targetId).data.worldRecordId = 'forged-escort-target';
  assert.equal(createCeresJobActionVfxController().accept(
    escort, actorTarget.state, actorTarget.helpers,
  ), false, 'actor targets require their own canonical stable world-record/job relationship');

  const handoff = makeAuthorityHarness();
  const handoffReceipt = handoff.receipts.get('ceres_ambush_escort');
  const handoffTarget = handoff.entities.get(handoffReceipt.targetId);
  const releasedTargetJobId = handoffTarget.data.jobId;
  delete handoffTarget.data.jobId;
  delete handoff.jobs[releasedTargetJobId];
  assert.equal(createCeresJobActionVfxController().accept(
    handoffReceipt, handoff.state, handoff.helpers,
  ), true, 'canonical actor target remains valid during one-shot release to recommission handoff');
  handoffTarget.data.jobId = 'job:conflicting-present-relation';
  assert.equal(createCeresJobActionVfxController().accept(
    handoffReceipt, handoff.state, handoff.helpers,
  ), false, 'a present noncanonical target job relation still fails closed');
});

test('activity targets require null identity and the current exact finite route waypoint', () => {
  const validHarness = makeAuthorityHarness();
  const valid = validHarness.receipts.get('ceres_seam_surveyor');
  assert.equal(valid.targetId, null);
  assert.equal(createCeresJobActionVfxController().accept(
    valid, validHarness.state, validHarness.helpers,
  ), true);

  const variants = [
    (h, r) => { r.targetId = 77; },
    (h, r) => { h.jobs[r.jobId].job.routeIndex = 0; },
    (h, r) => { h.jobs[r.jobId].job.route[1].id = 'not-current-authored-mark'; },
    (h, r) => { h.jobs[r.jobId].job.route[1].targetRef = 'activity:spoof'; },
    (h, r) => { h.jobs[r.jobId].job.route[1].pos.x = Number.NaN; },
    (h, r) => { delete h.jobs[r.jobId].job.route[1].pos; },
  ];
  for (const mutate of variants) {
    const harness = makeAuthorityHarness();
    const receipt = harness.receipts.get('ceres_seam_surveyor');
    mutate(harness, receipt);
    assert.equal(createCeresJobActionVfxController().accept(
      receipt, harness.state, harness.helpers,
    ), false, 'activity resolution never falls back to static pocket coordinates');
  }
});

test('entity-backed targets require one unique live authority match and no durable tombstones', () => {
  for (const slotId of [
    'ceres_refinery_hauler',
    'ceres_seam_miner',
    'ceres_ambush_escort',
    'ceres_cathedral_salvor',
  ]) {
    const harness = makeAuthorityHarness();
    const receipt = harness.receipts.get(slotId);
    const original = harness.entities.get(receipt.targetId);
    const duplicate = ceresEntity(
      800 + receipt.targetId,
      original.type,
      { x: original.pos.x + 1, z: original.pos.z + 1 },
      { ...original.data },
    );
    harness.entities.set(duplicate.id, duplicate);
    assert.equal(createCeresJobActionVfxController().accept(
      receipt, harness.state, harness.helpers,
    ), false, `${slotId}: supplied id is not authority when a second exact live match exists`);
  }

  const sourceTombstone = makeAuthorityHarness();
  const sourceReceipt = sourceTombstone.receipts.get('ceres_seam_surveyor');
  const source = sourceTombstone.entities.get(sourceReceipt.actorId);
  sourceTombstone.state.world.records.byId[source.data.worldRecordId] = {
    recordId: source.data.worldRecordId,
    alive: false,
    outcome: 'destroyed',
  };
  assert.equal(createCeresJobActionVfxController().accept(
    sourceReceipt, sourceTombstone.state, sourceTombstone.helpers,
  ), false, 'a stale live source body cannot outrank its durable tombstone');

  for (const slotId of ['ceres_refinery_hauler', 'ceres_seam_miner', 'ceres_ambush_escort', 'ceres_cathedral_salvor']) {
    const harness = makeAuthorityHarness();
    const receipt = harness.receipts.get(slotId);
    const target = harness.entities.get(receipt.targetId);
    const contract = EXPECTED_ACTION_ROWS.find((entry) => entry.slotId === slotId);
    let recordId = target.data.worldRecordId;
    if (!recordId && contract.targetMatch === 'actor-slot') {
      recordId = stableRecordId(
        SEED,
        CERES_ACTIVITY_SECTOR_ID,
        RECORD_KIND.CONVOY,
        `ceres:activity:${contract.targetValue}`,
      );
    }
    if (!recordId) {
      recordId = `test-target-record:${slotId}`;
      target.data.worldRecordId = recordId;
    }
    harness.state.world.records.byId[recordId] = {
      recordId,
      alive: false,
      outcome: 'defeated',
    };
    assert.equal(createCeresJobActionVfxController().accept(
      receipt, harness.state, harness.helpers,
    ), false, `${slotId}: target durable tombstone suppresses a stale live body`);
  }
});

test('synchronous intake survives immediate removal and same-ID reuse without reacquisition', () => {
  const harness = makeAuthorityHarness();
  const receipt = harness.receipts.get('ceres_seam_miner');
  const actor = harness.entities.get(receipt.actorId);
  const target = harness.entities.get(receipt.targetId);
  const routePos = harness.jobs[receipt.jobId].job.route[1].pos;
  const expected = {
    sourceX: actor.pos.x, sourceZ: actor.pos.z,
    targetX: target.pos.x, targetZ: target.pos.z,
    routeX: routePos.x, routeZ: routePos.z,
  };
  const controller = createCeresJobActionVfxController();
  assert.equal(controller.accept(receipt, harness.state, harness.helpers), true);
  harness.entities.set(receipt.actorId, ceresEntity(receipt.actorId, 'ship', { x: 9000, z: 9000 }));
  harness.entities.set(receipt.targetId, ceresEntity(receipt.targetId, 'asteroid', { x: 8000, z: 8000 }, {
    activityObjectSlotId: 'ceres_seam_ore_clast',
  }));
  delete harness.jobs[receipt.jobId];
  let observed = null;
  controller.update(0.01, false, false, (slot) => {
    observed = {
      sourceX: slot.sourceX, sourceZ: slot.sourceZ,
      targetX: slot.targetX, targetZ: slot.targetZ,
      routeX: slot.routeX, routeZ: slot.routeZ,
    };
  });
  assert.deepEqual(observed, expected);
});

test('private activity and replay pools saturate and evict within fixed bounds', () => {
  const harness = makeAuthorityHarness();
  const slotId = 'ceres_seam_surveyor';
  const controller = createCeresJobActionVfxController();
  for (let sequence = 1; sequence <= CERES_JOB_ACTION_VFX_CAPACITY; sequence++) {
    assert.equal(controller.accept(resequence(harness, slotId, sequence), harness.state, harness.helpers), true);
  }
  assert.equal(controller.accept(
    resequence(harness, slotId, CERES_JOB_ACTION_VFX_CAPACITY + 1), harness.state, harness.helpers,
  ), false);
  assert.equal(controller.inspect().active, CERES_JOB_ACTION_VFX_CAPACITY);
  assert.equal(controller.inspect().rejectedSaturated, 1);

  const ledgerHarness = makeAuthorityHarness();
  const ledger = createCeresJobActionVfxController();
  const noop = () => {};
  for (let sequence = 1; sequence <= CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY + 1; sequence++) {
    assert.equal(ledger.accept(resequence(ledgerHarness, slotId, sequence), ledgerHarness.state, ledgerHarness.helpers), true);
    for (let step = 0; step < 13; step++) ledger.update(0.1, false, false, noop);
  }
  assert.equal(ledger.inspect().dedupe, CERES_JOB_ACTION_VFX_DEDUPE_CAPACITY);
  assert.equal(ledger.accept(resequence(ledgerHarness, slotId, 1), ledgerHarness.state, ledgerHarness.helpers), true,
    'the 513th receipt evicts only the oldest replay identity');
});

test('six profiles produce distinct structural counts and survey stays streak-led', () => {
  const { system } = makeVfxHarness();
  const slot = {
    sourceX: 10, sourceZ: 20, targetX: 34, targetZ: 48, routeX: 36, routeZ: 50,
  };
  const signatures = new Map();
  for (const profile of Object.values(CERES_JOB_ACTION_VFX_PROFILES)) {
    const streaks = [];
    const sprites = [];
    system._spawnProjectileTrailStreak = (...args) => {
      const resident = { args };
      streaks.push(resident);
      return resident;
    };
    system._spawnSprite = (...args) => {
      const resident = { args };
      sprites.push(resident);
      return resident;
    };
    system._emitCeresJobActionVfx(slot, profile, 1, false, false);
    assert.equal(streaks.length, profile.streakCount, profile.id);
    assert.equal(sprites.length, profile.spriteCount, profile.id);
    signatures.set(profile.id, `${streaks.length}:${sprites.length}:${profile.geometry}:${profile.rhythm}`);
    if (profile.id === 'survey') assert.ok(streaks.length > sprites.length);
  }
  assert.equal(new Set(signatures.values()).size, 6);
});

test('reduced motion and flash retain static geometry at a lower cadence and amplitude', () => {
  const full = makeVfxHarness();
  const reduced = makeVfxHarness({ motionReduce: true, flashReduce: true });
  const slotId = 'ceres_seam_miner';
  const fullCalls = [];
  const reducedCalls = [];
  full.system._ceresJobActionEmitter = (...args) => fullCalls.push(args);
  reduced.system._ceresJobActionEmitter = (...args) => reducedCalls.push(args);
  assert.equal(full.system._onCeresJobActionReceipt(full.receipts.get(slotId)), true);
  assert.equal(reduced.system._onCeresJobActionReceipt(reduced.receipts.get(slotId)), true);
  full.system._updateCeresJobActionVfx(0.1);
  reduced.system._updateCeresJobActionVfx(0.1);
  full.system._updateCeresJobActionVfx(0.1);
  reduced.system._updateCeresJobActionVfx(0.1);
  assert.equal(fullCalls.length, 2, 'full cadence emits the second ore-cut bite');
  assert.equal(reducedCalls.length, 1, 'reduced motion keeps the cue but slows its rhythm');
  assert.equal(reducedCalls[0][3], true);
  assert.equal(reducedCalls[0][4], true);

  const captures = [];
  reduced.system._spawnProjectileTrailStreak = (...args) => {
    const resident = { args };
    captures.push({ type: 'streak', args });
    return resident;
  };
  reduced.system._spawnSprite = (...args) => {
    const resident = { args };
    captures.push({ type: 'sprite', args });
    return resident;
  };
  reduced.system._emitCeresJobActionVfx(
    reducedCalls[0][0], reducedCalls[0][1], 0, true, true,
  );
  assert.ok(captures.some((entry) => entry.type === 'streak'),
    'reduced motion preserves the structural relationship');
  const reducedSprite = captures.find((entry) => entry.type === 'sprite');
  assert.ok(reducedSprite.args[7] < 0.5, 'reduced flash lowers authored opacity before shared policy');
});

test('ore-cut emits exactly three full-motion bites over its lifetime and fewer when reduced', () => {
  const runLifetime = (options) => {
    const harness = makeVfxHarness(options);
    let streaks = 0;
    let sprites = 0;
    harness.system._spawnProjectileTrailStreak = () => {
      streaks++;
      return {};
    };
    harness.system._spawnSprite = () => {
      sprites++;
      return {};
    };
    assert.equal(harness.system._onCeresJobActionReceipt(
      harness.receipts.get('ceres_seam_miner'),
    ), true);
    for (let frame = 0; frame < 10; frame++) harness.system._updateCeresJobActionVfx(0.1);
    return {
      pulses: harness.system.inspect().ceresJobActions.emitted,
      streaks,
      sprites,
      active: harness.system.inspect().ceresJobActions.active,
    };
  };

  assert.deepEqual(runLifetime({}), {
    pulses: 3,
    streaks: 3,
    sprites: 3,
    active: 0,
  }, 'each authored bite is one contact lance plus one face flash');
  assert.deepEqual(runLifetime({ motionReduce: true, flashReduce: true }), {
    pulses: 2,
    streaks: 2,
    sprites: 2,
    active: 0,
  }, 'reduced motion keeps a lower bounded two-bite read');
});

test('ambient admission cannot evict hero residents and owner cleanup is selective', () => {
  const saturated = makeVfxHarness();
  for (let i = 0; i < 96; i++) {
    saturated.system._spawnProjectileTrailStreak(
      i, 0, 0, 30, 0.1, 2, 0.8, '#ffffff', 0, 0, 1, 0, 0.9,
    );
  }
  for (let i = 0; i < 256; i++) {
    saturated.system._spawnSprite(
      0, i, 0, 0, 30, 1, 2, 0.8, 0, '#ffffff', 0, 0, 1, 0, 0.9,
    );
  }
  assert.equal(saturated.system._onCeresJobActionReceipt(
    saturated.receipts.get('ceres_seam_miner'),
  ), true);
  saturated.system._updateCeresJobActionVfx(0.01);
  assert.equal(saturated.system._liveTrailStreakCount, 96);
  assert.equal(saturated.system._liveSpriteCount, 256);
  assert.equal(saturated.system._ts.some((entry) => entry.alive && entry.ceresJobActionOwner), false);
  assert.equal(saturated.system._spr.some((entry) => entry.alive && entry.ceresJobActionOwner), false);

  const selective = makeVfxHarness();
  const unrelatedStreak = selective.system._spawnProjectileTrailStreak(
    0, 0, 0, 30, 0.1, 2, 0.8, '#ffffff', 0, 0, 1, 0, 0.6,
  );
  const unrelatedSprite = selective.system._spawnSprite(
    0, 0, 0, 0, 30, 1, 2, 0.8, 0, '#ffffff', 0, 0, 1, 0, 0.6,
  );
  const receipt = selective.receipts.get('ceres_seam_miner');
  selective.bus.emit('traffic:jobActionReceipt', receipt);
  selective.system._updateCeresJobActionVfx(0.01);
  assert.ok(selective.system._ts.some((entry) => entry.alive && entry.ceresJobActionOwner));
  assert.ok(selective.system._spr.some((entry) => entry.alive && entry.ceresJobActionOwner));
  selective.bus.emit('sector:exit');
  assert.equal(unrelatedStreak.alive, true);
  assert.equal(unrelatedSprite.alive, true);
  assert.equal(selective.system._ts.some((entry) => entry.alive && entry.ceresJobActionOwner), false);
  assert.equal(selective.system._spr.some((entry) => entry.alive && entry.ceresJobActionOwner), false);
  assert.equal(selective.system._onCeresJobActionReceipt(receipt), true,
    'boundary reset clears dedupe as well as only its owned residents');
});

test('all four declared boundaries reset active cadence/dedupe; save allows the same receipt again', () => {
  for (const event of ['sector:exit', 'sector:enter', 'game:newGame', 'save:loaded']) {
    const harness = makeVfxHarness();
    const receipt = harness.receipts.get('ceres_cathedral_patrol');
    assert.equal(harness.system._onCeresJobActionReceipt(receipt), true);
    assert.equal(harness.system._onCeresJobActionReceipt(receipt), false);
    harness.system._updateCeresJobActionVfx(0.1);
    harness.bus.emit(event);
    assert.equal(harness.system.inspect().ceresJobActions.active, 0, `${event}: active`);
    assert.equal(harness.system.inspect().ceresJobActions.dedupe, 0, `${event}: dedupe`);
    assert.equal(harness.system._onCeresJobActionReceipt(receipt), true, `${event}: replay after reset`);
  }
});
