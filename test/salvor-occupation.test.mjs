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
import { SECTORS } from '../src/data/sectors.js';
import { CERES_ACTIVITY_SECTOR_ID } from '../src/data/sectorActivityPockets.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  lootShards,
  salvagePoolFromManifest,
} from '../src/systems/lootShards.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { economy } from '../src/systems/economy.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import {
  MAX_GENERAL_SALVORS_PER_SECTOR,
  traffic,
  trafficRoleMixForSector,
} from '../src/systems/traffic.js';

const SECTOR_ID = 'sector_test_salvor_aftermath';
const YARD_ID = 'station_test_scrap_yard';
const FORGE_SECTOR_ID = 'sector_vesta_forge';
const FORGE_ID = 'station_forge';
const SCRAP_ID = 'cmdty_scrap_metal';

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

function boot(seed = 47047, { forge = false } = {}) {
  enableLootFlags();
  const systems = forge
    ? [npcJobsRuntime, traffic, lootShards, economy, saveSystem]
    : [npcJobsRuntime, traffic, lootShards, saveSystem];
  const sim = createSimulation({
    seed,
    systems,
    updateOrder: forge
      ? [npcJobsRuntime, traffic, lootShards, economy]
      : [npcJobsRuntime, traffic, lootShards],
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
  sim.state.world.currentSectorId = forge ? FORGE_SECTOR_ID : SECTOR_ID;
  if (forge) sim.state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
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

  const yard = sim.spawn({
    type: 'station',
    pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 },
    radius: 40,
    data: { stationId: forge ? FORGE_ID : YARD_ID },
  });

  // createSimulation forks module singletons — always use the registry instance.
  const trafficSys = sim.registry.get('traffic');
  const econ = forge ? sim.registry.get('economy') : null;
  if (econ) econ.ensureMarket(FORGE_ID);
  const dispose = () => {
    sim.dispose();
    restoreLootFlags();
  };
  return { sim, events, player, yard, trafficSys, econ, dispose };
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

test('real Vesta salvor unload reaches Forge once, retries safely, and survives Continue', () => {
  const { sim, events, yard, trafficSys, econ, dispose } = boot(104, { forge: true });
  try {
    assert.equal(yard.data.stationId, FORGE_ID);
    const wreck = spawnWreck(sim, {
      pool: { cmdty_scrap_metal: 6, cmdty_salvage_electronics: 1 },
    });
    forceNoticeReady(wreck, sim.state.simTime || 0);

    // One traffic tick is enough for demand dispatch once notice is ready.
    trafficSys.update(0.25, sim.state);
    const salvors = generalSalvors(sim);
    assert.equal(salvors.length, 1, 'exactly one general salvor dispatches to the wreck');
    const salvor = salvors[0];
    const salvorWorldRecordId = salvor.data.worldRecordId;
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

    const carried = structuredClone(cargo);
    const market = sim.state.economy.markets[FORGE_ID];
    const scrapBefore = market[SCRAP_ID].stock;
    const electronicsBefore = market.cmdty_salvage_electronics.stock;
    const offerBefore = econ.quote(FORGE_ID, SCRAP_ID, 'sell', 3);

    // The real cyclic route reaches the real Forge economy consumer.
    job.phase = NPC_JOB_PHASE.UNLOAD;
    job.routeIndex = 0;
    job.progress = 0.99;
    job.unloadS = 1;
    for (let i = 0; i < 6; i++) sim.step(0.5);
    assert.equal(salvor.data.cargoManifest.totalQty, 0, 'acknowledged Forge unload empties the cradle');
    const firstUnload = events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload;
    assert.equal(firstUnload.yardId, FORGE_ID);
    assert.equal(firstUnload.stationId, FORGE_ID);
    assert.equal(firstUnload.sectorId, FORGE_SECTOR_ID);
    assert.equal(firstUnload.manifestId, carried.manifestId);
    assert.equal(firstUnload.lotId, carried.lotId);
    assert.deepEqual(firstUnload.lines, carried.lines);
    assert.equal(
      firstUnload.intakeId,
      `salvage-intake:${salvorWorldRecordId}:${carried.salvageSeq}:${carried.manifestId}`,
    );
    assert.equal(firstUnload.intakeResult.ok, true);
    assert.equal(market[SCRAP_ID].stock, scrapBefore + 6);
    assert.equal(market.cmdty_salvage_electronics.stock, electronicsBefore);
    assert.ok(econ.quote(FORGE_ID, SCRAP_ID, 'sell', 3).unitAvg < offerBefore.unitAvg);
    assert.equal(sim.state.player.credits, 9001, 'NPC intake never pays the player');

    // Simulate a local clear replay: the same real manifest is acknowledged as a duplicate and
    // cannot move the Forge listing twice.
    const rec = sim.state.traffic.freighters.find((row) => row && row.id === salvor.id);
    trafficSys._setTrafficManifest(salvor, rec, structuredClone(carried));
    const replayIntent = {
      jobId: salvor.data.jobId,
      kind: 'salvor',
      completed: true,
      destination: `yard:${FORGE_ID}`,
      seq: firstUnload.seq,
    };
    const stockAfterFirst = market[SCRAP_ID].stock;
    assert.equal(trafficSys._onNpcJobUnload(replayIntent), true);
    assert.equal(events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload.intakeResult.duplicate, true);
    assert.equal(market[SCRAP_ID].stock, stockAfterFirst);

    // The ignored line is still part of the authenticated lot. Reusing the stable IDs while
    // changing that non-market quantity must reject and leave custody on the cutter.
    const conflictingLines = structuredClone(carried);
    const ignoredLine = conflictingLines.lines.find(
      (line) => line.commodityId === 'cmdty_salvage_electronics',
    );
    ignoredLine.qty += 1;
    conflictingLines.totalQty += 1;
    trafficSys._setTrafficManifest(salvor, rec, conflictingLines);
    assert.equal(trafficSys._onNpcJobUnload({ ...replayIntent, seq: firstUnload.seq + 1 }), false);
    assert.strictEqual(salvor.data.cargoManifest, conflictingLines);
    assert.strictEqual(rec.manifest, conflictingLines);
    assert.equal(
      events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload.intakeResult.reason,
      'salvage_intake_identity_conflict',
    );
    assert.equal(market[SCRAP_ID].stock, stockAfterFirst);

    // A real but unsupported Vesta yard rejects the lot. Traffic keeps the exact object and the
    // next WORK completion cannot overwrite it while custody remains unresolved.
    const rejected = trafficSys._buildSalvorManifest(salvor, 901, {
      [SCRAP_ID]: 2,
      cmdty_salvage_electronics: 1,
    });
    trafficSys._setTrafficManifest(salvor, rec, rejected);
    const rejectedIntent = {
      ...replayIntent,
      destination: 'yard:station_depot3',
      seq: 902,
    };
    assert.equal(trafficSys._onNpcJobUnload(rejectedIntent), false);
    assert.strictEqual(salvor.data.cargoManifest, rejected);
    assert.strictEqual(rec.manifest, rejected);
    assert.equal(events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload.intakeResult.ok, false);
    assert.equal(trafficSys._onNpcJobWork({
      jobId: salvor.data.jobId,
      kind: 'salvor',
      completed: true,
      seq: 903,
      field: `hulk:${wreck.id}`,
    }), true);
    assert.strictEqual(salvor.data.cargoManifest, rejected, 'rejected custody survives the next work cycle');

    // Retrying that same lot at Forge accepts it under its original extraction identity.
    assert.equal(trafficSys._onNpcJobUnload({
      ...rejectedIntent,
      destination: `yard:${FORGE_ID}`,
      seq: 904,
    }), true);
    const acceptedRetry = structuredClone(
      events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload,
    );
    delete acceptedRetry.intakeResult;
    const stockBeforeContinue = market[SCRAP_ID].stock;
    const saveSys = sim.registry.get('save');
    const envelope = saveSys.serialize('salvor-forge-intake-roundtrip');
    assert.equal(
      saveSys.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'salvor-forge-intake-roundtrip'),
      true,
    );
    const restoredMarket = sim.state.economy.markets[FORGE_ID];
    assert.equal(restoredMarket[SCRAP_ID].stock, stockBeforeContinue, 'Continue does not replay applied intake');
    sim.bus.emit('salvage:npcUnload', acceptedRetry);
    assert.equal(
      acceptedRetry.intakeResult.duplicate,
      true,
      'Continue preserves the applied identity for an exact traffic-payload replay',
    );
    assert.equal(restoredMarket[SCRAP_ID].stock, stockBeforeContinue);

    // Player sales still use the canonical listing after the NPC route and Continue.
    sim.state.player.cargo = {
      items: { [SCRAP_ID]: 3 }, usedVolume: 3, usedMass: 2.7, capVolume: 100, capMass: 100,
    };
    const creditsBeforeSale = sim.state.player.credits;
    const playerSale = econ.execute(FORGE_ID, SCRAP_ID, 'sell', 3);
    assert.equal(playerSale.ok, true);
    assert.equal(restoredMarket[SCRAP_ID].stock, stockBeforeContinue + 3);
    assert.equal(sim.state.player.credits, creditsBeforeSale + playerSale.total);
  } finally {
    dispose();
  }
});

test('missing intake consumer retains the exact salvor manifest', () => {
  const { sim, events, trafficSys, dispose } = boot(105);
  try {
    const wreck = spawnWreck(sim, { pool: { [SCRAP_ID]: 4 } });
    forceNoticeReady(wreck, 0);
    trafficSys.update(0.25, sim.state);
    const salvor = generalSalvors(sim)[0];
    const carried = completeWorkOnce(sim, salvor);
    const rec = sim.state.traffic.freighters.find((row) => row && row.id === salvor.id);
    assert.ok(carried && carried.totalQty === 4);

    assert.equal(trafficSys._onNpcJobUnload({
      jobId: salvor.data.jobId,
      kind: 'salvor',
      completed: true,
      destination: `yard:${YARD_ID}`,
      seq: 700,
    }), false);
    assert.strictEqual(salvor.data.cargoManifest, carried);
    assert.strictEqual(rec.manifest, carried);
    const attempted = events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload;
    assert.equal(attempted.intakeResult, undefined);
    assert.deepEqual(attempted.lines, carried.lines);
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
