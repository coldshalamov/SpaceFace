// PQ-146 save boundaries across a live physical episode. A Razor Bolas is released, the world is
// saved before the impact, restored onto identical bodies, and the impact then settles exactly
// once with the saved root identity; a second save after the first payoff still lets the
// wingman collision amend the same incident; a settled episode never pays again after reload.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {tumbleStates} from '../src/systems/tumbleStates.js';
import {journalFor} from '../src/combat/stuntEvidence.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';

function body(id,x,z,{mass=16,radius=8,hull=100,team=1,vx=0,vz=0,combatSpeed}={}){
  return {id,type:'ship',alive:true,team,name:`ship ${id}`,pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,radius,mass,hull,hullMax:hull,shield:0,armor:0,
    ...(combatSpeed!=null?{combatSpeed}:{}),
    data:{defId:'ship_kestrel',encounter:{id:'roundtrip'},ai:id?{huntPlayer:true}:{}},
    physicsBody:{schemaVersion:1,dynamic:true,radius,mass,inertiaY:48,ccd:true,revision:0}};
}
const cloneBody=e=>({...e,pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},data:structuredClone(e.data),physicsBody:{...e.physicsBody}});
async function world(entities,tick=0){
  const state={playerId:0,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick,simTime:tick/60,combat:{},factions:{},settings:{},player:{},run:null,
    story:{titles:{byId:{}},titlesSeen:[]},world:{currentSectorId:'roundtrip'},meta:{seed:1}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);if(tick===0)owner.step(1/60);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers}),registry={get:id=>id==='combat'?{kernel}:null};
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry});
  const tumble=Object.create(tumbleStates);tumble.init({state,bus,registry,helpers});
  const detected=[],amended=[],consequences=[];
  bus.on('stunt:trickDetected',t=>detected.push(t));bus.on('stunt:trickAmended',t=>amended.push(t));bus.on('combat:collisionConsequence',c=>consequences.push(c));
  return {state,bus,owner,grammar,detected,amended,consequences,
    rope(){owner.createAttachment({attachmentId:'rope',defId:'tether_standard',ownerId:0,targetId:1,sourceWorld:entities[0].pos,targetWorld:entities[1].pos,restLength:30,tick:state.tick});},
    run(until,each=null){while(state.tick<until){state.tick++;state.simTime=state.tick/60;each?.(state.tick);owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick:state.tick,consequenceKernelVersion:1});tumble.update(1/60,state);grammar.update(1/60,state);}},
    snapshot(){return {tick:state.tick,entities:entities.map(cloneBody),stunts:structuredClone(grammar.serialize())};},
    close(){tumble.destroy?.();grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}
async function restored(saved){
  const w=await world(saved.entities.map(cloneBody),saved.tick);
  w.bus.emit('save:restoring',{});w.grammar.deserialize(structuredClone(saved.stunts));w.bus.emit('save:loaded',{});
  return w;
}
// The payload, pursuer and wingman are slow hull classes (governed combat speed 95): receipt
// gates key to 0.5 x a struck hull's cruise, doubled by the ceiling restore, and this episode's
// strikes close at 105.8 (bolas) and 57.6 (wingman amendment) — over the 47.5 slow-class gate,
// under the 105 kestrel-pace one.
const scene=()=>[body(0,0,0,{team:0,mass:400}),body(1,35,0,{vz:110,mass:28,combatSpeed:95}),body(2,-90,33,{hull:60,mass:10,combatSpeed:95}),body(3,-135,51,{hull:3,mass:10,combatSpeed:95})];
const release=tick=>tick===31;

test('a save between release and impact restores the pending root; the impact settles once with the saved identity',async()=>{
  const live=await world(scene());live.rope();
  let saved;
  try{
    live.run(45,tick=>{if(release(tick)){live.owner.cutAttachment({attachmentId:'rope',reason:'tether_cut',tick});live.bus.emit('tether:releaseRated',{targetId:1,classification:'razor',tick});}});
    const journal=journalFor(live.state);
    assert.equal(journal.roots.size,1);assert.equal(live.detected.length,0,'nothing has landed yet');
    saved=live.snapshot();
    const rootId=[...journal.roots.keys()][0];
    assert.ok(saved.stunts.evidence.roots.some(([id])=>id===rootId),'the pending root is in the save');
    assert.ok(saved.stunts.evidence.constraints.some(([,c])=>c.release?.grade==='razor'),'the rated release travels with it');
    const after=await restored(saved);
    try{
      const j=journalFor(after.state);
      assert.equal(j.roots.size,1);assert.ok(j.roots.has(rootId));
      assert.equal(j.lives.get('number:1')?.id,saved.stunts.evidence.lives.find(([k])=>k==='number:1')[1].id,'the payload keeps its saved body life');
      after.run(200);
      assert.equal(after.detected.length,1,JSON.stringify(after.detected.map(t=>t.trickId)));
      assert.equal(after.detected[0].trickId,'bolas');assert.equal(after.detected[0].episodeId,rootId);
      assert.equal(after.detected[0].modifiers.razorRelease,'razor');
      assert.equal(after.amended.length,1,'the restored lineage still carries the wingman collision');
    }finally{after.close();}
  }finally{live.close();}
});
test('a moved body cannot inherit the pending root; the impact is then an unclaimed world collision',async()=>{
  const live=await world(scene());live.rope();
  try{
    live.run(45,tick=>{if(release(tick))live.owner.cutAttachment({attachmentId:'rope',reason:'tether_cut',tick});});
    const saved=live.snapshot();
    saved.entities[1].pos.z+=25;
    const after=await restored(saved);
    try{
      assert.equal(journalFor(after.state).roots.size,0,'a body that does not match its saved motion restores no provenance');
      after.run(200);
      assert.equal(after.detected.length,0);
    }finally{after.close();}
  }finally{live.close();}
});
test('a save after the first payoff keeps the amendment window: the wingman collision amends the saved incident and a replay pays nothing',async()=>{
  const live=await world(scene());live.rope();
  try{
    live.run(90,tick=>{if(release(tick)){live.owner.cutAttachment({attachmentId:'rope',reason:'tether_cut',tick});live.bus.emit('tether:releaseRated',{targetId:1,classification:'razor',tick});}});
    assert.equal(live.detected.length,1);assert.equal(live.amended.length,0);
    const saved=live.snapshot();
    assert.equal(saved.stunts.detector.incidents.length,1);
    assert.equal(saved.stunts.state.recentTricks.length,1);
    const after=await restored(saved);
    try{
      after.run(200);
      assert.equal(after.detected.length,0,'the settled first payoff is not re-detected after reload');
      assert.equal(after.amended.length,1);
      assert.equal(after.amended[0].episodeId,live.detected[0].episodeId);
      assert.equal(after.amended[0].modifiers.collateralCount,2);
      assert.equal(after.state.stunts.recentTricks.length,1,'the amendment replaces the incident row instead of adding one');
      assert.equal(after.state.stunts.totalTricksDetected,1);
      const settled=after.snapshot();
      const again=await restored(settled);
      try{
        again.bus.emit('combat:collisionConsequence',after.consequences.find(c=>c.targetId===3&&c.targetKilled));
        again.bus.emit('combat:collisionConsequence',live.consequences.find(c=>c.targetId===2&&c.otherId===1));
        assert.equal(again.detected.length+again.amended.length,0,'replayed settled receipts never pay after a reload');
      }finally{again.close();}
    }finally{after.close();}
  }finally{live.close();}
});
