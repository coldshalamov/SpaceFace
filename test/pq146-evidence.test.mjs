import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {journalFor,serializeStuntEvidence,restoreStuntEvidence,bodyLife} from '../src/combat/stuntEvidence.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
function body(id,type,x,z,vx=0,vz=0){const dynamic=type==='ship';return {id,type,alive:true,team:id===0?0:1,
  pos:{x,z},vel:{x:vx,z:vz},radius:dynamic?6:10,mass:dynamic?16:1000000,hull:100,hullMax:100,shield:0,armor:0,
  data:{defId:dynamic?'ship_kestrel':null,encounter:id===1?{id:'pq146'}:undefined},physicsBody:{schemaVersion:1,dynamic,radius:dynamic?6:10,mass:dynamic?16:1000000,inertiaY:48,ccd:true,revision:0}};}
async function run({shove=true,alreadyDoomed=false,submaterial=false}={}){
  // Velocities ride the restored fast ceilings: rock_discovery keys to closing >= 0.5 governed
  // cruise (0.5 x 210 = 105), so the corridor speeds below re-derive the pre-restore 80/100 tune
  // past the new gate while keeping the same miss/collide geometry.
  const player=body(0,'ship',-100,-100),victim=body(1,'ship',submaterial?-60:-100,alreadyDoomed||submaterial?0:30,submaterial?20:86),rock=body(2,'asteroid',0,0);
  const entities=[player,victim,rock],state={playerId:0,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
  const previousConsequences=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)};
  const kernel=createCombatKernel({state,bus,helpers});
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
  const tricks=[],contacts=[];bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('combat:collisionConsequence',c=>contacts.push(c));
  if(shove)owner.applyImpulse({entityId:1,impulse:{x:16*(submaterial?95:20),y:0,z:alreadyDoomed||submaterial?0:-16*30},tick:0,reason:'weapon_hit',provenance:{actorId:0,weaponId:'wpn_concussion_cannon_m'}});
  for(let tick=1;tick<=90;tick++){
    state.tick=tick;state.simTime=tick/60;owner.step(1/60);
    for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick:state.tick,consequenceKernelVersion:1});
    grammar.update(1/60,state);
  }
  return {state,owner,kernel,grammar,consequence,tricks,contacts,close(){grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=previousConsequences;}};
}
test('Rapier applied shove changes a miss into a lethal terrain contact and one Rock Discovery',async()=>{
  const h=await run();try{
    assert.ok(h.contacts.length>0,`actual Rapier contact required ${JSON.stringify(h.state.entityList.map(e=>({id:e.id,pos:e.pos,vel:e.vel})))}`);
    assert.equal(h.state.entities.get(1).alive,false,'real combat damage must kill');
    assert.equal(h.tricks.length,1,JSON.stringify(h.contacts));
    assert.equal(h.tricks[0].trickId,'rock_discovery');assert.equal(h.tricks[0].actorId,0);
    assert.ok(h.tricks[0].metrics.normalClosingSpeed>50);
  }finally{h.close();}
});
test('ordinary coasting and a tag on an already doomed corridor cannot create style',async()=>{
  for(const options of [{shove:false},{alreadyDoomed:true}]){const h=await run(options);try{assert.equal(h.tricks.length,0);}finally{h.close();}}
});
test('pending physical evidence round trips only onto matching bodies',async()=>{
  const h=await run();try{
    const saved=serializeStuntEvidence(h.state),before=bodyLife(h.state.entities.get(0),h.state).id;
    restoreStuntEvidence(h.state,structuredClone(saved));assert.equal(bodyLife(h.state.entities.get(0),h.state).id,before);
    h.state.entities.get(1).pos.x+=100;
    restoreStuntEvidence(h.state,structuredClone(saved));assert.equal(journalFor(h.state).roots.size,0);
  }finally{h.close();}
});
test('a sub-material straight contact can become material without mislabeling an already lethal tag',async()=>{
  const h=await run({submaterial:true});try{
    assert.equal(h.tricks.length,1);assert.equal(h.tricks[0].trickId,'rock_discovery');
    const proof=h.contacts.find(c=>c.stuntEvidence)?.stuntEvidence.path;
    assert.equal(proof.changedCorridor,false);assert.equal(proof.submaterialSource,true);assert.equal(h.state.entities.get(1).alive,false);
  }finally{h.close();}
});
