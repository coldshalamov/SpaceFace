import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { vfx } from '../src/render/vfx.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { FIELD_LIFECYCLES, FIELD_ROLE, sampleFieldLifecycle, sampleDischargeLifecycle } from '../src/render/forceLanguage/effectLifecycle.js';
import { SURFACE_FLOATS, SweptSurfaceBatch } from '../src/render/forceLanguage/sweptSurfaceBatch.js';

const field=(kind,id=kind)=>({id,kind,center:{x:20,z:30},dir:{x:1,z:0},radius:kind==='seed'?42:170,halfAngleRad:.56,halfWidth:52,engaged:false});
const state=(f)=>({simTime:0,fields:{active:f},massSeed:{seedId:3,phase:'active'},settings:{video:{}}});
const step=(o,s,t)=>{s.simTime=t;o.update(.016,s);};
const versions=o=>o.batch.attributes.map(a=>a.version);
for(const [kind,recipe]of Object.entries(FIELD_LIFECYCLES)){
 test(`${kind}: ignition, geometric build, infinite sustain, finite release`,()=>{
  const out={};sampleFieldLifecycle(0,0,-1,recipe,out);assert.equal(out.opacity,0);assert.equal(out.stage,'ignition');
  let old=out.scale;
  for(let i=1;i<=60;i++){sampleFieldLifecycle(recipe.attack*i/60,0,-1,recipe,out);assert.ok(out.scale>=old);old=out.scale;}
  assert.equal(out.stage,'sustain');assert.equal(out.scale,1);
  sampleFieldLifecycle(1000,0,-1,recipe,out);assert.equal(out.opacity,1);assert.equal(out.stage,'sustain');
  sampleFieldLifecycle(1000+recipe.release/2,0,1000,recipe,out);assert.equal(out.stage,'release');assert.ok(out.opacity>0&&out.opacity<1);
  sampleFieldLifecycle(1000+recipe.release+.001,0,1000,recipe,out);assert.equal(out.stage,'dead');assert.equal(out.opacity,0);
 });
 test(`${kind}: production adapter advances shader clock with NO affected targets`,()=>{
  const system=Object.create(vfx);system._scene=new THREE.Scene();system.state=state([field(kind)]);
  system._fieldGeomInitialized=false;system._fieldGeom=null;system._combatBeamLocalizer=(x,z,out)=>Object.assign(out,{x,z});
  system._updateFieldGeometry(0);const o=system._fieldGeom;
  step(o,system.state,2);const before=versions(o);step(o,system.state,2.4);
  assert.equal(o.batch.material.uniforms.uTime.value,2.4);assert.equal(o.batch.material.uniforms.uMotion.value,1);
  assert.deepEqual(versions(o),before,'GPU time changes, descriptor buffers do not');
  assert.ok(o.batch.attributes[7].getX(0)>0,'nonzero shape animation code');
  assert.equal(o.inspect().instances[0].stage,'sustain');
  system.state.fields.active=[];step(o,system.state,3);
  assert.equal(o.inspect().instances[0].stage,'release');
  for(let i=0;i<o.mesh.count;i++)assert.notEqual(o.batch.attributes[7].getY(i),FIELD_ROLE.BOUNDARY);
  step(o,system.state,3+recipe.release+.01);assert.equal(o.mesh.visible,false);o.dispose();
 });
}
test('interrupted birth releases from its current envelope, never jumps to full scale',()=>{
 const r=FIELD_LIFECYCLES.well,a={},b={};sampleFieldLifecycle(.08,0,-1,r,a);sampleFieldLifecycle(.08,0,.08,r,b);
 assert.equal(a.scale,b.scale);assert.equal(a.opacity,b.opacity);
 sampleFieldLifecycle(.20,0,.08,r,b);assert.ok(b.scale<a.scale);assert.ok(b.opacity<a.opacity);
});
test('simulation pause freezes lifecycle and motion even if presentation dt is positive',()=>{
 const o=new FieldForcePresentation(new THREE.Scene()),s=state([field('well')]);step(o,s,0);step(o,s,2);
 const before=versions(o);for(let i=0;i<100;i++)o.update(.016,s);
 assert.equal(o.time,2);assert.equal(o.batch.material.uniforms.uTime.value,2);assert.deepEqual(versions(o),before);
 s.fields.active=[];o.update(0,s);for(let i=0;i<100;i++)o.update(.016,s);assert.equal(o.stats.releasing,1);
 step(o,s,3);assert.equal(o.mesh.count,0);o.dispose();
});
test('reused producer records cannot mutate the last pose of a retiring effect',()=>{
 const f=field('cone'),s=state([f]),o=new FieldForcePresentation(new THREE.Scene());step(o,s,0);step(o,s,2);
 s.fields.active=[];step(o,s,2.1);const old=o.slots.find(x=>x.kind==='cone');
 f.id='other';f.kind='sheet';f.center.x=999;f.halfWidth=500;f.halfAngleRad=1.3;s.fields.active=[f];step(o,s,2.2);
 assert.equal(old.kind,'cone');assert.equal(old.x,20);assert.equal(old.field.halfAngleRad,.56);assert.equal(old.release,2.1);o.dispose();
});
test('same-id toggle restarts growth while old residue retires separately',()=>{
 const f=field('cone'),s=state([f]),o=new FieldForcePresentation(new THREE.Scene());step(o,s,0);step(o,s,1);
 s.fields.active=[];step(o,s,1.1);s.fields.active=[f];step(o,s,1.2);
 const alive=o.slots.filter(s=>s.id==='cone');assert.equal(alive.length,2);
 assert.equal(alive.find(s=>s.release<0).born,1.2);assert.equal(alive.find(s=>s.release>=0).release,1.1);o.dispose();
});
test('float-origin reproject moves source pivots and strip origins together',()=>{
 const o=new FieldForcePresentation(new THREE.Scene()),s=state([field('seed')]);step(o,s,0);step(o,s,2);
 const a=o.batch.attributes[0],p=o.batch.attributes[8],oldA=a.getX(0),oldP=p.getX(0);
 o.reproject(900,-700);assert.equal(a.getX(0),Math.fround(oldA+900));assert.equal(p.getX(0),Math.fround(oldP+900));assert.equal(p.getY(0),30-700);o.dispose();
});
test('shader interface stays finite for existing 24-float weapon descriptors',()=>{
 const b=new SweptSurfaceBatch(new THREE.Scene(),{capacity:1});b.begin(1);b.add(new Float32Array(24));b.end();
 assert.equal(SURFACE_FLOATS,36);assert.equal(b.attributes.length+1+4,14);
 for(const a of b.attributes)assert.ok(a.array.every(Number.isFinite));
 assert.equal(b.attributes[6].getY(0),0,'legacy source is not a persistent field');b.dispose();
});
test('seven active fields survive repeated replacement under bounded residue pressure',()=>{
 const o=new FieldForcePresentation(new THREE.Scene()),s=state([]);
 for(let t=0;t<30;t++){
  s.fields.active=[...Array.from({length:6},(_,i)=>field('repulsor',`${t}:${i}`)),field('seed','seed')];
  step(o,s,t*.04);assert.equal(o.stats.active,7);assert.ok(o.mesh.count<=224);assert.ok(o.slots.some(x=>x.kind==='seed'&&x.seen));
 }
 o.dispose();
});
test('frozen authoritative snapshot is read-only through full lifecycle',()=>{
 const f=field('well');Object.freeze(f.center);Object.freeze(f.dir);Object.freeze(f);
 const s=state(Object.freeze([f]));Object.freeze(s.massSeed);const o=new FieldForcePresentation(new THREE.Scene());
 step(o,s,0);step(o,s,1);s.fields.active=[];step(o,s,2);step(o,s,3);o.dispose();
});
test('source discharge formula has extrusion, sustain peak, cooling, extinction',()=>{
 const a={},b={},c={};sampleDischargeLifecycle(.002,.12,false,a);sampleDischargeLifecycle(.024,.12,false,b);sampleDischargeLifecycle(.1,.12,false,c);
 assert.ok(a.length<b.length);assert.ok(a.opacity<b.opacity);assert.ok(c.opacity<b.opacity);assert.ok(c.width<b.width);
 sampleDischargeLifecycle(.12,.12,false,c);assert.equal(c.opacity,0);
 sampleDischargeLifecycle(.04,.12,true,a);sampleDischargeLifecycle(.08,.12,true,b);assert.equal(a.length,b.length);
});

