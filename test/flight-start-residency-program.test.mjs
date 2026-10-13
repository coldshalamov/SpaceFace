import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { load } from './flight-start-support.mjs';
const { prepareStartupGeometryResidency } = await load('04-residency-program','src/render/startupGpuResidency.js');
const { beginScenePipelineReadinessBatch } = await load('04-residency-program','src/render/bloom.js');
function fixture(result={contextLost:false}) {
 let target=null,draws=0,compiles=0,active=true;const saved={name:'presented'};target=saved;
 const renderer={autoClear:true,xr:{enabled:true},shadowMap:{autoUpdate:true,needsUpdate:true},info:{memory:{geometries:0}},getRenderTarget:()=>target,setRenderTarget:v=>{target=v;},
  compileAsync:async(scene)=>{compiles++;assert.equal(target?.texture?.name,'SF_StartupGeometryResidencyTarget');await Promise.resolve();assert.equal(target,saved,'target restored while compile promise waits');assert.equal(renderer.xr.enabled,true);return result;},
  render(scene){assert.ok(compiles>0,'first raw/instanced residency draw must already be linked');assert.notEqual(target,saved);draws++;},
 };
 return {renderer,saved,get draws(){return draws;},get compiles(){return compiles;},get target(){return target;},isActive:()=>active,cancel:()=>{active=false;}};
}
test('raw and instanced private variants compile before drawing and restore presented state during every wait',async()=>{
 const f=fixture();const root=new THREE.Group();root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2));
 const out=await prepareStartupGeometryResidency(f.renderer,root,{yieldToMain:async()=>assert.equal(f.target,f.saved),paceQueue:async()=>{},maxDrawables:1});
 assert.ok(f.compiles>0);assert.ok(f.draws>0);assert.equal(out.skipped,false);assert.equal(f.target,f.saved);
 root.traverse(o=>{if(o.geometry)assert.equal(o.geometry.userData.spacefaceGpuResident,true);});
});
for(const result of [{contextLost:true},{readinessTimedOut:true}])test(`failed readiness never stamps geometry (${JSON.stringify(result)})`,async()=>{
 const f=fixture(result),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());
 await assert.rejects(prepareStartupGeometryResidency(f.renderer,mesh,{yieldToMain:async()=>{},paceQueue:async()=>{}}),/Residency program was not ready/);
 assert.equal(f.draws,0);assert.notEqual(mesh.geometry.userData.spacefaceGpuResident,true);assert.equal(f.target,f.saved);
});
test('supersession after readiness refuses upload and releases proxies',async()=>{
 const f=fixture(),mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial());f.cancel();
 await assert.rejects(prepareStartupGeometryResidency(f.renderer,mesh,{isActive:f.isActive,yieldToMain:async()=>{},paceQueue:async()=>{}}),/Residency program/);
 assert.equal(f.draws,0);assert.equal(f.target,f.saved);assert.notEqual(mesh.geometry.userData.spacefaceGpuResident,true);
});
test('real readiness path does not join an open cook batch that has not drained',async()=>{
 const f=fixture(),props=new WeakMap(),variants=new Set(),listeners=new Map();
 const gl={isContextLost:()=>false};
 f.renderer.getContext=()=>gl;f.renderer.domElement={addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k)};
 f.renderer.extensions={get:()=>({})};f.renderer.properties={get:mat=>props.get(mat)||{}};
 f.renderer.compile=(scene)=>{
  assert.notEqual(f.target,f.saved);const materials=new Set();scene.traverse(o=>{if(!o.material)return;variants.add(o.isInstancedMesh?'instanced':'raw');materials.add(o.material);props.set(o.material,{currentProgram:{program:{},isReady:()=>true}});});return materials;
 };
 f.renderer.render=()=>{assert.equal(listeners.size,0);};
 const batch=beginScenePipelineReadinessBatch(f.renderer),root=new THREE.Group();
 root.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial()),new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial(),2));
 let complete=false;const admission=prepareStartupGeometryResidency(f.renderer,root,{yieldToMain:async()=>{},paceQueue:async()=>{}}).then(out=>{complete=true;return out;});
 // Every application yield is controlled and immediately resolved; the module is preloaded.
 for(let i=0;i<80;i++)await Promise.resolve();
 try {assert.equal(complete,true,'private program readiness must settle without the cook batch drain');assert.deepEqual([...variants].sort(),['instanced','raw']);assert.equal(f.target,f.saved);}
 finally {batch.close();await admission;}
});
