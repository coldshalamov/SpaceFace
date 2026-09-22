// INF (WF-09) — the world speaks when a feeder chain starves. A hauler that loads against an
// empty shelf (its contracted miner died before posting a lot) used to depart in total silence:
// `npcjobs:loadEmpty` had zero production listeners. The run's destination berth now publishes
// the shortfall as news — once per sector per window, deterministically worded, grounded in the
// job's own dest waypoint identity.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const SHORT = { speed: 100, commissionS: 1, departS: 1, approachS: 1, workS: 2, loadS: 1, unloadS: 1, dwellS: 1 };
// Hauler route in traffic's own job-spec language: durable station identities on the waypoints.
const HAULER_ROUTE = [
  { id: 'origin:station_helios', pos: { x: 0, z: 0 } },
  { id: 'dest:station_ceres', pos: { x: 800, z: 0 } },
];
const haulerSpec = (o = {}) => ({ kind: NPC_JOB_KIND.HAULER, route: HAULER_ROUTE, sectorId: 'sector_a', ...SHORT, ...o });

function boot() {
  const sim = createSimulation({ seed: 7, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = sim.state.world || {};
  sim.state.world.currentSectorId = 'sector_a';
  return sim;
}
function hull(sim, worldRecordId) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 6 });
  e.data = e.data || {};
  e.data.worldRecordId = worldRecordId;
  e.data.sectorId = 'sector_a';
  return e;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function stepSeconds(sim, s) { steps(sim, Math.round(s / DT)); }

test('an empty load publishes the shortfall at the destination berth', () => {
  const sim = boot();
  const seen = { empty: [], news: [] };
  sim.bus.on('npcjobs:loadEmpty', (p) => seen.empty.push(p));
  sim.bus.on('news:publish', (p) => seen.news.push(p));
  try {
    sim.helpers.npcJobs.assign(hull(sim, 'rec-starved-hauler'), haulerSpec());
    stepSeconds(sim, 6);

    assert.equal(seen.empty.length, 1, 'the empty run is still announced on the ledger bus');
    assert.equal(seen.news.length, 1, 'the destination berth says the delivery is short');
    const line = seen.news[0];
    assert.equal(line.kind, 'freight_short');
    assert.equal(line.stationId, 'station_ceres', 'the shortfall is named where it lands');
    assert.match(line.text, /Ceres Refinery/, 'the line uses the station display name');
    assert.match(line.id, /^npcjobs:short:/, 'the line carries a citation key so the ticker keeps it');
  } finally {
    sim.destroy?.();
  }
});

test('a starved field is one headline per window, not one per hauler', () => {
  const sim = boot();
  const seen = { empty: [], news: [] };
  sim.bus.on('npcjobs:loadEmpty', (p) => seen.empty.push(p));
  sim.bus.on('news:publish', (p) => seen.news.push(p));
  try {
    sim.helpers.npcJobs.assign(hull(sim, 'rec-hauler-a'), haulerSpec());
    stepSeconds(sim, 6);
    assert.equal(seen.news.length, 1);

    // A second hauler hits the same empty shelf inside the window; the berth stays quiet.
    sim.helpers.npcJobs.assign(hull(sim, 'rec-hauler-b'), haulerSpec());
    stepSeconds(sim, 6);
    assert.equal(seen.empty.length, 2, 'the shelf came up empty twice');
    assert.equal(seen.news.length, 1, 'but the berth said it once');

    // After the window expires, the next starved run speaks again.
    stepSeconds(sim, 245);
    sim.helpers.npcJobs.assign(hull(sim, 'rec-hauler-c'), haulerSpec());
    stepSeconds(sim, 6);
    assert.equal(seen.news.length, 2, 'one repeat after the window');
  } finally {
    sim.destroy?.();
  }
});

test('a job without a dest station identity stays ledger-only', () => {
  const sim = boot();
  const seen = { news: [] };
  sim.bus.on('news:publish', (p) => seen.news.push(p));
  try {
    sim.helpers.npcJobs.assign(hull(sim, 'rec-bare-route'), {
      kind: NPC_JOB_KIND.HAULER, sectorId: 'sector_a', ...SHORT,
      route: [{ id: 'origin', pos: { x: 0, z: 0 } }, { id: 'dest', pos: { x: 800, z: 0 } }],
    });
    stepSeconds(sim, 6);
    assert.equal(seen.news.length, 0, 'no station identity, no station voice');
  } finally {
    sim.destroy?.();
  }
});

test('newGame forgets the throttle so a fresh run speaks again', () => {
  const sim = boot();
  const seen = { news: [] };
  sim.bus.on('news:publish', (p) => seen.news.push(p));
  try {
    sim.helpers.npcJobs.assign(hull(sim, 'rec-fresh-hauler'), haulerSpec());
    stepSeconds(sim, 6);
    assert.equal(seen.news.length, 1);
    sim.registry.get('npcJobsRuntime').newGame();
    assert.deepEqual(sim.registry.get('npcJobsRuntime')._shortRunNewsAt, {},
      'the throttle is session state, not carried into a new run');
  } finally {
    sim.destroy?.();
  }
});
