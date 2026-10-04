// INF-WF01 crew response — the yard's truck answers its own.
//
// Player-facing claim: when a working NPC crew hull's drive is shot out within reach of a
// working tender, the tender's crew breaks off its route, flies to the casualty, and welds
// it back into the shift — visible as behavior (lease, approach, weld beat, burn-away), and
// the player can change the outcome (hold the truck off by being wanted on the wreck, shoot
// the truck, or clear the sky and watch the weld finish). Before this unit the ONLY repair
// emitter in the game was the player's own call-out; a crippled worker sat dead forever.
//
// Owner: src/systems/npcJobsRuntime.js (the same control-lease machinery as INF-U8).
// Proof: seed 4242, sector_ceres_belt, the live route sim — dispatch → approach → weld →
// repair; yield to the authored Ceres service incidents; hot-site hold then give-up; lawful
// order is not heat.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { world } from '../src/systems/world.js';
import { traffic } from '../src/systems/traffic.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { factionPresence } from '../src/systems/factionPresence.js';
import { mining } from '../src/systems/mining.js';

const DT = 1 / 60;
const SETTLE_S = 90;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Boot the live route sim at seed 4242 in Ceres and settle the working pocket. */
async function bootCeres() {
  const sim = createSimulation({
    seed: 4242,
    systems: [world, traffic, npcJobsRuntime, factionPresence, mining],
  });
  sim.state.mode = 'flight';
  const player = sim.spawn({
    type: 'ship', team: 0,
    pos: { x: 0, z: 0 }, radius: 12, hull: 100, hullMax: 100,
  });
  sim.state.playerId = player.id;
  sim.registry.get('world').enterSector('sector_ceres_belt');
  for (let i = 0; i < SETTLE_S * 60; i++) sim.step(DT);
  return { sim, player };
}

function findCast(sim) {
  const bag = sim.state.npcJobs.byId;
  const rt = sim.registry.get('npcJobsRuntime');
  let tender = null;
  for (const [jobId, entry] of Object.entries(bag)) {
    if (entry.job.kind !== 'tender' || entry.entityId == null) continue;
    const hull = sim.state.entities.get(entry.entityId);
    if (hull && hull.alive !== false) tender = { jobId, entry, hull };
  }
  assert.ok(tender, 'seed 4242 Ceres must field a working tender job');
  const casualties = [];
  for (const [jobId, entry] of Object.entries(bag)) {
    if (entry.job.kind === 'tender' || entry.entityId == null) continue;
    if (entry.job.corrupt || entry.job.phase === 'complete') continue;
    const hull = sim.state.entities.get(entry.entityId);
    if (!hull || hull.alive === false || !hull.pos) continue;
    if (rt._hotAt(hull.pos)) continue; // the seeded raider's ring is the hot-site scenario
    casualties.push({ jobId, entry, hull, d: dist(hull.pos, tender.hull.pos) });
  }
  casualties.sort((a, b) => b.d - a.d);
  return { rt, tender, casualties };
}

function resetCrewSlot(rt) {
  if (rt._crewResponse) rt.releaseControl(rt._crewResponse.jobId, rt._crewResponse.claimId);
  rt._crewResponse = null;
  rt._crewLastT = -Infinity;
}

