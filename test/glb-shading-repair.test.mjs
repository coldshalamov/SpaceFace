import test from 'node:test';
import assert from 'node:assert/strict';
import { Document } from '@gltf-transform/core';
import { repairCollapsedUVs, repairPrimitive, repairCoincidentFaces } from '../scripts/lib/glbShadingRepair.mjs';

function fixture() {
  const document = new Document(), buffer = document.createBuffer();
  const accessor = (type, array, normalized = false) => document.createAccessor()
    .setType(type).setArray(array).setNormalized(normalized).setBuffer(buffer);
  const prim = document.createPrimitive()
    .setAttribute('POSITION', accessor('VEC3', new Float32Array([0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1])))
    .setAttribute('NORMAL', accessor('VEC3', new Float32Array([0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0])))
    .setAttribute('TEXCOORD_0', accessor('VEC2', new Uint16Array(8), true))
    .setAttribute('COLOR_0', accessor('VEC4', new Uint8Array([25, 50, 75, 255, 1, 2, 3, 254, 4, 5, 6, 253, 7, 8, 9, 252]), true))
    .setIndices(accessor('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])))
    .setMaterial(document.createMaterial('hull').setBaseColorTexture(document.createTexture()));
  return { document, prim, accessor };
}

test('UV repair preserves skin formats and normalized values, remapping morph deltas with vertices', () => {
  const { document, prim, accessor } = fixture();
  prim.setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])));
  prim.setAttribute('WEIGHTS_0', accessor('VEC4', new Uint8Array([128, 64, 63, 0, 255, 0, 0, 0, 100, 100, 55, 0, 0, 255, 0, 0]), true));
  const delta = accessor('VEC3', new Float32Array([0, 1, 0, 0, 2, 0, 0, 3, 0, 0, 4, 0]));
  const authoredTarget = document.createPrimitiveTarget().setAttribute('POSITION', delta);
  prim.addTarget(authoredTarget);
  const sibling = document.createPrimitive().addTarget(authoredTarget);
  const before = Object.fromEntries(['JOINTS_0', 'WEIGHTS_0', 'COLOR_0'].map((semantic) => {
    const a = prim.getAttribute(semantic);
    return [semantic, { array: a.getArray().slice(), normalized: a.getNormalized(), componentType: a.getComponentType() }];
  }));
  assert.deepEqual(repairCollapsedUVs(document, prim), { uvCollapsedFixed: 2, vertsAddedForUV: 6 });
  const sources = [0, 1, 2, 3, 0, 1, 2, 0, 2, 3];
  for (const [semantic, old] of Object.entries(before)) {
    const a = prim.getAttribute(semantic);
    assert.equal(a.getComponentType(), old.componentType, semantic);
    assert.equal(a.getNormalized(), old.normalized, semantic);
    for (let i = 0; i < sources.length; i++) {
      assert.deepEqual(a.getArray().slice(i * 4, i * 4 + 4), old.array.slice(sources[i] * 4, sources[i] * 4 + 4));
    }
  }
  const target = prim.listTargets()[0].getAttribute('POSITION');
  assert.equal(target.getCount(), prim.getAttribute('POSITION').getCount());
  assert.equal(sibling.listTargets()[0].getAttribute('POSITION'), delta, 'shared targets on other primitives remain authored');
  for (let i = 0; i < sources.length; i++) assert.deepEqual(target.getElement(i, []), delta.getElement(sources[i], []));
  assert.equal(prim.getAttribute('TEXCOORD_0').getComponentType(), 5126, 'new projected UVs may extend beyond normalized integer range');
  assert.equal(prim.getAttribute('TEXCOORD_0').getNormalized(), false);
  assert.equal(repairCollapsedUVs(document, prim), null, 'repair is stable on a second pass');
});

