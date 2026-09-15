// PQ-146 §6.2 Open Line Contracts. Completion is derived from the same causal receipts the trick
// detector emits — genuine Rapier physics, the production consequence owner and the registered
// grammar. The Wrong Side / Second-Hand positives reuse the dead-mass route with real geometry;
// Leave With It rides the real impulse-charge escape owner.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner,createSg02CombatPhysicsPort} from '../src/core/sg02DynamicBodyOwner.js';
import {createBus} from '../src/core/eventBus.js';
import {createCombatKernel} from '../src/combat/kernel.js';
import {stuntGrammar} from '../src/systems/stuntGrammar.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
import {createGameState} from '../src/core/gameState.js';
import {makeEntity} from '../src/core/entity.js';
import {hash32,mulberry32} from '../src/core/rng.js';
import {physics} from '../src/core/physics.js';
import {tumbleStates} from '../src/systems/tumbleStates.js';
import {impulseCharges} from '../src/systems/impulseCharges.js';
import {IMPULSE_CHARGES} from '../src/data/impulseCharges.js';
import {contractCompletionsFor,contractBook,contractLedgerRows,setActiveContract,isCivilianEntity,LINE_CONTRACT_IDS,awardContractCompletion} from '../src/combat/stuntContracts.js';

function body(id,type,x,z,{mass=16,radius=6,hull=100,team=1,vx=0,vz=0,collides=true}={}){
  const dynamic=type!=='asteroid';
  return {id,type,alive:true,team,collides,name:`${type} ${id}`,pos:{x,z},vel:{x:vx,z:vz},rot:0,angVel:0,radius,mass:dynamic?mass:1000000,hull,hullMax:hull,shield:0,armor:0,
    data:{defId:type==='ship'?'ship_kestrel':null,encounter:{id:'contracts'}},
    physicsBody:{schemaVersion:1,dynamic,radius,mass:dynamic?mass:1000000,inertiaY:48,ccd:true,revision:0}};
}
async function impactScene(entities){
  const state={playerId:0,entities:new Map(entities.map(e=>[e.id,e])),entityList:entities,mode:'flight',tick:0,simTime:0,combat:{},factions:{},settings:{},player:{}};
  const bus=createBus(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});owner.syncFromEntities(entities);owner.step(1/60);
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const helpers={combatPhysics:createSg02CombatPhysicsPort(owner)},kernel=createCombatKernel({state,bus,helpers});
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry:{get:id=>id==='combat'?{kernel}:null}});
  const tricks=[],cards=[];bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:lineContractCompleted',c=>cards.push(c));
  return {state,tricks,cards,
    shove(id,vx,vz){const e=state.entities.get(id);owner.applyImpulse({entityId:id,impulse:{x:e.mass*vx,y:0,z:e.mass*vz},tick:state.tick,reason:'weapon_hit',provenance:{actorId:0,weaponId:'wpn_concussion_cannon_m'}});},
    run(ticks){for(let i=0;i<ticks;i++){state.tick++;state.simTime=state.tick/60;owner.step(1/60);
      for(const p of owner.drainContactImpacts())bus.emit('physics:impact',{...p,tick:state.tick,consequenceKernelVersion:1});grammar.update(1/60,state);}},
    close(){grammar.destroy();consequence.destroy();kernel.dispose();owner.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}

// The dead-mass route: a wreck thrown through a live hostile. With `cover`, a static asteroid sits
// on the direct player→victim line while the wreck's corridor passes clear of it.
async function deadMass({cover=false}={}){
  const entities=[body(0,'ship',-200,-200,{team:0}),body(1,'wreck',-70,0,{mass:12,hull:1}),body(2,'ship',0,0,{hull:10})];
  if(cover)entities.push(body(3,'asteroid',-100,-100,{radius:15}));
  const s=await impactScene(entities);
  s.run(5);s.shove(1,70,0);s.run(120);return s;
}

test("Second-Hand Violence: a repositioned wreck defeating a live hostile pays the card without cover claims",async()=>{
  const s=await deadMass();try{
    assert.equal(s.state.entities.get(2).alive,false,'the wreck must physically destroy the target');
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.tricks[0].trickId,'dead_mans_mass');
    assert.equal(s.tricks[0].metrics.sourceDeadBeforeRoot,true);
    assert.equal(s.tricks[0].metrics.occludedAtRoot,false,'no occluder: the direct line was open');
    assert.deepEqual(s.cards.map(c=>c.contractId),['second_hand_violence']);
    const card=s.cards[0];
    assert.equal(card.trickId,'dead_mans_mass');assert.equal(card.episodeId,s.tricks[0].episodeId);
    assert.equal(contractBook(s.state).completed.length,1);
  }finally{s.close();}
});

