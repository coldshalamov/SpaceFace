// Predicate/settlement tests drive declared observations, not a native journey.
// The separate native case below drives actual ship hulls through player inputs and Rapier.
import test from 'node:test';
import assert from 'node:assert/strict';
import encounter, { runtime, spec } from '../src/data/encounters/913-scene-pilgrim-lamp-walk.js';
import { createSimulation } from '../src/core/sim.js';
import { encounterDirector } from '../src/systems/encounterDirector.js';
import { save } from '../src/save/saveSystem.js';
import { pickLivedVignette } from '../src/systems/livedWorldDirector.js';
import { economy } from '../src/systems/economy.js';
import { ENEMY_TYPES } from '../src/data/enemies.js';

function boot() {
  const sim = createSimulation({ seed:913, systems:[economy,encounterDirector] });
  const {state,bus}=sim;
  state.mode='flight';state.world.currentSectorId='sector_phoebe_echo';
  const player=sim.spawn({type:'ship',team:0,pos:{x:-290,z:0},vel:{x:0,z:0},rot:0,
    radius:14,mass:16,hull:150,hullMax:150,data:{}});
  state.playerId=player.id;
  const live={id:'pilgrim-test',shapeId:encounter.id,shape:encounter,script:encounter.script,
    tier:encounter.tier,deck:encounter.deck,sectorId:state.world.currentSectorId,
    anchor:{x:0,z:0},zoneRadius:400,ids:[],roles:{},vars:{},data:{sceneAxis:{ux:1,uz:0}},plan:{},phase:'telegraph'};
  state.encounterDirector.live[live.id]=live;
  const director=sim.registry.get('encounterDirector');
  const grants=[], reps=[];
  bus.on('economy:grantCredits',p=>grants.push(p));
  bus.on('faction:adjustRep',p=>reps.push(p));
  runtime.fire(director,live,state);
  const last=()=>state.entities.get(live.ids.find(id=>live.roles[id]==='ship_2'));
  const tick=(at)=>{state.simTime=at;runtime.tick(director,live,state,at);};
  return {sim,state,bus,player,live,director,grants,reps,last,tick};
}
function accept(h) {
  runtime.choose(h.director,h.live,h.state,'a');
  h.tick(h.state.simTime+1);
  assert.equal(h.live.phase,'escort_last_lamp');
}
function observe(h,at,{progress=120,range=110,relative=0,behind=true}={}) {
  const e=h.last(),start=h.live.vars.vAwait.entityStarts[e.id];
  e.pos={x:start.x+progress,z:start.z};e.vel={x:20,z:0};e.rot=0;
  h.player.pos={x:e.pos.x+(behind? -range:range),z:e.pos.z};
  h.player.vel={x:20+relative,z:0};h.tick(at);
}

