// Phase 2b #9: a docking autopilot that starts behind the station rounds it instead of flying the
// straight line to the corridor mouth through the station (the station is excluded from its own
// autopilot obstacle list). Pure target resolution: resolveAutopilotTarget on a live-style station.
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveCollisionProxyManifest, resolveCorridorAxisWorld } from '../src/data/collisionProxyManifests.js';
import { resolveAutopilotTarget, DOCK_ORBIT_RADIUS_MULT, DOCK_ORBIT_STEP_DEG } from '../src/systems/flightV3.js';

function station() {
  return { id: 'st1', type: 'station', alive: true, pos: { x: 0, z: 0 }, rot: 0, radius: 34,
    data: { stationId: 'station_lab', dockRadius: 72, collisionProxy: 'station_ring_hub', corridorBearingDeg: 0 } };
}
function hull(pos) {
  return { id: 'player', type: 'ship', alive: true, radius: 12, pos: { ...pos }, vel: { x: 0, z: 0 }, physicsBody: { mass: 10 }, data: { defId: 'ship_kestrel' } };
}
function at(st, axis, deg, dist) {
  const a = Math.atan2(axis.z, axis.x) + deg * Math.PI / 180;
  return { x: st.pos.x + Math.cos(a) * dist, z: st.pos.z + Math.sin(a) * dist };
}
function resolve(st, player) {
  return resolveAutopilotTarget({ playerId: player.id, entities: new Map([[player.id, player], [st.id, st]]) }, { targetEntityId: st.id });
}
/** Distance from the station centre to the segment player -> aim. */
function segDist(st, p, q) {
  const dx = q.x - p.x, dz = q.z - p.z; const L2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((st.pos.x - p.x) * dx + (st.pos.z - p.z) * dz) / L2));
  return Math.hypot(p.x + dx * t - st.pos.x, p.z + dz * t - st.pos.z);
}

const st = station();
const manifest = resolveCollisionProxyManifest(st);
const axis = resolveCorridorAxisWorld(st, manifest);
const mouthR = manifest.docking.corridor.mouthRadius * 72;

test('from directly behind, the aim is a flank waypoint whose leg clears the station', () => {
  const player = hull(at(st, axis, 180, 1500));
  const t = resolve(st, player);
  assert.equal(t.dockingStage, 'corridor-mouth');
  const d = segDist(st, player.pos, t);
  assert.ok(d > mouthR * 0.9, `leg clears the ring: ${d.toFixed(1)} > ${(mouthR * 0.9).toFixed(1)}`);
  // and it is NOT the mouth (master aimed the mouth straight through the station: segDist ~0)
  assert.ok(Math.hypot(t.x - t.approachPoint.x, t.z - t.approachPoint.z) > 10);
  assert.ok(segDist(st, player.pos, t.approachPoint) < 20, 'the straight mouth leg would cross the station');
});

test('the waypoint sits on the orbit circle, one step toward the axis', () => {
  const player = hull(at(st, axis, 150, 900));
  const t = resolve(st, player);
  const r = Math.hypot(t.x - st.pos.x, t.z - st.pos.z);
  assert.ok(Math.abs(r - mouthR * DOCK_ORBIT_RADIUS_MULT) < 1e-6);
  const ang = (Math.atan2(t.z, t.x) - Math.atan2(axis.z, axis.x)) * 180 / Math.PI;
  const wrapped = ((ang + 540) % 360) - 180;
  assert.ok(Math.abs(Math.abs(wrapped) - (150 - DOCK_ORBIT_STEP_DEG)) < 1e-6, `waypoint at ${wrapped.toFixed(2)}°`);
});

test('approaches within the step of the axis keep the authored mouth aim exactly', () => {
  for (const deg of [0, 30, -45, 60]) {
    const player = hull(at(st, axis, deg, 1200));
    const t = resolve(st, player);
    if (t.dockingStage !== 'corridor-mouth') continue;
    assert.equal(t.x, t.approachPoint.x, `${deg}°`);
    assert.equal(t.z, t.approachPoint.z, `${deg}°`);
  }
});

test('a hull already inside the orbit circle keeps the mouth aim (the exit path)', () => {
  const player = hull(at(st, axis, 170, mouthR * 0.6));
  const t = resolve(st, player);
  assert.equal(t.x, t.approachPoint.x);
  assert.equal(t.z, t.approachPoint.z);
});
