import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {installIllustratedSurface} from '../src/render/illustratedSurface.js';
import {ashlineFactorMaterialKey,makeAshlineFactorGeometry,applyAshlineFactorShader} from '../src/render/ashlineFactorPalette.js';
import {cloneMaterialPreservingShaderHooks} from '../src/render/materialClone.js';

function source(name, color, roughness, metalness) {
  const material=new THREE.MeshStandardMaterial({color,roughness,metalness});
  material.userData.spacefaceSharedMaterialRole='hull';
  installIllustratedSurface(material);
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(1,2,3),material);
  mesh.name=`LOD0_MOTION_HULL_CORE_${name}`;
  return mesh;
}

test('factor ABI preserves source geometry and exact GPU factor inputs through illustrated shader composition',()=>{
  const a=source('Armor',0x273849,0.5,0.1), b=source('Hull',0x854328,0.46,0.1);
  assert.equal(ashlineFactorMaterialKey(a.material,a),ashlineFactorMaterialKey(b.material,b));
  const originalColor=b.material.color.clone(), originalPosition=b.geometry.getAttribute('position');
  const geo=makeAshlineFactorGeometry(b),colors=geo.getAttribute('sfFactorColor'),rm=geo.getAttribute('sfFactorRM');
  assert.notStrictEqual(geo,b.geometry);assert.strictEqual(b.geometry.getAttribute('position'),originalPosition);
  assert.equal(b.geometry.getAttribute('sfFactorColor'),undefined);
  assert.equal(colors.getX(0),Math.fround(originalColor.r));assert.equal(colors.getY(0),Math.fround(originalColor.g));assert.equal(colors.getZ(0),Math.fround(originalColor.b));
  assert.equal(rm.getX(0),Math.fround(0.46));assert.equal(rm.getY(0),Math.fround(0.1));
  const mat=applyAshlineFactorShader(cloneMaterialPreservingShaderHooks(b.material));
  const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  mat.onBeforeCompile(shader,{});
  assert.match(shader.vertexShader,/vSfFactorRM = sfFactorRM/);
  assert.match(shader.fragmentShader,/diffuseColor\.rgb \*= vSfFactorColor/);
  assert.match(shader.fragmentShader,/roughnessFactor \*= vSfFactorRM\.x/);
  assert.match(shader.fragmentShader,/metalnessFactor \*= vSfFactorRM\.y/);
  assert.ok(shader.uniforms.sfAuthoredEnv,'existing illustrated hook remains installed');
  assert.deepEqual(b.material.color.toArray(),originalColor.toArray());assert.equal(b.material.roughness,0.46);assert.equal(b.material.metalness,0.1);
  assert.match(mat.customProgramCacheKey(),/ashline-factor-v1/);
  geo.dispose();mat.dispose();a.geometry.dispose();b.geometry.dispose();a.material.dispose();b.material.dispose();
});
