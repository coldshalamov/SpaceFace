import test from 'node:test';
import assert from 'node:assert/strict';

import {
  authorityResponsePolicy,
  rankLawfulResponders,
  reserveArrivalPoint,
} from '../src/law/authorityResponse.js';

test('jurisdiction security controls readable dispatch delay and response strength', () => {
  const core = authorityResponsePolicy(0.95);
  const patrolled = authorityResponsePolicy(0.6);
  const frontier = authorityResponsePolicy(0.2);

  assert.deepEqual(core, {
    security: 0.95,
    dispatchDelayS: 1.5,
    responderCap: 3,
    reserveAllowed: true,
    challengeWindowS: 1,
  });
  assert.equal(patrolled.dispatchDelayS, 3.25);
  assert.equal(patrolled.responderCap, 2);
  assert.equal(patrolled.reserveAllowed, true);
  assert.equal(frontier.dispatchDelayS, 5.25);
  assert.equal(frontier.responderCap, 1);
  assert.equal(frontier.reserveAllowed, false,
    'weak/lawless jurisdictions cannot conjure reserve police');
});

test('nearby lawful responders are selected by distance then stable id', () => {
  const anchor = { x: 0, z: 0 };
  const closest = ship(2, 120, true);
  const candidates = [
    ship(8, 300, true),
    ship(3, 120, true),
    closest,
    closest,
    ship(4, 80, false),
    { ...ship(1, 40, true), alive: false },
  ];
  assert.deepEqual(
    rankLawfulResponders(candidates, anchor, { aggressorId: 99, cap: 2, radius: 500 }).map((e) => e.id),
    [2, 3],
  );
});

test('reserve arrival is deterministic and never pops adjacent to the aggressor', () => {
  const args = {
    anchor: { x: 0, z: 0 },
    aggressorPos: { x: 1300, z: 0 },
    jurisdictionRadius: 1400,
    seed: 47,
    incidentId: 'law:fixture',
  };
  const a = reserveArrivalPoint(args);
  const b = reserveArrivalPoint(args);
  assert.deepEqual(a, b);
  assert.ok(Math.hypot(a.x - args.anchor.x, a.z - args.anchor.z) >= 2000,
    'reserve enters beyond the jurisdiction ring instead of teleporting onto the fight');
  assert.ok(Math.hypot(a.x - args.aggressorPos.x, a.z - args.aggressorPos.z) >= 900,
    'reserve arrival keeps a visible intercept leg to the aggressor');
});

function ship(id, x, lawful) {
  return {
    id,
    type: 'ship',
    alive: true,
    pos: { x, z: 0 },
    data: { ai: { lawful } },
  };
}
