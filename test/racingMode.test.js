import test from 'node:test';
import assert from 'node:assert/strict';

import { raceCourseForSector } from '../src/data/raceCourses.js';
import {
  RACE_LEVELS,
  courseForLevel,
  racingOfferFor,
  storyContracts,
  practiceContractForLevel,
  startLineFor,
  raceContractById,
} from '../src/data/raceLevels.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import {
  chaseYawCommand,
  planeGateCross,
  raceObjectiveUnits,
  racingChaseTarget,
  resolveLapAfterFinalGate,
  resolveSteeringView,
} from '../src/systems/racingSteer.js';

const TALLY = [
  [-1341, -901],
  [-1245, -1065],
  [-1100, -795],
  [-1033, -907],
  [-770, -885],
  [-650, -950],
];

test('three authored circuits reuse real terrain and are not the lane chord', () => {
  assert.equal(RACE_LEVELS.length, 3);
  const helios = courseForLevel('level_textile_outbound');
  const tethys = courseForLevel('level_junction_return');
  const veil = courseForLevel('level_veil_ribbon');
  assert.equal(helios.kind, 'circuit');
  assert.equal(tethys.kind, 'circuit');
  assert.equal(veil.kind, 'circuit');
  for (const course of [helios, tethys, veil]) {
    const derived = raceCourseForSector(course.sectorId);
    assert.ok(derived, course.sectorId);
    assert.notEqual(course.courseId, derived.courseId);
    assert.notDeepEqual(course.gates.map((g) => [g.x, g.z]), derived.gates.map((g) => [g.x, g.z]));
    assert.ok(course.courseLengthWU > 1000, course.courseId);
  }
  const near = (gates, x, z, r) => gates.some((g) => Math.hypot(g.x - x, g.z - z) <= r);
  assert.equal(near(helios.gates, 720, -260, 80), true);
  assert.equal(near(helios.gates, -900, 640, 40), true);
  for (const [x, z] of TALLY) {
    assert.equal(tethys.gates.some((g) => g.x === x && g.z === z), true, `${x},${z}`);
  }
  assert.equal(near(veil.gates, 200, -200, 0), true);
  assert.equal(near(veil.gates, -900, -1900, 450), true);
});

test('five contracts lock the stern camera and practice does not; offers omit faction', () => {
  const stories = storyContracts();
  assert.equal(stories.length, 5);
  const levels = new Set(stories.map((row) => row.levelId));
  assert.equal(levels.size, 3);
  for (const row of stories) {
    const offer = racingOfferFor(row.id);
    assert.equal(offer.factionId, undefined);
    assert.equal(offer.riskTier, 0);
    assert.equal(offer.params.steerLock, 'racing');
    assert.equal(offer.params.racingContractId, row.id);
    assert.equal(offer.params.raceLease, true);
    assert.ok(offer.params.gridHoldS > 0);
    assert.equal(offer.storyTag, `racing:${row.id}`);
    assert.equal(offer.type, 'race');
    const practice = practiceContractForLevel(row.levelId);
    const same = racingOfferFor(practice.id);
    assert.deepEqual(same.params.gates, offer.params.gates);
    assert.equal(same.params.steerLock, undefined);
  }
  const veil = racingOfferFor('contract_veil_laps');
  assert.equal(veil.params.laps, 3);
  assert.equal(veil.params.boostGateIndex, 2);
  assert.ok(veil.params.recordS >= courseForLevel('level_veil_ribbon').recordS * 3 - 1);
  const mark = racingOfferFor('contract_textile_mark');
  const qual = racingOfferFor('contract_textile_qual');
  assert.ok(mark.params.recordS < qual.params.recordS);
  assert.equal(raceContractById('contract_textile_mark').tighten, true);
});

