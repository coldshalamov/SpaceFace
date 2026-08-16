import assert from 'node:assert/strict';
import test from 'node:test';

import {
  authorizeAIEngagement,
  isCeresLivingChainPredationAuthorized,
} from '../src/ai/engagementAuthority.js';
import { createSimulation } from '../src/core/sim.js';
import {
  CERES_ACTIVITY_POCKETS,
  CERES_ACTIVITY_SECTOR_ID,
} from '../src/data/sectorActivityPockets.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { lawSecurity } from '../src/systems/lawSecurity.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { RECORD_KIND, stableRecordId } from '../src/world/worldRecords.js';

const SEED = 47;

function actorSlot(slotId) {
  const slot = CERES_ACTIVITY_POCKETS
    .flatMap((pocket) => pocket.actorSlots)
    .find((candidate) => candidate.id === slotId);
  assert.ok(slot, `missing Ceres slot ${slotId}`);
  return slot;
}

function worldRecordId(slotId) {
  return stableRecordId(SEED, CERES_ACTIVITY_SECTOR_ID, RECORD_KIND.CONVOY, actorSlot(slotId).worldRecordSlotId);
}

function boot() {
  const jobEntries = new Map();
  const claims = new Map();
  const helpers = {
    npcJobs: {
      byEntity(entityId) { return jobEntries.get(entityId) || null; },
      claimControl(jobId, request) {
        if (claims.has(jobId)) return { granted: false, reason: 'already_claimed' };
        const entry = [...jobEntries.values()].find((candidate) => candidate.job.id === jobId);
        if (!entry) return { granted: false, reason: 'missing_job' };
        const claim = {
          claimId: request.claimId,
          holder: request.holder,
          claimedEntityId: entry.entityId,
        };
        claims.set(jobId, claim);
        return { granted: true, claim };
      },
      releaseControl(jobId, claimId) {
        const claim = claims.get(jobId);
        if (!claim || claim.claimId !== claimId) return { released: false };
        claims.delete(jobId);
        return { released: true };
      },
      controlClaim(jobId) { return claims.get(jobId) || null; },
    },
  };
  const sim = createSimulation({ seed: SEED, helpers, systems: [lawSecurity, spawnBudget, encounterDirector] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;
  state.story.beatIndex = 4;

  const station = sim.spawn({
    type: 'station', team: 2, factionId: 'faction_dmc',
    pos: { x: 0, z: 0 }, radius: 42, mass: 1e6,
    data: {
      stationId: 'station_ceres', factionId: 'faction_dmc',
      sectorId: CERES_ACTIVITY_SECTOR_ID, dockRadius: 80,
    },
  });
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: -350, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 30, hull: 200, hullMax: 200, data: { ai: {}, intent: {} },
  });
  state.playerId = player.id;

  const haulerRecordId = worldRecordId('ceres_refinery_hauler');
  const hauler = sim.spawn({
    type: 'ship', team: 2, factionId: 'faction_dmc',
    pos: { x: 120, z: 0 }, vel: { x: -2, z: 0 }, radius: 12, mass: 90,
    hull: 160, hullMax: 160,
    data: {
      worldRecordId: haulerRecordId,
      jobId: `job:${haulerRecordId}`,
      activityActorSlotId: 'ceres_refinery_hauler',
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: 'hauler',
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      ai: { passive: true, role: 'hauler', activity: { kind: 'follow_route', reason: 'traffic_job' } },
      intent: {},
    },
  });
  const patrolRecordId = worldRecordId('ceres_cathedral_patrol');
  const patrol = sim.spawn({
    type: 'ship', team: 1, factionId: 'faction_dmc',
    pos: { x: 180, z: 20 }, vel: { x: 0, z: 0 }, radius: 10, mass: 45,
    hull: 180, hullMax: 180,
    data: {
      worldRecordId: patrolRecordId,
      jobId: `job:${patrolRecordId}`,
      activityActorSlotId: 'ceres_cathedral_patrol',
      ceresActivityCast: true,
      ceresActivityJobOwned: true,
      trafficRole: 'patrol',
      sectorId: CERES_ACTIVITY_SECTOR_ID,
      homeSectorId: CERES_ACTIVITY_SECTOR_ID,
      ai: { lawful: true, passive: false, role: 'patrol', activity: { kind: 'follow_route', reason: 'patrol_job' } },
      intent: {},
    },
  });
  const patrolJob = { id: `job:${patrolRecordId}`, kind: 'patrol' };
  jobEntries.set(patrol.id, {
    entityId: patrol.id,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
    worldRecordId: patrolRecordId,
    kind: 'patrol',
    job: patrolJob,
  });
  state.world.activeSector = {
    stations: [{ id: 'station_ceres', name: 'Ceres Refinery', pos: { ...station.pos } }],
  };
  return {
    sim, state, bus, station, player, hauler, patrol, claims,
    director: sim.registry.get('encounterDirector'),
    law: sim.registry.get('lawSecurity'),
  };
}

