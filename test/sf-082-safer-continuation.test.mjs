// SF-082 — a hauler that visibly chooses a safer continuation.
//
// A route threat that interrupts a loaded hauler must not end in flee→resume→flee flapping
// when the hostile stays parked on the stop the leg was flying to. The job falls back to the
// nearest earlier stop outside the threat ring (the berth it came from), holds there with a
// bounded distress cry, keeps its manifest untouched, and resumes the exact interrupted leg
// the moment the lane clears. A threat back inside the hull's own flee ring re-takes ordinary
// away-flee — the hold point itself is not sacred ground.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const ROUTE = [
  { id: 'home:st_a', pos: { x: 0, z: 0 }, label: 'Refinery' },
  { id: 'dest:st_b', pos: { x: 2000, z: 0 }, label: 'Port B' },
];
function haulerSpec(o = {}) {
  return { kind: NPC_JOB_KIND.HAULER, route: ROUTE, sectorId: 'sector_a',
    speed: 100, commissionS: 0.5, departS: 0.5, approachS: 0.5, loadS: 0.5, unloadS: 0.5, dwellS: 0.5, ...o };
}

function boot() {
  const sim = createSimulation({ seed: 11, systems: [npcJobsRuntime] });
  sim.state.mode = 'flight';
  sim.state.world = { currentSectorId: 'sector_a', sectors: {} };
  sim.state.player = { heat: 0 };
  return sim;
}
function loadedHauler(sim, x = 600) {
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  e.data = e.data || {};
  e.data.worldRecordId = 'rec-hauler';
  e.data.sectorId = 'sector_a';
  e.data.cargoManifest = { lines: [{ itemId: 'ore_iron', qty: 12 }], totalQty: 12 };
  const jobId = sim.helpers.npcJobs.assign(e, haulerSpec());
  const entry = sim.registry.get('npcJobsRuntime')._byId()[jobId];
  entry.job.phase = NPC_JOB_PHASE.TRANSIT;
  entry.job.routeIndex = 0;
  entry.job.progress = 0.3;
  return { e, jobId, entry };
}
function hostile(sim, x, z) {
  const h = sim.spawn({ type: 'ship', team: 1, pos: { x, z }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  h.data = h.data || {};
  return h;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
function remove(sim, e) {
  sim.state.entities.delete(e.id);
  sim.state.entityList = sim.state.entityList.filter((x) => x !== e);
}

test('a threat parked on the destination closes the leg — the hauler falls back and holds', () => {
  const sim = boot();
  const { e, entry } = loadedHauler(sim);
  const distress = [];
  sim.bus.on('npcjobs:distress', (p) => distress.push(p));
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text || ''));

  // 1. provoke: a hostile gets close — ordinary flee interrupt
  const pirate = hostile(sim, e.pos.x + 300, 0);
  steps(sim, 12);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE, 'the close hostile interrupts the leg');

  // 2. the hostile leaves the hull's ring but camps the destination — old code resumed blind
  pirate.pos.x = 1900; pirate.pos.z = 60; // >760 from the hull, ~113 from the dest stop
  steps(sim, 30);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE, 'the leg stays closed while the stop is hot');
  assert.ok(entry.routeHold, 'a fallback continuation is chosen');
  assert.equal(entry.routeHold.x, 0, 'the fallback is the origin berth, outside the ring');
  assert.ok(distress.length >= 1, 'a bounded help cry goes out');
  assert.equal(distress[0].threatId, pirate.id);

  // 3. the hull is driven toward the fallback — an actual diversion, not a stance flag.
  //    (These minimal sims have no flight integrator; the intent IS the drive owner's output.)
  steps(sim, 30);
  const holdIntent = e.data.intent;
  assert.ok(holdIntent && holdIntent.moveZ > 0, 'the hauler motors to its fallback');
  assert.ok(Math.cos(holdIntent.aimAngle) < -0.9, 'aimed back at the origin berth, not the hot dest');
  assert.equal(entry.job.preInterruptPhase, NPC_JOB_PHASE.TRANSIT, 'the interrupted leg is remembered');
  assert.equal(e.data.cargoManifest.totalQty, 12, 'the manifest rides through the diversion');

  // 4. threaten the holding point: a hostile inside the flee ring re-takes away-flee
  const second = hostile(sim, e.pos.x + 200, 0);
  steps(sim, 12);
  const fleeIntent = e.data.intent;
  assert.ok(fleeIntent && fleeIntent.moveZ > 0 && Math.cos(fleeIntent.aimAngle) < -0.5,
    'a threat on the hold point still gets ordinary away-flee');
  remove(sim, second);

  // 5. clear the route threat before diversion completes — the exact leg resumes
  remove(sim, pirate);
  steps(sim, 30);
  assert.equal(entry.routeHold, null, 'the hold clears with the lane');
  assert.equal(entry.job.phase, NPC_JOB_PHASE.TRANSIT, 'the exact interrupted leg resumes');
  assert.equal(entry.job.routeIndex, 0);

  // 6. and it reaches a real sink: destination unload → complete, manifest delivered by owners
  steps(sim, 60 * 45);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.COMPLETE, 'the hauler finishes the run, not a loop');
});