test('existing cast/rewards and ambient sector eligibility are preserved',()=>{
  assert.deepEqual(spec.cast.map(x=>x.archetype),['choir_zealot','choir_zealot','choir_zealot']);
  assert.deepEqual(spec.cast.map(x=>[x.dx,x.dz]),[[0,0],[-90,0],[-180,0]]);
  assert.equal(encounter.livedRotation,true);
  assert.equal(spec.phases.find(x=>x.id==='grant_a').amount,30);
  assert.equal(spec.phases.find(x=>x.id==='rep_a').delta,2);
  for(const sectorId of encounter.sectorIds){
    assert.ok(Array.from({length:100},(_,seed)=>pickLivedVignette({candidates:[encounter],seed,
      sectorId,zoneKey:'fixture',day:0,now:600})).includes(encounter));
  }
  assert.equal(pickLivedVignette({candidates:[encounter],seed:913,sectorId:'sector_helios_prime',zoneKey:'fixture',day:0,now:600}),null);
});
test('acceptance is not success; late acceptance starts the existing finite column',()=>{
  const h=boot();h.tick(20);assert.equal(h.live.phase,'offer');
  assert.equal(h.last().data.ai?.allowPassiveManeuver,undefined);
  accept(h);assert.equal(h.grants.length,0);
  assert.equal(h.live.vars.motion,'column');
  h.tick(22);assert.match(h.last().data.ai.activity.reason,/vignette_motion:column/);
  assert.equal(h.grants.length,0);
});
test('one observed advancing matched trail earns exactly one original settlement',()=>{
  const h=boot();accept(h);observe(h,2);observe(h,9);assert.equal(h.grants.length,0);
  observe(h,10);assert.equal(h.grants.length,1);assert.equal(h.grants[0].amount,30);
  assert.equal(h.live.outcome,'a');
  runtime.choose(h.director,h.live,h.state,'a');h.tick(20);assert.equal(h.grants.length,1);
  assert.match(h.state.encounterDirector.receipts.at(-1).text,/last pilgrim/);
});
for(const [label,change] of [['no advance',{progress:0}],['out of range',{range:250}],
 ['too fast',{relative:20}],['ahead',{behind:false}]]){
 test(label+' cannot buy a courtesy',()=>{const h=boot();accept(h);observe(h,2,change);observe(h,20,change);assert.equal(h.grants.length,0);});
}
test('breaking the observed hold resets it, not pauses it',()=>{
 const h=boot();accept(h);observe(h,2);observe(h,7);observe(h,8,{range:250});observe(h,9);observe(h,16);
 assert.equal(h.grants.length,0);observe(h,17);assert.equal(h.grants.length,1);
});
test('other choices are explicitly dialogue refusals, never physical success or free rewards',()=>{
 for(const choice of ['b','c']){const h=boot();runtime.choose(h.director,h.live,h.state,choice);
  assert.equal(h.grants.length,0);assert.equal(h.live.outcome,choice);
  assert.match(h.state.encounterDirector.receipts.at(-1).text,choice==='b'?/dismissal/:/declined/);
  assert.doesNotMatch(h.state.encounterDirector.receipts.at(-1).text,/crossed|waited|escort completed/);
 }
});
for(const missing of [false,true])test((missing?'missing':'dead')+' last pilgrim aborts unpaid',()=>{
 const h=boot();accept(h);const e=h.last();if(missing)h.state.entities.delete(e.id);else e.alive=false;
 h.tick(2);assert.equal(h.grants.length,0);assert.equal(h.live.outcome,'aborted:physical_subject_gone');
});
test('timeout and hard sector departure cannot settle an unfinished escort',()=>{
 for(const exit of [false,true]){const h=boot();accept(h);observe(h,2);
  if(exit)h.director._onSectorExit({sectorId:h.state.world.currentSectorId});else h.tick(122);
  assert.equal(h.grants.length,0);assert.equal(Object.keys(h.state.encounterDirector.live).length,0);
 }
});
test('actual save projection discards unfinished work and retains completed receipts',()=>{
 for(const complete of [false,true]){
  const h=boot();accept(h);observe(h,2);if(complete)observe(h,10);
  const projected=save._serializeEncounterDirector.call({state:h.state});
  const playerRecord=save._serializePlayer.call({state:h.state});
  assert.equal(playerRecord.credits,complete?30:0);
  assert.equal(Object.hasOwn(projected,'live'),false);assert.equal(JSON.stringify(projected).includes('vAwait'),false);
  const restored=boot();restored.state.encounterDirector=JSON.parse(JSON.stringify(projected));
  restored.director._onSaveLoaded();
  assert.equal(Object.keys(restored.state.encounterDirector.live).length,0);
  assert.equal(restored.grants.length,0);
  assert.deepEqual(restored.state.encounterDirector.receipts,projected.receipts);
  assert.equal(projected.receipts.filter(x=>x.shape===encounter.id&&x.outcome==='a').length,complete?1:0);
 }
});

