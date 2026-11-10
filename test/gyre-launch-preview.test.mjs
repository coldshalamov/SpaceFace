/**
 * Packet 05 — the short-horizon launch forecast. It is not a second physics world: it integrates the
 * SAME initial state (the coil spring + burstPlan from the ball's real position), the SAME field
 * kernel sample for this ball, and the ball's real collider radius, over a bounded horizon with
 * reused buffers. These tests hold it to the real rapier-dynamic execution:
 *
 *   • free flight: the forecast polyline lies on the ball's actual path
 *   • a target on the line: the forecast names it and the strike lands when the forecast says
 *   • a Pull well beside the path: the forecast bends the way the ball bends
 *   • bounded: candidate bodies are capped, the buffer is reused, the result is labelled conditional
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { powerHeld, powerPreviewPlan } from '../src/data/powerPreview.js';
import { predictTrajectory, createTrajectoryBuffer, TRAJECTORY_BUDGET } from '../src/matter/aggregateTrajectory.js';

async function boot(seed = 31) {
  const sim = createSimulation({ seed, bus: createBus(), systems: [fields, gyreSnare, physics] });
  const { state } = sim;
  state.mode = 'flight';
  state.input.actions = {};
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const physicsSys = sim.registry.get('physics');
  assert.equal(await physicsSys.prepareBackend(state), true);
  const player = sim.spawn({
    type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, collides: true,
    vel: { x: 0, z: 0 }, rot: 0, angVel: 0, hull: 200, hullMax: 200,
    flightModel: { inertia: 88 }, flags: {},
    physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    data: { combatProfileId: 'combat_profile_standard_ship' },
  });
  state.playerId = player.id;
  player.cap = 100;
  const thrown = [];
  sim.bus.on('gyre:thrown', () => thrown.push(state.tick));
  const rock = (x, z, mass = 12, radius = 6, type = 'asteroid') => sim.spawn({
    type, team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, radius, collides: true, hull: 40, hullMax: 40,
    physicsBody: { schemaVersion: 1, radius, mass, inertiaY: mass * radius, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    data: {},
  });
  return { sim, state, player, rock, thrown, sys: sim.registry.get('gyreSnare'),
    cleanup: () => physicsSys._disableSg02DynamicAuthority && physicsSys._disableSg02DynamicAuthority() };
}

function holdUntilHolding(t, ticks = 60) {
  for (let i = 0; i < ticks; i++) { t.state.input.actions.gyreSnare = true; t.sim.step(); }
  assert.equal(t.sys._rt.phase, 'holding');
}

test('the forecast only exists while the lash holds a clump with the key down', async () => {
  const t = await boot();
  try {
    t.rock(200, 0, 30, 8);
    assert.equal(powerHeld(t.state), null);
    t.state.input.actions.gyreSnare = true; t.sim.step();
    assert.equal(powerHeld(t.state), null, 'a searching beam throws nothing');
    holdUntilHolding(t);
    assert.equal(powerHeld(t.state), 'gyre');
    const plan = powerPreviewPlan(t.state);
    assert.equal(plan.power, 'gyre');
    assert.equal(plan.tint, 'white');
    assert.match(plan.note, /^Forecast/, 'the line is labelled conditional');
    assert.equal(plan.areas[0].kind, 'route');
    t.state.input.actions.gyreSnare = false; t.sim.step();
    assert.equal(powerHeld(t.state), null, 'released: the line is gone');
  } finally { t.cleanup(); }
});

test('free flight: the forecast lies on the ball\'s actual rapier path', async () => {
  const t = await boot();
  try {
    t.rock(200, 0, 30, 8); t.rock(215, 10, 20, 6);
    holdUntilHolding(t);
    const plan = powerPreviewPlan(t.state);
    const pts = plan.areas[0].points;
    const core = t.state.entities.get(t.sys._rt.coreId);
    t.state.input.actions.gyreSnare = false;
    const byTick = new Map();
    for (let i = 0; i < 120; i++) { t.sim.step(); byTick.set(t.state.tick, { x: core.pos.x, z: core.pos.z }); }
    assert.equal(t.thrown.length, 1);
    // pts[0..1] is the ball now; pts[2..3] where it is when the burst ends (the sim tick after the last burst tick), then one per 0.1 s.
    const burstEnd = t.thrown[0] + 4;
    let worst = 0;
    for (let k = 0; k < 9; k++) {
      const actual = byTick.get(burstEnd + 6 * k);
      const f = { x: pts[2 + k * 2], z: pts[3 + k * 2] };
      worst = Math.max(worst, Math.hypot(actual.x - f.x, actual.z - f.z));
    }
    assert.ok(worst < 2, `forecast within 2 wu of execution over the horizon (worst ${worst.toFixed(2)})`);
  } finally { t.cleanup(); }
});

test('a target on the line is named, and the strike lands when the forecast says', async () => {
  const t = await boot();
  try {
    t.rock(200, 0, 30, 8); t.rock(215, 10, 20, 6);
    const target = t.rock(900, 15, 80, 14);
    holdUntilHolding(t);
    const plan = powerPreviewPlan(t.state);
    assert.match(plan.note, /strike in \d\.\ds/);
    assert.equal(plan.moves.length, 1);
    assert.equal(plan.moves[0].id, target.id, 'the body the line will strike');
    const core = t.state.entities.get(t.sys._rt.coreId);
    t.state.input.actions.gyreSnare = false;
    const targetBefore = { x: target.vel.x, z: target.vel.z };
    const speeds = [];
    for (let i = 0; i < 160; i++) {
      t.sim.step();
      speeds.push({ tick: t.state.tick, vx: core.vel.x, targetVx: target.vel.x,
        separation: Math.hypot(core.pos.x - target.pos.x, core.pos.z - target.pos.z),
        relativeStep: Math.hypot(core.vel.x - target.vel.x, core.vel.z - target.vel.z) / 60 });
    }
    const burstEnd = t.thrown[0] + 4;
    const peak = speeds.find((s) => s.tick === burstEnd).vx;
    // A glancing hit need not remove an arbitrary percentage of forward speed. Observe
    // actual native momentum transfer to the target, with the ball's simultaneous response.
    const struck = speeds.find((s) => s.tick > burstEnd && s.targetVx > targetBefore.x + 5 && s.vx < peak);
    assert.ok(struck, 'the target receives real native momentum from the ball');
    assert.ok(struck.separation <= core.radius + target.radius + struck.relativeStep + 1e-3,
      'the response occurs within one native contact step, not at a distant body');
    const actualT = (struck.tick - burstEnd) / 60;
    const m = /strike in (\d\.\d)s/.exec(plan.note);
    assert.ok(Math.abs(actualT - Number(m[1])) < 0.2, `forecast ${m[1]}s vs actual ${actualT.toFixed(2)}s`);
    assert.ok(target.vel.x > 5, 'and the target was in fact driven forward');
  } finally { t.cleanup(); }
});

test('a Pull well beside the path bends the forecast the way it bends the ball', async () => {
  const prev = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const t = await boot(77);
  try {
    t.rock(200, 0, 30, 8); t.rock(215, 10, 20, 6);
    // A well off the line, 250 wu ahead and 90 wu to the side.
    t.state.input.aimWorld = { x: 400, z: 120 };
    t.state.input.actions.deployWell = true;
    t.sim.step();
    assert.equal(Object.keys(t.state.fields.deployed).length, 1);
    holdUntilHolding(t, 50);
    const plan = powerPreviewPlan(t.state);
    assert.equal(plan.power, 'gyre');
    const pts = plan.areas[0].points;
    const forecastEnd = { x: pts[pts.length - 2], z: pts[pts.length - 1] };
    assert.ok(Math.abs(forecastEnd.z) > 4, `the well bends the forecast sideways (z ${forecastEnd.z.toFixed(1)})`);
    const core = t.state.entities.get(t.sys._rt.coreId);
    t.state.input.actions.gyreSnare = false;
    const byTick = new Map();
    for (let i = 0; i < 150; i++) { t.sim.step(); byTick.set(t.state.tick, { x: core.pos.x, z: core.pos.z }); }
    const burstEnd = t.thrown[0] + 4;
    // Compare at 0.5 s into the free part of the flight, before the well expires.
    const k = 5;
    const actual = byTick.get(burstEnd + 6 * k);
    const f = { x: pts[2 + k * 2], z: pts[3 + k * 2] };
    assert.ok(Math.hypot(actual.x - f.x, actual.z - f.z) < 8,
      `bent forecast ${f.x.toFixed(0)},${f.z.toFixed(0)} vs actual ${actual.x.toFixed(0)},${actual.z.toFixed(0)}`);
  } finally { FIELD_FLAGS.enabled = prev; t.cleanup(); }
});

// ── the pure predictor ──────────────────────────────────────────────────────────────────────────

test('predictTrajectory: straight without a field, labelled conditional, and a moving body is swept', () => {
  const buf = createTrajectoryBuffer();
  predictTrajectory({ x: 0, z: 0, vx: 300, vz: 0, radius: 10 }, { horizonS: 1 }, buf);
  assert.equal(buf.valid, true);
  assert.equal(buf.conditional, true);
  assert.equal(buf.fieldAware, false);
  assert.ok(Math.abs(buf.points[(buf.count - 1) * 2] - 300) < 1e-6);
  assert.equal(buf.impact.hit, false);
  // A body drifting across the line: contact is found between fixed samples (no tunnelling).
  const bodies = [{ id: 'mover', x: 150, z: 60, vx: 0, vz: -150, radius: 8 }];
  predictTrajectory({ x: 0, z: 0, vx: 300, vz: 0, radius: 10 }, { horizonS: 1, bodies }, buf);
  assert.equal(buf.impact.hit, true);
  assert.equal(buf.impact.id, 'mover');
  // Contact when |rel| = 18: the mover is at z = 60 − 150t, the ball at x = 300t.
  const hitT = buf.impact.t;
  const bz = 60 - 150 * hitT, bx = 150, ax = 300 * hitT;
  assert.ok(Math.abs(Math.hypot(bx - ax, bz) - 18) < 0.5, 'contact at the sum of radii');
  assert.ok(buf.endT <= hitT + 1e-9, 'the forecast stops at the first contact');
  // Bounds hold: huge candidate lists are capped and the buffer is reused, not reallocated.
  const points = buf.points;
  const crowd = Array.from({ length: 500 }, (_, i) => ({ id: i, x: 1000 + i, z: 500, vx: 0, vz: 0, radius: 4 }));
  predictTrajectory({ x: 0, z: 0, vx: 300, vz: 0, radius: 10 }, { horizonS: 1, bodies: crowd }, buf);
  assert.equal(buf.bodiesSwept, TRAJECTORY_BUDGET.maxBodies);
  assert.equal(buf.points, points, 'caller-owned buffer is reused');
  assert.ok(buf.count <= buf.capacity);
  predictTrajectory({ x: NaN, z: 0, vx: 1, vz: 0, radius: 1 }, {}, buf);
  assert.equal(buf.valid, false, 'non-finite input is refused, not integrated');
});

test('predictTrajectory follows the sim\'s semi-implicit Euler under a field', () => {
  const buf = createTrajectoryBuffer();
  // Constant 100 wu/s² toward +z: v += a·dt then x += v·dt, 60 steps/s for 1 s.
  predictTrajectory({ x: 0, z: 0, vx: 200, vz: 0, radius: 5 },
    { horizonS: 1, fieldAccel: (x, z, vx, vz, t, out) => { out.ax = 0; out.az = 100; return out; } }, buf);
  const n = 60, dt = 1 / 60;
  let vz = 0, z = 0;
  for (let i = 0; i < n; i++) { vz += 100 * dt; z += vz * dt; }
  assert.ok(Math.abs(buf.points[(buf.count - 1) * 2 + 1] - z) < 1e-9);
  assert.equal(buf.fieldAware, true);
});
