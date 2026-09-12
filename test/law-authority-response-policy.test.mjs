import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RESERVE_STATION_LAUNCH_CLEARANCE_WU,
  RESERVE_STATION_LAUNCH_MIN_LEG_WU,
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

// PQ-138.00 "the witness has a choice", B10a: within 10 s of a witnessed kill one responder holds
// and one pursues, and the pursuit must be on camera. Reserves that only ever entered on a
// 2000 WU ring could never be. When the jurisdiction's station is a real body in reach, its reserve
// units launch from its dock ring on the side facing the incident.
test('reserve units launch from the jurisdiction station when it is in the world and in reach', () => {
  const station = { pos: { x: -300, z: 0 }, launchRadius: 72 };
  const args = {
    anchor: { x: 0, z: 0 },
    aggressorPos: { x: 400, z: 0 },
    jurisdictionRadius: 1400,
    seed: 47,
    incidentId: 'law:fixture',
    station,
  };
  const a = reserveArrivalPoint(args);
  assert.deepEqual(a, reserveArrivalPoint(args), 'station launch is seed-stable');
  const fromStation = Math.hypot(a.x - station.pos.x, a.z - station.pos.z);
  assert.ok(Math.abs(fromStation - (72 + RESERVE_STATION_LAUNCH_CLEARANCE_WU)) < 1e-6,
    `reserve launches from the dock ring (${fromStation}), not a 2000 WU ring`);
  assert.ok(Math.hypot(a.x - args.anchor.x, a.z - args.anchor.z) < 2000,
    'the pursuer starts inside camera reach of the incident, not ten screens out');
  assert.ok(Math.hypot(a.x - args.aggressorPos.x, a.z - args.aggressorPos.z) >= RESERVE_STATION_LAUNCH_MIN_LEG_WU,
    'a station launch still never pops onto the aggressor');
  assert.ok(a.x > station.pos.x, 'launch bearing faces the incident');

  // Aggressor sitting on the near side of the dock ring: launch from the far side instead.
  const close = reserveArrivalPoint({ ...args, aggressorPos: { x: -190, z: 0 } });
  assert.ok(Math.hypot(close.x - (-190), close.z) >= RESERVE_STATION_LAUNCH_MIN_LEG_WU,
    'far-side launch keeps the minimum leg when the aggressor crowds the near side');
  assert.ok(Math.abs(Math.hypot(close.x - station.pos.x, close.z - station.pos.z) - 112) < 1e-6);

  // A station out of reach of the incident keeps the ring.
  const farStation = reserveArrivalPoint({ ...args, station: { pos: { x: -5000, z: 0 }, launchRadius: 72 } });
  assert.ok(Math.hypot(farStation.x, farStation.z) >= 2000, 'an out-of-reach station does not launch reserves');
  assert.deepEqual(farStation, reserveArrivalPoint({ ...args, station: null }));
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
