// PQ-146 genuine Clothesline route: a loaded Massline swings its payload across a pursuer's
// corridor, the endpoint intercepts the pursuer on the line, and the deflected pursuer dies on
// terrain it would never have reached. Real Rapier bodies and the production consequence owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {journalFor} from '../src/combat/stuntEvidence.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';

function body(id,type,x,z,{mass=16,radius=8,hull=100,team=1,vx=0,vz=0}={}){
  const dynamic=type!=='asteroid';
  return {id,type,alive:true,team,name:`${type} ${id}`,pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,radius,mass:dynamic?mass:1000000,hull,hullMax:hull,shield:0,armor:0,
    data:{defId:type==='ship'?'ship_kestrel':null,encounter:{id:'clothesline'}},
    physicsBody:{schemaVersion:1,dynamic,radius,mass:dynamic?mass:1000000,inertiaY:48,ccd:true,revision:0}};
}
async function clothesline({pursuerX=-66,rock={x:45,z:-43},slack=false}={}){
  const player=body(0,'ship',0,0,{team:0,mass:400}),payload=body(1,'ship',35,0,{vz:110,mass:28}),pursuer=body(2,'ship',pursuerX,17,{vx:60,hull:40});
  const entities=[player,payload,pursuer,body(3,'asteroid',rock.x,rock.z,{radius:14})];
  const state={playerId:0,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers});
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
  const tricks=[],contacts=[];bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:trickAmended',t=>tricks.push(t));bus.on('combat:collisionConsequence',c=>contacts.push(c));
  try{
    owner.createAttachment({attachmentId:'rope',defId:'tether_standard',ownerId:0,targetId:1,sourceWorld:player.pos,targetWorld:payload.pos,restLength:slack?1000:30,tick:0});
    for(let tick=1;tick<=200;tick++){
      state.tick=tick;state.simTime=tick/60;owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick,consequenceKernelVersion:1});
      grammar.update(1/60,state);
    }
    return {state,tricks,contacts,journal:journalFor(state)};
  }finally{grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}
}
test('Clothesline: loaded line intercepts the pursuer on the segment and its deflected corridor ends on terrain',async()=>{
  const {state,tricks,contacts}=await clothesline();
  const intercept=contacts.find(c=>c.targetId===2&&c.otherId===1),terminal=contacts.find(c=>c.targetId===2&&c.surface==='terrain');
  assert.ok(intercept,'the payload must physically strike the pursuer');
  assert.ok(terminal?.targetKilled,`the deflected pursuer must die on the rock ${JSON.stringify(contacts.map(c=>[c.tick,c.targetId,c.otherId,c.surface]))}`);
  assert.equal(state.entities.get(2).alive,false);
  assert.equal(tricks.length,1,JSON.stringify(tricks.map(t=>[t.tick,t.trickId,t.amendment])));
  const trick=tricks[0];
  assert.equal(trick.trickId,'clothesline');assert.equal(trick.family,'tether');assert.equal(trick.targetId,2);
  assert.ok(trick.factualTags.includes('wrecking_ball'),'the attached flail contact remains a factual subtag');
  const line=trick.causeChain.find(n=>n.type==='line_intercept');
  assert.ok(line,'the intercept edge is part of the chain');
  assert.ok(line.deltaV>=0.3*trick.metrics.referenceCruise,`whole-episode transverse transfer ${line.deltaV}`);
  assert.equal(line.crossedPriorCorridor,true);
});
test('Clothesline negatives: a slack rope, and a pursuer that only crosses where the line was, mint nothing',async()=>{
  const slack=await clothesline({slack:true});
  assert.equal(slack.tricks.length,0,JSON.stringify(slack.tricks.map(t=>t.trickId)));
  const crossing=await clothesline({pursuerX:-40,rock:{x:120,z:17}});
  assert.ok(crossing.contacts.some(c=>c.targetId===2&&c.surface==='terrain'),'the untouched pursuer still reaches the rock on its own line');
  assert.ok(!crossing.contacts.some(c=>c.targetId===2&&c.otherId===1),'no endpoint contact on this pass');
  assert.equal(crossing.tricks.length,0,JSON.stringify(crossing.tricks.map(t=>t.trickId)));
});
