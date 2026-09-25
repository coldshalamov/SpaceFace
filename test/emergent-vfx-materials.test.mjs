import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createEmergentPrimitivePools } from '../src/render/forceLanguage/emergentPrimitivePools.js';
import { EMERGENT_TUNING } from '../src/data/emergentPrimitives.js';

function fixture() {
  const presentation = [
    { kind:'arc',x:10,z:8,x2:0,z2:0,scale:1,yaw:0 },
    { kind:'ring',x:20,z:0,x2:20,z2:0,scale:8,yaw:0 },
    { kind:'gel',x:0,z:20,x2:0,z2:20,scale:12,yaw:0 },
    { kind:'prism',x:20,z:20,x2:20,z2:20,scale:2.4,yaw:0.4 },
  ];
  return {simTime:5,settings:{video:{}},emergent:{
    presentation,presentationCount:4,
    flashes:presentation.slice(0,2).map(p=>({...p,ttl:0.18})),
    fields:[{x:0,z:20,radius:12,life:EMERGENT_TUNING.viscosityLife-1}],
    prisms:[{x:20,z:20,radius:2.4,yaw:0.4,life:EMERGENT_TUNING.prismLife-1}],
  }};
}
const response=(mesh)=>Array.from(mesh.geometry.attributes.iResponse.array.subarray(0,4));
const uniforms=(mesh)=>mesh.material.uniforms||mesh.material.userData.uniforms;

test('electrical contact preserves both zero-coordinate endpoints and floating-origin reprojection',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture(),matrix=new THREE.Matrix4();
  let ox=100,oz=-30;
  const project=(x,z,out)=>{out.x=x-ox;out.z=z-oz;};
  pools.update(state,project);pools.arcs.getMatrixAt(0,matrix);
  const start=new THREE.Vector3(-0.5,0,0).applyMatrix4(matrix),end=new THREE.Vector3(0.5,0,0).applyMatrix4(matrix);
  assert.ok(start.distanceTo(new THREE.Vector3(10-ox,0.5,8-oz))<1e-5);
  assert.ok(end.distanceTo(new THREE.Vector3(-ox,0.5,-oz))<1e-5);
  const seed=response(pools.arcs)[0];
  ox=220;oz=90;pools.update(state,project);pools.arcs.getMatrixAt(0,matrix);
  assert.equal(response(pools.arcs)[0],seed,'origin shifts retain the same current identity');
  assert.ok(new THREE.Vector3(0.5,0,0).applyMatrix4(matrix).distanceTo(new THREE.Vector3(-ox,0.5,-oz))<1e-5);
  pools.dispose();
});

test('deposited matter and prism shards are opaque scene-lit bodies with four bounded instance draws',()=>{
  const pools=createEmergentPrimitivePools();pools.update(fixture());
  assert.equal(pools.group.children.length,4);
  for(const body of [pools.gels,pools.prisms]) {
    assert.equal(body.material.isMeshPhysicalMaterial,true);
    assert.equal(body.material.transparent,false);
    assert.equal(body.material.depthWrite,true);
    assert.equal(body.material.transmission,0,'refraction appearance adds no scene-copy pass');
    const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
    body.material.onBeforeCompile(shader);
    assert.ok(shader.vertexShader.includes('articulate(position)'));
    assert.equal(shader.uniforms.uTime,uniforms(pools.arcs).uTime);
  }
  assert.equal(pools.prisms.geometry.index,null,'independent face normals preserve optical facets');
  pools.dispose();
});

test('simulation pause sleeps uploads, live animation uses retained uniforms, and snapshot/RNG stay untouched',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  state.rng=()=>{throw new Error('presentation consumed simulation RNG');};
  const before=JSON.stringify(state);pools.update(state);
  const matrices=pools.group.children.map(mesh=>mesh.instanceMatrix.array);
  const matrixVersions=pools.group.children.map(mesh=>mesh.instanceMatrix.version);
  const responseVersions=pools.group.children.map(mesh=>mesh.geometry.attributes.iResponse.version);
  pools.update(state);
  assert.deepEqual(pools.group.children.map(mesh=>mesh.instanceMatrix.version),matrixVersions);
  assert.deepEqual(pools.group.children.map(mesh=>mesh.geometry.attributes.iResponse.version),responseVersions);
  assert.equal(JSON.stringify(state),before);
  state.simTime+=0.3;pools.update(state);
  assert.equal(uniforms(pools.arcs).uTime.value,state.simTime);
  for(let i=0;i<4;i++)assert.equal(pools.group.children[i].instanceMatrix.array,matrices[i]);
  assert.deepEqual(pools.group.children.map(mesh=>mesh.instanceMatrix.version),matrixVersions);
  pools.dispose();
});

