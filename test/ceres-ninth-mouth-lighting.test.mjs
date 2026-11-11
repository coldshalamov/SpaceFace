import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CERES_NINTH_MOUTH as CUT, ninthMouthSpecs } from '../src/data/ceresNinthMouth.js';
import { createCeresNinthMouthVisuals } from '../src/render/ceresNinthMouthVisuals.js';
import { NocturneRegistry } from '../src/render/nocturne/registry.js';
import { bindNocturneScene, unbindNocturneScene, NOCTURNE_GPU_POINTS } from '../src/render/nocturne/bridge.js';
import { SHADE_REGION_UNIFORMS as U, claimShadeRegion, shadeRegionGain } from '../src/render/nocturne/shadeRegions.js';
import { installIllustratedSurface } from '../src/render/illustratedSurface.js';

function fixture(bind = true) {
  const scene = new THREE.Scene(), registry = new NocturneRegistry();
  const owner = {registry};
  if (bind) bindNocturneScene(scene, owner);
  const rows = ninthMouthSpecs().map((s, i) => ({...s,id:i+1,alive:true,occupantGeneration:1}));
  const meshes = new Map(rows.map(e => {
    const mesh = new THREE.Group(); mesh.position.set(e.pos.x,0,e.pos.z);
    mesh.userData.presentationEntityId=e.id; mesh.userData.presentationOccupantGeneration=1;
    scene.add(mesh); return [e.id,mesh];
  }));
  const state = {entityList:rows,entities:new Map(rows.map(e=>[e.id,e])),render:{meshes},world:{frameOrigin:{x:0,z:0}}};
  const adapter = createCeresNinthMouthVisuals({state,scene});
  return {scene,registry,owner,rows,meshes,state,adapter};
}
test('worklights use three logical requests and never increase resident GPU light census', () => {
  const f=fixture();
  for(let i=0;i<NOCTURNE_GPU_POINTS;i++) f.scene.add(new THREE.PointLight());
  const before=f.scene.children.filter(o=>o.isLight).length;
  f.adapter.update();
  assert.equal(f.registry.sources.length,3);
  assert.equal(f.scene.children.filter(o=>o.isLight).length,before);
  for(const source of f.registry.sources) {
    assert.equal(source.intensity,1800); assert.equal(source.range,95); assert.equal(source.shadow,false);
    assert.equal(source.color.getHex(),0xffd2a0);
  }
  const lamp=f.rows.find(e=>e.data.ninthMouthRole==='lamp:0');
  f.meshes.get(lamp.id).position.x+=50; f.adapter.update();
  assert.equal(f.registry.get('Ninth Mouth lamp:0').position.x,f.meshes.get(lamp.id).position.x);
  lamp.hull=0;f.adapter.update();assert.equal(f.registry.get('Ninth Mouth lamp:0').intensity,0);
  f.adapter.destroy();assert.equal(f.registry.sources.length,0);assert.equal(U.sfShadeEnabled.value,0);
});
test('shade stays bounded, readable and frame-origin invariant',()=>{
  const f=fixture(); f.adapter.update(); assert.equal(U.sfShadeEnabled.value,1);
  const center=U.sfShadeCenter.value.clone();
  assert.ok(Math.abs(shadeRegionGain(center,center)-CUT.shade.broadFloor)<1e-12);
  for(const p of [{x:center.x-114,y:0,z:center.z},{x:center.x,y:0,z:center.z+46},
    {x:CUT.center.x-270,y:0,z:CUT.center.z},{x:center.x,y:71,z:center.z}]) assert.equal(shadeRegionGain(p,center),1);
  const mid={x:center.x,y:0,z:center.z+32};
  assert.ok(shadeRegionGain(mid,center)>CUT.shade.broadFloor && shadeRegionGain(mid,center)<1);
  f.state.world.frameOrigin={x:900,z:1200};
  for(const mesh of f.meshes.values()){mesh.position.x-=900;mesh.position.z-=1200;}
  f.adapter.update();assert.equal(U.sfShadeEnabled.value,1);
  assert.equal(U.sfShadeCenter.value.x,center.x-900); assert.equal(U.sfShadeCenter.value.z,center.z-1200);
  assert.equal(shadeRegionGain({x:mid.x-900,y:0,z:mid.z-1200},U.sfShadeCenter.value),shadeRegionGain(mid,center));
  f.adapter.destroy();
});
test('missing, moved, rotated, dead, duplicate or stale shoulders never leave imaginary shade',()=>{
  for(const mutate of [
    (f,e)=>f.meshes.delete(e.id), (f,e)=>{f.meshes.get(e.id).visible=false;},
    (f,e)=>{e.hull=0;}, (f,e)=>{e.pos.x+=2;}, (f,e)=>{e.rot=.2;},
    (f,e)=>{e.occupantGeneration++;}, (f,e)=>{f.state.entities.delete(e.id);},
    (f,e)=>{const d={...e,id:999};f.rows.push(d);f.state.entities.set(d.id,d);},
  ]) {
    const f=fixture();f.adapter.update();assert.equal(U.sfShadeEnabled.value,1);
    const e=f.rows.find(e=>e.data.ninthMouthRole==='shoulder_north');mutate(f,e);f.adapter.update();
    assert.equal(U.sfShadeEnabled.value,0);f.adapter.destroy();
  }
});
test('late Nocturne binding, owner replacement, loss and idempotent release are bounded',()=>{
  const f=fixture(false); f.adapter.update();assert.equal(U.sfShadeEnabled.value,0);assert.equal(f.registry.sources.length,0);
  bindNocturneScene(f.scene,f.owner);f.adapter.update();assert.equal(f.registry.sources.length,3);
  unbindNocturneScene(f.scene,f.owner);f.adapter.update();assert.equal(f.registry.sources.length,0);assert.equal(U.sfShadeEnabled.value,0);
  f.adapter.destroy();f.adapter.destroy();
  const old=claimShadeRegion(CUT.shade), replacement=claimShadeRegion(CUT.shade);
  replacement.update({x:1,y:0,z:2},true);old.release();old.update({x:4,y:0,z:5},false);
  assert.equal(U.sfShadeEnabled.value,1);assert.equal(U.sfShadeCenter.value.x,1);
  replacement.release();assert.equal(U.sfShadeEnabled.value,0);
});
test('scene replacement and registry clear recover without duplicate lamps or stale teardown',()=>{
  const f=fixture(); f.adapter.update();
  const replacement=createCeresNinthMouthVisuals({state:f.state,scene:f.scene});
  replacement.update(); f.adapter.destroy(); f.adapter.update();
  assert.equal(f.registry.sources.length,3);assert.equal(U.sfShadeEnabled.value,1);
  f.registry.clear(); replacement.update();assert.equal(f.registry.sources.length,3);
  f.state.settings={video:{nocturne:false}};replacement.update();assert.equal(U.sfShadeEnabled.value,0);
  f.state.settings.video.nocturne=true;replacement.update();assert.equal(U.sfShadeEnabled.value,1);
  f.owner.enabled=false;replacement.update();assert.equal(U.sfShadeEnabled.value,0);
  replacement.destroy();assert.equal(f.registry.sources.length,0);
});
test('full registry fails quiet, retries missing requests and never evicts other lights',()=>{
  const f=fixture(); f.registry.capacity=3;
  const other=f.registry.register('other',{intensity:100});
  f.adapter.update();assert.equal(f.registry.sources.length,3);
  const held=f.registry.get('Ninth Mouth lamp:0');
  f.adapter.update();assert.equal(f.registry.get('Ninth Mouth lamp:0'),held);
  assert.equal(f.registry.get('other'),other);assert.equal(f.scene.children.filter(x=>x.isLight).length,0);
  f.registry.unregister('other');f.adapter.update();assert.equal(f.registry.sources.length,3);
  assert.ok(f.registry.get('Ninth Mouth lamp:2'));
  f.state.mode='menu';f.adapter.update();assert.ok(f.registry.sources.every(s=>s.intensity===0));
  assert.equal(U.sfShadeEnabled.value,0);f.adapter.destroy();
});
test('physical shader keeps original exterior output and separate local RGB/specular/emission',()=>{
  const material=new THREE.MeshStandardMaterial();installIllustratedSurface(material);
  const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.standard.uniforms),
    vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  material.onBeforeCompile(shader);
  const s=shader.fragmentShader;
  assert.equal(shader.uniforms.sfShadeEnabled,U.sfShadeEnabled);
  assert.equal((s.match(/uniform float sfShadeEnabled;/g)||[]).length,1);
  assert.ok(s.indexOf('sfLocalPhysicalSpecular = reflectedLight.directSpecular')<s.indexOf('directionalLight = directionalLights'));
  assert.match(s,/vec3 outgoingLight = sfBoundedPigment \+ sfLocalIllumination\s*\+ sfRimLight \* sfHeadroom \+ sfCoatLight \+ totalSpecular \+ totalEmissiveRadiance;/);
  assert.match(s,/if \(sfShadeGain < 1\.0\)/);
  assert.match(s,/\+ sfLocalIllumination \+ sfLocalSpecular \+ totalEmissiveRadiance;/);
  assert.match(s,/sfNocturneViewToWorld \* vec4\(-vViewPosition, 1\.0\)/);
  material.dispose();
});

