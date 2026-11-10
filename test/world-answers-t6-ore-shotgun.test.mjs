// THE WORLD ANSWERS T6 - Ore shotgun: "that was your iron ore. The pod killed him."
// Genuine Rapier physics, the production consequence owner and the registered grammar. A jettisoned
// cargo pod the PLAYER shoved (or threw) that kills a hostile hull is credited to the player and read
// as Ore Shotgun, with a witness line that names the cargo. Attribution rides the shove's own
// provenance (the journal roots only the player's impulses), so an NPC-shoved pod gives no credit.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
import {stuntSpecificLine,stuntAccountFor} from '../src/combat/stuntWitnesses.js';
import {ORE_SHOTGUN_CLOSING_FRACTION,stuntCargoOf,TRICK_DEFINITIONS} from '../src/combat/stuntRecognition.js';
import {trickPay} from '../src/systems/stuntCombo.js';

const SEEDS=[4242,8008];
function body(id,type,x,z,{mass=16,radius=6,hull=100,team=1,data={}}={}){
  const dynamic=type!=='asteroid';
  return {id,type,alive:true,team,collides:true,name:`${type} ${id}`,pos:{x,z},vel:{x:0,z:0},rot:0,angVel:0,radius,mass:dynamic?mass:1000000,hull,hullMax:hull,shield:0,armor:0,
    data:{defId:type==='ship'?'ship_kestrel':null,encounter:{id:'ore-shotgun'},...data},
    physicsBody:{schemaVersion:1,dynamic,radius,mass:dynamic?mass:1000000,inertiaY:48,ccd:true,revision:0}};
}
const pod=(id,x,z,over={})=>body(id,'payload',x,z,{mass:20,radius:3,hull:1,team:2,data:{payloadType:'jettisoned_cargo',commodityId:'cmdty_ore_iron',amount:25,...over}});
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
// The player's pod is shoved at a hostile hull; `targetHull` decides whether the cargo can kill it.
async function podThrow({seed=4242,targetHull=10,podOver={},speed=70,shover=0}={}){
  const entities=[body(0,'ship',-200,-200,{team:0}),pod(1,-70,0,podOver),body(2,'ship',0,0,{hull:targetHull}),body(5,'ship',300,300,{team:1})];
  const s=await scene(entities,seed);
  s.run(5);s.shove(1,speed,0,shover);s.run(120);return s;
}

for(const seed of SEEDS){
  test(`T6 ore shotgun (seed ${seed}): a player-shoved cargo pod that kills a hostile hull is credited and read as Ore Shotgun`,async()=>{
    const s=await podThrow({seed});try{
      assert.equal(s.state.entities.get(2).alive,false,'the pod must physically destroy the hull');
      assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
      const [t]=s.tricks;
      assert.equal(t.trickId,'ore_shotgun');
      assert.equal(t.family,'debris');
      assert.equal(t.actorId,0,'the player is the actor');
      assert.deepEqual({commodityId:t.cargo.commodityId,amount:t.cargo.amount,name:t.cargo.name},{commodityId:'cmdty_ore_iron',amount:25,name:'Iron Ore'});
      assert.equal(stuntSpecificLine({trickId:t.trickId,cargo:t.cargo}),'That was your iron ore. The pod killed him.','the witness line names the cargo');
      assert.match(stuntAccountFor({...t}),/cargo killed/);
      const killDamage=s.damage.find(d=>(d.targetId??d.victimId)===2);
      assert.ok(killDamage,'the hull took routed damage');
      assert.equal(killDamage.attackerId,0,'your cargo killed them: damage is the player\'s');
      const kill=s.kills.find(k=>(k.id??k.targetId??k.victimId)===2);
      assert.ok(kill);
      assert.equal(kill.killerId,0,'the kill is credited to the player');
      assert.ok(trickPay(t).reputation>0,'the trick is paid by rarity like its siblings');
    }finally{s.close();}
  });
}

test('T6 the cargo is named from the pod, not guessed: a different commodity gives a different line',async()=>{
  const s=await podThrow({seed:8008,podOver:{commodityId:'cmdty_ore_copper',amount:9}});try{
    assert.equal(s.tricks.length,1);
    assert.equal(s.tricks[0].trickId,'ore_shotgun');
    assert.equal(stuntSpecificLine({trickId:'ore_shotgun',cargo:s.tricks[0].cargo}),'That was your copper ore. The pod killed him.');
    assert.equal(s.tricks[0].cargo.amount,9);
  }finally{s.close();}
});

test('T6 an NPC-shoved pod gives the player nothing: no trick, no card, no kill credit',async()=>{
  const s=await podThrow({seed:4242,shover:5});try{
    assert.equal(s.tricks.length,0,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.cards.length,0);
    assert.ok(!s.kills.some(k=>k.killerId===0),'an NPC shove never credits the player with a kill');
    assert.ok(!s.damage.some(d=>d.attackerId===0),'nor with any damage');
  }finally{s.close();}
});

test('T6 a pod that does not kill is not a shotgun: the hull survives and no Ore Shotgun is read',async()=>{
  const s=await podThrow({seed:4242,targetHull:100000});try{
    assert.equal(s.state.entities.get(2).alive,true);
    assert.ok(!s.tricks.some(t=>t.trickId==='ore_shotgun'),JSON.stringify(s.tricks.map(t=>t.trickId)));
  }finally{s.close();}
});

test('T6 a pod with nothing recorded inside is not cargo: no Ore Shotgun',async()=>{
  const s=await podThrow({seed:4242,podOver:{commodityId:null,amount:0}});try{
    assert.ok(!s.tricks.some(t=>t.trickId==='ore_shotgun'),JSON.stringify(s.tricks.map(t=>t.trickId)));
  }finally{s.close();}
});

test('T6 a duplicate settled tail cannot mint a second Ore Shotgun or a second paid incident',async()=>{
  const s=await podThrow({seed:4242});try{
    assert.equal(s.tricks.length,1);
    s.run(30);
    assert.equal(s.tricks.length,1);
    assert.equal(s.tricks.filter(t=>t.trickId==='ore_shotgun').length,1);
  }finally{s.close();}
});

test('T6 pure rules: constants, taxonomy row and cargo naming',()=>{
  assert.equal(ORE_SHOTGUN_CLOSING_FRACTION,0.25);
  assert.equal(TRICK_DEFINITIONS.ore_shotgun.family,'debris');
  assert.equal(TRICK_DEFINITIONS.ore_shotgun.baseScore,90);
  assert.equal(TRICK_DEFINITIONS.ore_shotgun.rarity,'uncommon');
  assert.equal(stuntCargoOf({sourceCargo:null}),null);
  assert.deepEqual(stuntCargoOf({sourceCargo:{commodityId:'cmdty_ore_iron',amount:3}}),{commodityId:'cmdty_ore_iron',amount:3,name:'Iron Ore'});
  assert.equal(stuntCargoOf({sourceCargo:{commodityId:'cmdty_unknown',amount:3}}).name,'cargo');
  assert.equal(stuntSpecificLine({trickId:'ore_shotgun',cargo:null}),'That was your cargo. The pod killed him.');
});
