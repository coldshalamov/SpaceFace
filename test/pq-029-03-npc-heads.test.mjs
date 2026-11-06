// PQ-029.03 — NPCs use Massline heads in ordinary Ceres traffic.
//
// Spawned-fixture pins live in npc-jobs-runtime-occupational-heads.test.mjs.
// This file is the missing census: seed 47, Ceres reference pocket, headless,
// no hand-spawned jobs. Each of tractor / elastic_whip / frame_coupler must
// appear on a live npc_tow line from an NPC job within 10 minutes.
// Hitch cannot fit the M heads; NPCs snapshot the verb onto derived.

import assert from 'node:assert/strict';
import test from 'node:test';

import { SIM_DT } from '../src/core/sim.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { isHostileForAI } from '../src/ai/engagementAuthority.js';
import { MODULES } from '../src/data/modules.js';
import { SHIPS } from '../src/data/ships.js';
import {
  applyFeatureConfigToMaps,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import { CERES_REFERENCE_ACCEPTANCE_ENTRY } from '../src/data/sectorActivityPockets.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { makeShipEntitySpec, buildSlotList, fits } from '../src/systems/ships.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { getNodeSystemFactoryTable } from '../src/runtime/nodeSystemFactoryTable.js';
import {
  PROOF_PLAYER_HULL_ID,
  PROOF_REFINERY_POCKET_ID,
  PROOF_SECTOR_ID,
  PROOF_SHOVE_WEAPON_ID,
  pocketEntryGlobal,
} from '../src/testing/lab/proofSixtySeconds.js';

const SEED = Number(process.env.PQ029_SEED || CERES_REFERENCE_ACCEPTANCE_ENTRY.fixedSeed);
const WINDOW_S = 600;
const HEADS = Object.freeze(['tractor', 'elastic_whip', 'frame_coupler']);
const HEAD_MODULES = Object.freeze([
  'mod_tractor_beam_m',
  'mod_elastic_whip_m',
  'mod_frame_coupler_m',
]);

function withFeatures(runtime, fn) {
  const previous = snapshotFeatureMaps();
  applyFeatureConfigToMaps(runtime && runtime.config && runtime.config.features);
  try {
    return fn();
  } finally {
    restoreFeatureMaps(previous);
  }
}

function roleOf(entity) {
  const data = entity && entity.data || {};
  return data.trafficRole || data.role || data.jobKind || '';
}

function jobLabel(state, owner, attachment) {
  const data = owner && owner.data || {};
  const jobId = data.jobId;
  const entry = jobId && state.npcJobs && state.npcJobs.byId
    ? state.npcJobs.byId[jobId]
    : null;
  const kind = entry && entry.kind || data.jobKind || '';
  const role = roleOf(owner);
  const slot = data.activityActorSlotId || '';
  return [kind, role, slot || attachment.controlMode].filter(Boolean).join('/');
}

function sampleHeads(state) {
  const bag = state.combat && state.combat.attachments && state.combat.attachments.byId;
  const rows = [];
  if (!bag) return rows;
  for (const attachment of Object.values(bag)) {
    if (!attachment || attachment.state !== 'active') continue;
    if (attachment.controlMode !== 'npc_tow') continue;
    const headId = attachment.tetherPolicy && attachment.tetherPolicy.headId;
    if (!HEADS.includes(headId)) continue;
    const owner = state.entities && state.entities.get(attachment.ownerId);
    if (!owner || owner.alive === false) continue;
    const target = state.entities.get(attachment.targetId);
    if (!target || target.alive === false || target.physicsBody === false) continue;
    const jobId = owner.data && owner.data.jobId;
    if (!jobId || !state.npcJobs || !state.npcJobs.byId || !state.npcJobs.byId[jobId]) continue;
    rows.push({
      headId,
      job: jobLabel(state, owner, attachment),
      jobId,
      timeS: Number((Number(state.simTime) || 0).toFixed(2)),
      seed: SEED,
      ownerPos: { ...owner.pos },
      targetPos: { ...target.pos },
      playerDistanceWU: Number(Math.hypot(
        owner.pos.x - state.entities.get(state.playerId).pos.x,
        owner.pos.z - state.entities.get(state.playerId).pos.z,
      ).toFixed(2)),
    });
  }
  return rows;
}

async function bootCeres(seed) {
  const table = getNodeSystemFactoryTable({ tacticalAI: true, flightBackend: 'v3' });
  if (!table.get('stuntGrammar')) table.set('stuntGrammar', stuntGrammar);
  const runtime = createAuthoritativeRuntime({
    profileId: 'production',
    nodeSafeOnly: true,
    seed,
    systemLookup: table,
    slots: {
      aiSlot: table.get('aiSlot'),
      flightSlot: table.get('flightSlot'),
      aiBackend: 'sg06-tactical',
      flightBackend: 'v3',
    },
  });
  const state = runtime.state;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.settings.gameplay.flightBackend = 'v3';
  state.settings.gameplay.aiBackend = 'sg06-tactical';
  if (!state.input.actions) state.input.actions = { brake: false, autopursuit: false };

  const player = runtime.spawn(makeShipEntitySpec(PROOF_PLAYER_HULL_ID, {
    isPlayer: true,
    player: state.player,
    pos: { x: 0, z: 0 },
    fittings: [PROOF_SHOVE_WEAPON_ID],
    factionId: 'faction_free',
  }));
  state.playerId = player.id;

  const world = runtime.getSystem('world');
  assert.ok(world && typeof world.enterSector === 'function', 'Ceres census needs world.enterSector');
  world.enterSector(PROOF_SECTOR_ID);
  const at = pocketEntryGlobal(PROOF_REFINERY_POCKET_ID);
  world.relocatePlayerInSector({ x: at.x, z: at.z, heading: 0 }, { reason: 'pq-029-03:ceres-census' });
  player.vel.x = 0;
  player.vel.z = 0;

  const physics = runtime.getSystem('physics');
  const ready = await withFeatures(runtime, () => physics.prepareBackend(state, { reset: true }));
  assert.equal(ready, true, 'SG-02 must come up for occupational lines');
  return { runtime, state };
}

test('Hitch cannot fit the M Massline heads', () => {
  const hitch = SHIPS.find((ship) => ship.id === 'ship_kestrel');
  assert.ok(hitch, 'Hitch (ship_kestrel) remains authored');
  const slots = buildSlotList(hitch);
  const utility = slots.filter((slot) => slot.type === 'utility');
  assert.ok(utility.length > 0, 'Hitch has a utility slot');
  assert.ok(utility.every((slot) => slot.size === 'S'), 'Hitch utility stays S');
  for (const id of HEAD_MODULES) {
    const def = MODULES.find((module) => module.id === id);
    assert.ok(def, `missing ${id}`);
    assert.equal(def.size, 'M');
    assert.ok(utility.every((slot) => fits(slot, def) === false), `Hitch must not fit ${id}`);
  }
});

test('Ceres salvage and its scavenger spawn at the authored field in global space', async () => {
  const { runtime, state } = await bootCeres(SEED);
  try {
    const zones = zonesForSector(PROOF_SECTOR_ID).filter((zone) => zone.type === 'derelict_field');
    const points = state.salvage.points;
    assert.ok(points.length, `seed ${SEED} needs existing salvage work`);
    // 05de5d43d places the Tally Three crate on this salvage list. It is a named
    // work source, not a derelict-field scatter; every field point is still proved.
    const fieldPoints = points.filter((point) => zones.some((zone) => zone.id === point.zoneId));
    assert.ok(fieldPoints.length, `seed ${SEED} needs a derelict-field salvage point`);
    for (const point of fieldPoints) {
      const zone = zones.find((candidate) => candidate.id === point.zoneId);
      assert.ok(zone, 'salvage belongs to an authored derelict field');
      const center = sectorLocalToGlobalForSector(zone.center, PROOF_SECTOR_ID);
      const wreck = state.entities.get(point.entityId);
      assert.ok(wreck, 'salvage record resolves to its existing wreck');
      assert.deepEqual({ x: wreck.pos.x, z: wreck.pos.z }, point.pos,
        'record and body share the same global position');
      assert.ok(Math.hypot(wreck.pos.x - center.x, wreck.pos.z - center.z) <= zone.radius,
        `seed ${SEED}: wreck ${JSON.stringify(wreck.pos)} must be at global field ${JSON.stringify(center)}`);
      const scavenger = [...state.entities.values()].find((entity) =>
        entity.data?.wreckFieldId === `salvage:${zone.id}` && roleOf(entity) === 'scavenger');
      assert.ok(scavenger, 'the existing wreck-field ecology supplies the scavenger');
      assert.ok(Math.hypot(scavenger.pos.x - wreck.pos.x, scavenger.pos.z - wreck.pos.z) < 390,
        'scavenger and wreck occupy the same working volume');
      console.log('PQ-029.03 spawn', JSON.stringify({ seed: SEED, center, wreck: wreck.pos, scavenger: scavenger.pos }));
    }
    const pools = new Map(points.map((point) => [point.id,
      structuredClone(state.entities.get(point.entityId).data.salvagePool)]));
    let scavenger = [...state.entities.values()].find((entity) =>
      roleOf(entity) === 'scavenger' && entity.data?.wreckFieldId?.startsWith('salvage:'));
    assert.ok(scavenger && scavenger.data.jobId,
      `salvage:placed must adopt the scavenger before stepping (sector=${state.world.currentSectorId})`);
    const originalJobId = scavenger.data.jobId;
    const sameFactionArmedNeighbor = [...state.entities.values()]
      .filter((entity) => entity !== scavenger && entity.type === 'ship'
        && entity.team === scavenger.team && entity.factionId === scavenger.factionId
        && entity.data?.ai?.roe === 'weapons_free' && entity.data.ai.passive !== true
        && Math.hypot(entity.pos.x - scavenger.pos.x, entity.pos.z - scavenger.pos.z) <= 520)
      .sort((a, b) => Math.hypot(a.pos.x - scavenger.pos.x, a.pos.z - scavenger.pos.z)
        - Math.hypot(b.pos.x - scavenger.pos.x, b.pos.z - scavenger.pos.z))[0];
    assert.ok(sameFactionArmedNeighbor,
      'the field reproduces the nearby same-faction weapons-free Reach traffic');
    assert.equal(isHostileForAI(state, scavenger, sameFactionArmedNeighbor), false);
    assert.equal(isHostileForAI(state, sameFactionArmedNeighbor, scavenger), false);
    runtime.step(SIM_DT);
    assert.equal(scavenger.data.jobId, originalJobId,
      'the existing scavenger keeps its durable job through the first world tick');
    const adoptedEntry = state.npcJobs.byId[originalJobId];
    assert.notEqual(adoptedEntry.job.phase, NPC_JOB_PHASE.FLEE,
      'a same-faction Reach weapons-free patrol does not scatter the Reach scavenger');
    assert.ok(sampleHeads(state).some((row) => row.headId === 'tractor' && row.jobId === originalJobId),
      'the booked scavenger creates a live tractor line to its nearby salvage on the first ordinary tick');
    runtime.bus.emit('salvage:placed', { sectorId: PROOF_SECTOR_ID });
    runtime.bus.emit('salvage:placed', { sectorId: 'sector_unrelated' });
    assert.equal(scavenger.data.jobId, originalJobId,
      'repeated and foreign-sector salvage notices do not replace the existing scavenger job');
    for (const point of points) {
      if (!state.entities.has(point.entityId)) {
        const far = state.world.farActors.byId.get(point.entityId);
        assert.ok(far, 'out-of-range salvage survives in the far table');
        assert.equal(far.data.salvagePointId, point.id);
        assert.deepEqual(far.data.salvagePool, pools.get(point.id), 'shelving preserves all salvage');
        runtime.getSystem('world').relocatePlayerInSector(point.pos, { reason: 'pq-029-03:salvage-approach' });
        runtime.step(SIM_DT);
      }
      const wreck = state.entities.get(point.entityId);
      assert.ok(wreck, 'approaching real salvage restores its physical body');
      assert.equal(wreck.data.salvagePointId, point.id);
      assert.deepEqual(wreck.data.salvagePool, pools.get(point.id), 'the same salvage remains playable');
    }
  } finally {
    runtime.dispose();
  }
});

test('adopted Ceres scavenger resumes its booked wreck after a real flee excursion', async () => {
  const { runtime, state } = await bootCeres(SEED);
  try {
    let scavenger = [...state.entities.values()].find((entity) =>
      roleOf(entity) === 'scavenger' && entity.data?.wreckFieldId?.startsWith('salvage:'));
    assert.ok(scavenger?.data?.jobId, 'the authored field scavenger is adopted');
    const jobId = scavenger.data.jobId;
    const entry = state.npcJobs.byId[jobId];
    const targetId = entry.job.payload.targetId;
    const target = state.entities.get(targetId);
    assert.ok(target && target.data?.salvagePool, 'the booked job points at its live wreck');
    const initialWorkerId = scavenger.id;
    const worldRecordId = entry.worldRecordId;
    const currentWorker = () => {
      const active = [...state.entities.values()].filter((entity) =>
        entity.alive !== false && entity.data?.worldRecordId === worldRecordId
        && entity.data?.jobId === jobId && entity.data?.wreckFieldId?.startsWith('salvage:'));
      assert.ok(active.length <= 1, `one active generation for ${worldRecordId}`);
      if (active.length === 1) return { entity: active[0], pos: active[0].pos, generation: active[0].occupantGeneration };
      const far = (state.world.farActors?.rows || []).filter((row) =>
        row.alive !== false && row.data?.worldRecordId === worldRecordId && row.jobId === jobId);
      assert.ok(far.length <= 1, `one far row for ${worldRecordId}`);
      if (far.length === 1) return { row: far[0], pos: far[0].pos };
      // Ceres may hold an ecological body only in the durable world-record bag between
      // residency passes. Join by stable record ID; never inspect the recycled entity slot.
      const record = state.world.records?.byId?.[worldRecordId];
      if (record?.recordId === worldRecordId && record.alive !== false) {
        return { record, pos: record.pos };
      }
      return null;
    };
    const extractions = [];
    runtime.bus.on('salvage:npcExtraction', (event) => extractions.push(event));
    const originalRoute = structuredClone(entry.job.route);
    const originalPool = structuredClone(target.data.salvagePool);

    runtime.step(SIM_DT);
    assert.ok(sampleHeads(state).some((row) => row.jobId === jobId && row.headId === 'tractor'),
      `the real adopted job latches its original wreck (phase=${entry.job.phase}, target=${targetId}, booked=${entry._salvorBookedTarget?.id ?? 'none'}, tow=${entry.towTargetId ?? 'none'})`);

    // The regular damage listener owns interruption. The player stays at the authored pocket,
    // letting the worker's own FlightV3 FLEE and sim-clock threat expiry drive the excursion.
    runtime.bus.emit('combat:damage', {
      targetId: initialWorkerId, attackerId: state.playerId,
      amount: 5, rawTotal: 5, applied: 5,
    });
    assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);
    let resumedAt = null;
    for (let i = 0; i < 900; i += 1) {
      runtime.step(SIM_DT);
      const worker = currentWorker();
      if (worker?.entity) scavenger = worker.entity;
      if (entry.job.phase !== NPC_JOB_PHASE.FLEE) { resumedAt = i; break; }
    }
    assert.notEqual(resumedAt, null, 'threat clears and the canonical job runtime resumes the scavenger');

    let worker = currentWorker();
    assert.ok(worker, `the same world record remains materialized or shelved (${worldRecordId})`);
    const resumedDistance = Math.hypot(worker.pos.x - target.pos.x, worker.pos.z - target.pos.z);
    assert.ok(resumedDistance > 180, `the flee excursion leaves the wreck work radius (distance ${resumedDistance.toFixed(1)})`);
    if (worker.entity) assert.equal(worker.entity.data.jobId, jobId, 'the same live generation remains booked');
    if (worker.row) assert.equal(worker.row.jobId, jobId, 'the same shelved world record retains its job binding');
    if (worker.record) {
      assert.equal(worker.record.recordId, worldRecordId, 'the durable record remains the same actor');
      assert.equal(state.npcJobs.byId[jobId], entry, 'the canonical job remains bound to that durable identity');
      assert.equal(worker.record.jobId, jobId, 'the durable record retains its live job anchor');
    }
    assert.equal(entry.job.payload.targetId, targetId, 'the same wreck remains the booked target');
    assert.deepEqual(entry.job.route, originalRoute, 'the authored route is preserved through flee/resume');
    assert.deepEqual(target.data.salvagePool, originalPool, 'the wreck pool is untouched while the scavenger is away');
    for (let i = 0; i < 1200; i += 1) {
      runtime.step(SIM_DT);
      worker = currentWorker();
      assert.ok(worker, `the same durable worker remains observed at ${state.simTime.toFixed(2)}s`);
      assert.equal(state.npcJobs.byId[jobId], entry, 'egress cannot release the interrupted job');
      if (worker.entity) assert.equal(worker.entity.data._egressExitAt, undefined,
        'ambient combat egress cannot schedule this working crew for retirement');
      if (worker.record) {
        assert.equal(worker.record.jobId, jobId, 'a virtual worker retains the booked job');
      }
      const distance = Math.hypot(worker.pos.x - target.pos.x, worker.pos.z - target.pos.z);
      if (worker.record || distance > 180) {
        assert.notEqual(entry.job.phase, NPC_JOB_PHASE.WORK,
          `the same job must not enter WORK while virtual/far at ${distance.toFixed(1)} WU`);
        assert.notEqual(entry.job.phase, NPC_JOB_PHASE.LOAD,
          'the same job must not load salvage while virtual/far from its physical workface');
      }
    }
    if (worker.record || Math.hypot(worker.pos.x - target.pos.x, worker.pos.z - target.pos.z) > 180) {
      assert.notEqual(entry.job.phase, NPC_JOB_PHASE.WORK,
        'the far-distance resume window cannot advance into WORK');
      assert.notEqual(entry.job.phase, NPC_JOB_PHASE.LOAD,
        'the far-distance resume window cannot advance into LOAD');
    }
    assert.equal(extractions.length, 0, 'no salvage extraction completes during the displaced window');
    assert.deepEqual(target.data.salvagePool, originalPool,
      'distance cannot drain or replace the booked wreck pool');
  } finally {
    runtime.dispose();
  }
});

