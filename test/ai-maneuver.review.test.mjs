import test from 'node:test';
import assert from 'node:assert/strict';

import { ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ManeuverPlanner } from '../src/ai/maneuver.js';

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