test('a threat nowhere near the route resumes straight away — no invented diversions', () => {
  const sim = boot();
  const { e, entry } = loadedHauler(sim);
  const pirate = hostile(sim, e.pos.x + 300, 0);
  steps(sim, 12);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);

  // hostile leaves the bubble entirely — nothing blocks the pending stop
  pirate.pos.x = e.pos.x + 3000; pirate.pos.z = 3000;
  steps(sim, 30);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.TRANSIT, 'ordinary resume when the route is clear');
  assert.equal(entry.routeHold ?? null, null, 'no fallback was ever chosen');
});

// NOTICE-01: the distress cry is per speaker, not per hold row. A re-chosen or re-entered
// hold used to reset the cry clock and bark on every threat re-check — the flood.
test('the hold cry speaks once when the lane goes hot — re-checks stay quiet inside 60 s', () => {
  const sim = boot();
  const { e, entry } = loadedHauler(sim);
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(p.text || ''));
  const distress = [];
  sim.bus.on('npcjobs:distress', (p) => distress.push(p));
  const cries = () => toasts.filter((t) => t.includes("Lane's still hot")).length;

  const pirate = hostile(sim, e.pos.x + 300, 0);
  steps(sim, 12);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);
  pirate.pos.x = 1900; pirate.pos.z = 60;      // camps the destination
  steps(sim, 30);
  assert.ok(entry.routeHold, 'the fallback hold is chosen');
  assert.equal(cries(), 1, 'the lane going hot speaks once');

  // A second hostile taking over the camp re-chooses the hold row on the next re-check —
  // the re-created row used to reset the clock and cry again immediately.
  const second = hostile(sim, 1880, 40);
  remove(sim, pirate);
  steps(sim, 30);
  assert.ok(entry.routeHold, 'the hold re-chooses on the new threat');
  assert.equal(cries(), 1, 'a re-chosen hold inside the minute stays quiet');

  // Lane clears, then turns hot again inside the same minute — still quiet.
  remove(sim, second);
  steps(sim, 45);
  assert.equal(entry.routeHold, null, 'the leg resumes when the camp leaves');
  const late = hostile(sim, e.pos.x + 300, 0);
  steps(sim, 12);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE, 'the new close hostile re-interrupts');
  late.pos.x = 1900; late.pos.z = 60;
  steps(sim, 30);
  assert.ok(entry.routeHold, 'a fresh hold inside the same minute');
  assert.equal(cries(), 1, 'the second hot lane inside 60 s does not re-cry');

  // Bounded is not silenced: a lane that stays hot past the minute cries again.
  steps(sim, 60 * 65);
  assert.equal(cries(), 2, 'a still-hot lane re-cries on the bounded cadence');
  assert.equal(distress.length, 2, 'the distress event rides the same cadence');
  assert.ok(distress[1].simTime - distress[0].simTime >= 60,
    'two cries per speaker are at least a minute apart');
});

test('a route threat with no safe earlier stop hunkers in place', () => {
  const sim = boot();
  const e = sim.spawn({ type: 'ship', team: 2, pos: { x: 1400, z: 300 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8 });
  e.data = { worldRecordId: 'rec-h2', sectorId: 'sector_a', cargoManifest: { lines: [{ itemId: 'ore_iron', qty: 4 }], totalQty: 4 } };
  const jobId = sim.helpers.npcJobs.assign(e, haulerSpec({ route: [
    { id: 'home:st_a', pos: { x: 0, z: 0 }, label: 'Refinery' },
    { id: 'dest:st_b', pos: { x: 1200, z: 0 }, label: 'Port B' },
  ] }));
  const entry = sim.registry.get('npcJobsRuntime')._byId()[jobId];
  entry.job.phase = NPC_JOB_PHASE.TRANSIT;
  entry.job.routeIndex = 0;
  entry.job.progress = 0.3;

  const pirate = hostile(sim, 1700, 300); // close first — the ordinary interrupt
  steps(sim, 12);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);
  pirate.pos.x = 600; pirate.pos.z = 0;   // then it sits mid-route, inside the ring of BOTH stops
  steps(sim, 30);
  assert.ok(entry.routeHold, 'a hold is still chosen');
  assert.equal(entry.routeHold.x, e.pos.x, 'with every stop contested it hunkers on its own position');
  assert.equal(entry.routeHold.z, e.pos.z);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);
  remove(sim, pirate);
});
