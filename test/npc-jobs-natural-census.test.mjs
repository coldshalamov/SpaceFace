// PQ-014 NATURAL-OCCURRENCE census — the acceptance the wiring tests cannot give: jobs must arise
// from the EXISTING producer (ambient traffic), not from a fixture that hand-creates them.
//
// This fixture NEVER calls createJob or npcJobs.assign. It boots the real traffic system next to the
// runtime, drops a populated sector (stations + an asteroid field), and lets traffic's own spawn +
// role mix produce miner / hauler / patrol hulls — each of which the runtime naturally adopts as a
// job. Over two sim-days we then require real LIFECYCLE events (advancement, not just creation) for
// all three kinds: miners working/cycling a field, a hauler completing a terminal run, a patrol
// holding its beat.
//
// HELD-OUT SEEDS: 90218, 90219, 90223 — chosen to not collide with seeds used by other suites
// (kernel suite uses 1-123; sf-sim uses 47; encounter-director soak uses 31; mass-seed uses its own).
// Results are aggregated across the three seeds so the proof does not hinge on one seed's role RNG.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { traffic } from '../src/systems/traffic.js';

const HELD_OUT_SEEDS = [90218, 90219, 90223];
const DAY_SECONDS = 600;          // sectorSim day length; two days = the encounter-director soak span
const SECTOR = 'sector_census';

// A high-security industrial pocket: security ≥0.85 forces a patrol into the pocket role mix and
// mining/refinery industries boost the miner + hauler weights (traffic.js trafficRoleMixForSector /
// ensurePocketRoleMix). This is authored sector CONTEXT, not a job injection.
const SECTOR_DATA = { id: SECTOR, security: 0.9, trafficPerMin: 24, industries: { mining: true, refinery: true } };

function runCensus(seed) {
  const sim = createSimulation({ seed, systems: [npcJobsRuntime, traffic] });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.world = state.world || {};
  state.world.currentSectorId = SECTOR;

  // Populate the sector the way world would: several dock stations and an asteroid field, so the
  // miner (home↔field) and hauler (origin→destination) routes resolve to real geometry.
  for (const p of [{ x: 0, z: 0 }, { x: 950, z: 220 }, { x: -640, z: 760 }]) {
    sim.spawn({ type: 'station', team: 2, pos: p, vel: { x: 0, z: 0 }, radius: 34, hull: 1000, hullMax: 1000 });
  }
  for (let i = 0; i < 10; i++) {
    const a = 0.63 * i; const r = 380 + 46 * i;
    sim.spawn({ type: 'asteroid', team: 2, pos: { x: Math.cos(a) * r, z: Math.sin(a) * r }, vel: { x: 0, z: 0 }, radius: 22, hull: 200, hullMax: 200 });
  }

  // Observe kernel lifecycle intents on the bus (surfaced by the runtime's sink).
  const lifecycleByKind = { miner: new Set(), hauler: new Set(), patrol: new Set() };
  const totalByEvent = {};
  const LIFECYCLE = ['npcjobs:commission', 'npcjobs:depart', 'npcjobs:transit', 'npcjobs:approach',
    'npcjobs:work', 'npcjobs:load', 'npcjobs:unload', 'npcjobs:return', 'npcjobs:hold',
    'npcjobs:cycle', 'npcjobs:arrived', 'npcjobs:complete'];
  for (const ev of LIFECYCLE) {
    bus.on(ev, (intent) => {
      totalByEvent[ev] = (totalByEvent[ev] || 0) + 1;
      if (intent && lifecycleByKind[intent.kind]) lifecycleByKind[intent.kind].add(ev);
    });
  }

  // sector:enter → traffic spawns its ambient role mix and (via the runtime helper) each miner/
  // hauler/patrol hull is adopted as a job. The fixture does not touch either system's internals.
  bus.emit('sector:enter', { sectorId: SECTOR, sector: SECTOR_DATA });

  const jobs = sim.registry.get('npcJobsRuntime');
  const assignedKinds = new Set(Object.values(jobs._byId()).map((e) => e.kind));

  // Two sim-days at 60 Hz (runTicks(60) == 1 sim-second), matching the encounter-director soak span.
  for (let s = 0; s < 2 * DAY_SECONDS; s++) sim.runTicks(60);

  sim.dispose();
  return { assignedKinds, lifecycleByKind, totalByEvent };
}

test('natural census: ambient traffic naturally produces advancing miner, hauler AND patrol jobs (held-out seeds, no createJob in fixture)', () => {
  const minerEvents = new Set();
  const haulerEvents = new Set();
  const patrolEvents = new Set();
  const assignedUnion = new Set();
  const perSeed = [];

  for (const seed of HELD_OUT_SEEDS) {
    const r = runCensus(seed);
    for (const k of r.assignedKinds) assignedUnion.add(k);
    for (const e of r.lifecycleByKind.miner) minerEvents.add(e);
    for (const e of r.lifecycleByKind.hauler) haulerEvents.add(e);
    for (const e of r.lifecycleByKind.patrol) patrolEvents.add(e);
    perSeed.push({
      seed,
      assigned: [...r.assignedKinds].sort(),
      miner: [...r.lifecycleByKind.miner].length,
      hauler: [...r.lifecycleByKind.hauler].length,
      patrol: [...r.lifecycleByKind.patrol].length,
    });
    // Every seed must at least produce SOME natural jobs from the producer.
    assert.ok(r.assignedKinds.size > 0, `seed ${seed}: traffic produced at least one natural job`);
  }

  const diag = JSON.stringify(perSeed);

  // Jobs of all three kinds arose naturally from the producer.
  assert.ok(assignedUnion.has('miner'), `a miner job arose naturally ${diag}`);
  assert.ok(assignedUnion.has('hauler'), `a hauler job arose naturally ${diag}`);
  assert.ok(assignedUnion.has('patrol'), `a patrol job arose naturally ${diag}`);

  // ADVANCEMENT, not just creation: each kind emitted its kind-defining lifecycle event.
  //   miner  — works a field then cycles the loop
  //   hauler — reaches its terminal COMPLETE
  //   patrol — holds a beat / cycles the circuit
  assert.ok(minerEvents.has('npcjobs:work') || minerEvents.has('npcjobs:cycle'),
    `a natural miner worked/cycled a field ${diag}`);
  assert.ok(haulerEvents.has('npcjobs:complete') || haulerEvents.has('npcjobs:unload'),
    `a natural hauler completed a terminal run ${diag}`);
  assert.ok(patrolEvents.has('npcjobs:hold') || patrolEvents.has('npcjobs:cycle'),
    `a natural patrol held/cycled its beat ${diag}`);
});