test("Wrong Side of Cover: the same throw pays the cover card when the victim's direct line was occluded at the opening",async()=>{
  const s=await deadMass({cover:true});try{
    assert.equal(s.state.entities.get(2).alive,false);
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.tricks[0].trickId,'dead_mans_mass');
    assert.equal(s.tricks[0].metrics.occludedAtRoot,true,'the LOS measurement is stored on the causal receipt');
    // One physical episode proves both contracts it satisfies.
    assert.deepEqual(s.cards.map(c=>c.contractId).sort(),['second_hand_violence','wrong_side_of_cover']);
    assert.equal(contractBook(s.state).completed.length,2);
  }finally{s.close();}
});

// The escape scene: a live pursuer, a rear repulsion trap, the real charge owner. A provenance
// cargo lot is the "specific independently acquired pod"; a distant hauler is the civilian.
const DT=1/60;
async function escapeScene({cargoLot=null}={}){
  const state=createGameState(14646);state.mode='flight';state.tick=0;state.simTime=0;state.entities.clear();state.entityList.length=0;state.entityIndex=null;state.playerId=0;
  state.settings.gameplay.physicsBackend='rapier-dynamic';state.world.currentSectorId=null;
  if(cargoLot){state.player.cargo??={};state.player.cargo.richLots=[{lotId:cargoLot,commodityId:'cmdty_ore',qty:2}];}
  const bus=createBus();let nextId=0;
  const spawn=spec=>{const e=makeEntity({id:nextId++,data:{},...spec});state.entities.set(e.id,e);state.entityList.push(e);bus.emit('entity:spawned',{id:e.id,entity:e});return e;};
  const ship=(team,pos,vel,extra={})=>spawn({type:'ship',team,pos,vel,radius:6,mass:16,hull:100,hullMax:100,physicsBody:{schemaVersion:1,dynamic:true,radius:6,mass:16,inertiaY:48,ccd:true},data:{encounter:{id:'escape'},...extra}});
  const player=ship(0,{x:0,z:0},{x:100,z:0});
  ship(1,{x:-50,z:0},{x:150,z:0},{ai:{huntPlayer:true,activity:{targetId:0}}});
  const civilian=ship(1,{x:600,z:600},{x:0,z:0},{role:'hauler'});
  const helpers={hash32,mulberry32,getEntity:id=>state.entities.get(id),spawnEntity:spawn};
  const flag=COMBAT_FLAGS.weaponImpulseConsequences;COMBAT_FLAGS.weaponImpulseConsequences=true;
  const kernel=createCombatKernel({state,bus,helpers}),registry={get:id=>id==='combat'?{kernel}:null};
  const grammar=Object.create(stuntGrammar);grammar.init({state,bus});
  const consequence=Object.create(collisionConsequences);consequence.init({state,bus,registry});
  const tumble=Object.create(tumbleStates);tumble.init({state,bus,registry,helpers});
  const sim=Object.create(physics);sim.init({state,bus,helpers});sim._sg02=await createSg02DynamicBodyOwner({mode:'rapier-dynamic',fixedDt:DT});
  helpers.combatPhysics=createSg02CombatPhysicsPort(sim._sg02);
  const charges=Object.create(impulseCharges);charges.init({state,bus,helpers,registry});
  const tricks=[],cards=[];
  bus.on('stunt:trickDetected',t=>tricks.push(t));bus.on('stunt:lineContractCompleted',c=>cards.push(c));
  return {state,bus,player,civilian,tricks,cards,
    trap(behind){const def=IMPULSE_CHARGES.charge_repulsion_trap;
      charges._blastVictims(state,{pos:{x:player.pos.x-behind,z:player.pos.z},ownerId:0,radius:def.radius,impulse:def.impulse,damage:0,chargeId:'charge_repulsion_trap',excludeId:null,originId:'trap',sourceId:null,aftDrop:false,trigger:'proximity',link:1});},
    step(n,each=null){for(let i=0;i<n;i++){state.tick++;state.simTime=state.tick/60;for(const e of state.entityList)e.prevPos.copy(e.pos);each?.(state.tick);sim.update(DT,state);tumble.update(DT,state);grammar.update(DT,state);}},
    close(){charges.destroy?.();tumble.destroy?.();grammar.destroy();consequence.destroy();kernel.dispose();sim._sg02.dispose();COMBAT_FLAGS.weaponImpulseConsequences=flag;}};
}
async function kickstartRun({cargoLot='pod:lot-1',harmTick=null}={}){
  const s=await escapeScene({cargoLot});
  s.step(240,tick=>{
    if(tick===20)s.trap(20);
    if(tick===harmTick)s.bus.emit('combat:damage',{targetId:s.civilian.id,attackerId:0,tick});
  });
  return s;
}

