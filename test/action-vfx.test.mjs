import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { vfx } from '../src/render/vfx.js';
import { FieldForcePresentation } from '../src/render/forceLanguage/fieldForcePresentation.js';
import { WeaponVfxPresenter } from '../src/render/weapons/presenter.js';

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

test('movement, salvage and cargo receipts resolve their actual payload body and retire transport',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  const receipts=[['ship:boostPreKick',{shipId:2}],['salvage:reactorVented',{targetId:2}],
    ['cargo:caughtByNet',{podId:2,netId:1}],['mining:richCoreCompleted',{asteroidId:2}],
    ['mining:richCoreFizzle',{asteroidId:2}]];
  for(const [name,p]of receipts){
    assert.ok(out.emit(name,p,s));s.simTime+=.09;out.update(s);
    const slot=out.slots.find(x=>x.event===name&&x.alive);assert.equal(slot.id,2);assert.equal(slot.x,20);
    assert.ok(out.particles.live>0,name+' has transported aftermath');
    s.simTime+=3;out.update(s);assert.equal(out.particles.live,0);assert.equal(out.mesh.visible,false);
  }
  out.dispose();
});

test('live force transport freezes at the same simulation time and clears on rewind/reduced motion',()=>{
  const s=fixture(),out=new FieldForcePresentation(new THREE.Scene());out.update(0,s);
  s.simTime+=.2;out.update(.2,s);assert.ok(out.particles.live>0);
  const age=out.particles.system.particles[0].age,live=out.particles.live;
  out.update(1,s);assert.equal(out.particles.live,live);assert.equal(out.particles.system.particles[0].age,age);
  s.settings.video.motionReduce=true;s.simTime+=.1;out.update(.1,s);
  assert.equal(out.particles.live,0);assert.ok(out.mesh.count>0);
  s.settings.video.motionReduce=false;s.simTime=0;out.update(0,s);assert.equal(out.particles.live,0);
  out.dispose();
});

test('mine arming resolves the mine and detonation keeps its receipted point after removal',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  out.emit('weapons:mineArmed',{mineId:2,ownerId:1,pos:{x:20,z:30}},s);
  s.simTime+=.15;out.update(s);
  assert.equal(out.slots[0].id,2);assert.equal(out.mesh.count,4);
  s.entities.delete(2);
  out.emit('weapons:mineDetonated',{mineId:2,ownerId:1,pos:{x:20,z:30},blastRadius:150},s);
  s.entities.get(1).pos.x=500;s.simTime+=.2;out.update(s);
  const detonation=out.slots.find(x=>x.recipe?.verb==='shove');
  assert.equal(detonation.x,20);assert.equal(detonation.z,30);assert.ok(Math.abs(detonation.radius-21)<1e-9);
  s.settings.video.motionReduce=true;out.update(s);assert.equal(out.particles.live,0);
  s.simTime+=2;out.update(s);assert.equal(out.mesh.visible,false);out.dispose();
});

test('weapon particle aftermath follows simulation time through paused rendering and save rewinds',()=>{
  const s=fixture(),out=new WeaponVfxPresenter({scene:new THREE.Scene(),state:s});
  out.quarks.spawnExplosion(0,0,0,12);s.simTime+=.1;out.update(.1,{state:s});
  const particle=out.quarks.flow.system.particles[0],age=particle.age,position=particle.position.clone();
  out.update(.1,{state:s});assert.equal(particle.age,age);assert.deepEqual(particle.position,position);
  assert.ok(out.getOwnerRoots().includes(out.quarks.root),'particle owners participate in residency/isolation');
  s.simTime=0;out.update(.1,{state:s});assert.equal(out.quarks.flow.live,0);
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
