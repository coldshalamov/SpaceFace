// INF-071 — one industrial pocket visibly completes its job. A miner's UNLOAD posts a lot
// and a hauler's LOAD claims the SAME lot identity — the handoff is one shared cargo, not
// two invisible transactions. A LOAD with no standing lot is announced as an empty run, and
// interruption is truthful: a killed miner posts nothing, and a claimed lot dies with its
// hauler instead of returning to the shelf.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const MINER_ROUTE = [{ id: 'home', pos: { x: 0, z: 0 } }, { id: 'field', pos: { x: 600, z: 0 } }];
const HAULER_ROUTE = [{ id: 'origin', pos: { x: 0, z: 0 } }, { id: 'dest', pos: { x: 800, z: 0 } }];
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1 };
const minerSpec = (o = {}) => ({ kind: NPC_JOB_KIND.MINER, route: MINER_ROUTE, sectorId: 'sector_a', ...SHORT, ...o });
const haulerSpec = (o = {}) => ({ kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, sectorId: 'sector_a', ...SHORT, ...o });

function boot() {
  const sim = createSimulation({ seed: 7, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId, pos = { x: 0, z: 0 }) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x: pos.x, z: pos.z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function stepSeconds(sim, s) { steps(sim, Math.round(s / DT)); }
function jobsOf(sim) {
  return sim.registry.get('npcJobsRuntime');
}

test('unload posts a lot and the next load claims the same identity', () => {
  const sim = boot();
  const seen = { posted: [], claimed: [], empty: [] };
  sim.bus.on('npcjobs:lotPosted', (p) => seen.posted.push(p));
  sim.bus.on('npcjobs:lotClaimed', (p) => seen.claimed.push(p));
  sim.bus.on('npcjobs:loadEmpty', (p) => seen.empty.push(p));

  // A hauler that loads before any miner unloads departs light — announced, not faked.
  sim.helpers.npcJobs.assign(hull(sim, 'rec-early-hauler'), haulerSpec());
  stepSeconds(sim, 5);
  assert.equal(seen.empty.length, 1, 'the first load finds no standing lot and says so');
  assert.equal(seen.claimed.length, 0, 'nothing to claim');

  // A full miner cycle posts exactly one lot.
  sim.helpers.npcJobs.assign(hull(sim, 'rec-miner'), minerSpec());
  stepSeconds(sim, 25);
  assert.equal(seen.posted.length, 1, 'one unload posts one lot');
  const lotId = seen.posted[0].lotId;
  assert.match(lotId, /^lot:job:rec-miner:l\d+$/, 'the lot names its source job and loop');

  // The next hauler claims that same lot; the shelf is empty afterwards.
  sim.helpers.npcJobs.assign(hull(sim, 'rec-late-hauler'), haulerSpec());
  stepSeconds(sim, 5);
  assert.equal(seen.claimed.length, 1, 'the late load claims the standing lot');
  assert.equal(seen.claimed[0].lotId, lotId, 'same cargo identity on both sides of the handoff');
  assert.equal(seen.claimed[0].sourceJobId, 'job:rec-miner', 'the claim names the miner job');
  assert.equal(jobsOf(sim)._lots().sector_a, null, 'a claimed lot leaves the shelf');
});

test('interruption is truthful: killed hulls post and re-post nothing', () => {
  const sim = boot();
  const seen = { posted: [], claimed: [], empty: [] };
  sim.bus.on('npcjobs:lotPosted', (p) => seen.posted.push(p));
  sim.bus.on('npcjobs:lotClaimed', (p) => seen.claimed.push(p));
  sim.bus.on('npcjobs:loadEmpty', (p) => seen.empty.push(p));

  // A miner killed mid-work never posts.
  const doomedMiner = hull(sim, 'rec-doomed-miner');
  sim.helpers.npcJobs.assign(doomedMiner, minerSpec());
  stepSeconds(sim, 6);
  sim.bus.emit('entity:destroyed', { id: doomedMiner.id });
  stepSeconds(sim, 25);
  assert.equal(seen.posted.length, 0, 'work that never finished posts no lot');

  // A posted lot claimed by a hauler that then dies is gone — not back on the shelf.
  sim.helpers.npcJobs.assign(hull(sim, 'rec-miner-2'), minerSpec());
  stepSeconds(sim, 25);
  assert.equal(seen.posted.length, 1, 'the second miner posts');
  const hauler = hull(sim, 'rec-doomed-hauler');
  sim.helpers.npcJobs.assign(hauler, haulerSpec());
  stepSeconds(sim, 5);
  assert.equal(seen.claimed.length, 1, 'the hauler claims the lot');
  sim.bus.emit('entity:destroyed', { id: hauler.id });
  stepSeconds(sim, 2);
  sim.helpers.npcJobs.assign(hull(sim, 'rec-next-hauler'), haulerSpec());
  stepSeconds(sim, 5);
  assert.equal(seen.empty.length, 1, 'the claimed lot died with its hull — the next load runs empty');
  assert.equal(seen.claimed.length, 1, 'no phantom re-claim');
});

test('standing stock survives a save round trip, garbage does not', () => {
  const sim = boot();
  sim.helpers.npcJobs.assign(hull(sim, 'rec-miner-3'), minerSpec());
  stepSeconds(sim, 25);
  const jobs = jobsOf(sim);
  const lotId = jobs._lots().sector_a && jobs._lots().sector_a.lotId;
  assert.ok(lotId, 'a lot stands before the round trip');
  const data = jobs.serialize();
  assert.ok(data.lots && data.lots.sector_a, 'the envelope carries the ledger');
  jobs.deserialize({ ...data, lots: { ...data.lots, junk: { nope: true }, sector_a: { ...data.lots.sector_a, lotId: 42 } } });
  assert.equal(jobs._lots().sector_a, undefined, 'a corrupt lot row is dropped, never resurrected');
  jobs.deserialize(data);
  assert.equal(jobs._lots().sector_a.lotId, lotId, 'standing stock restores with its identity');
});
