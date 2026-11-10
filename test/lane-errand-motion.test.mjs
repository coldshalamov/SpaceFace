import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { LANE_ERRANDS, LANE_IDLE_MOTION, applyLaneErrandIntent } from '../src/systems/laneErrands.js';

const DT = 1 / 60, WORK_SPEED = Math.hypot(100, 74) / 20;

function harness({ slot = null, kind = 'miner', start = 0, motion = 'orbit' } = {}) {
  const sim = createSimulation({ seed: 4242, systems: [npcJobsRuntime, flightV3], updateOrder: [] });
  const { state } = sim;
  state.mode = 'flight'; state.playerId = -1;
  state.world.currentSectorId = 'sector_lane_motion_fixture';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ship = sim.spawn(makeShipEntitySpec('ship_pelican', { team: 2,
    pos: { x: 750, z: -280 }, ai: { passive: true } }));
  ship.data.worldRecordId = `fixture:${slot || 'idle-miner'}`;
  ship.data.sectorId = state.world.currentSectorId;
  if (slot) ship.data.activityActorSlotId = slot;
  const jobs = sim.registry.get(npcJobsRuntime.name), flight = sim.registry.get(flightV3.name);
  const jobId = jobs.assign(ship, { kind, sectorId: state.world.currentSectorId,
    route: [{ id: 'pad', pos: { x: 723, z: -360 } }, { id: 'ore', pos: { x: 623, z: -286 } }],
    speed: WORK_SPEED, commissionS: 30 });
  const entry = jobs._byId()[jobId];
  const definition = LANE_ERRANDS.find(row => row.motion === motion);
  entry.errand = { ...definition, until: start + 12, started: start,
    origin: { ...ship.pos }, said: false, motion };
  const events = [];
  sim.bus.on('npcjobs:errand', event => events.push(event));
  return { sim, state, ship, jobs, flight, entry, events, start };
}

async function runIdle(options = {}) {
  const h = harness(options), owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  try {
    const origin = { ...h.ship.pos };
    owner.syncFromEntities([h.ship]);
    let maxSpeed = 0, maxOffset = 0, distance = 0;
    const samples = [];
    for (let tick = 0; tick < 600; tick++) {
      h.state.tick = tick; h.state.simTime = h.start + tick * DT;
      const before = { ...h.ship.pos };
      h.jobs._drive(h.entry, h.ship);
      applyLaneErrandIntent(h.jobs, h.entry, h.ship, h.state.simTime);
      assert.ok(h.ship.data.intent.rendezvous, 'an idle curve uses the real bounded moving-frame servo');
      assert.equal(h.ship.data.intent.boost, false);
      h.flight.update(DT, h.state);
      owner.step(DT);
      maxSpeed = Math.max(maxSpeed, Math.hypot(h.ship.vel.x, h.ship.vel.z));
      maxOffset = Math.max(maxOffset, Math.hypot(h.ship.pos.x - origin.x, h.ship.pos.z - origin.z));
      distance += Math.hypot(h.ship.pos.x - before.x, h.ship.pos.z - before.z);
      if (tick % 60 === 59) samples.push([h.ship.pos.x, h.ship.pos.z, h.ship.vel.x, h.ship.vel.z, h.ship.rot]);
    }
    assert.equal(h.events.length, 1, 'the visible errand still speaks once');
    assert.equal(h.entry.job.phase, 'commission', 'the presentation helper does not own the job clock');
    return { maxSpeed, maxOffset, distance, samples };
  } finally { owner.dispose(); }
}

test('an idle default Pelican follows a small physical circle at its work pace', async t => {
  const result = await runIdle();
  assert.ok(result.maxSpeed <= WORK_SPEED + 0.2, 'an idle chore cannot demand combat-speed thrust');
  assert.ok(result.maxOffset <= LANE_IDLE_MOTION.radius * 2 + 2, 'the circle stays local');
  assert.ok(result.distance > 35, 'the pilot still performs a visible manoeuvre');
  t.diagnostic(JSON.stringify({ motion: 'orbit', maxSpeed: result.maxSpeed,
    maxOffset: result.maxOffset, distance: result.distance }));
});

test('a zero-time errand advances the same curve as the same errand armed later', async () => {
  const zero = await runIdle({ start: 0, motion: 'weave' });
  const later = await runIdle({ start: 42, motion: 'weave' });
  assert.deepEqual(zero.samples, later.samples, 'time zero is a real start, not a missing timestamp');
  assert.ok(zero.maxSpeed <= WORK_SPEED + 0.2);
  assert.ok(zero.maxOffset < LANE_IDLE_MOTION.radius * 1.6);
});

test('catalogued Helios work keeps its real job intent in commission, transit and return', () => {
  for (const [slot, kind] of [['helios_seam_miner', 'miner'], ['helios_seam_fence', 'salvor']]) {
    const h = harness({ slot, kind });
    for (const phase of ['commission', 'transit', 'return']) {
      h.entry.job.phase = phase;
      h.jobs._drive(h.entry, h.ship);
      const expected = structuredClone(h.ship.data.intent);
      applyLaneErrandIntent(h.jobs, h.entry, h.ship, 1);
      assert.deepEqual(h.ship.data.intent, expected, `${slot} ${phase}: the authored work owner retains the motor`);
      assert.equal(h.ship.data.intent.rendezvous, undefined);
    }
    assert.equal(h.events.length, 1, 'harmless crew chatter remains available during the shift');
  }
});

test('generic moving jobs, arrival brakes and physical frame holds outrank an idle story beat', () => {
  const h = harness();
  for (const phase of ['transit', 'return', 'work', 'load', 'unload', 'approach']) {
    h.entry.job.phase = phase;
    h.jobs._drive(h.entry, h.ship);
    const expected = structuredClone(h.ship.data.intent);
    applyLaneErrandIntent(h.jobs, h.entry, h.ship, 1);
    assert.deepEqual(h.ship.data.intent, expected, phase);
  }
  h.entry.job.phase = 'commission';
  h.jobs._writeIntent(h.ship, 0, 0, false, 1, true);
  let expected = structuredClone(h.ship.data.intent);
  applyLaneErrandIntent(h.jobs, h.entry, h.ship, 1);
  assert.deepEqual(h.ship.data.intent, expected, 'an explicit arrival brake remains engaged');
  h.jobs._writeIntent(h.ship, 0, 0, false, 1, false);
  h.ship.data.intent.rendezvous = { velocity: { x: 20, z: -5 }, heading: 1 };
  expected = structuredClone(h.ship.data.intent);
  applyLaneErrandIntent(h.jobs, h.entry, h.ship, 1);
  assert.deepEqual(h.ship.data.intent, expected, 'an existing moving-frame hold is not replaced');
});
