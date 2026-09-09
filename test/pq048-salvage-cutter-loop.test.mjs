import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { VESTA_DERELICT_SALVAGE_SOURCE } from '../src/data/sectorZones.js';
import { SECTORS } from '../src/data/sectors.js';
import {
  contactHailAvailability,
  createContactHailOffer,
  createContactHailResponse,
  livingWorkStatusText,
} from '../src/data/contactHail.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { economy } from '../src/systems/economy.js';
import { mining } from '../src/systems/mining.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { salvage } from '../src/systems/salvage.js';
import { traffic } from '../src/systems/traffic.js';
import {
  CIVILIAN_MANIFEST_PAYLOAD_TYPE,
  lootShards,
  salvagePoolFromManifest,
} from '../src/systems/lootShards.js';
import {
  applyRecordVitals,
  bindEntityToRecord,
  captureEntityRecord,
  ensureWorldRecords,
  findLiveEntityForRecord,
  spawnSpecFromRecord,
  upsertRecord,
} from '../src/world/worldRecords.js';

const SECTOR_ID = 'sector_vesta_forge';
const FORGE_ID = 'station_forge';
const SOURCE_KEY = VESTA_DERELICT_SALVAGE_SOURCE.sourceKey;
const SOURCE_POINT_ID = VESTA_DERELICT_SALVAGE_SOURCE.salvagePointId;
const SCRAP_POOL = { cmdty_scrap_metal: 8 };
const FLAG_PRIOR = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };

// A deliberately tiny world owner makes saveSystem exercise its real restore order without
// pulling a broad world fixture into this focused source/traffic contract test.
const restoreWorld = {
  name: 'world',
  init(ctx) {
    this.state = ctx.state;
    this.bus = ctx.bus;
    this.helpers = ctx.helpers;
  },
  upsertWorldRecord(entity) {
    const captured = captureEntityRecord(entity, {
      sectorId: entity && (entity.homeSectorId || (entity.data && entity.data.homeSectorId))
        || this.state.world.currentSectorId,
      seed: this.state.meta && this.state.meta.seed,
      tick: this.state.tick,
    });
    return captured ? upsertRecord(ensureWorldRecords(this.state.world), captured) : null;
  },
  serialize() {
    return {
      currentSectorId: this.state.world.currentSectorId,
      sectors: this.state.world.sectors,
      records: this.state.world.records,
    };
  },
  deserialize(data) {
    this.state.world.currentSectorId = data && data.currentSectorId || null;
    this.state.world.sectors = data && data.sectors || {};
    this.state.world.records = data && data.records || null;
    ensureWorldRecords(this.state.world);
  },
  enterSector(sectorId) {
    this.state.world.currentSectorId = sectorId;
    const records = ensureWorldRecords(this.state.world);
    for (const record of Object.values(records.byId)) {
      if (!record || record.alive === false
        || (record.homeSectorId || record.sectorId) !== sectorId
        || findLiveEntityForRecord(this.state.entityList, record.recordId)) continue;
      const spec = spawnSpecFromRecord(record);
      if (!spec) continue;
      const entity = this.helpers.spawnEntity(spec);
      applyRecordVitals(entity, record);
      bindEntityToRecord(entity, record);
    }
    this.bus.emit('sector:enter', {
      sectorId,
      sector: this.state.world.sectors && this.state.world.sectors[sectorId],
      restoreDurableRecords: true,
    });
  },
};

function enableLootFlags() {
  MASSLINE2_FLAGS.enabled = true;
  MASSLINE2_FLAGS.lootShards = true;
}

function restoreFlags() {
  MASSLINE2_FLAGS.enabled = FLAG_PRIOR.enabled;
  MASSLINE2_FLAGS.lootShards = FLAG_PRIOR.lootShards;
}