test('authored tangent morphs survive without a bind-pose UV rewrite', () => {
  const { document, prim, accessor } = fixture();
  prim.setAttribute('TANGENT', accessor('VEC4', new Float32Array(16)));
  prim.addTarget(document.createPrimitiveTarget().setAttribute('TANGENT', accessor('VEC3', new Float32Array(12))));
  const uv = prim.getAttribute('TEXCOORD_0'), tangent = prim.getAttribute('TANGENT');
  assert.equal(repairCollapsedUVs(document, prim), null);
  assert.equal(prim.getAttribute('TEXCOORD_0'), uv);
  assert.equal(prim.getAttribute('TANGENT'), tangent);
  assert.equal(prim.listTargets()[0].getAttribute('TANGENT').getCount(), 4);
});

test('normal/degenerated-face repair leaves deformed geometry and authored normal deltas intact', () => {
  for (const kind of ['skin', 'morph']) {
    const { document, prim, accessor } = fixture();
    prim.getAttribute('NORMAL').getArray().fill(1);
    prim.getIndices().setArray(new Uint16Array([0, 1, 2, 0, 0, 1]));
    if (kind === 'skin') prim.setAttribute('JOINTS_0', accessor('VEC4', new Uint16Array(16)));
    else prim.addTarget(document.createPrimitiveTarget().setAttribute('NORMAL', accessor('VEC3', new Float32Array(12))));
    const indices = prim.getIndices().getArray().slice();
    assert.equal(repairPrimitive(document, prim, 'hull', 'hull'), null);
    assert.deepEqual(prim.getIndices().getArray(), indices, 'a collapsed bind-pose face can open during deformation');
  }
});

test('static normal repair retains exact normalized color components', () => {
  const { document, prim } = fixture();
  prim.getAttribute('NORMAL').getArray().fill(0);
  for (let i = 0; i < 4; i++) prim.getAttribute('NORMAL').setElement(i, [0, 1, 0]);
  const colors = prim.getAttribute('COLOR_0').getArray().slice();
  assert.ok(repairPrimitive(document, prim, 'hull', 'hull'));
  const color = prim.getAttribute('COLOR_0');
  assert.equal(color.getComponentType(), 5121);
  assert.equal(color.getNormalized(), true);
  assert.deepEqual(color.getArray(), colors);
  for (let i = 0; i < 4; i++) assert.deepEqual(prim.getAttribute('NORMAL').getElement(i, []), [0, -1, 0]);
});

test('dropping one shape\'s degenerate face does not edit another shape\'s shared index accessor', () => {
  const { document, prim } = fixture();
  const shared = prim.getIndices();
  const sibling = document.createPrimitive().setIndices(shared);
  prim.getAttribute('POSITION').setElement(3, [0, 0, 0]);
  assert.ok(repairPrimitive(document, prim, 'hull', 'hull'));
  assert.equal(prim.getIndices().getCount(), 3);
  assert.equal(sibling.getIndices(), shared);
  assert.equal(shared.getCount(), 6);
});

test('coincident faces on moving or morphed parts remain available after the parts separate', () => {
  for (const motion of ['channel', 'ancestor', 'morph']) {
    const { document, prim, accessor } = fixture();
    const hull = document.createMesh('hull').addPrimitive(prim);
    const movingPrimitive = document.createPrimitive()
      .setAttribute('POSITION', prim.getAttribute('POSITION'))
      .setIndices(accessor('SCALAR', new Uint16Array([0, 1, 2, 0, 2, 3])))
      .setMaterial(document.createMaterial('armor'));
    const node = document.createNode('panel').setMesh(document.createMesh('panel').addPrimitive(movingPrimitive));
    const scene = document.createScene().addChild(document.createNode('hull').setMesh(hull));
    if (motion === 'ancestor') scene.addChild(document.createNode('ANIM_hatch').addChild(node));
    else scene.addChild(node);
    if (motion === 'channel') document.createAnimation().addChannel(document.createAnimationChannel().setTargetNode(node).setTargetPath('translation'));
    if (motion === 'morph') movingPrimitive.addTarget(document.createPrimitiveTarget().setAttribute('POSITION', accessor('VEC3', new Float32Array(12))));
    assert.equal(repairCoincidentFaces(document), 0);
    assert.equal(prim.getIndices().getCount(), 6);
    assert.equal(movingPrimitive.getIndices().getCount(), 6);
  }
});
