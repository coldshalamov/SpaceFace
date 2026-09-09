// PQ-137.09 — "wells converge ships to 30-60 WU/s relative … and prime on grind."
//
// The convergence is a FORCE LAW with a fixed point, not a clamp: the kernel's radial term and its
// velocity term carry the same falloff and the same coupling, so they cancel at exactly
// strength/damping and nothing is ever clipped. These tests pin that, pin the number landing in
// the band, pin the deploy path actually forwarding it, and pin the two body types that keep their
// pure positional bend.
import test from 'node:test';
import assert from 'node:assert/strict';

import { FIELD_DEFS, FIELD_KINDS, WELL_GRIND, fieldsFlag, FIELD_FLAGS } from '../src/data/fields.js';
import { createFieldKernel, normalizeField, sampleFieldAcceleration } from '../src/core/fields/fieldKernel.js';
import { fields, FIELD_VELOCITY_TERM_TYPES } from '../src/systems/fields.js';

const PHYSICAL = 'Combat should be physical.';
const CONSEQUENCES = 'Consequences or it is thin.';
const BAND = { lo: 30, hi: 60 };

const LIGHT = Object.freeze({ mass: 16, type: 'ship', team: 1, fieldResponseMult: 1, id: 77 });
const HEAVY = Object.freeze({ mass: 200, type: 'ship', team: 1, fieldResponseMult: 1, id: 78 });

function wellField() {
  return normalizeField({
    id: 'field_well_test',
    kind: FIELD_KINDS.WELL,
    center: { x: 0, z: 0 },
    radius: FIELD_DEFS.well.radius,
    strength: FIELD_DEFS.well.strength,
    damping: FIELD_DEFS.well.damping,
    falloff: FIELD_DEFS.well.falloff,
    durationS: Infinity,
  });
}

// Inward radial acceleration for a body at (r, 0) moving toward the centre at `speed`.
function inwardAccel(field, r, speed, profile) {
  const out = sampleFieldAcceleration({ x: r, z: 0 }, { x: -speed, z: 0 }, [field], 0, profile, { ax: 0, az: 0 });
  return -out.ax; // +ve means still being pulled in
}

test('the authored well has an equilibrium speed inside the 30-60 WU/s band', () => {
  const def = FIELD_DEFS.well;
  assert.ok(def.damping > 0, 'the well needs a velocity term or there is no equilibrium at all');
  const equilibrium = def.strength / def.damping;
  assert.ok(equilibrium >= BAND.lo && equilibrium <= BAND.hi,
    `${PHYSICAL} — a well that converges ships has to converge them to a speed a player can read, not to infinity (got ${equilibrium})`);
});

test('the equilibrium is a fixed point of the force law, at every depth and for every mass', () => {
  const field = wellField();
  const equilibrium = FIELD_DEFS.well.strength / FIELD_DEFS.well.damping;
  for (const r of [20, 60, 120, 180]) {
    for (const profile of [LIGHT, HEAVY]) {
      const atEquilibrium = inwardAccel(field, r, equilibrium, profile);
      assert.ok(Math.abs(atEquilibrium) < 1e-6,
        `${PHYSICAL} — at ${equilibrium} WU/s the well stops working on a mass-${profile.mass} hull at r=${r}; that is what "converges to" means`);
      assert.ok(inwardAccel(field, r, equilibrium * 0.5, profile) > 0,
        'slower than the equilibrium, the well is still pulling');
      assert.ok(inwardAccel(field, r, equilibrium * 2, profile) < 0,
        'faster than the equilibrium, the well is holding it back — with a force, never a clamp');
    }
  }
});

test('nothing is clipped: a body given momentum keeps it and is only ever pushed by a force', () => {
  const field = wellField();
  const fast = inwardAccel(field, 100, 400, LIGHT);
  const faster = inwardAccel(field, 100, 800, LIGHT);
  assert.ok(faster < fast,
    'the opposing force grows with speed — a clamp would truncate the speed instead, and momentum the player earned would vanish');
  assert.ok(Number.isFinite(faster), 'the law stays finite at any speed');
});

