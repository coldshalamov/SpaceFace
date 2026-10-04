import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildVesperVisual, disposeVesperVisual } from '../src/render/characters/vesperModel.js';
import { vesperEntitySpec } from '../src/systems/vesper.js';
function visual(i=-1){const e=vesperEntitySpec(undefined,i),v=buildVesperVisual(e);return {e,v,p:e.data.vesperPose,parts:v.userData.vesperParts};}
function frame(f,t,phase='listen',a11y={}){Object.assign(f.p,{met:phase!=='sleep',phase,simTime:t});f.v.userData.updateAuthoredMotion(f.e,t,a11y);f.v.updateMatrixWorld(true);}
test('all four assets have finite real triangular surfaces, no sprites, and distinct silhouettes',()=>{
 const signatures=[];
 for(const i of [-1,0,1,2]){const f=visual(i);let triangles=0;f.v.traverse(o=>{
  assert.equal(!!o.isSprite,false);assert.equal(!!o.isPoints,false);if(!o.isMesh)return;
  const p=o.geometry.attributes.position;assert.ok(p.count>0);for(const x of p.array)assert.ok(Number.isFinite(x));
  assert.ok(o.geometry.attributes.normal);const count=o.geometry.index?.count??p.count;assert.equal(count%3,0);triangles+=count/3;
  if(o.geometry.index)for(const n of o.geometry.index.array)assert.ok(n>=0&&n<p.count);
 });assert.ok(triangles>0);signatures.push(triangles);assert.equal(f.v.userData.kind,'drone');disposeVesperVisual(f.v);}
 assert.equal(new Set(signatures).size,4);
});
test('four attached sails fold, transition smoothly, and open for the song',()=>{
 const f=visual();assert.equal(f.parts.wings.length,4);frame(f,2,'sleep');const sleep=Math.abs(f.parts.wings[0].joint.rotation.x);
 f.p.previousPhase='sleep';f.p.phaseAt=3;frame(f,3,'listen',{reducedMotion:true});const atStart=Math.abs(f.parts.wings[0].joint.rotation.x);
 frame(f,3.4,'listen',{reducedMotion:true});const middle=Math.abs(f.parts.wings[0].joint.rotation.x);
 frame(f,4,'listen',{reducedMotion:true});const end=Math.abs(f.parts.wings[0].joint.rotation.x);
 assert.ok(atStart>middle&&middle>end);assert.ok(sleep>end);
 f.p.bloomAt=4;f.p.previousPhase='listen';f.p.phaseAt=4;frame(f,5,'bloom');assert.equal(f.parts.chorus.visible,true);
 assert.ok(Math.abs(f.parts.wings[0].joint.rotation.x)<sleep);disposeVesperVisual(f.v);
});
test('harmonic surfaces emerge, persist, dissipate and leave no permanent glow',()=>{
 const f=visual();f.p.bloomAt=5;frame(f,5,'bloom');const uniforms=f.parts.chorus.material.uniforms;
 assert.equal(uniforms.uEnergy.value,0);frame(f,6,'bloom');const peak=uniforms.uEnergy.value;assert.ok(peak>.5);
 frame(f,10.5,'listen');assert.ok(uniforms.uEnergy.value<peak);frame(f,11.1,'listen');assert.equal(f.parts.chorus.visible,false);
 disposeVesperVisual(f.v);
 for(const i of [0,1,2]){const b=visual(i);b.p.noteAt=3;b.p.notePower=.8;frame(b,3.15);const initial=b.parts.resonance.scale.x;
  assert.equal(b.parts.resonance.visible,true);frame(b,4);assert.ok(b.parts.resonance.scale.x>initial);
  frame(b,5.5);assert.equal(b.parts.resonance.visible,false);disposeVesperVisual(b.v);}
});
test('clock comes only from published sim time: pause freezes all transforms and uniforms',()=>{
 const f=visual();f.p.bloomAt=3;frame(f,4,'bloom');const first=f.parts.wings[0].joint.matrixWorld.elements.slice();
 const time=f.parts.chorus.material.uniforms.uTime.value;f.v.userData.updateAuthoredMotion(f.e,999,{});f.v.updateMatrixWorld(true);
 assert.deepEqual(f.parts.wings[0].joint.matrixWorld.elements,first);assert.equal(f.parts.chorus.material.uniforms.uTime.value,time);disposeVesperVisual(f.v);
});
test('reduced motion stops idle bob and articulation; reduced flash lowers effect energy',()=>{
 const f=visual();f.p.previousPhase='listen';frame(f,4,'listen',{reducedMotion:true,reducedFlash:true});
 const first=f.parts.wings[0].joint.rotation.toArray();frame(f,8,'listen',{reducedMotion:true,reducedFlash:true});
 assert.deepEqual(f.parts.wings[0].joint.rotation.toArray(),first);assert.equal(f.parts.body.position.y,0);
 assert.equal(f.parts.fingers[0].rotation.y,0);f.p.bloomAt=8;frame(f,9,'bloom');const energy=f.parts.chorus.material.uniforms.uEnergy.value;
 frame(f,9,'bloom',{reducedMotion:true,reducedFlash:true});assert.ok(f.parts.chorus.material.uniforms.uEnergy.value<energy);disposeVesperVisual(f.v);
});
test('missing bell hides its bridge indicator; renderer never mutates simulation',()=>{
 const f=visual();f.p.bellAlive[1]=false;const before=JSON.stringify(f.e);frame(f,0,'sleep');
 // frame writes the input pose for this test; the render adapter itself must not.
 const input=JSON.stringify(f.e);f.v.userData.updateAuthoredMotion(f.e,10,{});assert.equal(JSON.stringify(f.e),input);
 assert.equal(f.parts.indicators[1].visible,false);assert.ok(before.length>0);disposeVesperVisual(f.v);
});
test('final-owner cleanup disposes each geometry and material once, and is idempotent',()=>{
 const f=visual(),scene=new THREE.Scene();scene.add(f.v);const resources=new Set();f.v.traverse(o=>{if(o.geometry)resources.add(o.geometry);if(o.material)resources.add(o.material);});
 const seen=new Map();for(const r of resources)r.addEventListener('dispose',()=>seen.set(r,(seen.get(r)||0)+1));
 disposeVesperVisual(f.v);disposeVesperVisual(f.v);assert.equal(f.v.parent,null);assert.equal(seen.size,resources.size);for(const n of seen.values())assert.equal(n,1);
});
test('built visuals carry the authored stamp the opening staging gate requires',()=>{
 // A character drone on the startup runway with no authoredAssetState is counted as
 // forever-pending staging and holds New Game behind "still staging" (morrowModel precedent).
 for(const i of [-1,0,1,2]){const f=visual(i);
  assert.equal(f.v.userData.authoredAssetState,'authored');
  assert.equal(f.v.userData.authoredVisualRoot,'authored-root');
  disposeVesperVisual(f.v);}
});
