// inf-lane-horn — a fast close pass by the player is a stimulus the lane answers.
//
// Before this, a player could rip past a hauler close enough to read its hull plates and the lane
// did nothing: no swerve, no horn, no word. Now the pass jinks the hull off the player's line for
// a beat, leans on its class horn (escalating on repeats inside the memory window), and on a
// scrape or a repeat the crew speaks — one line per pass, ≤ 8 words, never lore. A third pass
// inside a station's traffic shell brings dock control onto the band. A pass is not a crime:
// nothing here touches heat, standing or hostility, and a hull that cannot answer (disabled,
// tethered, fleeing violence, the law's own hulls, a survival cohort) never reacts.
//
// Focused owners: src/systems/trafficNearMiss.js (the pure pass test + the traffic op),
// src/data/laneHorns.js (class/ladder/barks), src/systems/npcJobsRuntime.js swerveJob (the job
// hull's jink lease), src/systems/barkDirector.js _answerLaneHorn (the voice).
import test from 'node:test';
import assert from 'node:assert/strict';

// traffic.js is the integration root: it spreads trafficNearMissOps into the traffic owner, so it
// must evaluate first (the game manifest loads it the same way) before the near-miss module.
import '../src/systems/traffic.js';
import {
  NEAR_MISS_EVENT,
  NEAR_MISS_TUNING,
  predictPlayerPass,
  swerveForPass,
  trafficNearMissOps,
} from '../src/systems/trafficNearMiss.js';
import {
  LANE_HORN_MAX_STEP,
  clampLaneHornStep,
  laneHornBarkFor,
  laneHornClassForRole,
  laneHornCueFor,
  laneHornDockControlLine,
  laneHornRegisterFor,
} from '../src/data/laneHorns.js';
import { NPC_JOB_PHASE } from '../src/systems/npcJobs.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { barkDirector } from '../src/systems/barkDirector.js';

const haulerAt = (x, z, over = {}) => ({
  id: over.id || 'hauler-1',
  type: 'ship',
  alive: true,
  pos: { x, z },
  vel: { x: 0, z: 0 },
  rot: over.rot ?? 0,
  radius: 6,
  data: { trafficRole: over.role || 'hauler', ...(over.data || {}) },
  flags: {},
  ...over.entity,
});

const playerAt = (x, z, vx, vz) => ({
  id: 'player', type: 'ship', alive: true, pos: { x, z }, vel: { x: vx, z: vz }, radius: 6, data: {},
});

test('a fast close pass is a buzz; a slow, far or parked one is not', () => {
  // 300 wu/s closing, 30 wu off the hull's centre at closest approach.
  const pass = predictPlayerPass(playerAt(0, 120, 0, -300), haulerAt(0, 30));
  assert.ok(pass, 'a rip past a hauler reads as a pass');
  assert.equal(pass.relSpeed, 300);
  assert.ok(pass.missWu <= 6 + 6 + NEAR_MISS_TUNING.marginWu, 'the miss is inside the buzz margin');
  // A careful 40 wu/s drift is not a horn.
  assert.equal(predictPlayerPass(playerAt(0, 120, 0, -40), haulerAt(0, 30)), null,
    'a careful pass never honks');
  // A parked pilot cannot buzz anybody — the pass needs the player moving.
  assert.equal(predictPlayerPass(playerAt(0, 120, 0, 0), haulerAt(0, 30, { vel: { x: 0, z: -300 } })), null,
    'a parked pilot buzzes nobody');
  // Out of range entirely.
  assert.equal(predictPlayerPass(playerAt(0, 2000, 0, -300), haulerAt(0, 30)), null,
    'a hull two screens away was never buzzed');
});

