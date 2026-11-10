import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MOMENTUM_SINK_STATUS_ID } from '../src/data/combatDefs.js';
import { StatusMatterVfx } from '../src/render/vfx/statusMatterVfx.js';
import { modelTruthRow } from '../src/data/modelTruth.js';
import { createMomentumSinkVfxPlanScratch, resolveMomentumSinkVfxPlan } from '../src/render/momentumSinkVfx.js';

function fixture(){
  const body={id:3,alive:true,type:'ship',pos:{x:20,z:5},prevPos:{x:18,z:3},rot:.4,prevRot:.2,
    radius:10,vel:{x:40,z:4},data:{proportions:{length:1.6,halfWidth:.5,height:.4}}};
  const sink={expiresTick:300,stacks:1,data:{frameKind:'attacker_velocity',frameReady:true,frameVelocity:{x:0,z:0}}};
  return {simTime:1,tick:60,mode:'flight',entities:new Map([[3,body]]),settings:{video:{}},
    render:{interpolationAlpha:1},combat:{entities:{3:{statuses:{
      status_burning:{expiresTick:300,stacks:2},status_goo:{expiresTick:300,stacks:2},[MOMENTUM_SINK_STATUS_ID]:sink}}}}};
}
function touch(owner,state,kind){
  if(kind!=='sink')return owner.touchStatus({entityId:3,statusId:kind==='burn'?'status_burning':'status_goo'},state);
  const body=state.entities.get(3),active=state.combat.entities[3].statuses[MOMENTUM_SINK_STATUS_ID];
  const plan=resolveMomentumSinkVfxPlan(createMomentumSinkVfxPlanScratch(),{
    targetPosition:body.pos,targetVelocity:body.vel,frameVelocity:active.data.frameVelocity,frameReady:true,radius:body.radius});
  return owner.touchMomentum(body,active,plan,state);
}
function pieces(owner){
  return Array.from({length:owner.batch.count},(_,i)=>{
    const out=[];for(const a of owner.batch.attributes)for(let c=0;c<4;c++)out.push(a.array[i*4+c]);return out;
  });
}
function at(state,time){state.tick+=Math.round((time-state.simTime)*60);state.simTime=time;}

test('burn, goo and momentum use different persistent constructions with material arrival and differential motion',()=>{
  const signatures=[];
  for(const kind of ['burn','goo','sink']){
    const state=fixture(),owner=new StatusMatterVfx(new THREE.Scene());assert.equal(touch(owner,state,kind),true);
    at(state,1.08);owner.update(state);const early=pieces(owner),born=owner.slots.find(s=>s.alive).born;
    at(state,1.16);touch(owner,state,kind);owner.update(state);const later=pieces(owner);
    assert.equal(owner.slots.find(s=>s.alive).born,born,'cadence renewal cannot replay birth');
    assert.ok(later.every(row=>row.every(Number.isFinite)));
    signatures.push(later.map(row=>row[4]).join(','));
    assert.notDeepEqual(early,later,'local material fronts/folds progress');
    assert.equal(later[0][3],early[0][3],'no whole-owner spin');
    assert.equal(later[0][5],early[0][5],'no uniform geometry expansion');
    owner.dispose();
  }
  assert.deepEqual(signatures,['3,1,3,1,3,1','3,2,3,2,3','6,6,6']);
});

test('damage seats follow the displayed hull pose and measured live extents',()=>{
  const state=fixture(),body=state.entities.get(3),owner=new StatusMatterVfx(new THREE.Scene());
  state.render.interpolationAlpha=.5;touch(owner,state,'goo');at(state,1.16);owner.update(state);
  const s=owner.slots[0];assert.equal(s.x,19);assert.equal(s.z,4);assert.ok(Math.abs(s.angle-.3)<1e-8);
  assert.equal(s.hx,8);assert.equal(s.hz,5);assert.equal(s.top,2);
  const row=pieces(owner)[0],lx=-s.hx*.42,lz=s.hz*.25;
  assert.ok(Math.abs(row[0]-(19+Math.cos(.3)*lx-Math.sin(.3)*lz))<1e-5);
  body.prevPos=body.pos;body.pos={x:30,z:10};body.prevRot=body.rot;body.rot=1.2;
  touch(owner,state,'goo');owner.update(state);assert.equal(s.x,25);assert.equal(s.z,7.5);
  body.data={defId:'ship_kestrel'};body.radius=28;touch(owner,state,'goo');owner.update(state);
  const truth=modelTruthRow('ship_kestrel');
  assert.ok(Math.abs(s.hx-truth.bounds.size[0]*truth.drawScale)<1e-6,'measured skin follows live radius');
  state.render.meshes=new Map([[3,{userData:{visualBounds:{size:[32,8,12],center:[0,1,0]}}}]]);
  owner.update(state);assert.equal(s.hx,16);assert.equal(s.hz,6);assert.equal(s.top,5,'mounted live bounds take priority');
  owner.dispose();
});

