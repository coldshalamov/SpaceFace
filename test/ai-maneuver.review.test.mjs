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
