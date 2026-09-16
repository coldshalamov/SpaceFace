import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FIELD_SIGNATURES, FORCE_FAMILIES, fieldSignature, weaponSignature } from '../src/render/forceLanguage/catalog.js';
import { FieldForcePresentation, FIELD_RELEASE_SECONDS } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { SweptSurfaceBatch, createForceSurfacePrecompileMesh } from '../src/render/forceLanguage/sweptSurfaceBatch.js';
import { WeaponDischargePool } from '../src/render/forceLanguage/weaponDischargePool.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';
import { resolveWeaponRecipe } from '../src/render/weapons/recipes.js';

const field=(kind,id=kind)=>({id,kind,center:{x:30,z:-25},dir:{x:1,z:0},radius:kind==='seed'?42:190,halfWidth:52,halfAngleRad:.56,engaged:true});
const state=(active=[])=>({simTime:0,fields:{active},settings:{video:{}},massSeed:{seedId:'one',phase:'active',lockAt:0,activeAt:1,warnAt:4,expireAt:7}});
const versions=(owner)=>owner.batch.attributes.map(a=>a.version);
function prime(owner,s){owner.update(0,s);s.simTime=.5;owner.update(.5,s);}

test('five tool signatures are distinct; unknown tools never impersonate gravity',()=>{
 assert.equal(Object.keys(FIELD_SIGNATURES).length,5);
 assert.equal(new Set(Object.values(FIELD_SIGNATURES).map(s=>s.shape)).size,5);
 assert.equal(fieldSignature('unknown'),null);assert.equal(fieldSignature('constructor'),null);
 assert.equal(fieldSignature('seed').mode,'constraint');assert.equal(fieldSignature('sheet').mode,'collect');
 assert.equal(weaponSignature('autocannon').family,'kinetic');assert.equal(weaponSignature('pulse-bolt').family,'coherent');
 for(const s of Object.values(FIELD_SIGNATURES))assert.ok(FORCE_FAMILIES[s.family]);
 assert.ok(Object.isFrozen(FIELD_SIGNATURES.seed));
});
for(const kind of Object.keys(FIELD_SIGNATURES))test(`${kind}: actual surfaces, no Points, finite geometry descriptors, one pooled mesh`,()=>{
 const scene=new THREE.Scene(),owner=new FieldForcePresentation(scene),s=state([field(kind)]);prime(owner,s);
 assert.equal(scene.children.length,1);assert.equal(owner.mesh.isInstancedMesh,true);
 assert.equal(owner.stats.surfaces,FIELD_SIGNATURES[kind].surfaces);
 assert.equal(owner.mesh.material.forceSinglePass,true);assert.equal(owner.mesh.material.blending,THREE.NormalBlending);
 for(const a of owner.batch.attributes)assert.ok(a.array.every(Number.isFinite));
 owner.dispose();owner.dispose();assert.equal(scene.children.length,0);
});

test('parked / engaged field motion is uniform-driven and steady descriptors do not re-upload',()=>{
 const owner=new FieldForcePresentation(new THREE.Scene()),s=state([field('well')]);prime(owner,s);
 const before=versions(owner),buffers=owner.batch.attributes.map(a=>a.array);
 for(let i=0;i<60;i++){s.simTime+=1/60;owner.update(1/60,s);}
 assert.deepEqual(versions(owner),before);owner.batch.attributes.forEach((a,i)=>assert.equal(a.array,buffers[i]));
 s.fields.active[0].engaged=false;owner.update(0,s);
 for(let i=0;i<owner.stats.surfaces;i++)assert.equal(owner.batch.attributes[4].getX(i),0);
 owner.dispose();
});

test('six ordinary fields plus appended Seed are visible; bounded pool does not drop Seed',()=>{
 const active=Array.from({length:6},(_,i)=>field('well','well-'+i));active.push(field('seed'));
 const owner=new FieldForcePresentation(new THREE.Scene()),s=state(active);prime(owner,s);
 assert.equal(owner.stats.active,7);assert.equal(owner.stats.surfaces,6*19+16);assert.equal(owner.stats.dropped,0);
 const seed=owner.slots.find(x=>x.kind==='seed');assert.ok(seed?.seen);
 owner.dispose();
});

test('Seed phase is read-only, never emits gravity flow, re-launch resets a constant published id',()=>{
 const owner=new FieldForcePresentation(new THREE.Scene()),s=state([field('seed','field_seed_present')]);prime(owner,s);
 for(const phase of ['travel','locking','active','warning']){
  s.massSeed.phase=phase;s.simTime=phase==='warning'?5:.6;const original=JSON.stringify(s);owner.update(0,s);
  assert.equal(JSON.stringify(s),original);
  for(let i=0;i<owner.stats.surfaces;i++){assert.equal(owner.batch.attributes[4].getX(i),0);assert.equal(owner.batch.attributes[4].getZ(i),0);}
 }
 s.massSeed.seedId='two';s.simTime=6;owner.update(0,s);
 assert.equal(owner.slots.find(x=>x.seen&&x.kind==='seed').born,6);
 owner.dispose();
});

test('removal retires perimeter immediately; only short source extinction remains, then uploads sleep',()=>{
 const owner=new FieldForcePresentation(new THREE.Scene()),s=state([field('repulsor')]);prime(owner,s);
 s.fields.active=[];owner.update(0,s);assert.equal(owner.stats.active,0);assert.equal(owner.stats.releasing,1);
 assert.equal(owner.stats.surfaces,3);
 for(let i=0;i<3;i++)assert.ok(owner.batch.attributes[1].getW(i)<=8);
 s.simTime+=FIELD_RELEASE_SECONDS+.01;owner.update(.3,s);assert.equal(owner.mesh.count,0);assert.equal(owner.mesh.visible,false);
 const before=versions(owner);for(let i=0;i<100;i++){s.simTime+=.016;owner.update(.016,s);}
 assert.deepEqual(versions(owner),before);owner.dispose();
});

