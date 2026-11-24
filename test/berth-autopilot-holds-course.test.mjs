// DEMO-BERTH-1: pressing E for the berth must fly the ship to the station, never away from it.
//
// The defect this pins: the flight computer summed every nearby body's avoidance strength with a
// linear falloff and a 1.65 gain, so a hull parked a few wu off the aim line contributed ~0.7 to
// the steer vector — more than the aim itself. From the after-throw seat (320 wu out, carrying
// the throw's momentum) the run bent ~80 degrees off the corridor mouth, lapped the station, and
// on a 1480 wu start was flung to 2.5 km before it turned back. These checks hold the two rules
// that keep a berth run honest:
//   1. a body beside the course bends the heading proportionately, and the bend is bounded;
//   2. a body lying across the course is always dodged (its sidestep is never silently skipped).
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeAutopilotGuidance } from '../src/systems/flightV3.js';
import { COLLISION_PROXY_MANIFESTS, resolveCorridorAxisWorld } from '../src/data/collisionProxyManifests.js';

const HELIOS = COLLISION_PROXY_MANIFESTS.helios_trade_hub;
const AXIS = resolveCorridorAxisWorld(
  { rot: 0, data: { dockRadius: 90, corridorBearingDeg: 135 } }, HELIOS,
);
const DEG = 180 / Math.PI;

/** A ship at `pos` (world) with an aim `distance` away along +x, and the bodies given. */
function scene({ pos = { x: 0, z: 0 }, aimDistance = 400, bodies = [], speed = 0 }) {
  const player = {
    id: 'player', type: 'ship', alive: true, radius: 14, pos: { ...pos },
    vel: { x: speed, z: 0 },
  };
  const list = [player, ...bodies];
  const state = {
    playerId: player.id,
    entities: new Map(list.map((e) => [e.id, e])),
    entityList: list,
  };
  // Aim straight down +x, a berth-bearing station target so the docking context is real.
  const target = {
    x: player.pos.x + aimDistance, z: player.pos.z, radius: 0,
    dockingProxyId: HELIOS.id, dockingStage: 'corridor-mouth', corridorInLane: false,
  };
  return { state, player, target, distance: aimDistance };
}

function body(id, dx, dz, radius = 10) {
  return { id, type: 'ship', alive: true, collides: true, radius, pos: { x: dx, z: dz }, vel: { x: 0, z: 0 } };
}

/** Heading change the guidance asks for, in degrees, away from the straight aim. */
function deflection(scene) {
  const g = computeAutopilotGuidance(scene.state, scene.player, scene.target, scene.distance, 20, {});
  return Math.atan2(g.z, g.x) * DEG;
}

test('a body near the aim line but far ahead bends the berth course only slightly', () => {
  // This is the exact shape that broke the run: a hull a few wu off the line, well ahead. It is
  // a real obstacle, so a small sidestep is right; the old strength ramp gave it ~0.5 of the
  // steer budget, and with the linear falloff a couple of these bent the run 80 degrees off the
  // mouth. Proportionate means degrees here, not tens of degrees.
  const far = scene({ bodies: [body('traffic', 170, 5)] });
  const angle = Math.abs(deflection(far));
  assert.ok(angle > 0.5, `a body on the line must still be cleared, got ${angle.toFixed(1)}°`);
  assert.ok(angle < 15,
    `a body 170 wu ahead must bend the course by degrees, not tens of degrees, got ${angle.toFixed(1)}°`);
});

test('a body lying on the aim line is always dodged, and the dodge is bounded', () => {
  // 120 wu dead ahead, inside the computer's lookahead at rest. A body on the exact line is the
  // one case that must never be skipped: a few wu of float noise on its lateral offset used to
  // decide the dodge side, and "noise says the far side" meant no sidestep at all.
  const ahead = scene({ bodies: [body('blocker', 120, 0)] });
  const g = computeAutopilotGuidance(ahead.state, ahead.player, ahead.target, ahead.distance, 20, {});
  assert.equal(g.avoiding, true, 'a body dead ahead is the one case that must never be skipped');
  const angle = Math.abs(Math.atan2(g.z, g.x) * DEG);
  assert.ok(angle > 1, `it must steer aside, got ${angle.toFixed(2)}°`);
  assert.ok(angle <= 45.0001, `the sidestep is a sidestep, never a new course, got ${angle.toFixed(2)}°`);
});