test('full vfx.update integration wakes fields, ticks no-target motion, and drains removal',()=>{
 const scene=new THREE.Scene(),player={id:1,type:'ship',alive:true,team:1,pos:{x:0,z:0},vel:{x:0,z:0},rot:0,radius:12};
 const state={simTime:0,playerId:1,player:{targetId:null,tether:{active:false}},
  entities:new Map([[1,player]]),entityList:[player],settings:{video:{particleQuality:'high',motionReduce:false,energyMaterials:false,bloom:false}},
  render:{scene},ui:{radarRange:4000},combat:{attachments:{byId:{}}},content:{},fields:{active:[field('well')]}};
 const system=Object.create(vfx);system.init({state,bus:{on(){return ()=>{};},emit(){}},helpers:{player:()=>player}});
 try{
  system.update(.016);state.simTime=2;system.update(.016);
  assert.equal(system.inspect().fieldForceLanguage.schema,'spaceface.force-language.lifecycle.v2');
  assert.equal(system._fieldGeom.batch.material.uniforms.uTime.value,2);
  assert.equal(system._fieldGeom.stats.active,1);state.fields.active=[];state.simTime=2.1;system.update(.016);
  assert.equal(system._fieldGeom.stats.releasing,1,'empty active list does not sleep the release');
  state.simTime=3.2;system.update(.016);assert.equal(system._fieldGeom.mesh.count,0);
 }finally{system.destroy();}
});