test('native Wasp procession and input-only follower earn the sampled escort, including late acceptance', {timeout:120000}, async()=>{
 const {bootRealPath,writeRealPathInput}=await import('../scripts/lib/bench/realPath.mjs');
 const hullId=ENEMY_TYPES.find(x=>x.id==='choir_zealot').shipId;
 assert.equal(hullId,'ship_wasp');
 const evidence=[];
 for(const [acceptAt,ux,uz] of [[0,1,0],[20,1,0],[20,-1,0],[20,0,1],[20,0,-1]]){
  const h=await bootRealPath({seed:913,systems:['tacticalAI','flightV3','aiPorts','physics'],
   hulls:[{hullId,isPlayer:true,rot:Math.atan2(uz,ux),pos:{x:-290*ux,z:-290*uz}}]});
  try{
   const l={id:'native-pilgrim',vars:{},data:{sceneAxis:{ux,uz}},anchor:{x:0,z:0}};
   const grants=[],reps=[];let contacts=0,firstHold=null,acceptedAt=null,lastStart=null;
   h.bus.on('physics:impact',()=>contacts++);
   const d={now:()=>h.state.simTime,player:()=>h.player,
    entsOf:()=>l.ids.map(id=>h.state.entities.get(id)).filter(Boolean),
    spawnShips(live,rows){const ids=rows.map(row=>{
     const e=h.spawnShip({hullId,pos:row.pos,team:2,factionId:row.factionId});
     e.data.ai={passive:true,roe:'hold_fire',squadId:live.id};live.roles[e.id]=row.role;return e.id;
    });live.ids.push(...ids);return ids;},say(){},offerChoices(){},
    grant(amount){grants.push(amount);},rep(faction,delta){reps.push({faction,delta});},
    resolve(live,outcome){live.phase='done';live.outcome=outcome;},
    abort(live,reason){live.phase='done';live.outcome='aborted:'+reason;}};
   runtime.fire(d,l,h.state);const original=[...l.ids];
   for(let n=0;n<3600&&l.phase!=='done';n++){
    if(l.phase==='offer'&&h.state.simTime>=acceptAt){
     assert.equal(grants.length,0);acceptedAt=h.state.simTime;
     assert.ok(Math.hypot(d.entsOf()[2].pos.x+180*ux,d.entsOf()[2].pos.z+180*uz)<.01,'waiting is not a completed trip');
     runtime.choose(d,l,h.state,'a');assert.equal(grants.length,0);
    }
    const last=d.entsOf()[2],p=h.player;
    // Test pilot flies the actual scene bearing using the same input packet as controls.
    // Positions, velocities, native bodies and NPC intent are never written by this pilot.
    const vx=last.vel.x+(last.pos.x-110*ux-p.pos.x)*.5;
    const vz=last.vel.z+(last.pos.z-110*uz-p.pos.z)*.5;
    const ax=(vx-p.vel.x)*.12,az=(vz-p.vel.z)*.12;
    const cx=Math.cos(p.rot),sz=Math.sin(p.rot);
    writeRealPathInput(h.state,{moveZ:ax*cx+az*sz,moveX:-ax*sz+az*cx,turnIntent:0});
    // Production encounterDirector samples scripts once per accumulated second.
    if(n%60===0){runtime.tick(d,l,h.state,h.state.simTime);
     if(l.vars.vAwait?.holdSince!=null)firstHold=l.vars.vAwait.holdSince;
     if(l.vars.vAwait?.entityStarts[last.id])lastStart={...l.vars.vAwait.entityStarts[last.id]};
    }
    h.step(1);
   }
   assert.deepEqual(l.ids,original);assert.equal(l.outcome,'a');
   assert.deepEqual(grants,[30]);assert.deepEqual(reps,[{faction:'faction_choir',delta:2}]);
   assert.ok(h.state.simTime-firstHold>=8);assert.ok(h.state.simTime-acceptedAt>=9);
   const last=d.entsOf()[2],start=lastStart;assert.ok(start);
   assert.ok(Math.hypot(last.pos.x-start.x,last.pos.z-start.z)>=100);
   assert.ok(h.player.pos.x*ux+h.player.pos.z*uz>-190,'player actually follows by native input');
   h.assertBodies(d.entsOf());assert.equal(h.proof().backend,'rapier-dynamic');
   assert.equal(h.proof().sg02Ready,true);assert.equal(h.proof().contactCaptureEnabled,true);assert.equal(contacts,0);
   evidence.push({acceptAt,axis:[ux,uz],completedAt:h.state.simTime,holdFrom:firstHold,contacts,
    lastProgress:Math.hypot(last.pos.x-start.x,last.pos.z-start.z),playerX:h.player.pos.x});
  }finally{h.dispose();}
 }
 console.log('PILGRIM_NATIVE '+JSON.stringify(evidence));
});
