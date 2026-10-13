import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { load } from './flight-start-support.mjs';
const { withOnlySubjectsDrawable, drawableHideSession } = await load('01-touch-visible-only','src/render/openingGpuAdmission.js');
for (const sessionMode of [false,true]) test(`touch leaves hidden drawables untouched (session=${sessionMode})`,()=>{
 const scene=new THREE.Scene(),keep=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 const hidden=new THREE.Mesh(keep.geometry,keep.material),other=new THREE.Mesh(keep.geometry,keep.material);
 const lamp=new THREE.DirectionalLight();scene.add(keep,hidden,other,lamp);
 let value=false,writes=0;Object.defineProperty(hidden,'visible',{get:()=>value,set:v=>{writes++;value=v;}});
 const session=sessionMode?drawableHideSession(scene):null;
 assert.throws(()=>withOnlySubjectsDrawable(scene,keep,()=>{
  const visible=[];scene.traverseVisible(o=>{if(o.isMesh)visible.push(o);});
  assert.deepEqual(visible,[keep]);assert.equal(lamp.visible,true);throw new Error('draw-fault');
 },session),/draw-fault/);
 assert.equal(other.visible,true);assert.equal(hidden.visible,false);
 assert.equal(writes,0,'invisible input is already excluded by Three; do not rewrite/restore it');
});
test('touch prunes an originally hidden branch but keeps subject ancestors and children',()=>{
 const scene=new THREE.Scene(),group=new THREE.Group(),keep=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 group.add(keep);scene.add(group);
 const invisible=new THREE.Group();invisible.visible=false;scene.add(invisible);
 let reads=0;for(let i=0;i<32;i++){const o=new THREE.Object3D();Object.defineProperty(o,'isMesh',{get:()=>{reads++;return true;}});invisible.add(o);}
 withOnlySubjectsDrawable(scene,group,()=>assert.equal(keep.visible,true));
 assert.equal(reads,0,'no drawable census inside an already invisible subtree');
});
