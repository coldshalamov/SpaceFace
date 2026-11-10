// Starter world: a miner's lot changes hands only across the berth where it was set down. A
// hauler loading elsewhere in the sector runs empty and leaves the lot on the shelf; the hull
// that actually comes alongside claims it. The set-down point survives a save round trip.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1 };
const BERTH = { x: 0, z: 0 };
const FAR = { x: 5000, z: 0 };

function boot() {
  const sim = createSimulation({ seed: 8008, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId, pos) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { ...pos }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}
const haulerSpec = (at) => ({
  kind: NPC_JOB_KIND.HAULER, sectorId: 'sector_a', ...SHORT,
  route: [{ id: 'origin', pos: { ...at } }, { id: 'dest', pos: { x: at.x + 800, z: at.z } }],
});
function stepSeconds(sim, s) { for (let i = 0; i < Math.round(s / DT); i++) sim.step(DT); }

test('starter-world: a distant load cannot take the lot; the hull alongside the berth does', () => {
  const sim = boot();
  const seen = { posted: [], claimed: [], empty: [] };
  sim.bus.on('npcjobs:lotPosted', (p) => seen.posted.push(p));
  sim.bus.on('npcjobs:lotClaimed', (p) => seen.claimed.push(p));
  sim.bus.on('npcjobs:loadEmpty', (p) => seen.empty.push(p));
  const jobs = sim.registry.get('npcJobsRuntime');

  sim.helpers.npcJobs.assign(hull(sim, 'rec-sw-miner', BERTH), {
    kind: NPC_JOB_KIND.MINER, sectorId: 'sector_a', ...SHORT,
    route: [{ id: 'home', pos: { ...BERTH } }, { id: 'field', pos: { x: 600, z: 0 } }],
  });
  stepSeconds(sim, 25);
  assert.equal(seen.posted.length, 1, 'the miner sets one lot down');
  const lot = jobs._lots().sector_a;
  assert.ok(lot && lot.pos, 'the lot records where it was set down');
  assert.ok(Math.hypot(lot.pos.x - BERTH.x, lot.pos.z - BERTH.z) < 100, 'set down at the miner berth');

  const far = hull(sim, 'rec-sw-far-hauler', FAR);
  sim.helpers.npcJobs.assign(far, haulerSpec(FAR));
  stepSeconds(sim, 5);
  assert.equal(seen.claimed.length, 0, 'a load 5 km away claims nothing');
  const refused = seen.empty.find((p) => p.haulerJobId === 'job:rec-sw-far-hauler');
  assert.ok(refused && refused.reason === 'not_alongside' && refused.lotId === lot.lotId,
    'the distant hauler runs empty and says why');
  assert.equal(jobs._lots().sector_a && jobs._lots().sector_a.lotId, lot.lotId, 'the lot stays on the shelf');

  // Save round trip mid-wait: the set-down point is part of the lot, not a live binding.
  const data = jobs.serialize();
  jobs.deserialize(data);
  assert.deepEqual(jobs._lots().sector_a.pos, lot.pos, 'set-down point survives save/load');

  sim.helpers.npcJobs.assign(hull(sim, 'rec-sw-near-hauler', BERTH), haulerSpec(BERTH));
  stepSeconds(sim, 5);
  assert.equal(seen.claimed.length, 1, 'the hull alongside claims the lot');
  assert.equal(seen.claimed[0].lotId, lot.lotId);
  assert.equal(seen.claimed[0].haulerJobId, 'job:rec-sw-near-hauler');
  assert.equal(seen.claimed[0].sourceJobId, 'job:rec-sw-miner');
  const shelf = jobs._lots().sector_a;
  assert.notEqual(shelf && shelf.lotId, lot.lotId, 'claimed once, gone from the shelf');
  sim.dispose();
});
