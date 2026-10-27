import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EnergyBoltPool } from '../src/render/weapons/energyBoltPool.js';
import { installPlayerTruthReader } from '../src/testing/playerTruth/reader.js';

const identity = (id = 8, occupantGeneration = 3) => ({ id, occupantGeneration });
function write(pool, id = 8, occupantGeneration = 3, y = 0) {
  return pool.writeBolt({ entityId: id, occupantGeneration,
    x: 0, y, z: 0, prevX: -1, prevY: y, prevZ: 0, ax: 1, ay: 0, az: 0,
    length: 5, width: 2, intensity: 2, variant: 0, coreR: 1, coreG: 1, coreB: 1,
    sheathR: 1, sheathG: 1, sheathB: 1 });
}

// Controlled raster tests the real reader's mask/owner transaction contract, not native pixels.
// A separate isolated WebGL fixture exercises the authored shader and actual readbacks.
function fixture({ other = false, enemy = false, stale = false, count = 1, drawError = false } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-16, 16, 16, -16, 0.1, 500);
  camera.position.set(0, 100, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);
  const pool = new EnergyBoltPool(scene, { capacity: 20 });
  pool.setCamera(camera, 64); pool.beginFrame();
  for (let i = 0; i < count; i++) write(pool, 8 + i);
  if (other) write(pool, 99);
  pool.commit(); scene.updateMatrixWorld(true);
  const player = { id: 1, type: 'ship', team: 1, pos: { x: -12, z: 0 }, vel: { x: 0, z: 0 } };
  const subjects = Array.from({ length: count }, (_, i) => ({ id: 8 + i,
    occupantGeneration: stale ? 4 : 3, type: enemy ? 'ship' : 'projectile', team: 3,
    radius: 1, data: { runRole: 'enemy' }, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }));
  let target = { original: true }; let callback; let wall = 100; const frames = [];
  const renderer = {
    isWebGLRenderer: true, domElement: { clientWidth: 64, clientHeight: 64 },
    info: { autoReset: true, render: { frame: 0, calls: 5, triangles: 12, points: 2, lines: 1 } },
    shadowMap: { autoUpdate: true },
    getDrawingBufferSize(v) { return v.set(64, 64); },
    getRenderTarget() { return target; }, setRenderTarget(value) { target = value; }, clear() {},
    render() {
      frames.push(++renderer.info.render.frame);
      renderer.info.render.calls++;
      if (drawError && pool.pos.array[0] > 1e9) throw new Error('counterfactual draw failure');
    },
    readRenderTargetPixels(_target, _x, _y, w, h, out) {
      out.fill(0);
      let live = false;
      for (let i = 0; i < pool.mesh.count; i++) live ||= pool.mesh.visible && pool.pos.array[i * 3] < 1e9;
      if (live) for (let y = 28; y <= 36; y++) for (let x = 28; x <= 36; x++) {
        const k = (y * w + x) * 4; out[k] = out[k + 1] = out[k + 2] = 255; out[k + 3] = 255;
      }
    },
  };
  const state = { mode: 'flight', simTime: 1, tick: 60, playerId: 1,
    entityList: [player, ...subjects], render: { camera, scene, renderer, meshes: new Map() } };
  const win = { innerWidth: 64, innerHeight: 64,
    performance: { now: () => wall++, measure() {}, clearMeasures() {} },
    addEventListener() {}, removeEventListener() {},
    requestAnimationFrame(fn) { callback = fn; return 1; }, cancelAnimationFrame() {},
    SF: { THREE, state } };
  const reader = installPlayerTruthReader(win, { pxEvery: 1, vfxEvery: 1, rounds: false });
  return { pool, state, renderer, frames,
    sample() { reader.start(); callback(); reader.stop(); return reader.drain().samples[0]; },
    close() { reader.dispose(); pool.dispose(); } };
}

test('a projectile self body does not obscure itself, while original screen/player masks remain strict', () => {
  const f = fixture();
  try {
    const px = f.sample().px;
    assert.equal(px.ct, 0, 'removing only the exact subject leaves no other covering effect');
    assert.equal(px.ctRaw, 1);
    assert.ok(px.c > 0, 'the original full-screen combat mask still contains the visible body');
    assert.equal(px.projectileBodies.measured, 1);
    assert.equal(px.projectileBodies.rows[0].otherCoverage, 0);
    f.renderer.render();
    assert.equal(new Set(f.frames).size, f.frames.length,
      'Three upload-cache frame generations must never rewind after a counterfactual draw');
  } finally { f.close(); }
});

test('another bolt over a projectile and a bolt over an enemy ship remain occlusion', () => {
  for (const options of [{ other: true }, { enemy: true }]) {
    const f = fixture(options);
    try {
      const px = f.sample().px;
      assert.equal(px.ct, 1);
      assert.equal(px.projectileBodies.measured, options.enemy ? 0 : 1);
    } finally { f.close(); }
  }
});

