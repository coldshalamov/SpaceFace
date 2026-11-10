// SF-083 — a patrol that performs a job before a fight (equivalence pin).
//
// The packet asks that one lawful patrol's noncombat circuit be readable through checks /
// escorts / hazard response rather than constant aggressive orbiting, that it not treat every
// nearby team-1 hull as hostile, and that it never abandon its route after a harmless
// encounter. The machinery already exists — this test pins it end to end on the real runtime:
//
//   • the patrol KIND cycles a waypoint circuit with scheduled holds and never terminates
//     (kernel contract), and a spawned patrol hull runs that circuit through the runtime;
//   • its "check" is a physical act: an elastic-whip net on real offenders (pirate / smuggler /
//     raider / reach hulls) inside its own sector, attached through the combat attachment owner
//     mid-circuit — while the kernel job itself keeps cycling;
//   • IFF is role/faction-gated, not team-gated: a plain team-1 hull and a civilian are never
//     netted, and offenders from ANOTHER sector are outside jurisdiction;
//   • a control-lease pursuit hands the live hull back to the same continuing route —
//     the circuit is never abandoned by an encounter.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { NPC_JOB_PHASE, NPC_JOB_KIND } from '../src/systems/npcJobs.js';

const DT = 1 / 60;
const CIRCUIT = [
  { id: 'post:a', pos: { x: 0, z: 0 }, label: 'Gate' },
  { id: 'post:b', pos: { x: 800, z: 0 }, label: 'Yard Line' },
  { id: 'post:c', pos: { x: 400, z: 700 }, label: 'Depot' },
];
function patrolSpec(o = {}) {
  return { kind: NPC_JOB_KIND.PATROL, route: CIRCUIT, sectorId: 'sector_a',
    speed: 120, commissionS: 0.5, departS: 0.5, approachS: 0.5, dwellS: 2, ...o };
}

function boot() {
  const sim = createSimulation({
    seed: 21,
    systems: [physics, combat, npcJobsRuntime],
    updateOrder: [npcJobsRuntime, physics, combat],
  });
  sim.state.mode = 'flight';
  sim.state.world = { currentSectorId: 'sector_a', sectors: {} };
  sim.state.player = { heat: 0 };
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  return sim;
}
function patrolHull(sim) {
  const e = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, radius: 8, mass: 20, collides: true });
  e.data = { worldRecordId: 'wr-patrol', sectorId: 'sector_a', trafficRole: 'patrol' };
  const jobId = sim.helpers.npcJobs.assign(e, patrolSpec());
  return { e, jobId, entry: sim.registry.get('npcJobsRuntime')._byId()[jobId] };
}
function ship(sim, { team = 2, x, z, data = {} }) {
  const e = sim.spawn({ type: 'ship', team, pos: { x, z }, vel: { x: 0, z: 0 }, hull: 60, hullMax: 60, radius: 6, mass: 15, collides: true });
  e.data = { sectorId: 'sector_a', ...data };
  return e;
}
function steps(sim, n) { for (let i = 0; i < n; i++) sim.step(DT); }
async function ready(sim) {
  const physicsSystem = sim.registry.get('physics');
  assert.equal(await physicsSystem.prepareBackend(sim.state), true,
    'the interdiction proof uses the prepared production dynamic-body owner');
}
function dispose(sim) {
  const physicsSystem = sim.registry.get('physics');
  if (physicsSystem && typeof physicsSystem._disableSg02DynamicAuthority === 'function') {
    physicsSystem._disableSg02DynamicAuthority();
  }
  sim.dispose();
}
function whipOn(sim, target) {
  return Object.values(sim.state.combat.attachments.byId)
    .find((a) => a && a.state === 'active' && a.targetId === target.id) || null;
}

test('a calm circuit holds at every waypoint and cycles — the beat is the job', () => {
  const sim = boot();
  const { entry } = patrolHull(sim);
  const holds = new Set();
  sim.bus.on('npcjobs:hold', (p) => holds.add(p && p.at));
  sim.state.simTime = 0;
  steps(sim, 60 * 45); // ~45 s — several legs at 120 wu/s + dwells
  assert.ok(holds.size >= 2, `patrol visibly held its waypoints (${[...holds]})`);
  assert.ok(entry.job.loopCount >= 1, 'the circuit wrapped — a beat, not a lap-and-despawn');
  assert.notEqual(entry.job.phase, NPC_JOB_PHASE.COMPLETE, 'a patrol never terminates');
});

