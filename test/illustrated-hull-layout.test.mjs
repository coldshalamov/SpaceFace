import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { hullLayoutForAsset, prepareHullLayoutGeometry } from '../src/render/illustratedHullLayout.js';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';

test('merged package geometry reuses its position buffer while transformed source pieces agree in asset space', () => {
  const merged = new THREE.BoxGeometry(8, 2, 4);
  prepareHullLayoutGeometry(merged, new THREE.Matrix4(), 'SF_WHOLESHIP_YARD_TUG');
  assert.equal(merged.attributes.sfHullPosition, merged.attributes.position);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Int16Array([32767, 0, -32767]), 3, true));
  const matrix = new THREE.Matrix4().makeScale(2, 3, 4).setPosition(8, 1, 5);
  const a = prepareHullLayoutGeometry(geometry, matrix, 'SF_WHOLESHIP_YARD_TUG');
  assert.deepEqual(Array.from(a.attributes.sfHullPosition.array), [10, 1, 1]);
  const moved = new THREE.Matrix4().makeTranslation(2, 4, 6);
  const b = prepareHullLayoutGeometry(geometry, moved, 'SF_WHOLESHIP_YARD_TUG');
  assert.notEqual(a, b);
  assert.deepEqual(Array.from(a.attributes.sfHullPosition.array), [10, 1, 1]);
  assert.deepEqual(Array.from(b.attributes.sfHullPosition.array), [3, 4, 5]);
  assert.equal(prepareHullLayoutGeometry(geometry, moved, 'SF_WHOLESHIP_YARD_TUG'), b);
});

function assertCanonicalHullCoordinates(position, matrix) {
  const sourceBuffer = (position.array || position.data.array).buffer;
  const originalBytes = Buffer.from(new Uint8Array(sourceBuffer));
  const expected = new Float32Array(position.count * 3);
  const point = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    point.fromBufferAttribute(position, i).applyMatrix4(matrix).toArray(expected, i * 3);
  }
  const geometry = new THREE.BufferGeometry().setAttribute('position', position);
  const prepared = prepareHullLayoutGeometry(geometry, matrix, 'SF_WHOLESHIP_YARD_TUG');
  const actual = prepared.attributes.sfHullPosition.array;
  assert.ok(Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength)
    .equals(Buffer.from(expected.buffer)), 'asset-space coordinates preserve canonical Float32 bytes');
  assert.equal(prepared.attributes.position, position, 'source position ownership stays unchanged');
  assert.ok(Buffer.from(position.array?.buffer || position.data.array.buffer).equals(originalBytes),
    'coordinate baking does not mutate the source buffer or interleaved padding');
  assert.equal(prepareHullLayoutGeometry(geometry, matrix, 'SF_WHOLESHIP_YARD_TUG'), prepared,
    'the same geometry/transform keeps its cached result');
}

test('affine hull coordinates preserve Float32 precision and normalized Int16 extrema with stride and offset', () => {
  const packed = new THREE.BufferAttribute(new Float32Array([
    1 / 3, -1234.567, 0.000031, -0, 19.75, -7.125,
  ]), 3);
  const quantized = new THREE.BufferAttribute(new Int16Array([
    -32768, 0, 32767, -32767, 16384, -1,
  ]), 3, true);
  const stridedQuantized = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Int16Array([
    99, -32768, 0, 32767, 88, 77, -32767, 16384, -1, 66,
  ]), 5), 3, 1, true);
  const stridedFloat = new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Float32Array([
    99, 1 / 3, -1234.567, 0.000031, 88, 77, -0, 19.75, -7.125, 66,
  ]), 5), 3, 1);
  const matrices = [
    new THREE.Matrix4().makeScale(-2.75, 0.000125, 123.5).setPosition(8.125, -1 / 3, 2 ** 20),
    new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0.37, -1.2, 2.1)).setPosition(-0.125, 7, 19),
    new THREE.Matrix4().set(1, 0.25, -0.75, 9, -0.125, 2, 0.5, -8, 0.375, -1, 3, 7, 0, 0, 0, 1),
  ];
  for (const position of [packed, quantized, stridedQuantized, stridedFloat]) {
    for (const matrix of matrices) assertCanonicalHullCoordinates(position, matrix);
  }
  const clamped = prepareHullLayoutGeometry(new THREE.BufferGeometry().setAttribute('position', quantized),
    new THREE.Matrix4().makeTranslation(2, 4, 6), 'SF_WHOLESHIP_YARD_TUG');
  assert.deepEqual(Array.from(clamped.attributes.sfHullPosition.array.slice(0, 3)), [1, 4, 7]);
});