function boot(seed = 0x4807) {
  enableLootFlags();
  const sim = createSimulation({
    seed,
    systems: [salvage, mining, npcJobsRuntime, traffic, lootShards, economy, restoreWorld, saveSystem],
    updateOrder: [mining, npcJobsRuntime, traffic, lootShards, economy],
  });
  const state = sim.state;
  state.mode = 'flight';
  state.world.currentSectorId = SECTOR_ID;
  state.world.sectors = Object.fromEntries(SECTORS.map((sector) => [sector.id, sector]));
  state.player.credits = 17_000;
  state.player.stats = {};
  state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 200, hullMax: 200, radius: 6, flags: { persistent: true }, data: {},
  });
  state.playerId = player.id;
  const forge = sim.spawn({
    type: 'station', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 40,
    data: { stationId: FORGE_ID, stationName: 'Forge' }, flags: { persistent: true },
  });
  const events = [];
  for (const name of ['salvage:npcExtraction', 'salvage:npcUnload', 'loot:manifestPayload', 'mining:yield']) {
    sim.bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  }
  const econ = sim.registry.get('economy');
  econ.ensureMarket(FORGE_ID);
  sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
  const result = {
    sim,
    state,
    player,
    forge,
    events,
    salvageSys: sim.registry.get('salvage'),
    miningSys: sim.registry.get('mining'),
    trafficSys: sim.registry.get('traffic'),
    worldSys: sim.registry.get('world'),
    saveSys: sim.registry.get('save'),
    econ,
  };
  result.dispose = () => {
    sim.dispose();
    restoreFlags();
  };
  return result;
}

function sourceWrecks(state) {
  return (state.entityList || []).filter((entity) => entity && entity.alive !== false
    && entity.type === 'wreck' && entity.data && entity.data.salvageSourceKey === SOURCE_KEY);
}

function sourceWreck(state) {
  const wrecks = sourceWrecks(state);
  assert.equal(wrecks.length, 1, 'the authored Vesta source materializes as exactly one live wreck');
  return wrecks[0];
}

function generalSalvor(state) {
  const entity = (state.entityList || []).find((candidate) => candidate && candidate.alive !== false
    && candidate.data && candidate.data.trafficRole === 'salvor' && candidate.data.generalSalvor === true);
  assert.ok(entity, 'the existing demand-driven general salvor spawned');
  return entity;
}

function salvorJob(sim, salvor) {
  const entry = sim.helpers.npcJobs.get(salvor && salvor.data && salvor.data.jobId);
  return entry && entry.job || null;
}

function dispatchSourceCutter(ctx) {
  const wreck = sourceWreck(ctx.state);
  wreck.data.salvorNoticeAt = ctx.state.simTime || 0;
  ctx.trafficSys.update(0.25, ctx.state);
  const salvor = generalSalvor(ctx.state);
  const job = salvorJob(ctx.sim, salvor);
  assert.ok(job, 'cutter has the normal npc job runtime route');
  assert.equal(job.kind, 'salvor');
  assert.equal(job.route[0].id, `yard:${FORGE_ID}`, 'Vesta cutter homes to Forge');
  assert.equal(job.payload.salvageSource, SOURCE_KEY, 'job carries the save-stable source key');
  assert.equal(job.payload.salvagePointId, SOURCE_POINT_ID);
  assert.equal(job.route[1].id, `hulk:${wreck.id}`);
  assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).claimId, salvor.data.worldRecordId);
  return { wreck, salvor, job };
}

function completeSourceWork(ctx, salvor) {
  const job = salvorJob(ctx.sim, salvor);
  assert.ok(job);
  job.phase = NPC_JOB_PHASE.WORK;
  job.routeIndex = 1;
  job.progress = 0.99;
  job.workS = 1;
  for (let i = 0; i < 8; i++) {
    ctx.sim.step(0.5);
    if (salvor.data.cargoManifest && salvor.data.cargoManifest.totalQty > 0) break;
  }
  return salvor.data.cargoManifest;
}