test("Leave With It: the trap-launched escape pays the card while a specific pod is held",async()=>{
  const s=await kickstartRun();try{
    assert.equal(s.tricks.length,1,JSON.stringify(s.tricks.map(t=>t.trickId)));
    assert.equal(s.tricks[0].trickId,'kickstart');assert.equal(s.tricks[0].pureEscape,true);
    assert.deepEqual(s.cards.map(c=>c.contractId),['leave_with_it']);
    const card=s.cards[0];assert.equal(card.trickName,'Kickstart');assert.equal(contractBook(s.state).completed.length,1);
    const rows=contractLedgerRows(s.state);
    assert.equal(rows.find(r=>r.id==='leave_with_it').status,'completed');
    assert.equal(rows.find(r=>r.id==='leave_with_it').completion.trickName,'Kickstart');
    assert.equal(rows.find(r=>r.id==='wrong_side_of_cover').status,'open');
  }finally{s.close();}
});

test("Leave With It negatives: no held pod, or civilian harm inside the escape window, leaves the contract open",async()=>{
  const noPod=await kickstartRun({cargoLot:null});try{
    assert.equal(noPod.tricks.length,1);assert.equal(noPod.tricks[0].trickId,'kickstart');
    assert.equal(noPod.cards.length,0,'the escape happened but the contract needs the pod');
  }finally{noPod.close();}
  // Civilian hurt at tick 45 — inside the episode window (the blast opens the chain at ~tick 20
  // and the escape cannot settle before tick 80).
  const harmed=await kickstartRun({harmTick:45});try{
    assert.equal(harmed.tricks.length,1);assert.equal(harmed.tricks[0].trickId,'kickstart');
    assert.ok(harmed.state.stunts.contracts.harm.length>0,'the civilian harm is on the record');
    assert.equal(harmed.cards.length,0,'new civilian harm in the escape episode voids the contract');
  }finally{harmed.close();}
  // The same harm before the chain opens is outside the episode window.
  const early=await kickstartRun({harmTick:5});try{
    assert.equal(early.tricks.length,1);assert.equal(early.tricks[0].trickId,'kickstart');
    assert.deepEqual(early.cards.map(c=>c.contractId),['leave_with_it'],'harm before the episode does not taint it');
  }finally{early.close();}
});

