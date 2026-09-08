// Behavioral replacement for the former private fillet/planned-stop tests.
// Owner ruling 2026-09-08: speed is invariant; ink may be rounded, never crawled or parked on.
// This file tests the pure control loop. arcade-draw-realpath uses actual Rapier authority.
import test from 'node:test';
import assert from 'node:assert/strict';
import { followDrawFlightPath } from '../src/combat/drawFlightPath.js';
import { DRAW_FLIGHT, drawFlightAcceleration, drawWrapAngle } from '../src/core/flight/drawFlightControl.js';

const DT = 1 / 60;
const profile = { combatSpeed: 152, mainAccel: 180, maxYawRate: 4.5 };
function run(points, { duration = 14, offset = 0, stopAtExit = true, dt = DT } = {}) {
  const p = { pos: { x: 0, z: offset }, vel: { x: profile.combatSpeed, z: 0 }, rot: 0 };
  const route = { active: true, points, pointIndex: 1 }, runtime = {}, trace = [];
  for (let t = 0; t < duration; t += dt) {
    const command = followDrawFlightPath(route, p, runtime, profile, dt);
    if (!command) break;
    const a = drawFlightAcceleration(p, command, profile, dt);
    p.vel.x += a.x * dt; p.vel.z += a.z * dt;
    p.pos.x += p.vel.x * dt; p.pos.z += p.vel.z * dt;
    p.rot = Math.atan2(p.vel.z, p.vel.x);
    trace.push({ t, x: p.pos.x, z: p.pos.z, speed: Math.hypot(p.vel.x, p.vel.z),
      heading: p.rot, progress: runtime.path.progressS, exhausted: command.exhausted });
    if (stopAtExit && command.exhausted) break;
  }
  return { p, route, runtime, trace };
}
const straight = () => [{ x: 0, z: 0 }, { x: 600, z: 0 }];
const sine = () => Array.from({ length: 121 }, (_, i) => ({ x: i * 6, z: 50 * Math.sin(i / 120 * Math.PI * 2) }));
const jagged = () => Array.from({ length: 121 }, (_, i) => ({ x: i * 6, z: (i % 2 ? 1 : -1) * 0.8 }));
function hook(radius = 70) {
  const p = [{ x: 0, z: 0 }, { x: 220, z: 0 }];
  for (let i = 1; i <= 50; i++) { const a = i / 50 * Math.PI;
    p.push({ x: 220 + radius * Math.sin(a), z: radius * (1 - Math.cos(a)) }); }
  p.push({ x: -180, z: 2 * radius });
  return p;
}
function loop() {
  const p = [{ x: 0, z: 0 }, { x: 180, z: 0 }];
  for (let i = 1; i <= 100; i++) { const a = i / 100 * Math.PI * 2;
    p.push({ x: 180 + 90 * Math.sin(a), z: 90 * (1 - Math.cos(a)) }); }
  p.push({ x: 460, z: 0 }); return p;
}
function distance(points, p) {
  let d = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], x = b.x - a.x, z = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x*x+z*z || 1)));
    d = Math.min(d, Math.hypot(p.x - a.x - t*x, p.z - a.z - t*z));
  } return d;
}

for (const [name, shape] of Object.entries({ straight, S: sine, jitter: jagged, hook, loop,
  corner: () => [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 360 }],
  short: () => [{ x: 0, z: 0 }, { x: 2, z: 0 }],
  reverse: () => [{ x: 0, z: 0 }, { x: -260, z: 0 }],
  tightHook: () => hook(22) })) {
  test(`${name}: finite-rate full-speed steering completes, not a zero-speed tracking pass`, () => {
    const points = shape(), r = run(points);
    assert.ok(r.trace.length > 0);
    assert.equal(r.trace.at(-1).exhausted, true, `${name}: must complete the maneuver`);
    assert.ok(r.trace.every(p => Math.abs(p.speed / profile.combatSpeed - 1) < 0.001), 'no corner speed governor');
    for (let i = 1; i < r.trace.length; i++) {
      assert.ok(r.trace[i].progress >= r.trace[i - 1].progress, 'ordered progress');
      assert.ok(Math.abs(drawWrapAngle(r.trace[i].heading - r.trace[i - 1].heading)) <= profile.maxYawRate * DT + 1e-8,
        'no heading teleport');
    }
    if (!['reverse', 'tightHook'].includes(name)) {
      assert.ok(Math.max(...r.trace.map(p => distance(points, p))) < 0.8 * profile.combatSpeed / profile.maxYawRate,
        'feasible curves stay within a turning-radius-scale corridor');
    }
    if (name === 'loop') assert.ok(Math.max(...r.trace.map(p => p.z)) > 150, 'must visit the far lobe, not snap to exit');
  });
}

test('straight offset recapture converges without repeatedly sawing across the ink', () => {
  const r = run([{ x: 0, z: 0 }, { x: 1600, z: 0 }], { offset: 35 });
  const signs = r.trace.filter(p => Math.abs(p.z) > 1).map(p => Math.sign(p.z));
  const crossings = signs.slice(1).filter((s, i) => s !== signs[i]).length;
  assert.ok(crossings <= 1, `uncommanded crossings ${crossings}`);
  assert.ok(Math.abs(r.trace.find(p => p.t >= 2).z) < 2, 'settles onto a feasible straight');
});

