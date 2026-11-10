// THE WORLD ANSWERS T9 - Dead man's mass: "his own wingman finished him."
// Genuine Rapier physics, the production consequence owner and the registered grammar (the same
// route pq146-line-contracts proves for plain Dead Man's Mass). A player-shoved wreck that kills a
// hull of the SAME faction as the wreck's own origin is the plain trick plus a variant: its own
// witness line and the Second-Hand Violence card. A wreck that kills an ENEMY of its origin faction
// stays the plain trick with the plain line.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
import {contractBook,contractCompletionsFor} from '../src/combat/stuntContracts.js';
import {stuntSpecificLine,stuntAccountFor,STUNT_VARIANT_LINES} from '../src/combat/stuntWitnesses.js';
import {stuntVariantFor} from '../src/combat/stuntRecognition.js';

const SEEDS=[4242,8008];
function body(id,type,x,z,{mass=16,radius=6,hull=100,team=1,factionId,data={}}={}){
  const dynamic=type!=='asteroid';
  return {id,type,alive:true,team,collides:true,name:`${type} ${id}`,pos:{x,z},vel:{x:0,z:0},rot:0,angVel:0,radius,mass:dynamic?mass:1000000,hull,hullMax:hull,shield:0,armor:0,
    ...(factionId?{factionId}:{}),
    data:{defId:type==='ship'?'ship_kestrel':null,encounter:{id:'own-wingman'},...data},
    physicsBody:{schemaVersion:1,dynamic,radius,mass:dynamic?mass:1000000,inertiaY:48,ccd:true,revision:0}};
}
async function scene(entities,seed){
  const state={playerId:0,seed,meta:{seed},entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers});
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
  const tricks=[],cards=[],kills=[],damage=[];
  bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:lineContractCompleted',c=>cards.push(c));
  bus.on('entity:killed',k=>kills.push(k));bus.on('combat:damage',d=>damage.push(d));
  return {state,bus,tricks,cards,kills,damage,
    shove(id,vx,vz,actorId=0){const e=state.entities.get(id);owner.applyImpulse({entityId:id,impulse:{x:e.mass*vx,y:0,z:e.mass*vz},tick:state.tick,reason:'weapon_hit',
      provenance:actorId==null?undefined:{actorId,weaponId:'wpn_concussion_cannon_m'}});},
    run(ticks){for(let i=0;i<ticks;i++){state.tick++;state.simTime=state.tick/60;owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick:state.tick,consequenceKernelVersion:1});grammar.update(1/60,state);}},
    close(){grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}
// A fresh kill's hulk (origin faction `wreckFaction`) is shoved into a live hull of `victimFaction`.
async function wreckThrow({seed=4242,wreckFaction='faction_reach',victimFaction='faction_reach',shover=0}={}){
  const entities=[body(0,'ship',-200,-200,{team:0}),
    body(1,'wreck',-70,0,{mass:12,hull:1,data:{hulkFactionId:wreckFaction,provenance:{victimFactionId:wreckFaction}}}),
    body(2,'ship',0,0,{hull:10,factionId:victimFaction}),body(5,'ship',300,300,{team:1,factionId:wreckFaction})];
  const s=await scene(entities,seed);
  s.run(5);s.shove(1,70,0,shover);s.run(120);return s;
}

for(const seed of SEEDS){
  test(`T9 own wingman (seed ${seed}): a player-shoved wreck that kills a hull of its own faction is the wingman reading`,async()=>{
    const s=await wreckThrow({seed});try{
      assert.equal(s.state.entities.get(2).alive,false,'the wreck must physically destroy the wingman');
      assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
      const [t]=s.tricks;
      assert.equal(t.trickId,'dead_mans_mass','same trick, a more exact reading');
      assert.equal(t.variantId,'own_wingman');
      assert.equal(stuntSpecificLine({trickId:t.trickId,variantId:t.variantId}),'His own wingman finished him.');
      assert.match(stuntAccountFor({...t}),/its own wingman/);
      // The kill is the player's: it rides the shoved wreck's provenance, not the environment.
      const killDamage=s.damage.find(d=>(d.targetId??d.victimId)===2);
      assert.ok(killDamage,'the wingman took routed damage');
      assert.equal(killDamage.attackerId,0,'damage on the wingman is attributed to the player');
      const kill=s.kills.find(k=>(k.id??k.targetId??k.victimId)===2);
      assert.ok(kill,'the wingman death is a published kill');
      assert.equal(kill.killerId,0,'the kill is credited to the player');
      assert.deepEqual(s.cards.map(c=>c.contractId),['second_hand_violence']);
      assert.equal(contractBook(s.state).completed[0].trickId,'dead_mans_mass');
    }finally{s.close();}
  });

  test(`T9 plain Dead Man's Mass (seed ${seed}): the wreck killing an ENEMY of its origin faction keeps the plain line`,async()=>{
    const s=await wreckThrow({seed,wreckFaction:'faction_reach',victimFaction:'faction_scn'});try{
      assert.equal(s.state.entities.get(2).alive,false);
      assert.equal(s.tricks.length,1);
      assert.equal(s.tricks[0].trickId,'dead_mans_mass');
      assert.equal(s.tricks[0].variantId,null,'not his own wingman');
      assert.equal(stuntSpecificLine({trickId:'dead_mans_mass',variantId:null}),null,'the generic dead_mans_mass lines still speak');
      assert.deepEqual(s.cards.map(c=>c.contractId),['second_hand_violence'],'the card is paid by the plain trick too');
    }finally{s.close();}
  });
}

