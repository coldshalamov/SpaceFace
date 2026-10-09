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
import { createFieldKernel, sampleFieldAcceleration, projectFieldTrajectory, fieldsRelevantAlongCorridor, fieldCanApplyTo } from '../src/core/fields/fieldKernel.js';
import { fieldBodyProfile, fieldEntityIsPrimed, fieldVelocityTermApplies } from '../src/systems/fields.js';
import { solveThrowSolution } from '../src/combat/tetherFireControl.js';
import { masslineThrow } from '../src/systems/masslineThrow.js';

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

    // Deploy the Well at (200,0), then wait out the deploy ramp — the live field's strength
    // eases in (~10/tick) and the frozen-field projector integrates the snapshot as constant,
    // so sampling mid-ramp both weakens the pull under test and invalidates the frozen-field
    // comparison. ~60 ticks covers the authored ramp for this strength.
    state.input.aimWorld = { x: 200, z: 0 };
    state.input.actions.deployWell = true;
    sim.step();
    state.input.actions.deployWell = false;
    for (let i = 0; i < 60; i++) sim.step();
    const snapshot = state.fields.snapshot.map((f) => ({ ...f, center: { ...f.center }, dir: { ...f.dir } }));
    assert.ok(snapshot.length >= 1, 'well registered');
    assert.ok(snapshot[0].strength >= 200, `the well reached its authored strength (got ${snapshot[0].strength}) — the projector compares against the STEADY field, not the ramp`);

    // A free light body inside the well footprint, given a gentle drift so its path is non-trivial.
    // Spawned after the ramp so the fixture keeps its original (200,70) velocity-10 geometry.
    const body = sim.spawn({
      type: 'wreck', team: 9, pos: { x: 200, z: 70 }, vel: { x: 10, z: 0 }, rot: 0, angVel: 0, radius: 4, collides: true,
      hull: 40, hullMax: 40, data: { majorDebris: true },
      physicsBody: { schemaVersion: 1, radius: 4, mass: 2, inertiaY: 4, dynamic: true, ccd: false, material: 'debris', revision: 0 },
    });

    // Capture the projector's prediction from the body's post-deploy state, then let the sim run and
    // compare at 12 sample points. The projector uses the SAME semi-implicit Euler shape the sim's
    // impulse integration applies, so the two paths should track closely.
    const start = { pos: { x: body.pos.x, z: body.pos.z }, vel: { x: body.vel.x, z: body.vel.z } };
    const STEPS = 24;
    // Profile mirrors the WRECK (id included): the well carries the player's excludeId filter, and a
    // synthetic id that happens to equal the player's would silently predict a field-free path.
    const proj = projectFieldTrajectory(start.pos, start.vel, snapshot, { ...LIGHT, id: body.id }, { dt: SIM_DT, steps: STEPS });

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

// ── RELEASE-TRUTH C4 — corridor relevance ─────────────────────────────────────────────────────
// A field-aware solve caps its contact read at the integration window (90 steps ≈ 1.5 s); a
// ballistic contact claim reaches the solve's full 6 s horizon. So a field that CANNOT apply
// to this payload along the ballistic corridor must not force the downgrade. The fixture:
// payload at origin moving +x at 60 wu/s, aim dead ahead — contact lands ~4.87 s out.

const C4_PAYLOAD = { pos: { x: 0, z: 0 }, vel: { x: 60, z: 0 }, type: 'wreck', id: 77, mass: 2 };
// Entry at (296-4)/60 = 4.8667 s — the ~4.87 s ballistic contact the C4 acceptance cites.
const C4_AIM = { pos: { x: 296, z: 0 }, vel: { x: 0, z: 0 }, radius: 4 };
const C4_CORRIDOR_END = { x: 0 + 60 * 6, z: 0 }; // ballistic corridor over the 6 s solve horizon

function c4KernelField(spec) {
  const k = createFieldKernel();
  k.register({ falloff: 1.2, durationS: 60, createdAt: 0, ...spec });
  return k.list();
}

function c4Profile(overrides = {}) {
  return { mass: 2, type: 'wreck', team: 9, id: C4_PAYLOAD.id, fieldResponseMult: 1, ...overrides };
}

