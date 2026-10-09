// NXI-057: two unequal hulls waiting behind a narrow gap do not share one anchor.
// Spacing uses hull clearance. collisionRadius is not inflated.
import assert from 'node:assert/strict';
import test from 'node:test';

import { ContactKind, ManeuverKind } from '../src/ai/contracts.js';
import { gapWaitingPositions, ManeuverPlanner } from '../src/ai/maneuver.js';

const SEED = 4242;

function rock(id, x, radius) {
  return {
    id, kind: ContactKind.HAZARD, pos: { x, z: 0 }, vel: { x: 0, z: 0 },
    radius, collisionRadius: radius, tags: ['solid'], confidence: 1, alive: true,
  };
}

function hull(id, x, z, radius) {
  return {
    id, kind: ContactKind.SHIP, alive: true, team: 1,
    pos: { x, z }, vel: { x: 0, z: 0 }, rot: -Math.PI / 2,
    radius, collisionRadius: 4, planarRadius: 0,
    tags: [], confidence: 1, energyFraction: 1, heatFraction: 0,
  };
}

function hold(entityId, self, contacts, slot) {
  const planner = new ManeuverPlanner({
    seed: SEED,
    config: {
      inputSlewPerTick: 1,
      emergencyInputSlewPerTick: 1,
      torqueSlewPerTick: 1,
      emergencyTorqueSlewPerTick: 1,
    },
  });
  return planner.plan({
    entityId,
    tick: 1,
    perception: { tick: 1, self, contacts },
    behavior: {
      maneuver: {
        kind: ManeuverKind.HOLD,
        formationSlot: slot,
        formationVelocity: { x: 0, z: 0 },
        formationBound: 400,
        breakFormation: false,
        reason: 'gap_wait',
      },
    },
    directive: { squadId: 'wait', formation: { slot, bound: 400, breakFormation: false } },
  });
}

test('unequal hulls queue behind a narrow gap by clearance and do not share the anchor', () => {
  const lightRadius = 8;
  const heavyRadius = 28;
  const rocks = [rock(90, 0, 20), rock(91, 50, 20)];
  const mouth = { x: 25, z: 0 };
  const anchor = { x: mouth.x, z: -30 };
  const light = hull(1, mouth.x, -8, lightRadius);
  const heavy = hull(2, mouth.x, -48, heavyRadius);
  const points = gapWaitingPositions(anchor, [heavy, light], rocks);
  assert.ok(points, 'a narrow gap produces a waiting point per hull');
  const a = points.get(1);
  const b = points.get(2);
  assert.ok(a && b);
  const separation = Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(separation + 1e-6 >= lightRadius + heavyRadius, `centers ${separation} overlap`);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > 1);
  assert.ok(Math.hypot(a.x - anchor.x, a.z - anchor.z) > 1);
  assert.ok(Math.hypot(b.x - anchor.x, b.z - anchor.z) > 1);
  assert.equal(light.collisionRadius, 4);
  assert.equal(heavy.collisionRadius, 4);
  assert.equal(light.radius, lightRadius);
  assert.equal(heavy.radius, heavyRadius);

  light.pos = { x: a.x, z: a.z };
  heavy.pos = { x: b.x, z: b.z };
  const slot = { x: anchor.x, z: anchor.z };
  const lightReq = hold(1, light, [heavy, ...rocks], slot);
  const heavyReq = hold(2, heavy, [light, ...rocks], slot);
  assert.ok(Math.abs(lightReq.forceLocal.forward) < 0.05 && Math.abs(lightReq.forceLocal.right) < 0.05,
    'the light hull stays on its own clearance point');
  assert.ok(Math.abs(heavyReq.forceLocal.forward) < 0.05 && Math.abs(heavyReq.forceLocal.right) < 0.05,
    'the heavy hull stays on its own clearance point');
  assert.equal(slot.x, anchor.x);
  assert.equal(slot.z, anchor.z);
  assert.equal(light.collisionRadius, 4);
  assert.equal(heavy.collisionRadius, 4);
  assert.equal(rocks[0].collisionRadius, 20);
  assert.equal(rocks[1].collisionRadius, 20);

  const solo = hull(1, anchor.x, anchor.z, lightRadius);
  const soloReq = hold(1, solo, rocks, { x: anchor.x, z: anchor.z });
  assert.ok(Math.abs(soloReq.forceLocal.forward) < 0.05 && Math.abs(soloReq.forceLocal.right) < 0.05,
    'one hull keeps the shared anchor');

  const wide = [rock(90, 0, 20), rock(91, 200, 20)];
  const left = hull(1, anchor.x, anchor.z, lightRadius);
  const right = hull(2, anchor.x, anchor.z, heavyRadius);
  assert.equal(gapWaitingPositions(anchor, [left, right], wide), null);
  const wideReq = hold(1, left, [right, ...wide], { x: anchor.x, z: anchor.z });
  assert.ok(Math.abs(wideReq.forceLocal.forward) < 0.05 && Math.abs(wideReq.forceLocal.right) < 0.05,
    'a gap wide enough for both hulls abreast keeps the shared anchor');
});
