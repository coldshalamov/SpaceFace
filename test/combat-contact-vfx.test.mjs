import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CombatContactVfx, combatContactExtent } from '../src/render/vfx/combatContactVfx.js';
import { createGameplayExplosion } from '../scripts/lib/vfxGameplayExplosion.mjs';
import { createGameplayWorldEvents } from '../scripts/lib/vfxGameplayWorldEvents.mjs';

function harness(capacity=24){
  const scene=new THREE.Scene(),root=new THREE.Group();
  root.userData.visualBounds={center:[0,1,0],size:[20,8,12]};scene.add(root);
  const body={id:1,type:'ship',alive:true,pos:{x:20,z:10},radius:10,rot:0,data:{}};
  const state={simTime:0,tick:12,settings:{video:{}},entities:new Map([[1,body]]),render:{scene,meshes:new Map([[1,root]])}};
  const origin={x:0,z:0},pool=new CombatContactVfx(scene,{capacity,toLocal:(x,z,out)=>{out.x=x-origin.x;out.z=z-origin.z;return out;}});
  const update=t=>{state.simTime=t;pool.update(state);};
  const p={targetId:1,otherId:2,tick:12,pos:{x:30,z:10},normal:{x:-1,z:0},feelDeltaV:34,deltaV:18,
    incoming:{x:-90,z:35},outgoing:{x:90,z:35},subsystemId:'drive'};
  return{scene,root,body,state,pool,origin,update,p};
}
function data(pool){const out=[];for(let i=0;i<pool.batch.count;i++)for(const attr of pool.batch.attributes)for(let k=0;k<4;k++)out.push(attr.array[i*4+k]);return out;}

test('collision consequences use bounded world extents rather than dimensionless camera trauma',()=>{
  assert.ok(combatContactExtent(7,34,true)>5);
  assert.ok(combatContactExtent(7,34,true)>combatContactExtent(7,34,false));
  assert.ok(combatContactExtent(70,150,true)<=17);
  const h=harness(),before=structuredClone(h.body);h.pool.emit('consequence',h.p,h.state);h.update(.2);
  assert.equal(h.pool.batch.count,6);assert.ok(h.pool.slots[0].radius>6);
  assert.deepEqual(h.body,before,'presentation cannot change the collision receiver');
  const kinds=new Set();for(let i=0;i<h.pool.batch.count;i++)kinds.add(data(h.pool)[i*36+4]);
  assert.deepEqual([...kinds].sort(),[1,3,4]);h.pool.dispose();
});

test('unsigned collision normal reversal produces the same opposed geometry',()=>{
  const a=harness(),b=harness();b.p.normal={x:1,z:0};
  a.pool.emit('contact',a.p,a.state);b.pool.emit('contact',b.p,b.state);a.update(.16);b.update(.16);
  assert.deepEqual(data(a.pool),data(b.pool));a.pool.dispose();b.pool.dispose();
});

test('subsystem material sits on live hull height, follows rotation and retires on receiver removal',()=>{
  const h=harness();h.pool.emit('subsystem.disabled',h.p,h.state);h.update(.2);
  assert.equal(h.pool.batch.count,4);assert.ok(data(h.pool)[1]>5,'surface must clear the actual hull top');
  h.body.rot=Math.PI/2;h.body.pos.x=40;h.update(.3);assert.equal(data(h.pool)[0],40);
  assert.ok(Math.abs(data(h.pool)[3]-Math.PI)<1e-5,'local ribs rotate with receiver');
  const old=Array.from(h.pool.batch.attributes,a=>a.version);h.update(.3);
  assert.deepEqual(Array.from(h.pool.batch.attributes,a=>a.version),old,'pause does not upload');
  h.state.entities.delete(1);h.update(.4);assert.equal(h.pool.batch.count,0);h.pool.dispose();
});