test('a crippled worker gets the yard truck: dispatch, steering, weld, repair, release', async () => {
  const { sim, player } = await bootCeres();
  const { rt, tender, casualties } = findCast(sim);
  // This harness carries no movement applier, so the runtime's flight contract is what it
  // owns: the steering intent. Far casualty → the truck steers at the casualty unbraked;
  // alongside casualty → brake, weld, repair. Physical application of data.intent is the
  // movement layer's own contract, exercised by the live game on this same shape.
  const alongside = casualties.reduce((a, b) => (a && a.d <= b.d ? a : b), null);
  assert.ok(alongside, 'an alongside casualty must exist');
  const stages = [];
  sim.bus.on('npcjobs:crewResponse', (p) => stages.push({ t: sim.state.simTime, ...p }));
  let repair = null;
  sim.bus.on('combat:repairSubsystem', (p) => {
    if (p && p.reason === 'crew_field_repair') repair = { ...p };
  });
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(String(p && p.text)));

  // The witness stands within toast range of the wreck.
  player.pos.x = alongside.hull.pos.x + 400;
  player.pos.z = alongside.hull.pos.z;

  sim.bus.emit('combat:subsystemDisabled', {
    targetId: alongside.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });

  const dispatched = stages.find((s) => s.stage === 'dispatched');
  assert.ok(dispatched, 'the crew response must dispatch');
  assert.equal(dispatched.jobId, tender.jobId, 'the responder is the yard tender job');
  assert.equal(dispatched.casualtyJobId, alongside.jobId);
  assert.equal(sim.helpers.npcJobs.crewResponse().jobId, tender.jobId);

  // Arrival, then the weld takes a visible working beat, then the repair goes through the
  // combat owner.
  let welded = stages.find((s) => s.stage === 'welded');
  for (let s = 0; s < 60 && !welded; s++) {
    for (let k = 0; k < 60; k++) sim.step(DT);
    welded = stages.find((s2) => s2.stage === 'welded');
  }
  assert.ok(welded, 'the weld must complete');
  assert.ok(stages.find((s) => s.stage === 'welding'), 'the weld announces its working beat');
  assert.ok(repair, 'the field repair goes through the combat repair owner');
  assert.equal(repair.entityId, alongside.hull.id);
  assert.equal(repair.subsystemId, 'subsystem_drive');

  // The combat owner answers; the truck is released back to its route.
  sim.bus.emit('combat:subsystemEnabled', {
    targetId: alongside.hull.id,
    subsystemId: 'subsystem_drive',
  });
  assert.equal(sim.helpers.npcJobs.crewResponse(), null, 'the tender lease is released after the repair');
  assert.ok(stages.find((s) => s.stage === 'repaired'), 'the response closes on the record');
  assert.ok(
    toasts.some((t) => t.includes('yard tender breaks off')),
    `a witness near the wreck hears the yard roll out, saw: ${JSON.stringify(toasts)}`,
  );

  // Far-casualty steering: clear the response cooldown, then a worker beyond the arrival
  // ring must be chased — steering intent aimed at it, unbraked, while it is far.
  resetCrewSlot(rt);
  const bag = sim.state.npcJobs.byId;
  let far = null;
  let farD = 0;
  for (const [jobId, entry] of Object.entries(bag)) {
    if (entry.job.kind === 'tender' || entry.entityId == null) continue;
    if (entry.job.corrupt || entry.job.phase === 'complete') continue;
    const hull = sim.state.entities.get(entry.entityId);
    if (!hull || hull.alive === false || !hull.pos) continue;
    const d = dist(hull.pos, tender.hull.pos);
    if (d > farD && d <= 3400) { farD = d; far = { jobId, entry, hull, d }; }
  }
  assert.ok(far && far.d >= 250, 'a clear working casualty beyond the ring must exist');
  sim.bus.emit('combat:subsystemDisabled', {
    targetId: far.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });
  const lease = sim.helpers.npcJobs.crewResponse();
  assert.ok(lease, 'the tender is on a control lease while responding');
  assert.equal(lease.jobId, tender.jobId);
  assert.equal(lease.casualtyEntityId, far.hull.id);

  for (let s = 0; s < 5; s++) {
    for (let k = 0; k < 60; k++) sim.step(DT);
    const intent = tender.hull.data && tender.hull.data.intent;
    assert.ok(intent, 'the responding tender writes steering intent');
    const dx = far.hull.pos.x - tender.hull.pos.x;
    const dz = far.hull.pos.z - tender.hull.pos.z;
    const len = Math.hypot(dx, dz) || 1;
    const dot = (intent.moveX * dx + intent.moveZ * dz) / len;
    assert.ok(dot > 0.9, `the truck steers at the casualty (dot=${dot.toFixed(3)})`);
    assert.equal(intent.brake, false, 'a far casualty is not a brake condition');
  }
});

test('the authored Ceres service incidents keep their casualty — no second responder', async () => {
  const { sim, player } = await bootCeres();
  const { rt, casualties } = findCast(sim);
  const vic = casualties[0];
  assert.ok(vic, 'a working casualty must exist');
  vic.hull.data = vic.hull.data || {};
  vic.hull.data.ceresCausalEventId = 'ev_tender_services_miner';

  const stages = [];
  sim.bus.on('npcjobs:crewResponse', (p) => stages.push(p.stage));
  sim.bus.emit('combat:subsystemDisabled', {
    targetId: vic.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });
  for (let s = 0; s < 10; s++) {
    for (let k = 0; k < 60; k++) sim.step(DT);
  }
  assert.deepEqual(stages, [], 'an authored-incident casualty is yielded, not double-booked');
  assert.equal(sim.helpers.npcJobs.crewResponse(), null);
  assert.ok(vic.hull.alive !== false);
});

