import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { installVisualOverrides } from '../src/render/visualOverrides.js';

function factory() {
  return installVisualOverrides({ build() {
    const root = new THREE.Group();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
    return root;
  } }, { releaseMode: true });
}

for (const [type, data, file, radius] of [
  ['payload', { distressBeacon: true }, 'place_47a_rescue_capsule.glb', 6],
  ['payload', { rescuePriority: true }, 'place_47a_rescue_capsule.glb', 6],
  ['beacon', { rescueExit: true }, 'place_lane_beacon.glb', 60],
]) {
  test(`opening ${type} ${Object.keys(data)[0]} admits existing rescue hardware`, async () => {
    const entity = { id: 43, type, alive: true, radius, data };
    const original = structuredClone(entity);
    const root = factory().build(entity);
    assert.equal(root.children[0].visible, false);
    assert.equal(root.userData.authoredPackageUrl, `assets/ships/release/parts/places/${file}`);
    const scene = new THREE.Scene();
    scene.add(root);
    const loaded = [];
    assert.equal(await root.userData.requestAuthoredUpgrade({}, scene, {
      loadAuthoredPart: async (url, options) => {
        loaded.push({ url, slot: options.slot });
        return { assetId: file, primitives: [{
          geometry: new THREE.BoxGeometry(10, 4, 6), material: new THREE.MeshStandardMaterial(),
          matrix: new THREE.Matrix4(), name: 'LOD0_Hardware', tags: { lod: 'lod0' },
        }] };
      },
    }), true);
    assert.equal(loaded[0].slot, 'place');
    assert.equal(root.userData.authoredAssetState, 'authored');
    const body = root.children.find(child => child.userData.scenarioPackagedBody);
    const size = new THREE.Box3().setFromObject(body).getSize(new THREE.Vector3());
    assert.ok(size.length() > 0);
    assert.ok(Math.max(size.x, size.y, size.z) <= 28.001,
      'the arrival zone radius must not become a giant beacon model');
    assert.deepEqual(entity, original, 'presentation preserves rescue gameplay data and radius');
  });
}

test('explicit rescue package wins over the opening rescue default', () => {
  const root = factory().build({ id: 9, type: 'beacon', alive: true, radius: 60,
    data: { rescueExit: true, packagedPropFile: 'places/place_whistle.glb' } });
  assert.equal(root.userData.authoredPackageUrl, 'assets/ships/release/parts/places/place_whistle.glb');
});
