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
  const wreck = {
    id: 9, type: 'wreck', alive: true, pos: { x: 600, z: 0 }, radius: 20,
    data: { salvagePool: { cmdty_scrap_metal: 5, cmdty_alloys: 1 } },
  };
  const cutter = {
    id: 7, type: 'ship', alive: true, pos: { x: 580, z: 0 },
    data: { jobId: 'job:wr_s1', worldRecordId: 'wr_s1' },
  };
  const state = {
    simTime: 10,
    meta: { seed: 3 },
    entities: new Map([[7, cutter], [9, wreck]]),
    entityList: [cutter, wreck],
    world: { currentSectorId: 'sec' },
  };
  const sys = Object.create(traffic);
  sys.state = state;
  return { sys, state, wreck, cutter };
}

test('sever completion drains the real pool into one manifest and stamps the claim', () => {
  const { sys, state, wreck, cutter } = fixture();
  const events = [];
  sys.bus = { emit: (n, p) => events.push([n, p]) };

  const context = { jobId: 'job:wr_s1', worldRecordId: 'wr_s1', entity: cutter, rec: { role: 'salvor' } };
  assert.equal(sys._takeSalvageValueOntoSalvor(context, { seq: 4 }, wreck), true);

  assert.equal(cutter.data.cargoManifest.totalQty, 6, 'the manifest is the drained pool, not a roll');
  assert.deepEqual(wreck.data.salvagePool, {}, 'the wreck is drained so nothing double-takes');
  assert.equal(wreck.data.salvorClaimedBy, 'wr_s1', 'custody is stamped on the body');
  assert.equal(wreck.data._salvaged, true);
  assert.ok(events.some(([n, p]) => n === 'salvage:npcExtraction' && p.totalQty === 6));

  // A replayed completion of the same work never pays twice.
  assert.equal(sys._takeSalvageValueOntoSalvor(context, { seq: 4 }, wreck), false);
  assert.equal(cutter.data.cargoManifest.totalQty, 6, 'same work id, same one custody move');
});

test('a hull gone before the cut pays nothing and releases custody', () => {
  const { sys, state, wreck, cutter } = fixture();
  sys.bus = { emit() {} };
  state.traffic = { freighters: [{ id: 7, role: 'salvor', manifest: null }] };
  wreck.alive = false; // player beat the cutter to it / hulk was destroyed mid-approach

  const ok = sys._onNpcJobWork({
    event: 'npcjobs:work', jobId: 'job:wr_s1', kind: 'salvor', completed: true,
    seq: 9, field: 'hulk:9', waypointId: 'hulk:9', pos: { x: 600, z: 0 }, payload: null,
  });
  assert.equal(ok, false);
  const manifest = cutter.data.cargoManifest;
  assert.ok(manifest && manifest.totalQty === 0, 'the cutter leaves empty — nothing is minted');
  assert.equal(wreck.data.salvorClaimedBy, undefined, 'no phantom claim on a dead hulk');
});