test('the jink leaves the player line, deterministic on the hull identity for head-ons', () => {
  const hull = haulerAt(0, 0, { rot: 0 });
  const a = swerveForPass(hull, { cx: 10, cz: 0, vx: 0, vz: -300 }, 7);
  assert.equal(a.strafe, 1, 'the lateral kick runs away from the pass offset');
  assert.ok(Math.abs(a.aim) <= NEAR_MISS_TUNING.swerveYawRad + 1e-9, 'the nose turn is clamped');
  const b = swerveForPass(hull, { cx: 0, cz: 0, vx: 0, vz: -300 }, 7);
  const c = swerveForPass(hull, { cx: 0, cz: 0, vx: 0, vz: -300 }, 7);
  assert.equal(b.strafe, c.strafe, 'a dead-center pass picks its side from the hull, not a stream');
  assert.equal(b.aim, c.aim, 'the same hull breaks the same way twice');
});

test('the horn ladder: class per role, tap then double then lean, unlisted roles never honk', () => {
  assert.equal(laneHornClassForRole('hauler'), 'heavy');
  assert.equal(laneHornClassForRole('tug'), 'work');
  assert.equal(laneHornClassForRole('courier'), 'light');
  assert.equal(laneHornClassForRole('patrol'), null, 'the law has its own voice');
  assert.equal(laneHornClassForRole(undefined), null);
  for (const [role, first, second, third] of [
    ['hauler', 'sfx_hauler_blast', 'sfx_hauler_blast_double', 'sfx_hauler_blast_lean'],
    ['courier', 'sfx_lane_horn_tap', 'sfx_lane_horn_double', 'sfx_lane_horn_lean'],
  ]) {
    const at = (step) => laneHornCueFor(role, step);
    assert.equal(at(1).id, first);
    assert.equal(at(2).id, second);
    assert.equal(at(3).id, third);
    assert.ok(at(3).gain > at(1).gain, 'the held lean is the loud one');
  }
  assert.equal(clampLaneHornStep(99), LANE_HORN_MAX_STEP);
  assert.equal(clampLaneHornStep(0), 1);
});

test('every crew line is eight words or fewer, in register, with a tourist voice', () => {
  for (const register of ['heavy', 'work', 'light', 'tourist']) {
    for (const step of [1, 2, 3]) {
      const line = laneHornBarkFor(register, step, 0);
      assert.ok(line, `${register} speaks at step ${step}`);
      assert.ok(line.split(/\s+/).length <= 8, `"${line}" stays brief`);
    }
  }
  assert.equal(laneHornRegisterFor('tourist'), 'tourist');
  assert.equal(laneHornRegisterFor('hauler'), 'heavy');
  assert.equal(laneHornBarkFor('hostile', 1, 0), null, 'an unknown register stays wordless');
});

test('dock control names the hull, and never prints an id or a placeholder', () => {
  assert.equal(laneHornDockControlLine(0, 'Rift Kestrel'), 'Dock control: Rift Kestrel, ease off in the pattern.');
  assert.equal(laneHornDockControlLine(0, 'ship_mule_hauler'), 'Dock control: ease off in the pattern, pilot.',
    'a raw id picks the unnamed row');
  assert.equal(laneHornDockControlLine(0, ''), 'Dock control: ease off in the pattern, pilot.');
});

function trafficHarness() {
  const events = [];
  const ops = Object.create(trafficNearMissOps);
  ops.bus = { emit: (name, payload) => events.push({ name, payload }) };
  ops.helpers = {};
  return { ops, events };
}

