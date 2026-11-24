import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { PowerFx } from '../src/render/vfx/kit/powerFx.js';

// INF-043 — pull and push distinguishable without reading. Since the 2026-11-20 VFX rebuild the
// powers are drawn by the VFX kit, and the verb is carried by MOTION, never tint: Pull's motes are
// born at the field's true reach and fall inward on an inward field term; Shove's sparks leave the
// hull and run out to the true reach. Neither draws a ring (no rings around things, owner
// 2026-11-23). The legacy folded-cloth strips for both are gone (they were the "blurry blanket").

const RADIUS = 190;
const host = () => ({ toLocal: (x, z, out) => { out.x = x; out.z = z; return out; } });
const cast = (kind) => {
  const fx = new PowerFx(new THREE.Scene(), host());
  fx.update(0, { simTime: 1, settings: { video: {} }, fields: { active: [] } });
  fx.onFieldDeployed({ fieldId: kind, kind, center: { x: 30, z: -25 }, radius: RADIUS }, { settings: { video: {} } });
  return fx;
};
const CX = 30, CZ = -25;
const sparks = (fx) => {
  const [A, V, , , , F] = fx.sparks.arrays;
  const out = [];
  for (let i = 0; i < fx.sparks.highWater; i++) {
    const o = i * 4;
    out.push({ x: A[o], z: A[o + 2], vx: V[o], vz: V[o + 2], accel: F[o + 2] });
  }
  return out;
};

test('INF-043: Pull drains from the true reach with inward motes and draws no ring (no rings around things, owner 2026-11-23)', () => {
  const fx = cast('well');
  try {
    assert.equal(fx.shells.highWater, 0, 'no contracting rings (no rings around things, owner 2026-11-23)');
    const inward = sparks(fx).filter((p) => p.accel > 0);
    assert.ok(inward.length > 40, 'motes are drawn inward');
    const rim = inward.filter((p) => Math.hypot(p.x - CX, p.z - CZ) >= RADIUS * 0.8);
    assert.ok(rim.length > 40, 'the motes are born out at the true reach, so the reach still reads');
    assert.ok(inward.every((p) => Math.hypot(p.x - CX, p.z - CZ) <= RADIUS + 1e-6), 'and never past it');
  } finally { fx.dispose(); }
});

test('INF-043: Shove sparks leave the hull and run out to the true reach, with no ring (no rings around things, owner 2026-11-23)', () => {
  const fx = cast('repulsor');
  try {
    assert.equal(fx.shells.highWater, 0, 'no expanding rings (no rings around things, owner 2026-11-23)');
    const moving = sparks(fx).filter((p) => Math.hypot(p.vx, p.vz) > 1);
    const outward = moving.filter((p) => (p.x - CX) * p.vx + (p.z - CZ) * p.vz > 0);
    assert.ok(outward.length > 40, `the front reads as matter running outward (${outward.length})`);
    assert.ok(outward.length > moving.length * 0.8, 'almost everything that moves, moves out');
    assert.equal(sparks(fx).filter((p) => p.accel > 0).length, 0, 'nothing is drawn inward');
  } finally { fx.dispose(); }
});

test('INF-043: the folded-cloth presenter draws no strips for Pull or Shove any more', () => {
  for (const kind of ['well', 'repulsor']) {
    const owner = new FieldForcePresentation(new THREE.Scene());
    const s = { simTime: 0, settings: { video: {} }, massSeed: null,
      fields: { active: [{ id: kind, kind, center: { x: 30, z: -25 }, dir: { x: 1, z: 0 }, radius: RADIUS, engaged: true }] } };
    try {
      owner.update(0, s); s.simTime = 0.5; owner.update(0.5, s);
      assert.equal(owner.mesh.count, 0, `${kind}: no cloth strips`);
    } finally { owner.dispose(); }
  }
});
