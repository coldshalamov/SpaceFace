// PQ-146 genuine routes for the impact and debris families: One-Two and Dead Man's Mass.
// Real Rapier bodies, real applied impulses, the production collision consequence owner and the
// registered grammar. No trick receipt is injected; every award below comes from physics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';

function body(id,type,x,z,{mass=16,radius=6,hull=100,team=1,vx=0,vz=0}={}){
  const dynamic=type!=='asteroid';
  return {id,type,alive:true,team,name:`${type} ${id}`,pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,radius,mass:dynamic?mass:1000000,hull,hullMax:hull,shield:0,armor:0,
    data:{defId:type==='ship'?'ship_kestrel':null,encounter:{id:'impact-routes'}},
    physicsBody:{schemaVersion:1,dynamic,radius,mass:dynamic?mass:1000000,inertiaY:48,ccd:true,revision:0}};
}
async function scene(entities){
  const state={playerId:0,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers});
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
  const tricks=[],amended=[],contacts=[];bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:trickAmended',t=>amended.push(t));bus.on('combat:collisionConsequence',c=>contacts.push(c));
  return {state,owner,tricks,amended,contacts,
    shove(id,vx,vz){const e=state.entities.get(id);owner.applyImpulse({entityId:id,impulse:{x:e.mass*vx,y:0,z:e.mass*vz},tick:state.tick,reason:'weapon_hit',provenance:{actorId:0,weaponId:'wpn_concussion_cannon_m'}});},
    run(ticks){for(let i=0;i<ticks;i++){state.tick++;state.simTime=state.tick/60;owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick:state.tick,consequenceKernelVersion:1});grammar.update(1/60,state);}},
    close(){grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}

// Two separated player impulses: the first puts the pirate on a free path that misses the rock,
// the second turns it 80 degrees into the rock. Rock Discovery is the explanatory subtag.
async function oneTwo({gapTicks=30,collinear=false}={}){
  const s=await scene([body(0,'ship',-200,-200,{team:0}),body(1,'ship',-100,30),body(2,'asteroid',0,0,{radius:10})]);
  const aim=(speed)=>{const v=s.state.entities.get(1),dx=-v.pos.x,dz=-v.pos.z,len=Math.hypot(dx,dz);s.shove(1,speed*dx/len-v.vel.x,speed*dz/len-v.vel.z);};
  s.run(2);
  if(collinear)aim(30);else s.shove(1,0,-30);
  s.run(gapTicks);aim(90);
  s.run(150);return s;
}
test('One-Two: a mid-flight second impulse that changes the corridor names the deeper trick over Rock Discovery',async()=>{
  const s=await oneTwo();try{
    assert.ok(s.contacts.some(c=>c.targetId===1),`terrain contact required ${JSON.stringify(s.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel})))}`);
    assert.equal(s.state.entities.get(1).alive,false,'lethal terrain contact');
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    const trick=s.tricks[0];
    assert.equal(trick.trickId,'one_two');assert.equal(trick.family,'impact');assert.ok(trick.factualTags.includes('rock_discovery'));
    assert.equal(trick.actorId,0);assert.equal(trick.consequence.killed,true);
    assert.ok(trick.rootTick<trick.causeChain[0].tick||trick.rootTick<=2,'episode is rooted at the first intervention');
    assert.equal(s.amended.length,0);
  }finally{s.close();}
});
test('One-Two negatives: a too-early second tap, or a collinear boost of the same shove, is only Rock Discovery',async()=>{
  for(const options of [{gapTicks:6},{collinear:true,gapTicks:30}]){
    const s=await oneTwo(options);try{
      assert.equal(s.state.entities.get(1).alive,false,JSON.stringify(options));
      assert.equal(s.tricks.length,1,JSON.stringify({options,ids:s.tricks.map(t=>t.trickId)}));
      assert.equal(s.tricks[0].trickId,'rock_discovery',JSON.stringify(options));
      assert.ok(!s.tricks[0].factualTags.includes('one_two'),JSON.stringify(options));
    }finally{s.close();}
  }
});

// A substantial wreck that already died is given a second job: a fresh player impulse after
// its death sends it through a live hostile. Cosmetic fragments and coasting debris never pay.
async function deadMansMass({fresh=true,light=false,coast=false}={}){
  const wreck=body(1,'wreck',-70,0,{mass:light?2:12,hull:1});const victim=body(2,'ship',0,0,{hull:10});
  if(coast){wreck.vel.x=70;}
  const s=await scene([body(0,'ship',-200,-200,{team:0}),wreck,victim]);
  s.run(5);
  if(fresh)s.shove(1,70,0);
  s.run(120);return s;
}
test("Dead Man's Mass: a repositioned wreck destroying a live hostile is the debris-family primary",async()=>{
  const s=await deadMansMass();try{
    assert.ok(s.contacts.some(c=>c.targetId===2),`wreck must physically strike the hostile ${JSON.stringify(s.contacts.map(c=>[c.targetId,c.otherId]))}`);
    assert.equal(s.state.entities.get(2).alive,false);
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.tricks[0].trickId,'dead_mans_mass');assert.equal(s.tricks[0].family,'debris');
    assert.equal(s.tricks[0].secondaryIds[0],1);assert.equal(s.tricks[0].targetId,2);
  }finally{s.close();}
});
test("Dead Man's Mass negatives: coasting debris, and a fragment under the mass floor, cannot pay",async()=>{
  const coast=await deadMansMass({fresh:false,coast:true});try{assert.equal(coast.tricks.length,0,JSON.stringify(coast.tricks.map(t=>t.trickId)));}finally{coast.close();}
  const light=await deadMansMass({light:true});try{
    assert.ok(light.contacts.some(c=>c.targetId===2),'the fragment still physically strikes');
    assert.ok(!light.tricks.some(t=>t.trickId==='dead_mans_mass'),JSON.stringify(light.tricks.map(t=>t.trickId)));
  }finally{light.close();}
});