test('an ambient hull jinks and leans on its horn; repeats escalate; the law never answers', () => {
  const { ops, events } = trafficHarness();
  const state = { mode: 'flight', simTime: 1000, world: { currentSectorId: 'sector_helios_prime' }, entities: new Map() };
  const hull = haulerAt(0, 30, { role: 'hauler' });
  const player = playerAt(30, 150, 0, -300); // off-centre: a close pass, not a scrape

  const first = ops._reactPlayerNearMiss(hull, { role: 'hauler' }, [], state, player);
  assert.equal(first, true, 'traffic flies the jink for an ambient hull');
  assert.equal(hull.data.intent.moveZ, 1, 'the hull takes the full lateral kick');
  assert.ok(Math.abs(hull.data.intent.aimAngle) <= NEAR_MISS_TUNING.swerveYawRad + 1e-9);
  const firstEvent = events.find((e) => e.name === NEAR_MISS_EVENT);
  assert.ok(firstEvent, 'the horn emitted');
  assert.equal(firstEvent.payload.step, 1);
  assert.equal(firstEvent.payload.horn.id, 'sfx_hauler_blast');
  assert.equal(firstEvent.payload.scrape, false, 'a 30 wu miss is close, not a scrape');

  // Inside the hull cooldown the same pass is already answered: the jink beat keeps flying
  // (swerved true, no new horn), and once the beat ends the pass itself is spent — no new event.
  state.simTime += 0.5;
  assert.equal(ops._reactPlayerNearMiss(hull, { role: 'hauler' }, [], state, player), true,
    'the jink beat keeps flying to its end');
  assert.equal(events.filter((e) => e.name === NEAR_MISS_EVENT).length, 1, 'one pass, one horn');
  state.simTime += 1.0;
  assert.equal(ops._reactPlayerNearMiss(hull, { role: 'hauler' }, [], state, player), false,
    'inside the cooldown the pass is spent');
  assert.equal(events.filter((e) => e.name === NEAR_MISS_EVENT).length, 1);

  // A dead-center pass at speed nearly scrapes paint — the hull's first word rides the horn.
  const { ops: ops2, events: events2 } = trafficHarness();
  const state2 = { mode: 'flight', simTime: 1000, world: { currentSectorId: 'sector_helios_prime' }, entities: new Map() };
  ops2._reactPlayerNearMiss(haulerAt(0, 30, { id: 'center-1' }), { role: 'hauler' }, [], state2, playerAt(0, 150, 0, -300));
  assert.equal(events2.find((e) => e.name === NEAR_MISS_EVENT).payload.scrape, true,
    'a dead-center rip reads as a scrape');

  // A second pass after the cooldown escalates the same voice.
  state.simTime += NEAR_MISS_TUNING.hullCooldownS + NEAR_MISS_TUNING.sectorGapS + 0.1;
  ops._reactPlayerNearMiss(hull, { role: 'hauler' }, [], state, player);
  state.simTime += NEAR_MISS_TUNING.hullCooldownS + NEAR_MISS_TUNING.sectorGapS + 0.1;
  ops._reactPlayerNearMiss(hull, { role: 'hauler' }, [], state, player);
  const steps = events.filter((e) => e.name === NEAR_MISS_EVENT).map((e) => e.payload.step);
  assert.deepEqual(steps, [1, 2, 3], 'tap, double, held lean');
  assert.equal(events[events.length - 1].payload.horn.id, 'sfx_hauler_blast_lean');

  // The law's own hulls have no horn to lean on.
  const patrol = haulerAt(0, 30, { id: 'patrol-1', role: 'patrol' });
  assert.equal(ops._reactPlayerNearMiss(patrol, { role: 'patrol' }, [], state, player), false);
  assert.equal(patrol.data.intent, undefined, 'no jink was written');

  // A hull already fleeing violence keeps that reaction and its voice.
  const fleeing = haulerAt(0, 30, { id: 'fleeing-1', role: 'hauler', data: { trafficRole: 'hauler', violenceAlarmed: true } });
  assert.equal(ops._reactPlayerNearMiss(fleeing, { role: 'hauler' }, [], state, player), false);

  // A disabled hull does not honk.
  const dead = haulerAt(0, 30, { id: 'dead-1', role: 'hauler', data: { trafficRole: 'hauler', disabled: true } });
  assert.equal(ops._reactPlayerNearMiss(dead, { role: 'hauler' }, [], state, player), false);
});

