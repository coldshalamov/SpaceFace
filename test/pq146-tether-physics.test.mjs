import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {createTitlesSystem} from '../src/systems/titles.js';
import {barkDirector} from '../src/systems/barkDirector.js';
import {voiceArbiter} from '../src/ui/voiceArbiter.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
function body(id,x,z,vx=0,vz=0){return {id,name:`Pilot ${id}`,type:'ship',team:id===0?0:1,alive:true,collides:true,
 pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,mass:16,radius:6,hull:100,hullMax:100,shield:0,armor:0,
 data:{defId:'ship_kestrel',encounterId:'tether-proof',ai:id===0?{}:{huntPlayer:true}},
 physicsBody:{schemaVersion:1,dynamic:true,mass:16,radius:6,inertiaY:48,ccd:true}};}
async function bolas({slack=false,armedWitness=true,attached=false,tow=false}={}){
 const player=body(0,0,0),payload=body(1,35,0,0,110),target=body(2,-35,86),witness=body(3,-10,30);
 // A wounded opponent is a legitimate terminal. This fixture leaves production collision damage unchanged.
 target.hull=10;
 if(attached||tow){target.pos={x:10,z:49};}
 if(tow){target.type='asteroid';target.mass=1000000;target.physicsBody.dynamic=false;target.physicsBody.mass=1000000;}
 witness.team=2;witness.data.ai={passive:true};witness.factionId='faction_free';witness.data.sensorsEnabled=armedWitness;
 const entities=[player,payload,target,witness],state={playerId:0,tick:0,simTime:0,mode:'flight',entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,
 combat:{},settings:{audio:{master:1},accessibility:{captions:true}},player:{},factions:{},meta:{seed:146},world:{currentSectorId:'test-arena'},story:{titles:{byId:{}},titlesSeen:[]}};
 const bus=createBus(),events=[];for(const name of ['stunt:trickDetected','combat:collisionConsequence','voice:surface','barkDirector:stuntRecognition'])bus.on(name,p=>events.push({name,p}));
 const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
 const owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
 const savedFlag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
 const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers}),consequences=Object.create(collisionConsequences);
 consequences.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
 const titles=createTitlesSystem();titles.init({state,bus});const arbiter=Object.create(voiceArbiter);arbiter.init({state,bus,helpers});const barks=Object.create(barkDirector);barks.init({state,bus,helpers});
 try{
  owner.createAttachment({attachmentId:'rope',defId:'tether_standard',ownerId:0,targetId:1,sourceWorld:player.pos,targetWorld:payload.pos,restLength:slack?1000:30,tick:0});
  for(let tick=1;tick<=210;tick++){
   state.tick=tick;state.simTime=tick/60;
   if(tick===31&&!attached&&!tow)owner.cutAttachment({attachmentId:'rope',reason:'tether_cut',tick});
   owner.step(1/60);
   for(const impact of owner.drainContactImpacts())bus.emit('physics:impact',{...impact,tick,consequenceKernelVersion:1});
   grammar.update(1/60,state);titles.update(1/60,state);barks.update(1/60,state);arbiter.update(1/60,state);bus.flush();
  }
  return {state,events};
 }finally{barks.destroy();titles.destroy();grammar.destroy();consequences.destroy();kernel.dispose();owner.dispose();bus.clear();COMBAT_FLAGS.weaponImpulseConsequences=savedFlag;}
}
test('physical Bolas kill produces one Adventure incident, local Knotmaker and delivered same-session bark',async()=>{
 const {state,events}=await bolas();const tricks=events.filter(e=>e.name==='stunt:trickDetected').map(e=>e.p);
 assert.equal(tricks.length,1,JSON.stringify(tricks));assert.equal(tricks[0].trickId,'bolas');
 assert.equal(state.story.titles.stuntIncidents.length,1);assert.equal(state.story.titles.byId.title_bolas?.title,'Knotmaker');
 assert.equal(events.filter(e=>e.name==='barkDirector:stuntRecognition').length,1,JSON.stringify(state.barkDirector.stuntRecognition));
 assert.ok(events.some(e=>e.name==='voice:surface'&&e.p.kind==='stuntRecognition'));
 assert.equal(state.stunts.combo.banked,0);assert.equal(state.stunts.combo.activePoints,0);
});
test('slack rope has no act; a sensor-disabled bystander cannot witness the real Bolas',async()=>{
 const slack=await bolas({slack:true});assert.equal(slack.events.filter(e=>e.name==='stunt:trickDetected').length,0);
 const blind=await bolas({armedWitness:false});assert.equal(blind.events.filter(e=>e.name==='stunt:trickDetected').length,1);
 assert.equal(blind.state.story.titles.byId.title_bolas,undefined);
});
test('attached flail and fatal tow select their own primary from the actual contact',async()=>{
 for(const [options,id] of [[{attached:true},'wrecking_ball'],[{tow:true},'tow_kill']]){
  const {events}=await bolas(options),tricks=events.filter(e=>e.name==='stunt:trickDetected').map(e=>e.p);
  assert.equal(tricks[0]?.trickId,id,JSON.stringify(tricks));assert.equal(tricks.length,1);
 }
});