test('the sidestep is sized to the body, not a fixed hard turn', () => {
  // Same body, moved from far ahead to close: the closer it is, the sharper the angle a hull needs
  // to clear it in the distance left. A constant angle would ignore the difference.
  //
  // The far body must sit INSIDE the computer's lookahead. The first version of this check put it
  // at 350 wu, which is beyond the rest lookahead of 180 — it measured 0° against 0°+1 and passed
  // for the wrong reason (review of DEMO-BERTH-1). 150 wu is unmistakably in the cone at rest.
  const far = scene({ bodies: [body('blocker', 150, 26)] });
  const near = scene({ bodies: [body('blocker', 60, 26)] });
  const farAngle = Math.abs(deflection(far));
  const nearAngle = Math.abs(deflection(near));
  assert.ok(farAngle > 0.5, `the far body must be seen at all, got ${farAngle.toFixed(2)}°`);
  assert.ok(nearAngle > farAngle + 1,
    `a close blocker must demand a sharper sidestep than a distant one: near ${nearAngle.toFixed(1)}° vs far ${farAngle.toFixed(1)}°`);
});

test('the station itself, seen 200 wu out down the mouth bearing, is a proportionate sidestep', () => {
  // The reviewer's missing case: a run that starts far enough out that the corridor mouth is
  // beyond the near lookahead, so the STATION becomes the body in the road. Under the old
  // unbounded linear sum this alone saturated the steer and bent the run off the mouth. It must
  // now read as an ordinary obstacle: a real sidestep, inside the quarter-turn bound, that still
  // closes on the aim.
  const helios = {
    id: 'helios', type: 'station', alive: true, radius: 42, collides: true,
    pos: { x: 200, z: 0 }, vel: { x: 0, z: 0 },
    data: { stationId: 'station_helios', dockRadius: 90, corridorBearingDeg: 180 },
  };
  const near = scene({ bodies: [helios] });
  const g = computeAutopilotGuidance(near.state, near.player, near.target, near.distance, 20, {});
  const angle = Math.abs(Math.atan2(g.z, g.x) * DEG);
  assert.ok(angle <= 45.0001, `a station ahead stays inside the quarter-turn bound, got ${angle.toFixed(1)}°`);
  assert.ok(g.x > 0.6, `the course still closes on the aim, got x=${g.x.toFixed(2)}`);
  assert.equal(g.avoiding, true, 'a station in the road is still an obstacle to clear');
});

test('one hull beside the course cannot rotate a berth run off its aim by a wide margin', () => {
  // The exact defect shape: a friendly hull 5 wu off the line, 120 wu out, at cruise. The course
  // must stay recognisably the aim, so the run still converges on the berth instead of lapping.
  const crowded = scene({ speed: 110, bodies: [body('friendly', 120, 5, 18), body('drift', 240, 60, 10)] });
  const angle = Math.abs(deflection(crowded));
  assert.ok(angle <= 45.0001, `steering stayed inside the quarter-turn bound, got ${angle.toFixed(1)}°`);
  const g = computeAutopilotGuidance(crowded.state, crowded.player, crowded.target, crowded.distance, 20, {});
  // Whatever the sidestep, the resulting vector must still point forward along the aim.
  assert.ok(g.x > 0.7, `the course still closes on the aim, got x=${g.x.toFixed(2)}`);
});

test('a body already astern and clear of the hull does not bend the course', () => {
  const behind = scene({ bodies: [body('passed', -120, 30, 12)] });
  assert.ok(Math.abs(deflection(behind)) < 0.001, 'a passed body cannot bend a forward course');
});

test('an empty course keeps the exact aim', () => {
  const clear = scene({ speed: 140 });
  const g = computeAutopilotGuidance(clear.state, clear.player, clear.target, clear.distance, 20, {});
  assert.equal(g.avoiding, false);
  assert.deepEqual({ x: Math.round(g.x * 1e6) / 1e6, z: Math.round(g.z * 1e6) / 1e6 }, { x: 1, z: 0 });
});
