import assert from 'node:assert/strict';
import test from 'node:test';
import { BoxGeometry, Matrix3, Mesh, Vector3 } from 'three';
import { WEAPONS } from '../src/data/weapons.js';
import { createVisualFactory, invalidateVisualFactoryCaches, weaponCoolingFinGeometry } from '../src/render/visualFactory.js';
import { createShipMicroMotionTracker } from '../src/render/shipMicroMotion.js';

function canvasDocument() {
  return {
    createElement() {
      const canvas = { width: 256, height: 256, style: {}, addEventListener() {} };
      const context = new Proxy({
        createImageData(width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
        getImageData(_x, _y, width, height) { return { data: new Uint8ClampedArray(width * height * 4), width, height }; },
        createLinearGradient() { return { addColorStop() {} }; },
        createRadialGradient() { return { addColorStop() {} }; },
        measureText() { return { width: 10 }; },
      }, { get(target, key) { return key in target ? target[key] : () => {}; } });
      canvas.getContext = () => context;
      return canvas;
    },
  };
}

function ship(id, fittings) {
  return { id, type: 'ship', radius: 14, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    team: 0, data: { defId: 'ship_hornet', fittings } };
}

// Compare the indexed triangles as seen in barrel-local coordinates, including the normal and UV
// on every corner. This checks the original box layout, not just the combined bounding box.
function triangleSamples(meshes) {
  const samples = [];
  for (const mesh of meshes) {
    mesh.updateMatrix();
    const normalMatrix = new Matrix3().getNormalMatrix(mesh.matrix);
    const geometry = mesh.geometry;
    const position = geometry.getAttribute('position');
    const normal = geometry.getAttribute('normal');
    const uv = geometry.getAttribute('uv');
    const index = geometry.getIndex();
    for (let i = 0; i < (index ? index.count : position.count); i++) {
      const j = index ? index.getX(i) : i;
      const p = new Vector3().fromBufferAttribute(position, j).applyMatrix4(mesh.matrix);
      const n = new Vector3().fromBufferAttribute(normal, j).applyNormalMatrix(normalMatrix);
      samples.push(p.x, p.y, p.z, n.x, n.y, n.z, uv.getX(j), uv.getY(j));
    }
  }
  return samples;
}

function originalFins(weaponId, beam, count = 3) {
  const tier = WEAPONS.find((weapon) => weapon.id === weaponId)?.tier || 1;
  const scale = 14 * 0.16 * 0.8 * (1 + Math.min(2, tier - 1) * 0.12);
  const geometry = beam ? new BoxGeometry(0.04, 0.14, 0.04) : new BoxGeometry(0.05, 0.03, 0.26);
  const meshes = [];
  for (let i = 0; i < count; i++) {
    for (const sign of beam ? [1] : [1, -1]) {
      const mesh = new Mesh(geometry);
      mesh.position.set((beam ? -0.1 - i * 0.12 : i * 0.14) * scale,
        (beam ? 0.18 : sign * 0.17) * scale, 0);
      mesh.scale.setScalar(scale);
      meshes.push(mesh);
    }
  }
  return meshes;
}

function assertSameTriangles(actual, expected) {
  assert.equal(actual.length, expected.length, 'same triangle and attribute count');
  for (let i = 0; i < actual.length; i++) {
    assert.ok(Math.abs(actual[i] - expected[i]) < 1e-6, `triangle attribute ${i}: ${actual[i]} vs ${expected[i]}`);
  }
}

test('all gun fin patterns retain the original indexed box surfaces and UVs', () => {
  const tier = WEAPONS.find((weapon) => weapon.id === 'wpn_pulse_laser_s').tier || 1;
  const scale = 14 * 0.16 * 0.8 * (1 + Math.min(2, tier - 1) * 0.12);
  for (const count of [3, 4, 5]) {
    const merged = new Mesh(weaponCoolingFinGeometry(false, count));
    merged.scale.setScalar(scale);
    assertSameTriangles(triangleSamples([merged]), triangleSamples(originalFins('wpn_pulse_laser_s', false, count)));
    assert.equal(weaponCoolingFinGeometry(false, count), merged.geometry, 'pattern geometry is shared');
  }
  invalidateVisualFactoryCaches();
});

test('procedural weapon fins retain their boxes and independent animated heat in one mesh', () => {
  const oldDocument = globalThis.document;
  const oldThrow = globalThis.__SF_VISUAL_FACTORY_THROW__;
  globalThis.document = canvasDocument();
  globalThis.__SF_VISUAL_FACTORY_THROW__ = true;
  try {
    const factory = createVisualFactory();
    const entity = ship(1401, ['wpn_pulse_laser_s', 'wpn_flak_turret_s']);
    const otherEntity = ship(1402, ['wpn_pulse_laser_s', 'wpn_beam_laser_m']);
    const root = factory.build(entity);
    const other = factory.build(otherEntity);
    const [gun, turret] = root.userData.weapons;
    const [otherGun, beam] = other.userData.weapons;
    assert.ok(gun && turret && otherGun && beam);
    for (const [weapon, id, beamPattern] of [[gun, 'wpn_pulse_laser_s', false], [beam, 'wpn_beam_laser_m', true]]) {
      const fins = weapon.userData.coolingFins;
      assertSameTriangles(triangleSamples(fins), triangleSamples(originalFins(id, beamPattern)));
      assert.equal(fins.length, 1, 'one fin draw per weapon');
      assert.equal(fins[0].parent, weapon.userData.barrel, 'fins follow the barrel');
    }
    assert.equal(gun.userData.coolingFins[0].geometry, otherGun.userData.coolingFins[0].geometry);
    assert.notEqual(gun.userData.coolingFins[0].material, otherGun.userData.coolingFins[0].material);
    assert.notEqual(gun.userData.coolingFins[0].material, turret.userData.coolingFins[0].material);
    const housing = gun.children.find((child) => child.isMesh);
    const finMaterial = gun.userData.coolingFins[0].material;
    assert.equal(finMaterial.map, housing.material.map);
    assert.equal(finMaterial.roughnessMap, housing.material.roughnessMap);
    assert.equal(finMaterial.normalMap, housing.material.normalMap);
    assert.equal(finMaterial.onBeforeCompile, housing.material.clone().onBeforeCompile);
    const tracker = createShipMicroMotionTracker();
    tracker.updateCraftMicroMotion(entity, root, 1, 0.016);
    tracker.updateCraftMicroMotion(otherEntity, other, 1, 0.016);
    const otherHeatBefore = otherGun.userData.coolingFins[0].material.emissiveIntensity;
    tracker.onFire({ ownerId: entity.id, weaponId: 'railgun_heavy', hardpointIdx: 0 });
    tracker.onFire({ ownerId: entity.id, weaponId: 'railgun_heavy', hardpointIdx: 0 });
    tracker.updateCraftMicroMotion(entity, root, 1.016, 0.016);
    assert.ok(gun.userData.coolingFins[0].material.emissiveIntensity > 0.5);
    assert.equal(otherGun.userData.coolingFins[0].material.emissiveIntensity, otherHeatBefore);
    assert.ok(gun.userData.barrel.position.x < gun.userData.barrelBaseX, 'barrel recoils with the fin attached');
    assert.equal(turret.userData.turretHead, turret.userData.barrel);
    assert.equal(turret.userData.coolingFins[0].parent, turret.userData.turretHead);
    assert.notEqual(turret.userData.turretHead.rotation.y, 0, 'turret head still tracks');
  } finally {
    invalidateVisualFactoryCaches();
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
    if (oldThrow === undefined) delete globalThis.__SF_VISUAL_FACTORY_THROW__;
    else globalThis.__SF_VISUAL_FACTORY_THROW__ = oldThrow;
  }
});
