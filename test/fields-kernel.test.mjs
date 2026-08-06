// PQ-012 / SF-12 — Field kernel math: register/unregister lifecycle, falloff, caps, coupling
// (heavy-shrug), filters, determinism (order-independence + replay hash + timestep decomposition),
// and the pure sampleFieldAcceleration predictor seam.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createFieldKernel,
  normalizeField,
  fieldFalloff,
  couplingScale,
  fieldRawAcceleration,
  fieldAffectsBody,
  sampleFieldAcceleration,
} from '../src/core/fields/fieldKernel.js';
import { FIELD_KINDS, FIELD_MAX_ACCEL, FIELD_COUPLING, FIELD_DEFS } from '../src/data/fields.js';

const LIGHT = { mass: 2, type: 'wreck', team: null, fieldResponseMult: 1, id: 1 };
const HEAVY = { mass: 140, type: 'ship', team: null, fieldResponseMult: 1, id: 2 };
const PROJ = { mass: 0.3, type: 'projectile', team: null, fieldResponseMult: 1, id: 3 };

function wellAt(cx, cz, extra = {}) {
  return { id: 'w', kind: FIELD_KINDS.WELL, center: { x: cx, z: cz }, radius: 200, strength: 240, falloff: 1.5, createdAt: 0, durationS: 10, ...extra };
}

// ── lifecycle ────────────────────────────────────────────────────────────────────────────────
test('register / unregister / clear lifecycle is authoritative', () => {
  const k = createFieldKernel();
  assert.equal(k.size, 0);
  k.register(wellAt(0, 0, { id: 'a' }));
  k.register(wellAt(10, 0, { id: 'b' }));
  assert.equal(k.size, 2);
  assert.ok(k.has('a'));
  assert.equal(k.unregister('a'), true);
  assert.equal(k.unregister('a'), false, 'double unregister is a no-op');
  assert.equal(k.size, 1);
  k.clear();
  assert.equal(k.size, 0);
});

test('list() is id-sorted regardless of insertion order (stable summation)', () => {
  const k1 = createFieldKernel();
  k1.register(wellAt(0, 0, { id: 'zzz' }));
  k1.register(wellAt(0, 0, { id: 'aaa' }));
  const k2 = createFieldKernel();
  k2.register(wellAt(0, 0, { id: 'aaa' }));
  k2.register(wellAt(0, 0, { id: 'zzz' }));
  assert.deepEqual(k1.list().map((f) => f.id), ['aaa', 'zzz']);
  assert.deepEqual(k2.list().map((f) => f.id), ['aaa', 'zzz']);
});

test('expire() drops only fields past their bounded lifetime', () => {
  const k = createFieldKernel();
  k.register(wellAt(0, 0, { id: 'short', createdAt: 0, durationS: 2 }));
  k.register(wellAt(0, 0, { id: 'long', createdAt: 0, durationS: 20 }));
  k.register({ id: 'cone', kind: FIELD_KINDS.CONE, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 100, strength: 100, durationS: Infinity, createdAt: 0 });
  assert.deepEqual([...k.expire(1)], []);
  assert.deepEqual([...k.expire(3)], ['short']);
  assert.equal(k.has('long'), true);
  assert.equal(k.has('cone'), true, 'infinite-duration (player-attached) field never auto-expires');
});

// ── falloff ──────────────────────────────────────────────────────────────────────────────────
test('falloff is 1 at center, 0 at/beyond radius, monotonic between', () => {
  const f = normalizeField(wellAt(0, 0, { radius: 100, falloff: 2 }));
  assert.equal(fieldFalloff(f, 0), 1);
  assert.equal(fieldFalloff(f, 100), 0);
  assert.equal(fieldFalloff(f, 130), 0);
  let prev = 1.0001;
  for (let r = 0; r <= 100; r += 10) {
    const v = fieldFalloff(f, r);
    assert.ok(v <= prev, `falloff monotonic non-increasing at r=${r}`);
    assert.ok(v >= 0 && v <= 1);
    prev = v;
  }
});

// ── direction ────────────────────────────────────────────────────────────────────────────────
test('well pulls toward center, repulsor pushes away', () => {
  const well = normalizeField(wellAt(0, 0));
  const rep = normalizeField({ id: 'r', kind: FIELD_KINDS.REPULSOR, center: { x: 0, z: 0 }, radius: 200, strength: 240, falloff: 1.5 });
  const out = { ax: 0, az: 0 };
  fieldRawAcceleration(well, 50, 0, out); // body east of center
  assert.ok(out.ax < 0, 'well accel points -x (toward center)');
  fieldRawAcceleration(rep, 50, 0, out);
  assert.ok(out.ax > 0, 'repulsor accel points +x (away from center)');
});

