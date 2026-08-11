/**
 * PACKET U03 / WF-01 — general salvor occupation (working aftermath).
 *
 * Seeded wreck/payload → cutter dispatched after notice delay → works → departs with
 * taken value; player kill drops it back; beat-to-payload retargets/leaves empty;
 * save round-trip; determinism; concurrent cap; Ceres exclusion.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  lootShards,
  salvagePoolFromManifest,
} from '../src/systems/lootShards.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import {
  MAX_GENERAL_SALVORS_PER_SECTOR,
  traffic,
  trafficRoleMixForSector,
} from '../src/systems/traffic.js';

const SECTOR_ID = 'sector_test_salvor_aftermath';
const YARD_ID = 'station_test_scrap_yard';

const FLAG_PRIOR = {
  enabled: MASSLINE2_FLAGS.enabled,
  lootShards: MASSLINE2_FLAGS.lootShards,
};

function enableLootFlags() {
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
}

function restoreLootFlags() {
  MASSLINE2_FLAGS.enabled = FLAG_PRIOR.enabled;
  MASSLINE2_FLAGS.lootShards = FLAG_PRIOR.lootShards;
}

function boot(seed = 47047) {
  enableLootFlags();
  const sim = createSimulation({
    seed,
    systems: [npcJobsRuntime, traffic, lootShards, saveSystem],
    updateOrder: [npcJobsRuntime, traffic, lootShards],
  });
  const events = [];
  for (const name of [
    'salvage:npcExtraction',
    'salvage:npcUnload',
    'loot:manifestPayload',
    'npcjobs:work',
    'npcjobs:load',
    'npcjobs:unload',
  ]) {
    sim.bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  }
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;
  sim.state.player.credits = 9001;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6, flags: { persistent: true },
  });
  sim.state.playerId = player.id;

  const yard = sim.spawn({
    type: 'station',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 40,
    data: { stationId: YARD_ID },
  });

  // createSimulation forks module singletons — always use the registry instance.
  const trafficSys = sim.registry.get('traffic');
  const dispose = () => {
    sim.dispose();
    restoreLootFlags();
  };
  return { sim, events, player, yard, trafficSys, dispose };
}

function spawnWreck(sim, {
  idHint = null,
  pos = { x: 320, z: 40 },
  pool = { cmdty_scrap_metal: 5, cmdty_salvage_electronics: 2 },
} = {}) {
  const wreck = sim.spawn({
    type: 'wreck',
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 9,
    mass: 1e6,
    hull: 1,
    hullMax: 1,
    data: {
      salvagePool: { ...pool },
      salvageTimeLeft: 8,
      parentType: 'ship',
    },
    flags: { persistent: true },
  });
  if (idHint != null) wreck.id = idHint;
  return wreck;
}

function spawnLoosePayload(sim, {
  pos = { x: 280, z: -30 },
  pool = { cmdty_food: 4, cmdty_fuel_cells: 2 },
} = {}) {
  return sim.spawn({
    type: 'payload',
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    radius: 5,
    mass: 40,
    hull: 100,
    hullMax: 100,
    data: {
      kind: 'payload',
      payloadType: CIVILIAN_MANIFEST_PAYLOAD_TYPE,
      salvagePool: { ...pool },
      ownerId: null,
      factionId: 'neutral',
    },
    flags: { persistent: true },
  });
}

function forceNoticeReady(body, simTime = 0) {
  body.data.salvorNoticeAt = simTime;
}

function generalSalvors(sim) {
  return (sim.state.traffic.freighters || [])
    .map((rec) => sim.state.entities.get(rec.id))
    .filter((e) => e && e.alive !== false && e.data && e.data.trafficRole === 'salvor'
      && !e.data.ceresActivityCast && !e.data.activityActorSlotId);
}

function salvorJob(sim, salvor) {
  if (!salvor || !salvor.data || !salvor.data.jobId) return null;
  const entry = sim.helpers.npcJobs.get(salvor.data.jobId);
  return entry && entry.job ? entry.job : null;
}

function completeWorkOnce(sim, salvor) {
  const job = salvorJob(sim, salvor);
  assert.ok(job, 'salvor has a live job');
  // Snap to the work face so the test does not wait on transit geometry.
  job.phase = NPC_JOB_PHASE.WORK;
  job.routeIndex = 1;
  job.progress = 0.99;
  job.workS = 1;
  for (let i = 0; i < 8; i++) {
    sim.step(0.5);
    const cargo = salvor.data && salvor.data.cargoManifest;
    if (cargo && cargo.totalQty > 0) return cargo;
  }
  return salvor.data && salvor.data.cargoManifest;
}

test('ambient role mix never rolls general salvors (demand-driven only)', () => {
  const mix = trafficRoleMixForSector({ id: SECTOR_ID, security: 0.5, trafficPerMin: 12 });
  assert.equal(mix.salvor, 0, 'salvor weight must stay zero so goldens cannot ambient-spawn cutters');
});

test('seeded wreck → salvor dispatched → works → departs with taken value', () => {
  const { sim, events, yard, trafficSys, dispose } = boot(104);
  try {
    const wreck = spawnWreck(sim, {
      pool: { cmdty_scrap_metal: 6, cmdty_salvage_electronics: 1 },
    });
    forceNoticeReady(wreck, sim.state.simTime || 0);

    // One traffic tick is enough for demand dispatch once notice is ready.
    trafficSys.update(0.25, sim.state);
    const salvors = generalSalvors(sim);
    assert.equal(salvors.length, 1, 'exactly one general salvor dispatches to the wreck');
    const salvor = salvors[0];
    assert.ok(salvor.data.jobId, 'salvor receives an npc job (single intent writer)');
    const job = salvorJob(sim, salvor);
    assert.equal(job.kind, 'salvor');
    assert.match(job.route[0].id, /^yard:/);
    assert.match(job.route[1].id, new RegExp(`^hulk:${wreck.id}$`));
    assert.equal(wreck.data.salvorClaimedBy, salvor.data.worldRecordId);

    const cargo = completeWorkOnce(sim, salvor);
    assert.ok(cargo && cargo.totalQty > 0, 'salvor carries taken salvage as cargoManifest');
    assert.deepEqual(
      salvagePoolFromManifest(cargo),
      { cmdty_scrap_metal: 6, cmdty_salvage_electronics: 1 },
    );
    assert.equal(sim.state.player.credits, 9001, 'extraction never mints credits');
    assert.equal(
      Object.values(wreck.data.salvagePool || {}).reduce((a, b) => a + b, 0),
      0,
      'wreck pool is drained — no double take',
    );
    assert.ok(
      events.some((e) => e.name === 'salvage:npcExtraction' && e.payload.totalQty === 7),
      'extraction receipt emitted',
    );

    // Unload at the yard clears the hold without a freight market mint.
    job.phase = NPC_JOB_PHASE.UNLOAD;
    job.routeIndex = 0;
    job.progress = 0.99;
    job.unloadS = 1;
    for (let i = 0; i < 6; i++) sim.step(0.5);
    assert.equal(salvor.data.cargoManifest.totalQty, 0, 'yard unload empties the cradle');
    assert.ok(events.some((e) => e.name === 'salvage:npcUnload'));
    assert.equal(yard.data.stationId, YARD_ID);
  } finally {
    dispose();
  }
});

test('player kill mid-extraction drops the taken value as a cargo body', () => {
  const { sim, events, player, trafficSys, dispose } = boot(205);
  try {
    const wreck = spawnWreck(sim, {
      pool: { cmdty_scrap_metal: 4, cmdty_ore_iron: 2 },
    });
    forceNoticeReady(wreck, 0);
    trafficSys.update(0.25, sim.state);
    const salvor = generalSalvors(sim)[0];
    assert.ok(salvor);
    completeWorkOnce(sim, salvor);
    assert.ok(salvor.data.cargoManifest.totalQty > 0);

    salvor.alive = false;
    sim.bus.emit('entity:killed', {
      id: salvor.id,
      killerId: player.id,
      type: 'ship',
      pos: { x: salvor.pos.x, z: salvor.pos.z },
      targetHostileToPlayer: false,
    });

    const bodies = sim.state.entityList.filter(
      (e) => e && e.alive !== false && e.type === 'payload'
        && e.data && e.data.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE,
    );
    assert.equal(bodies.length, 1, 'exactly one cargo body drops from the killed salvor');
    assert.deepEqual(
      bodies[0].data.salvagePool,
      { cmdty_ore_iron: 2, cmdty_scrap_metal: 4 },
    );
    assert.ok(events.some((e) => e.name === 'loot:manifestPayload'));
    // Wreck claim is released so another cutter may re-bind if anything remains.
    assert.equal(wreck.data.salvorClaimedBy, undefined);
  } finally {
    dispose();
  }
});

test('beating the salvor to the payload leaves it empty (no minted scrap)', () => {
  const { sim, trafficSys, dispose } = boot(306);
  try {
    const payload = spawnLoosePayload(sim, {
      pool: { cmdty_food: 5 },
    });
    forceNoticeReady(payload, 0);
    trafficSys.update(0.25, sim.state);
    const salvor = generalSalvors(sim)[0];
    assert.ok(salvor);
    assert.match(salvorJob(sim, salvor).route[1].id, new RegExp(`^payload:${payload.id}$`));

    // Player "beats" the cutter: absorb the body before WORK.
    payload.alive = false;
    payload.data.salvagePool = {};
    if (sim.state.entities.delete) sim.state.entities.delete(payload.id);
    const idx = sim.state.entityList.indexOf(payload);
    if (idx >= 0) sim.state.entityList.splice(idx, 1);

    trafficSys.update(0.25, sim.state);
    completeWorkOnce(sim, salvor);
    const cargo = salvor.data.cargoManifest;
    assert.ok(!cargo || cargo.totalQty === 0, 'empty departure — never invents scrap');
  } finally {
    dispose();
  }
});

test('concurrent general salvors are capped per sector', () => {
  const { sim, trafficSys, dispose } = boot(407);
  try {
    for (let i = 0; i < 5; i++) {
      const wreck = spawnWreck(sim, {
        pos: { x: 200 + i * 80, z: i * 40 },
        pool: { cmdty_scrap_metal: 3 },
      });
      forceNoticeReady(wreck, 0);
    }
    trafficSys.update(0.25, sim.state);
    const salvors = generalSalvors(sim);
    assert.equal(
      salvors.length,
      MAX_GENERAL_SALVORS_PER_SECTOR,
      `cap is ${MAX_GENERAL_SALVORS_PER_SECTOR}`,
    );
    assert.ok(salvors.every((s) => s.data.jobId), 'each capped salvor holds a job');
  } finally {
    dispose();
  }
});

test('Ceres authored pocket excludes general salvor dispatch', () => {
  const { sim, trafficSys, dispose } = boot(508);
  try {
    sim.state.world.currentSectorId = CERES_ACTIVITY_SECTOR_ID;
    const wreck = spawnWreck(sim, { pool: { cmdty_scrap_metal: 8 } });
    forceNoticeReady(wreck, 0);
    trafficSys.update(0.25, sim.state);
    assert.equal(generalSalvors(sim).length, 0, 'no general-population salvor in Ceres');
    assert.equal(wreck.data.salvorClaimedBy, undefined);
  } finally {
    dispose();
  }
});

test('dispatch is deterministic for identical seed + wreck layout', () => {
  function snapshot(seed) {
    const { sim, trafficSys, dispose } = boot(seed);
    try {
      const wreck = spawnWreck(sim, {
        pos: { x: 250, z: 90 },
        pool: { cmdty_scrap_metal: 3, cmdty_salvage_electronics: 1 },
      });
      forceNoticeReady(wreck, 0);
      trafficSys.update(0.25, sim.state);
      const salvor = generalSalvors(sim)[0];
      assert.ok(salvor);
      const job = salvorJob(sim, salvor);
      return {
        worldRecordId: salvor.data.worldRecordId,
        jobId: salvor.data.jobId,
        route: job.route.map((wp) => ({ id: wp.id, x: wp.pos.x, z: wp.pos.z })),
        claim: wreck.data.salvorClaimedBy,
        pos: { x: salvor.pos.x, z: salvor.pos.z },
      };
    } finally {
      dispose();
    }
  }
  assert.deepEqual(snapshot(611), snapshot(611));
});

test('save/Continue round-trips mid-job salvor and carried payload', () => {
  const { sim, trafficSys, dispose } = boot(712);
  try {
    const wreck = spawnWreck(sim, {
      pool: { cmdty_scrap_metal: 5, cmdty_alloys: 1 },
    });
    forceNoticeReady(wreck, 0);
    trafficSys.update(0.25, sim.state);
    const salvor = generalSalvors(sim)[0];
    assert.ok(salvor);
    completeWorkOnce(sim, salvor);
    const before = {
      jobId: salvor.data.jobId,
      phase: salvorJob(sim, salvor).phase,
      totalQty: salvor.data.cargoManifest.totalQty,
      pool: salvagePoolFromManifest(salvor.data.cargoManifest),
      worldRecordId: salvor.data.worldRecordId,
    };
    assert.ok(before.totalQty > 0);

    // Park mid-return so Continue resumes a loaded cutter, not a yard idle.
    const job = salvorJob(sim, salvor);
    job.phase = NPC_JOB_PHASE.RETURN;
    job.routeIndex = 1;
    job.progress = 0.35;

    const saveSys = sim.registry.get('save');
    const envelope = saveSys.serialize('salvor-occupation-roundtrip');
    assert.equal(
      saveSys.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'salvor-occupation-roundtrip'),
      true,
    );

    const restored = [...sim.state.entities.values()].find(
      (e) => e && e.data && e.data.worldRecordId === before.worldRecordId,
    );
    assert.ok(restored, 'salvor hull rematerializes');
    assert.equal(restored.data.jobId, before.jobId);
    const restoredJob = salvorJob(sim, restored);
    assert.ok(restoredJob, 'job ledger restores');
    assert.equal(restoredJob.phase, NPC_JOB_PHASE.RETURN);
    assert.equal(restored.data.cargoManifest.totalQty, before.totalQty);
    assert.deepEqual(salvagePoolFromManifest(restored.data.cargoManifest), before.pool);
  } finally {
    dispose();
  }
});

test('golden-style sessions without npcJobs never spawn general salvors', () => {
  // Mirrors the sf-sim golden harness: traffic runs, job runtime is absent.
  const { sim, trafficSys, dispose } = boot(813);
  try {
    const priorHelpers = trafficSys.helpers;
    trafficSys.helpers = { spawnEntity: sim.helpers.spawnEntity };
    const wreck = spawnWreck(sim, { pool: { cmdty_scrap_metal: 9 } });
    forceNoticeReady(wreck, 0);
    trafficSys.update(0.25, sim.state);
    assert.equal(generalSalvors(sim).length, 0, 'no cutter without job machinery');
    trafficSys.helpers = priorHelpers;
  } finally {
    dispose();
  }
});