test('finger lift continues along exit tangent at cruise for five seconds', () => {
  const r = run([{ x: 0, z: 0 }, { x: 5, z: 0 }], { duration: 5, stopAtExit: false });
  assert.ok(r.p.pos.x >= 5 * profile.combatSpeed - 1);
  assert.equal(r.route.pointIndex, r.route.points.length, 'consumed ink is not drawn behind the ship');
});

test('irregular point density does not change a straight or its speed', () => {
  const a = run(straight()), b = run([0, 2, 4, 48, 50, 140, 300, 590, 600].map(x => ({ x, z: 0 })));
  assert.equal(a.trace.length, b.trace.length);
  for (let i = 0; i < a.trace.length; i++) {
    for (const key of ['x', 'z', 'speed', 'progress']) {
      assert.ok(Math.abs(a.trace[i][key] - b.trace[i][key]) < 1e-8, key);
    }
  }
});

test('same head/tail/count interior edits invalidate cached geometry', () => {
  const route = { active: true, points: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 200, z: 0 }] };
  const p = { pos: { x: 0, z: 0 }, vel: { x: 152, z: 0 }, rot: 0 }, runtime = {};
  followDrawFlightPath(route, p, runtime, profile, DT);
  const old = runtime.path;
  route.points[1].z = 100;
  followDrawFlightPath(route, p, runtime, profile, DT);
  assert.notEqual(runtime.path, old);
  assert.equal(runtime.path.nodes[1].z, 100);
});

test('replacement, truncation, pruning and append all use the current stroke', () => {
  const route = { active: true, points: straight() }, p = { pos: { x: 0, z: 0 }, vel: { x: 152, z: 0 } }, rt = {};
  followDrawFlightPath(route, p, rt, profile, DT);
  route.points = [{ x: 0, z: 0 }, { x: 0, z: 300 }];
  followDrawFlightPath(route, p, rt, profile, DT);
  assert.equal(rt.path.nodes.at(-1).x, 0);
  route.points.push({ x: 100, z: 300 });
  followDrawFlightPath(route, p, rt, profile, DT);
  assert.equal(rt.path.total, 400);
  route.points.splice(0, 1);
  followDrawFlightPath(route, p, rt, profile, DT);
  assert.equal(rt.path.total, 100);
  route.points.length = 1;
  assert.equal(followDrawFlightPath(route, p, rt, profile, DT), null);
});

for (const [name, points] of Object.entries({ empty: [], singleton: [{ x: 0, z: 0 }],
  duplicate: [{ x: 0, z: 0 }, { x: 0, z: 0 }], invalid: [null, { x: NaN, z: Infinity }],
  overflow: [{ x: -1e308, z: 0 }, { x: 1e308, z: 0 }],
  corruptLong: [{ x: 0, z: 0 }, { x: 1e90, z: 0 }] })) {
  test(`${name}: corrupt ink is bounded and produces no flight command`, () => {
    assert.equal(followDrawFlightPath({ active: true, points }, { pos: {}, vel: {} }, {}, profile, DT), null);
  });
}

test('huge point counts are bounded by a fixed per-route budget', () => {
  const rt = {};
  followDrawFlightPath({ active: true, points: Array.from({ length: 100000 }, (_, i) => ({ x: i, z: 0 })) },
    { pos: {}, vel: {} }, rt, profile, DT);
  assert.ok(rt.path.nodes.length <= DRAW_FLIGHT.maxPoints);
});

test('antipode noise cannot flip the chosen U-turn direction', () => {
  const body = { vel: { x: 152, z: 0 }, rot: 0 };
  for (const heading of [Math.PI - 0.01, -Math.PI + 0.01]) {
    const a = drawFlightAcceleration(body, { active: true, heading, turnSign: 1 }, profile, DT);
    assert.ok(a.z > 0);
    assert.ok(Math.abs(Math.hypot(body.vel.x + a.x*DT, a.z*DT) - 152) < 1e-9);
  }
});

test('zero timestep cannot mint an impulse; boost and external overspeed keep magnitude', () => {
  const body = { vel: { x: 200, z: 0 }, rot: 0 }, cmd = { active: true, heading: Math.PI/2 };
  assert.equal(drawFlightAcceleration(body, cmd, profile, 0).x, 0);
  assert.equal(drawFlightAcceleration(body, cmd, profile, DT).nextSpeed, 200);
  const boost = drawFlightAcceleration({ vel: { x: 152, z: 0 } }, cmd,
    { ...profile, boostSpeedMult: 2, boostAccelMult: 2 }, DT, true);
  assert.ok(boost.nextSpeed > 152);
});

test('30/60/120 Hz command integration retains speed and comparable turn completion', () => {
  const p = [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 360 }];
  const runs = [30, 60, 120].map(hz => run(p, { dt: 1/hz }));
  for (const r of runs) assert.equal(r.trace.at(-1).exhausted, true);
  assert.ok(Math.max(...runs.map(r => r.trace.at(-1).t)) - Math.min(...runs.map(r => r.trace.at(-1).t)) < 0.12);
});
