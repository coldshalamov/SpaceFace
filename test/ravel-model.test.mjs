import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildRavelVisual, disposeRavelVisual } from '../src/render/characters/ravelModel.js';
import { ravelEntitySpec } from '../src/systems/ravel.js';
import { makeEntity } from '../src/core/entity.js';
import { createVisualFactory } from '../src/render/visualFactory.js';
import { authoredCriticalVisualReadiness } from '../src/render/partsLibrary.js';
function sample(part='core',index=0){const e=makeEntity({...ravelEntitySpec(part,index),id:index+10});const root=buildRavelVisual(e);return{e,root,parts:root.userData.ravelParts};}
test('four original body variants construct without DOM, assets, or geometry degeneracy',()=>{
 let triangles=0,meshes=0;
 for(const [part,i]of[['core',0],['spool',0],['spool',1],['spool',2]]){
  const {root}=sample(part,i);assert.equal(root.userData.authoredAssetState,'authored');
  root.traverse(o=>{assert.equal(!!o.isSprite,false);assert.equal(!!o.isPoints,false);if(!o.geometry)return;
   const p=o.geometry.attributes.position;assert.ok([...p.array].every(Number.isFinite));o.geometry.computeBoundingBox();
   assert.ok(Number.isFinite(o.geometry.boundingBox.min.x));triangles+=(o.geometry.index?.count??p.count)/3;meshes++;});
  disposeRavelVisual(root);
 }
 assert.ok(triangles<14500,`triangle count ${triangles}`);assert.ok(meshes<=58,`mesh count ${meshes}`);
});
test('actual visual factory chooses the authored character, with no pending replacement',()=>{
 const e=makeEntity({...ravelEntitySpec(),id:4});const factory=createVisualFactory();const root=factory.build(e);
 assert.ok(root);assert.equal(root.userData.ravel,true);assert.equal(root.userData.authoredAssetState,'authored');
 assert.equal(root.userData.requestAuthoredUpgrade,undefined);disposeRavelVisual(root);
});
test('native character satisfies the production asset readiness gate',()=>{
 const {e,root}=sample();e.mesh=root;e.pos.set(40,0,0);
 const player={id:1,type:'ship',isPlayer:true,alive:true,maxSpeed:174,pos:{x:0,z:0},mesh:{userData:{authoredAssetState:'authored'}}};
 const entityList=[player,e];const result=authoredCriticalVisualReadiness({mode:'loading',playerId:1,simTime:0,entityList,
 entities:new Map(entityList.map(e=>[e.id,e])),camera:{zoom:144},render:{},world:{currentSectorId:'sector_pallas_drift'}});
 assert.equal(result.ready,true);disposeRavelVisual(root);
});
test('warning uses captured angle and actual simulation crest radius, not wall time',()=>{
 const {root,e,parts}=sample();const p=e.data.ravelPose;p.phase='windup';p.angle=.8;p.charge=.6;p.simTime=1;
 root.userData.updateAuthoredMotion(e,900,{});assert.equal(parts.telegraph.visible,true);assert.equal(parts.telegraph.rotation.y,-.8);
 assert.equal(parts.wave.visible,false);p.phase='cast';p.waveRadius=93;p.waveFade=.8;p.simTime=2.2;
 root.userData.updateAuthoredMotion(e,999,{});assert.equal(parts.wave.visible,true);assert.equal(parts.wave.material.uniforms.uRadius.value,93);
 assert.equal(parts.wave.material.uniforms.uTime.value,2.2);disposeRavelVisual(root);
});
test('pause freezes all animated transforms even when renderer wall time advances',()=>{
 const {e,root}=sample();e.data.ravelPose.simTime=4;root.userData.updateAuthoredMotion(e,4,{});
 const snapshot=()=>{const a=[];root.traverse(o=>a.push(...o.position.toArray(),...o.rotation.toArray().slice(0,3)));return a;};
 const before=snapshot();root.userData.updateAuthoredMotion(e,400,{});assert.deepEqual(snapshot(),before);disposeRavelVisual(root);
});
test('unthreading deforms its matching arm and removes only its matching force ribbon',()=>{
 const {e,root,parts}=sample();const p=e.data.ravelPose;p.phase='windup';p.freed=2;p.points=[{x:65,z:0,live:true},{live:false},{x:-30,z:55,live:true}];
 root.userData.updateAuthoredMotion(e,0,{reducedMotion:true});assert.equal(parts.jaws[1].position.y,-2);
 assert.equal(parts.jaws[0].position.y,0);assert.deepEqual(parts.ribbons.map(x=>x.visible),[true,false,true]);disposeRavelVisual(root);
});
test('reduced motion preserves warning, reduced flash caps emission, quiet egg appears in peace',()=>{
 const {e,root,parts}=sample();const p=e.data.ravelPose;p.phase='windup';p.charge=1;p.simTime=42;
 root.userData.updateAuthoredMotion(e,42,{reducedMotion:true,reducedFlash:true});assert.equal(parts.telegraph.visible,true);assert.equal(parts.spindle.rotation.y,0);
 root.traverse(o=>{if(o.material?.emissiveIntensity)assert.ok(o.material.emissiveIntensity<=1.2);});
 p.phase='peace';p.quiet=true;root.userData.updateAuthoredMotion(e,43,{reducedMotion:true});
 assert.equal(parts.telegraph.visible,false);assert.equal(parts.wave.visible,false);assert.equal(parts.quietNeedle.visible,true);disposeRavelVisual(root);
});
test('render choreography never writes authoritative simulation data',()=>{
 const {e,root}=sample();const before=JSON.stringify(e);root.userData.updateAuthoredMotion(e,33,{});assert.equal(JSON.stringify(e),before);disposeRavelVisual(root);
});
test('disposal releases each shared GPU resource once and detaches the root',()=>{
 const {root}=sample();const parent=new THREE.Group();parent.add(root);const geometries=new Set(),materials=new Set();
 root.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});let n=0;
 for(const g of[...geometries,...materials])g.addEventListener('dispose',()=>n++);
 disposeRavelVisual(root);disposeRavelVisual(root);assert.equal(n,geometries.size+materials.size);assert.equal(root.parent,null);
});