test('Ceres ordinary traffic uses tractor, whip, and coupler within 10 min', {
  timeout: 600_000,
}, async () => {
  const { runtime, state } = await bootCeres(SEED);
  const first = {};
  const ticks = Math.round(WINDOW_S * 60);
  try {
    for (let i = 0; i < ticks; i += 1) {
      runtime.step(SIM_DT);
      if (i % 30 !== 0 && i !== ticks - 1) continue;
      for (const row of sampleHeads(state)) {
        if (!first[row.headId]) first[row.headId] = row;
      }
      if (HEADS.every((headId) => first[headId])) break;
    }

    const sightings = HEADS.map((headId) => first[headId] || null);
    console.log('PQ-029.03 sightings');
    console.log(JSON.stringify(first));
    console.log('head            job                              timeS   seed');
    for (const headId of HEADS) {
      const row = first[headId];
      if (!row) {
        console.log(`${headId.padEnd(16)} MISSING`);
        continue;
      }
      console.log(
        `${row.headId.padEnd(16)}${String(row.job).padEnd(34)}${String(row.timeS).padEnd(8)}${row.seed}`,
      );
    }

    if (!HEADS.every((headId) => first[headId])) {
      const roles = {};
      for (const entity of state.entities.values()) {
        if (!entity || entity.type !== 'ship') continue;
        const role = roleOf(entity) || 'none';
        roles[role] = (roles[role] || 0) + 1;
      }
      const jobs = [];
      const byId = state.npcJobs && state.npcJobs.byId || {};
      for (const entry of Object.values(byId)) {
        jobs.push({
          kind: entry.kind || (entry.job && entry.job.kind),
          phase: entry.job && entry.job.phase,
          role: entry.job && entry.job.payload && entry.job.payload.role,
          tow: entry.towAttachmentId || null,
        });
      }
      console.log('PQ-029.03 census context', JSON.stringify({ t: Number((state.simTime || 0).toFixed(2)), roles, jobs }));
    }

    for (const headId of HEADS) {
      assert.ok(first[headId], `ordinary Ceres traffic never used ${headId} within ${WINDOW_S}s`);
      assert.ok(first[headId].timeS <= WINDOW_S, `${headId} sighting ${first[headId].timeS}s exceeds 10 min`);
      assert.equal(first[headId].seed, SEED);
    }
    assert.ok(sightings.every(Boolean));
  } finally {
    runtime.dispose();
  }
});
