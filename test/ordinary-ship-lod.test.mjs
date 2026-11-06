import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { projectedShipDiameterPx, createShipLodState } from '../src/render/lod.js';
import { isOrdinaryLodShip, resolveLiveWholeShipLodTransition } from '../src/render/wholeShipLodPolicy.js';
import { makeEnemySpawnSpec } from '../src/systems/enemySpawnSpec.js';
import { wholeShipVisualForEntity, initialWholeShipLodForBoundary, initialWholeShipLodPublicationSafe,
  authoredPrewarmRequestsForEntities, installWholeShipLodFamilyController, primeAuthoredState } from '../src/render/partsLibrary.js';

function cameraAtOrigin(camera) { camera.position.set(0, 0, 0); camera.lookAt(0, 0, -1); camera.updateMatrixWorld(); camera.updateProjectionMatrix(); return camera; }

test('ship projection uses diameter and conservatively handles off-axis and near-plane spheres', () => {
  const camera = cameraAtOrigin(new THREE.PerspectiveCamera(90, 2, 1, 1000));
  const viewport = { width: 1600, height: 800 };
  const centered = projectedShipDiameterPx({ x: 0, y: 0, z: -100 }, 10, camera, viewport);
  assert.ok(centered >= 80 && centered < 90, String(centered));
  assert.ok(projectedShipDiameterPx({ x: 90, y: 0, z: -100 }, 10, camera, viewport) >= centered);
  assert.equal(projectedShipDiameterPx({ x: 0, y: 0, z: -10 }, 10, camera, viewport), Infinity);
  assert.equal(projectedShipDiameterPx({ x: 0, y: 0, z: -100 }, 10, null, viewport), Infinity);
  const ortho = cameraAtOrigin(new THREE.OrthographicCamera(-100, 100, 50, -50, 1, 1000));
  assert.equal(projectedShipDiameterPx({ x: 0, y: 0, z: -100 }, 10, ortho, viewport), 160);
});

test('ordinary ship policy dwells, uses hysteresis, and immediately restores protected or near hulls', () => {
  const lod = createShipLodState();
  assert.equal(lod.resolve(80, 0), 'lod0');
  assert.equal(lod.resolve(80, 1.4), 'lod0');
  assert.equal(lod.resolve(80, 1.5), 'lod1');
  assert.equal(lod.resolve(120, 2), 'lod1');
  assert.equal(lod.resolve(20, 3), 'lod1');
  assert.equal(lod.resolve(20, 4.5), 'lod2');
  assert.equal(lod.resolve(50, 5), 'lod2');
  assert.equal(lod.resolve(130, 5.1), 'lod0');
  assert.equal(lod.resolve(20, 8), 'lod0');
  assert.equal(lod.resolve(20, 9, true), 'lod0');
  assert.equal(lod.resolve(Infinity, 10), 'lod0');
});

test('only ordinary anonymous hostile ships are eligible and live loads require explicit controller ownership', () => {
  const npc = { type: 'ship', team: 1, data: { defId: 'ship_wasp' } };
  assert.equal(isOrdinaryLodShip(npc), true);
  for (const data of [{ isBoss: true }, { namedAceId: 'a' }, { missionTag: 'x' }, { interactive: true }]) {
    assert.equal(isOrdinaryLodShip({ ...npc, data }), false);
  }
  assert.equal(isOrdinaryLodShip({ ...npc, isPlayer: true }), false);
  assert.equal(isOrdinaryLodShip({ ...npc, team: 2 }), false);
  assert.equal(resolveLiveWholeShipLodTransition('lod0', 'lod1', { allowLoad: true }).action, 'load');
  assert.equal(resolveLiveWholeShipLodTransition('lod0', 'lod1', {}).action, 'keep');
});

test('real combat specs select their exact available visual families', () => {
  const lancer = makeEnemySpawnSpec('lancer_sniper', 2, { x: 0, z: 0 });
  const dart = makeEnemySpawnSpec('wasp_swarmer', 2, { x: 0, z: 0 });
  const waspVisual = wholeShipVisualForEntity(lancer, { requiredWholeShip: true });
  const dartVisual = wholeShipVisualForEntity(dart, { requiredWholeShip: true });
  assert.equal(isOrdinaryLodShip(lancer), true);
  assert.equal(waspVisual.lodFamily.lod1, 'wholeships/wasp_production_v1_lod1.glb');
  assert.equal(dartVisual.file, 'wholeships/ashline_dart.glb');
  assert.equal(dartVisual.lodFamily.lod1, 'wholeships/ashline_dart_lod1.glb');
  assert.equal(dartVisual.lodFamily.lod2, 'wholeships/ashline_dart_lod2.glb');
});