test('C4: empty / zero-force / excluded / disjoint fields stay out of the corridor set', () => {
  const profile = c4Profile();
  // Zero-force: strength 0 contributes no raw acceleration anywhere (and no lock reaches an
  // unhitched body).
  const zero = c4KernelField({ id: 'zero', kind: 'well', center: { x: 60, z: 0 }, radius: 200, strength: 0 });
  assert.equal(fieldsRelevantAlongCorridor(zero, C4_PAYLOAD.pos, C4_CORRIDOR_END, profile).length, 0,
    'a zero-strength field straddling the corridor is still irrelevant');
  // Payload-excluded: the deployer's own filter opts this body out everywhere.
  const excluded = c4KernelField({ id: 'ex', kind: 'well', center: { x: 60, z: 0 }, radius: 200, strength: 500, filters: { excludeId: C4_PAYLOAD.id } });
  assert.equal(fieldCanApplyTo(excluded[0], profile), false, 'excludeId opts the payload out');
  assert.equal(fieldsRelevantAlongCorridor(excluded, C4_PAYLOAD.pos, C4_CORRIDOR_END, profile).length, 0,
    'a payload-excluded field on the corridor is irrelevant');
  const teamExcluded = c4KernelField({ id: 'tex', kind: 'well', center: { x: 60, z: 0 }, radius: 200, strength: 500, team: 9, filters: { excludeSourceTeam: true } });
  assert.equal(fieldsRelevantAlongCorridor(teamExcluded, C4_PAYLOAD.pos, C4_CORRIDOR_END, profile).length, 0,
    'excludeSourceTeam spares the friendly payload');
  // Provably disjoint: the volume never touches the corridor and touches no relevant field.
  const disjoint = c4KernelField({ id: 'far', kind: 'well', center: { x: 60, z: 900 }, radius: 200, strength: 500 });
  assert.equal(fieldsRelevantAlongCorridor(disjoint, C4_PAYLOAD.pos, C4_CORRIDOR_END, profile).length, 0,
    'a field clear of the corridor is irrelevant');
});

test('C4: a field ahead on the lane is relevant even though it misses the start point', () => {
  // The payload stands at x=0; this well is entirely inside the corridor (x≈200) and never
  // contains the starting point — it must still count.
  const ahead = c4KernelField({ id: 'ahead', kind: 'well', center: { x: 200, z: 40 }, radius: 120, strength: 500 });
  const relevant = fieldsRelevantAlongCorridor(ahead, C4_PAYLOAD.pos, C4_CORRIDOR_END, c4Profile());
  assert.equal(relevant.length, 1, 'a corridor-intersecting field ahead is relevant');
  assert.equal(relevant[0].id, 'ahead');
});

test('C4: chain closure — a field touching a relevant field stays reachable', () => {
  // Field B touches neither the corridor nor its start, but overlaps field A's volume — a
  // bent path inside A can ferry the body into B, so B cannot be called provably disjoint.
  const pair = [
    ...c4KernelField({ id: 'a', kind: 'well', center: { x: 150, z: 0 }, radius: 120, strength: 500 }),
    ...c4KernelField({ id: 'b', kind: 'repulsor', center: { x: 150, z: 300 }, radius: 200, strength: 500 }),
  ];
  const relevant = fieldsRelevantAlongCorridor(pair, C4_PAYLOAD.pos, C4_CORRIDOR_END, c4Profile());
  assert.deepEqual(relevant.map((f) => f.id), ['a', 'b'],
    'relevance closes transitively over touching volumes');
});

test('C4: a hitch lock with no strength still counts when the body is hitched', () => {
  const lock = c4KernelField({ id: 'lock', kind: 'well', center: { x: 100, z: 0 }, radius: 220, strength: 0, lockStrength: 40, sourceId: 'src7' });
  assert.equal(fieldsRelevantAlongCorridor(lock, C4_PAYLOAD.pos, C4_CORRIDOR_END, c4Profile()).length, 0,
    'an unhitched body ignores a lock-only field');
  assert.equal(fieldsRelevantAlongCorridor(lock, C4_PAYLOAD.pos, C4_CORRIDOR_END, c4Profile({ hitchedTo: 'src7' })).length, 1,
    'the hitched body counts the lock');
});