test('status cutoff stops power immediately while independent seams drain short residue',()=>{
  for(const kind of ['burn','goo','sink']){
    const state=fixture(),owner=new StatusMatterVfx(new THREE.Scene());touch(owner,state,kind);at(state,1.16);owner.update(state);
    const before=owner.particles.live,statusId=kind==='sink'?MOMENTUM_SINK_STATUS_ID:kind==='burn'?'status_burning':'status_goo';
    delete state.combat.entities[3].statuses[statusId];at(state,1.18);owner.update(state);
    assert.equal(owner.stats.powered,0);assert.equal(owner.live,1);assert.ok(owner.particles.live<=before);
    if(kind==='burn')assert.ok(pieces(owner).every(row=>row[4]===3),'hot tongues shut off, damaged seats cool');
    at(state,1.27);owner.update(state);const residue=pieces(owner);
    assert.ok(residue.some(row=>row[21]>-.1),'cutoff crosses local material instead of shrinking owner');
    assert.ok(new Set(residue.map(row=>row[21])).size>1,'unequal seams retire independently');
    at(state,2);owner.update(state);assert.equal(owner.live,0);assert.equal(owner.particles.live,0);assert.equal(owner.mesh.visible,false);
    owner.dispose();
  }
});

test('expiry, admission loss and a frame-time jump cannot leave powered or late residue alive',()=>{
  const state=fixture(),owner=new StatusMatterVfx(new THREE.Scene());
  touch(owner,state,'burn');state.combat.entities[3].statuses.status_burning.expiresTick=70;
  at(state,1.1);owner.update(state);at(state,2);owner.update(state);assert.equal(owner.live,0);
  touch(owner,state,'goo');at(state,2.8);owner.update(state);assert.equal(owner.live,0,'lost admission retires within grace plus residue');
  owner.dispose();
});

test('sink loading tracks the real stored frame and goes inert in the deadband',()=>{
  const state=fixture(),body=state.entities.get(3),owner=new StatusMatterVfx(new THREE.Scene());
  touch(owner,state,'sink');at(state,1.1);owner.update(state);const s=owner.slots[8];
  assert.ok(Math.abs(s.axis-Math.atan2(-4,-40))<1e-9);
  body.vel={x:-12,z:33};owner.update(state);assert.ok(Math.abs(s.axis-Math.atan2(-33,12))<1e-9);
  body.vel={x:0,z:0};owner.update(state);assert.equal(owner.stats.powered,0);assert.equal(s.stopped,state.simTime);
  at(state,1.4);owner.update(state);assert.equal(owner.live,0);owner.dispose();
});

test('death and recycled identities cannot transfer a deposited status to another hull',()=>{
  const state=fixture(),owner=new StatusMatterVfx(new THREE.Scene());touch(owner,state,'goo');at(state,1.12);owner.update(state);
  const s=owner.slots[0],x=s.x,z=s.z;state.entities.set(3,{...state.entities.get(3),pos:{x:900,z:900}});
  at(state,1.15);owner.update(state);assert.equal(s.x,x);assert.equal(s.z,z);assert.equal(owner.stats.powered,0);
  at(state,2);owner.update(state);assert.equal(owner.live,0);owner.dispose();
});

test('pause, reduction and origin rebase preserve ownership without touching simulation or RNG',()=>{
  const state=fixture();let origin=0,calls=0;state.rng=()=>{throw Error('presentation used simulation RNG');};
  const owner=new StatusMatterVfx(new THREE.Scene(),{toLocal:(x,z,out)=>{calls++;out.x=x-origin;out.z=z;}});
  touch(owner,state,'burn');at(state,1.16);const before=JSON.stringify(state.combat);owner.update(state);
  const initial=pieces(owner),age=owner.particles.system.particles[0].age;
  owner.update(state);assert.deepEqual(pieces(owner),initial);assert.equal(owner.particles.system.particles[0].age,age);
  origin=100;owner.reproject(-100,0);owner.update(state);assert.ok(Math.abs(pieces(owner)[0][0]-initial[0][0]+100)<1e-5);
  state.settings.accessibility={reducedMotion:true,flashReduce:true};owner.update(state);
  assert.equal(owner.particles.live,0);assert.equal(owner.batch.material.uniforms.uMotion.value,0);
  assert.equal(owner.batch.material.uniforms.uFlash.value,.56);assert.equal(JSON.stringify(state.combat),before);
  assert.ok(calls>0);owner.clear();const previous=calls;owner.update(state);assert.equal(calls,previous);
  at(state,.5);touch(owner,state,'goo');owner.update(state);assert.equal(owner.live,1,'new rewind touch survives');
  owner.dispose();owner.dispose();assert.equal(touch(owner,state,'burn'),false);
});

test('caps match existing admission and idle owner performs no GPU/particle work',()=>{
  const state=fixture(),scene=new THREE.Scene(),owner=new StatusMatterVfx(scene);
  owner.batch.begin=()=>{throw Error('idle GPU work');};owner.particles.update=()=>{throw Error('idle particle work');};
  owner.update(state);delete owner.batch.begin;delete owner.particles.update;
  for(let id=3;id<33;id++){
    state.entities.set(id,{...state.entities.get(3),id,pos:{x:id,z:0}});
    state.combat.entities[id]={statuses:{status_goo:{expiresTick:300,stacks:1}}};
    owner.touchStatus({entityId:id,statusId:'status_goo'},state);
  }
  at(state,1.15);owner.update(state);assert.equal(owner.live,8);assert.ok(owner.batch.count<=owner.batch.capacity);
  owner.dispose();assert.equal(scene.children.length,0);
});