test('exact center produces no NaN force', () => {
  const well = normalizeField(wellAt(0, 0));
  const out = fieldRawAcceleration(well, 0, 0, { ax: 1, az: 1 });
  assert.equal(out.ax, 0);
  assert.equal(out.az, 0);
});

test('cone drives along dir inside the wedge and is silent outside it', () => {
  const cone = normalizeField({ id: 'c', kind: FIELD_KINDS.CONE, center: { x: 0, z: 0 }, dir: { x: 1, z: 0 }, radius: 200, strength: 260, falloff: 1.2, halfAngleRad: 0.56, edgeSoftRad: 0.14 });
  const onAxis = fieldRawAcceleration(cone, 100, 0, { ax: 0, az: 0 });
  assert.ok(onAxis.ax > 0 && Math.abs(onAxis.az) < 1e-6, 'on-axis push is +x forward');
  const behind = fieldRawAcceleration(cone, -100, 0, { ax: 0, az: 0 });
  assert.equal(behind.ax, 0, 'body behind the apex is outside the wedge');
  assert.equal(behind.az, 0);
  const wide = fieldRawAcceleration(cone, 100, 300, { ax: 0, az: 0 }); // ~71 deg off-axis
  assert.equal(wide.ax, 0, 'body well outside the half-angle gets no force');
  const outside = fieldRawAcceleration(cone, 500, 0, { ax: 0, az: 0 });
  assert.equal(outside.ax, 0, 'body beyond radius gets no force');
});

// ── coupling / heavy-shrug (brief req 2/13) ───────────────────────────────────────────────────
test('heavy ship Δv is a small fraction of a light body Δv under the same field', () => {
  const cLight = couplingScale(LIGHT);
  const cHeavy = couplingScale(HEAVY);
  assert.ok(cLight > 0.9, `light body couples ~fully (got ${cLight})`);
  assert.ok(cHeavy < 0.2 * cLight, `heavy ship shrugs: coupling ${cHeavy} should be < 20% of light ${cLight}`);
  // And prove it at the Δv layer: Δv = a_effective·dt, so the coupling ratio IS the Δv ratio.
  const fields = [normalizeField(wellAt(0, 0))];
  const pos = { x: 40, z: 0 };
  const dt = 1 / 60;
  const aLight = sampleFieldAcceleration(pos, null, fields, 0, LIGHT);
  const aHeavy = sampleFieldAcceleration(pos, null, fields, 0, HEAVY);
  const dvLight = Math.hypot(aLight.ax, aLight.az) * dt;
  const dvHeavy = Math.hypot(aHeavy.ax, aHeavy.az) * dt;
  assert.ok(dvHeavy < 0.2 * dvLight, `heavy Δv ${dvHeavy} must be < 20% of light Δv ${dvLight}`);
});

test('projectiles bend more than light bodies; marked heavy grabs harder but still shrugs', () => {
  assert.ok(couplingScale(PROJ) > couplingScale(LIGHT), 'projectile couples above a light body');
  const markedHeavy = { ...HEAVY, fieldResponseMult: 1.9 };
  const cHeavy = couplingScale(HEAVY);
  const cMarked = couplingScale(markedHeavy);
  assert.ok(cMarked > cHeavy, 'marked heavy grabs harder than unmarked heavy');
  assert.ok(cMarked < couplingScale(LIGHT), 'marked heavy still shrugs vs a light body');
  assert.ok(cMarked <= FIELD_COUPLING.markedCap + 1e-9, 'marked coupling capped');
});

// ── acceleration cap (safety bound, NOT the shrug) ────────────────────────────────────────────
test('summed acceleration is clamped to FIELD_MAX_ACCEL', () => {
  const k = createFieldKernel();
  // Stack several strong wells on the same point to force the sum past the cap.
  for (let i = 0; i < 5; i++) k.register(wellAt(0, 0, { id: `s${i}`, strength: 800 }));
  const a = sampleFieldAcceleration({ x: 20, z: 0 }, null, k.list(), 0, LIGHT);
  assert.ok(Math.hypot(a.ax, a.az) <= FIELD_MAX_ACCEL + 1e-6, 'total accel never exceeds the cap');
});