test('the contract evaluator reads only causal receipts: intrinsic and negative forms',()=>{
  const trick=(over={})=>({role:'primary',trickId:'rock_discovery',pureEscape:false,rootTick:10,tick:100,
    consequence:{killed:true},metrics:{},...over});
  // Bank Job carries the occluded direct line by definition.
  assert.deepEqual(contractCompletionsFor(trick({trickId:'bank_job'})),['wrong_side_of_cover']);
  // Any killed route with measured root occlusion; null occlusion (impelled victim) is unknown.
  assert.deepEqual(contractCompletionsFor(trick({trickId:'well_golf',metrics:{occludedAtRoot:true}})),['wrong_side_of_cover']);
  assert.deepEqual(contractCompletionsFor(trick({trickId:'well_golf',metrics:{occludedAtRoot:null}})),[]);
  // Second-Hand: dead mass is intrinsic; Wrecking Ball needs the measured pre-dead substantial hull.
  assert.deepEqual(contractCompletionsFor(trick({trickId:'dead_mans_mass'})),['second_hand_violence']);
  assert.deepEqual(contractCompletionsFor(trick({trickId:'wrecking_ball',
    metrics:{sourceDeadBeforeRoot:true,payloadMass:20,sceneReferenceMass:16}})),['second_hand_violence']);
  assert.deepEqual(contractCompletionsFor(trick({trickId:'wrecking_ball',
    metrics:{sourceDeadBeforeRoot:false,payloadMass:20,sceneReferenceMass:16}})),[]);
  assert.deepEqual(contractCompletionsFor(trick({trickId:'wrecking_ball',
    metrics:{sourceDeadBeforeRoot:true,payloadMass:2,sceneReferenceMass:16}})),[],'a light hull is not substantial');
  // Escapes need the pod and a clean civilian record inside the episode window.
  const escape={trickId:'needle_thread',pureEscape:true};
  assert.deepEqual(contractCompletionsFor(trick(escape),{cargoPodHeld:true}),['leave_with_it']);
  assert.deepEqual(contractCompletionsFor(trick(escape),{cargoPodHeld:false}),[]);
  assert.deepEqual(contractCompletionsFor(trick(escape),{cargoPodHeld:true,civilianHarm:[{tick:50}]}),[]);
  assert.deepEqual(contractCompletionsFor(trick(escape),{cargoPodHeld:true,civilianHarm:[{tick:5}]}),['leave_with_it']);
  // A non-material or non-primary receipt proves nothing.
  assert.deepEqual(contractCompletionsFor(trick({consequence:{killed:false}}),{cargoPodHeld:true}),[]);
  assert.deepEqual(contractCompletionsFor(trick({trickId:'bank_job',role:'bridge'})),[]);
});

test('contract book persistence: one card per contract, repeat proves nothing extra, active focus clears on completion',()=>{
  const state={story:{}};
  const trick={role:'primary',trickId:'bank_job',name:'Bank Job',episodeId:'root:9',tick:42,consequence:{killed:true},metrics:{}};
  const book=contractBook(state);
  assert.equal(setActiveContract(state,'wrong_side_of_cover'),'wrong_side_of_cover');
  assert.ok(awardContractCompletion(state,'wrong_side_of_cover',trick,42));
  assert.equal(awardContractCompletion(state,'wrong_side_of_cover',trick,42),null,'no second card for a repeat');
  assert.equal(book.active,null,'completion clears the focus');
  assert.equal(setActiveContract(state,'wrong_side_of_cover'),null,'a completed contract cannot be focused again');
  assert.equal(setActiveContract(state,'bogus'),null);
  assert.equal(setActiveContract(state,'leave_with_it'),'leave_with_it');
  const rows=contractLedgerRows(state);
  assert.equal(rows.length,3);
  assert.deepEqual(rows.map(r=>r.id),LINE_CONTRACT_IDS);
  assert.equal(rows.find(r=>r.id==='wrong_side_of_cover').status,'completed');
  assert.equal(rows.find(r=>r.id==='leave_with_it').status,'active');
});

test('civilian identity matches the law-layer reading',()=>{
  assert.equal(isCivilianEntity({type:'ship',team:2,data:{}}),true);
  assert.equal(isCivilianEntity({type:'ship',team:1,data:{role:'hauler'}}),true);
  assert.equal(isCivilianEntity({type:'ship',team:1,data:{ai:{spawnContext:'convoy_civilian'}}}),true);
  assert.equal(isCivilianEntity({type:'ship',team:1,data:{role:'pirate'}}),false);
  assert.equal(isCivilianEntity({type:'asteroid',team:2,data:{}}),false);
});