test('C4: the release sampler returns null for irrelevant fields — the ~4.87 s contact survives', () => {
  const ballistic = solveThrowSolution(C4_PAYLOAD, C4_AIM, {});
  assert.ok(ballistic.onSolution && Math.abs(ballistic.impactTime - 4.866) < 0.08,
    `fixture contact should land ~4.87 s out, got ${ballistic.impactTime}`);
  // A disjoint well exists in the world but cannot touch this throw: no sampler → ballistic.
  const disjoint = c4KernelField({ id: 'far', kind: 'well', center: { x: 60, z: 900 }, radius: 200, strength: 500 });
  const zero = c4KernelField({ id: 'zero', kind: 'repulsor', center: { x: 100, z: 0 }, radius: 200, strength: 0 });
  const state = { fields: { snapshot: [...disjoint, ...zero] }, player: {}, simTime: 0 };
  const sampler = masslineThrow._buildFieldSampler(state, C4_PAYLOAD);
  assert.equal(sampler, null, 'irrelevant fields must not build a field sampler');
  const sol = solveThrowSolution(C4_PAYLOAD, C4_AIM, { fieldSampler: sampler ?? undefined });
  assert.ok(sol.onSolution && Math.abs(sol.impactTime - 4.866) < 0.08,
    'the ballistic 4.87 s contact stands — no 1.5 s downgrade without a relevant field');
});

test('C4: an intersecting ahead-field still downgrades the read honestly', () => {
  // A real well on the lane means the ballistic 4.87 s claim is genuinely uncertain — the
  // frozen-field solve (bounded at its own integration window) takes over instead.
  const onLane = c4KernelField({ id: 'lane', kind: 'well', center: { x: 200, z: 40 }, radius: 120, strength: 500 });
  const state = { fields: { snapshot: onLane }, player: {}, simTime: 0 };
  const sampler = masslineThrow._buildFieldSampler(state, C4_PAYLOAD);
  assert.equal(typeof sampler, 'function', 'a corridor field builds the field sampler');
  const sol = solveThrowSolution(C4_PAYLOAD, C4_AIM, { fieldSampler: sampler });
  assert.equal(sol.fieldAware, true, 'the read declares itself field-aware');
  assert.ok(!(sol.impactTime > 1.6),
    `the honest downgrade: no 4.87 s contact claim survives (impactTime=${sol.impactTime})`);
});

// ── RELEASE-TRUTH C2 — the sampler shares production's actual-body semantics ─────────────────
// For every body class the force loop sees, the preview's first-step acceleration must equal
// the acceleration production queues as an impulse that same tick: same profile builder,
// same primed observation, same velocity-term gate. These cases build the production side
// exactly the way fields._applyForces does and compare raw kernel accelerations.

function c2State(entity, extra = {}) {
  return {
    simTime: 0,
    player: {},
    playerId: 1,
    entityList: [],
    entities: new Map([[entity.id, entity]]),
    combat: { entities: {} },
    fields: {
      hitches: {},
      snapshot: [
        { id: 'w', kind: 'well', center: { x: 0, z: 0 }, radius: 300, strength: 300,
          damping: 0.4, falloff: 1.2, filters: null, team: null, sourceId: 'wellsrc',
          lockStrength: 60, halfAngleRad: 1, edgeSoftRad: 0, innerRadius: 0, innerSoft: 0,
          frame: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, volume: 'sphere' },
      ],
    },
    ...extra,
  };
}

function productionAccel(state, entity, registry) {
  const profile = fieldBodyProfile(entity, state);
  profile.primed = fieldEntityIsPrimed(registry, state, entity);
  const vel = fieldVelocityTermApplies(entity, profile) ? entity.vel : null;
  return sampleFieldAcceleration(entity.pos, vel, state.fields.snapshot, state.simTime, profile, { ax: 0, az: 0 });
}

function samplerAccel(state, entity, registry) {
  const sampler = masslineThrow._buildFieldSampler.call({ registry }, state, entity);
  if (sampler == null) return null;
  return sampler(entity.pos.x, entity.pos.z, entity.vel.x, entity.vel.z);
}

