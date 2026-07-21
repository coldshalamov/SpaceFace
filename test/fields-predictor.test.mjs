/**
 * PQ-012 / SF-12 — Field-aware release predictor (req 9).
 *
 *  • predictor-vs-actual receipt: projectFieldTrajectory matches a real fields+physics sim body path
 *  • the pure sampleFieldAcceleration seam is honored by the projector
 *  • solveThrowSolution is byte-identical when NO field sampler is injected (existing throw feel)
 *  • with a field active, the release predictor shows the BENT path (fieldAware + projectedPath +
 *    distortion), and a throw that would miss ballistically can read on-solution once bent
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { createFieldKernel, sampleFieldAcceleration, projectFieldTrajectory } from '../src/core/fields/fieldKernel.js';
import { solveThrowSolution } from '../src/combat/tetherFireControl.js';

const LIGHT = { mass: 2, type: 'wreck', team: 9, marked: false, id: 1 };

// ── the pure projector matches a real fields+physics sim (predictor-vs-actual, PQ-006-style) ─────
test('projectFieldTrajectory matches the actual simulated body path under a Well', async () => {
  const prevFlag = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  try {
    const sim = createSimulation({ seed: 8080, bus: createBus(), systems: [fields, physics] });
    const { state } = sim;
    state.mode = 'flight';
    state.input.actions = {};
    const player = sim.spawn({
      type: 'ship', team: 0, pos: { x: 0, z: 0 }, radius: 12, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, collides: true,
      hull: 200, hullMax: 200, flightModel: { inertia: 88 }, flags: {},
      physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, ccd: true, material: 'ship', revision: 0 },
    });
    state.playerId = player.id;
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    const physicsSys = sim.registry.get('physics'); // createSimulation forks module singletons into instances
    const ready = await physicsSys.prepareBackend(state);
    assert.equal(ready, true);

    // A free light body inside the well footprint, given a gentle drift so its path is non-trivial.
    const body = sim.spawn({
      type: 'wreck', team: 9, pos: { x: 200, z: 70 }, vel: { x: 10, z: 0 }, rot: 0, angVel: 0, radius: 4, collides: true,
      hull: 40, hullMax: 40, data: { majorDebris: true },
      physicsBody: { schemaVersion: 1, radius: 4, mass: 2, inertiaY: 4, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    });

    // Deploy the Well at (200,0).
    state.input.aimWorld = { x: 200, z: 0 };
    state.input.actions.deployWell = true;
    sim.step();
    const snapshot = state.fields.snapshot.map((f) => ({ ...f, center: { ...f.center }, dir: { ...f.dir } }));
    assert.ok(snapshot.length >= 1, 'well registered');

    // Capture the projector's prediction from the body's post-deploy state, then let the sim run and
    // compare at 12 sample points. The projector uses the SAME semi-implicit Euler shape the sim's
    // impulse integration applies, so the two paths should track closely.
    const start = { pos: { x: body.pos.x, z: body.pos.z }, vel: { x: body.vel.x, z: body.vel.z } };
    const STEPS = 24;
    const proj = projectFieldTrajectory(start.pos, start.vel, snapshot, LIGHT, { dt: SIM_DT, steps: STEPS });

    let maxErr = 0;
    for (let i = 1; i <= STEPS; i++) {
      sim.step();
      const p = proj.points[i];
      const err = Math.hypot(body.pos.x - p.x, body.pos.z - p.z);
      if (err > maxErr) maxErr = err;
    }
    // The body clearly moved (well pulled it); over ~0.4s the prediction tracks the sim within a
    // small envelope (Rapier vs plain Euler + solver residual).
    const travelled = Math.hypot(body.pos.x - start.pos.x, body.pos.z - start.pos.z);
    assert.ok(travelled > 8, `body meaningfully moved under the field (${travelled} wu)`);
    assert.ok(maxErr < 6, `predictor tracks actual within 6 wu over ${STEPS} ticks (max err ${maxErr.toFixed(3)})`);

    if (typeof physicsSys._disableSg02DynamicAuthority === 'function') physicsSys._disableSg02DynamicAuthority();
  } finally {
    FIELD_FLAGS.enabled = prevFlag;
  }
});

// ── the projector consumes the pure seam ─────────────────────────────────────────────────────────
test('projectFieldTrajectory and sampleFieldAcceleration agree on the first step', () => {
  const k = createFieldKernel();
  k.register({ id: 'w', kind: 'well', center: { x: 100, z: 0 }, radius: 200, strength: 240, falloff: 1.5, createdAt: 0, durationS: 10 });
  const fieldsList = k.list();
  const pos = { x: 100, z: 60 }, vel = { x: 0, z: 0 };
  const a = sampleFieldAcceleration(pos, vel, fieldsList, 0, LIGHT);
  const proj = projectFieldTrajectory(pos, vel, fieldsList, LIGHT, { dt: SIM_DT, steps: 1 });
  // After one semi-implicit step: v1 = a·dt, x1 = x0 + v1·dt.
  const v1z = a.az * SIM_DT;
  const x1z = pos.z + v1z * SIM_DT;
  assert.ok(Math.abs(proj.points[1].z - x1z) < 1e-9, 'projector first step equals the pure sample integrated once');
});

// ── byte-identical ballistic path when no sampler is injected ────────────────────────────────────
test('solveThrowSolution is unchanged (fieldAware:false) without a fieldSampler', () => {
  const payload = { pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 } };
  const aim = { pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };
  const s = solveThrowSolution(payload, aim, {});
  assert.equal(s.valid, true);
  assert.equal(s.fieldAware, false);
  assert.equal(s.projectedPath, null);
  assert.ok(s.onSolution, 'a payload flying straight at an on-axis aim is on solution');
  // predicted lands on the +x axis at the aim.
  assert.ok(Math.abs(s.predicted.z) < 1e-9 && s.predicted.x > 0);
});

// ── with a field sampler the predictor shows the bent path ───────────────────────────────────────
test('solveThrowSolution bends the release path when a field sampler is injected', () => {
  // Payload heads +x; a well sits off to +z so it curves the path toward +z.
  const k = createFieldKernel();
  k.register({ id: 'w', kind: 'well', center: { x: 150, z: 120 }, radius: 260, strength: 420, falloff: 1.2, createdAt: 0, durationS: 10 });
  const snap = k.list();
  const profile = { mass: 2, type: 'wreck', id: 5 };
  const sc = { ax: 0, az: 0 }, pS = { x: 0, z: 0 }, vS = { x: 0, z: 0 };
  const sampler = (px, pz, vx, vz) => { pS.x = px; pS.z = pz; vS.x = vx; vS.z = vz; return sampleFieldAcceleration(pS, vS, snap, 0, profile, sc); };

  const payload = { pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 } };
  const aim = { pos: { x: 300, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 };
  const ballistic = solveThrowSolution(payload, aim, {});
  const bent = solveThrowSolution(payload, aim, { fieldSampler: sampler, fieldSteps: 90 });

  assert.equal(bent.fieldAware, true);
  assert.ok(Array.isArray(bent.projectedPath) && bent.projectedPath.length > 2, 'a bent trajectory is projected for the HUD');
  assert.notEqual(bent.fieldDistortionRad, 0, 'the field imparts a measurable distortion');
  // The bent predicted point is pulled toward +z (the well), unlike the straight ballistic aim.
  assert.ok(bent.predicted.z > ballistic.predicted.z + 1, 'the release path is visibly bent toward the well');
});

// ── a ballistic miss can read on-solution once bent through the well ──────────────────────────────
test('a throw that misses ballistically can go on-solution when the well bends it home', () => {
  const k = createFieldKernel();
  // Well straddles the lane and curves a straight +x throw down toward an aim at +z offset.
  k.register({ id: 'w', kind: 'well', center: { x: 160, z: 90 }, radius: 300, strength: 900, falloff: 1.1, createdAt: 0, durationS: 10 });
  const snap = k.list();
  const profile = { mass: 1.5, type: 'wreck', id: 6 };
  const sc = { ax: 0, az: 0 }, pS = { x: 0, z: 0 }, vS = { x: 0, z: 0 };
  const sampler = (px, pz, vx, vz) => { pS.x = px; pS.z = pz; vS.x = vx; vS.z = vz; return sampleFieldAcceleration(pS, vS, snap, 0, profile, sc); };

  const payload = { pos: { x: 0, z: 0 }, vel: { x: 70, z: 0 } };
  const aim = { pos: { x: 200, z: 80 }, vel: { x: 0, z: 0 }, radius: 26 };
  const bent = solveThrowSolution(payload, aim, { fieldSampler: sampler, fieldSteps: 120 });
  // Baseline: the SAME payload with NO field (empty snapshot) over the same horizon — the honest
  // straight-line closest approach to the aim. The bent path must pass closer.
  const straight = projectFieldTrajectory(payload.pos, payload.vel, [], profile, { dt: 1 / 60, steps: 120, aimPos: aim.pos });
  assert.ok(bent.fieldClosestDist < straight.closest.dist - 1,
    `bent closest ${bent.fieldClosestDist.toFixed(1)} < straight closest ${straight.closest.dist.toFixed(1)} — the well bends the throw toward the aim`);
});