function unloadAtForge(ctx, salvor) {
  const job = salvorJob(ctx.sim, salvor);
  assert.ok(job);
  job.phase = NPC_JOB_PHASE.UNLOAD;
  job.routeIndex = 0;
  job.progress = 0.99;
  job.unloadS = 1;
  for (let i = 0; i < 8; i++) {
    ctx.sim.step(0.5);
    if (salvor.data.cargoManifest && salvor.data.cargoManifest.totalQty === 0) break;
  }
  return ctx.events.filter((event) => event.name === 'salvage:npcUnload').at(-1)?.payload || null;
}

function hardExitVesta(ctx, destinationSectorId = 'sector_helios_prime') {
  ctx.sim.bus.emit('sector:exit', { sectorId: SECTOR_ID });
  for (const wreck of sourceWrecks(ctx.state)) ctx.sim.helpers.removeEntity(wreck.id);
  ctx.state.world.currentSectorId = destinationSectorId;
  ctx.sim.bus.emit('sector:enter', { sectorId: destinationSectorId });
}

function hardReenterVesta(ctx) {
  ctx.worldSys.enterSector(SECTOR_ID);
  ctx.trafficSys.update(0.25, ctx.state);
}

function hail(ctx, salvor, choice) {
  ctx.state.player.targetId = salvor.id;
  const availability = contactHailAvailability(ctx.state);
  assert.equal(availability.enabled, true);
  assert.equal(availability.kind, 'worker');
  const offer = createContactHailOffer(ctx.state, availability, 'hail:vesta', 99);
  assert.ok(offer);
  return { offer, response: createContactHailResponse(ctx.state, offer, choice) };
}

test('default Vesta source cuts to one Forge lot, manifests truthfully, and intake retries once', () => {
  const ctx = boot();
  try {
    const wreck = sourceWreck(ctx.state);
    assert.equal(wreck.data.salvagePointId, SOURCE_POINT_ID);
    assert.equal(wreck.data.isCommunicator, false, 'the work source never offers a communicator mission');
    assert.deepEqual(wreck.data.salvagePool, SCRAP_POOL);
    const { salvor } = dispatchSourceCutter(ctx);

    salvor.data.jobPhase = 'work';
    const cutting = hail(ctx, salvor, 'status');
    assert.ok(cutting.offer.actions.some((action) => action.id === 'manifest'), 'cutter exposes read-only MANIFEST');
    assert.equal(cutting.response.lines[0], 'STATUS · CUTTING · DEAD FREIGHTER DRIFT');
    assert.equal(livingWorkStatusText(salvor, { state: ctx.state }), 'WORK · CUTTING');

    const manifest = completeSourceWork(ctx, salvor);
    assert.ok(manifest && manifest.totalQty === 8, 'WORK lifts the real finite source value');
    assert.deepEqual(salvagePoolFromManifest(manifest), SCRAP_POOL);
    assert.equal(manifest.salvageSource, SOURCE_KEY);
    assert.equal(manifest.salvagePointId, SOURCE_POINT_ID);
    assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).extracted, true);
    assert.equal(sourceWrecks(ctx.state).length, 0, 'extracted source removes its physical wreck');
    assert.equal(ctx.state.player.credits, 17_000, 'cutter extraction never writes player credits');

    const aboard = hail(ctx, salvor, 'status');
    assert.equal(aboard.response.lines[0], 'STATUS · SALVAGE ABOARD · FORGE INBOUND');
    assert.equal(livingWorkStatusText(salvor, { state: ctx.state }), 'WORK · SALVAGE ABOARD · FORGE');
    const manifestReadout = hail(ctx, salvor, 'manifest');
    assert.match(manifestReadout.response.lines[0], /^MANIFEST · /);

    const carried = structuredClone(manifest);
    const stockBefore = ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock;
    const receipt = unloadAtForge(ctx, salvor);
    assert.ok(receipt && receipt.intakeResult && receipt.intakeResult.ok === true);
    assert.equal(receipt.yardId, FORGE_ID);
    assert.equal(receipt.intakeId, `salvage-intake:${salvor.data.worldRecordId}:${carried.salvageSeq}:${carried.manifestId}`);
    assert.equal(ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock, stockBefore + 8);

    const rec = ctx.state.traffic.freighters.find((row) => row && row.id === salvor.id);
    ctx.trafficSys._setTrafficManifest(salvor, rec, structuredClone(carried));
    assert.equal(ctx.trafficSys._onNpcJobUnload({
      jobId: salvor.data.jobId, kind: 'salvor', completed: true, destination: `yard:${FORGE_ID}`, seq: receipt.seq,
    }), true);
    assert.equal(ctx.events.filter((event) => event.name === 'salvage:npcUnload').at(-1).payload.intakeResult.duplicate, true);
    assert.equal(ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock, stockBefore + 8, 'retry is an ack, never a second intake');
  } finally {
    ctx.dispose();
  }
});

