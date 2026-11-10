// WORLD-43 — a miner that works a seam out says so and moves to the next rock.
//
// Done pin (seed 4242): depleting an NPC-worked field produces exactly one
// miner-register bark and the miner's job retargets a live seam. The bark rides
// npcJobsRuntime's `npcjobs:minerRelocated` receipt through barkDirector's
// ambient-gap + once-per-depletion gate; the move repoints the job's field
// waypoint at a seam below the exhaustion scalar. Yield and depletion numbers
// are untouched (the extraction timeline is pinned verbatim).

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { hash32 } from '../src/core/rng.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import {
  npcJobsRuntime,
  NPC_MINER_SEAM_EXHAUSTED_DEPLETION,
} from '../src/systems/npcJobsRuntime.js';
import { fieldDepletion as fieldDepletionBase } from '../src/systems/fieldDepletion.js';
import {
  barkDirector,
  MINER_SEAM_WORKED_OUT_REGISTER,
  minerSeamWorkedOutBarkFor,
} from '../src/systems/barkDirector.js';

const SEED = 4242;
const SECTOR_ID = 'sector_test_worked_out_seam';

function boot() {
  const said = [];
  const voice = {
    say(entry) { said.push(entry); return true; },
  };
  const sim = createSimulation({
    seed: SEED,
    systems: [npcJobsRuntime, fieldDepletionBase, barkDirector],
    helpers: { voice },
  });
  sim.state.mode = 'flight';
  sim.state.world.currentSectorId = SECTOR_ID;

  const relocations = [];
  const voices = [];
  sim.bus.on('npcjobs:minerRelocated', (payload) => relocations.push(structuredClone(payload)));
  sim.bus.on('barkDirector:voice', (payload) => voices.push(structuredClone(payload)));

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
  return { sim, said, relocations, voices, home, oldRock, freshNear, freshFar, miner, jobId };
}

function jobOf(h) {
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

function depleteToExhaustion() {
  const h = boot();
  try {
    const minerJob = jobOf(h);
    minerJob.phase = NPC_JOB_PHASE.WORK;
    minerJob.routeIndex = 1;
    minerJob.progress = 0.25;
    const timeline = [];
    for (let seq = 1; seq <= 6; seq++) {
      emitNpcExtraction(h, seq);
      timeline.push(h.sim.state.fieldDepletion.fields.field_old_seam.depletion);
    }
    return { h, timeline };
  } catch (error) {
    h.sim.dispose();
    throw error;
  }
}

function liveSeamDepletion(h, fieldId) {
  const rec = h.sim.state.fieldDepletion.fields[fieldId];
  return rec ? rec.depletion : 0;
}

test('seed 4242: depleting an NPC-worked field produces one miner bark and retargets a live seam', () => {
  const { h, timeline } = depleteToExhaustion();
  try {
    // Yield and depletion rate untouched: 8 U a cut at 0.0025/U, six cuts to the seam scalar.
    assert.deepEqual(timeline, [0.02, 0.04, 0.06, 0.08, 0.1, 0.12]);
    assert.equal(timeline.at(-1), NPC_MINER_SEAM_EXHAUSTED_DEPLETION);
    assert.equal(h.relocations.length, 0,
      'a miner still on the old face does not snap its route inside the completion event');

    // The relocation is a safe-point move: the hull finishes its stop, then walks the claim.
    const minerJob = jobOf(h);
    minerJob.phase = NPC_JOB_PHASE.UNLOAD;
    minerJob.routeIndex = 0;
    minerJob.progress = 0;
    h.sim.registry.get('npcJobsRuntime').update(0, h.sim.state);

    assert.equal(h.relocations.length, 1, 'one depletion, one relocation receipt');
    const relocation = h.relocations[0];
    assert.equal(relocation.fromFieldId, 'field_old_seam');
    assert.notEqual(relocation.toAsteroidId, h.oldRock.id);
    assert.ok(relocation.toFieldId && relocation.toFieldId !== 'field_old_seam');
    assert.ok(liveSeamDepletion(h, relocation.toFieldId) < NPC_MINER_SEAM_EXHAUSTED_DEPLETION,
      'the miner walks to a live seam, never a worked-out one');
    const target = h.sim.state.entities.get(relocation.toAsteroidId);
    assert.ok(target && target.alive !== false, 'the relocation names a live rock');
    assert.equal(jobOf(h).route[1].id, `field:${relocation.toAsteroidId}`);
    assert.equal(jobOf(h).route[1].pos.x, target.pos.x);

    assert.equal(h.said.length, 1, 'one depletion, one miner-register bark');
    assert.equal(h.said[0].channel, 'bark');
    assert.equal(h.said[0].kind, 'minerSeamWorkedOut');
    assert.equal(h.said[0].register, 'miner');
    assert.ok(MINER_SEAM_WORKED_OUT_REGISTER.includes(h.said[0].text),
      'the line speaks in the miner worked-out-seam register');
    const expected = minerSeamWorkedOutBarkFor(
      hash32(SEED, 'minerSeamWorkedOut', `${h.jobId}|field_old_seam`),
    );
    assert.equal(h.said[0].text, expected, 'the line pick is deterministic on seed 4242');
    assert.equal(h.voices.length, 1);
    assert.equal(h.voices[0].entityId, h.miner.id, 'the relocating hull owns the voice');
    assert.equal(h.voices[0].register, 'miner');
    assert.equal(h.voices[0].fromFieldId, 'field_old_seam');
    assert.equal(h.voices[0].toFieldId, relocation.toFieldId);
  } finally {
    h.sim.dispose();
  }
});

test('the worked-out line speaks once per depletion, in the ambient gap', () => {
  const { h } = depleteToExhaustion();
  try {
    const minerJob = jobOf(h);
    minerJob.phase = NPC_JOB_PHASE.UNLOAD;
    minerJob.routeIndex = 0;
    minerJob.progress = 0;
    h.sim.registry.get('npcJobsRuntime').update(0, h.sim.state);
    assert.equal(h.said.length, 1);
    const firstGap = h.voices[0].gap;

    // A re-emitted relocation for the same job + worked-out field stays silent.
    h.sim.bus.emit('npcjobs:minerRelocated', structuredClone(h.relocations[0]));
    assert.equal(h.said.length, 1, 'the same worked-out seam never speaks twice');
    assert.equal(h.voices.length, 1);

    // The gap clock advances so the next depletion speaks in turn instead of on top.
    assert.ok(Number.isFinite(firstGap) && firstGap >= 12,
      'the bark spends the ambient gap like every other notice line');
  } finally {
    h.sim.dispose();
  }
});
