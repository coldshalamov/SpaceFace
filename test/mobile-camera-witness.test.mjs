import test from 'node:test';
import assert from 'node:assert/strict';
import { collectMobileCameraWitness as collectProductionCameraWitness } from '../scripts/lib/mobileCameraWitness.mjs';
import { collectCameraWitness } from '../src/render/cameraWitness.js';
import { createRuntimeWitness } from '../src/core/runtimeWitness.js';
const collectMobileCameraWitness = () => collectCameraWitness(globalThis.SF?.state);
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
 const result=runInNewContext(`(${collectCameraWitness.toString()})(SF.state)`,{SF:{state}});
 assert.equal(result.player.render.visited,512);assert.equal(result.player.render.truncated,true);assert.equal(result.player.render.existingWorldBounds,null);
 assert.doesNotThrow(()=>JSON.stringify(result));
});
test('probe captures diagnostics only at screenshot checkpoints and leaves visibility unverified',async()=>{
 const { readFileSync }=await import('node:fs');
 const source=readFileSync(new URL('../scripts/probe-deployed-mobile.mjs',import.meta.url),'utf8');
 assert.equal((source.match(/snapshot\(page, true\)/g)||[]).length,3);
 assert.doesNotMatch(source,/unobstructed mobile flight/);
 assert.match(source,/worldVisibility: 'unverified'/);
 assert.doesNotMatch(collectCameraWitness.toString(),/updateMatrixWorld\(|updateProjectionMatrix\(|setFromObject\(|\.raycast\(/);
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
test('production witness callback is on-demand, fail-closed and returns detached plain facts',()=>{
 let calls=0;const source={available:true,nested:{x:1}};
 const witness=createRuntimeWitness({readCamera:()=>{calls++;return source;}});
 witness.snapshot();witness.observe({});witness.recent();assert.equal(calls,0);
 const facts=witness.cameraSnapshot();assert.equal(calls,1);facts.nested.x=5;assert.equal(source.nested.x,1);
 assert.equal(createRuntimeWitness({readCamera(){throw Error('no');}}).cameraSnapshot().available,false);
 const cyclic={};cyclic.self=cyclic;assert.equal(createRuntimeWitness({readCamera:()=>cyclic}).cameraSnapshot().available,false);
});
test('production-minified presentation bundle publishes camera facts with SF debug global absent',async()=>{
 const { build }=await import('esbuild');const { runInNewContext }=await import('node:vm');
 const { fileURLToPath }=await import('node:url');
 const built=await build({stdin:{contents:`export { createPresentationRunner } from '../src/core/presentationRunner.js'; SF_DEBUG_ONLY: globalThis.window.SF = { forbidden: true };`,resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,write:false,format:'iife',globalName:'ProductionWitnessSmoke',platform:'browser',minify:true,treeShaking:true,dropLabels:['SF_DEBUG_ONLY'],define:{__SPACEFACE_PRODUCTION__:'true',__SPACEFACE_DEMO__:'false',process:JSON.stringify({env:{NODE_ENV:'production'},versions:{},argv:[]})},logLevel:'silent'});
 const context={window:{},performance:{now:()=>0},console,setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){}};runInNewContext(built.outputFiles[0].text,context);
 const state={tick:42,simTime:1,timeScale:1,input:{actions:{}},meta:{seed:99},world:{currentSectorId:'sector_test'},render:{camera:{position:{x:1,y:20,z:3},matrixWorld:matrix,matrixWorldInverse:matrix,projectionMatrix:matrix}}};
 const runner=context.ProductionWitnessSmoke.createPresentationRunner(state,{get:()=>null},{advance(){},getDiagnostics:()=>({}),close(){}},{requestFrame:()=>1,cancelFrame(){},visibilityTarget:null,focusTarget:null,inputResumeTarget:null,lifecyclePort:null,nowMs:()=>0});
 try {
  assert.equal(context.window.SF,undefined);assert.equal(typeof context.window.__SF_WITNESS__.cameraSnapshot,'function');
  context.__SF_WITNESS__=context.window.__SF_WITNESS__;
  const facts=runInNewContext(`(${collectProductionCameraWitness.toString()})()`,context);
  assert.equal(facts.available,true);assert.equal(facts.seed,99);assert.equal(facts.tick,42);assert.equal(facts.camera.position.y,20);
  assert.doesNotThrow(()=>JSON.stringify(facts));assert.equal(context.window.SF,undefined);
 }finally{runner.close();}
});