test('player beam dispute drains the same source and leaves the claimed cutter empty', () => {
  const ctx = boot(0x4808);
  try {
    const { wreck, salvor } = dispatchSourceCutter(ctx);
    ctx.player.pos.x = wreck.pos.x - 80;
    ctx.player.pos.z = wreck.pos.z;
    ctx.state.input.fireGroup = 2;
    ctx.state.input.aimAngle = 0;
    ctx.sim.step(8);
    ctx.state.input.fireGroup = 0;

    const source = ctx.salvageSys._sourceSnapshot(SOURCE_KEY);
    assert.equal(source.extracted, true);
    assert.equal(source.disputedBy, String(ctx.player.id));
    assert.equal(source.remainingQty, 0);
    assert.equal(sourceWrecks(ctx.state).length, 0);
    assert.equal(
      ctx.events.filter((event) => event.name === 'mining:yield')
        .reduce((sum, event) => sum + event.payload.qty, 0),
      8,
      'the player beam receives the only physical source value',
    );

    salvor.data.jobPhase = 'work';
    assert.equal(hail(ctx, salvor, 'status').response.lines[0], 'STATUS · SALVAGE DISPUTED · WRECK STRIPPED');
    ctx.trafficSys.update(0.25, ctx.state);
    const cargo = completeSourceWork(ctx, salvor);
    assert.ok(!cargo || cargo.totalQty === 0, 'cutter leaves/retargets empty instead of minting source scrap');
    assert.equal(ctx.events.filter((event) => event.name === 'salvage:npcExtraction').length, 0);
  } finally {
    ctx.dispose();
  }
});

test('loaded cutter loss drops one persistent manifest payload without respawning the source', () => {
  const ctx = boot(0x4809);
  try {
    const { salvor } = dispatchSourceCutter(ctx);
    const carried = completeSourceWork(ctx, salvor);
    assert.equal(carried.totalQty, 8);
    salvor.alive = false;
    ctx.sim.bus.emit('entity:killed', {
      id: salvor.id, killerId: ctx.player.id, type: 'ship', pos: { ...salvor.pos }, targetHostileToPlayer: false,
    });
    const payloads = (ctx.state.entityList || []).filter((entity) => entity && entity.alive !== false
      && entity.type === 'payload' && entity.data && entity.data.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
    assert.equal(payloads.length, 1);
    assert.equal(payloads[0].flags.persistent, true);
    assert.deepEqual(payloads[0].data.salvagePool, SCRAP_POOL);
    assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).extracted, true);
    assert.equal(ctx.events.filter((event) => event.name === 'salvage:npcUnload').length, 0, 'loss never reaches Forge intake');
    ctx.sim.bus.emit('save:restoring', { slot: 'loss' });
    ctx.sim.bus.emit('sector:enter', { sectorId: SECTOR_ID });
    assert.equal(sourceWrecks(ctx.state).length, 0, 'extracted source cannot rematerialize after loss');
  } finally {
    ctx.dispose();
  }
});

