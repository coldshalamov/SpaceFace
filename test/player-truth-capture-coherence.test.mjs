import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import * as THREE from 'three';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SelectionSigil } from '../src/render/selectionSigil.js';
import { installPlayerTruthReader, isPlayerTruthInstrumentation } from '../src/testing/playerTruth/reader.js';
import { analyzeReadability } from '../scripts/player-truth/readability.mjs';
import { checkReadability, CLS, VIS } from '../scripts/player-truth/checks.mjs';

test('the live target instrument has semantic custody while additive combat effects remain combat', () => {
  const sigil = new SelectionSigil(new THREE.Scene());
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  try {
    assert.equal(isPlayerTruthInstrumentation(sigil.mesh), true);
    assert.equal(isPlayerTruthInstrumentation(contact), false);
    const child = new THREE.Object3D();
    sigil.mesh.add(child);
    assert.equal(isPlayerTruthInstrumentation(child), true);
  } finally {
    sigil.dispose(); contact.geometry.dispose(); contact.material.dispose();
  }
});

test('the reader keeps instrumentation in every split and projects the presented hull pose', () => {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-100, 100, 60, -60, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(5, 5, 5), new THREE.MeshBasicMaterial());
  hull.position.x = 20; scene.add(hull);
  const sigil = new SelectionSigil(scene); sigil.mesh.visible = true;
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  }));
  scene.add(contact); scene.updateMatrixWorld(true);
  const draws = [];
  let target = null; let callback = null;
  const renderer = {
    isWebGLRenderer: true, domElement: { clientWidth: 200, clientHeight: 120 },
    info: { autoReset: true, render: { calls: 0, triangles: 0 } }, shadowMap: { autoUpdate: true },
    getRenderTarget: () => target, setRenderTarget: (next) => { target = next; }, clear() {},
    render() { draws.push({ instrument: sigil.mesh.visible, combat: contact.visible }); },
    readRenderTargetPixels(_target, _x, _y, _w, _h, pixels) { pixels.fill(0); },
  };
  const enemy = { id: 2, type: 'ship', alive: true, radius: 5, team: 3,
    pos: { x: 70, y: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { runRole: 'enemy' } };
  const win = {
    performance: { now: () => 100 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, state: { mode: 'flight', simTime: 1, playerId: 1, entityList: [enemy],
      render: { renderer, scene, camera, meshes: new Map([[2, hull]]) } } },
  };
  const reader = installPlayerTruthReader(win, { pxEvery: 1, vfxEvery: 1 });
  try {
    reader.start(); callback(); reader.stop();
    const sample = reader.drain().samples[0];
    assert.equal(sample.e[0][6], 120, 'rendered x=20 projects to 120; the sim x=70 would project to 170');
    assert.equal(sample.e[0][2], 70, 'physics telemetry retains its authoritative coordinates');
    assert.deepEqual(draws, [
      { instrument: true, combat: true }, { instrument: true, combat: false },
      { instrument: true, combat: true },
    ]);
    assert.equal(sample.px.nI, 1); assert.equal(sample.px.nC, 1);
    assert.equal(sample.vfx.nI, 1);
    assert.equal(sigil.mesh.visible, true); assert.equal(contact.visible, true);
  } finally {
    reader.dispose(); sigil.dispose(); hull.geometry.dispose(); hull.material.dispose();
    contact.geometry.dispose(); contact.material.dispose();
  }
});