test('first admission and prewarm use a fresh exact-family projection, and reject stale or protected results', () => {
  const entity = makeEnemySpawnSpec('lancer_sniper', 2, { x: 0, z: 0 });
  entity.id = 71;
  const camera = cameraAtOrigin(new THREE.PerspectiveCamera(90, 2, 1, 1000));
  const viewport = { width: 1600, height: 800 };
  const sample = { entity, px: 24, at: 1000, protectedBody: false, camera, viewport,
    width: viewport.width, height: viewport.height, view: camera.matrixWorldInverse.elements.slice(),
    projection: camera.projectionMatrix.elements.slice() };
  const boundary = { userData: { initialShipLodSample: sample } };
  const file = 'wholeships/wasp_production_v1_lod2.glb';
  assert.equal(initialWholeShipLodForBoundary(entity, boundary, 1100), 'lod2');
  assert.equal(initialWholeShipLodPublicationSafe(entity, boundary, 'lod2', file, 1100), true);
  const requests = authoredPrewarmRequestsForEntities([entity], { includeSpawnableArchetypes: false,
    initialLodForEntity: e => initialWholeShipLodForBoundary(e, boundary, 1100) });
  assert.ok(requests.some(r => r.slot === 'hull' && r.url.endsWith(file)));
  assert.equal(initialWholeShipLodForBoundary(entity, boundary, 1251), 'lod0');
  assert.equal(initialWholeShipLodPublicationSafe(entity, boundary, 'lod2', file, 1251), false);
  sample.px = 57;
  assert.equal(initialWholeShipLodPublicationSafe(entity, boundary, 'lod2', file, 1100), false);
  sample.px = Infinity;
  assert.equal(initialWholeShipLodForBoundary(entity, boundary, 1100), 'lod0');
  sample.px = 24;
  sample.protectedBody = true;
  assert.equal(initialWholeShipLodPublicationSafe(entity, boundary, 'lod2', file, 1100), false);
  sample.protectedBody = false;
  assert.equal(initialWholeShipLodForBoundary({ ...entity }, boundary, 1100), 'lod0');
  assert.equal(initialWholeShipLodPublicationSafe(entity, boundary, 'lod2', 'wholeships/other.glb', 1100), false);
  camera.fov = 70; camera.updateProjectionMatrix();
  assert.equal(initialWholeShipLodPublicationSafe(entity, boundary, 'lod2', file, 1100), false);
  entity.data.isBoss = true;
  assert.equal(initialWholeShipLodForBoundary(entity, boundary, 1100), 'lod0');
});

test('first authored tier survives priming and can promote when lod0 was not initially resident', () => {
  const entity = makeEnemySpawnSpec('lancer_sniper', 2, { x: 0, z: 0 });
  const scene = new THREE.Group(), boundary = new THREE.Group(), coarse = new THREE.Group();
  scene.add(boundary); boundary.add(coarse);
  coarse.userData.lod = createShipLodState();
  let primed;
  coarse.userData.updateLod = level => { primed = level; };
  const fallback = new THREE.Group();
  primeAuthoredState(coarse, fallback, entity, 'lod2');
  assert.equal(primed, 'lod2');
  boundary.userData.lod = coarse.userData.lod;
  assert.equal(installWholeShipLodFamilyController(boundary, entity, next => { boundary.userData.lod = next.userData.lod; }, { lodLevel: 'lod2' }), true);
  assert.equal(boundary.userData.wholeShipLodRoots.lod2, coarse);
  boundary.userData.updateLod('lod0'); // missing renderer: current visible body must survive
  assert.equal(boundary.userData.wholeShipLodActiveLevel, 'lod2');
  assert.equal(coarse.parent, boundary);
  const fine = new THREE.Group(); fine.userData.lod = createShipLodState();
  boundary.userData.wholeShipLodRoots.lod0 = fine;
  boundary.userData.updateLod('lod0');
  assert.equal(boundary.userData.wholeShipLodActiveLevel, 'lod0');
  assert.equal(fine.parent, boundary);
  assert.equal(coarse.parent, null);
  // A fresh Dart identity rebinds the existing controller and cannot expose old Wasp roots.
  boundary.remove(fine);
  const replacement = new THREE.Group(); boundary.add(replacement);
  entity.data.lootTableId = 'wasp_swarmer';
  installWholeShipLodFamilyController(boundary, entity, () => {}, { committedAuthored: { root: replacement } });
  assert.equal(boundary.userData.wholeShipLodFamilyInstalled, true);
  assert.equal(boundary.userData.wholeShipLodFamily.lod1, 'wholeships/ashline_dart_lod1.glb');
  assert.equal(boundary.userData.wholeShipLodRoots.lod0, replacement);
  assert.equal(replacement.parent, boundary);
  assert.deepEqual(Object.keys(boundary.userData.wholeShipLodRoots), ['lod0']);
  // An ineligible boss still uninstalls the controller instead of retaining old tiers.
  boundary.remove(replacement);
  const bossRoot = new THREE.Group(); boundary.add(bossRoot);
  entity.data.isBoss = true;
  installWholeShipLodFamilyController(boundary, entity, () => {}, { committedAuthored: { root: bossRoot } });
  assert.equal(boundary.userData.wholeShipLodFamilyInstalled, false);
  assert.equal(boundary.userData.wholeShipLodActiveLevel, null);
  assert.equal(bossRoot.parent, boundary);
  assert.equal(Object.keys(boundary.userData.wholeShipLodRoots).length, 0);
});
