import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { buildBracketVisual, disposeBracketVisual } from '../src/render/characters/bracketModel.js';
import { bracketEntitySpec } from '../src/systems/bracket.js';
import { freezeStaticChildMatrices } from '../src/render/staticChildMatrices.js';
const parts=['keeper','ball','post-left','post-right','bumper-left','bumper-right'];
function entity(part){const e=bracketEntitySpec(part);e.vel={x:0,y:0,z:0};return e;}
test('six authored parts have finite geometry, no missing textures, bounded triangle and draw budget',()=>{
 let meshes=0,triangles=0;
 for(const part of parts){const e=entity(part),root=buildBracketVisual(e);root.updateMatrixWorld(true);
  assert.equal(root.userData.authoredAssetState,'authored');assert.equal(root.userData.bracket,true);
  root.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;
   for(const value of o.geometry.attributes.position.array)assert.ok(Number.isFinite(value));assert.equal(o.material.map,null);}});
  const box=new THREE.Box3().setFromObject(root);assert.ok(Number.isFinite(box.min.x));assert.ok(box.max.x-box.min.x<125);
  disposeBracketVisual(root);
 }
 assert.ok(meshes<=110,`meshes: ${meshes}`);assert.ok(triangles<25000,`triangles: ${triangles}`);
});
test('authored joints and changing score/clock transforms survive renderer static-child freezing',()=>{
 for(const part of ['keeper','post-left','bumper-left']){const e=entity(part),root=buildBracketVisual(e);freezeStaticChildMatrices(root);
  for(const name of part==='keeper'?['armoured_sorter_core','cyclops_head','tracking_iris','left_catcher','score_light_0']:
   part==='post-left'?['shot_clock','score_light_0']:['powered_rebound_plunger'])assert.equal(root.getObjectByName(name).matrixAutoUpdate,true,name);
  e.data.bracketPose={phase:'play',keeperPhase:'tell',tell:.8,targetX:20,awake:true,results:[1,0],remaining:.3,gaze:1,bumpAt:2};
  root.userData.updateAuthoredMotion(e,2.25,{});root.updateMatrixWorld(true);
  if(part==='post-left'){assert.equal(root.getObjectByName('shot_clock').scale.x,.3);assert.equal(root.getObjectByName('miss_cross_1').visible,true);}
  disposeBracketVisual(root);
 }
});
test('reduced motion suppresses goal burst, idle motion and celebrating oscillation',()=>{
 const e=entity('post-left'),root=buildBracketVisual(e);e.data.bracketPose={goalAt:5,results:[1],phase:'play'};
 root.userData.updateAuthoredMotion(e,5.3,{});assert.ok(root.getObjectByName('goal_pressure_hoop_0').visible);
 root.userData.updateAuthoredMotion(e,5.3,{reducedMotion:true,reducedFlash:true});assert.equal(root.getObjectByName('goal_pressure_hoop_0').visible,false);
 const k=entity('keeper'),kr=buildBracketVisual(k);k.data.bracketPose={gesture:'victory',gestureAt:5,phase:'play',keeperPhase:'tell',targetX:15,tell:1};
 kr.userData.updateAuthoredMotion(k,5.3,{reducedMotion:true});assert.equal(kr.getObjectByName('armoured_sorter_core').position.y,0);assert.equal(kr.getObjectByName('armoured_sorter_core').rotation.z,0);
 disposeBracketVisual(root);disposeBracketVisual(kr);
});
test('model posing cannot mutate simulation or depend on ambient random',()=>{
 const old=Math.random; // Three uses random UUIDs during construction, never in the update path.
 const e=entity('keeper'),root=buildBracketVisual(e),before=JSON.stringify(e);
 Math.random=()=>{throw Error('ambient visual random in update');};
 try{for(let i=0;i<500;i++)root.userData.updateAuthoredMotion(e,i/60,{});assert.equal(JSON.stringify(e),before);}finally{Math.random=old;disposeBracketVisual(root);}
});
test('disposal is idempotent and every referenced GPU allocation is released once',()=>{
 for(const part of parts){const root=buildBracketVisual(entity(part)),scene=new THREE.Scene();scene.add(root);
  const geos=new Set(),mats=new Set();root.traverse(o=>{if(o.geometry)geos.add(o.geometry);if(o.material)mats.add(o.material);});
  let g=0,m=0;for(const v of geos)v.addEventListener('dispose',()=>g++);for(const v of mats)v.addEventListener('dispose',()=>m++);
  disposeBracketVisual(root);disposeBracketVisual(root);assert.equal(g,geos.size);assert.equal(m,mats.size);assert.equal(root.parent,null);
 }
});
test('live visual factory dispatches BRACKET before generic drone/payload art',async()=>{
 const s=await readFile(new URL('../src/render/visualFactory.js',import.meta.url),'utf8');
 assert.match(s,/if \(e.data\?\.bracketPart\) return stampBuiltVisual\(buildBracketVisual\(e\)\)/);
});

test('simulation timestamps freeze authored motion when render time advances during pause',()=>{
 const e=entity('keeper'),root=buildBracketVisual(e);e.data.bracketPose={simTime:9,gesture:'concede',gestureAt:8,phase:'play',awake:true};
 root.userData.updateAuthoredMotion(e,90,{});root.updateMatrixWorld(true);const before=root.getObjectByName('armoured_sorter_core').matrixWorld.elements.slice();
 root.userData.updateAuthoredMotion(e,140,{});root.updateMatrixWorld(true);assert.deepEqual(root.getObjectByName('armoured_sorter_core').matrixWorld.elements,before);
 disposeBracketVisual(root);
});
