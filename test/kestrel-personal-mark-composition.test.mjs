import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';

import { buildComposedShip } from '../src/render/partsLibrary.js';

test('published Kestrel LOD0 identifies the isolated marking used by composition', () => {
  for (const root of ['assets/ships/parts/wholeships', 'assets/ships/release/parts/wholeships']) {
    for (const [file, expected] of [['kestrel.glb', 1], ['kestrel_lod1.glb', 0], ['kestrel_lod2.glb', 0]]) {
      const bytes = readFileSync(new URL(`../${root}/${file}`, import.meta.url));
      const gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString('utf8'));
      const ivory = gltf.nodes.filter((node) => node.mesh != null && node.name === 'LOD0_Armor_ivory');
      assert.equal(ivory.length, expected, `${root}/${file}`);
      const ivoryUsers = gltf.nodes.filter((node) => node.mesh != null
        && gltf.meshes[node.mesh].primitives.some((primitive) => gltf.materials[primitive.material]?.name === 'Material_Armor_ivory'));
      assert.deepEqual(ivoryUsers.map((node) => node.name), ivory.map((node) => node.name),
        'the mark material cannot be merged with unrelated geometry');
      if (!ivory.length) continue;
      const materials = gltf.meshes[ivory[0].mesh].primitives.map((primitive) => gltf.materials[primitive.material].name);
      assert.deepEqual(materials, ['Material_Armor_ivory']);
    }
  }
  const pkg = JSON.parse(readFileSync(new URL('../assets/ships/release/render-packages/kestrel/render-package.json', import.meta.url)));
  assert.ok(pkg.nodes.some((node) => node.nodeName === 'LOD0_Armor_ivory'));
});

function fixture(packageRoute) {
  const hullMaterial = new THREE.MeshStandardMaterial({ color: 0x606a78 });
  hullMaterial.name = 'Material_Hull';
  const markMaterial = new THREE.MeshStandardMaterial({ color: 0xf5e2b0 });
  markMaterial.name = 'Material_Armor_ivory';
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 1), hullMaterial);
  hull.name = 'LOD0_Hull';
  const mark = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.01, 0.3), markMaterial);
  mark.name = 'LOD0_Armor_ivory';
  const sources = [hull, mark];
  const tags = { lod: 'lod0' };
  const record = {
    url: 'assets/ships/release/parts/wholeships/kestrel.glb',
    assetId: 'SF_K0_KESTREL_BORROWED_TIME_V4', slot: 'hull',
    bounds: { min: [-1, -0.5, -0.5], max: [1, 0.5, 0.5], size: [2, 1, 1], center: [0, 0, 0] },
    primitives: sources.map((source) => ({ key: source.name, name: source.name,
      geometry: source.geometry, material: source.material, matrix: new THREE.Matrix4(), tags })),
    markers: [],
  };
  if (packageRoute) {
    record.renderPackage = {
      assetId: 'sf.render.kestrel', contentHash: 'identity-fixture',
      createInstance(options = {}) {
        const root = new THREE.Group();
        const nodes = sources.map((source, index) => {
          const object = options.createNode?.({ source, planIndex: index + 1, parentIndex: 0 }) || source.clone(false);
          root.add(object);
          return object;
        });
        return { root, planNodes: [root, ...nodes], dispose() { root.clear(); return true; } };
      },
    };
  }
  const library = new Map(['hull', 'cockpit', 'engine', 'fin', 'weapon', 'greeble', 'gear', 'pod']
    .map((slot) => [slot, slot === 'hull' ? [record] : []]));
  return { library, hull, mark };
}

function compose(library, decalId, factionId) {
  const scene = new THREE.Scene();
  const owner = new THREE.Group();
  owner.userData.kind = 'ship';
  scene.add(owner);
  const entity = { id: 'identity-fixture', type: 'ship', alive: true, radius: 12, team: 0,
    isPlayer: true, factionId, data: { defId: 'ship_kestrel', appearance: { decalId } } };
  return buildComposedShip(entity, library, scene, owner, { requiredWholeShip: true });
}

function staticIndexCount(root) {
  let count = 0;
  root.traverse((node) => {
    if (node.isMesh && node.userData.spacefaceStaticBatch) count += node.geometry.index?.count || 0;
  });
  return count;
}

test('the Kestrel package keeps its personal lettering per instance and per cached template', () => {
  const { library, hull, mark } = fixture(true);
  const bare = compose(library, 'none', 'fixture-package-mark');
  const bareHit = compose(library, 'none', 'fixture-package-mark');
  const personal = compose(library, 'borrowed_time', 'fixture-package-mark');
  const personalHit = compose(library, 'borrowed_time', 'fixture-package-mark');
  for (const result of [bare, bareHit, personal, personalHit]) assert.ok(result);
  assert.equal(bareHit.fromFlightTemplateCache, true);
  assert.equal(personalHit.fromFlightTemplateCache, true);
  for (const result of [bare, bareHit]) {
    assert.equal(result.root.getObjectByName('LOD0_Armor_ivory').visible, false);
    result.root.userData.updateLod?.('lod1');
    result.root.userData.updateLod?.('lod0');
    assert.equal(result.root.getObjectByName('LOD0_Armor_ivory').visible, false, 'LOD cannot revive the mark');
    assert.equal(result.root.getObjectByName('LOD0_Hull').visible, true, 'the hull remains visible');
  }
  for (const result of [personal, personalHit]) {
    assert.equal(result.root.getObjectByName('LOD0_Armor_ivory').visible, true);
  }
  assert.equal(mark.visible, true, 'the shared source is unchanged');
  assert.equal(hull.visible, true);
  for (const result of [bare, bareHit, personal, personalHit]) {
    result.releaseFlightTemplate?.('identity-test');
    for (const instance of result.renderPackageInstances || []) instance.dispose?.();
  }
});

test('the ordinary GLB composition omits the same mark before static batching', () => {
  const { library, mark } = fixture(false);
  const bare = compose(library, 'none', 'fixture-raw-bare-mark');
  const personal = compose(library, 'borrowed_time', 'fixture-raw-personal-mark');
  assert.ok(bare && personal);
  assert.equal(staticIndexCount(personal.root) - staticIndexCount(bare.root), mark.geometry.index.count,
    'only the independent mark geometry differs');
  assert.equal(mark.visible, true, 'neither composition mutates the source mesh');
  bare.releaseFlightTemplate?.('identity-test');
  personal.releaseFlightTemplate?.('identity-test');
});
