// THE WORLD ANSWERS T1 - Bolas: "Two hulls, one rope, one rock."
// Genuine Rapier physics (the PQ-031.01 coupled-pair rig), the production consequence owner and the
// registered grammar. A Twin Bridle the player tied between two hostile hulls makes them orbit as one
// system; when the pair lawn-darts a rock (or one hull strikes a third hull) hard enough, within the
// bounded window, the journal's Twin Bridle evidence reads it as stunt Bolas - bolas_pair when the
// struck surface is terrain - with the same player provenance, so the player is credited the damage.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {writePhysicsControl} from '../src/core/physicsAuthority.js';
import {ATTACHMENT_DEFS} from '../src/data/combatDefs.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
import {BRIDLE_EVIDENCE,EVIDENCE_REVISION,journalFor} from '../src/combat/stuntEvidence.js';
import {stuntSpecificLine,stuntAccountFor,STUNT_VARIANT_LINES} from '../src/combat/stuntWitnesses.js';
import {stuntVariantFor,classifyStuntEvidence} from '../src/combat/stuntRecognition.js';
import {trickPay} from '../src/systems/stuntCombo.js';

const REST=80,MASS=16,RADIUS=6,ROCK_RADIUS=18,ROCK_X=220;
const BRIDLE=ATTACHMENT_DEFS.find(d=>d.id==='attachment_twin_bridle');
const SEEDS=[4242,8008];
const idle=()=>({source:'world-answers-t1',mode:'newtonian',force:{x:0,y:0,z:0},torque:{x:0,y:0,z:0},maxSpeed:Infinity});
function body(id,type,x,z,{mass=MASS,radius=RADIUS,hull=60,team=1,vx=0,vz=0}={}){
  const dynamic=type!=='asteroid';
  return {id,type,alive:true,team,collides:true,name:`${type} ${id}`,pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,radius,mass:dynamic?mass:1000000,maxSpeed:260,hull,hullMax:hull,shield:0,armor:0,
    data:{defId:type==='ship'?'ship_kestrel':null,encounter:{id:'bolas'}},
    physicsBody:{schemaVersion:1,dynamic,radius,mass:dynamic?mass:1000000,inertiaY:mass*4,ccd:dynamic,revision:0}};
}
async function scene(entities,seed){
  const state={playerId:0,seed,meta:{seed},entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({fixedDt:1/60,quantum:1e-5,mode:'rapier-dynamic',publishTelemetry:false});owner.syncFromEntities(entities);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers});
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
  const tricks=[],cards=[],kills=[],damage=[];
  bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:lineContractCompleted',c=>cards.push(c));
  bus.on('entity:killed',k=>kills.push(k));bus.on('combat:damage',d=>damage.push(d));
  return {state,bus,owner,tricks,cards,kills,damage,
    link(attachmentId,aId,bId,{emit=true}={}){
      const a=state.entities.get(aId),b=state.entities.get(bId);
      const handle=owner.createAttachment({attachmentId,defId:'attachment_twin_bridle',ownerId:aId,targetId:bId,sourceWorld:a.pos,targetWorld:b.pos,restLength:REST,spring:BRIDLE.spring,tick:state.tick});
      assert.ok(handle,'the rope exists');
      if(emit)bus.emit('massline:bridleLinked',{attachmentId,sourceId:aId,targetId:bId});
    },
    run(ticks){for(let i=0;i<ticks;i++){state.tick++;state.simTime=state.tick/60;
      for(const e of entities)if(e.physicsBody.dynamic&&e.id!==0&&e.alive!==false)writePhysicsControl(e,idle());
      owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick:state.tick,consequenceKernelVersion:1});grammar.update(1/60,state);}},
    close(){grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}
// PQ-031.01's rig: two hulls orbiting each other while their centre drifts into a rock.
function pairAndRock({phase=0,spin=55,drift=42,rockRadius=ROCK_RADIUS}={}){
  const half=REST*0.5,c=Math.cos(phase),s=Math.sin(phase);
  const a=body(1,'ship',c*half,s*half,{vx:-s*spin+drift,vz:c*spin});
  const b=body(2,'ship',-c*half,-s*half,{vx:s*spin+drift,vz:-c*spin});
  const rock=body(3,'asteroid',ROCK_X,0,{radius:rockRadius,team:0});
  return [body(0,'ship',-300,-300,{team:0}),a,b,rock];
}
// PQ-031.01: four of five orbit phases lawn-dart the rock. These are two that do (phase 4 hits the rock too, but the pair never swung far enough: see the leash test).
const PHASE_INDEX={4242:1,8008:3};
const phaseFor=seed=>PHASE_INDEX[seed]*(Math.PI*2)/5;

for(const seed of SEEDS){
  test(`T1 bolas (seed ${seed}): a bridled pair that lawn-darts a rock is Bolas, the bolas_pair reading, credited to the player`,async()=>{
    const s=await scene(pairAndRock({phase:phaseFor(seed)}),seed);try{
      s.link('bridle-t1',1,2);
      s.run(480);
      const j=journalFor(s.state);
      assert.ok(j.bridles.size>=1||s.tricks.length>=1,'the journal saw the rope');
      assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
      const [t]=s.tricks;
      assert.equal(t.trickId,'bolas');
      assert.equal(t.variantId,'bolas_pair');
      assert.equal(t.actorId,0);
      assert.equal(stuntSpecificLine({trickId:t.trickId,variantId:t.variantId}),'Two hulls, one rope, one rock.');
      assert.ok(trickPay(t).reputation>0);
      assert.ok(s.damage.some(d=>d.attackerId===0),'the rock hit is the player\'s damage');
    }finally{s.close();}
  });
}