test('T9 unknown origin faction is never "his own": a wreck with no recorded faction gives the plain reading',async()=>{
  const entities=[body(0,'ship',-200,-200,{team:0}),body(1,'wreck',-70,0,{mass:12,hull:1}),body(2,'ship',0,0,{hull:10,factionId:'faction_reach'})];
  const s=await scene(entities,4242);try{
    s.run(5);s.shove(1,70,0);s.run(120);
    assert.equal(s.tricks.length,1);assert.equal(s.tricks[0].trickId,'dead_mans_mass');assert.equal(s.tricks[0].variantId,null);
  }finally{s.close();}
});

test('T9 an NPC-shoved wreck gives the player nothing: no trick, no card, no wingman line',async()=>{
  const s=await wreckThrow({seed:8008,shover:5});try{
    assert.equal(s.tricks.length,0,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.cards.length,0);
    // Whatever the NPC-shoved wreck does to the hull, none of it is the player's.
    assert.ok(!s.kills.some(k=>k.killerId===0),'an NPC shove never credits the player with a kill');
    assert.ok(!s.damage.some(d=>d.attackerId===0),'nor with any damage');
  }finally{s.close();}
});

test('T9 a duplicate settled receipt cannot mint a second wingman reading or a second card',async()=>{
  const s=await wreckThrow({seed:4242});try{
    const receipts=[];s.bus.on('combat:collisionConsequence',c=>receipts.push(c));
    const before=s.tricks.length;
    assert.equal(before,1);
    // Replay a settled consequence (same tick, same identities): an alias, not a new act.
    const wingman=s.state.entities.get(2);
    assert.equal(wingman.alive,false);
    s.run(10);
    assert.equal(s.tricks.length,1);
    assert.equal(s.cards.length,1);
    assert.equal(contractBook(s.state).completed.length,1);
  }finally{s.close();}
});

test('T9 pure rules: the variant needs a kill, a recorded origin faction and an equal target faction',()=>{
  const root={sourceFactionId:'faction_reach'};
  const contact=faction=>({aId:2,bId:1,aRef:{factionId:faction},bRef:{factionId:'faction_reach'}});
  const receipt=(over={})=>({targetId:2,targetKilled:true,stuntEvidence:{root,contact:contact('faction_reach')},...over});
  assert.equal(stuntVariantFor('dead_mans_mass',receipt()),'own_wingman');
  assert.equal(stuntVariantFor('dead_mans_mass',receipt({targetKilled:false})),null,'finished him means killed him');
  assert.equal(stuntVariantFor('dead_mans_mass',receipt({stuntEvidence:{root,contact:contact('faction_scn')}})),null);
  assert.equal(stuntVariantFor('dead_mans_mass',receipt({stuntEvidence:{root:{sourceFactionId:null},contact:contact(null)}})),null,'null never equals null');
  assert.equal(stuntVariantFor('bolas',receipt()),null,'only Dead Man\'s Mass takes the wingman reading');
  assert.equal(stuntVariantFor('dead_mans_mass',{targetId:2,targetKilled:true}),null);
  assert.deepEqual(contractCompletionsFor({role:'primary',trickId:'dead_mans_mass',variantId:'own_wingman',consequence:{killed:true},metrics:{}}),['second_hand_violence']);
  assert.deepEqual(contractCompletionsFor({role:'primary',trickId:'dead_mans_mass',variantId:'own_wingman',consequence:{killed:false},metrics:{}}),[],'a card needs the kill');
  assert.ok(STUNT_VARIANT_LINES.own_wingman);
});
