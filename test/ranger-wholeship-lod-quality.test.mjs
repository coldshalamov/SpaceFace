import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

// AQ-LOD — the ranger whole-ship lod1/lod2 siblings are real simplifications of the same hull:
// meaningfully fewer triangles than LOD0, still the same authored object (same identity extras,
// sockets, and collision hull). Fake copies (LOD files that keep ~95% of LOD0 triangles) regress
// the contract this test pins.
const PARTS = 'assets/ships/parts/wholeships';

async function inspect(file) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.readBinary(await readFile(`${PARTS}/${file}`));
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const rootNode = scene.listChildren()[0];
  let triangles = 0;
  let collisionTriangles = 0;
  const sockets = [];
  const collisionNodes = [];
  for (const node of root.listNodes()) {
    const name = node.getName() || '';
    if (name.startsWith('SOCKET_')) sockets.push(name);
    const mesh = node.getMesh();
    if (!mesh) continue;
    let tris = 0;
    for (const prim of mesh.listPrimitives()) {
      const idx = prim.getIndices();
      tris += (idx ? idx.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
    if (name === 'COLLISION_HULL') {
      collisionNodes.push(name);
      collisionTriangles += tris;
    } else {
      triangles += tris;
    }
  }
  return {
    rootName: rootNode ? rootNode.getName() : null,
    triangles,
    collisionNodes,
    collisionTriangles,
    sockets: sockets.sort(),
    assetId: scene.getExtras()?.spacefaceAsset?.id,
    lod: scene.getExtras()?.spacefaceAsset?.lod,
  };
}

const lod0 = await inspect('ranger_production_v1.glb');
const lod1 = await inspect('ranger_production_v1_lod1.glb');
const lod2 = await inspect('ranger_production_v1_lod2.glb');

test('ranger lod siblings are real simplifications, not copies', () => {
  assert.ok(lod0.triangles > 20000, `lod0 baseline ${lod0.triangles}`);
  assert.ok(
    lod1.triangles <= lod0.triangles * 0.45,
    `lod1 ${lod1.triangles} must be <=45% of lod0 ${lod0.triangles} (was ~95% when fake)`,
  );
  assert.ok(
    lod2.triangles <= lod0.triangles * 0.3,
    `lod2 ${lod2.triangles} must be <=30% of lod0 ${lod0.triangles}`,
  );
  assert.ok(lod2.triangles < lod1.triangles, 'lod2 must be lighter than lod1');
  assert.ok(lod1.triangles > 1000, 'lod1 must keep readable hull topology, not collapse to a blob');
});

test('ranger lod siblings keep the same authored identity', () => {
  assert.equal(lod1.assetId, lod0.assetId);
  assert.equal(lod2.assetId, lod0.assetId);
  assert.equal(lod1.lod, 'lod1');
  assert.equal(lod2.lod, 'lod2');
  assert.equal(lod1.rootName, 'RANGER_LOD1_ROOT');
  assert.equal(lod2.rootName, 'RANGER_LOD2_ROOT');
});

test('ranger lod siblings preserve sockets and the collision hull', () => {
  assert.deepEqual(lod1.sockets, lod0.sockets);
  assert.deepEqual(lod2.sockets, lod0.sockets);
  assert.deepEqual(lod1.collisionNodes, ['COLLISION_HULL']);
  assert.deepEqual(lod2.collisionNodes, ['COLLISION_HULL']);
  assert.equal(lod1.collisionTriangles, lod0.collisionTriangles);
  assert.equal(lod2.collisionTriangles, lod0.collisionTriangles);
});