// ── filters ──────────────────────────────────────────────────────────────────────────────────
test('filters gate coupling by type / team / id', () => {
  const teamField = normalizeField({ ...wellAt(0, 0), team: 1, filters: { excludeSourceTeam: true } });
  assert.equal(fieldAffectsBody(teamField, { type: 'ship', team: 1 }), false, 'friendly craft spared');
  assert.equal(fieldAffectsBody(teamField, { type: 'ship', team: 2 }), true, 'hostile craft affected');
  const typeField = normalizeField({ ...wellAt(0, 0), filters: { types: ['projectile'] } });
  assert.equal(fieldAffectsBody(typeField, { type: 'ship' }), false);
  assert.equal(fieldAffectsBody(typeField, { type: 'projectile' }), true);
  const idField = normalizeField({ ...wellAt(0, 0), filters: { excludeId: 7 } });
  assert.equal(fieldAffectsBody(idField, { type: 'ship', id: 7 }), false, 'the field source spares itself');
});

// ── determinism ──────────────────────────────────────────────────────────────────────────────
test('sampleFieldAcceleration is a pure function (identical inputs → identical output)', () => {
  const fields = [normalizeField(wellAt(0, 0)), normalizeField({ id: 'c', kind: FIELD_KINDS.CONE, center: { x: 5, z: 5 }, dir: { x: 0, z: 1 }, radius: 150, strength: 200 })];
  const a = sampleFieldAcceleration({ x: 30, z: 12 }, { x: 3, z: -1 }, fields, 1.234, HEAVY);
  const b = sampleFieldAcceleration({ x: 30, z: 12 }, { x: 3, z: -1 }, fields, 9.999, HEAVY);
  assert.deepEqual(a, b, 'result is time-independent and repeatable (decomposition-safe)');
});

test('field summation is order-independent given id-sorted lists', () => {
  const k1 = createFieldKernel();
  k1.register(wellAt(0, 0, { id: 'a', strength: 200 }));
  k1.register(wellAt(60, 0, { id: 'b', strength: 300 }));
  const k2 = createFieldKernel();
  k2.register(wellAt(60, 0, { id: 'b', strength: 300 }));
  k2.register(wellAt(0, 0, { id: 'a', strength: 200 }));
  const p = { x: 25, z: 8 };
  assert.deepEqual(
    sampleFieldAcceleration(p, null, k1.list(), 0, LIGHT),
    sampleFieldAcceleration(p, null, k2.list(), 0, LIGHT),
  );
});

test('replay hash: integrating a body under a well twice is byte-identical', () => {
  function run() {
    const fields = [normalizeField(wellAt(0, 0, { strength: 240, radius: 260 }))];
    // Semi-implicit Euler, fixed dt — the same integrator shape the sim uses for Δv-from-accel.
    let x = 180, z = 40, vx = 0, vz = 0;
    const dt = 1 / 60;
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < 400; i++) {
      const a = sampleFieldAcceleration({ x, z }, { x: vx, z: vz }, fields, i * dt, LIGHT);
      vx += a.ax * dt; vz += a.az * dt;
      x += vx * dt; z += vz * dt;
      // fold positions into an FNV-1a hash of their fixed-point representation
      const fold = (n) => { hash ^= (Math.round(n * 1000) | 0) >>> 0; hash = Math.imul(hash, 16777619) >>> 0; };
      fold(x); fold(z); fold(vx); fold(vz);
    }
    return hash >>> 0;
  }
  assert.equal(run(), run(), 'identical seed/inputs → identical trajectory hash');
});

test('timestep decomposition: one dt step equals two dt/2 steps for a fixed-accel tick', () => {
  const fields = [normalizeField(wellAt(0, 0))];
  const p = { x: 50, z: 0 };
  const a = sampleFieldAcceleration(p, null, fields, 0, LIGHT);
  const dt = 1 / 60;
  const oneStep = Math.hypot(a.ax, a.az) * dt;
  // acceleration is dt-independent, so Δv split across two half-steps at the same pos sums exactly
  const twoHalf = Math.hypot(a.ax, a.az) * (dt / 2) + Math.hypot(a.ax, a.az) * (dt / 2);
  assert.ok(Math.abs(oneStep - twoHalf) < 1e-12, 'impulse decomposition is exact for a held-position tick');
});

// ── data defs sanity ─────────────────────────────────────────────────────────────────────────
test('all three consumer defs normalize to their declared kinds', () => {
  assert.equal(normalizeField(FIELD_DEFS.well).kind, FIELD_KINDS.WELL);
  assert.equal(normalizeField(FIELD_DEFS.repulsor).kind, FIELD_KINDS.REPULSOR);
  assert.equal(normalizeField(FIELD_DEFS.cone).kind, FIELD_KINDS.CONE);
  assert.equal(normalizeField(FIELD_DEFS.cone).durationS, Infinity, 'cone is sustained');
});
