import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ActionVfx, ACTION_VFX_EVENTS } from '../src/render/actionVfx.js';
import { ACTION_PRIMITIVES, createActionPrimitivePrecompileMesh } from '../src/render/vfx/actionPrimitives.js';
import { ADDITIONAL_ACTION_VFX_RECIPES } from '../src/render/vfx/actionEventRecipes.js';
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

test('all action receipts are wired on the live bus; original 19 render finite, retiring geometry',()=>{
  const handlers=new Map(),s=fixture(),scene=new THREE.Scene();
  const system=Object.create(vfx);system.state=s;system._scene=scene;system._subs=[];
  system.bus={on(name,fn){handlers.set(name,fn);return ()=>{};}};
  system._combatBeamLocalizer=(x,z,out)=>Object.assign(out,{x,z});system._subscribe();
  for(const name of ACTION_VFX_EVENTS){
    assert.ok(handlers.has(name),name);
    // Additional receipts have their own production-shaped resolver fixtures.
    // A single invented generic payload must not substitute for those contracts.
    if(Object.hasOwn(ADDITIONAL_ACTION_VFX_RECIPES,name))continue;
    handlers.get(name)(payload);
    s.simTime+=.09;system._actionVfx.update(s);
    assert.ok(system._actionVfx.mesh.count>0,name);
    assert.ok(system._actionVfx.batch.attributes.every(a=>a.array.every(Number.isFinite)));
    s.simTime+=2;system._actionVfx.update(s);assert.equal(system._actionVfx.mesh.count,0);
  }
  system._actionVfx.dispose();assert.equal(scene.children.length,0);
});

test('six action families use different geometric constructions and the cook retains their exact shader',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene()),warm=createActionPrimitivePrecompileMesh();
  const events=['salvage:reactorVented','beam:transferred','beam:repaired','well:fling','fields:specialistDisrupt','well:capture'];
  const codes=new Set();
  try{
    for(const event of events){
      out.clear();out.emit(event,payload,s);s.simTime+=.2;out.update(s);
      codes.add(out.batch.attributes[1].getX(0));
      assert.ok(Object.hasOwn(ACTION_PRIMITIVES,out.inspect().instances[0].primitive));
    }
    assert.equal(codes.size,6,'family identity is real construction, not color alone');
    assert.equal(out.batch.material.vertexShader,warm.material.vertexShader);
    assert.equal(out.batch.material.fragmentShader,warm.material.fragmentShader);
    assert.equal(out.batch.geometry.getAttribute('position').count,warm.geometry.getAttribute('position').count);
  }finally{out.dispose();warm.geometry.dispose();warm.material.dispose();warm.dispose();}
});

test('only confirmed player-tool receipts infer a player source; unrelated world actions never borrow it',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  try{
    assert.equal(out.emit('salvage:reactorVented',{},s),false);
    assert.ok(out.emit('well:capture',{victimId:2},s));
    assert.equal(out.slots[0].sourceId,null);assert.equal(out.slots[0].hasSource,false);
    out.clear();assert.ok(out.emit('beam:repaired',{targetId:2},s));
    assert.equal(out.slots[0].sourceId,1);assert.equal(out.slots[0].provenance,'body-surface');
    const target=s.entities.get(2);assert.ok(Math.hypot(out.slots[0].x-target.pos.x,out.slots[0].z-target.pos.z)>0);
  }finally{out.dispose();}
});

test('rotating bodies carry local ports and source sockets while receipted contacts remain exact',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene()),target=s.entities.get(2);
  target.rot=0;
  try{
    out.emit('ship:boostPreKick',{shipId:2},s);s.simTime+=.08;out.update(s);
    const dx=out.slots[0].x-target.pos.x,dz=out.slots[0].z-target.pos.z;
    target.rot=Math.PI/2;target.pos.x+=10;s.simTime+=.05;out.update(s);
    assert.ok(Math.abs(out.slots[0].x-(target.pos.x-dz))<1e-8);
    assert.ok(Math.abs(out.slots[0].z-(target.pos.z+dx))<1e-8);
    assert.ok(Math.abs(out.slots[0].angle-Math.PI*1.5)<1e-8);
    out.clear();
    const source=s.entities.get(1),root=new THREE.Group(),socket=new THREE.Object3D();
    socket.name='action-test-port';socket.position.set(3,2,-4);root.add(socket);source.view={root};
    root.position.set(40,0,50);root.updateMatrixWorld(true);
    out.emit('beam:transferred',{targetId:2,sourceId:1,sourceSocketName:socket.name,contactPoint:{x:76,y:3,z:81},normal:{x:0,z:-1}},s);
    s.simTime+=.08;out.update(s);
    assert.deepEqual([out.slots[0].sx,out.slots[0].sz],[43,46]);
    assert.deepEqual([out.slots[0].x,out.slots[0].y,out.slots[0].z],[76,3,81]);
    root.rotation.y=Math.PI/2;root.updateMatrixWorld(true);target.pos.x=900;s.simTime+=.04;out.update(s);
    const world=socket.getWorldPosition(new THREE.Vector3());
    assert.deepEqual([out.slots[0].sx,out.slots[0].sz],[world.x,world.z]);
    assert.deepEqual([out.slots[0].x,out.slots[0].z],[76,81]);
  }finally{out.dispose();}
});