test('cutter loss before WORK releases the durable source claim without changing its pool', () => {
  const ctx = boot(0x480a);
  try {
    const { salvor } = dispatchSourceCutter(ctx);
    assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).claimId, salvor.data.worldRecordId);
    salvor.alive = false;
    ctx.sim.bus.emit('entity:killed', {
      id: salvor.id, killerId: ctx.player.id, type: 'ship', pos: { ...salvor.pos }, targetHostileToPlayer: false,
    });
    const source = ctx.salvageSys._sourceSnapshot(SOURCE_KEY);
    assert.equal(source.claimId, null, 'loss releases the source before any extraction');
    assert.equal(source.extracted, false);
    assert.deepEqual(source.remainingPool, SCRAP_POOL);
  } finally {
    ctx.dispose();
  }
});

test('Continue restores one source wreck by stable point, rebinds its cutter, and retains one intake', () => {
  const ctx = boot(0x4810);
  try {
    const { wreck, salvor } = dispatchSourceCutter(ctx);
    const oldWreckId = wreck.id;
    const worldRecordId = salvor.data.worldRecordId;
    const envelope = ctx.saveSys.serialize('vesta-source-mid-job');
    assert.deepEqual(envelope.data.salvage.sources[SOURCE_KEY].remainingPool, SCRAP_POOL);
    assert.equal(ctx.saveSys.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'vesta-source-mid-job'), true);

    const restoredWreck = sourceWreck(ctx.state);
    assert.deepEqual(restoredWreck.data.salvagePool, SCRAP_POOL, 'Continue rematerializes the saved remainder, not a fresh random pool');
    const restoredSalvor = (ctx.state.entityList || []).find((entity) => entity && entity.alive !== false
      && entity.data && entity.data.worldRecordId === worldRecordId);
    assert.ok(restoredSalvor, 'persistent cutter rematerializes with its durable identity');
    const restoredJob = salvorJob(ctx.sim, restoredSalvor);
    assert.ok(restoredJob);
    assert.equal(restoredJob.payload.salvageSource, SOURCE_KEY);
    assert.equal(restoredJob.payload.salvagePointId, SOURCE_POINT_ID);
    ctx.trafficSys.update(0.25, ctx.state);
    assert.equal(restoredJob.route[1].id, `hulk:${restoredWreck.id}`,
      'traffic refreshes the volatile numeric waypoint after source rebind');
    assert.ok(Number.isFinite(restoredJob.route[1].pos.x) && Number.isFinite(restoredJob.route[1].pos.z));
    assert.equal(sourceWrecks(ctx.state).length, 1, 'no duplicate source wreck appears on Continue');
    void oldWreckId;

    const carried = completeSourceWork(ctx, restoredSalvor);
    assert.equal(carried.totalQty, 8);
    const receipt = unloadAtForge(ctx, restoredSalvor);
    assert.ok(receipt && receipt.intakeResult.ok);
    const stockAfterIntake = ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock;
    const afterIntake = ctx.saveSys.serialize('vesta-source-after-intake');
    assert.equal(ctx.saveSys.loadEnvelope(JSON.parse(JSON.stringify(afterIntake)), 'vesta-source-after-intake'), true);
    assert.equal(sourceWrecks(ctx.state).length, 0, 'extracted source stays absent after a full Continue');
    assert.equal(ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock, stockAfterIntake);
    ctx.sim.bus.emit('salvage:npcUnload', receipt);
    assert.equal(receipt.intakeResult.duplicate, true, 'one lot identity survives Continue and rejects a second application');
    assert.equal(ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock, stockAfterIntake);
  } finally {
    ctx.dispose();
  }
});

