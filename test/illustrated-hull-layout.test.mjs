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