function attributionFixture({ extraCandidates = 0, frontVisible = true, unstable = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-100, 100, 60, -60, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1);
  camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const geometry = new THREE.PlaneGeometry(5, 5);
  const material = new THREE.MeshBasicMaterial({
    name: 'FixtureContactMaterial', blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
  });
  const hull = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  scene.add(hull);
  const sigil = new SelectionSigil(scene); sigil.mesh.visible = true;
  const behind = new THREE.Mesh(geometry, material);
  behind.name = 'BehindOpaqueHull'; behind.userData.sfBoundEntityId = 77; scene.add(behind);
  for (let i = 0; i < extraCandidates; i++) {
    const effect = new THREE.Mesh(geometry, material); effect.name = `IrrelevantContact${i}`; scene.add(effect);
  }
  const front = new THREE.Mesh(geometry, material);
  front.name = 'FrontContact'; front.userData.sfBoundEntityId = 99; front.visible = frontVisible; scene.add(front);
  scene.updateMatrixWorld(true);
  const originalTarget = {}; let target = originalTarget; let callback = null;
  const draws = [];
  const renderer = {
    isWebGLRenderer: true, domElement: { clientWidth: 200, clientHeight: 120 },
    info: { autoReset: true, render: { calls: 7, triangles: 99 } }, shadowMap: { autoUpdate: true },
    getRenderTarget: () => target, setRenderTarget: (next) => { target = next; }, clear() {},
    render() {
      draws.push({ front: front.visible, instrument: sigil.mesh.visible, behind: behind.visible });
      renderer.info.render.calls++; renderer.info.render.triangles += 10;
    },
    readRenderTargetPixels(_target, _x, _y, _w, _h, pixels) {
      // Controlled readback: the opaque hull depth-occludes the behind draw. A front contact
      // changes its pixels, while target instrumentation stays present in both counterfactuals.
      const value = front.visible ? (unstable && draws.length >= 4 ? 100 : 200) : 50;
      for (let i = 0; i < pixels.length; i += 4) {
        pixels[i] = value; pixels[i + 1] = value; pixels[i + 2] = value; pixels[i + 3] = 255;
      }
    },
  };
  const enemy = { id: 2, type: 'ship', alive: true, radius: 20, team: 3,
    pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, z: 0 }, data: { runRole: 'enemy' } };
  const win = {
    performance: { now: () => 100 }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, state: { mode: 'flight', simTime: 1, playerId: 1, entityList: [enemy],
      render: { renderer, scene, camera, meshes: new Map([[2, hull]]) } } },
  };
  const reader = installPlayerTruthReader(win, { pxEvery: 1, vfxEvery: 1 });
  return { front, behind, sigil, renderer, originalTarget, draws,
    frame() { reader.start(); callback(); return reader.drain().samples[0]; },
    dispose() { reader.dispose(); sigil.dispose(); geometry.dispose(); material.dispose(); hull.material.dispose(); },
  };
}

test('first-positive attribution finds the front contributor and excludes the behind-hull draw', () => {
  const fixture = attributionFixture();
  try {
    const first = fixture.frame(); const diagnostic = first.px.attribution;
    assert.equal(first.px.ct, 1, 'the original positive threat mask remains graded');
    assert.equal(diagnostic.status, 'contributor-found');
    assert.equal(diagnostic.contributor.name, 'FrontContact');
    assert.equal(diagnostic.contributor.owner, 99);
    assert.equal(diagnostic.contributor.originalMaskFrac, 1);
    assert.equal(diagnostic.candidates[0].name, 'BehindOpaqueHull');
    assert.equal(diagnostic.candidates[0].materials[0].id, fixture.behind.material.uuid);
    assert.equal(diagnostic.candidates.some((c) => c.name === 'sf-selection-sigil'), false);
    assert.ok(diagnostic.extraDraws <= 8);
    const beforeSecond = fixture.draws.length;
    const second = fixture.frame();
    assert.equal(second.px.ct, 1); assert.equal(second.px.attribution, undefined);
    assert.equal(fixture.draws.length - beforeSecond, 3, 'only the ordinary split runs on later frames');
    assert.ok(fixture.draws.every((d) => d.instrument));
    assert.equal(fixture.front.visible, true); assert.equal(fixture.behind.visible, true);
    assert.equal(fixture.renderer.getRenderTarget(), fixture.originalTarget);
    assert.deepEqual(fixture.renderer.info.render, { calls: 7, triangles: 99 });
  } finally { fixture.dispose(); }
});

test('depth-occluded and noncombat draws do not trigger positive attribution', () => {
  const fixture = attributionFixture({ frontVisible: false });
  try {
    const sample = fixture.frame();
    assert.equal(sample.px.ct, 0); assert.equal(sample.px.attribution, undefined);
    assert.equal(fixture.draws.length, 3);
    assert.ok(fixture.draws.every((d) => d.instrument));
  } finally { fixture.dispose(); }
});

test('one-shot attribution reports an unstable baseline instead of blaming a draw', () => {
  const fixture = attributionFixture({ unstable: true });
  try {
    const sample = fixture.frame();
    assert.equal(sample.px.ct, 1);
    assert.equal(sample.px.attribution.status, 'unstable-baseline');
    assert.equal(sample.px.attribution.extraDraws, 1);
    assert.equal(sample.px.attribution.contributor, undefined);
  } finally { fixture.dispose(); }
});