test('hard Vesta exit preserves the source-bound cutter, partial pool, loaded manifest, and one intake', () => {
  const ctx = boot(0x4811);
  try {
    const { wreck, salvor, job } = dispatchSourceCutter(ctx);
    const worldRecordId = salvor.data.worldRecordId;
    const jobId = salvor.data.jobId;

    const playerTake = ctx.sim.helpers.salvage.drainSource({
      sourceKey: SOURCE_KEY,
      requested: { cmdty_scrap_metal: 3 },
      minerId: ctx.player.id,
    });
    assert.deepEqual(playerTake.taken, { cmdty_scrap_metal: 3 });
    assert.deepEqual(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).remainingPool, { cmdty_scrap_metal: 5 });
    wreck.data.salvagePool = { cmdty_scrap_metal: 5 };

    hardExitVesta(ctx);
    const captured = ctx.state.world.records && ctx.state.world.records.byId[worldRecordId];
    assert.ok(captured, 'traffic captures the cutter through the world owner before hard cleanup');
    assert.equal(captured.recordId, worldRecordId);
    assert.deepEqual(captured.cargoManifest.lines, []);
    assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).claimId, worldRecordId,
      'hard exit preserves the cutter claim instead of releasing it');

    hardReenterVesta(ctx);
    const firstReturn = (ctx.state.entityList || []).filter((entity) => entity && entity.alive !== false
      && entity.data && entity.data.worldRecordId === worldRecordId);
    assert.equal(firstReturn.length, 1, 'exactly one cutter rematerializes for the stable world record');
    const rebound = firstReturn[0];
    const reboundWreck = sourceWreck(ctx.state);
    assert.notEqual(reboundWreck.id, wreck.id, 'the hard re-entry body has a new volatile entity id');
    assert.deepEqual(reboundWreck.data.salvagePool, { cmdty_scrap_metal: 5 },
      'hard re-entry restores the true partial pool, never the authored fresh value');
    const reboundJob = salvorJob(ctx.sim, rebound);
    assert.ok(reboundJob);
    assert.equal(rebound.data.jobId, jobId);
    assert.equal(reboundJob, job, 'the same durable NPC job remains bound to the cutter');
    assert.equal(reboundJob.payload.salvageSource, SOURCE_KEY);
    assert.equal(rebound.data.salvageSource, SOURCE_KEY);
    assert.equal(rebound.data.salvagePointId, SOURCE_POINT_ID);
    assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).claimId, worldRecordId);
    assert.equal(reboundJob.route[1].id, `hulk:${reboundWreck.id}`);
    assert.ok(Number.isFinite(reboundJob.route[1].pos.x) && Number.isFinite(reboundJob.route[1].pos.z));
    assert.equal(sourceWrecks(ctx.state).length, 1);

    const loaded = completeSourceWork(ctx, rebound);
    assert.ok(loaded);
    assert.equal(loaded.totalQty, 5);
    const carried = structuredClone(loaded);
    hardExitVesta(ctx);
    assert.deepEqual(ctx.state.world.records.byId[worldRecordId].cargoManifest, carried,
      'a loaded cutter is captured with the exact civilian manifest');

    hardReenterVesta(ctx);
    const secondReturn = (ctx.state.entityList || []).filter((entity) => entity && entity.alive !== false
      && entity.data && entity.data.worldRecordId === worldRecordId);
    assert.equal(secondReturn.length, 1, 'loaded re-entry still materializes one cutter');
    const loadedRebound = secondReturn[0];
    assert.deepEqual(loadedRebound.data.cargoManifest, carried);
    assert.equal(sourceWrecks(ctx.state).length, 0, 'the depleted source never respawns');
    assert.equal(ctx.salvageSys._sourceSnapshot(SOURCE_KEY).remainingQty, 0);

    const stockBefore = ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock;
    const receipt = unloadAtForge(ctx, loadedRebound);
    assert.ok(receipt && receipt.intakeResult && receipt.intakeResult.ok === true);
    assert.equal(ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock, stockBefore + 5);
    ctx.sim.bus.emit('salvage:npcUnload', receipt);
    assert.equal(receipt.intakeResult.duplicate, true);
    assert.equal(ctx.state.economy.markets[FORGE_ID].cmdty_scrap_metal.stock, stockBefore + 5,
      'exit/re-entry preserves one lot and one Forge intake');
  } finally {
    ctx.dispose();
  }
});
