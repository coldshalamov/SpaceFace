import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WEAPONS } from '../src/data/weapons.js';
import { resolveWeaponRecipe } from '../src/render/weapons/recipes.js';
import { weaponSignature } from '../src/render/forceLanguage/catalog.js';
import { WeaponDischargePool } from '../src/render/forceLanguage/weaponDischargePool.js';
import { ActionVfx } from '../src/render/actionVfx.js';
import { StatusMatterVfx, collectHeatedMaterialBodies } from '../src/render/vfx/statusMatterVfx.js';
import { collectStatusAttachedVictims, planStatusAttachedEmit } from '../src/render/statusAttachedVfx.js';
import { vfx } from '../src/render/vfx.js';
import { prepareExternalPhysicsImpulse } from '../src/core/physicsAuthority.js';
import { updateShipPitchPresentation } from '../src/render/shipPitchPresentation.js';

const pose={x:0,y:.4,z:0,ax:1,ay:0,az:0};
const flash={life:.25,size0:1.4,size1:2.8,opacity0:1.35};
function shape(pool){
  return Array.from({length:pool.batch.count},(_,i)=>pool.batch.attributes.slice(0,3)
    .flatMap(a=>Array.from(a.array.slice(i*4,i*4+4))));
}

test('every shipped weapon has an authored source identity, including advanced setup tools',()=>{
  for(const weapon of WEAPONS){
    const recipe=resolveWeaponRecipe(weapon.id),signature=weaponSignature(recipe.variant);
    assert.ok(signature,`${weapon.id} must not borrow the autocannon fallback`);
  }
});

test('advanced sources have distinct moving constructions, preserve pause, and retire',()=>{
  const variants=['filament','field-ring','filament-latch','wedge','sticky-charge','primer-arc','cooker-seam','driver-slug'];
  const signatures=new Set();
  for(const variant of variants){
    const scene=new THREE.Scene(),pool=new WeaponDischargePool(scene,{capacity:1});
    pool.spawn({variant},pose,'player',flash,1);pool.update(.025);
    const early=shape(pool);pool.update(.06);const peak=shape(pool);
    assert.notDeepEqual(early,peak,variant+' articulates while powered');
    assert.ok(peak.flat().every(Number.isFinite),variant);
    assert.ok(pool.batch.count<=9,variant+' keeps existing surface budget');
    signatures.add(JSON.stringify(peak));pool.update(0);assert.deepEqual(shape(pool),peak,'paused source is stable');
    pool.update(.3);assert.equal(pool.batch.count,0);assert.equal(pool.activeCount,0);
    pool.dispose();assert.equal(scene.children.length,0);
  }
  assert.equal(signatures.size,variants.length,'shape separates utility verbs before palette');
});

test('native bombs cannot also spawn a generic action pressure wave',()=>{
  const owner=new ActionVfx(new THREE.Scene());
  for(const payloadId of ['bomb_frag','bomb_concussion','bomb_singularity','bomb_goo','bomb_emp','bomb_thermite','bomb_scrambler','bomb_anchor']){
    assert.equal(owner.emit('bombs:detonated',{payloadId,bombId:3,pos:{x:0,z:0}},{simTime:1}),false);
  }
  assert.equal(owner.live,0);owner.dispose();
});

test('gravity marks show body-seated contracting jaws for the real status then unload and disappear',()=>{
  const body={id:1,type:'ship',alive:true,pos:{x:20,z:5},radius:10,rot:0,vel:{x:0,z:0},data:{}};
  const active={expiresTick:180,stacks:1};
  const state={simTime:1,tick:60,entities:new Map([[1,body]]),settings:{video:{}},render:{interpolationAlpha:1},
    combat:{entities:{1:{statuses:{status_gravity_marked:active,status_goo:{...active}}}}}};
  const owner=new StatusMatterVfx(new THREE.Scene()),before=JSON.stringify(body);
  let victims=collectStatusAttachedVictims(state),victim=victims.find(v=>v.kind==='gravity');
  assert.ok(victim);assert.notEqual(victim.key,victims.find(v=>v.kind==='goo').key);
  const plan=planStatusAttachedEmit(victim,0,{},.13);assert.equal(plan.emit,true);assert.equal(plan.sprites.length,0);
  owner.touchStatus(victim,state);state.simTime=1.15;state.tick=69;owner.update(state);
  assert.equal(owner.batch.count,4);const early=shape(owner);
  state.simTime=1.27;state.tick=76;owner.touchStatus(victim,state);owner.update(state);
  assert.equal(owner.stats.powered,1);assert.notDeepEqual(shape(owner),early);
  assert.equal(JSON.stringify(body),before,'render never writes the target');
  body.pos={x:40,z:25};body.rot=Math.PI/2;owner.update(state);
  assert.equal(owner.slots[0].x,40);assert.equal(owner.slots[0].z,25);
  state.settings.video.motionReduce=true;state.settings.video.flashReduce=true;
  owner.update(state);const reduced=shape(owner);
  state.simTime=1.39;state.tick=83;owner.touchStatus(victim,state);owner.update(state);
  assert.deepEqual(shape(owner),reduced,'reduced motion retains an unmoving readable mark');
  delete state.combat.entities[1].statuses.status_gravity_marked;
  owner.update(state);assert.equal(owner.stats.powered,0);assert.equal(owner.live,1);
  state.simTime=2;state.tick=120;owner.update(state);assert.equal(owner.live,0);assert.equal(owner.mesh.visible,false);
  owner.dispose();
});

