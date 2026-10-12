import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ForceParticleFlow } from '../src/render/vfx/forceParticleFlow.js';
import { MATERIAL_FLOW_KINDS, MATERIAL_FLOW_RECIPES, materialFlowRecipe } from '../src/render/vfx/livingVfxCatalog.js';
import { MATERIAL_STATE_SIZE, seedMaterialParcel, advanceMaterialParcel, sampleMaterialCurl } from '../src/render/vfx/materialFlow.js';
import { publishMaterialFields, materialFieldsForScene, advectMaterialEnvironment } from '../src/render/vfx/materialEnvironment.js';
import { createMaterialContactRead, readMaterialContact, inspectMaterialScene, registerMaterialOwner } from '../src/render/vfx/materialDirector.js';
import { normalizeField, fieldRawAcceleration } from '../src/core/fields/fieldKernel.js';
import { FIELD_MAX_ACCEL } from '../src/data/fields.js';

const near=(a,b,eps=1e-9)=>assert.ok(Math.abs(a-b)<=eps,`${a} != ${b} (epsilon ${eps})`);
const event=(kind='well')=>({kind,x:0,y:0,z:0,radius:60,seed:17,count:1,life:2});
function parcel(kind='well') {
  const m=new Float64Array(15), s=new Float64Array(MATERIAL_STATE_SIZE);
  const velocity=new Float64Array(3), scratch=new Float64Array(6);
  m[0]=MATERIAL_FLOW_KINDS.indexOf(kind); m[4]=1;m[6]=60;m[7]=.8;m[8]=.4;m[9]=1;m[13]=.5;m[14]=20;
  seedMaterialParcel(m,s,2,713,velocity,scratch);
  return {m,s,step(dt,env=null){advanceMaterialParcel(m,s,2,dt,null,0,velocity,scratch,env);}};
}
function withFlow(fn,capacity=16) {
  const scene=new THREE.Scene(), flow=new ForceParticleFlow(scene,{capacity});
  try{return fn(flow,scene);}finally{flow.dispose();}
}