test('producer slot reuse cannot transfer an old effect identity to another kind or deployment',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  pools.update(state);const old=response(pools.arcs)[0];
  state.emergent.presentationCount=0;pools.update(state);
  assert.equal(pools.arcs.count,0);
  state.simTime+=1;state.emergent.presentationCount=4;pools.update(state);
  assert.notEqual(response(pools.arcs)[0],old);
  const previous=response(pools.gels)[0];
  state.emergent.presentation.reverse();pools.update(state);
  assert.equal(response(pools.gels)[0],previous,'array order is not effect identity');
  pools.dispose();
});

test('repeated thermal receipts coalesce with stable shape identity and use the fresh pulse',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture(),arc=state.emergent.presentation[0];
  state.emergent.presentation=[arc,{...arc}];state.emergent.presentationCount=2;
  state.emergent.flashes=[{...arc,ttl:0.01},{...arc,ttl:0.18}];
  pools.update(state);assert.equal(pools.arcs.count,1);
  const first=response(pools.arcs);
  assert.ok(first[2]>0.8,'latest energy pulse survives coalescing');
  state.simTime+=1/60;state.emergent.flashes.shift();state.emergent.flashes.push({...arc,ttl:0.18});
  pools.update(state);assert.equal(response(pools.arcs)[0],first[0]);
  pools.dispose();
});

test('accessibility retains opaque material silhouettes, freezes transport, and attenuates radiance',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  state.settings.accessibility={reducedMotion:true,reducedFlash:true};pools.update(state);
  const u=uniforms(pools.arcs);assert.equal(u.uMotion.value,0);assert.equal(u.uFlash.value,0.24);
  assert.equal(response(pools.gels)[1],1);assert.equal(response(pools.prisms)[1],1);
  assert.equal(pools.gels.count,1);assert.equal(pools.prisms.count,1);
  const stable=pools.group.children.map(response);
  state.simTime+=2;pools.update(state);
  assert.deepEqual(pools.group.children.map(response),stable,'sustained receipt structure remains frozen');
  pools.dispose();
});

test('producer lifetime drives pressure expansion and deposited-matter retirement without extending force',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  state.emergent.flashes[1].ttl=0.21;pools.update(state);const early=response(pools.rings);
  state.simTime+=0.08;state.emergent.flashes[1].ttl=0.13;pools.update(state);
  const late=response(pools.rings);assert.ok(late[1]>early[1]);assert.ok(late[3]>early[3]);
  state.emergent.fields[0].life=0.10;pools.update(state);
  assert.ok(response(pools.gels)[3]>0.75);
  state.emergent.presentationCount=0;pools.update(state);
  for(const mesh of pools.group.children){assert.equal(mesh.visible,false);assert.equal(mesh.count,0);}
  pools.dispose();pools.dispose();assert.equal(pools.group.children.length,0);
});

test('saturation retains bounded capacities and stable buffers across repeated initialization',()=>{
  for(let run=0;run<2;run++) {
    const pools=createEmergentPrimitivePools(),presentation=[];
    for(const kind of ['arc','ring','gel','prism'])for(let i=0;i<90;i++)presentation.push({kind,x:i*4,z:0,x2:i*4+2,z2:1,scale:3,yaw:0});
    const state={simTime:0,emergent:{presentation,presentationCount:presentation.length}};
    assert.deepEqual(pools.update(state),{arcs:64,rings:24,gels:16,prisms:16});
    const buffers=pools.group.children.map(mesh=>mesh.geometry.attributes.iResponse.array);
    state.simTime=1;pools.update(state);
    for(let i=0;i<4;i++)assert.equal(pools.group.children[i].geometry.attributes.iResponse.array,buffers[i]);
    pools.dispose();
  }
});