test('material heat advertises approaching fracture/ignition on the actual body and ends with reaction',()=>{
  const player={id:1,pos:{x:0,z:0}},rock={id:2,type:'asteroid',alive:true,pos:{x:30,z:5},rot:.2,radius:12,
    data:{material:'crystal',materialCondition:{heat:18,reacted:false}}};
  const state={simTime:1,tick:60,playerId:1,entities:new Map([[1,player],[2,rock]]),entityList:[player,rock],settings:{video:{}}};
  const before=JSON.stringify(rock),owner=new StatusMatterVfx(new THREE.Scene());
  assert.deepEqual(collectHeatedMaterialBodies(state,[],[]),[rock]);
  assert.equal(owner.touchMaterial(rock,state),true);state.simTime=1.16;owner.update(state);
  const low=shape(owner);assert.equal(owner.batch.count,3);assert.equal(owner.stats.powered,1);
  assert.equal(JSON.stringify(rock),before,'material presentation reads heat only');
  rock.data.materialCondition.heat=42;owner.touchMaterial(rock,state);owner.update(state);
  assert.ok(owner.slots[0].opacity>.8);assert.notDeepEqual(shape(owner),low,'near-threshold seams widen');
  rock.data.materialCondition.reacted=true;owner.update(state);assert.equal(owner.stats.powered,0);
  state.simTime=2;owner.update(state);assert.equal(owner.live,0);owner.dispose();
});

test('environment detonation routes to staged fuel rupture and crystal fracture uses its real size',()=>{
  const callbacks=new Map(),owner=Object.create(vfx);owner._subs=[];
  owner.state={entities:new Map([[4,{id:4,pos:{x:6,z:7},radius:6,data:{material:'crystal'}}]])};
  owner.bus={on(name,fn){callbacks.set(name,fn);return ()=>{};}};
  owner._subscribe();let explosion;
  owner._queueExplosion=(receipt,classId,radius,cause)=>{explosion={receipt,classId,radius,cause};return true;};
  callbacks.get('environment:detonated')({id:2,pos:{x:3,z:4},radius:17,material:'volatile'});
  assert.equal(explosion.receipt.materialId,'fuel');assert.equal(explosion.radius,17);assert.equal(explosion.cause,'explosive');
  assert.equal(callbacks.has('bomb:exploded'),false,'legacy alias cannot duplicate the rupture');
  owner._scene={};let contact,dust;owner._composeImpact=(...args)=>{contact=args;return true;};
  owner._spawnSprite=owner._eventLight=owner._emitJuiceCue=()=>{};
  owner._gas={emitFractureDust(args){dust=args;}};
  callbacks.get('asteroid:destroyed')({id:3,pos:{x:5,z:6},radius:21,material:'crystal'});
  assert.equal(contact[8],'ice');assert.equal(contact[9],21);assert.equal(dust.scale,42);
  callbacks.get('asteroid:chunked')({parentId:3,chunkId:4});
  assert.equal(contact[8],'ice');assert.equal(contact[9],6,'fresh crystal fragments retain the source material');
});

test('player shove visibly banks and recoils from admitted momentum, preserves heading and settles',()=>{
  function run(reduced=false){
    const body={id:1,isPlayer:true,type:'ship',alive:true,pos:{x:0,z:0},vel:{x:0,z:0},rot:.0,
      mass:16,radius:8,physicsBody:{radius:8},flags:{},bank:0,pitch:0};
    const state={simTime:1,tick:60,playerId:1,entityList:[body],settings:{video:{motionReduce:reduced}}};
    const accepted=prepareExternalPhysicsImpulse(body,{x:-640,z:640},{externalEffect:true,tick:60,isPlayerTarget:true});
    assert.ok(Math.hypot(accepted.x,accepted.z)>0);
    updateShipPitchPresentation(state,1/60);state.simTime=1.05;state.tick=63;updateShipPitchPresentation(state,.05);
    const peak={bank:body.bank,pitch:body.pitch};assert.ok(peak.bank>0);assert.ok(peak.pitch>0);
    const paused={bank:body.bank,pitch:body.pitch};updateShipPitchPresentation(state,.05);
    assert.deepEqual({bank:body.bank,pitch:body.pitch},paused,'paused render does not repeat the kick');
    for(let i=0;i<90;i++){state.simTime+=1/60;state.tick++;updateShipPitchPresentation(state,1/60);}
    assert.ok(Math.abs(body.bank)<.002);assert.ok(Math.abs(body.pitch)<.002);
    assert.equal(body.rot,0);assert.deepEqual(body.vel,{x:0,z:0});assert.deepEqual(body.pos,{x:0,z:0});
    return peak;
  }
  const full=run(),reduced=run(true);assert.ok(reduced.bank<full.bank*.2);assert.ok(reduced.pitch<full.pitch*.2);
});
