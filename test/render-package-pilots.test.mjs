import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import * as THREE from 'three';

import { derivePilotSemanticManifest } from '../scripts/build-render-package-pilots.mjs';
import {
  buildAuthoredPlaceProp,
  upgradeAuthoredPlaceBoundaryForProbe,
} from '../src/render/partsLibrary.js';
import {
  RENDER_PACKAGE_PILOTS,
  renderPackagePilotForAssetId,
  renderPackagePilotForSourceUrl,
} from '../src/render/renderPackageManifest.js';

test('production package build rejects runtime asset identity drift', async () => {
  await assert.rejects(
    derivePilotSemanticManifest({
      key: 'identity-drift',
      assetId: 'sf.render.identity-drift',
      runtimeAssetId: 'wrong-runtime-id',
      kind: 'place',
      rootNode: 'place_debris_chunk',
      dynamicNameIncludes: [],
    }, 'assets/ships/release/parts/places/place_debris_chunk.glb'),
    /runtime assetId wrong-runtime-id does not match source place_debris_chunk/,
  );
});

test('production manifest packages every live whole-ship family and admitted authored place', async () => {
  assert.deepEqual(RENDER_PACKAGE_PILOTS.map((entry) => entry.key), [
    'kestrel',
    'ashline-dart',
    'ashline-lode',
    'ashline-rig',
    'helios-lark',
    'helios-cradle',
    'helios-span',
    'helios-trade-hub',
    'ceres-refinery',
    'jump-ring',
    'debris-chunk',
    'dead-hulk',
    'dock-interior',
    'wasp',
  ]);

  const wasp = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/wholeships/wasp_production_v1.glb',
  );
  assert.equal(wasp?.runtimeAssetId, 'SF_WASP_PRODUCTION_V1');
  const tradeHub = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_station_trade_hub.glb',
  );
  assert.equal(tradeHub?.runtimeAssetId, 'SF_PLACE_STATION_TRADE_HUB');
  const refinery = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_station_refinery.glb',
  );
  assert.equal(refinery?.runtimeAssetId, 'SF_PLACE_STATION_REFINERY');
  const jumpRing = renderPackagePilotForSourceUrl(
    'assets/ships/release/parts/places/place_gate_jump_ring.glb',
  );
  assert.equal(jumpRing?.runtimeAssetId, 'SF_PLACE_GATE_JUMP_RING');

  for (const binding of RENDER_PACKAGE_PILOTS) {
    assert.strictEqual(renderPackagePilotForSourceUrl(binding.sourceUrl), binding);
    assert.strictEqual(renderPackagePilotForSourceUrl(`${binding.sourceUrl}?cache=1`), binding);
    assert.strictEqual(renderPackagePilotForAssetId(binding.assetId), binding);
    const [sourceBytes, metadataBytes] = await Promise.all([
      readFile(binding.sourceUrl),
      readFile(binding.metadataUrl),
    ]);
    const metadata = JSON.parse(metadataBytes.toString('utf8'));
    assert.equal(createHash('sha256').update(sourceBytes).digest('hex'), binding.sourceSha256);
    assert.equal(metadata.assetId, binding.assetId);
    assert.equal(metadata.contentHash, binding.expectedContentHash);
    assert.equal(metadata.provenance.sourceGlb.sha256, binding.sourceSha256);
    assert.ok(metadata.geometry.every((geometry) => geometry.indexed === true),
      `${binding.key} preserves indexed production geometry`);
    if (binding.key === 'helios-trade-hub') {
      assert.ok(metadata.nodes.filter((node) => node.parentId === null).length > 1,
        'scene-root package preserves the authored multi-root hierarchy');
      assert.ok(metadata.anchors.some((anchor) => anchor.nodeName === 'SOCKET_Structure_Core'));
      assert.ok(metadata.collisions.some((collision) => collision.reference === 'COLLISION_HULL'));
    }
  }

  assert.equal(renderPackagePilotForSourceUrl('assets/ships/release/parts/wholeships/pelican.glb'), null);
  assert.equal(renderPackagePilotForAssetId('sf.render.unclaimed'), null);
});

test('production render-package instances bypass runtime geometry preparation on the place route', async () => {
  const entity = {
    id: 'pilot_debris',
    type: 'fx',
    alive: true,
    radius: 12,
    data: {
      placeId: 'place_debris_chunk',
      placeScale: 1,
    },
  };
  const boundary = buildAuthoredPlaceProp(entity, { releaseMode: true });
  const fallbackRoot = boundary.children[0];
  const scene = new THREE.Scene();
  scene.add(boundary);

  const geometry = new THREE.BoxGeometry(4, 2, 3);
  geometry.clone = () => {
    throw new Error('production package geometry must not be cloned at runtime');
  };
  const material = new THREE.MeshStandardMaterial({ color: 0x7a7168 });
  const tags = Object.freeze({ lod: 'lod0', tint: 'none', instance: true });
  let instances = 0;
  const record = {
    url: 'assets/ships/release/parts/places/place_debris_chunk.glb',
    assetId: 'place_debris_chunk',
    slot: 'place',
    bounds: { size: [4, 2, 3], center: [0, 0, 0] },
    primitives: [{
      key: 'debris:lod0',
      name: 'LOD0_Debris_Material_Hull',
      geometry,
      material,
      matrix: new THREE.Matrix4(),
      tags,
    }],
    markers: [],
    renderPackage: {
      assetId: 'pilot.debris_chunk',
      contentHash: '1'.repeat(64),
      createInstance() {
        instances++;
        const root = new THREE.Group();
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = 'LOD0_Debris_Material_Hull';
        mesh.userData.spacefaceTags = tags;
        root.add(mesh);
        return { root, dispose() { return true; } };
      },
    },
  };

  const swapped = await upgradeAuthoredPlaceBoundaryForProbe(
    boundary,
    fallbackRoot,
    entity,
    'places/place_debris_chunk.glb',
    {},
    scene,
    { releaseMode: true, loadAuthoredPart: async () => record },
  );

  assert.equal(swapped, true);
  assert.equal(instances, 1);
  const directMeshes = [];
  boundary.traverse((object) => {
    if (object.isMesh && object.userData?.spacefaceRenderPackageDirect === true) directMeshes.push(object);
    assert.notEqual(object.userData?.spacefaceStaticBatch, true);
  });
  assert.equal(directMeshes.length, 1);
  assert.strictEqual(directMeshes[0].geometry, geometry, 'package instance shares its immutable decoded buffer');
});
