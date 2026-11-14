import test from 'node:test';
import assert from 'node:assert/strict';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const source = 'assets/ships/parts/hulls/hull_miner.glb';
const affectedNodes = ['LOD0_HULL_MINER_MAIN', 'LOD1_HULL_MINER_SILHOUETTE'];

function duplicateTriangles(primitive) {
  assert.equal(primitive.getMode(), 4, 'expected triangle primitives');
  const indices = primitive.getIndices();
  const position = primitive.getAttribute('POSITION');
  assert.ok(position, 'triangle primitive requires positions');
  const count = indices?.getCount() ?? position.getCount();
  assert.equal(count % 3, 0, 'triangle index count must be divisible by three');
  const attributes = primitive.listSemantics().sort().map((semantic) => primitive.getAttribute(semantic));
  const targets = primitive.listTargets().map((target) => (
    target.listSemantics().sort().map((semantic) => target.getAttribute(semantic))
  ));
  const seen = new Set();
  let duplicates = 0;
  for (let i = 0; i < count; i += 3) {
    const vertices = [0, 1, 2].map((offset) => {
      const index = indices ? indices.getScalar(i + offset) : i + offset;
      return JSON.stringify([
        attributes.map((attribute) => attribute.getElement(index, [])),
        targets.map((target) => target.map((attribute) => attribute.getElement(index, []))),
      ]);
    });
    // Rotations preserve winding. Reversing the winding remains a distinct face.
    const key = [0, 1, 2].map((rotation) => (
      JSON.stringify([...vertices.slice(rotation), ...vertices.slice(0, rotation)])
    )).sort()[0];
    if (seen.has(key)) duplicates++;
    else seen.add(key);
  }
  return duplicates;
}

test('miner authoring LODs do not repeat identical opaque hull triangles', async () => {
  const document = await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(source);
  for (const name of affectedNodes) {
    const node = document.getRoot().listNodes().find((entry) => entry.getName() === name);
    assert.ok(node?.getMesh(), `${name} must retain its hull mesh`);
    const hullPrimitives = node.getMesh().listPrimitives().filter((primitive) => (
      primitive.getMaterial()?.getName() === 'Material_Hull'
    ));
    assert.ok(hullPrimitives.length, `${name} must have a hull material primitive`);
    for (const primitive of hullPrimitives) {
      const material = primitive.getMaterial();
      assert.equal(material.getAlphaMode(), 'OPAQUE', `${name} must use an opaque hull material`);
      assert.equal(material.getBaseColorFactor()[3], 1, `${name} hull alpha must be one`);
      assert.equal(duplicateTriangles(primitive), 0, `${name} contains repeated same-winding attributed triangles`);
    }
  }
});