test('catalog preserves shipped codes, rejects unknowns, and separates material verbs',()=>{
  assert.deepEqual(MATERIAL_FLOW_KINDS.slice(0,10),['well','repulsor','cone','skim','seed','heat','current','repair','transfer','goo']);
  assert.equal(materialFlowRecipe('unknown'),null);assert.equal(materialFlowRecipe(-1),null);
  assert.equal(MATERIAL_FLOW_RECIPES.length,16);
  for(const r of MATERIAL_FLOW_RECIPES){assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.rgb));}
  assert.ok(materialFlowRecipe('kinetic').curl<materialFlowRecipe('heat').curl/10);
  assert.notEqual(materialFlowRecipe('well').transport,materialFlowRecipe('repulsor').transport);
  assert.notEqual(materialFlowRecipe('goo').contact,materialFlowRecipe('kinetic').contact);
});
test('smooth material curl is finite, continuous, seeded, and divergence-free',()=>{
  const scratch=new Float64Array(6),sample=(x,y,z,seed=7)=>Array.from(sampleMaterialCurl(x,y,z,.4,seed,new Float64Array(3),scratch));
  const p=[.31,.41,.29],eps=1e-5,a=sample(...p),b=sample(...p,8);
  assert.ok(a.every(Number.isFinite));assert.notDeepEqual(a,b);
  let divergence=0;
  for(let axis=0;axis<3;axis++){
    const lo=[...p],hi=[...p];lo[axis]-=eps;hi[axis]+=eps;
    const l=sample(...lo),h=sample(...hi);divergence+=(h[axis]-l[axis])/(2*eps);
    assert.ok(Math.hypot(...h.map((v,i)=>v-l[i]))<.002);
  }
  near(divergence,0,1e-8);
});
test('a velocity perturbation changes the future path rather than being overwritten by age',()=>{
  const a=parcel(),b=parcel();a.step(.2);b.step(.2);b.s[3]+=.9;b.s[5]-=.6;
  a.step(.2);b.step(.2);
  assert.ok(Math.hypot(a.s[0]-b.s[0],a.s[2]-b.s[2])>.02);
  near(a.s[6],b.s[6]);
});
for(const kind of ['well','repulsor','cone','skim','heat','current','goo','kinetic']) {
  test(`${kind}: equal elapsed time agrees at 30, 60 and 120 Hz`,()=>{
    const cases=[30,60,120].map(fps=>{const p=parcel(kind);for(let i=0;i<fps/2;i++)p.step(1/fps);return p.s;});
    for(let i=0;i<15;i++){near(cases[0][i],cases[1][i],1e-8);near(cases[1][i],cases[2][i],1e-8);}
  });
}
test('ten recorded poses curve, are reused, and rebase without changing material history',()=>withFlow(f=>{
  f.emit(event());f.update(.4);
  const p=f.system.particles[0],s=p.forceKinematics;
  assert.equal(s[50],10);const saved=Array.from(s),before=p.position.clone();
  const tail=[s[45]-s[0],s[47]-s[2]],mid=[s[30]-s[0],s[32]-s[2]];
  assert.ok(Math.abs(tail[0]*mid[1]-tail[1]*mid[0])>1e-5,'history is not rebuilt as a straight velocity line');
  f.reproject(-2000,1700);assert.deepEqual(Array.from(s),saved);
  near(p.position.x,before.x-2000);near(p.position.z,before.z+1700);
  f.clear();f.emit(event('heat'));assert.strictEqual(f.system.particles[0].forceKinematics,s);
  assert.equal(s[50],1);assert.equal(s[13],0);
}));
test('moving body collision is swept, retained, and never aliases producer records',()=>withFlow(f=>{
  const environment={count:1,records:[{x:18,z:0,radius:4,vx:3,vz:0,strength:1}]};
  f.emit({...event('coherent'),environment,life:1});
  const p=f.system.particles[0];environment.records[0].x=10000;
  f.update(.25);
  assert.equal(p.forceContacts[0],18);assert.ok(p.forceKinematics[13]>0);
  const cx=18+3*p.forceKinematics[6];
  assert.ok(Math.hypot(p.position.x-cx,p.position.z)>=4-1e-6);
}));
test('initial overlaps resolve before first draw; impossible decorative occupancy is culled',()=>withFlow(f=>{
  f.emit({...event('cone'),radius:10,environment:{count:1,records:[{x:0,z:0,radius:40,strength:1}]}});
  const p=f.system.particles[0];assert.ok(p.forceKinematics[13]>0);assert.equal(p.color.w,0);
  assert.ok(!f.contactLight.active,'invisible constrained matter must not illuminate the world');
}));
test('contact light exists only for a real contact and respects clear and reduced flash',()=>withFlow((f,scene)=>{
  const read=createMaterialContactRead();f.emit(event('heat'));f.update(.05);assert.equal(readMaterialContact(scene,read).active,false);
  f.clear();f.emit({...event('heat'),environment:{count:1,records:[{x:0,z:0,radius:9,strength:1}]}});
  assert.equal(readMaterialContact(scene,read).active,true);assert.ok(read.intensity<=3.5);
  f.update(.01,{reducedFlash:true});assert.equal(readMaterialContact(scene,read).active,false);
  f.clear();assert.equal(readMaterialContact(scene,read).active,false);
}));
test('global registry follows late scene attachment and detachment, and disposal drains ownership',()=>{
  const group=new THREE.Group(),a=new THREE.Scene(),b=new THREE.Scene(),f=new ForceParticleFlow(group,{capacity:4});
  try{
    assert.equal(inspectMaterialScene(a).owners,0);a.add(group);f.emit(event());assert.equal(inspectMaterialScene(a).owners,1);
    b.add(group);registerMaterialOwner(f);assert.equal(inspectMaterialScene(a).owners,0);assert.equal(inspectMaterialScene(b).owners,1);
    group.removeFromParent();registerMaterialOwner(f);assert.equal(inspectMaterialScene(b).owners,0);
    a.add(group);registerMaterialOwner(f);f.dispose();assert.equal(inspectMaterialScene(a).owners,0);
  }finally{f.dispose();}
});
for(const kind of ['well','repulsor','cone','sheet']) {
  test(`${kind}: free cosmetic material samples the authoritative field kernel`,()=>{
    const scene=new THREE.Scene(),f=normalizeField({kind,center:{x:0,z:0},radius:120,strength:200,dir:{x:1,z:0},halfWidth:40});
    const original=JSON.stringify(f);publishMaterialFields(scene,{fields:{snapshot:[f]}});
    const p=parcel('heat');p.s[0]=.5;p.s[2]=.2;p.s[3]=p.s[5]=0;
    const accel=fieldRawAcceleration(f,30,12,{ax:0,az:0});
    advectMaterialEnvironment(p.m,p.s,2,.1,materialFieldsForScene(scene));
    near(p.s[3],accel.ax*.1*2/60);near(p.s[5],accel.az*.1*2/60);
    assert.equal(JSON.stringify(f),original);
  });
}
test('ambient snapshots are copied, localized, bounded, scene-isolated and withdrawn on release',()=>{
  const a=new THREE.Scene(),b=new THREE.Scene(),f=normalizeField({kind:'well',center:{x:1000,z:2000},radius:200,strength:1e6});
  const state={fields:{snapshot:Array(20).fill(f)}};
  publishMaterialFields(a,state,(x,z,out)=>{out.x=x-1000;out.z=z-2000;return out;});
  const env=materialFieldsForScene(a);assert.equal(env.count,8);assert.equal(env.records[0].center.x,0);
  f.center.x=9000;assert.equal(env.records[0].center.x,0);assert.equal(materialFieldsForScene(b),null);
  const p=parcel('heat');p.s[0]=.5;p.s[2]=0;p.s[3]=p.s[5]=0;
  advectMaterialEnvironment(p.m,p.s,2,.1,env);
  assert.ok(Math.hypot(p.s[3],p.s[5])<=FIELD_MAX_ACCEL*.1*2/60+1e-9);
  publishMaterialFields(a,{fields:{snapshot:[]}});assert.equal(env.count,0);
});
test('unknown, zero-strength and out-of-range fields cannot invent a force',()=>{
  const scene=new THREE.Scene();publishMaterialFields(scene,{fields:{snapshot:[
    normalizeField({kind:'well',center:{x:10000,z:10000},radius:3,strength:200}),
    {...normalizeField({}),kind:'unknown'},normalizeField({strength:0}),{kind:'well',radius:10,strength:1},
  ]}});
  const p=parcel('heat'),before=Array.from(p.s);advectMaterialEnvironment(p.m,p.s,2,.1,materialFieldsForScene(scene));assert.deepEqual(Array.from(p.s),before);
});
test('bonded repair, transfer, goo and coherent work stays on the authoritative target',()=>{
  const scene=new THREE.Scene();publishMaterialFields(scene,{fields:{snapshot:[normalizeField({kind:'repulsor',radius:200,strength:1000})]}});
  for(const kind of ['repair','transfer','goo','coherent','pickup']){
    const p=parcel(kind),before=Array.from(p.s);advectMaterialEnvironment(p.m,p.s,2,.1,materialFieldsForScene(scene));assert.deepEqual(Array.from(p.s),before);
  }
});
test('a field does not double-accelerate its own semantic material',()=>{
  const scene=new THREE.Scene();publishMaterialFields(scene,{fields:{snapshot:[normalizeField({kind:'well',radius:200,strength:1000})]}});
  const p=parcel(),before=Array.from(p.s);advectMaterialEnvironment(p.m,p.s,2,.1,materialFieldsForScene(scene));assert.deepEqual(Array.from(p.s),before);
});
test('runtime owners actually inherit ambient flow, not only a detached kernel test',()=>{
  const a=new THREE.Scene(),b=new THREE.Scene(),fa=new ForceParticleFlow(a,{capacity:4}),fb=new ForceParticleFlow(b,{capacity:4});
  try{
    publishMaterialFields(b,{fields:{snapshot:[normalizeField({kind:'repulsor',radius:200,strength:500})]}});
    fa.emit(event('heat'));fb.emit(event('heat'));fa.update(.2);fb.update(.2);
    assert.ok(fa.system.particles[0].position.distanceTo(fb.system.particles[0].position)>.1);
  }finally{fa.dispose();fb.dispose();}
});
test('saturation is bounded, arrays are reused, pause is exact, and idle uploads sleep',()=>withFlow(f=>{
  assert.equal(f.emit({...event(),count:100}),4);assert.equal(f.stats.dropped,96);
  const states=f.system.particles.map(p=>p.forceKinematics);f.update(.1);
  const before=states.map(s=>Array.from(s)),version=f.flowShapeAttribute.version;
  f.update(0);assert.deepEqual(states.map(s=>Array.from(s)),before);assert.equal(f.flowShapeAttribute.version,version);
  f.update(3);assert.equal(f.live,0);const idle=f.flowShapeAttribute.version;f.update(.1);assert.equal(f.flowShapeAttribute.version,idle);
  f.emit({...event(),count:4});for(let i=0;i<4;i++)assert.ok(states.includes(f.system.particles[i].forceKinematics));
  assert.equal(f.renderer.batches.length,1);
},4));
