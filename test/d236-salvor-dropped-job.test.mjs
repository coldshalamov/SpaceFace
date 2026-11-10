/**
 * D236 — a salvor whose npcJobs entry drops or goes corrupt while its hull lives must
 * release the claims it stamped (body `salvorClaimedBy`, source `claimId`) and drop the
 * dead job reference, instead of locking the body until hull death.
 *
 * Harness mirrors salvor-occupation.test.mjs: npcJobsRuntime + traffic + lootShards on a
 * non-Ceres sector (the general-salvor maintainer is a Ceres no-op by design).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  lootShards,
} from '../src/systems/lootShards.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { traffic } from '../src/systems/traffic.js';

const SECTOR_ID = 'sector_test_salvor_dropped_job';
const YARD_ID = 'station_test_scrap_yard_d236';

const FLAG_PRIOR = {
  enabled: MASSLINE2_FLAGS.enabled,
  lootShards: MASSLINE2_FLAGS.lootShards,
};

function boot(seed = 47047) {
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
  const sim = createSimulation({
    seed,
    systems: [npcJobsRuntime, traffic, lootShards, saveSystem],
    updateOrder: [npcJobsRuntime, traffic, lootShards],
  });
  assert.notEqual(SECTOR_ID, CERES_ACTIVITY_SECTOR_ID);
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;
  sim.state.player.credits = 9001;
  sim.state.player.stats = {};
  sim.state.player.cargo = {
    items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100,
  };
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
  });
  sim.state.playerId = player.id;
  sim.spawn({
    type: 'station', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 40,
    data: { stationId: YARD_ID },
  });
  const trafficSys = sim.registry.get('traffic');
  const dispose = () => {
    sim.dispose();
    MASSLINE2_FLAGS.enabled = FLAG_PRIOR.enabled;
    MASSLINE2_FLAGS.lootShards = FLAG_PRIOR.lootShards;
  };
  return { sim, trafficSys, dispose };
}

function spawnWreck(sim, { pos = { x: 320, z: 40 } } = {}) {
  return sim.spawn({
    type: 'wreck',
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 9,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    data: {
      salvagePool: { cmdty_scrap_metal: 5, cmdty_salvage_electronics: 2 },
      salvageTimeLeft: 8,
      parentType: 'ship',
    },
    flags: { persistent: true },
  });
}

function generalSalvors(sim) {
  return (sim.state.traffic.freighters || [])
    .map((rec) => sim.state.entities.get(rec.id))
    .filter((e) => e && e.alive !== false && e.data && e.data.trafficRole === 'salvor'
      && !e.data.ceresActivityCast && !e.data.activityActorSlotId);
}

function dispatchSalvor(sim, trafficSys, wreck) {
  wreck.data.salvorNoticeAt = sim.state.simTime || 0;
  trafficSys.update(0.25, sim.state);
  const salvors = generalSalvors(sim);
  assert.equal(salvors.length, 1, 'exactly one general salvor dispatches to the wreck');
  const salvor = salvors[0];
  assert.ok(salvor.data.jobId, 'salvor holds an npc job');
  assert.equal(wreck.data.salvorClaimedBy, salvor.data.worldRecordId,
    'dispatch stamps the body claim');
  return salvor;
}

test('dropped job entry releases the body claim and the dead jobId', () => {
  const { sim, trafficSys, dispose } = boot(104);
  try {
    const wreck = spawnWreck(sim);
    const salvor = dispatchSalvor(sim, trafficSys, wreck);
    const worldRecordId = salvor.data.worldRecordId;

    // The job entry vanishes while the hull lives (replan, cull, corrupted save slice).
    salvor.data.jobPhase = 'transit';
    salvor.data.jobProgress = 0.4;
    delete sim.state.npcJobs.byId[salvor.data.jobId];
    trafficSys._maintainGeneralSalvorJobs();

    assert.equal(wreck.data.salvorClaimedBy, undefined,
      'missing job must not strand the body claim');
    assert.equal(salvor.data.jobId, undefined,
      'the dead job reference is dropped so the hull can take fresh work');
    assert.equal(salvor.data.jobPhase, undefined,
      'the phase mirror dies with the binding (no stale WORK readout on a jobless hull)');
    assert.equal(salvor.data.jobProgress, undefined, 'the progress mirror dies too');
    assert.ok(worldRecordId, 'salvor had a worldRecordId before the drop');
  } finally {
    dispose();
  }
});

test('corrupt job entry releases the body claim, source claim, and the dead jobId', () => {
  const { sim, trafficSys, dispose } = boot(203);
  try {
    const wreck = spawnWreck(sim);
    const salvor = dispatchSalvor(sim, trafficSys, wreck);
    const worldRecordId = salvor.data.worldRecordId;

    // A durable source claim rides on the hull record — release must reach it too.
    const releaseCalls = [];
    sim.helpers.salvage = {
      releaseSourceClaim: (req) => { releaseCalls.push(req); return { ok: true }; },
    };
    salvor.data.salvageSource = 'src_test_d236';
    salvor.data.salvagePointId = 'zone_x:sal0';

    const entry = sim.state.npcJobs.byId[salvor.data.jobId];
    assert.ok(entry && entry.job, 'job entry exists before corrupting it');
    entry.job.corrupt = true;
    trafficSys._maintainGeneralSalvorJobs();

    assert.equal(wreck.data.salvorClaimedBy, undefined,
      'corrupt job must not strand the body claim');
    assert.equal(salvor.data.jobId, undefined, 'the corrupt job reference is dropped');
    assert.deepEqual(releaseCalls, [{ sourceKey: 'src_test_d236', claimantId: worldRecordId }],
      'the stamped source claim is released to the salvage owner');
  } finally {
    dispose();
  }
});

test('a live salvor job keeps its claim (control)', () => {
  const { sim, trafficSys, dispose } = boot(307);
  try {
    const wreck = spawnWreck(sim);
    const salvor = dispatchSalvor(sim, trafficSys, wreck);
    trafficSys._maintainGeneralSalvorJobs();
    assert.equal(wreck.data.salvorClaimedBy, salvor.data.worldRecordId,
      'an intact job entry keeps the stamped claim');
    assert.ok(salvor.data.jobId, 'the live job reference survives the maintainer');
  } finally {
    dispose();
  }
});
