import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { vfx } from '../src/render/vfx.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';

function fixture(){
  const player={id:1,alive:true,pos:{x:0,z:0},vel:{x:6,z:2},radius:7};
  const target={id:2,alive:true,pos:{x:20,z:30},vel:{x:5,z:10},radius:6};
  return {simTime:1,playerId:1,entities:new Map([[1,player],[2,target]]),settings:{video:{}},
    fields:{active:[{id:'well',kind:'well',center:{x:0,z:0},radius:150,dir:{x:1,z:0}}]}};
}
const payload={targetId:2,victimId:2,entityId:2,sourceId:1,ownerId:1,wellId:'well',fieldId:'well',pos:{x:20,z:30}};

test('all new action receipts are wired on the live VFX bus and render finite, retiring geometry',()=>{
  const handlers=new Map(),s=fixture(),scene=new THREE.Scene();
  const system=Object.create(vfx);system.state=s;system._scene=scene;system._subs=[];
  system.bus={on(name,fn){handlers.set(name,fn);return ()=>{};}};
  system._combatBeamLocalizer=(x,z,out)=>Object.assign(out,{x,z});system._subscribe();
  for(const name of ACTION_VFX_EVENTS){
    assert.ok(handlers.has(name),name);handlers.get(name)(payload);
    s.simTime+=.09;system._actionVfx.update(s);
    assert.ok(system._actionVfx.mesh.count>0,name);
    assert.ok(system._actionVfx.batch.attributes.every(a=>a.array.every(Number.isFinite)));
    s.simTime+=2;system._actionVfx.update(s);assert.equal(system._actionVfx.mesh.count,0);
  }
  system._actionVfx.dispose();assert.equal(scene.children.length,0);
});

test('rapid repair ticks coalesce, pause holds, floating-origin shifts preserve world anchors',()=>{
  const s=fixture();let ox=0;
  const out=new ActionVfx(new THREE.Scene(),(x,z,p)=>Object.assign(p,{x:x-ox,z}));
  assert.ok(out.emit('beam:repaired',payload,s));
  for(let i=0;i<20;i++)assert.equal(out.emit('beam:repaired',payload,s),false);
  s.simTime+=.1;out.update(s);
  const initial=out.batch.attributes.map(a=>Array.from(a.array));
  out.update(s);assert.deepEqual(out.batch.attributes.map(a=>Array.from(a.array)),initial);
  ox=100;out.update(s);
  assert.ok(Math.abs(out.batch.attributes[0].getX(0)-(initial[0][0]-100))<1e-5);
  assert.equal(out.slots[0].x,20,'stored anchor remains global');
  out.clear();assert.equal(out.mesh.visible,false);out.dispose();
});

test('action pool is bounded, rejects missing positions, and clears after a clock rewind',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  assert.equal(out.emit('well:capture',{},{}),false);
  for(let i=0;i<90;i++)out.emit('well:grind',{...payload,targetId:i},s);
  s.simTime+=.1;out.update(s);assert.equal(out.live,32);assert.ok(out.mesh.count<=192);
  s.simTime=0;out.update(s);assert.equal(out.live,0);assert.equal(out.mesh.count,0);out.dispose();
});

test('sling-bomb combo stays at the receipted detonation instead of snapping to its owner',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  out.emit('charge:combo',{combo:'slingBomb',chargeId:91,ownerId:1,anchorId:2,pos:{x:70,z:90}},s);
  s.simTime+=.1;s.entities.get(1).pos.x=600;out.update(s);
  assert.equal(out.slots[0].x,70);assert.equal(out.slots[0].z,90);out.dispose();
});

test('continuous repair preserves its phase and ignition while renewed, then cools and retires',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());out.emit('beam:repaired',payload,s);
  const seed=out.slots[0].seed,born=out.slots[0].born;
  for(let i=1;i<15;i++){s.simTime=1+i*.15;out.emit('beam:repaired',payload,s);out.update(s);
    assert.equal(out.slots[0].seed,seed);assert.equal(out.slots[0].born,born);assert.equal(out.live,1);}
  s.simTime+=1;out.update(s);assert.equal(out.mesh.count,0);out.dispose();
});

test('cut strands shrink without crossing their retained starts or reversing direction',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());out.emit('fields:hitchCut',payload,s);
  s.simTime+=.4;out.update(s);
  const path=out.batch.attributes[1],shape=out.batch.attributes[2];
  for(let i=0;i<out.mesh.count;i++){assert.ok(shape.getX(i)>=path.getW(i));assert.ok(shape.getX(i)-path.getW(i)<8);}
  out.dispose();
});

test('gravity deployments vary consistently while steady fields need no new descriptor uploads',()=>{
  const s=fixture(),a=new FieldForcePresentation(new THREE.Scene()),b=new FieldForcePresentation(new THREE.Scene());
  a.update(0,s);b.update(0,s);
  assert.deepEqual(a.batch.attributes.map(x=>Array.from(x.array)),b.batch.attributes.map(x=>Array.from(x.array)));
  s.simTime=2;a.update(.016,s);const versions=a.batch.attributes.map(x=>x.version);
  s.simTime=2.5;a.update(.016,s);assert.deepEqual(a.batch.attributes.map(x=>x.version),versions);
  const phase=a.batch.attributes[4].getY(4);
  s.fields.active[0].id='different-well';a.update(0,s);
  const newSlot=a.slots.find(x=>x.id==='different-well');
  assert.notEqual(newSlot.character,b.slots[0].character);assert.ok(Number.isFinite(phase));
  a.dispose();b.dispose();
});