test('other position encodings and projective matrices retain canonical decoding; identity keeps aliases', () => {
  const positions = [
    new THREE.BufferAttribute(new Uint8Array([0, 128, 255, 255, 1, 64]), 3, true),
    new THREE.BufferAttribute(new Uint16Array([0, 32768, 65535, 65535, 1, 4096]), 3, true),
    new THREE.BufferAttribute(new Float64Array([1 / 7, -2 / 3, Math.PI, -1 / 9, 2 ** 24 + 1, -0]), 3),
    new THREE.BufferAttribute(new Int16Array([-32768, 0, 32767, -1, 2, 3]), 3, true),
  ];
  const affine = new THREE.Matrix4().makeScale(-2, 3, 4).setPosition(5, 6, 7);
  const projective = new THREE.Matrix4().set(1, 0.25, 0, 2, 0, 2, 0, -3,
    0, 0, 3, 4, 0.01, 0.02, 0.03, 1);
  for (const position of positions) {
    assertCanonicalHullCoordinates(position, affine);
    assertCanonicalHullCoordinates(position, projective);
    const geometry = new THREE.BufferGeometry().setAttribute('position', position);
    assert.equal(prepareHullLayoutGeometry(geometry, new THREE.Matrix4(), 'SF_WHOLESHIP_YARD_TUG')
      .attributes.sfHullPosition, position, 'identity aliases the original encoding');
  }
  const position = new THREE.BufferAttribute(new Float32Array([1, 2, 3]), 3);
  assertCanonicalHullCoordinates(position, projective);
  const untouched = new THREE.BufferGeometry().setAttribute('position', position);
  assert.equal(prepareHullLayoutGeometry(untouched, affine, 'unknown_custom_asset'), untouched);
  assert.equal(untouched.attributes.sfHullPosition, undefined);
});

test('habitat, rectangular dock and upright gate have different layout grammars', () => {
  const layouts = ['SF_PLACE_STATION_TRADE_HUB', 'SF_PLACE_STATION_MILITARY', 'SF_PLACE_GATE_JUMP_RING']
    .map(id => hullLayoutForAsset(id));
  assert.equal(new Set(layouts.map(x => x.kind)).size, 3);
  assert.equal(hullLayoutForAsset('unknown_custom_asset'), null);
});

test('cloned ship material retains its own bounds and layout without covering optics or stencils', () => {
  const bounds = { center: [3, 4, 5], size: [22, 6, 9] };
  const options = { assetId: 'SF_BASTION_PRODUCTION_V1', bounds, allowTextures: false };
  const hull = new THREE.MeshStandardMaterial({ name: 'Material_Hull' });
  applyAuthoredMaterialProfile(hull, 'hull', options);
  const clone = hull.clone(); clone.onBeforeCompile = hull.onBeforeCompile;
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  clone.onBeforeCompile(shader, {});
  assert.deepEqual(shader.uniforms.sfHullCenter.value.toArray(), bounds.center);
  assert.deepEqual(shader.uniforms.sfHullSize.value.toArray(), bounds.size);
  assert.ok(shader.uniforms.sfLayoutStrength.value > 0);
  for (const [name, role] of [['Material_Glass', 'glass'], ['Material_Decal_Stencils', 'hull'], ['Material_Emissive_Cyan', 'signal']]) {
    const material = new THREE.MeshStandardMaterial({ name });
    applyAuthoredMaterialProfile(material, role, options);
    assert.equal(material.userData.spacefaceHullLayout, undefined);
  }
});

test('liner coatings, glazing and forged frame retain distinct material roles', () => {
  const options = { assetId: 'SF_WHOLESHIP_MASSLINE_EXPRESS_LINER_V1', allowTextures: false,
    bounds: { center: [0, 0, 0], size: [20, 4, 8] } };
  for (const [name, staleRole, expected] of [
    ['MAT_SF_Massline_CeramicPaint_WarmIvory', 'ceramic', 'hull'],
    ['MAT_SF_Massline_Glazing_SmokedSafety', 'hull', 'glass'],
    ['MAT_SF_Massline_Frame_DarkAnodized', 'hull', 'mechanical'],
    ['MAT_SF_Massline_WayfindingCyan', 'hull', 'signal'],
  ]) {
    const material = new THREE.MeshStandardMaterial({ name });
    applyAuthoredMaterialProfile(material, staleRole, options);
    assert.equal(material.userData.spacefaceMaterialRole, expected);
    assert.equal(!!material.userData.spacefaceHullLayout, expected === 'hull');
  }
});

test('opening aftermath paint and soot override stale all-mechanical package roles', () => {
  const options = { assetId: 'SF_AFTERMATH_AFT_CARGO_MODULE', allowTextures: false,
    bounds: { center: [0, 0, 0], size: [20, 4, 8] } };
  const paint = new THREE.MeshStandardMaterial({ name: 'wrk_paint_freight_ochre' });
  const soot = new THREE.MeshStandardMaterial({ name: 'wrk_scorch_edge' });
  applyAuthoredMaterialProfile(paint, 'mechanical', options);
  applyAuthoredMaterialProfile(soot, 'mechanical', options);
  assert.equal(paint.userData.spacefaceMaterialRole, 'hull');
  assert.equal(paint.userData.spacefaceHullLayout.kind, 8);
  assert.equal(soot.userData.spacefaceMaterialRole, 'rubber');
  assert.equal(soot.metalness, 0);
});