test('countermeasure variants use their real diversion origin and only ECM follows the transmitting hull',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene()),ship=s.entities.get(1);
  ship.rot=0;ship.data={cm:{effect:{originX:-18,originZ:4}}};
  try{
    out.emit('countermeasure:deployed',{shipId:1,kind:'chaff',x:999,z:999},s);
    assert.deepEqual([out.slots[0].x,out.slots[0].z],[-18,4]);
    assert.equal(out.slots[0].recipe.primitive,'pressure');
    ship.pos.x=50;s.simTime+=.1;out.update(s);
    assert.deepEqual([out.slots[0].x,out.slots[0].z],[-18,4],'released chaff is independent of the moving hull');
    out.clear();ship.data.cm.effect={originX:50,originZ:0};
    out.emit('countermeasure:deployed',{shipId:1,kind:'ecm'},s);
    assert.equal(out.slots[0].recipe.primitive,'induction');
    ship.pos.x=60;s.simTime+=.1;out.update(s);
    assert.deepEqual([out.slots[0].x,out.slots[0].z],[60,0]);
    out.clear();out.emit('countermeasure:deployed',{shipId:1,kind:'decoy'},s);
    assert.equal(out.slots[0].recipe.primitive,'compression');
    assert.equal(out.slots[0].attached,false);
  }finally{out.dispose();}
});

test('typed cloak, snare, and shunt receipts preserve their owning body and direction',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  const anchor={id:3,alive:true,pos:{x:-30,z:80},vel:{x:0,z:0},radius:4,rot:0};s.entities.set(3,anchor);
  try{
    out.emit('cloak:engaged',{reason:'power'},s);
    assert.equal(out.slots[0].id,1,'cloak is explicitly a player-only publisher');
    assert.equal(out.slots[0].sourceId,null);
    out.clear();out.emit('massline:snareCaught',{anchorId:3,targetId:2,pos:{x:22,z:31}},s);
    assert.equal(out.slots[0].sourceId,3);assert.deepEqual([out.slots[0].x,out.slots[0].z],[22,31]);
    assert.ok(Math.hypot(out.slots[0].sx-anchor.pos.x,out.slots[0].sz-anchor.pos.z)<=anchor.radius);
    out.clear();out.emit('weapons:inertialShunt',{shunterId:3,targetId:2},s);
    assert.equal(out.slots[0].sourceId,3);assert.equal(out.slots[0].provenance,'body');
    assert.equal(out.slots[0].angle,Math.atan2(30-80,20-(-30)));
  }finally{out.dispose();}
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

test('cut connection retains loaded geometry while a cutoff and separate parcels retire it',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());out.emit('fields:hitchCut',payload,s);
  s.simTime+=.1;out.update(s);
  const path=out.batch.attributes[1],finish=out.batch.attributes[5];
  const length=path.getZ(0)-path.getY(0),cutoff=finish.getY(0);
  s.simTime+=.3;out.update(s);
  assert.equal(path.getZ(0)-path.getY(0),length,'shutdown does not reverse the entire connection shape');
  assert.ok(finish.getY(0)>cutoff,'source cutoff overtakes existing matter');
  assert.ok(out.mesh.count>3,'independent received-end clamps remain distinct from conductors');
  out.dispose();
});

test('movement, salvage and cargo receipts resolve their actual payload body and retire transport',()=>{
  const s=fixture(),out=new ActionVfx(new THREE.Scene());
  const receipts=[['ship:boostPreKick',{shipId:2}],['salvage:reactorVented',{targetId:2}],
    ['cargo:caughtByNet',{podId:2,netId:1}],['mining:richCoreCompleted',{asteroidId:2}],
    ['mining:richCoreFizzle',{asteroidId:2}]];
  for(const [name,p]of receipts){
    assert.ok(out.emit(name,p,s));s.simTime+=.09;out.update(s);
    const slot=out.slots.find(x=>x.event===name&&x.alive);assert.equal(slot.id,2);
    assert.ok(Math.hypot(slot.x-20,slot.z-30)<=slot.radius,'response is attached to the actual body or its surface');
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
  assert.equal(out.slots[0].id,2);assert.equal(out.inspect().instances[0].primitive,'capture');
  assert.ok(out.mesh.count>=5,'separate jaws and later load-bearing matter');
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
