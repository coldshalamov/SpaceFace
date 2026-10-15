import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';
import { rebuildDeepFieldStars } from '../src/render/deepFieldStars.js';
import { checkBackdrop } from '../scripts/player-truth/checks.mjs';

function fixture({ width = 200, height = 120, cssWidth = 200, cssHeight = 120,
  perspective = false, enemies = 1, projectiles = [], paint = () => {} } = {}) {
  const scene = new THREE.Scene();
  const camera = perspective ? new THREE.PerspectiveCamera(50, cssWidth / cssHeight, 0.1, 20000)
    : new THREE.OrthographicCamera(-100, 100, 60, -60, 0.1, 500);
  camera.position.set(0, perspective ? 125 : 100, perspective ? -72 : 0);
  if (!perspective) camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld(true);
  const geometry = new THREE.BoxGeometry(1, 1, 1); const material = new THREE.MeshBasicMaterial();
  const actors = []; const meshes = new Map();
  for (let i = 0; i < enemies; i++) {
    const actor = { id: i + 2, type: 'ship', alive: true, radius: 4.5, team: 3,
      pos: { x: enemies === 1 ? 0 : -80 + (i % 5) * 40, y: 0, z: i < 5 ? 0 : 30 },
      vel: { x: 0, z: 0 }, data: { runRole: 'enemy' } };
    const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(actor.pos);
    scene.add(mesh); actors.push(actor); meshes.set(actor.id, mesh);
  }
  for (let i = 0; i < projectiles.length; i++) {
    const actor = { id: enemies + i + 2, type: 'projectile', alive: true, radius: 4.5,
      pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { kind: 'bolt' },
      ...projectiles[i] };
    const mesh = new THREE.Mesh(geometry, material); mesh.position.copy(actor.pos);
    scene.add(mesh); actors.push(actor); meshes.set(actor.id, mesh);
  }
  const sky = new THREE.Points(new THREE.BufferGeometry(), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sky.name = 'DeepField_resolution-fixture'; scene.add(sky);
  const combat = new THREE.Points(new THREE.BufferGeometry(), sky.material.clone()); scene.add(combat);
  const instrument = new THREE.Points(new THREE.BufferGeometry(), sky.material.clone());
  instrument.userData.presentationRole = 'target-instrument'; scene.add(instrument);
  scene.updateMatrixWorld(true);
  const nativeSize = new THREE.Vector2(width, height);
  const originalTarget = {}; let target = originalTarget; let callback; let tick = 0;
  const draws = []; const reads = []; const beforeDraw = [];
  let throwDraw = -1;
  const renderer = {
    isWebGLRenderer: true, domElement: { clientWidth: cssWidth, clientHeight: cssHeight, width, height },
    info: { autoReset: true, render: { calls: 7, triangles: 99 } }, shadowMap: { autoUpdate: true },
    getDrawingBufferSize(out) { return out.copy(nativeSize); },
    getRenderTarget() { return target; }, setRenderTarget(next) { target = next; }, clear() {},
    render(_scene, cam) {
      for (const run of beforeDraw) run(renderer, scene, cam);
      draws.push({ target, width: target.width, height: target.height,
        sky: sky.visible, combat: combat.visible, instrument: instrument.visible });
      renderer.info.render.calls++; renderer.info.render.triangles += 10;
      if (draws.length === throwDraw) throw new Error('controlled readback draw failure');
    },
    readRenderTargetPixels(rt, x, y, w, h, pixels) {
      assert.equal(x, 0); assert.equal(y, 0);
      assert.equal(w, rt.width); assert.equal(h, rt.height); assert.equal(pixels.length, w * h * 4);
      reads.push({ target: rt, width: w, height: h, pixels });
      pixels.fill(0); paint({ pixels, width: w, height: h, sky, combat, tick });
    },
  };
  const win = {
    performance: { now: () => 100 + tick * 1000 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, state: { mode: 'flight', simTime: 1, playerId: 1, entityList: actors,
      render: { renderer, scene, camera, meshes } } },
  };
  const reader = installPlayerTruthReader(win, { pxEvery: 1, vfxEvery: 1000 });
  return { scene, camera, renderer, nativeSize, originalTarget, draws, reads, beforeDraw, reader, state: win.SF.state,
    sky, combat, instrument,
    frame() { tick++; reader.start(); callback(); reader.stop(); return reader.drain().samples[0]; },
    failOnDraw(n) { throwDraw = n; },
    dispose() {
      reader.dispose(); geometry.dispose(); material.dispose();
      for (const object of [sky, combat, instrument]) { object.geometry.dispose(); object.material.dispose(); }
    },
  };
}

test('preparation keeps scalar state without staging-model draws, census scans or GPU readbacks', () => {
  const f = fixture();
  try {
    for (const mode of ['menu', 'loading']) {
      f.state.mode = mode;
      const sample = f.frame();
      assert.equal(sample.mode, mode);
      assert.deepEqual(sample.e, [], 'known preparation modes do not retain an entity census');
      assert.equal(sample.px, undefined);
      assert.equal(sample.vfx, null);
      assert.equal(f.draws.length, 0);
      assert.equal(f.reads.length, 0);
    }
    f.state.mode = 'flight';
    assert.ok(f.frame().px, 'flight still receives the binding native pixel measurements');
    assert.ok(f.reads.length > 0);
  } finally { f.dispose(); }
});

function setPixel(pixels, width, height, x, y, value) {
  const offset = ((height - 1 - y) * width + x) * 4;
  pixels[offset] = value; pixels[offset + 1] = value; pixels[offset + 2] = value;
  pixels[offset + 3] = 255;
}

test('counterfactual targets retain the live stellar shader pixel scale at native DPR', () => {
  const f = fixture({ width: 1280, height: 720, cssWidth: 640, cssHeight: 360, perspective: true,
    paint({ pixels, width, height, sky }) {
      if (!sky.visible) return;
      // Conservative integer footprint of the actual stellar shader's 4.5 px ceiling.
      // This remains five native pixels across, including in an offscreen draw.
      for (let y = height / 2 - 2; y <= height / 2 + 2; y++) {
        for (let x = width / 2 - 2; x <= width / 2 + 2; x++) setPixel(pixels, width, height, x, y, 20);
      }
    } });
  const background = { camera: f.camera, renderer: f.renderer, group: new THREE.Group(), seed: 47,
    bgY: -264, H: 120, state: { world: { frameOrigin: { x: 0, z: 0 } } }, bgTime: 0,
    tierName: 'high', lowTier: false, deepFieldRecipe: { id: 'helios_orbital_void' } };
  const record = rebuildDeepFieldStars(background); f.scene.add(background.group);
  const shaderRasterHeights = [];
  f.beforeDraw.push((renderer, scene, camera) => {
    record.points.onBeforeRender(renderer, scene, camera);
    shaderRasterHeights.push(record.points.material.uniforms.uPixelScale.value
      / (camera.projectionMatrix.elements[5] * 0.5));
  });
  try {
    const sample = f.frame();
    assert.equal(sample.px.rw, 1280); assert.equal(sample.px.rh, 720);
    assert.equal(sample.px.bt, 0, 'a tiny native star cannot cover half of the threat region');
    assert.ok(shaderRasterHeights.every((h) => Math.abs(h - 720) < 1e-8));
    assert.ok(f.draws.every((d) => d.height === 720 && d.width === 1280));
    // A point's 4.5 px shader ceiling has the same fraction of the probe and live picture.
    // The previous 90 px raster inflated that footprint by exactly eight times.
    assert.equal(4.5 / f.draws[0].height, 4.5 / shaderRasterHeights[0]);
    assert.equal((4.5 / 90) / (4.5 / 720), 8);
    assert.ok(f.draws.every((d) => d.instrument));
    assert.equal(f.renderer.getRenderTarget(), f.originalTarget);
  } finally {
    f.dispose(); record.points.geometry.dispose(); record.points.material.dispose();
    record.paint.geometry.dispose(); record.paint.material.dispose();
  }
});

test('native buffers and target are reused, resized in place, cleared and disposed', () => {
  const f = fixture({ width: 400, height: 240, paint({ pixels, sky, tick }) {
    if (sky.visible && tick === 1) pixels.fill(20);
  } });
  let disposals = 0;
  try {
    assert.equal(f.frame().px.bt, 1);
    const target = f.reads[0].target; target.addEventListener('dispose', () => disposals++);
    const firstBuffers = f.reads.slice(0, 3).map((r) => r.pixels);
    assert.equal(f.frame().px.bt, 0, 'reused masks cannot retain the prior bright sky');
    f.reads.slice(3, 6).forEach((r, i) => assert.equal(r.pixels, firstBuffers[i]));
    assert.equal(disposals, 0);
    f.nativeSize.set(600, 360);
    const resized = f.frame(); assert.equal(resized.px.rw, 600); assert.equal(resized.px.rh, 360);
    f.reads.slice(6, 9).forEach((r, i) => {
      assert.equal(r.target, target); assert.notEqual(r.pixels, firstBuffers[i]);
      assert.equal(r.pixels.length, 600 * 360 * 4);
    });
    assert.equal(disposals, 1, 'setSize retires the old target attachment');
    f.dispose(); assert.equal(disposals, 2, 'observer teardown releases the live target');
  } finally { if (disposals < 2) f.dispose(); }
});

test('CSS threat rectangles map to the native raster, including DPR and bottom-up readback', () => {
  const f = fixture({ width: 400, height: 240, paint({ pixels, width, height, sky }) {
    if (!sky.visible) return;
    // CSS box [95.5,55.5,104.5,64.5] becomes native [191,111,209,129].
    for (let y = 111; y <= 129; y++) for (let x = 191; x <= 209; x++) setPixel(pixels, width, height, x, y, 20);
  } });
  try {
    const sample = f.frame(); assert.equal(sample.e[0][6], 100); assert.equal(sample.e[0][7], 60);
    assert.equal(sample.e[0][8], 4.5); assert.equal(sample.px.bt, 1);
    assert.equal(sample.px.b, +(361 / (400 * 240)).toFixed(3));
  } finally { f.dispose(); }
});

test('friendly shot luminosity stays in coverage without becoming a threat to its own player', () => {
  for (const projectile of [{ team: 1, ownerId: 1 }, { team: 1, ownerId: 8 }, { ownerId: 1 }]) {
    const f = fixture({ enemies: 0, projectiles: [projectile],
      paint({ pixels, combat }) { if (combat.visible) pixels.fill(40); } });
    try {
      const sample = f.frame();
      assert.equal(sample.px.c, 1, 'the full combat coverage still includes luminous shots');
      assert.equal(sample.px.ct, null, 'friendly shots cannot hide themselves as hostile threats');
      assert.equal(sample.e[0][1], 3, 'projectile readability census remains intact');
      assert.equal(sample.px.attribution, undefined);
    } finally { f.dispose(); }
  }
});

test('hostile and unknown projectile bodies retain external combat-occlusion grading', () => {
  for (const projectile of [{ team: 3, ownerId: 8 }, { ownerId: 8 }, {}]) {
    const f = fixture({ enemies: 0, projectiles: [projectile],
      paint({ pixels, combat }) { if (combat.visible) pixels.fill(40); } });
    try {
      assert.equal(f.frame().px.ct, 1, 'an actual or unclassified threat cannot borrow friendly exclusion');
    } finally { f.dispose(); }
  }
});

test('draw failure restores target, visibility, instrumentation and renderer bookkeeping', () => {
  const f = fixture(); f.failOnDraw(3);
  try {
    assert.match(f.frame().px.err, /controlled readback draw failure/);
    assert.equal(f.renderer.getRenderTarget(), f.originalTarget);
    assert.equal(f.renderer.info.autoReset, true); assert.equal(f.renderer.shadowMap.autoUpdate, true);
    assert.deepEqual(f.renderer.info.render, { calls: 7, triangles: 99 });
    assert.equal(f.sky.visible, true); assert.equal(f.combat.visible, true); assert.equal(f.instrument.visible, true);
  } finally { f.dispose(); }
});

test('native masks retain the ten-luminance and fifty-percent threat coverage boundaries', () => {
  for (const [luminance, coveredPixels, expected] of [[9, 100, 0], [11, 100, 1], [20, 49, 0], [20, 50, 1]]) {
    const f = fixture({ paint({ pixels, width, height, sky }) {
      if (!sky.visible) return;
      for (let k = 0; k < coveredPixels; k++) setPixel(pixels, width, height, 95 + k % 10, 55 + Math.floor(k / 10), luminance);
    } });
    try { assert.equal(f.frame().px.bt, expected, `delta=${luminance}, box pixels=${coveredPixels}/100`); }
    finally { f.dispose(); }
  }
});

test('real bright threat coverage still fails the unchanged thirty-percent p95 gate', () => {
  for (const [brightEnemies, expected] of [[3, 'PASS'], [4, 'FAIL']]) {
    const f = fixture({ enemies: 10, paint({ pixels, width, height, sky }) {
      if (!sky.visible) return;
      for (let i = 0; i < brightEnemies; i++) {
        for (let y = 55; y <= 64; y++) for (let x = 15 + i * 40; x <= 24 + i * 40; x++) {
          setPixel(pixels, width, height, x, y, 20);
        }
      }
    } });
    try {
      const samples = Array.from({ length: 5 }, () => f.frame());
      assert.equal(samples[0].px.bt, brightEnemies / 10);
      assert.equal(checkBackdrop({ samples }).status, expected);
    } finally { f.dispose(); }
  }
});