test('a deployed Well carries its authored damping into the live field record', () => {
  const player = {
    id: 1, type: 'ship', alive: true, rot: 0, radius: 14,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, team: 0, flags: {},
  };
  const state = {
    mode: 'flight', tick: 3, simTime: 0.05, playerId: 1,
    entities: new Map([[player.id, player]]),
    entityList: [player],
    input: { actions: {}, aimWorld: { x: 200, z: 0 } },
    ui: { screenStack: [] },
  };
  const system = Object.create(fields);
  system.state = state;
  system.bus = { emit() {} };
  system._kernel = createFieldKernel();
  const spawned = [];
  system.helpers = {
    spawnEntity(spec) {
      const e = { id: 900 + spawned.length, alive: true, ...spec, pos: { ...spec.pos }, vel: { ...spec.vel } };
      spawned.push(e);
      state.entityList.push(e);
      state.entities.set(e.id, e);
      return e;
    },
  };
  const rt = { schemaVersion: 1, deployed: {}, cooldowns: { well: 0, repulsor: 0 }, anchored: {}, lastDenial: null };

  system._deployRadial(state, rt, 'well');

  const record = system._kernel.list().find((f) => f.kind === FIELD_KINDS.WELL);
  assert.ok(record, 'the deploy has to register a well');
  assert.equal(record.damping, FIELD_DEFS.well.damping,
    `${PHYSICAL} — the deploy path used to drop the authored damping on the floor, so the convergence law did not exist on the route no matter what the data said`);
});

test('the convergence law applies to craft, and everything else keeps its pure positional bend', () => {
  assert.ok(FIELD_VELOCITY_TERM_TYPES.has('ship'), 'craft are exactly what the convergence law is for');
  assert.ok(FIELD_VELOCITY_TERM_TYPES.has('drone'), 'a drone is craft');
  assert.ok(!FIELD_VELOCITY_TERM_TYPES.has('projectile'), 'a well must still curve a shot, not catch it');
  assert.ok(!FIELD_VELOCITY_TERM_TYPES.has('pickup'), 'a well must still vacuum loot');
  assert.ok(!FIELD_VELOCITY_TERM_TYPES.has('wreck'),
    'debris still funnels on the pure pull the release predictor and the Intake read were built around');

  // The kernel applies the velocity term only when a velocity sample is handed to it, which is the
  // seam the fields owner uses to withhold it for those two types.
  const field = wellField();
  const withVel = sampleFieldAcceleration({ x: 100, z: 0 }, { x: -300, z: 0 }, [field], 0, LIGHT, { ax: 0, az: 0 });
  const withoutVel = sampleFieldAcceleration({ x: 100, z: 0 }, null, [field], 0, LIGHT, { ax: 0, az: 0 });
  assert.ok(withoutVel.ax < 0, 'without a velocity sample the pull is purely radial and inward');
  assert.ok(withVel.ax > withoutVel.ax,
    'with a velocity sample a fast inbound body is opposed — that is the term the marquee reads opt out of');
});

test('grind is CONSECUTIVE contact, and the ledger drops a pair the moment it separates', () => {
  const a = body(2, 0, 0);
  const b = body(3, 0, 26);
  const system = Object.create(fields);
  const emitted = [];
  system.bus = { emit(name, payload) { emitted.push({ name, payload }); } };
  system._grindPairs = new Map();
  system._grindScratch = [];
  system._wellBodies = new Set([a, b]);
  system._wellAccum = new WeakMap([[a, { touched: true, fieldId: 'field_well_test' }], [b, { touched: true, fieldId: 'field_well_test' }]]);
  const state = { tick: 0 };

  for (let i = 0; i < WELL_GRIND.ticks - 1; i++) {
    state.tick = i;
    system._detectWellGrind(state);
  }
  assert.equal(emitted.filter((e) => e.name === 'well:grind').length, 0,
    'a brush past is not a grind');

  state.tick = WELL_GRIND.ticks - 1;
  system._detectWellGrind(state);
  const grinds = emitted.filter((e) => e.name === 'well:grind');
  assert.equal(grinds.length, 1,
    `${CONSEQUENCES} — two hulls a well has held against each other long enough are one clump, and the well says so exactly once`);
  assert.equal(grinds[0].payload.aId, a.id);
  assert.equal(grinds[0].payload.bId, b.id);

  // Separate them: the streak is gone, so the ledger cannot grow without bound either.
  b.pos.z = 400;
  state.tick += 1;
  system._detectWellGrind(state);
  assert.equal(system._grindPairs.size, 0, 'a pair that separated is dropped');
});

test('the field system stays a strict no-op under node unless a bench opts in', () => {
  assert.equal(fieldsFlag('enabled'), FIELD_FLAGS.enabled,
    'the golden-safety gate is read at call time, never cached');
});

function body(id, x, z) {
  return { id, type: 'ship', alive: true, pos: { x, z }, vel: { x: 0, z: 0 }, radius: 14, mass: 16 };
}
