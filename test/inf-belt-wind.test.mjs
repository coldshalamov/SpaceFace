// inf-belt-wind — the belt has weather, and the weather says where you are.
//
// The player story: sitting still in a belt, the near-field dust used to hang dead in the
// vacuum — it only moved when YOU moved (camera parallax) or when a chip spun in place. Now
// the drift sheet rides a slow wind keyed to the sector's own palette class: the inhabited
// core breathes a near-still drift, the belts run a brisk dusty flow, the fringe pulls cold,
// and the anomaly shears fast on a wrong-heading vector. Each grain carries its own phase so
// the sheet shears instead of marching in lockstep, and reduced motion freezes the weather
// clock (the sheet stays on screen — animation, not membership).
//
// These tests pin the pure decision layer in src/render/sectorWind.js — the same formulas the
// drift-band shader subtracts inside its wrap (see parallaxLayers.js configureParallaxBandGpuMotion).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';

import {
  fallbackSectorWind,
  lerpedWindUniforms,
  resolveSectorWind,
  windWrappedCenterXZ,
} from '../src/render/sectorWind.js';
import * as parallaxLayers from '../src/render/parallaxLayers.js';

// Palette-class lookalikes carrying the authored tint identities the renderer resolves.
const CORE = { nebulaTint: 0x2450a0, dust: 0x8ec0e8 };
const BELT = { nebulaTint: 0x8a4a1e, dust: 0xc0793d };
const FRINGE = { nebulaTint: 0x8a1e1e, dust: 0xc15032 };
const ANOMALY = { nebulaTint: 0x5a1e8a, dust: 0x79ffc8 };
const VISCERA = { nebulaTint: 0x2a0810, dust: 0x8a4038 };

test('every authored sky has its own wind — direction and strength say where you are', () => {
  const winds = [CORE, BELT, FRINGE, ANOMALY, VISCERA].map(resolveSectorWind);
  for (const wind of winds) {
    assert.ok(Number.isFinite(wind.dirX) && Number.isFinite(wind.dirZ), 'wind direction is finite');
    assert.ok(Math.abs(Math.hypot(wind.dirX, wind.dirZ) - 1) < 1e-6, 'wind direction is a unit vector');
    assert.ok(wind.speedWuPerS > 0 && wind.speedWuPerS < 30, 'wind speed is a plausible dust wind');
  }
  const directions = new Set(winds.map((w) => `${w.dirX.toFixed(3)},${w.dirZ.toFixed(3)}`));
  assert.equal(directions.size, winds.length, 'no two skies share the same wind heading');
  const core = resolveSectorWind(CORE);
  const belt = resolveSectorWind(BELT);
  const anomaly = resolveSectorWind(ANOMALY);
  const viscera = resolveSectorWind(VISCERA);
  assert.ok(belt.speedWuPerS > core.speedWuPerS * 2, 'the belt runs visibly brisker weather than the core');
  assert.ok(anomaly.speedWuPerS > belt.speedWuPerS, 'the anomaly shears fastest — wrong-heading weather');
  assert.ok(viscera.speedWuPerS < core.speedWuPerS, 'the wet interior is near-still');
});

test('an unlisted palette still gets deterministic weather, and a null palette never explodes', () => {
  const odd = { nebulaTint: 0x123456, dust: 0x654321 };
  const a = resolveSectorWind(odd);
  const b = resolveSectorWind({ nebulaTint: 0x123456 });
  assert.deepEqual(a, b, 'the fallback hashes only the authored tint, not extra fields');
  assert.notDeepEqual(resolveSectorWind({ nebulaTint: 0x123457 }), a, 'a different sky gets different weather');
  const none = resolveSectorWind(null);
  assert.ok(Number.isFinite(none.speedWuPerS) && Number.isFinite(none.dirX), 'null palette reads the deterministic fallback');
  // The raw fallback carries {angle, speed}; the resolver carries the unit vector form. Same hash.
  const raw = fallbackSectorWind(null);
  assert.ok(Math.abs(none.speedWuPerS - raw.speed) < 1e-9, 'resolver speed is the fallback speed');
  assert.ok(Math.abs(none.dirX - Math.cos(raw.angle)) < 1e-9, 'resolver direction is the fallback angle');
});