test('bank and mirror use actual incoming and outgoing vectors with distinct constructions',()=>{
  const a=harness(),b=harness();a.pool.emit('bank',a.p,a.state);b.pool.emit('mirror',b.p,b.state);a.update(.18);b.update(.18);
  const headings=[Math.atan2(-35,90),Math.atan2(35,90)];
  assert.ok(Math.abs(data(a.pool)[3]-headings[0])<1e-5);
  assert.ok(Math.abs(data(a.pool)[36+3]-headings[1])<1e-5);
  assert.notEqual(data(a.pool)[4],data(b.pool)[4]);
  const h=harness();delete h.p.outgoing;h.pool.emit('mirror',h.p,h.state);h.update(.18);
  assert.equal(h.pool.batch.count,2,'an absent reflected velocity cannot invent another ray');
  a.pool.dispose();b.pool.dispose();h.pool.dispose();
});

test('retained world contacts rebase, stay bounded, clear, and perform no idle uploads',()=>{
  const h=harness(2);for(let i=0;i<10;i++)h.pool.emit('consequence',{...h.p,tick:i},h.state);
  assert.equal(h.pool.live,2);h.update(.2);const x=data(h.pool)[0];
  h.origin.x=100;h.pool.reproject(-100,0);h.update(.2);assert.ok(Math.abs(data(h.pool)[0]-(x-100))<1e-5);
  h.update(2);assert.equal(h.pool.batch.count,0);const versions=h.pool.batch.attributes.map(a=>a.version);
  h.update(3);assert.deepEqual(h.pool.batch.attributes.map(a=>a.version),versions);
  h.pool.clear();h.state.simTime=0;assert.equal(h.pool.emit('consequence',h.p,h.state),true);assert.equal(h.pool.live,1);
  h.pool.dispose();h.pool.dispose();
});

test('reduced flash attenuates the world geometry once and preserves the opposed contact',()=>{
  const a=harness(),b=harness();b.state.settings.accessibility={flashReduce:true};
  a.pool.emit('consequence',a.p,a.state);b.pool.emit('consequence',b.p,b.state);a.update(.2);b.update(.2);
  assert.equal(a.pool.batch.count,b.pool.batch.count);
  const full=data(a.pool),reduced=data(b.pool);
  assert.ok(Math.abs(reduced[8]/full[8]-.68)<1e-5);
  assert.ok(Math.abs(reduced[15]/full[15]-.3)<1e-5);
  a.pool.dispose();b.pool.dispose();
});

test('shipping collision, subsystem, and reflected-contact subscriptions reach the retained owner',()=>{
  const h=harness(),camera=new THREE.PerspectiveCamera(50,16/9,.1,1000);
  camera.position.set(0,90,75);camera.lookAt(0,0,0);camera.updateMatrixWorld();
  h.body.mass=15;h.body.vel={x:0,z:0};h.body.prevPos={...h.body.pos};
  const target={id:2,type:'asteroid',alive:true,pos:{x:0,z:10},prevPos:{x:0,z:10},radius:11,mass:40,rot:0,vel:{x:0,z:0},data:{}};
  h.state.entities.set(2,target);Object.assign(h.state,{playerId:1,mode:'flight',entityList:[h.body,target],player:{},world:{}});
  h.state.render.camera=camera;const targetMesh=new THREE.Group();h.scene.add(targetMesh);
  const owner=createGameplayExplosion({scene:h.scene,camera,state:h.state});
  const fixture=createGameplayWorldEvents({state:h.state,owner,shipMesh:h.root,targetMesh});
  for(const id of ['world-collision-contact','world-collision-consequence','world-subsystem-disable',
    'world-subsystem-restore','world-bank-stone','world-ricochet-mirror']){
    fixture.reset();h.state.simTime=0;owner.reset();fixture.reset(id);
    for(let frame=1;frame<=30;frame++){h.state.simTime=frame/60;fixture.update();owner.update(1/60);}
    assert.ok(owner.inspect().combatContact?.surfaces>0,`${id} must draw through its production subscription`);
  }
  fixture.reset();owner.reset();assert.equal(owner.inspect().combatContact.live,0);
  owner.dispose();h.pool.dispose();
});
