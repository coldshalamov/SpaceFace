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
