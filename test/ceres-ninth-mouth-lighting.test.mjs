import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ninthMouthSpecs } from '../src/data/ceresNinthMouth.js';
import { createCeresNinthMouthVisuals } from '../src/render/ceresNinthMouthVisuals.js';
import { NocturneRegistry } from '../src/render/nocturne/registry.js';
import { bindNocturneScene, unbindNocturneScene, NOCTURNE_GPU_POINTS } from '../src/render/nocturne/bridge.js';
import { SHADE_REGION_UNIFORMS, shadeRegionGainAt } from '../src/render/nocturne/shadeRegions.js';

function fixture(bind = true) {
  const scene = new THREE.Scene(), registry = new NocturneRegistry();
  const owner = {registry};
  if (bind) bindNocturneScene(scene, owner);
  const rows = ninthMouthSpecs().map((s, i) => ({...s,data:{...s.data},id:i+1,alive:true,occupantGeneration:1}));
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
  f.adapter.destroy();assert.equal(f.registry.sources.length,0);
});
test('lit lamps follow their meshes; unlit, foreign and duplicate originals stay dark',()=>{
  const f=fixture(); f.adapter.update();
  const lamp=f.rows.find(e=>e.data.ninthMouthRole==='lamp:1');
  // A moved or rotated lamp still carries its own light; the light is on the body, not the mark.
  f.meshes.get(lamp.id).position.z-=30; f.adapter.update();
  assert.equal(f.registry.get('Ninth Mouth lamp:1').position.z,f.meshes.get(lamp.id).position.z);
  lamp.data.ninthMouthLight=false; f.adapter.update();
  assert.equal(f.registry.get('Ninth Mouth lamp:1').intensity,0);
  lamp.data.ninthMouthLight=true; lamp.data.ninthMouthIdentity='lw_other:lamp:1'; f.adapter.update();
  assert.equal(f.registry.get('Ninth Mouth lamp:1').intensity,0);
});
test('late Nocturne binding, owner replacement, loss and idempotent release are bounded',()=>{
  const f=fixture(false); f.adapter.update();assert.equal(f.registry.sources.length,0);
  bindNocturneScene(f.scene,f.owner);f.adapter.update();assert.equal(f.registry.sources.length,3);
  unbindNocturneScene(f.scene,f.owner);f.adapter.update();assert.equal(f.registry.sources.length,0);
  f.adapter.destroy();f.adapter.destroy();
});
test('scene replacement and registry clear recover without duplicate lamps or stale teardown',()=>{
  const f=fixture(); f.adapter.update();
  const replacement=createCeresNinthMouthVisuals({state:f.state,scene:f.scene});
  replacement.update(); f.adapter.destroy(); f.adapter.update();
  assert.equal(f.registry.sources.length,3);
  f.registry.clear(); replacement.update();assert.equal(f.registry.sources.length,3);
  f.state.settings={video:{nocturne:false}};replacement.update();
  assert.ok(f.registry.sources.every(s=>s.intensity===0));
  f.state.settings.video.nocturne=true;replacement.update();
  assert.ok(f.registry.sources.every(s=>s.intensity===1800));
  f.owner.enabled=false;replacement.update();
  assert.ok(f.registry.sources.every(s=>s.intensity===0));
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
  f.adapter.destroy();
});
test('claimed Ninth Mouth shade regions enable over shoulders, respect nocturne/menu toggles, and default to zero outside',()=>{
  const f=fixture();
  try {
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,0);
    f.adapter.update();
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,1);
    assert.ok(SHADE_REGION_UNIFORMS.sfShadeCount.value>=3);

    const north=f.rows.find(e=>e.data.ninthMouthRole==='shoulder_north');
    const south=f.rows.find(e=>e.data.ninthMouthRole==='shoulder_south');
    const receiver=f.rows.find(e=>e.data.ninthMouthRole==='receiver');
    const nPos=f.meshes.get(north.id).position;
    const sPos=f.meshes.get(south.id).position;
    const rPos=f.meshes.get(receiver.id).position;

    assert.ok(shadeRegionGainAt({x:nPos.x,y:0,z:nPos.z},{x:0,y:0.25,z:0.97})>0.5);
    assert.ok(shadeRegionGainAt({x:sPos.x,y:0,z:sPos.z},{x:0,y:0.25,z:-0.97})>0.5);
    assert.equal(shadeRegionGainAt({x:rPos.x,y:0,z:rPos.z}),0,'receiver mast sits outside shade regions');

    f.state.mode='menu'; f.adapter.update();
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,0);
    f.state.mode='flight'; f.adapter.update();
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,1);

    f.meshes.get(north.id).visible=false; f.adapter.update();
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,0);
    f.meshes.get(north.id).visible=true; f.adapter.update();
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,1);
  } finally {
    f.adapter.destroy();
    assert.equal(SHADE_REGION_UNIFORMS.sfShadeEnabled.value,0);
  }
});
