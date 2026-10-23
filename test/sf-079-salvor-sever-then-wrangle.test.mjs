// SF-079 — a salvor that separates before it hauls (equivalent-feature close).
//
// The packet's outcome is already landed machinery; this test pins the decisive facts at the
// two owners it runs through:
//
//   npcJobs.js kernel — the salvor graph is WORK (sever at the wreck) -> LOAD (wrangle) ->
//   RETURN/UNLOAD: two separate acts with separate completions, never one vacuum pass.
//
//   traffic.js — custody transfers exactly once, at sever completion, out of the real
//   salvagePool: the manifest is minted from the drained pool under a work-idempotence
//   ledger, the wreck is stamped with the cutter's claim (which the tug path refuses), a
//   body gone before the cut pays nothing and releases its claim.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createJob, advance, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { traffic } from '../src/systems/traffic.js';
import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

// ─── Kernel: the sever and the wrangle are different acts ────────────────────────────────────────

test('kernel: a salvor severs at the hulk, then wrangles, then hauls home', () => {
  const job = createJob({
    id: 'job:test_salvor',
    kind: 'salvor',
    sectorId: 'sec',
    speed: 200,
    route: [
      { id: 'yard:st', pos: { x: 0, z: 0 }, label: 'Yard' },
      { id: 'hulk:9', pos: { x: 600, z: 0 }, label: 'Hulk' },
    ],
  }, 11);
  assert.ok(job, 'salvor spec creates a job');

  const events = [];
  const sink = (intent) => events.push(intent.event);
  let guard = 0;
  while (job.loopCount < 1 && job.phase !== NPC_JOB_PHASE.COMPLETE && guard++ < 400) {
    advance(job, 0.5, sink);
  }
  const severAt = events.indexOf('npcjobs:work');
  const wrangleAt = events.indexOf('npcjobs:load');
  assert.ok(severAt > -1, 'the sever act completes at the wreck');
  assert.ok(wrangleAt > severAt, 'the wrangle is a separate act AFTER the sever');
  assert.ok(events.indexOf('npcjobs:unload') > wrangleAt,
    'the yard weigh-in only happens after the piece is aboard');
});

// ─── Owner: custody moves once, at the sever, out of the real pool ─────────────────────────────

function fixture() {
  const sim = createSimulation({ seed: 3, systems: [npcJobsRuntime, traffic], updateOrder: [npcJobsRuntime, traffic] });
  const state = sim.state;
  state.settings.gameplay.physicsBackend = 'custom'; // focused owner test; native route has its own fixture
  state.mode = 'flight'; state.world.currentSectorId = 'sector_test_salvor_aftermath';
  state.playerId = sim.spawn({ type: 'ship', team: 0, pos: { x: -10000, z: 0 }, hull: 100 }).id;
  sim.spawn({ type: 'station', pos: { x: 0, z: 0 }, radius: 40, data: { stationId: 'st' } });
  const wreck = sim.spawn({ type: 'wreck', pos: { x: 600, z: 0 }, radius: 20, hull: 10,
    data: { salvagePool: { cmdty_scrap_metal: 5, cmdty_alloys: 1 }, salvorNoticeAt: 0 } });
  const sys = sim.registry.get('traffic');
  sys.update(.25, state);
  const rec = state.traffic.freighters.find(row => row.role === 'salvor');
  const cutter = state.entities.get(rec.id);
  cutter.pos = { x: 580, z: 0 }; cutter.vel = { x: 0, z: 0 };
  const entry = sim.helpers.npcJobs.get(cutter.data.jobId);
  entry.job.phase = NPC_JOB_PHASE.WORK; entry.job.routeIndex = 1;
  const context = { jobId: entry.job.id, worldRecordId: cutter.data.worldRecordId, entity: cutter, rec };
  return { sim, sys, state, wreck, cutter, context };
}

test('sever completion drains the real pool into one manifest and stamps the claim', t => {
  const { sim, sys, state, wreck, cutter, context } = fixture();
  t.after(() => sim.dispose());
  const events = [];
  sim.bus.on('salvage:npcExtraction', p => events.push(['salvage:npcExtraction', p]));

  assert.equal(sys._takeSalvageValueOntoSalvor(context, { seq: 4 }, wreck), true);

  assert.equal(cutter.data.cargoManifest.totalQty, 6, 'the manifest is the drained pool, not a roll');
  assert.deepEqual(wreck.data.salvagePool, {}, 'the wreck is drained so nothing double-takes');
  assert.equal(wreck.data.salvorClaimedBy, cutter.data.worldRecordId, 'custody is stamped on the body');
  assert.equal(wreck.data._salvaged, true);
  assert.ok(events.some(([n, p]) => n === 'salvage:npcExtraction' && p.totalQty === 6));

  // A replayed completion of the same work never pays twice.
  assert.equal(sys._takeSalvageValueOntoSalvor(context, { seq: 4 }, wreck), false);
  assert.equal(cutter.data.cargoManifest.totalQty, 6, 'same work id, same one custody move');
});

test('a hull gone before the cut pays nothing and releases custody', t => {
  const { sim, sys, state, wreck, cutter } = fixture();
  t.after(() => sim.dispose());
  sim.helpers.removeEntity(wreck.id, { immediate: true, reason: 'player_took_hulk' });
  sys._clearSalvorClaim(wreck, cutter.data.worldRecordId); // dead body cannot retain custody

  const ok = sys._onNpcJobWork({
    event: 'npcjobs:work', jobId: cutter.data.jobId, kind: 'salvor', completed: true,
    seq: 9, field: `hulk:${wreck.id}`, waypointId: `hulk:${wreck.id}`, pos: { x: 600, z: 0 }, payload: null,
  });
  assert.equal(ok, false);
  const manifest = cutter.data.cargoManifest;
  assert.ok(manifest && manifest.totalQty === 0, 'the cutter leaves empty — nothing is minted');
  assert.equal(wreck.data.salvorClaimedBy, undefined, 'no phantom claim on a dead hulk');
});
