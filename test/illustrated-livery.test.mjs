import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyAuthoredMaterialProfile } from '../src/render/authoredMaterialProfiles.js';
import { illustratedLiveryForAsset, illustratedPigmentForMaterial } from '../src/render/illustratedLivery.js';
import { resolveMaterialFamilyId } from '../src/render/industrialMaterialFamilies.js';
import { applyAuthoredSurfaceTint } from '../src/render/partsLibrary.js';

test('fleet paint varies by occupation while optics, markings and authored colour factors survive', () => {
  const assetIds = ['SF_WHOLESHIP_HELIOS_LARK', 'SF_WHOLESHIP_HELIOS_CRADLE', 'SF_WHOLESHIP_YARD_TUG'];
  const materials = assetIds.map(assetId => {
    const material = new THREE.MeshStandardMaterial({color: 0xb8c0c5});
    material.name = 'Material_Hull';
    const color = material.color.getHex();
    applyAuthoredMaterialProfile(material, 'hull', {assetId, allowTextures:false});
    assert.equal(material.color.getHex(), color);
    const shader = {fragmentShader:THREE.ShaderLib.standard.fragmentShader, uniforms:{}};
    material.onBeforeCompile(shader, {});
    return {material, shader};
  });
  assert.equal(new Set(materials.map(x=>x.material.customProgramCacheKey())).size, 1,
    'livery must not compile a unique program for each ship');
  assert.equal(new Set(materials.map(x=>x.shader.uniforms.sfPaintPigment.value.getHex())).size, 3);
  for (const role of ['glass','signal','drive','mechanical','geology']) {
    assert.equal(illustratedPigmentForMaterial(assetIds[0],role,'Material_Hull'),null);
  }
  for (const name of ['Material_Decal_Stencils','Material_V6_MarkingIvory','Material_ArmorDark']) {
    assert.equal(illustratedPigmentForMaterial(assetIds[0],'hull',name),null);
  }
  assert.equal(illustratedLiveryForAsset('new-unknown-asset'),null);
});

test('a shared-material rename retains the precise stencil and armour response', () => {
  for(const [name, family] of [['Material_Decal_Stencils','industrial_marking'],['Material_ArmorDark','bare_structure']]) {
    const material=new THREE.MeshStandardMaterial();material.name=name;
    applyAuthoredMaterialProfile(material,'hull',{assetId:'kestrel',allowTextures:false});
    material.name='SF_Shared_hull_hull';
    assert.equal(resolveMaterialFamilyId(material,'kestrel'),family);
  }
});

test('an authored clone compiles with its own pigment instead of the source material pigment', () => {
  const source=new THREE.MeshStandardMaterial();source.name='Material_Hull';
  applyAuthoredMaterialProfile(source,'hull',{assetId:'helios_lark',allowTextures:false});
  const clone=source.clone();clone.onBeforeCompile=source.onBeforeCompile;
  clone.userData.spacefaceIllustratedPigment={color:'#b86138',strength:.7};
  const shader={fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  clone.onBeforeCompile(shader,{});
  assert.equal(shader.uniforms.sfPaintPigment.value.getHexString(),'b86138');
  assert.equal(shader.uniforms.sfPaintStrength.value,.7);
});

test('explicit neutral player paint overrides the occupational livery at shader compilation', () => {
  for (const role of ['hull', 'accent']) {
    const material = new THREE.MeshStandardMaterial();
    material.name = 'Material_Hull';
    applyAuthoredMaterialProfile(material, role, { assetId: 'kestrel', allowTextures: false });
    assert.ok(material.userData.spacefaceIllustratedPigment);
    applyAuthoredSurfaceTint(material, '#b0b0b0', role, true);
    const shader = { fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    material.onBeforeCompile(shader, {});
    assert.equal(shader.uniforms.sfPaintStrength.value, 0);
    assert.equal(material.color.getHexString(), 'b0b0b0');
  }
});