test('stale and unsupported presented lives retain strict coverage; a fresh publication recovers', () => {
  const f = fixture({ stale: true });
  try {
    const stale = f.sample().px;
    assert.equal(stale.ct, 1); assert.equal(stale.projectileBodies.strictFallback, 1);
    f.pool.beginFrame(); write(f.pool, 8, 4); f.pool.commit();
    assert.equal(f.sample().px.ct, 0);
    f.pool.beginFrame();
    assert.equal(f.sample().px.ct, 1, 'uncommitted presentation cannot certify its previous body');
  } finally { f.close(); }
});

test('counterfactual draws are bounded and draw failure restores the exact presentation and renderer', () => {
  const many = fixture({ count: 13 });
  try {
    const px = many.sample().px;
    assert.equal(px.ct, 1); assert.equal(px.projectileBodies.extraDraws, 12);
    assert.equal(px.projectileBodies.strictFallback, 1);
  } finally { many.close(); }
  const f = fixture({ drawError: true });
  try {
    const pos = f.pool.pos.array.slice(); const prev = f.pool.prev.array.slice();
    const material = f.pool.mesh.material;
    const { frame: oldFrame, ...info } = f.renderer.info.render;
    const target = f.renderer.getRenderTarget();
    const px = f.sample().px;
    assert.equal(px.ct, 1, 'failed diagnostic never discounts original coverage');
    assert.equal(px.projectileBodies.strictFallback, 1);
    assert.deepEqual(f.pool.pos.array, pos); assert.deepEqual(f.pool.prev.array, prev);
    assert.equal(f.pool.mesh.count, 1); assert.equal(f.pool.mesh.visible, true);
    assert.equal(f.pool.mesh.material, material);
    assert.equal(f.renderer.getRenderTarget(), target);
    assert.equal(f.renderer.info.autoReset, true); assert.equal(f.renderer.shadowMap.autoUpdate, true);
    const { frame, ...restoredInfo } = f.renderer.info.render;
    assert.ok(frame > oldFrame, 'internal upload-cache generation remains monotonic');
    assert.deepEqual(restoredInfo, info);
  } finally { f.close(); }
});

test('sorted instance provenance is exact and rejects mixed, recycled, tagged and disposed bodies', async () => {
  const { withProjectileBodyHidden } = await import('../src/render/projectileBodyProvenance.js');
  const scene = new THREE.Scene(); const pool = new EnergyBoltPool(scene, { capacity: 4 });
  const camera = new THREE.PerspectiveCamera(); camera.position.set(0, 100, 0); camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true); pool.setCamera(camera, 64);
  try {
    pool.beginFrame(); write(pool, 8, 3, 50); write(pool, 9, 4, 0); pool.commit();
    assert.equal(pool.entityIds[0], 9, 'actual draw sort changes the written order');
    const before = pool.pos.array.slice(); const order = pool.entityIds.slice();
    assert.equal(withProjectileBodyHidden([pool.mesh], identity(8, 3), () => {
      assert.equal(pool.pos.array[pool.byEntity.get(8) * 3], Math.fround(1e12));
      assert.equal(pool.pos.array[pool.byEntity.get(9) * 3], 0);
      assert.equal(withProjectileBodyHidden([pool.mesh], identity(9, 4), () => assert.fail()), false);
    }), true);
    assert.deepEqual(pool.pos.array, before); assert.deepEqual(pool.entityIds, order);
    assert.equal(withProjectileBodyHidden([pool.mesh], identity(8, 4), () => assert.fail()), false);
    const copied = pool.mesh.clone();
    assert.equal(withProjectileBodyHidden([copied], identity(), () => assert.fail()), false);
    const mixed = new EnergyBoltPool(scene, { capacity: 1 });
    try {
      mixed.beginFrame(); write(mixed); mixed.commit();
      assert.equal(withProjectileBodyHidden([pool.mesh, mixed.mesh], identity(), () => assert.fail()), false);
    } finally { mixed.dispose(); }
    pool.beginFrame(); write(pool, 8, 3); write(pool, 8, 4); pool.commit();
    assert.equal(withProjectileBodyHidden([pool.mesh], identity(8, 4), () => assert.fail()), false);
    pool.beginFrame(); write(pool, 8, 4); pool.commit();
    assert.equal(withProjectileBodyHidden([pool.mesh], identity(), () => assert.fail()), false);
    pool.dispose();
    assert.equal(withProjectileBodyHidden([pool.mesh], identity(8, 4), () => assert.fail()), false);
  } finally { if (!pool._disposed) pool.dispose(); }
});
