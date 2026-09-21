import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOMB_DRIFT } from '../src/data/bombs.js';
import { BombPresentationBatch, updateBombPresentation, releaseBombPresentation, bombPresentationStats, BOMB_PRESENTATION_MAX_VERTICES, createBombTelegraphMaterial, createBombPresentationPrecompileMesh } from '../src/render/bombPresentation.js';
function entity(id = 1, kind = 'bomb_singularity') {
  return { id, alive: true, type: 'bomb', pos: { x: 1000, z: 2000 }, prevPos: { x: 1000, z: 2000 },
    vel: { x: 80, z: 0 }, data: { bombId: kind, phase: 'field', fieldStartedAt: 0, fieldEndsAt: 5, spawnedAt: 0, armed: true } };
}
function world(list = []) { return { mode: 'flight', simTime: 1, entityList: list,
  world: { frameOrigin: { x: 1000, z: 2000 } }, settings: { video: {} }, render: { scene: new THREE.Scene() } }; }
test('presentation is lazy, shares one mesh, and disposes on route and scene changes', () => {
  const s = world(); updateBombPresentation(s); assert.equal(s.render.scene.children.length, 0);
  s.entityList.push(entity()); updateBombPresentation(s);
  assert.equal(s.render.scene.children.length, 1); assert.equal(bombPresentationStats(s).drawCalls, 1);
  const scene = s.render.scene; s.render.scene = new THREE.Scene(); updateBombPresentation(s);
  assert.equal(scene.children.length, 0); assert.equal(s.render.scene.children.length, 1);
  s.mode = 'menu'; updateBombPresentation(s); assert.equal(s.render.scene.children.length, 0);
  assert.equal(bombPresentationStats(s).vertices, 0); releaseBombPresentation(s);
});
test('field geometry is bounded, finite and stable in memory under maximum occupancy', () => {
  const entities = Array.from({ length: 30 }, (_, i) => entity(i)); const s = world(entities);
  const batch = new BombPresentationBatch(s.render.scene), positions = batch.positions, colors = batch.colors;
  batch.update(s, entities, 1);
  assert.equal(batch.stats.bombs, BOMB_DRIFT.maxWorldActive); assert.equal(batch.stats.overflow, 6);
  assert.ok(batch.count <= BOMB_PRESENTATION_MAX_VERTICES);
  assert.equal(batch.count % 3, 0); assert.equal(batch.stats.drawCalls, 1);
  for (const n of positions) assert.ok(Number.isFinite(n));
  for (let i = 3; i < colors.length; i += 4) assert.ok(colors[i] >= 0 && colors[i] <= 1);
  for (let i = 0; i < 120; i++) { s.simTime = 1 + i / 1200; batch.update(s, entities, 0.5); }
  assert.equal(batch.positions, positions); assert.equal(batch.colors, colors);
  assert.equal(batch.normals.length, BOMB_PRESENTATION_MAX_VERTICES * 3);
  for (const e of entities) e.alive = false; batch.update(s, entities, 1);
  assert.equal(batch.count, 0); assert.equal(batch.mesh.visible, false); batch.dispose(); batch.dispose();
});
test('telegraphs occupy volume and gravity/tar are distinct structures', () => {
  const pull = entity(1, 'bomb_singularity'), tar = entity(2, 'bomb_goo');
  const s = world([pull]);
  const b = new BombPresentationBatch(s.render.scene);
  b.update(s, [pull], 1);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < b.count * 3; i += 3) {
    minY = Math.min(minY, b.positions[i]); maxY = Math.max(maxY, b.positions[i]);
  }
  assert.ok(maxY - minY > 2, 'gravity well has vertical structure, not a floor overlay');
  const pullCount = b.count;
  b.update(world([tar]), [tar], 1);
  minY = Infinity; maxY = -Infinity;
  for (let i = 1; i < b.count * 3; i += 3) {
    minY = Math.min(minY, b.positions[i]); maxY = Math.max(maxY, b.positions[i]);
  }
  assert.ok(maxY - minY > 1.2, 'tar cloud piles above the plane');
  assert.ok(b.count !== pullCount, 'pull and tar do not share one CAD motif');
  assert.equal(b.mesh.material.name, 'BombTelegraphGeometry');
  assert.equal(b.mesh.material.type, 'MeshStandardMaterial');
  b.dispose();
});
test('cook warmup uses the live telegraph program recipe', () => {
  const live = createBombTelegraphMaterial();
  const mesh = createBombPresentationPrecompileMesh();
  assert.equal(mesh.userData.precompileRetainedPipeline, 'bomb-telegraph');
  assert.equal(mesh.material.name, live.name);
  assert.equal(mesh.material.type, live.type);
  assert.equal(mesh.material.vertexColors, true);
  assert.equal(mesh.material.transparent, true);
  assert.equal(mesh.material.depthWrite, false);
  assert.equal(mesh.material.side, live.side);
  assert.equal(mesh.material.roughness, live.roughness);
  assert.equal(mesh.material.metalness, live.metalness);
  live.dispose(); mesh.geometry.dispose(); mesh.material.dispose();
});
test('moving fields follow interpolation and floating origin without writing simulation state', () => {
  const e = entity(), s = world([e]); e.pos.x += 20;
  const before = JSON.stringify(e); const b = new BombPresentationBatch(s.render.scene);
  b.update(s, [e], 0); const initialX = b.positions[0];
  b.update(s, [e], 0.5); assert.ok(Math.abs(b.positions[0] - initialX - 10) < 0.001);
  s.world.frameOrigin.x += 200; b.update(s, [e], 0.5);
  assert.ok(Math.abs(b.positions[0] - initialX + 190) < 0.001);
  assert.equal(JSON.stringify(e), before); b.dispose();
});
test('reduced motion freezes travelling marks and reduced flash keeps the same danger extent', () => {
  const e = entity(1, 'bomb_goo'), s = world([e]); s.settings.video.motionReduce = true;
  const b = new BombPresentationBatch(s.render.scene); b.update(s, [e], 1);
  const p = b.positions.slice(0, b.count * 3), c = b.colors.slice(0, b.count * 4);
  s.simTime += 0.2; b.update(s, [e], 1); assert.deepEqual(b.positions.slice(0, b.count * 3), p);
  assert.deepEqual(b.colors.slice(0, b.count * 4), c);
  s.settings.video.motionReduce = false; b.update(s, [e], 1);
  const full = b.colors[0]; s.settings.video.flashReduce = true; b.update(s, [e], 1);
  assert.ok(b.colors[0] < full); assert.ok(b.count > 0); b.dispose();
});
test('offscreen field bounds are culled before geometry is emitted', () => {
  const e = entity(), s = world([e]); const camera = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.1, 2000);
  camera.position.set(0, 500, 0); camera.up.set(0, 0, -1); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); s.render.camera = camera;
  const b = new BombPresentationBatch(s.render.scene); b.update(s, [e], 1); assert.ok(b.count > 0);
  e.pos.x += 10000; e.prevPos.x += 10000; b.update(s, [e], 1); assert.equal(b.count, 0); b.dispose();
});
