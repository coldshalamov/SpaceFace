import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { advance, NPC_JOB_KIND, NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';

const DT = 1 / 60;

function worker() {
  const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime, flightV3], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight'; state.playerId = -1;
  state.world.currentSectorId = 'sector_worker_escape_fixture';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  // The actual Adventure work hull, initial pose and route geometry. The focused fixture
  // isolates its job motor from gunfire and nearby mining fields, without replacing V3/SG02.
  const ship = sim.spawn(makeShipEntitySpec('ship_pelican', { team: 2,
    pos: { x: 750, z: -280 }, ai: { passive: true, archetype: 'fleeing_trader' } }));
  ship.rot = 0; ship.angVel = 0;
  ship.data.worldRecordId = 'fixture:helios_seam_miner';
  ship.data.sectorId = state.world.currentSectorId;
  const threat = sim.spawn({ type: 'ship', team: 1, collides: false,
    pos: { x: 1062.7, z: -454.2 }, vel: { x: 0, z: 0 }, radius: 6, hull: 100, hullMax: 100 });
  const jobs = sim.registry.get('npcJobsRuntime');
  const flight = sim.registry.get(flightV3.name);
  const jobId = jobs.assign(ship, { kind: NPC_JOB_KIND.MINER, sectorId: state.world.currentSectorId,
    route: [{ id: 'pad', pos: { x: 723, z: -360 } }, { id: 'ore', pos: { x: 623, z: -286 } }],
    speed: Math.hypot(100, 74) / 20, commissionS: 1, departS: 1, workS: 30 });
  const entry = jobs._byId()[jobId];
  advance(entry.job, 7);
  assert.equal(entry.job.phase, NPC_JOB_PHASE.TRANSIT);
  const prior = { phase: entry.job.phase, progress: entry.job.progress, sequence: entry.job.sequence };
  assert.equal(jobs.interruptJob(jobId, { entityId: threat.id }), true);
  return { sim, state, ship, threat, jobs, flight, jobId, entry, prior };
}

async function escape({ incomingSpeed = 0 } = {}) {
  const h = worker();
  const { ship, threat, state, jobs, entry, flight } = h;
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false, fixedDt: DT });
  try {
    const dx = ship.pos.x - threat.pos.x, dz = ship.pos.z - threat.pos.z;
    const initialSeparation = Math.hypot(dx, dz), ux = dx / initialSeparation, uz = dz / initialSeparation;
    owner.syncFromEntities([ship]);
    // A real queued field impulse tests whether the pilot arrests inward drift before departing.
    if (incomingSpeed) queuePhysicsImpulse(ship,
      { x: -ux * incomingSpeed * ship.mass, y: 0, z: -uz * incomingSpeed * ship.mass });
    let minSeparation = initialSeparation, firstBoostTick = null, boostTransitions = 0;
    let previousBoost = false, speedAt108 = null, separationAt108 = null;
    for (let tick = 0; tick < 360; tick++) {
      state.tick = tick; state.simTime = tick * DT;
      jobs._drive(entry, ship);
      const intent = ship.data.intent;
      if (intent.boost !== previousBoost) boostTransitions++;
      if (intent.boost && firstBoostTick == null) firstBoostTick = tick;
      previousBoost = intent.boost;
      const alignment = Math.cos(intent.aimAngle - ship.rot);
      if (intent.boost) assert.ok(alignment > 0.9, 'the escape burn must face away from danger');
      if (alignment < 0.5) assert.equal(intent.moveZ, 0, 'do not burn through the turn toward danger');
      flight.update(DT, state);
      owner.step(DT);
      minSeparation = Math.min(minSeparation, Math.hypot(ship.pos.x - threat.pos.x, ship.pos.z - threat.pos.z));
      if (tick === 107) {
        speedAt108 = Math.hypot(ship.vel.x, ship.vel.z);
        separationAt108 = Math.hypot(ship.pos.x - threat.pos.x, ship.pos.z - threat.pos.z);
      }
    }
    assert.ok(firstBoostTick != null && firstBoostTick > 30, 'a nose-in worker turns before its escape burn');
    assert.ok(boostTransitions <= 3, 'the burn does not chatter during a settled escape');
    const finalSeparation = Math.hypot(ship.pos.x - threat.pos.x, ship.pos.z - threat.pos.z);
    assert.ok(finalSeparation > initialSeparation + 600, 'the pilot still opens useful escape distance');
    assert.equal(entry.job.phase, NPC_JOB_PHASE.FLEE);
    assert.equal(jobs.resumeJob(h.jobId), true);
    assert.deepEqual({ phase: entry.job.phase, progress: entry.job.progress, sequence: entry.job.sequence }, h.prior,
      'escape does not reset the suspended work leg or its progress');
    const before = entry.job.progress;
    advance(entry.job, 0.5);
    assert.ok(entry.job.progress > before, 'the same job continues after the danger clears');
    return { incomingSpeed, initialSeparation, minSeparation, firstBoostTick, boostTransitions,
      speedAt108, separationAt108, finalSeparation };
  } finally { owner.dispose(); }
}

test('the default Pelican turns out of danger before boosting and resumes its work afterward', async t => {
  const result = await escape();
  assert.ok(result.minSeparation >= result.initialSeparation - 0.1,
    'a resting worker must not charge closer to the threat during its escape turn');
  t.diagnostic(JSON.stringify(result));
});

test('a worker brakes real inward field momentum while turning, then escapes under native physics', async t => {
  const result = await escape({ incomingSpeed: 40 });
  t.diagnostic(JSON.stringify(result));
  assert.ok(result.initialSeparation - result.minSeparation < 25,
    'the pilot counters the inward impulse rather than boosting it through the turn');
});

test('boost hysteresis uses restored V3 state and loaded work hulls keep their cargo restriction', () => {
  const h = worker();
  const { ship, threat, jobs, entry } = h;
  const aim = Math.atan2(ship.pos.z - threat.pos.z, ship.pos.x - threat.pos.x);
  ship.rot = aim - Math.acos(0.94);
  ship.data.propulsionRuntime = { previousBoost: true, cmdThrottle: 1, cmdStrafe: 0 };
  const restored = JSON.parse(JSON.stringify(ship));
  jobs._drive(entry, ship); jobs._drive(entry, restored);
  assert.equal(ship.data.intent.boost, true, 'small corrections retain an already established burn');
  assert.deepEqual(restored.data.intent, ship.data.intent, 'serialized motor state reconstructs the same decision');
  ship.data.propulsionRuntime.previousBoost = false;
  jobs._drive(entry, ship);
  assert.equal(ship.data.intent.boost, false, 'a new burn waits for stronger alignment');
  ship.rot = aim; ship.data.cargoManifest = { totalQty: 12 };
  jobs._drive(entry, ship);
  assert.equal(ship.data.intent.boost, false);
  assert.equal(ship.data.intent.moveZ, 1, 'loaded workers still make an aligned unboosted escape');
  assert.equal(ship.data.cargoManifest.totalQty, 12);
});