// The cue stamp above is only the transient half of the yield. The durable incident records
// (state.traffic.ceresDisabledHaulerIncident / ceresTenderServiceIncident) are the ownership
// truth that outlives a chain link — a casualty named by a LIVE record must yield the
// responder even with no cue stamp at all, and a record that has gone terminal must release
// the casualty back to the general responder.
test('the durable incident records yield the responder — and a terminal record releases it', async () => {
  const { sim, player } = await bootCeres();
  const { rt, tender, casualties } = findCast(sim);
  const stages = [];
  sim.bus.on('npcjobs:crewResponse', (p) => stages.push(p.stage));
  sim.state.traffic = sim.state.traffic || {};

  // Closest casualty to the tender, explicitly clear of any cue stamp: whatever happens
  // next is decided by the durable records alone.
  const vic = casualties[casualties.length - 1];
  assert.ok(vic, 'a working casualty must exist');
  vic.hull.data = vic.hull.data || {};
  delete vic.hull.data.ceresCausalEventId;
  const wrId = vic.hull.data.worldRecordId || vic.entry.worldRecordId || 'wr-crew-test-casualty';
  vic.hull.data.worldRecordId = wrId;
  const phaseBefore = vic.entry.job.phase;
  const driveDown = () => sim.bus.emit('combat:subsystemDisabled', {
    targetId: vic.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });

  // A live disabled-hauler recovery owns this casualty end to end: the yard's responder
  // yields — no dispatch, no lease, and the casualty's own job is not even interrupted
  // (a second responder would be a second owner of one story).
  sim.state.traffic.ceresDisabledHaulerIncident = {
    schema: 'spaceface.ceresDisabledHaulerRecovery.v1',
    incidentId: 'test-disabled-hauler:1',
    haulerWorldRecordId: wrId,
    state: 'responder_approach',
    outcome: null,
  };
  driveDown();
  assert.deepEqual(stages, [], 'a live incident record yields the responder — no second owner');
  assert.equal(sim.helpers.npcJobs.crewResponse(), null);
  assert.equal(vic.entry.job.phase, phaseBefore, 'the yield precedes even the casualty interrupt');

  // The same record gone terminal stops owning the casualty — the crew response runs.
  sim.state.traffic.ceresDisabledHaulerIncident.state = 'recovered';
  sim.state.traffic.ceresDisabledHaulerIncident.outcome = 'recovered';
  driveDown();
  assert.ok(stages.includes('dispatched'), 'a terminal record does not yield — the yard answers');
  const lease = sim.helpers.npcJobs.crewResponse();
  assert.ok(lease, 'the tender is on a control lease for the response');
  assert.equal(lease.jobId, tender.jobId);
  assert.equal(lease.casualtyEntityId, vic.hull.id);

  // Same law for the tender-services-miner record: a non-terminal state yields the casualty…
  resetCrewSlot(rt);
  stages.length = 0;
  sim.state.traffic.ceresDisabledHaulerIncident = null;
  sim.state.traffic.ceresTenderServiceIncident = {
    schema: 'spaceface.ceresTenderServiceIncident.v1',
    incidentId: 'test-tender-service:1',
    minerWorldRecordId: wrId,
    state: 'approach',
  };
  driveDown();
  assert.deepEqual(stages, [], 'a live tender-service record yields the responder too');
  assert.equal(sim.helpers.npcJobs.crewResponse(), null);

  // …and 'succeeded' is terminal — the casualty returns to the general responder pool.
  sim.state.traffic.ceresTenderServiceIncident.state = 'succeeded';
  driveDown();
  assert.ok(stages.includes('dispatched'), 'a closed service record does not yield');
});

test('a hot wreck holds the truck, and a sky that never clears ends the run honestly', async () => {
  const { sim, player } = await bootCeres();
  const { rt, tender, casualties } = findCast(sim);
  const vic = casualties[casualties.length - 1];
  assert.ok(vic, 'a working casualty must exist');

  // A weapons-free predator camps the wreck.
  const raider = sim.spawn({
    type: 'ship', team: 1,
    pos: { x: vic.hull.pos.x + 120, z: vic.hull.pos.z },
    radius: 10, hull: 100, hullMax: 100,
  });
  raider.data = raider.data || {};
  raider.data.ai = { ...(raider.data.ai || {}), passive: false, roe: 'weapons_free' };

  const stages = [];
  sim.bus.on('npcjobs:crewResponse', (p) => stages.push({ t: sim.state.simTime, ...p }));
  sim.bus.emit('combat:subsystemDisabled', {
    targetId: vic.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });
  assert.ok(stages.find((s) => s.stage === 'dispatched'), 'the yard still rolls out');

  let welded = null;
  let gaveUp = null;
  // The give-up bound is 90 sim seconds of held-off sky — run past it.
  for (let s = 0; s < 130 * 60 && !(welded || gaveUp); s++) {
    sim.step(DT);
    welded = welded || stages.find((x) => x.stage === 'welded') || null;
    gaveUp = gaveUp || stages.find((x) => x.stage === 'gave_up') || null;
  }
  assert.ok(!welded, 'the truck must not weld inside a firefight');
  assert.ok(gaveUp, 'a sky that never clears ends the response honestly');
  assert.equal(sim.helpers.npcJobs.crewResponse(), null, 'the lease is released on give-up');
  // The tender is not lost: its job is still live and releasable to its route.
  const tenderEntry = rt._byId()[tender.jobId];
  assert.ok(tenderEntry && tenderEntry.job && !tenderEntry.job.corrupt);
});