function physicalShader() {
  const material=new THREE.MeshPhysicalMaterial({clearcoat:1,sheen:1,sheenColor:0xffffff});
  assert.equal(installIllustratedSurface(material),true);
  const shader={uniforms:THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
    vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  material.onBeforeCompile(shader);material.dispose();return shader.fragmentShader;
}
test('opaque Physical native sheen and clearcoat shade before their unchanged composition tail',()=>{
  const s=physicalShader(), native=THREE.ShaderLib.physical.fragmentShader;
  const nativeOutput=native.indexOf('vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;');
  const nativeTail=native.slice(native.indexOf('#ifdef USE_SHEEN',nativeOutput),native.indexOf('#include <opaque_fragment>'));
  assert.ok(s.includes(nativeTail),'native sheen sum and clearcoat Fresnel composition stay byte-exact');
  const shade=s.indexOf('if (sfShadeGain < 1.0)'),tail=s.indexOf(nativeTail);
  for(const [define,lobe,local] of [['USE_SHEEN','sheen','Sheen'],['USE_CLEARCOAT','clearcoat','Clearcoat']]) {
    const capture=`vec3 sfLocalPhysical${local} = ${lobe}SpecularDirect;`;
    const captureAt=s.indexOf(capture);
    assert.ok(captureAt>s.indexOf('pointLight = pointLights'));
    assert.ok(captureAt>s.indexOf('spotLight = spotLights'));
    assert.ok(captureAt<s.indexOf('directionalLight = directionalLights'));
    assert.ok(s.includes(`#ifdef ${define}\n      ${capture}\n    #endif`));
    const scale=`${lobe}SpecularDirect = (${lobe}SpecularDirect - sfLocal${local}Specular) * sfShadeGain + sfLocal${local}Specular;`;
    const scaleAt=s.indexOf(scale);
    assert.ok(scaleAt>shade && scaleAt<tail,'scale before native output and only in shade branch');
    assert.ok(s.includes(`${lobe}SpecularIndirect *= sfShadeGain;`));
    assert.ok(s.lastIndexOf(`#ifdef ${define}`,scaleAt)>shade,'optional native variables remain guarded');
  }
  assert.match(s,/\+ sfLocalIllumination \+ sfLocalSpecular \+ totalEmissiveRadiance;/);
});
test('native lobe shade math preserves local energy and dims only broad direct plus indirect RGB',()=>{
  const s=physicalShader();
  for(const [lobe,local] of [['sheen','Sheen'],['clearcoat','Clearcoat']]) {
    const prefix=`${lobe}SpecularDirect = `, start=s.indexOf(prefix);
    const expression=s.slice(start+prefix.length,s.indexOf(';',start));
    const evaluate=new Function(`${lobe}SpecularDirect`,`sfLocal${local}Specular`,'sfShadeGain',`return ${expression};`);
    for(const gain of [0,.22,.7,1]) for(const [direct,point,indirect] of [[3,1,.4],[.2,.8,2],[0,0,.6],[5,5,0]]) {
      const kept=Math.min(Math.max(point,0),Math.max(direct,0));
      const actual=evaluate(direct,kept,gain)+indirect*gain;
      const expected=kept+(direct-kept+indirect)*gain;
      assert.ok(Math.abs(actual-expected)<1e-12);
      assert.ok(actual>=kept && actual<=direct+indirect);
      if(gain===1) assert.equal(actual,direct+indirect);
    }
  }
});