test('grains ride the wind inside the wrap cell and shear apart instead of marching in lockstep', () => {
  const wind = resolveSectorWind(BELT);
  const TILE = 2200;
  const at = (timeS, phase, baseX = 100, baseZ = -40) =>
    windWrappedCenterXZ(baseX, baseZ, wind, timeS, phase, TILE);
  const t0 = at(0, 0.5);
  assert.deepEqual(t0, { x: 100, z: -40 }, 'at time zero the sheet sits on its authored centers');
  // Two grains at the same base with different phases drift apart — shear, not conveyor.
  const early = [at(30, 0), at(30, 1)];
  const dist = Math.hypot(early[0].x - early[1].x, early[0].z - early[1].z);
  assert.ok(dist > 1, `phase must shear neighbours apart over half a minute (got ${dist.toFixed(3)} wu)`);
  // Long-run wrap: the grain stays inside the frozen cell no matter how long the wind runs.
  for (const hours of [1, 6, 24]) {
    const far = at(hours * 3600, 0.3);
    assert.ok(Math.abs(far.x) <= TILE / 2 && Math.abs(far.z) <= TILE / 2, 'wrapped centers stay in the cell');
  }
  // A frozen clock freezes the sheet: the reduced-motion caller just stops advancing time.
  const frozenA = at(120, 0.7);
  const frozenB = at(120, 0.7);
  assert.deepEqual(frozenA, frozenB);
});

test('a sector hand-off swings the weather on the short arc and settles on the new sky', () => {
  const core = resolveSectorWind(CORE);
  const belt = resolveSectorWind(BELT);
  const start = lerpedWindUniforms(core, belt, 0);
  assert.ok(Math.abs(start.speedWuPerS - core.speedWuPerS) < 1e-9, 't=0 is the outgoing wind');
  const end = lerpedWindUniforms(core, belt, 1);
  assert.ok(Math.abs(end.speedWuPerS - belt.speedWuPerS) < 1e-9, 't=1 is the incoming wind');
  const mid = lerpedWindUniforms(core, belt, 0.5);
  assert.ok(mid.speedWuPerS > core.speedWuPerS && mid.speedWuPerS < belt.speedWuPerS,
    'the hand-off eases through intermediate strength');
  // Short arc: the anomaly->core heading delta must take the short way round, not spin 300 deg.
  const anomaly = resolveSectorWind(ANOMALY);
  const swing = lerpedWindUniforms(anomaly, core, 0.5);
  const fromAngle = Math.atan2(anomaly.dirZ, anomaly.dirX);
  const toAngle = Math.atan2(core.dirZ, core.dirX);
  let shortDelta = toAngle - fromAngle;
  while (shortDelta > Math.PI) shortDelta -= Math.PI * 2;
  while (shortDelta < -Math.PI) shortDelta += Math.PI * 2;
  const midAngle = Math.atan2(swing.z, swing.x);
  let walked = midAngle - fromAngle;
  while (walked > Math.PI) walked -= Math.PI * 2;
  while (walked < -Math.PI) walked += Math.PI * 2;
  assert.ok(Math.sign(walked) === Math.sign(shortDelta) || Math.abs(walked) < 1e-6,
    'the hand-off walks the short way around the compass');
});

// --- Drift-band wiring (mirrors the mid-debris GPU animation test's fail-closed approach). ---

function installCanvasStub() {
  const gradient = { addColorStop() {} };
  const context = {
    fillStyle: null,
    globalCompositeOperation: 'source-over',
    clearRect() {},
    createRadialGradient() { return gradient; },
    createLinearGradient() { return gradient; },
    fillRect() {},
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    putImageData() {},
    drawImage() {},
  };
  globalThis.document = globalThis.document || {};
  globalThis.document.createElement = globalThis.document.createElement || ((tag) => (
    tag === 'canvas' ? { width: 0, height: 0, getContext: () => context } : {}
  ));
}
installCanvasStub();

function makeState(video, palette) {
  return {
    settings: { video },
    render: { sectorPalette: palette },
    camera: { focus: { x: 320, y: 0, z: -180 } },
    playerId: 1,
    entities: new Map(),
  };
}

function findDriftMesh(stack) {
  for (const group of stack.groups) {
    if (group.userData.layer !== 'driftSheet') continue;
    const mesh = group.children.find((child) => child && child.isInstancedMesh);
    if (mesh) return mesh;
  }
  return null;
}