test('lawful order over a wreck is not heat: the truck welds beside a police patrol', () => {
  // The predicate, not the whole sim: a lawful-wanted-only patrol inside the ring must not
  // hold a truck, while a weapons-free hull in the same spot must.
  const rt = npcJobsRuntime;
  const savedState = rt.state;
  try {
    const lawful = {
      alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 },
      data: { ai: { passive: false, roe: 'lawful_wanted_only' } },
    };
    const predator = {
      alive: true, type: 'ship', team: 1, pos: { x: 0, z: 0 },
      data: { ai: { passive: false, roe: 'weapons_free' } },
    };
    rt.state = { entityList: [lawful] };
    assert.equal(rt._hotAt({ x: 50, z: 0 }), false, 'a lawful patrol is order, not a firefight');
    rt.state = { entityList: [predator] };
    assert.equal(rt._hotAt({ x: 50, z: 0 }), true, 'a weapons-free hull holds the truck');
    rt.state = { entityList: [lawful, predator] };
    assert.equal(rt._hotAt({ x: 2000, z: 0 }), false, 'outside the ring nothing is hot');
  } finally {
    rt.state = savedState;
  }
});

// SF-287 — a rescue interrupts a believable workday (equivalence pin on the payoff).
// The crew response above is the packet's mechanism: an existing worker casualty, a real
// tender leased off its own route, a visible weld through the combat repair owner. What the
// earlier rows do not pin is the packet's actual payoff — the interrupted JOB resuming its
// shift (phase, leg, progress, manifest) once the threat window lapses, not a thank-you flag.
test('SF-287: a rescued worker resumes the exact shift the casualty interrupted', async () => {
  const { sim, player } = await bootCeres();
  const { rt, tender, casualties } = findCast(sim);
  // A hull already under a control lease (berth queue, chain hint, assist) cannot be
  // interrupted — pick the closest casualty whose job is flying its own route.
  const free = casualties.filter((c) => !c.entry.control);
  const vic = free.reduce((a, b) => (a && a.d <= b.d ? a : b), null);
  assert.ok(vic, 'an unleashed working casualty must exist');
  const job = vic.entry.job;
  const shift = {
    phase: job.phase,
    routeIndex: job.routeIndex,
    progress: job.progress,
    manifestQty: vic.hull.data && vic.hull.data.cargoManifest
      ? vic.hull.data.cargoManifest.totalQty : null,
  };
  assert.notEqual(shift.phase, 'flee', 'the worker is on its shift before the casualty');

  const stages = [];
  sim.bus.on('npcjobs:crewResponse', (p) => stages.push({ t: sim.state.simTime, ...p }));
  const resumes = [];
  sim.bus.on('npcjobs:resumed', (p) => resumes.push({ ...p }));
  const toasts = [];
  sim.bus.on('toast', (p) => toasts.push(String(p && p.text)));

  // The interruption lands mid-shift with the player as the attacker — then the player
  // leaves the wreck alone (far away, never wanted).
  player.pos.x = vic.hull.pos.x - 9000;
  player.pos.z = vic.hull.pos.z - 9000;
  sim.bus.emit('combat:subsystemDisabled', {
    targetId: vic.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });
  assert.equal(job.phase, 'flee', 'the casualty interrupts the shift, not the job record');
  assert.equal(job.preInterruptPhase, shift.phase, 'the kernel remembers the exact work beat');
  assert.equal(job.routeIndex, shift.routeIndex);
  assert.equal(job.progress, shift.progress);

  assert.ok(stages.find((s) => s.stage === 'dispatched'), 'the yard answers the casualty');
  // No flight integrator in this harness — put the truck at the casualty and step the weld.
  tender.hull.pos = { x: vic.hull.pos.x + 60, z: vic.hull.pos.z };
  tender.hull.vel = { x: 0, z: 0 };
  let welded = stages.find((s) => s.stage === 'welded');
  for (let s = 0; s < 60 && !welded; s++) {
    for (let k = 0; k < 60; k++) sim.step(DT);
    welded = stages.find((x) => x.stage === 'welded');
  }
  assert.ok(welded, 'the weld completes against the real combat repair owner');
  sim.bus.emit('combat:subsystemEnabled', {
    targetId: vic.hull.id,
    subsystemId: 'subsystem_drive',
  });
  assert.ok(stages.find((s) => s.stage === 'repaired'), 'the response closes as repaired');
  assert.equal(sim.helpers.npcJobs.crewResponse(), null, 'the tender is released');

  // The payoff is the payoff: the 8 s threat window lapses with no live hostile, and the
  // threat-clear machinery hands the job its shift back — no reset, no new assignment.
  sim.state.simTime += 10;
  for (let k = 0; k < 120 && job.phase === 'flee'; k++) sim.step(DT);
  assert.equal(job.phase, shift.phase,
    `the rescue's payoff is the shift resuming — got ${job.phase}, wanted ${shift.phase}`);
  assert.equal(job.routeIndex, shift.routeIndex, 'the same leg resumes');
  // The resumed shift keeps working — progress continues from where the casualty left it,
  // never rewound to zero and never re-rolled.
  assert.ok(job.progress >= shift.progress,
    `progress continues, not resets (was ${shift.progress}, now ${job.progress})`);
  assert.equal(job.interrupted, false, 'the interrupt flag clears with the resume');
  if (shift.manifestQty != null) {
    assert.equal(vic.hull.data.cargoManifest.totalQty, shift.manifestQty,
      'the load the casualty was carrying survives the whole scene');
  }
  const ack = resumes.find((r) => r.jobId === vic.jobId);
  assert.ok(ack, 'the return is recorded on the bus');
  assert.equal(ack.via, 'threat_clear');
  assert.equal(ack.phase, shift.phase);
  // The player shot the drive out — the honest line acknowledges the rescue without
  // thanking the attacker for it.
  assert.ok(
    toasts.some((t) => /back to work/.test(t) && /Watch your fire/.test(t)),
    `the witness line is honest about who caused the casualty — saw: ${JSON.stringify(toasts.slice(-4))}`,
  );
});