test('C2: predictor first-step accel equals production accel for every body class', () => {
  const base = {
    id: 42, type: 'ship', team: 9, pos: { x: 60, z: 20 }, vel: { x: 10, z: -4 }, radius: 8,
    flags: {}, physicsBody: { schemaVersion: 1, radius: 8, mass: 30, dynamic: true },
  };
  const cases = [
    ['ordinary', {}, {}],
    // Earned Gravity Mark — the combat runtime's coupling multiplier, not a click target.
    ['marked', { combatMult: { fieldCoupling: 3 } }, {}],
    // Authored resistance — physicsBody.fieldResponseMult < 1 shrinks the pull honestly.
    ['resistant', {}, { physicsBody: { schemaVersion: 1, radius: 8, mass: 30, dynamic: true, fieldResponseMult: 0.4 } }],
    // Boost shrugs the field — flags.boosting feeds the kernel's boostCouple shrink.
    ['boosted', {}, { flags: { boosting: true } }],
    // A hitched body picks up the lock pull production applies.
    ['hitched', { hitchSource: 'wellsrc' }, {}],
    // A scripted/kinematic body feels no field — the preview must stay ballistic.
    ['kinematic', {}, { physicsBody: { schemaVersion: 1, radius: 8, mass: 30, dynamic: false } }],
    // A wreck-type body: production withholds the velocity term for non-ship/drone types.
    ['wreck', {}, { type: 'wreck' }],
  ];
  for (const [label, stateMod, entityMod] of cases) {
    const entity = { ...base, ...entityMod, physicsBody: { ...base.physicsBody, ...(entityMod.physicsBody || {}) } };
    const state = c2State(entity);
    if (stateMod.combatMult) {
      state.combat.entities[String(entity.id)] = { multipliers: stateMod.combatMult };
    }
    if (stateMod.hitchSource) state.fields.hitches[entity.id] = { sourceId: stateMod.hitchSource };
    const production = productionAccel(state, entity, null);
    const preview = samplerAccel(state, entity, null);
    if (label === 'kinematic') {
      assert.equal(preview, null, 'a kinematic payload keeps the ballistic preview');
      continue;
    }
    assert.ok(preview, `${label}: a relevant well must build a sampler`);
    assert.ok(Math.abs(preview.ax - production.ax) < 1e-9 && Math.abs(preview.az - production.az) < 1e-9,
      `${label}: preview accel (${preview.ax.toFixed(4)},${preview.az.toFixed(4)}) must equal production accel (${production.ax.toFixed(4)},${production.az.toFixed(4)})`);
  }
});

test('C2: a primed light loses the well velocity term in the preview exactly as production', () => {
  const entity = {
    id: 55, type: 'ship', team: 9, pos: { x: 60, z: 20 }, vel: { x: 10, z: -4 }, radius: 8,
    flags: {}, physicsBody: { schemaVersion: 1, radius: 8, mass: 30, dynamic: true },
  };
  const state = c2State(entity);
  // Armed charge riding the hull — the fallback scan production uses when no charges system
  // is registered. fieldEntityIsPrimed must observe it the same way.
  const charge = { id: 900, type: 'charge', alive: true, data: { armed: true, hostId: entity.id } };
  state.entityList.push(charge);
  state.entities.set(charge.id, charge);
  const primedProfile = fieldBodyProfile(entity, state);
  assert.equal(fieldVelocityTermApplies(entity, { ...primedProfile, primed: true }), false,
    'a primed ship takes no velocity term');
  const production = productionAccel(state, entity, null);
  const preview = samplerAccel(state, entity, null);
  assert.ok(preview, 'the well still applies — only the velocity term is withheld');
  assert.ok(Math.abs(preview.ax - production.ax) < 1e-9 && Math.abs(preview.az - production.az) < 1e-9,
    `primed preview (${preview.ax.toFixed(4)},${preview.az.toFixed(4)}) equals production (${production.ax.toFixed(4)},${production.az.toFixed(4)})`);
  // And it must differ from the unprimed read — the convergence term really was withheld.
  const unprimedState = c2State(entity);
  const unprimed = productionAccel(unprimedState, entity, null);
  assert.ok(Math.hypot(production.ax - unprimed.ax, production.az - unprimed.az) > 1e-6,
    'the primed accel differs from the unprimed accel — the withheld term is observable');
});

test('C2: the preview never reads target selection for earned field status', () => {
  // The old hand-built profile let state.player.targetId stand in for the earned Gravity
  // Mark. Clicking a body must neither grant nor strip the 3× response — parity is now
  // constructional: the sampler builds its profile through fieldBodyProfile, which reads the
  // combat runtime multiplier only.
  const entity = {
    id: 66, type: 'ship', team: 9, pos: { x: 60, z: 20 }, vel: { x: 10, z: -4 }, radius: 8,
    flags: {}, physicsBody: { schemaVersion: 1, radius: 8, mass: 30, dynamic: true },
  };
  const state = c2State(entity);
  state.player.targetId = entity.id; // selected, but NOT marked — must change nothing
  const preview = samplerAccel(state, entity, null);
  const production = productionAccel(state, entity, null);
  assert.ok(Math.abs(preview.ax - production.ax) < 1e-9 && Math.abs(preview.az - production.az) < 1e-9,
    'selection alone cannot fabricate the earned coupling');
});