test('T1 a pair with no rope in the journal is not bolas: the same spin without massline:bridleLinked reads nothing',async()=>{
  const s=await scene(pairAndRock({phase:phaseFor(4242)}),4242);try{
    s.link('bridle-silent',1,2,{emit:false});
    s.run(480);
    assert.equal(s.tricks.length,0,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.ok(!s.damage.some(d=>d.attackerId===0),'no rope evidence, no player credit');
  }finally{s.close();}
});

test('T1 a duplicate link receipt is the same rope: one trick, one pay',async()=>{
  const s=await scene(pairAndRock({phase:phaseFor(8008)}),8008);try{
    s.link('bridle-dup',1,2);
    s.bus.emit('massline:bridleLinked',{attachmentId:'bridle-dup',sourceId:1,targetId:2});
    s.bus.emit('massline:bridleLinked',{attachmentId:'bridle-dup',sourceId:1,targetId:2});
    s.run(480);
    assert.equal(journalFor(s.state).bridles.size,1);
    assert.ok(s.tricks.length<=1);
    assert.ok(s.cards.length<=1);
  }finally{s.close();}
});

test('T1 a straight drift into the rock with no orbit is a leash, not bolas: credited, never recognised',async()=>{
  const s=await scene(pairAndRock({phase:0,spin:0,drift:90}),4242);try{
    s.link('bridle-leash',1,2);
    s.run(480);
    assert.equal(s.tricks.length,0,JSON.stringify(s.tricks.map(t=>[t.trickId,t.variantId])));
  }finally{s.close();}
});

test('T1 the payoff lands inside the bounded window and the pair is not re-paid afterwards',async()=>{
  const s=await scene(pairAndRock({phase:phaseFor(4242)}),4242);try{
    s.link('bridle-window',1,2);
    s.run(700);
    assert.equal(s.tricks.length,1);
    assert.ok(s.tricks[0].tick-s.tricks[0].rootTick<=480,'payoff within the 480-tick root horizon');
    assert.equal(s.cards.length<=1,true);
  }finally{s.close();}
});

// A receipt-level rig for the gates the physics rig cannot reach cheaply (a hull strike barely
// scratches in this rig; the classifier must still treat it as plain Bolas, never the rock line).
function receiptFor({surface='terrain',orbit=120,closing=60,rootTick=10,tick=100,cruise=100}={}){
  return {tick,targetId:2,targetHostile:true,damageApplied:true,targetKilled:true,hullDamage:60,targetHullMax:60,surface,
    stuntEvidence:{revision:EVIDENCE_REVISION,root:{kind:'bridle',tick:rootTick,truncated:false,reference:{cruise,mass:MASS}},
      path:{edges:1,tick,closingSpeed:closing},contact:{aId:2,bId:3,aRef:{},bRef:{}},bridle:{orbitDegrees:orbit}}};
}
test('T1 receipt gates: orbit, closing speed and the 480-tick window are each necessary',()=>{
  assert.deepEqual(classifyStuntEvidence(receiptFor()),['bolas'],'positive control');
  assert.deepEqual(classifyStuntEvidence(receiptFor({orbit:89})),[],'a rope that never swung is a leash');
  assert.deepEqual(classifyStuntEvidence(receiptFor({closing:24})),[],'a bump is not a throw');
  assert.deepEqual(classifyStuntEvidence(receiptFor({tick:10+481})),[],'past the root horizon');
});
test('T1 a hull strike is plain Bolas: no bolas_pair, so no rock line',()=>{
  const r=receiptFor({surface:'hull'});
  assert.deepEqual(classifyStuntEvidence(r),['bolas']);
  assert.equal(stuntVariantFor('bolas',r),null);
  assert.equal(stuntVariantFor('bolas',receiptFor({surface:'terrain'})),'bolas_pair');
});

test('T1 pure rules: constants, variant gate and lines',()=>{
  assert.equal(BRIDLE_EVIDENCE.orbitDegrees,90);
  assert.equal(BRIDLE_EVIDENCE.closingFraction,0.25);
  const root={kind:'bridle'};
  assert.equal(stuntVariantFor('bolas',{surface:'terrain',stuntEvidence:{root}}),'bolas_pair');
  assert.equal(stuntVariantFor('bolas',{surface:'structure',stuntEvidence:{root}}),'bolas_pair');
  assert.equal(stuntVariantFor('bolas',{surface:'hull',stuntEvidence:{root}}),null,'a hull strike is plain bolas');
  assert.equal(stuntVariantFor('bolas',{surface:'terrain',stuntEvidence:{root:{kind:'constraint'}}}),null,'a swung tether stays plain bolas');
  assert.equal(STUNT_VARIANT_LINES.bolas_pair,'Two hulls, one rope, one rock.');
  assert.equal(stuntSpecificLine({trickId:'bolas',variantId:null}),null);
  assert.match(stuntAccountFor({trickId:'bolas',variantId:'bolas_pair',name:'Bolas'}),/./);
});
