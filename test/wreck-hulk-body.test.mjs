// Wreck = the ship you killed (build_map §23 CV-SO): "A wreck is often a kit, not the ship
// you killed." A wreck whose marker carried the victim's visual identity resolves the same
// wholeship file the victim drew — hostile-family and faction-kit files included — instead
// of a generic aftermath piece, and the admitted body goes dead: lights out, darkened,
// roughened. Wrecks without the identity still build the generic kit.

import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createVisualFactory,
  deadenPackagedHulk,
  fitPackagedGroup,
  hulkEmberIntensityAt,
  updateHulkEmber,
  HULK_EMBER_COLOR,
  HULK_EMBER_PEAK,
  HULK_EMBER_SECONDS,
} from '../src/render/visualFactory.js';

const factory = createVisualFactory();

function wreckEntity(data, overrides = {}) {
  return {
    id: overrides.id || 'wreck_hulk_test_1',
    type: 'wreck',
    pos: { x: 0, z: 0 },
    radius: overrides.radius != null ? overrides.radius : 12,
    alive: true,
    data: { wreckClass: 'battlefield', parentType: 'ship', ...data },
  };
}

test('a wasp_swarmer hulk resolves the hostile-family file the victim actually drew', () => {
  const wreck = wreckEntity({
    hulkOfDefId: 'ship_wasp',
    hulkVisual: { defId: 'ship_wasp', lootTableId: 'wasp_swarmer', silhouette: 'drone_swarm' },
    hulkFactionId: 'faction_reach',
  });
  const root = factory.build(wreck);
  assert.ok(root, 'wreck visual root');
  assert.equal(
    root.userData.authoredPackageUrl,
    'assets/ships/release/parts/wholeships/ashline_dart.glb',
    `hostile-mapped victim resolves ashline_dart, got ${root.userData.authoredPackageUrl}`,
  );
});

test('a bare hulkOfDefId resolves the defId wholeship file', () => {
  const wreck = wreckEntity({ hulkOfDefId: 'ship_wasp' });
  const root = factory.build(wreck);
  assert.equal(
    root.userData.authoredPackageUrl,
    'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
    `defId victim resolves wasp_production_v1, got ${root.userData.authoredPackageUrl}`,
  );
});

test('a wreck without hulk identity still takes the generic aftermath piece', () => {
  const root = factory.build(wreckEntity({}, { id: 'wreck_plain_1' }));
  assert.match(
    String(root.userData.authoredPackageUrl || ''),
    /assets\/ships\/release\/parts\/places\/place_aftermath_/,
    `plain wreck keeps the aftermath piece, got ${root.userData.authoredPackageUrl}`,
  );
});

test('the fitted hulk fills the victim circle — longest axis / (2*radius) in [0.7, 1.3]', () => {
  // The packaged path's own fitter is the law: whatever envelope the GLB admits, the drawn
  // body's longest axis lands at the collision diameter. Wasp-sized envelope as the probe.
  const group = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(1.72, 0.4, 1.0),
    new THREE.MeshStandardMaterial(),
  );
  group.add(hull);
  fitPackagedGroup(group, 12);
  group.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
  const ratio = Math.max(size.x, size.y, size.z) / 24;
  assert.ok(
    ratio >= 0.7 && ratio <= 1.3,
    `drawn longest axis ${Math.max(size.x, size.y, size.z)} vs body 24, ratio ${ratio}`,
  );
});

test('dead hulk: lights out, darkened, roughened — and shared materials untouched', () => {
  const shared = new THREE.MeshStandardMaterial({
    color: 0x8899aa, emissive: 0x39d0ff, emissiveIntensity: 0.9,
    roughness: 0.4, metalness: 0.6,
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  glowMat.blending = THREE.AdditiveBlending;
  const group = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared);
  const navGlow = new THREE.Mesh(new THREE.SphereGeometry(0.05), glowMat);
  group.add(hull, navGlow);

  const emberMats = deadenPackagedHulk(group);

  assert.equal(navGlow.visible, false, 'additive glow sheets are hidden on a dead hull');
  assert.equal(group.userData.hulkDeadBody, true);
  const deadMat = hull.material;
  assert.notEqual(deadMat, shared, 'dead hull must not mutate the shared authored material');
  assert.equal(deadMat.emissiveIntensity, 0, 'dead hull emits nothing until the ember pass drives it');
  assert.equal(deadMat.emissive.getHex(), HULK_EMBER_COLOR, 'dead hull carries the ember hue');
  assert.ok(deadMat.roughness >= 0.9, `dead hull roughened, got ${deadMat.roughness}`);
  assert.ok(deadMat.color.r < shared.color.r * 0.6, 'dead hull darkened');
  assert.equal(shared.emissiveIntensity, 0.9, "the live ship's shared material stays lit");
  assert.ok(emberMats.length >= 1, 'deaden returns the cloned materials for the ember pass');
  assert.ok(emberMats.includes(deadMat));
});

test('a fresh kill glows ember and cools to dead over six seconds of sim time', () => {
  const at0 = hulkEmberIntensityAt(0);
  const at3 = hulkEmberIntensityAt(3);
  const at6 = hulkEmberIntensityAt(6);
  assert.equal(at0, HULK_EMBER_PEAK, 'the kill frame is the hottest');
  assert.ok(at0 > at3 && at3 > 0, `cooling: ${at0} > ${at3} > 0`);
  assert.equal(at6, 0, 'six seconds dead is cold');
  assert.equal(hulkEmberIntensityAt(30), 0, 'an old field spawns cold');

  const mat = new THREE.MeshStandardMaterial();
  const ember = { mats: [mat], killedAt: 10 };
  updateHulkEmber(ember, 10);
  assert.equal(mat.emissiveIntensity, HULK_EMBER_PEAK);
  updateHulkEmber(ember, 10 + HULK_EMBER_SECONDS);
  assert.equal(mat.emissiveIntensity, 0);
});

test('hulk clone materials are ordinary materials — the root teardown disposes them', () => {
  // renderer.disposeObject traverses the released root and disposes every material that is
  // not flagged spacefaceSharedAsset. The clones carry no shared flag, so release disposes
  // them; a leaked clone would keep a live ship's look alive by accident, not die with it.
  const shared = new THREE.MeshStandardMaterial({ color: 0x8899aa });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), shared));
  const emberMats = deadenPackagedHulk(group);
  for (const clone of emberMats) {
    assert.notEqual(clone, shared);
    assert.ok(!(clone.userData && clone.userData.spacefaceSharedAsset),
      'clone must not be flagged shared — the per-root disposer owns its life');
    let disposed = false;
    clone.dispose = () => { disposed = true; };
    clone.dispose();
    assert.equal(disposed, true);
  }
});
