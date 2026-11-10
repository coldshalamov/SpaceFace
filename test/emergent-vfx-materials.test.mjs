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
const primaryMeshes=(pools)=>[pools.arcs,pools.rings,pools.gels,pools.prisms];
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
  assert.equal(primaryMeshes(pools).every(mesh=>mesh.isInstancedMesh),true); assert.equal(pools.particles.capacity,96);
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

test('current sheath and wet folds remain bounded while crystal optical lanes cross no wrapped face',()=>{
  const pools=createEmergentPrimitivePools();
  const arcSurface=pools.arcs.geometry.attributes.aSurface;
  const members=new Set();
  for(let i=0;i<arcSurface.count;i++)members.add(arcSurface.getZ(i));
  assert.equal(members.size,6,'a full-span outer conductor is distinct from the core and four contact forks');
  for(const mesh of primaryMeshes(pools)) {
    assert.ok(mesh.geometry.attributes.position.count<4096,'static detail stays within a small pooled geometry budget');
    if(mesh.geometry.index)assert.ok(mesh.geometry.index.array instanceof Uint16Array);
  }
  const prism=pools.prisms.geometry,uv=prism.attributes.aSurface,pos=prism.attributes.position;
  for(let i=0;i<pos.count;i++)assert.ok(Math.hypot(pos.getX(i),pos.getZ(i))<=1,
    'crystal optical detail fits the native normalized gameplay footprint');
  for(let i=0;i<uv.count;i+=3) {
    if(uv.getY(i)===uv.getY(i+1)&&uv.getY(i)===uv.getY(i+2))continue;
    const u=[uv.getX(i),uv.getX(i+1),uv.getX(i+2)];
    assert.ok(Math.max(...u)-Math.min(...u)<=0.126,'each side carries one continuous optical face');
  }
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.physical.vertexShader,fragmentShader:THREE.ShaderLib.physical.fragmentShader};
  pools.gels.material.onBeforeCompile(shader);
  assert.ok(shader.fragmentShader.indexOf('clearcoatNormal=normal')>
    shader.fragmentShader.indexOf('#include <clearcoat_normal_fragment_begin>'),
  'dynamic wet normal is assigned after the physical material declares its clearcoat normal');
  pools.dispose();
});

test('simulation pause sleeps uploads, live animation uses retained uniforms, and snapshot/RNG stay untouched',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  state.rng=()=>{throw new Error('presentation consumed simulation RNG');};
  const before=JSON.stringify(state);pools.update(state);
  const matrices=primaryMeshes(pools).map(mesh=>mesh.instanceMatrix.array);
  const matrixVersions=primaryMeshes(pools).map(mesh=>mesh.instanceMatrix.version);
  const responseVersions=primaryMeshes(pools).map(mesh=>mesh.geometry.attributes.iResponse.version);
  pools.update(state);
  assert.deepEqual(primaryMeshes(pools).map(mesh=>mesh.instanceMatrix.version),matrixVersions);
  assert.deepEqual(primaryMeshes(pools).map(mesh=>mesh.geometry.attributes.iResponse.version),responseVersions);
  assert.equal(JSON.stringify(state),before);
  state.simTime+=0.3;pools.update(state);
  assert.equal(uniforms(pools.arcs).uTime.value,state.simTime);
  for(let i=0;i<4;i++)assert.equal(primaryMeshes(pools)[i].instanceMatrix.array,matrices[i]);
  assert.deepEqual(primaryMeshes(pools).map(mesh=>mesh.instanceMatrix.version),matrixVersions);
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
  const stable=primaryMeshes(pools).map(response);
  state.simTime+=2;pools.update(state);
  assert.deepEqual(primaryMeshes(pools).map(response),stable,'sustained receipt structure remains frozen');
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
  for(const mesh of primaryMeshes(pools)){assert.equal(mesh.visible,false);assert.equal(mesh.count,0);}
  pools.dispose();pools.dispose();assert.equal(pools.group.children.length,0);
});

test('persistent matter receives supply and drainage fronts while source extent and reflecting plane stay fixed',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  state.emergent.fields[0].life=EMERGENT_TUNING.viscosityLife;
  state.emergent.prisms[0].life=EMERGENT_TUNING.prismLife;
  pools.update(state);
  const matrices=[pools.gels,pools.prisms].map(mesh=>Array.from(mesh.instanceMatrix.array.subarray(0,16)));
  for(const mesh of [pools.gels,pools.prisms]) assert.equal(response(mesh)[1],0,'new material has not filled its full shape');
  state.simTime+=0.12;
  state.emergent.fields[0].life-=0.12;state.emergent.prisms[0].life-=0.12;pools.update(state);
  for(const mesh of [pools.gels,pools.prisms]) {
    assert.ok(response(mesh)[1]>0&&response(mesh)[1]<1,'local shader front receives partial supply');
    assert.equal(response(mesh)[3],0);
  }
  state.simTime+=1;
  state.emergent.fields[0].life=0.08;state.emergent.prisms[0].life=0.06;pools.update(state);
  for(const [i,mesh] of [pools.gels,pools.prisms].entries()) {
    assert.equal(response(mesh)[1],1,'retirement does not reverse the supplied-body extent');
    assert.ok(response(mesh)[3]>0.8,'local drainage/delamination front progresses independently');
    assert.deepEqual(Array.from(mesh.instanceMatrix.array.subarray(0,16)),matrices[i],'no whole-object scale or yaw animation');
  }
  pools.dispose();
});