test('SF-287: left unaided, the casualty still resumes — a coherent continuation, not a stall', async () => {
  const { sim, player } = await bootCeres();
  const { rt, tender, casualties } = findCast(sim);
  const vic = casualties[0];
  assert.ok(vic, 'a working casualty must exist');
  const job = vic.entry.job;
  const tenderJob = rt._byId()[tender.jobId].job;
  const tenderPhase = tenderJob.phase;

  // Nobody on the clock is in reach: park the worker beyond the yard's range.
  vic.hull.pos = { x: tender.hull.pos.x + 6000, z: tender.hull.pos.z };
  player.pos.x = vic.hull.pos.x - 9000;
  player.pos.z = vic.hull.pos.z - 9000;

  const stages = [];
  sim.bus.on('npcjobs:crewResponse', (p) => stages.push({ ...p }));
  sim.bus.emit('combat:subsystemDisabled', {
    targetId: vic.hull.id,
    subsystemId: 'subsystem_drive',
    attackerId: player.id,
  });
  const unanswered = stages.find((s) => s.stage === 'unanswered');
  assert.ok(unanswered, 'out of reach is recorded as unanswered, not a silent no-op');
  assert.equal(unanswered.casualtyJobId, vic.jobId);
  assert.equal(sim.helpers.npcJobs.crewResponse(), null, 'no tender was leased for a fake rescue');
  assert.equal(tenderJob.phase, tenderPhase, 'the tender never broke off its own work');
  assert.equal(job.phase, 'flee', 'the casualty still honestly interrupted the shift');

  // Unaided is not frozen: the same threat-clear continuation gets the worker back anyway —
  // help would have shortened the wait, never conjured the resume.
  sim.state.simTime += 10;
  for (let k = 0; k < 120 && job.phase === 'flee'; k++) sim.step(DT);
  assert.notEqual(job.phase, 'flee',
    'an unaided casualty resumes on the threat-clear path — nothing freezes');
  assert.equal(job.routeIndex != null && job.interrupted, false,
    'the workday continues coherently without help');
});
