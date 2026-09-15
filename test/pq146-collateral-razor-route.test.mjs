// PQ-146 modifiers through a genuine route: a razor-rated release throws a pirate into its
// wingman (material through 25% hull + helm loss from the production tumble owner), and the
// wingman carries the momentum into a third hull. One primary, amended once, paid by difference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {tumbleStates} from '../src/systems/tumbleStates.js';
import {candidateStyle} from '../src/combat/stuntScoring.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';

function body(id,type,x,z,{mass=16,radius=8,hull=100,team=1,vx=0,vz=0}={}){
  return {id,type,alive:true,team,name:`${type} ${id}`,pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,radius,mass,hull,hullMax:hull,shield:0,armor:0,
    data:{defId:'ship_kestrel',encounter:{id:'collateral'},runCohort:id?'survival':undefined,ai:id?{huntPlayer:true}:{}},
    physicsBody:{schemaVersion:1,dynamic:true,radius,mass,inertiaY:48,ccd:true,revision:0}};
}
async function razorBolas({grade='razor',wingman=true,replay=false}={}){
  const player=body(0,'ship',0,0,{team:0,mass:400}),payload=body(1,'ship',35,0,{vz:110,mass:28}),first=body(2,'ship',-90,33,{hull:60,mass:10});
  const entities=[player,payload,first];if(wingman)entities.push(body(3,'ship',-135,51,{hull:6,mass:10}));
  const state={playerId:0,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{},
    run:{kind:'survival',phase:'active',seed:7,wave:1}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers}),registry={get:id=>id==='combat'?{kernel}:null};
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry});
  const tumble=Object.create(tumbleStates);tumble.init({state,bus,registry,helpers});
  const detected=[],amended=[],consequences=[],pointsAfterFirst=[];
  bus.on('stunt:trickDetected',t=>{detected.push(t);pointsAfterFirst.push(state.stunts.combo.acts[0]?.points);});
  bus.on('stunt:trickAmended',t=>amended.push(t));bus.on('combat:collisionConsequence',c=>consequences.push(c));
  try{
    owner.createAttachment({attachmentId:'rope',defId:'tether_standard',ownerId:0,targetId:1,sourceWorld:player.pos,targetWorld:payload.pos,restLength:30,tick:0});
    for(let tick=1;tick<=200;tick++){
      state.tick=tick;state.simTime=tick/60;
      if(tick===31){owner.cutAttachment({attachmentId:'rope',reason:'tether_cut',tick});bus.emit('tether:releaseRated',{targetId:1,classification:grade,tick});}
      owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick,consequenceKernelVersion:1});
      tumble.update(1/60,state);grammar.update(1/60,state);
    }
    if(replay){
      // Replaying the settled wingman receipt (same tick, same identities) is an alias, not a new act.
      const settled=consequences.find(c=>c.targetId===3&&c.targetKilled);
      bus.emit('combat:collisionConsequence',settled);
    }
    return {state,detected,amended,consequences,pointsAfterFirst,combo:state.stunts.combo};
  }finally{tumble.destroy?.();grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}
}
test('Razor Bolas · Collateral ×2: one primary, razor from the rated release, one amendment paid by difference',async()=>{
  const r=await razorBolas();
  const hit=r.consequences.find(c=>c.targetId===2&&c.otherId===1),chain=r.consequences.find(c=>c.targetId===3&&c.otherId===2);
  assert.ok(hit&&hit.hullDamage>=0.25*hit.targetHullMax&&hit.helmLossSeconds>=1,`first terminal is material without dying ${JSON.stringify(hit)}`);
  assert.ok(chain?.targetKilled,'the wingman carries the momentum into the third hull, which dies');
  assert.equal(r.detected.length,1);assert.equal(r.amended.length,1);
  const [first]=r.detected,[second]=r.amended;
  assert.equal(first.trickId,'bolas');assert.equal(first.modifiers.razorRelease,'razor');assert.equal(first.modifiers.collateralCount,1);
  assert.equal(second.trickId,'bolas');assert.equal(second.episodeId,first.episodeId);assert.equal(second.amendment,true);
  assert.equal(second.modifiers.collateralCount,2);assert.equal(second.modifiers.razorRelease,'razor');assert.equal(second.victimLives.length,2);
  assert.equal(second.tick-first.tick<=180,true,'collateral settles inside the three-second amendment window');
  assert.equal(r.combo.acts.length,1,'three names are not three acts');
  const act=r.combo.acts[0];
  assert.equal(r.pointsAfterFirst[0],50,'a nonlethal fodder terminal unlocks half its lifetime budget');
  assert.equal(act.allocation.length,2);
  assert.ok(Math.abs(act.points-Math.min(candidateStyle(second),150))<1e-6,`amendment pays only the difference: ${act.points} vs ${candidateStyle(second)}`);
  assert.equal(r.combo.activeCount,1);
});
test('modifier accounting: a messy release is worth exactly the razor premium less, and no wingman means no amendment',async()=>{
  const razor=await razorBolas(),messy=await razorBolas({grade:'messy'});
  assert.equal(messy.detected[0]?.modifiers.razorRelease,'messy');
  assert.ok(Math.abs(razor.combo.acts[0].points-messy.combo.acts[0].points-20)<1e-6,`${razor.combo.acts[0].points} vs ${messy.combo.acts[0].points}`);
  const alone=await razorBolas({wingman:false});
  assert.equal(alone.detected.length,1);assert.equal(alone.amended.length,0);assert.equal(alone.combo.acts[0].points,50);
});
test('a replayed settled consequence cannot amend again or add points',async()=>{
  const r=await razorBolas({replay:true});
  assert.equal(r.amended.length,1);assert.equal(r.combo.acts.length,1);
  assert.ok(Math.abs(r.combo.acts[0].points-Math.min(candidateStyle(r.amended[0]),150))<1e-6);
});