test('a real offender inside the beat gets the net — mid-circuit, job kept', async () => {
  const sim = boot();
  await ready(sim);
  const { e, entry } = patrolHull(sim);
  // a flagged offender lurking 200 wu off the patrol's start point — role 'pirate' marks it as
  // law work while passive AI keeps it below the shared civilian flee reflex (a hull actually
  // shooting still interrupts the patrol like any worker — that reflex is not touched here)
  const pirate = ship(sim, { team: 1, x: 200, z: 0,
    data: { role: 'pirate', ai: { passive: true, roe: 'hold_fire' } } });
  steps(sim, 60 * 8);
  const whip = whipOn(sim, pirate);
  assert.ok(whip, 'the patrol physically nets the offender — an interdiction, not a stance');
  assert.equal(whip.ownerId, e.id);
  assert.equal(whip.controlMode, 'npc_tow');
  assert.equal(pirate.data.npcTowedByJobId, 'job:wr-patrol', 'the collar is stamped to the job');
  assert.notEqual(entry.job.phase, NPC_JOB_PHASE.COMPLETE, 'the circuit continues through the stop');
  dispose(sim);
});

test('harmless hulls are never netted — IFF is role-gated, not team-gated', () => {
  const sim = boot();
  const { e } = patrolHull(sim);
  const calm = { ai: { passive: true, roe: 'hold_fire' } }; // below the flee reflex, on the beat
  const civilian = ship(sim, { team: 2, x: 150, z: 0, data: { role: 'hauler', ...calm } });
  const plainTeam1 = ship(sim, { team: 1, x: 180, z: 20, data: { ...calm } }); // team-1 but nobody flagged it
  const foreignPirate = ship(sim, { team: 1, x: 120, z: -30, data: { role: 'pirate', sectorId: 'sector_b', ...calm } });
  steps(sim, 60 * 20);
  assert.equal(whipOn(sim, civilian), null, 'a working civilian is not a patrol target');
  assert.equal(whipOn(sim, plainTeam1), null, 'a bare team-1 hull is not automatically hostile');
  assert.equal(whipOn(sim, foreignPirate), null, 'another sector\'s offender is outside jurisdiction');
});

test('a pursuit lease hands the same route back — the beat is never abandoned', () => {
  const sim = boot();
  const { jobId, entry } = patrolHull(sim);
  const runtime = sim.registry.get('npcJobsRuntime');
  steps(sim, 60 * 6);
  const phaseAtClaim = entry.job.phase;
  const claim = runtime.claimControl(jobId, { claimId: 'heist-pursuit', holder: 'test' });
  assert.equal(claim.granted, true, 'the real patrol hull is borrowable for a pursuit');
  steps(sim, 60 * 4);
  const back = runtime.releaseControl(jobId, 'heist-pursuit');
  assert.equal(back.released, true);
  steps(sim, 60 * 20);
  assert.notEqual(entry.job.phase, NPC_JOB_PHASE.COMPLETE);
  assert.ok(entry.job.loopCount >= 1 || phaseAtClaim !== entry.job.phase || entry.job.progress > 0,
    'the circuit kept advancing under the lease and after handback');
});

test('when the offender dies or the beat moves on, the whip clears and the circuit continues', async () => {
  const sim = boot();
  await ready(sim);
  const { e, entry } = patrolHull(sim);
  const pirate = ship(sim, { team: 1, x: 200, z: 0,
    data: { role: 'pirate', ai: { passive: true, roe: 'hold_fire' } } });
  steps(sim, 60 * 8);
  assert.ok(whipOn(sim, pirate), 'net attached');
  // the offender dies under the patrol — the line must clear, the beat must go on
  pirate.alive = false;
  sim.state.entities.delete(pirate.id);
  sim.state.entityList = sim.state.entityList.filter((x) => x !== pirate);
  steps(sim, 60 * 10);
  assert.equal(whipOn(sim, pirate), null, 'the line releases its dead target');
  assert.equal(entry.towAttachmentId ?? null, null, 'the job forgets the spent collar');
  steps(sim, 60 * 30);
  assert.ok(entry.job.loopCount >= 1, 'the patrol is still on its beat');
  dispose(sim);
});
