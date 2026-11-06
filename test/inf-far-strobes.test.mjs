// inf-far-strobes — the far traffic streams twinkle like live shipping lanes.
//
// The high and deep silhouettes used to glide past as dead cutouts: correct shapes, zero life.
// Each hull now carries an anti-collision double-flash plus a running-light floor on its own
// phase, drawn as one instanced additive quad per silhouette on the sheets it already rides.
// Reduced motion slows the blink; it never silences it — a dark lane reads as dead traffic.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import {
  STROBE_FLOOR,
  STROBE_PERIOD_REDUCED_S,
  STROBE_PERIOD_S,
  strobeEnvelope,
  init as initFarPlaneLife,
  update as updateFarPlaneLife,
  dispose as disposeFarPlaneLife,
} from '../src/render/farPlaneLife.js';

test('the strobe is a double-flash inside one period, never fully dark', () => {
  // Between the two pulses and after the last one the light sits at the running-light floor.
  assert.equal(strobeEnvelope(0.0), STROBE_FLOOR);
  assert.equal(strobeEnvelope(0.18), STROBE_FLOOR, 'gap between the two flashes');
  assert.equal(strobeEnvelope(0.5), STROBE_FLOOR);
  // Peaks at the middle of each pulse, two of them, both above the floor.
  assert.ok(strobeEnvelope(0.09) > 0.95, 'first flash peaks hot');
  assert.ok(strobeEnvelope(0.28) > 0.95, 'second flash peaks hot');
  assert.equal(strobeEnvelope(0.09), strobeEnvelope(0.28), 'a matched double flash, not a big + small');
  // Whole-period sweep stays a 0..1 gain with exactly two bright bands and a constant floor.
  let bands = 0;
  let prevHot = false;
  for (let u = 0; u < 1; u += 0.002) {
    const v = strobeEnvelope(u);
    assert.ok(v >= STROBE_FLOOR - 1e-9 && v <= 1 + 1e-9, `gain in range at u=${u.toFixed(3)}`);
    const hot = v > 0.5;
    if (hot && !prevHot) bands += 1;
    prevHot = hot;
  }
  assert.equal(bands, 2, 'exactly two flashes per period');
});

test('the pattern is periodic and phase-shifts per ship', () => {
  assert.equal(strobeEnvelope(0.09), strobeEnvelope(1.09), 'wraps on the period');
  assert.equal(strobeEnvelope(-0.04), strobeEnvelope(0.96), 'negative positions wrap too');
  assert.equal(strobeEnvelope(NaN), STROBE_FLOOR, 'degenerate input degrades to the floor, not NaN');
  // Two hulls a half-period apart never flash together: the lane must not strobe in lockstep.
  let together = 0;
  for (let u = 0; u < 1; u += 0.01) {
    if (strobeEnvelope(u) > 0.5 && strobeEnvelope(u + 0.5) > 0.5) together += 1;
  }
  assert.equal(together, 0, 'half-period offset hulls never flash in the same tick');
});

test('the live sheets carry instanced strobes that ride the yield-corrected hulls', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 400, 220);
  camera.lookAt(0, 0, 0);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, radius: 6 };
  const state = {
    playerId: 1,
    entities: new Map([[1, player]]),
    entityList: [player],
    entityIndex: { __spacefaceEntityIndexV1: true, ready: true, version: 1, laneVersions: {}, laneEpoch: 0, wrecks: [], ships: [player] },
    simTime: 0,
    camera: { focus: { x: 0, z: 0 } },
    world: { frameOrigin: { x: 0, z: 0 } },
    settings: { video: { particleQuality: 'low', engineTrails: false }, accessibility: {} },
    render: { scene, camera, viewport: { height: 720 } },
  };
  try {
    initFarPlaneLife(scene, state, null);
    // A few frames: the strobes must leave their parked sentinel and ride the hulls.
    for (let f = 0; f < 4; f++) updateFarPlaneLife(1 / 60);
    const sheaths = scene.children.filter((c) => c.name === 'FarLife_HighStream' || c.name === 'FarLife_DeepStream');
    assert.ok(sheaths.length === 2, 'both streams present');
    let strobeCount = 0;
    let colorInstances = 0;
    for (const sheetRoot of sheaths) {
      const strobe = sheetRoot.children.find((c) => c.isInstancedMesh && c.name.endsWith('_NavStrobes'));
      assert.ok(strobe, 'each sheet carries its nav-strobe instanced mesh');
      assert.ok(strobe.instanceMatrix, 'strobe has instance matrices');
      assert.ok(strobe.instanceColor, 'strobes carry per-hull nav-light colors');
      colorInstances += strobe.instanceColor.array.filter((v) => v > 0.01).length;
      strobeCount += stroveCountSafe(strobe);
    }
    assert.ok(strobeCount > 0, 'strobes are parked then written live by update');
    assert.ok(colorInstances > 0, 'per-instance tint is authored');
  } finally {
    disposeFarPlaneLife();
  }
});

function stroveCountSafe(mesh) {
  // After one update, no strobe may still sit parked at the off-screen sentinel y=-9999.
  let parked = 0;
  const m = new THREE.Matrix4();
  for (let i = 0; i < mesh.count; i++) {
    mesh.getMatrixAt(i, m);
    if (m.elements[13] < -1000) parked += 1;
  }
  return mesh.count - parked;
}

test('reduced motion slows the blink period instead of silencing it', () => {
  const vfx = readFileSync(new URL('../src/render/farPlaneLife.js', import.meta.url), 'utf8');
  assert.match(vfx, /STROBE_PERIOD_S = 1\.9/);
  assert.match(vfx, /STROBE_PERIOD_REDUCED_S = 5\.7/);
  assert.match(vfx, /a11y\.id === 'full' \? STROBE_PERIOD_S : STROBE_PERIOD_REDUCED_S/);
  assert.match(vfx, /resolveVfxAccessibilityProfile\(this\.state && this\.state\.settings\)/);
  // The strobe rides the same yield-corrected position the silhouette draws (no drift).
  assert.match(vfx, /const px = wx - Math\.sin\(s\.heading\) \* s\.yieldOff;/);
  assert.match(vfx, /sheet\.strobeMesh\.setMatrixAt\(i, this\._matrix\)/);
});
