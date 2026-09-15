// PQ-146 genuine field routes: Well Golf and Slingshot Golf through the production fields
// system (queued field impulses through the physics authority into Rapier), the physics owner,
// the collision consequence owner and the registered grammar.
//
// The standard Well is a pile-maker for light hulls (its velocity term converges a ship to
// 45 WU/s and sinks it), so a thrown ship never exits it; the Repulsor ring is the field that
// bends and releases a hull, and the detector is field-kind agnostic. Both facts are asserted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hash32,mulberry32 } from '../src/core/rng.js';
import { makeEntity } from '../src/core/entity.js';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { stuntGrammar } from '../src/systems/stuntGrammar.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { fields } from '../src/systems/fields.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { journalFor } from '../src/combat/stuntEvidence.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
const DT=1/60;
async function scene({player}){
  const state=createGameState(14646);state.mode='flight';state.tick=0;state.simTime=0;state.entities.clear();state.entityList.length=0;state.entityIndex=null;state.playerId=0;
  state.settings.gameplay.physicsBackend='rapier-dynamic';state.world.currentSectorId=null;
  const bus=createBus();let nextId=0;
  const spawn=spec=>{const e=makeEntity({id:nextId++,data:{},...spec});state.entities.set(e.id,e);state.entityList.push(e);bus.emit('entity:spawned',{id:e.id,entity:e});return e;};
  const pilot=spawn({type:'ship',team:0,hull:100,hullMax:100,data:{encounter:{id:'field-routes'}},...player,
    physicsBody:{schemaVersion:1,dynamic:true,radius:player.radius,mass:player.mass,inertiaY:48,ccd:true}});
  const helpers={hash32,mulberry32,getEntity:id=>state.entities.get(id),spawnEntity:spawn,
    queryRadius:(c,r,out)=>{out.length=0;for(const e of state.entityList)if(e.alive!==false&&Math.hypot(e.pos.x-c.x,e.pos.z-c.z)<=r+(e.radius||0))out.push(e);}};
  const flags=[COMBAT_FLAGS.weaponImpulseConsequences,FIELD_FLAGS.enabled];COMBAT_FLAGS.weaponImpulseConsequences=true;FIELD_FLAGS.enabled=true;
  const kernel=createCombatKernel({state,bus,helpers}),registry={get:id=>id==='combat'?{kernel}:null};
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry});
  const tumble=Object.create(tumbleStates);tumble.init({state,bus,registry,helpers});
  const rig=Object.create(fields);rig.init({state,bus,helpers,registry});
  const sim=Object.create(physics);sim.init({state,bus,helpers});sim._sg02=await createSg02DynamicBodyOwner({mode:'rapier-dynamic',fixedDt:DT});
  const tricks=[],contacts=[];bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:trickAmended',t=>tricks.push(t));bus.on('combat:collisionConsequence',c=>contacts.push(c));
  return {state,bus,spawn,pilot,sim,rig,tricks,contacts,
    hostile(pos,vel,{mass=16,radius=6,hull=100}={}){return spawn({type:'ship',team:1,pos,vel,radius,mass,hull,hullMax:hull,
      physicsBody:{schemaVersion:1,dynamic:true,radius,mass,inertiaY:48,ccd:true},data:{encounter:{id:'field-routes'},ai:{huntPlayer:true}}});},
    rock(pos){return spawn({type:'asteroid',pos,radius:14,mass:1e6,data:{}});},
    field(kind,center){return rig.plantField(state,{kind,center,emitter:false,tag:'npc',id:`arena_${kind}`});},
    shoveTo(body,aim,speed){const dx=aim.x-body.pos.x,dz=aim.z-body.pos.z,len=Math.hypot(dx,dz),vx=speed*dx/len,vz=speed*dz/len;
      sim._sg02.applyImpulse({entityId:body.id,impulse:{x:body.mass*(vx-body.vel.x),z:body.mass*(vz-body.vel.z)},provenance:{actorId:0,weaponId:'wpn_concussion_cannon_m'},tick:state.tick,reason:'weapon_hit'});},
    step(n=1,each=null){for(let i=0;i<n;i++){state.tick++;state.simTime=state.tick/60;for(const e of state.entityList)e.prevPos.copy(e.pos);each?.(state.tick);rig.update(DT,state);sim.update(DT,state);tumble.update(DT,state);grammar.update(DT,state);}},
    fieldExit(){for(const r of journalFor(state).roots.values()){const n=r.nodes.find(n=>n.kind==='field_exit');if(n)return n;}return null;},
    close(){tumble.destroy?.();grammar.destroy();consequence.destroy();rig.destroy?.();kernel.dispose();sim._sg02.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flags[0];FIELD_FLAGS.enabled=flags[1];}};
}
// A shove that would miss the Repulsor by more than a quarter of the combined radius is turned
// into the ring; the ring bends the hull 55 degrees and releases it into a rock.
async function wellGolf({kind='repulsor',start={x:-300,z:0},aim={x:0,z:170},shove=true,rock={x:200,z:80}}={}){
  const s=await scene({player:{pos:{x:-400,z:-200},radius:6,mass:16}});
  const a=s.hostile(start,{x:110,z:0});s.rock(rock);s.field(kind,{x:0,z:250});
  s.step(5);if(shove)s.shoveTo(a,aim,110);s.step(400);
  return {...s,a};
}
test('Well Golf: a shove injects the hull into a field it would have missed; the bend releases it onto terrain',async()=>{
  const s=await wellGolf();try{
    const exit=s.fieldExit();
    assert.ok(exit?.entryCausal===true&&exit.bend>=35&&exit.deltaV>=0.2*105,`field exit witness ${JSON.stringify(exit)}`);
    assert.equal(s.a.alive,false,'the released hull dies on the rock');
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.tricks[0].trickId,'well_golf');assert.equal(s.tricks[0].family,'field');
    assert.ok(!s.tricks[0].factualTags.includes('rock_discovery'),'a terminal four seconds after the shove is outside the three-second Rock Discovery window');
  }finally{s.close();}
});
test('Well Golf negatives: an untouched pass through the field, or a path that already entered it, earns nothing even with a terrain kill',async()=>{
  const drift=await wellGolf({start:{x:-300,z:170},aim:{x:0,z:175},shove:false,rock:{x:175,z:-35}});
  try{assert.equal(drift.a.alive,false,'the field still flings the untouched hull into the rock');assert.equal(drift.tricks.length,0);assert.equal(drift.fieldExit(),null);}finally{drift.close();}
  const already=await wellGolf({start:{x:-300,z:150},aim:{x:0,z:175},rock:{x:175,z:-35}});
  try{assert.equal(already.a.alive,false);assert.equal(already.tricks.length,0,JSON.stringify(already.tricks.map(t=>t.trickId)));assert.equal(already.fieldExit(),null,'no causal entry, no field edge');}finally{already.close();}
});
test('the standard Well captures a thrown light hull instead of releasing it: no exit, no Well Golf',async()=>{
  const s=await wellGolf({kind:'well',aim:{x:0,z:200},rock:{x:900,z:900}});try{
    assert.ok(Math.hypot(s.a.pos.x,s.a.pos.z-250)<30,`the hull sinks to the well centre ${JSON.stringify(s.a.pos)}`);
    assert.equal(s.fieldExit(),null);assert.equal(s.tricks.length,0);
  }finally{s.close();}
});
// A loaded 100-degree swing releases the pirate along a corridor that its unloaded path never
// shared; the ring bends it 44 degrees and the curved exit ends on terrain within two seconds.
async function slingshot({slack=false,field={x:-250,z:93},rock={x:-390,z:-110}}={}){
  const s=await scene({player:{pos:{x:0,z:0},radius:8,mass:400}});
  const a=s.hostile({x:35,z:0},{x:0,z:110},{mass:28,radius:8});s.rock(rock);s.field('repulsor',field);
  s.step(1);
  s.sim._sg02.createAttachment({attachmentId:'rope',defId:'tether_standard',ownerId:0,targetId:a.id,sourceWorld:s.pilot.pos,targetWorld:a.pos,restLength:slack?1000:30,tick:s.state.tick});
  s.step(420,tick=>{if(tick===31){s.sim._sg02.cutAttachment({attachmentId:'rope',reason:'tether_cut',tick});s.bus.emit('tether:releaseRated',{targetId:a.id,classification:'razor',tick});}});
  return {...s,a};
}
test('Slingshot Golf: swing, release, causal field entry, curved exit and terminal collision inside eight seconds',async()=>{
  const s=await slingshot();try{
    const exit=s.fieldExit();
    assert.ok(exit?.entryCausal===true&&exit.bend>=35&&exit.entryTick-31<=120,`entry within two seconds of release ${JSON.stringify(exit)}`);
    assert.equal(s.a.alive,false);
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    const trick=s.tricks[0];
    assert.equal(trick.trickId,'slingshot_golf');assert.equal(trick.rarity,'legendary');assert.equal(trick.baseScore,200);
    assert.ok(trick.factualTags.includes('well_golf'),'the field leg stays a factual tag, never a second act');
    assert.equal(trick.modifiers.razorRelease,null,'a razor grade four seconds before the payoff is not consequence-linked');
    assert.ok(trick.tick-trick.rootTick<=480);
  }finally{s.close();}
});
test('Slingshot Golf negative: a slack tag followed by the field flinging the pirate into a rock is an unclaimed world kill',async()=>{
  const s=await slingshot({slack:true,field:{x:35,z:300},rock:{x:35,z:900}});try{
    assert.ok(Math.hypot(s.a.pos.x-35,s.a.pos.z-300)>170,'the field acted on the pirate and let it go');
    assert.equal(s.tricks.length,0,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(journalFor(s.state).roots.size,0,'a slack rope creates no player root');
  }finally{s.close();}
});