test('a job hull leases its jink to the job runtime; the lease is bounded and honest', () => {
  const { ops, events } = trafficHarness();
  const state = { mode: 'flight', simTime: 2000, world: { currentSectorId: 'sector_helios_prime' }, entities: new Map() };
  const hull = haulerAt(0, 30, { id: 'job-hauler-1', role: 'hauler', data: { trafficRole: 'hauler', jobId: 'job-7' } });
  const leases = [];
  ops.helpers.npcJobs = { swerve: (jobId, swerve) => { leases.push({ jobId, swerve }); return true; } };

  assert.equal(ops._reactPlayerNearMiss(hull, { role: 'hauler' }, [], state, playerAt(0, 150, 0, -300)), false,
    'the job owner keeps its single intent writer');
  assert.equal(leases.length, 1, 'the jink was leased, not written');
  assert.equal(leases[0].jobId, 'job-7');
  assert.ok(leases[0].swerve.untilSimT <= state.simTime + NEAR_MISS_TUNING.swerveS + 1e-9);
  const event = events.find((e) => e.name === NEAR_MISS_EVENT);
  assert.ok(event, 'the horn still sounds at the hull');
  assert.equal(event.payload.swerved, true);

  // The lease boundaries, through the runtime's own door.
  const jobs = Object.create(npcJobsRuntime);
  jobs.state = { simTime: 500 };
  const byId = {
    'j-transit': { job: { phase: NPC_JOB_PHASE.TRANSIT } },
    'j-work': { job: { phase: NPC_JOB_PHASE.WORK } },
    'j-controlled': { job: { phase: NPC_JOB_PHASE.TRANSIT }, control: { kind: 'tether' } },
  };
  jobs._byId = () => byId;
  assert.equal(jobs.swerveJob('j-transit', { aim: 0.4, strafe: 1, untilSimT: 501 }), true);
  assert.equal(jobs.swerveJob('j-work', { aim: 0.4, strafe: 1, untilSimT: 501 }), false,
    "a bench phase keeps the SF-081 brace instead");
  assert.equal(jobs.swerveJob('j-controlled', { aim: 0.4, strafe: 1, untilSimT: 501 }), false,
    'a leased or fleeing hull refuses');
  assert.equal(jobs.swerveJob('j-transit', { aim: 0.4, strafe: 1, untilSimT: 520 }), false,
    'no lease longer than the jink beat');
  assert.equal(jobs.swerveJob('j-nobody', { aim: 0.4, strafe: 1, untilSimT: 501 }), false);
});

test('the crew speaks on a scrape or a repeat; dock control calls the third pass in its shell', () => {
  const said = [];
  const dir = Object.create(barkDirector);
  dir.state = {
    mode: 'flight', simTime: 3000,
    world: { currentSectorId: 'sector_helios_prime' },
    entities: new Map([
      ['hauler-9', haulerAt(5, 5, { id: 'hauler-9' })],
      ['station-1', { id: 'station-1', type: 'station', alive: true, pos: { x: 0, z: 0 }, data: {} }],
    ]),
  };
  dir.bus = { emit: () => {} };
  dir.helpers = { voice: { say: (line) => { said.push(line); return true; } } };

  // A first pass that nearly scraped paint earns a word; a clean first pass stays horn-only.
  let receipt = dir._answerLaneHorn({ entityId: 'hauler-9', role: 'hauler', step: 1, scrape: true, count: 1,
    horn: { id: 'sfx_hauler_blast', rate: 1, gain: 0.7 }, lineIndex: 1, stationEntityId: null });
  assert.equal(receipt.horn, 'sfx_hauler_blast');
  assert.ok(receipt.text, 'a scrape speaks');
  assert.equal(said.length, 1);
  receipt = dir._answerLaneHorn({ entityId: 'hauler-9', role: 'hauler', step: 1, scrape: false, count: 1,
    horn: { id: 'sfx_hauler_blast', rate: 1, gain: 0.7 }, lineIndex: 1, stationEntityId: null });
  assert.equal(receipt.text, null, 'a clean first tap is horn only');

  // The third pass inside a station's shell brings dock control on, once per watch.
  const payload = { entityId: 'hauler-9', role: 'hauler', step: 3, scrape: false, count: 3,
    horn: { id: 'sfx_hauler_blast_lean', rate: 1, gain: 0.95 }, lineIndex: 2, stationEntityId: 'station-1' };
  receipt = dir._answerLaneHorn(payload);
  assert.ok(receipt.dockText, 'dock control speaks');
  assert.ok(!/\{ship\}|_[a-z]{2,}|faction_/.test(receipt.dockText), 'no placeholder, no raw id');
  said.length = 0;
  dir._answerLaneHorn(payload);
  assert.equal(said.filter((line) => line.kind === 'laneHornDock').length, 0,
    'one call per station per watch');
});
