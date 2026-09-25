import test from 'node:test';
import assert from 'node:assert/strict';

import { ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

test('a tracked attack actually steers and brakes around the collider between it and its flight point', () => {
  const planner = new ManeuverPlanner({ seed: 7, config: { inputSlewPerTick: 1,
    emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 } });
  const rock = { id: 90, kind: 'hazard', pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 30, tags: ['solid'], confidence: 1 };
  const perception = { tick: 1, self: { id: 2, team: 1, pos: { x: 0, z: 0 },
    vel: { x: 70, z: 0 }, rot: 0, radius: 12, energyFraction: 1, heatFraction: 0 }, contacts: [rock] };
  const maneuver = { kind: ManeuverKind.INTERCEPT, flightPoint: { x: 600, z: 0 },
    formationSlot: { x: 600, z: 0 }, formationBound: 170, breakFormation: true };
  const directive = { squadId: 'run', formation: { slot: { x: 600, z: 0 }, bound: 170, breakFormation: true } };
  const request = planner.plan({ entityId: 2, tick: 1, perception, behavior: { maneuver }, directive });
  assert.ok(Math.abs(request.targetHeading) > 0.6, 'the collider produces a real shoulder route');
  assert.ok(Math.abs(request.forceLocal.right) > 0.02, 'tracked thrust follows that route too');
  assert.equal(request.brake, true, 'carried momentum needs braking before the rock');
  assert.equal(request.boost, false);
  perception.contacts = [{ ...rock, pos: { x: 90, z: 250 } }];
  const clear = planner.plan({ entityId: 2, tick: 2, perception, behavior: { maneuver }, directive });
  assert.ok(Math.abs(clear.targetHeading) < 0.01, 'cover outside the corridor does not deflect the pass');
});

test('an obstacle dodge moves the flight path but never steals a faceTarget firing face', () => {
  // D38: the obstacle sweep used to veto faceTarget, so a rock (or a packed sibling read as
  // cover) in the dodge cone turned every orbit/intercept into a firing blackout — the nose
  // chased the whipping route and fixed mounts sprayed past a stationary target. The dodge is
  // translational: it may route the thrusters, but the heading must stay on the target.
  const planner = new ManeuverPlanner({ seed: 7, config: { inputSlewPerTick: 1,
    emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1 } });
  const target = { id: 1, kind: 'ship', pos: { x: 600, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, tags: [], confidence: 1 };
  const rock = { id: 90, kind: 'hazard', pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 30, tags: ['solid'], confidence: 1 };
  const perception = { tick: 1, self: { id: 2, team: 1, pos: { x: 0, z: 0 },
    vel: { x: 70, z: 0 }, rot: 0, radius: 12, energyFraction: 1, heatFraction: 0 },
    contacts: [target, rock] };
  const maneuver = { kind: ManeuverKind.INTERCEPT, targetId: 1, faceTarget: true,
    flightPoint: { x: 600, z: 0 }, formationSlot: { x: 600, z: 0 }, formationBound: 170,
    breakFormation: true };
  const directive = { squadId: 'run', formation: { slot: { x: 600, z: 0 }, bound: 170,
    breakFormation: true } };
  const request = planner.plan({ entityId: 2, tick: 1, perception, behavior: { maneuver }, directive });
  const bearing = Math.atan2(target.pos.z - 0, target.pos.x - 0);
  assert.ok(Math.abs(request.targetHeading - bearing) < 0.05,
    `faceTarget must hold the nose on the target through the dodge, got ${request.targetHeading} vs ${bearing}`);
  assert.ok(Math.abs(request.forceLocal.right) > 0.02 || request.brake === true,
    'the dodge must still move the ship translationally — avoidance is not deleted');
});

test('a live ship in the path is not cover; only dead hulks enter the obstacle sweep', () => {
  // The same D38 mechanism: sibling ships carry the 'solid' tag in dense orbits and were being
  // swept as obstacles on ~9 of 10 pack plans. Ship-vs-ship avoidance has its own pass-around
  // lane with memory; a dead hulk stays cover. shipCollisionLookahead: 0 parks the pass-around
  // lane for this check so the obstacle sweep alone decides — in production the two lanes stack.
  const planner = new ManeuverPlanner({ seed: 7, config: { inputSlewPerTick: 1,
    emergencyInputSlewPerTick: 1, torqueSlewPerTick: 1, emergencyTorqueSlewPerTick: 1,
    shipCollisionLookahead: 0 } });
  const sibling = { id: 5, kind: 'ship', alive: true, pos: { x: 90, z: 0 }, vel: { x: 0, z: 0 },
    radius: 10, tags: ['solid'], confidence: 1 };
  const perception = { tick: 1, self: { id: 2, team: 1, pos: { x: 0, z: 0 },
    vel: { x: 20, z: 0 }, rot: 0, radius: 12, energyFraction: 1, heatFraction: 0 },
    contacts: [sibling] };
  const maneuver = { kind: ManeuverKind.INTERCEPT,
    flightPoint: { x: 600, z: 0 }, formationSlot: { x: 600, z: 0 }, formationBound: 170,
    breakFormation: true };
  const directive = { squadId: 'run', formation: { slot: { x: 600, z: 0 }, bound: 170,
    breakFormation: true } };
  const request = planner.plan({ entityId: 2, tick: 1, perception, behavior: { maneuver }, directive });
  assert.ok(Math.abs(request.targetHeading) < 0.4,
    `a live sibling must not force an obstacle shoulder route, got heading ${request.targetHeading}`);
  const hulk = { ...sibling, id: 6, alive: false };
  perception.contacts = [hulk];
  const hulked = planner.plan({ entityId: 3, tick: 1, perception, behavior: { maneuver }, directive });
  assert.ok(Math.abs(hulked.targetHeading) > 0.4,
    `a dead hulk in the corridor is still cover, got heading ${hulked.targetHeading}`);
});

test('retreat steering ignores a different-team contact the sensor oracle marks neutral', () => {
  const planner = new ManeuverPlanner({
    seed: 7,
    config: {
      freezeResults: false,
      includeTrajectory: false,
      inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1,
      emergencyTorqueSlewPerTick: 1,
    },
  });
  const formationSlot = { x: 1000, z: 0 };
  const directive = {
    squadId: 'patrol',
    objective: { kind: ObjectiveKind.RETREAT, targetId: null, reason: 'ordered_reform' },
    formation: {
      slot: formationSlot,
      velocity: { x: 0, z: 0 },
      bound: 100,
      breakFormation: true,
    },
  };
  const perception = {
    tick: 1,
    revision: 1,
    self: {
      id: 'patrol-1',
      team: 1,
      pos: { x: 0, z: 0 },
      vel: { x: 0, z: 0 },
      rot: 0,
      radius: 6,
      energyFraction: 1,
      heatFraction: 0,
      operationalMassBand: 'medium',
    },
    contacts: [{
      id: 'neutral-hauler',
      kind: 'ship',
      team: 2,
      hostile: false,
      alive: true,
      pos: { x: 500, z: 0 },
      vel: { x: 0, z: 0 },
      radius: 8,
      threat: 1,
      confidence: 1,
      operationalMassBand: 'medium',
      tags: [],
    }],
  };
  const behavior = {
    maneuver: {
      kind: ManeuverKind.RETREAT,
      targetId: null,
      formationSlot,
      formationVelocity: { x: 0, z: 0 },
      formationBound: 100,
      breakFormation: true,
      reason: 'ordered_reform',
    },
  };

  const request = planner.plan({
    tick: 1,
    entityId: 'patrol-1',
    perception,
    behavior,
    directive,
  });

  assert.ok(Math.abs(request.targetHeading) < 1e-12, `expected fallback heading toward formation, got ${request.targetHeading}`);
  assert.ok(request.forceLocal.forward > 0);
});
