// INF-024 — escort and patrol wings hold a legible screen.
//
// A screen leans toward the threat but never farther than it can go without tripping
// its own formation-rejoin: the old 35%-of-the-way point put a distant threat hundreds
// of wu off-station, so the ship lunged out, got yanked home, and lunged again. The
// leash keeps the excursion inside the rejoin radius with margin — one held line
// between protectee and threat, no heroic chase.
import test from 'node:test';
import assert from 'node:assert/strict';

import { ContactKind, ManeuverKind, ObjectiveKind } from '../src/ai/contracts.js';
import { ManeuverPlanner, screenPoint } from '../src/ai/maneuver.js';

test('INF-024: a distant threat pulls the screen to the leash, along the threat axis', () => {
  const slot = { x: 0, z: 0 };
  const point = screenPoint(slot, { x: 1500, z: 0 }, 170);
  assert.ok(point.x > 0 && Math.abs(point.z) < 1e-9, 'the lean stays on the threat axis');
  const dist = Math.hypot(point.x, point.z);
  assert.ok(dist <= 0.55 * 170 + 1e-9, `the excursion stays leashed, got ${dist}`);
  assert.ok(dist > 40, 'the lean is still a visible commitment, not the slot itself');
});

test('INF-024: a near threat keeps the legacy blend, and degenerate inputs hold station', () => {
  const near = screenPoint({ x: 0, z: 0 }, { x: 200, z: 0 }, 170);
  assert.ok(Math.abs(Math.hypot(near.x, near.z) - 70) < 1e-9, 'inside the leash nothing changes');
  const coincident = screenPoint({ x: 50, z: 50 }, { x: 50, z: 50 }, 170);
  assert.deepEqual(coincident, { x: 50, z: 50 });
  const badTarget = screenPoint({ x: 50, z: 50 }, null, 170);
  assert.deepEqual(badTarget, { x: 50, z: 50 });
  for (const bound of [60, 100, 170, 260, 400]) {
    const p = screenPoint({ x: 0, z: 0 }, { x: 1500, z: 900 }, bound);
    assert.ok(Math.hypot(p.x, p.z) < 0.62 * bound,
      `bound ${bound}: the screen never trips its own rejoin`);
  }
});

test('INF-024: a screening ship flies the leashed station, not the chase', () => {
  const planner = new ManeuverPlanner({ seed: 24, freezeResults: false });
  const perception = {
    self: {
      id: 2, team: 1, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 14, hullFraction: 1, energyFraction: 1, heatFraction: 0,
      disabled: false, tumbling: false, tethered: false,
      capabilities: ['drive'], activity: null, roe: 'weapons_free',
      combatDoctrineId: null, operationalMassBand: 'medium', mobilityBand: 'medium',
    },
    contacts: [{
      kind: ContactKind.SHIP, id: 1, hostile: true, hostileVotes: 1, friendlyVotes: 0,
      confidence: 1, threat: 0.9, pos: { x: 1500, z: 0 }, vel: { x: 0, z: 0 }, team: 0,
      tags: [],
    }],
    events: [],
  };
  const behavior = {
    maneuver: {
      kind: ManeuverKind.SCREEN, targetId: 1,
      formationSlot: { x: 0, z: 0 }, formationVelocity: { x: 0, z: 0 },
      formationBound: 170, breakFormation: true, reason: 'inf024_fixture',
    },
  };
  const directive = {
    formation: { slot: { x: 0, z: 0 }, velocity: { x: 0, z: 0 }, bound: 170, breakFormation: true },
    objective: { kind: ObjectiveKind.SCREEN, targetId: 1, reason: 'fixture' },
  };
  const request = planner.plan({ tick: 50, entityId: 2, perception, behavior, directive });
  assert.equal(request.kind, ManeuverKind.SCREEN);
  assert.ok(request.forceLocal.forward >= 0, 'the drive commits toward the station, never away');
});