test('only the drift sheet carries the wind: attribute, uniforms, shader terms, and its own program key', () => {
  const scene = new THREE.Scene();
  const state = makeState({ particleQuality: 'medium', motionReduce: false }, BELT);
  const stack = parallaxLayers.init(scene, state, null, BELT);
  try {
    const drift = findDriftMesh(stack);
    assert.ok(drift, 'the drift sheet exists');
    const wind = drift.material.userData.spacefaceParallaxDriftWind;
    assert.ok(wind, 'the drift material exposes the wind contract');
    const phase = drift.geometry.getAttribute('aParallaxWindPhase');
    assert.equal(phase.count, drift.count, 'every grain carries its shear phase');
    for (let i = 0; i < phase.count; i++) {
      assert.ok(phase.array[i] >= 0 && phase.array[i] < 1, 'shear phases live in [0,1)');
    }
    const shader = {
      uniforms: {},
      vertexShader: '#include <common>\nvoid main() {\n#include <begin_vertex>\n#include <project_vertex>\n}',
      fragmentShader: 'void main() {}',
    };
    drift.material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.uParallaxWind, wind.uniforms.wind, 'the wind vector uniform binds');
    assert.equal(shader.uniforms.uParallaxWindTime, wind.uniforms.windTime, 'the wind clock uniform binds');
    assert.match(shader.vertexShader, /attribute float aParallaxWindPhase;/);
    assert.match(shader.vertexShader, /uParallaxWind \* \(uParallaxWindTime \* \(0\.6 \+ 0\.8 \* aParallaxWindPhase\)\)/,
      'the wrap subtracts the staggered wind drift');
    assert.match(drift.material.customProgramCacheKey(), /drift-wind-v1/,
      'the drift sheet carries its own wind program key');
    // No other band carries weather: the geology chips stay put.

    // No other band carries weather: the geology chips stay put.
    for (const group of stack.groups) {
      if (group.userData.layer === 'driftSheet') continue;
      const mesh = group.children.find((child) => child && child.isInstancedMesh);
      assert.ok(mesh, 'every band exposes its instanced mesh');
      assert.ok(!mesh.geometry.getAttribute('aParallaxWindPhase'),
        `${group.userData.layer} is geology, not weather — no wind attribute`);
      assert.equal(mesh.material.userData.spacefaceParallaxDriftWind, undefined);
    }
  } finally {
    parallaxLayers.dispose();
  }
});

test('the weather clock advances with flight time, freezes under reduced motion, and hands over with the sky', () => {
  const scene = new THREE.Scene();
  const state = makeState({ particleQuality: 'medium', motionReduce: false }, BELT);
  const stack = parallaxLayers.init(scene, state, null, BELT);
  try {
    const drift = findDriftMesh(stack);
    const wind = drift.material.userData.spacefaceParallaxDriftWind;
    const windX0 = wind.uniforms.wind.value.x;
    parallaxLayers.update(1 / 60);
    const t1 = wind.uniforms.windTime.value;
    assert.ok(t1 > 0, 'the wind clock advances in flight');
    parallaxLayers.update(1 / 60);
    assert.ok(Math.abs(wind.uniforms.windTime.value - 2 * t1) < 1e-9, 'the clock accumulates presentation dt');
    state.settings.video.motionReduce = true;
    parallaxLayers.update(1 / 60);
    assert.equal(wind.uniforms.windTime.value, 2 * t1, 'reduced motion freezes the weather clock');
    state.settings.video.motionReduce = false;

    // Hand the sky to the core: the wind vector eases to the core's own weather.
    state.render.sectorPalette = CORE;
    parallaxLayers.update(1 / 60);
    const coreWind = resolveSectorWind(CORE);
    assert.ok(Math.abs(wind.uniforms.wind.value.x - windX0) > 1e-6, 'the wind vector leaves the belt value');
    for (let i = 0; i < 120; i++) parallaxLayers.update(1 / 60);
    assert.ok(Math.abs(wind.uniforms.wind.value.x - coreWind.dirX * coreWind.speedWuPerS) < 1e-6,
      'after the transition the sheet rides the core wind exactly');
    assert.ok(Math.abs(wind.uniforms.wind.value.y - coreWind.dirZ * coreWind.speedWuPerS) < 1e-6);
  } finally {
    parallaxLayers.dispose();
  }
});
