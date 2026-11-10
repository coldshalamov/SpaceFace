import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createForgeCrownTracker } from '../src/render/forgeRegentCrown.js';
import { makeEnemySpawnSpec } from '../src/systems/combat.js';

// PQ-133.07 — the wave-30 Forge Regent's rotating plate crown is render-owned presentation:
// it must attach to the boss boundary, visibly rotate, honour pause/accessibility, and release
// with the kill instead of persisting on the wreck.

function bossEntity() {
  return {
    id: 'boss-1', type: 'ship', alive: true, radius: 32,
    pos: { x: 0, y: 0, z: 0 }, rot: 0,
    data: { bossDressing: { kind: 'forge_crown' }, lootTableId: 'forge_regent' },
  };
}

function bossMesh() {
  const mesh = new THREE.Group();
  const hull = new THREE.Group();
  mesh.add(hull);
  mesh.userData.hull = hull;
  return mesh;
}

function crownGroupOf(mesh) {
  const hull = mesh.userData.hull || mesh;
  return hull.children.find((c) => c.name === 'forge_regent_crown') || null;
}

test('spawn spec carries the crown dressing for forge_regent only', () => {
  const regent = makeEnemySpawnSpec('forge_regent', 4, { x: 0, y: 0, z: 0 });
  assert.equal(regent.data.bossDressing && regent.data.bossDressing.kind, 'forge_crown');
  const foreman = makeEnemySpawnSpec('mirrorjaw_foreman', 4, { x: 0, y: 0, z: 0 });
  assert.equal(foreman.data.bossDressing, undefined);
});

test('crown attaches under the hull as real geometry, not a camera card', () => {
  const tracker = createForgeCrownTracker();
  const entity = bossEntity();
  const mesh = bossMesh();
  tracker.updateForgeCrown(entity, mesh, 0, 1 / 60, {});
  const crown = crownGroupOf(mesh);
  assert.ok(crown, 'crown group attached');
  const meshes = [];
  crown.traverse((n) => { if (n.isMesh) meshes.push(n); });
  assert.ok(meshes.length >= 10, `expected plates + ring, got ${meshes.length}`);
  for (const m of meshes) {
    assert.notEqual(m.type, 'Sprite');
    assert.ok(m.geometry && m.geometry.type !== 'PlaneGeometry', 'no flat cards');
    assert.ok(m.geometry.userData.spacefaceSharedAsset, 'shared geo survives boundary disposal');
    assert.equal(m.material.userData.spacefaceSharedAsset, true);
  }
});

test('a non-regent ship never grows a crown', () => {
  const tracker = createForgeCrownTracker();
  const entity = { id: 'e2', type: 'ship', alive: true, radius: 20, data: {} };
  const mesh = bossMesh();
  tracker.updateForgeCrown(entity, mesh, 0, 1 / 60, {});
  assert.equal(crownGroupOf(mesh), null);
});

test('the collar rotates on the nose axis and plates scale in during ignition', () => {
  const tracker = createForgeCrownTracker();
  const entity = bossEntity();
  const mesh = bossMesh();
  tracker.updateForgeCrown(entity, mesh, 0, 1 / 60, {});
  const rec = tracker.peekRecord('boss-1');
  const a0 = rec.spinAngle;
  for (let i = 1; i <= 30; i++) tracker.updateForgeCrown(entity, mesh, i / 60, 1 / 60, {});
  assert.ok(rec.spinAngle > a0, 'spinner advances');
  assert.ok(Math.abs(rec.spinner.rotation.x - rec.spinAngle) < 1e-9);
  // mid-build plates are still growing
  const midScale = rec.plates[0].plate.scale.y;
  assert.ok(midScale > 0, 'plate height growing');
  for (let i = 31; i <= 120; i++) tracker.updateForgeCrown(entity, mesh, i / 60, 1 / 60, {});
  assert.equal(rec.phase, 'spin');
  assert.ok(Math.abs(rec.plates[0].plate.scale.y - rec.plates[0].sy) < 1e-6, 'plate fully grown');
});

test('reduced motion slows the crown and kills the plate bob', () => {
  const tracker = createForgeCrownTracker();
  const entity = bossEntity();
  const mesh = bossMesh();
  for (let i = 0; i <= 120; i++) {
    tracker.updateForgeCrown(entity, mesh, i / 60, 1 / 60, { motionReduce: true });
  }
  const rec = tracker.peekRecord('boss-1');
  // 2 s at reduced rate should be well under the full-rate ~0.55 rad/s
  assert.ok(rec.spinAngle < 0.6, `reduced spin ${rec.spinAngle}`);
  assert.equal(rec.plates[0].plate.position.y, rec.plates[0].baseY, 'no bob under reduced motion');
});

test('kill releases the crown: plates fling outward then detach', () => {
  const tracker = createForgeCrownTracker();
  const entity = bossEntity();
  const mesh = bossMesh();
  for (let i = 0; i <= 120; i++) tracker.updateForgeCrown(entity, mesh, i / 60, 1 / 60, {});
  entity.alive = false;
  tracker.updateForgeCrown(entity, mesh, 2.1, 1 / 60, {});
  const rec = tracker.peekRecord('boss-1');
  assert.equal(rec.phase, 'release');
  tracker.updateForgeCrown(entity, mesh, 2.2, 0.3, {});
  assert.ok(rec.plates[0].plate.position.y > rec.plates[0].baseY, 'plates fling outward');
  for (let i = 0; i < 10; i++) tracker.updateForgeCrown(entity, mesh, 2.5 + i * 0.1, 0.1, {});
  assert.equal(rec.phase, 'done');
  assert.equal(crownGroupOf(mesh), null, 'crown detached after release');
  // a dead boss never re-crowns
  tracker.updateForgeCrown(entity, mesh, 4.0, 1 / 60, {});
  assert.equal(crownGroupOf(mesh), null);
});

test('boundary eviction detaches the crown; a rebuilt mesh re-acquires it', () => {
  const tracker = createForgeCrownTracker();
  const entity = bossEntity();
  const mesh = bossMesh();
  for (let i = 0; i <= 90; i++) tracker.updateForgeCrown(entity, mesh, i / 60, 1 / 60, {});
  tracker.releaseEntityMesh('boss-1');
  assert.equal(crownGroupOf(mesh), null, 'evicted boundary drops the crown');
  const mesh2 = bossMesh();
  tracker.updateForgeCrown(entity, mesh2, 2.0, 1 / 60, {});
  assert.ok(crownGroupOf(mesh2), 'crown re-attaches to the rebuilt boundary');
  const rec = tracker.peekRecord('boss-1');
  assert.equal(rec.phase, 'spin', 'keeps its phase clock instead of replaying ignition');
});

test('prune drops records for entities that left the world', () => {
  const tracker = createForgeCrownTracker();
  const entity = bossEntity();
  const mesh = bossMesh();
  tracker.updateForgeCrown(entity, mesh, 0, 1 / 60, {});
  assert.ok(tracker.peekRecord('boss-1'));
  tracker.prune(new Set(['someone-else']));
  assert.equal(tracker.peekRecord('boss-1'), null);
  assert.equal(crownGroupOf(mesh), null);
});