function transferPayload(h, sequence = 1) {
  const manifest = {
    manifestId: `ceres-ore:${sequence}`,
    freighterKey: h.hauler.data.worldRecordId,
    role: 'hauler',
    lines: [{ commodityId: 'cmdty_ore_iron', qty: 16 }],
    totalQty: 16,
    custody: {
      holderKind: 'traffic',
      holderId: h.hauler.data.worldRecordId,
      acquiredBy: 'traffic:ceresMinerHaulerHandoff',
      handoffId: `handoff:${sequence}`,
      transferSeq: sequence,
      rootLotId: `lot:${sequence}`,
    },
  };
  h.hauler.data.cargoManifest = manifest;
  return {
    handoffId: manifest.custody.handoffId,
    rootLotId: manifest.custody.rootLotId,
    transferSeq: sequence,
    manifestId: manifest.manifestId,
    commodityId: manifest.lines[0].commodityId,
    qty: manifest.totalQty,
    minerEntityId: 999,
    minerWorldRecordId: 'wr:miner',
    haulerEntityId: h.hauler.id,
    haulerWorldRecordId: h.hauler.data.worldRecordId,
    sectorId: CERES_ACTIVITY_SECTOR_ID,
  };
}

test('real Ceres manifest transfer becomes one physical pirate relation and the law-owned patrol responds', () => {
  const h = boot();
  const payload = transferPayload(h);
  const originalHaulerAi = structuredClone(h.hauler.data.ai);
  h.bus.emit('traffic:ceresManifestTransferred', payload);

  const live = Object.values(h.state.encounterDirector.live)
    .find((candidate) => candidate.data?.ceresLivingChain === true);
  assert.ok(live, 'the conserved traffic handoff opens the living encounter');
  assert.equal(live.data.predationTargetId, h.hauler.id, 'the real traffic hauler remains the carrier');
  assert.equal(live.data.patrolEntityId, h.patrol.id, 'the exact durable Ceres patrol is the responder premise');
  const raider = h.state.entities.get(live.data.predationRaiderId);
  assert.ok(raider && raider.data?.lootTableId === 'reaver_pirate');
  assert.ok(Math.abs(Math.hypot(raider.pos.x - h.hauler.pos.x, raider.pos.z - h.hauler.pos.z) - 145) < 1e-6,
    'the pirate is a physical close intercept, not a timer-only notice');
  assert.equal(h.hauler.data.cargoManifest.totalQty, 16);

  h.state.simTime = live.data.predationNoFireUntil + 0.1;
  h.state.tick = Math.ceil(h.state.simTime * 60);
  h.director.update(1, h.state);
  assert.equal(live.data.predationStatus, 'active');
  assert.equal(isCeresLivingChainPredationAuthorized(h.state, raider, h.hauler), true);
  assert.deepEqual(authorizeAIEngagement({
    state: h.state,
    self: raider,
    target: h.hauler,
    tick: h.state.tick,
    objectiveReason: 'combat_doctrine:interceptor_flyby:strike',
  }), { ok: true, reason: 'authorized' }, 'the exact witnessed manifest crime crosses station protection');

  h.bus.emit('combat:damage', { attackerId: raider.id, targetId: h.hauler.id, applied: 8 });
  const incident = Object.values(h.state.lawSecurity.incidents)[0];
  assert.ok(incident && incident.cause === 'npc_piracy', 'real damage opens the law-owned piracy incident');
  h.state.simTime = incident.dispatchAt + 0.1;
  h.state.tick = Math.ceil(h.state.simTime * 60);
  h.law.update(1 / 60, h.state);
  assert.equal(incident.status, 'responding');
  assert.equal(h.patrol.data.ai.securityTargetId, raider.id, 'law leases the existing patrol onto the pirate');
  assert.equal(h.claims.get(h.patrol.data.jobId)?.holder, 'lawSecurity');

  h.bus.emit('combat:subsystemDisabled', {
    attackerId: raider.id,
    targetId: h.hauler.id,
    subsystemId: 'subsystem_drive',
  });
  const custody = live.data.freightCargoCustody;
  assert.ok(custody && custody.pods.length === 1, 'drive disable makes the ore physically contestable');
  const livePodQty = custody.pods.filter((pod) => pod.status === 'live')
    .reduce((sum, pod) => sum + pod.qty, 0);
  assert.equal(custody.carrierQty + livePodQty, custody.initialQty, 'cargo stays conserved across the spill');
  assert.deepEqual(originalHaulerAi, {
    passive: true,
    role: 'hauler',
    activity: { kind: 'follow_route', reason: 'traffic_job' },
  });
});

test('real refinery settlement closes the pirate beat without retiring the traffic-owned hauler', () => {
  const h = boot();
  const payload = transferPayload(h, 2);
  const originalHaulerAi = structuredClone(h.hauler.data.ai);
  h.bus.emit('traffic:ceresManifestTransferred', payload);
  const live = Object.values(h.state.encounterDirector.live)
    .find((candidate) => candidate.data?.ceresLivingChain === true);
  assert.ok(live);
  const raider = h.state.entities.get(live.data.predationRaiderId);

  h.hauler.data.cargoManifest = {
    ...h.hauler.data.cargoManifest,
    lines: [],
    totalQty: 0,
  };
  h.state.simTime += 1;
  h.state.tick += 60;
  h.director.update(1, h.state);
  assert.equal(h.state.encounterDirector.live[live.id], undefined,
    'the traffic-owned manifest sink is the encounter completion fact');
  assert.equal(h.hauler.data.despawnAt, undefined, 'resolving the encounter does not retire the traffic-owned hull');
  assert.deepEqual(h.hauler.data.ai, originalHaulerAi, 'the adopted hauler returns exactly to traffic AI ownership');
  assert.ok(Number.isFinite(raider.data.despawnAt), 'the spawned pirate leaves through encounter ownership');
});