test('saturation retains bounded capacities and stable buffers across repeated initialization',()=>{
  for(let run=0;run<2;run++) {
    const pools=createEmergentPrimitivePools(),presentation=[];
    for(const kind of ['arc','ring','gel','prism'])for(let i=0;i<90;i++)presentation.push({kind,x:i*4,z:0,x2:i*4+2,z2:1,scale:3,yaw:0});
    const state={simTime:0,emergent:{presentation,presentationCount:presentation.length}};
    assert.deepEqual(pools.update(state),{arcs:64,rings:24,gels:16,prisms:16});
    const buffers=primaryMeshes(pools).map(mesh=>mesh.geometry.attributes.iResponse.array);
    state.simTime=1;pools.update(state);
    for(let i=0;i<4;i++)assert.equal(primaryMeshes(pools)[i].geometry.attributes.iResponse.array,buffers[i]);
    pools.dispose();
  }
});

test('authoritative arc lifetime narrows and cools the discharge without moving either endpoint',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  pools.update(state);
  const strike=response(pools.arcs),matrix=Array.from(pools.arcs.instanceMatrix.array.subarray(0,16));
  state.simTime+=0.15;state.emergent.flashes[0].ttl=0.03;pools.update(state);
  const cooling=response(pools.arcs);
  assert.ok(cooling[1]<strike[1]*0.60,'current cross-section retracts during cooling');
  assert.ok(cooling[2]<strike[2]*0.20,'radiance retires with the true receipt lifetime');
  assert.ok(cooling[3]>0.85,'shader receives true late-life phase for branch retraction');
  assert.deepEqual(Array.from(pools.arcs.instanceMatrix.array.subarray(0,16)),matrix);
  const paused=response(pools.arcs);pools.update(state);assert.deepEqual(response(pools.arcs),paused);
  pools.dispose();
});

test('reduced-motion discharge retains width but still communicates cooling and authoritative expiry',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  state.settings.video.motionReduce=true;pools.update(state);const early=response(pools.arcs);
  state.simTime+=0.17;state.emergent.flashes[0].ttl=0.01;pools.update(state);const late=response(pools.arcs);
  assert.equal(early[1],late[1]);assert.ok(late[2]<early[2]);assert.ok(late[3]>early[3]);
  assert.equal(uniforms(pools.arcs).uMotion.value,0);
  state.emergent.presentationCount=0;pools.update(state);assert.equal(pools.arcs.count,0);
  pools.dispose();
});

test('sparse transport bursts once per active packet, stays bounded, and retires without respawning each frame',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();
  const scene=new THREE.Scene();scene.add(pools.group);
  pools.update(state);assert.equal(pools.particles.live,16);
  const first=pools.particles.system.particles[0],start=first.position.clone();
  pools.update(state);assert.equal(pools.particles.live,16);assert.ok(first.position.equals(start));
  // The thermal publisher creates another overlapping receipt every tick. These are updates
  // to powered contact, not permission for an unbounded spray on every rendered frame.
  for(let i=0;i<30;i++) {
    state.simTime+=1/60;
    state.emergent.flashes[0]={...state.emergent.presentation[0],ttl:0.2};
    pools.update(state);assert.ok(pools.particles.live<=16);
  }
  assert.equal(pools.particles.live,0);
  state.emergent.presentationCount=0;pools.update(state);
  state.simTime+=0.01;state.emergent.presentationCount=4;pools.update(state);
  assert.equal(pools.particles.live,16,'a new lifecycle can emit a fresh packet');
  pools.dispose();assert.equal(pools.particles.live,0);
});

test('transport reprojects during pause and reduced motion preserves the emitted parcel pose',()=>{
  const pools=createEmergentPrimitivePools(),state=fixture();state.settings.video.motionReduce=true;
  const scene=new THREE.Scene();scene.add(pools.group);
  let origin=0;const project=(x,z,out)=>{out.x=x-origin;out.z=z-origin;};
  pools.update(state,project);const p=pools.particles.system.particles[0],start=p.position.clone();
  origin=80;pools.update(state,project);
  assert.ok(p.position.distanceTo(start.clone().add(new THREE.Vector3(-80,0,-80)))<1e-6);
  const paused=p.position.clone();state.simTime+=0.05;pools.update(state,project);
  assert.ok(p.position.distanceTo(paused)<1e-6,'cooling does not move parcels under reduced motion');
  pools.dispose();
});
