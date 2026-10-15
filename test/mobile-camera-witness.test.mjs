import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMobileCameraWitness } from '../scripts/lib/mobileCameraWitness.mjs';
const matrix={elements:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]};
test('camera witness is read-only, serializable and honest about absent visibility proof',()=>{
 const previous=globalThis.SF;
 try {
  delete globalThis.SF;assert.equal(collectMobileCameraWitness().available,false);
  const player={id:1,type:'ship',radius:5,pos:{x:0,y:0,z:0}};
  const mesh={visible:true,position:player.pos,matrixWorld:matrix,geometry:{boundingBox:{min:{x:-5,y:-2,z:-5},max:{x:5,y:2,z:5}}},children:[]};
  const state={tick:42,playerId:1,entities:new Map([[1,player],[2,{id:2,type:'station',radius:200,pos:{x:10,y:0,z:0}}]]),render:{camera:{position:{x:0,y:20,z:10},matrixWorld:matrix,matrixWorldInverse:matrix,projectionMatrix:matrix,updateMatrixWorld(){throw Error('write forbidden');}},meshes:new Map([[1,mesh]])}};
  globalThis.SF={state};const before=JSON.stringify(state);const result=collectMobileCameraWitness();
  assert.equal(JSON.stringify(state),before);assert.equal(result.visibilityAssessment,'unverified');assert.equal(result.actualOccluderIds,null);
  assert.equal(result.player.render.existingWorldBounds.min.x,-5);assert.equal(result.entities[0].render,null);assert.equal(result.camera.near,null);assert.doesNotThrow(()=>structuredClone(result));
 }finally{globalThis.SF=previous;}
});
test('camera witness bounds entity reads and returned rows',()=>{
 const previous=globalThis.SF;
 try{globalThis.SF={state:{playerId:0,entities:new Map(Array.from({length:5000},(_,id)=>[id,{id,pos:{x:id,z:0},radius:id}]))}};
 const result=collectMobileCameraWitness();assert.equal(result.limits.inspected,4096);assert.equal(result.limits.truncated,true);assert.ok(result.entities.length<=16);
 }finally{globalThis.SF=previous;}
});
test('page-evaluated witness needs no module closure and caps malformed/cyclic meshes',async()=>{
 const { runInNewContext }=await import('node:vm');
 const mesh={matrixWorld:matrix,geometry:{boundingBox:{}},children:[]};mesh.children.push(mesh);
 const state={playerId:1,entities:new Map([[1,{id:1,pos:{x:0,y:0,z:0}}]]),render:{meshes:new Map([[1,mesh]])}};
 const result=runInNewContext(`(${collectMobileCameraWitness.toString()})()`,{SF:{state}});
 assert.equal(result.player.render.visited,512);assert.equal(result.player.render.truncated,true);assert.equal(result.player.render.existingWorldBounds,null);
 assert.doesNotThrow(()=>JSON.stringify(result));
});
test('probe captures diagnostics only at screenshot checkpoints and leaves visibility unverified',async()=>{
 const { readFileSync }=await import('node:fs');
 const source=readFileSync(new URL('../scripts/probe-deployed-mobile.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/snapshot\(page, true\)/g)||[]).length,3);
 assert.doesNotMatch(source,/unobstructed mobile flight/);
 assert.match(source,/worldVisibility: 'unverified'/);
 assert.doesNotMatch(collectMobileCameraWitness.toString(),/updateMatrixWorld\(|updateProjectionMatrix\(|setFromObject\(|\.raycast\(/);
});
test('non-entity scene geometry and seed/frame provenance remain bounded and explicit',()=>{
 const previous=globalThis.SF;
 try {
  const node={id:3,name:'planet-surface',type:'Mesh',matrixWorld:matrix,geometry:{boundingBox:{min:{x:-100,y:-100,z:-100},max:{x:100,y:100,z:100}}},children:[]};
  globalThis.SF={state:{meta:{seed:99},world:{currentSectorId:'sector_test',frameOrigin:{x:100,z:200},frameOriginSeq:3},render:{scene:{children:[node]}}}};
  const result=collectMobileCameraWitness();assert.equal(result.seed,99);assert.equal(result.frameOrigin.x,100);assert.equal(result.sceneGeometry.rows[0].name,'planet-surface');assert.equal(result.sceneGeometry.rows[0].span,200);assert.equal(result.actualOccluderIds,null);
 }finally{globalThis.SF=previous;}
});
test('object-shaped metadata cannot leak circular graphs into JSON reports',()=>{
 const previous=globalThis.SF;const cycle={};cycle.self=cycle;
 try{globalThis.SF={state:{mode:cycle,playerId:cycle,world:{currentSectorId:cycle},entities:new Map([[cycle,{id:cycle,type:cycle}]]),render:{scene:{children:[{type:cycle,name:cycle,geometry:{},children:[]}]}}}};
 const result=collectMobileCameraWitness();assert.equal(result.mode,null);assert.equal(result.playerId,null);assert.equal(result.sceneGeometry.rows[0].type,null);assert.doesNotThrow(()=>JSON.stringify(result));
 }finally{globalThis.SF=previous;}
});