test('many candidates exhaust a strict eight-draw budget without claiming an owner', () => {
  const fixture = attributionFixture({ extraCandidates: 255 });
  try {
    const sample = fixture.frame(); const diagnostic = sample.px.attribution;
    assert.equal(diagnostic.status, 'budget-exhausted');
    assert.equal(diagnostic.extraDraws, 8); assert.equal(fixture.draws.length, 11);
    assert.equal(diagnostic.candidates.length, 64); assert.equal(diagnostic.catalogTruncated, 193);
    assert.equal(diagnostic.contributor, undefined);
    assert.ok(diagnostic.remainingCandidateCount > 1);
    assert.equal(fixture.front.visible, true); assert.equal(fixture.behind.visible, true);
  } finally { fixture.dispose(); }
});

async function captureFixture({ enemyColour = [240, 40, 30], pose = () => ({ x: 40, key: 5 }), bounded = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'spaceface-capture-coherence-'));
  const file = path.join(dir, 'picture.png');
  const W = 200; const H = 120; const raw = Buffer.alloc(W * H * 3);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const colour = Math.hypot(x - 40, y - 60) <= 8 ? enemyColour
      : Math.hypot(x - 135, y - 60) <= 22 ? [40, 70, 170] : [5, 6, 9];
    for (let k = 0; k < 3; k++) raw[(y * W + x) * 3 + k] = colour[k];
  }
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toFile(file);
  const samples = []; const shots = [];
  for (let i = 0; i < 6; i++) {
    const start = i * 1000;
    shots.push({ t: start + 10, ...(bounded ? { endT: start + 190 } : {}), file, play: true });
    for (const offset of [0, 100, 200]) {
      const enemy = pose(offset);
      samples.push({ t: start + offset, vw: W, vh: H, p: null, e: [
        [1, CLS.enemy, 0, 0, 0, 0, enemy.x, 60, 8, VIS.onscreen, enemy.key, 5],
        [2, CLS.asteroid, 0, 0, 0, 0, 135, 60, 22, VIS.onscreen, 7, 1],
      ] });
    }
  }
  const nearest = (t) => samples.reduce((best, s) => Math.abs(s.t - t) < Math.abs(best.t - t) ? s : best);
  try {
    const readability = await analyzeReadability(shots, nearest, samples);
    return { readability, result: checkReadability({ readability }) };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test('coherent captured body colours retain the existing readable result', async () => {
  const { readability, result } = await captureFixture();
  assert.equal(readability.classes.enemy.n, 6);
  assert.equal(readability.classes.asteroid.n, 6);
  assert.equal(readability.captureCoherence.rejected.enemy['capture-motion'], undefined);
  assert.equal(result.status, 'PASS');
});

test('out-and-back capture motion is unmeasured rather than sampled as empty enemy pixels', async () => {
  const { readability, result } = await captureFixture({ pose: (offset) => ({ x: offset === 100 ? 95 : 40, key: 5 }) });
  assert.equal(readability.classes.enemy.n, 0);
  assert.equal(readability.captureCoherence.rejected.enemy['capture-motion'], 6);
  assert.equal(result.status, 'UNKNOWN');
  assert.match(result.detail, /capture-motion/);
});

test('an identity change during capture cannot inherit the previous body colour', async () => {
  const { readability, result } = await captureFixture({ pose: (offset) => ({ x: 40, key: offset ? 9 : 5 }) });
  assert.equal(readability.captureCoherence.rejected.enemy['capture-identity-or-visibility'], 6);
  assert.equal(result.status, 'UNKNOWN');
});

test('historical screenshots without capture intervals are explicitly unmeasured', async () => {
  const { readability, result } = await captureFixture({ bounded: false });
  assert.equal(readability.captureCoherence.unboundedShots, 6);
  assert.equal(result.status, 'UNKNOWN');
  assert.match(result.detail, /6 screenshots lack a recorded capture interval/);
});

test('a coherent but dim enemy still fails unchanged contrast thresholds', async () => {
  const { readability, result } = await captureFixture({ enemyColour: [5, 6, 9] });
  assert.equal(readability.classes.enemy.n, 6);
  assert.equal(readability.classes.enemy.lowContrastFrac, 1);
  assert.equal(result.status, 'FAIL');
});