test('deployment born at simTime zero does not reset; origin shifts update local positions',()=>{
 let ox=0,oz=0;const owner=new FieldForcePresentation(new THREE.Scene(),{toLocal:(x,z,o)=>{o.x=x-ox;o.z=z-oz;return o;}});
 const s=state([field('well')]);owner.update(0,s);s.simTime=.1;owner.update(.1,s);
 assert.equal(owner.slots.find(x=>x.seen).born,0);
 assert.ok(owner.batch.attributes[5].getX(0)>.4&&owner.batch.attributes[5].getX(0)<.6);
 ox=10000;oz=-20000;owner.update(0,s);
 assert.equal(owner.batch.attributes[0].getX(0),30-10000);assert.equal(owner.batch.attributes[0].getZ(0),-25+20000);
 owner.dispose();
});

test('reduced motion freezes flows without deleting silhouettes; reduced flash keeps boundary geometry',()=>{
 const owner=new FieldForcePresentation(new THREE.Scene()),s=state([field('repulsor')]);prime(owner,s);
 const count=owner.mesh.count;s.settings.video.motionReduce=true;s.settings.video.flashReduce=true;owner.update(0,s);
 assert.equal(owner.mesh.count,count);assert.equal(owner.batch.material.uniforms.uMotion.value,0);
 assert.equal(owner.batch.material.uniforms.uFlash.value,.56);owner.dispose();
});

test('malformed/unknown records are skipped and do not poison GPU attributes',()=>{
 const owner=new FieldForcePresentation(new THREE.Scene()),bad=field('well');bad.center.x=NaN;
 const s=state([bad,field('unregistered'),field('sheet')]);prime(owner,s);
 assert.equal(owner.stats.active,1);assert.equal(owner.stats.unknown,1);
 for(const a of owner.batch.attributes)assert.ok(a.array.every(Number.isFinite));owner.dispose();
});

test('surface batch is bounded and precompile material is the runtime program',()=>{
 const scene=new THREE.Scene(),batch=new SweptSurfaceBatch(scene,{capacity:1});
 batch.begin();batch.add(new Float32Array(24));assert.equal(batch.add(new Float32Array(24)),false);batch.end();
 assert.equal(batch.dropped,1);assert.equal(batch.mesh.count,1);
 const warm=createForceSurfacePrecompileMesh();assert.equal(warm.material.vertexShader,batch.material.vertexShader);
 assert.equal(warm.material.fragmentShader,batch.material.fragmentShader);assert.equal(warm.count,1);
 warm.geometry.dispose();warm.material.dispose();warm.dispose();batch.dispose();
});

test('mechanical, rail and coherent sources have different geometry, not just different colors',()=>{
 const pool=new WeaponDischargePool(new THREE.Scene());const pose={x:0,y:.4,z:0,ax:1,ay:0,az:0};
 const flash={life:.12,size0:1.4,size1:2.8,opacity0:1.35};const shapes=[];
 for(const variant of ['autocannon','railgun','pulse-bolt']){
  for(const s of pool.slots)s.alive=false;
  assert.equal(pool.spawn({variant},pose,'ship',flash,1),true);pool.update(.02);
  shapes.push(Array.from(pool.batch.attributes[1].array.slice(0,pool.mesh.count*4)));
 }
 assert.notDeepEqual(shapes[0],shapes[1]);assert.notDeepEqual(shapes[1],shapes[2]);
 pool.dispose();
});

test('muzzle follows socket pose, expires, coalesces owner fire, and preserves fallback for unregistered sources',()=>{
 const pool=new WeaponDischargePool(new THREE.Scene(),{capacity:2}),pose={x:10,y:1,z:20,ax:1,ay:0,az:0};
 const flash={life:.12,size0:1.4,size1:2.8,opacity0:1.35};
 pool.spawn({variant:'autocannon'},pose,'player',flash,1);pool.spawn({variant:'autocannon'},pose,'player',flash,1);
 assert.equal(pool.slots.filter(s=>s.alive).length,1);
 pose.x=44;pose.ax=0;pose.az=1;pool.update(.02,()=>pose);
 assert.equal(pool.slots[0].x,44);assert.equal(pool.slots[0].angle,Math.PI/2);
 pool.reproject(-100,40);assert.equal(pool.slots[0].x,-56);
 assert.equal(pool.spawn({variant:'unknown'},pose,'other',flash),false);
 pool.update(.2);assert.equal(pool.mesh.count,0);pool.dispose();
});

test('live presenter routes pulse to surfaces, not stacked MUZZLE/BORE flipbooks, preserving bolt recipe',()=>{
 const socket={x:12,y:.82,z:3,forwardX:1,forwardY:0,forwardZ:0};
 const scene=new THREE.Scene(),presenter=new WeaponVfxPresenter({scene,helpers:{socketWorldPose:()=>socket}});
 presenter.state={playerId:'ship',settings:{video:{}}};
 assert.equal(presenter.handleFire({weaponId:'wpn_pulse_laser_s',ownerId:'ship'},{x:0,z:0},0),true);
 assert.equal(presenter.flipbooks.slots.filter(s=>s.alive).length,0);
 presenter.discharges.update(.02,presenter._dischargePoseResolver,presenter._a11y());
 assert.equal(presenter.discharges.slots[0].x,12);assert.equal(presenter.discharges.mesh.count,5);
 assert.equal(resolveWeaponRecipe('wpn_pulse_laser_s').flight.mode,'energy-card');
 assert.ok(presenter.getOwnerRoots().includes(presenter.discharges.mesh));presenter.dispose();
});
