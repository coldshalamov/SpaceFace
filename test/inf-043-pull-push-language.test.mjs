import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { PowerFx } from '../src/render/vfx/kit/powerFx.js';
import { SHELL_MODE } from '../src/render/vfx/kit/shockShell.js';

// INF-043 — pull and push distinguishable without reading. Since the 2026-11-20 VFX rebuild the
// powers are drawn by the VFX kit, and the verb is carried by MOTION and GEOMETRY, never tint:
// Pull's fronts start at the field's true reach and CONTRACT (accelerating inward) while its motes
// carry an inward field term; Shove's fronts start at the hull and EXPAND to the true reach. The
// legacy folded-cloth strips for both are gone (they were the "blurry blanket").

const RADIUS = 190;
const host = () => ({ toLocal: (x, z, out) => { out.x = x; out.z = z; return out; } });
const cast = (kind) => {
  const fx = new PowerFx(new THREE.Scene(), host());
  fx.update(0, { simTime: 1, settings: { video: {} }, fields: { active: [] } });
  fx.onFieldDeployed({ fieldId: kind, kind, center: { x: 30, z: -25 }, radius: RADIUS }, { settings: { video: {} } });
  return fx;
};
const shells = (fx) => {
  const out = [];
  for (let i = 0; i < fx.shells.highWater; i++) {
    out.push({ from: fx.shells.arrays[1][i * 4], to: fx.shells.arrays[1][i * 4 + 1], mode: fx.shells.arrays[3][i * 4] });
  }
  return out;
};

test('INF-043: Pull fronts fall inward from the true reach; its motes carry an inward field term', () => {
  const fx = cast('well');
  try {
    const s = shells(fx);
    assert.ok(s.length >= 1);
    assert.equal(s[0].from, RADIUS, 'the first ring starts exactly at the field radius');
    for (const shell of s) {
      assert.equal(shell.mode, SHELL_MODE.CONTRACT, 'every Pull front contracts');
      assert.ok(shell.from > shell.to, `inward span (${shell.from} -> ${shell.to})`);
      assert.ok(shell.from <= RADIUS && shell.from >= RADIUS * 0.85, 'it starts at the field radius (chasing rings just inside it)');
    }
    let inward = 0;
    for (let i = 0; i < fx.sparks.highWater; i++) if (fx.sparks.arrays[5][i * 4 + 2] > 0) inward++;
    assert.ok(inward > 40, 'motes are drawn inward');
  } finally { fx.dispose(); }
});

test('INF-043: Shove fronts expand from the hull to the true reach', () => {
  const fx = cast('repulsor');
  try {
    const s = shells(fx);
    assert.ok(s.length >= 2);
    for (const shell of s) {
      assert.equal(shell.mode, SHELL_MODE.EXPAND, 'every Shove front expands');
      assert.ok(shell.to > shell.from, `outward span (${shell.from} -> ${shell.to})`);
      assert.ok(shell.to >= RADIUS * 0.9 && shell.to <= RADIUS, 'it reaches the field edge, no further');
    }
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