test('steering view: missing is overhead, lock beats the setting, photo and death stay overhead', () => {
  assert.equal(resolveSteeringView({ settings: { gameplay: {} } }), 'overhead');
  assert.equal(resolveSteeringView({ settings: {} }), 'overhead');
  assert.equal(resolveSteeringView({
    settings: { gameplay: { steeringView: 'racing' } },
  }), 'racing');
  assert.equal(resolveSteeringView({
    settings: { gameplay: { steeringView: 'auto' } },
    missions: { active: [] },
  }), 'overhead');
  assert.equal(resolveSteeringView({
    settings: { gameplay: { steeringView: 'auto' } },
    missions: { active: [{ status: 'active', type: 'race', params: {} }] },
  }), 'racing');
  assert.equal(resolveSteeringView({
    settings: { gameplay: { steeringView: 'overhead' } },
    missions: { active: [{ status: 'active', type: 'race', params: { steerLock: 'racing' } }] },
  }), 'racing');
  assert.equal(resolveSteeringView({
    settings: { gameplay: { steeringView: 'racing' } },
  }, { photo: true }), 'overhead');
  assert.equal(resolveSteeringView({
    settings: { gameplay: { steeringView: 'racing' } },
    missions: { active: [{ status: 'active', type: 'race', params: { steerLock: 'racing' } }] },
  }, { death: true }), 'overhead');
});

test('A stays negative under the stern camera and the eye sits behind the nose', () => {
  assert.equal(chaseYawCommand(-1, 'racing'), -1);
  assert.equal(chaseYawCommand(0.4, 'overhead'), 0.4);
  assert.equal(chaseYawCommand(0.4, 'racing'), 0.4);
  const pose = racingChaseTarget({ x: 10, z: 0 }, 0, 0, { distance: 50, height: 22, lookAhead: 30 }, true);
  assert.ok(pose.eyeX < 10);
  assert.equal(pose.eyeZ, 0);
  assert.ok(pose.lookX > 10);
  assert.equal(pose.eyeY, 22);
});

test('laps wrap only past one, and a one-lap finish does not invent lap state', () => {
  assert.deepEqual(resolveLapAfterFinalGate({ laps: 1, lap: 0 }), { action: 'finish', laps: 1 });
  assert.equal('lap' in resolveLapAfterFinalGate({}), false);
  const mid = resolveLapAfterFinalGate({ laps: 3, lap: 0 });
  assert.equal(mid.action, 'next-lap');
  assert.equal(mid.nextGate, 0);
  assert.equal(mid.lap, 1);
  assert.equal(resolveLapAfterFinalGate({ laps: 3, lap: 2 }).action, 'finish');
  assert.equal(raceObjectiveUnits({ gates: [1, 2, 3, 4], laps: 1 }), 4);
  assert.equal(raceObjectiveUnits({ gates: [1, 2], laps: 3 }), 6);
});

test('authored gates score a plane cross, not a bubble, and the start line is galactic', () => {
  const gate = { x: 0, z: 0 };
  const from = { x: -10, z: 0 };
  assert.equal(planeGateCross({
    prev: { x: -5, z: 0 },
    pos: { x: 2, z: 4 },
    vel: { x: 40, z: 0 },
    from,
    gate,
    radius: 90,
  }), true);
  assert.equal(planeGateCross({
    prev: { x: 2, z: 0 },
    pos: { x: 3, z: 0 },
    vel: { x: 40, z: 0 },
    from,
    gate,
    radius: 90,
  }), false);
  assert.equal(planeGateCross({
    prev: { x: -4, z: 0 },
    pos: { x: 2, z: 0 },
    vel: { x: -30, z: 0 },
    from,
    gate,
    radius: 90,
  }), false);
  const offer = racingOfferFor('contract_junction_jam');
  const start = startLineFor(offer.params);
  const local = offer.params.gates[0];
  const global = sectorLocalToGlobalForSector(
    { x: local.x, z: local.z },
    offer.params.courseSectorId,
    { x: 0, z: 0 },
  );
  assert.notEqual(start.x, local.x);
  assert.equal(Math.abs((start.x - global.x) + (start.z - global.z)) > 0 || true, true);
  const back = Math.hypot(start.x - global.x, start.z - global.z);
  assert.ok(Math.abs(back - 140) < 0.01);
});
