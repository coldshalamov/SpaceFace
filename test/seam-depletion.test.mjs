import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import {
  npcJobsRuntime,
  NPC_MINER_SEAM_EXHAUSTED_DEPLETION,
} from '../src/systems/npcJobsRuntime.js';
import { fieldDepletion as fieldDepletionBase } from '../src/systems/fieldDepletion.js';
import { save } from '../src/save/saveSystem.js';

const SECTOR_ID = 'sector_test_mining_ecology';

function boot(seed = 104) {
  const sim = createSimulation({
    seed,
    systems: [npcJobsRuntime, fieldDepletionBase, save],
    updateOrder: [npcJobsRuntime, fieldDepletionBase],
  });
  const events = [];
  for (const name of ['fieldDepletion:changed', 'npcjobs:minerRelocated']) {
    sim.bus.on(name, (payload) => events.push({ name, payload: structuredClone(payload) }));
  }
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;
  sim.state.player.credits = 777;

  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 6, flags: { persistent: true },
  });
  sim.state.playerId = player.id;
  const home = sim.spawn({
    type: 'station', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 40, data: { stationId: 'station_test_refinery' },
  });
  const oldRock = sim.spawn({
    type: 'asteroid', pos: { x: 280, z: 0 }, vel: { x: 0, z: 0 },
    radius: 18, data: { fieldId: 'field_old_seam', typeId: 'ast_metallic', yieldU: 18 },
  });
  const freshNear = sim.spawn({
    type: 'asteroid', pos: { x: 520, z: 60 }, vel: { x: 0, z: 0 },
    radius: 18, data: { fieldId: 'field_fresh_near', typeId: 'ast_metallic', yieldU: 18 },
  });
  const freshFar = sim.spawn({
    type: 'asteroid', pos: { x: 760, z: -80 }, vel: { x: 0, z: 0 },
    radius: 18, data: { fieldId: 'field_fresh_far', typeId: 'ast_metallic', yieldU: 18 },
  });
  const miner = sim.spawn({
    type: 'ship', team: 2, pos: { x: 280, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, radius: 7,
    data: { trafficRole: 'miner', worldRecordId: 'wr_test_miner' },
  });
  const jobId = sim.helpers.npcJobs.assign(miner, {
    kind: 'miner',
    sectorId: SECTOR_ID,
    route: [
      { id: 'home:station_test_refinery', label: 'Refinery', pos: { x: home.pos.x, z: home.pos.z } },
      { id: `field:${oldRock.id}`, label: 'Belt', pos: { x: oldRock.pos.x, z: oldRock.pos.z } },
    ],
  });
  assert.equal(jobId, 'job:wr_test_miner');
  return { sim, events, player, home, oldRock, freshNear, freshFar, miner, jobId };
}

function job(h) {
  return h.sim.helpers.npcJobs.get(h.jobId).job;
}

function emitNpcExtraction(h, seq, extractedU = 8) {
  h.sim.bus.emit('mining:npcExtraction', {
    jobId: h.jobId,
    workId: `work:${seq}`,
    minerId: h.miner.id,
    asteroidId: h.oldRock.id,
    fieldId: h.oldRock.data.fieldId,
    sectorId: SECTOR_ID,
    commodityId: 'cmdty_ore_iron',
    extractedU,
    seq,
  });
  h.sim.registry.get('npcJobsRuntime').update(0, h.sim.state);
  h.sim.state.simTime += 1;
  h.sim.state.tick += 60;
}

function depleteAndRelocate(seed = 104) {
  const h = boot(seed);
  const minerJob = job(h);
  minerJob.phase = NPC_JOB_PHASE.WORK;
  minerJob.routeIndex = 1;
  minerJob.progress = 0.25;
  const timeline = [];
  for (let seq = 1; seq <= 6; seq++) {
    emitNpcExtraction(h, seq);
    timeline.push(h.sim.state.fieldDepletion.fields.field_old_seam.depletion);
    if (seq === 3) h.cadenceBeforeExhaustionS = minerJob.workS;
  }
  assert.equal(timeline.at(-1), NPC_MINER_SEAM_EXHAUSTED_DEPLETION);
  assert.equal(h.events.filter((e) => e.name === 'npcjobs:minerRelocated').length, 0,
    'a miner still at the old seam does not snap its route inside the completion event');

  minerJob.phase = NPC_JOB_PHASE.UNLOAD;
  minerJob.routeIndex = 0;
  minerJob.progress = 0;
  h.sim.registry.get('npcJobsRuntime').update(0, h.sim.state);
  return h;
}

test('seed-pinned NPC extraction timeline slows then relocates at a safe point', () => {
  const h = depleteAndRelocate(104);
  try {
    const oldField = h.sim.state.fieldDepletion.fields.field_old_seam;
    assert.deepEqual(
      h.events.filter((e) => e.name === 'fieldDepletion:changed').map((e) => e.payload.depleted),
      [0.02, 0.04, 0.06, 0.08, 0.1, 0.12],
    );
    assert.equal(oldField.extractedU, 48);
    assert.equal(oldField.destroyedCount, 0);
    assert.ok(h.cadenceBeforeExhaustionS > 30,
      'work cadence slows before the seam exhaustion relocation');

    const relocated = h.events.find((e) => e.name === 'npcjobs:minerRelocated');
    assert.ok(relocated);
    assert.equal(relocated.payload.fromFieldId, 'field_old_seam');
    assert.notEqual(relocated.payload.toAsteroidId, h.oldRock.id);
    assert.match(job(h).route[1].id, /^field:/);
    assert.equal(job(h).route[1].pos.x, h.sim.state.entities.get(relocated.payload.toAsteroidId).pos.x);
    assert.equal(job(h).workS, 30, 'fresh field resets the next work stop to normal cadence');
    assert.equal(h.sim.state.player.credits, 777, 'depletion and relocation never write credits');
  } finally {
    h.sim.dispose();
  }
});

test('relocation target is deterministic for identical seed and state', () => {
  const a = depleteAndRelocate(205);
  const b = depleteAndRelocate(205);
  try {
    const ra = a.events.find((e) => e.name === 'npcjobs:minerRelocated').payload;
    const rb = b.events.find((e) => e.name === 'npcjobs:minerRelocated').payload;
    assert.deepEqual(
      { toFieldId: ra.toFieldId, toAsteroidId: ra.toAsteroidId, route: job(a).route[1] },
      { toFieldId: rb.toFieldId, toAsteroidId: rb.toAsteroidId, route: job(b).route[1] },
    );
  } finally {
    a.sim.dispose();
    b.sim.dispose();
  }
});

test('field depletion survives a real save/Continue round trip without economy writes', () => {
  const h = boot(306);
  try {
    emitNpcExtraction(h, 1);
    emitNpcExtraction(h, 2);
    const creditsBefore = h.sim.state.player.credits;
    const saveSystem = h.sim.registry.get('save');
    const envelope = saveSystem.serialize('seam-depletion-roundtrip');
    assert.equal(envelope.data.fieldDepletion.fields.field_old_seam.extractedU, 16);
    assert.equal(saveSystem.loadEnvelope(
      JSON.parse(JSON.stringify(envelope)),
      'seam-depletion-roundtrip',
    ), true);
    assert.equal(h.sim.state.fieldDepletion.fields.field_old_seam.extractedU, 16);
    assert.equal(h.sim.state.fieldDepletion.fields.field_old_seam.depletion, 0.04);
    assert.equal(h.sim.state.player.credits, creditsBefore);
  } finally {
    h.sim.dispose();
  }
});
