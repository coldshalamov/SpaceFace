import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildMorrowVisual } from '../src/render/characters/morrowModel.js';
import { morrowEntitySpec } from '../src/systems/morrow.js';

function visual(){const e=morrowEntitySpec(),v=buildMorrowVisual(e);return {e,v,parts:v.userData.morrowParts};}
function materialOf(v,name){let result;v.traverse(o=>{if(o.material?.name===name)result=o.material;});return result;}

test('authored topology is finite, bounded and fully indexed or triangular; no sprites or asset fetches',()=>{
 const {e,v}=visual();let meshes=0,triangles=0;
 v.traverse(o=>{assert.equal(o.isSprite,undefined);assert.equal(o.isPoints,undefined);if(!o.isMesh)return;meshes++;
  const p=o.geometry.attributes.position;assert.ok(p.count>0);for(const value of p.array)assert.ok(Number.isFinite(value));
  assert.ok(o.geometry.attributes.normal);const count=o.geometry.index?.count??p.count;assert.equal(count%3,0);triangles+=count/3;
 });
 assert.ok(meshes<=42);assert.ok(triangles<30000);assert.equal(v.userData.morrow,true);assert.equal(v.userData.kind,e.type);
 v.userData.disposeMorrow();
});
test('iris actually opens: a live convex eye replaces closed overlapping shutters',()=>{
 const {e,v,parts}=visual();const ray=new THREE.Raycaster(new THREE.Vector3(.3,40,0),new THREE.Vector3(0,-1,0));
 v.userData.updateAuthoredMotion(e,8,{});v.updateMatrixWorld(true);const sleep=ray.intersectObject(parts.head,true)[0];
 e.data.morrowPose.awake=true;e.data.morrowPose.phase='idle';v.userData.updateAuthoredMotion(e,8,{});v.updateMatrixWorld(true);
 const awake=ray.intersectObject(parts.head,true)[0];assert.ok(sleep);assert.ok(awake);assert.notEqual(sleep.object.material.name,awake.object.material.name);
 assert.ok(['R07_eye','R07_rubber'].includes(awake.object.material.name));v.userData.disposeMorrow();
});
test('charge, departure fade, hurt posture and reduced motion are separate readable states',()=>{
 const {e,v,parts}=visual();const p=e.data.morrowPose;p.awake=true;p.phase='windup';p.charge=.9;p.sweep=1;
 v.userData.updateAuthoredMotion(e,4,{});assert.equal(parts.field.visible,true);const open=parts.arms[0].rotation.y;
 p.phase='shy';v.userData.updateAuthoredMotion(e,5,{});assert.equal(parts.field.visible,false);assert.notEqual(open,parts.arms[0].rotation.y);
 p.phase='release';p.launchAt=6;v.userData.updateAuthoredMotion(e,6.1,{});assert.ok(parts.pulse.visible);
 const a=parts.pulse.material.uniforms.uOpacity.value;v.userData.updateAuthoredMotion(e,7.2,{});assert.ok(parts.pulse.material.uniforms.uOpacity.value<a);
 v.userData.updateAuthoredMotion(e,8,{});assert.equal(parts.pulse.visible,false);
 p.phase='idle';p.gaze=.5;v.userData.updateAuthoredMotion(e,12,{reducedMotion:true,reducedFlash:true});
 assert.equal(parts.body.position.y,0);assert.equal(parts.gyro.rotation.y,0);assert.equal(materialOf(v,'R07_eye').emissiveIntensity,1.1);
 const m1=parts.body.matrix.clone();v.userData.updateAuthoredMotion(e,14,{reducedMotion:true,reducedFlash:true});assert.deepEqual(parts.body.matrix.elements,m1.elements);
 v.userData.disposeMorrow();
});
test('animation is renderer-only, reproducible and its final-owner disposal is idempotent',()=>{
 const {e,v,parts}=visual();e.data.morrowPose.awake=true;e.data.morrowPose.gesture='dance';e.data.morrowPose.gestureAt=1;
 const before=JSON.stringify(e);v.userData.updateAuthoredMotion(e,2,{});v.updateMatrixWorld(true);const first=parts.arms[0].matrixWorld.elements.slice();
 v.userData.updateAuthoredMotion(e,10,{});v.userData.updateAuthoredMotion(e,2,{});v.updateMatrixWorld(true);
 assert.deepEqual(parts.arms[0].matrixWorld.elements,first);assert.equal(JSON.stringify(e),before);
 const geos=new Set(),mats=new Set();v.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});
 let gd=0,md=0;for(const g of geos)g.addEventListener('dispose',()=>gd++);for(const m of mats)m.addEventListener('dispose',()=>md++);
 v.userData.disposeMorrow();v.userData.disposeMorrow();assert.equal(gd,geos.size);assert.equal(md,mats.size);
});


test('live simulation stamp freezes gesture and release even when the shared authored clock advances',()=>{
 const {e,v,parts}=visual();const p=e.data.morrowPose;p.awake=true;p.phase='release';p.simTime=9;p.launchAt=8.5;
 v.userData.updateAuthoredMotion(e,90,{});v.updateMatrixWorld(true);const pose=parts.body.matrixWorld.elements.slice();const scale=parts.pulse.scale.clone();
 v.userData.updateAuthoredMotion(e,140,{});v.updateMatrixWorld(true);
 assert.deepEqual(parts.body.matrixWorld.elements,pose);assert.deepEqual(parts.pulse.scale.toArray(),scale.toArray());assert.equal(parts.pulse.visible,true);
 v.userData.disposeMorrow();
});
test('the real cull-radius resolver retains the large field without inflating the physical hub',async()=>{
 const {entityVisualCullRadius}=await import('../src/render/visualCullRadius.js');const {e,v}=visual();
 assert.equal(e.radius,15);assert.ok(entityVisualCullRadius(e,v)>=130);assert.equal(e.physicsBody.radius,15);v.userData.disposeMorrow();
});
