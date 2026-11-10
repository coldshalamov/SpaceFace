import test from 'node:test';
import assert from 'node:assert/strict';
import { CERES_WORKFLEET_CONTRACT as C } from '../src/data/ceresWorkfleet.js';
import { ceresWorkfleetRoleForEntity, isCeresWorkfleetHardware } from '../src/data/ceresWorkfleetIdentity.js';
import { ceresWorkfleetPlaceFile, ceresWorkfleetPlaceTransform } from '../src/render/ceresWorkfleetVisuals.js';
import { wholeShipVisualForEntity, wholeShipHullPlacement, resolvePlaceDrawScale, isPackagedLiveWholeShipFile } from '../src/render/partsLibrary.js';
import { wreckPackagedFile } from '../src/render/visualFactory.js';
import { shouldVirtualizeFarActor } from '../src/world/farActorTable.js';
import { SIM_TIER } from '../src/world/activityClassification.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { mining,isBeamTargetEligible } from '../src/systems/mining.js';
import { physics } from '../src/core/physics.js';
import { Masks } from '../src/core/entity.js';
const entity=role=>({id:52,type:role==='breaker'?'ship':'wreck',alive:true,collides:true,
  radius:C.assets[role].radius,mass:C.assets[role].mass,hull:100,hullMax:100,
  pos:{x:10,z:20},vel:{x:0,z:0},rot:0,collisionMask:Masks.PROJECTILE,
  activity:{simTier:SIM_TIER.S2_ABSTRACT},data:{ceresWorkfleetRole:role,
    worldRecordId:C.identities[role==='breaker'?'worker':role],placeId:C.assets[role].id,salvagePool:{}}});
test('source selection and source-origin scale require exact role, durable identity and body type',()=>{
 for(const role of ['breaker','cradle','cutterHead']){
  const e=entity(role);assert.equal(ceresWorkfleetRoleForEntity(e),role);
  assert.equal(isCeresWorkfleetHardware(e),role!=='breaker');
  for(const mutate of [x=>x.data.worldRecordId+=':other',x=>x.type='fx',x=>x.data.ceresWorkfleetRole='ordinary']){
   const wrong=structuredClone(e);mutate(wrong);assert.equal(ceresWorkfleetRoleForEntity(wrong),null);
  }
  if(role==='breaker'){
   const selected=wholeShipVisualForEntity(e);
   if(isPackagedLiveWholeShipFile(C.assets.breaker.file))assert.equal(selected.file,C.assets.breaker.file);
   else assert.equal(selected,null,'unpublished authored body must fail closed, not use an unrelated hull');
  }
  else {
   assert.equal(wreckPackagedFile(e),C.assets[role].file);
   assert.equal(ceresWorkfleetPlaceFile(e),C.assets[role].file);
   assert.deepEqual(ceresWorkfleetPlaceTransform(e.data),{scale:2,y:0});
   assert.equal(resolvePlaceDrawScale(e.data,{targetRadius:999,authoredEnvelope:1,censusScale:99}),2);
   e.data.placeId='unrelated';assert.equal(ceresWorkfleetRoleForEntity(e),null);
  }
 }
 assert.equal(wholeShipHullPlacement({assetId:C.assets.breaker.assetId,bounds:{size:[90,17,62]}}).targetLength*C.assets.breaker.radius,180);
});
test('exact workfleet records are never reduced to lossy far rows',()=>{
 const state=createGameState(47);state.playerId=1;
 for(const role of ['breaker','cradle','cutterHead']){
  const e=entity(role);assert.equal(shouldVirtualizeFarActor(e,state),false);
  e.data.worldRecordId+=':ordinary';assert.equal(shouldVirtualizeFarActor(e,state),true);
 }
});
test('head and cradle receive ordinary projectile damage without enabling ordinary wreck damage',()=>{
 for(const role of ['cradle','cutterHead']){
  const e=entity(role),state=createGameState(47);state.entities.set(e.id,e);state.entityList=[e];
  const route=createDamageRouter({state,bus:createBus(),catalog:createCombatCatalog(),helpers:{}},{schedule(){}});
  const packet=scalarHitToDamagePacket({damage:20,damageType:'kinetic'});
  route({targetId:e.id,packet,origin:'projectile'});assert.ok(e.hull<100);
  const sweep={...physics,_segmentHitScratch:{},_bestSegmentHitScratch:{}};
  const shot={id:99,type:'projectile',radius:.1,collisionMask:Masks.SHIP};
  assert.equal(sweep._bestProjectileTarget(shot,{x:-200,z:20},{x:200,z:20},[e],null),e);
  assert.equal(isBeamTargetEligible(e,state),false);
  assert.equal(mining._drainWreck.call({...mining,state},null,e,50,1),0);assert.equal(e.alive,true);
  e.data.worldRecordId='ordinary';assert.equal(route({targetId:e.id,packet}).reason,'target_not_damageable');
 }
});
