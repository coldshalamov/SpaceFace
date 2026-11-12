import test from 'node:test';
import assert from 'node:assert/strict';
import { BELLHOP } from '../src/data/bellhop.js';
import { PHOEBE_CHIME_POST as POST, phoebePracticeDirection, phoebePracticeRecognition, livePhoebeTuner } from '../src/data/phoebePracticeConnection.js';
import { createBellhop, bellhopSpec, bellhopCrystalSpec } from '../src/systems/bellhop.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';

function fixture(outcome='a') {
 const bus=createBus(), popups=[], grants=[];
 bus.on('comms:popup',p=>popups.push(p));bus.on('economy:grantCredits',p=>grants.push(p));
 const player={id:1,occupantGeneration:1,alive:true,pos:{x:POST.x+100,z:POST.z},vel:{x:0,z:0}};
 const state={mode:'flight',ui:{},run:{kind:'adventure'},world:{currentSectorId:BELLHOP.sectorId},story:{flags:{}},encounterDirector:{stats:{livedSeen:{scene_struck_bell:outcome}}},simTime:0,tick:1,playerId:1,entityList:[player],entities:new Map([[1,player]])};
 let id=10;
 const helpers={spawnEntity(spec){const e={...spec,id:id++,occupantGeneration:id+100,alive:true};state.entityList.push(e);state.entities.set(e.id,e);return e;},removeEntity(id){state.entities.get(id).alive=false;},sectorCookProviders:[]};
 const system=createBellhop();system.init({state,bus,helpers});
 return {state,bus,popups,grants,system,player,robot:state.entityList.find(e=>e.data?.bellhop)};
}

test('one canonical translation places all six bodies and home force at Phoebe',()=>{
 assert.deepEqual(bellhopSpec().pos,POST);
 for(let i=0;i<5;i++){const p=bellhopCrystalSpec(i,false).pos;assert.ok(Math.abs(Math.hypot(p.x-POST.x,p.z-POST.z)-230)<1e-8);}
 const {system,robot}=fixture();system.update(1/60);const command=consumePhysicsCommand(robot);assert.ok(!command || !command.impulse || Math.hypot(command.impulse.x,command.impulse.z)<1e-8,'stationary post is not pulled toward galactic origin');
});

test('earned throw and observer bearing receive different optional next-task directions',()=>{
 for(const outcome of ['a','b']){const f=fixture(outcome),before=JSON.stringify(f.state.story);const text=phoebePracticeDirection(f.state);assert.match(text,/BELLHOP \/ CB-9/);assert.match(text,/west of Echo Shrine/);assert.match(text,/not the Shard Sphere/);assert.match(text,outcome==='a'?/striking lesson is on record/:/did not tune a crystal/);assert.equal(JSON.stringify(f.state.story),before);assert.equal(f.grants.length,0);}
 for(const outcome of [undefined,'c','aborted'])assert.equal(phoebePracticeDirection(fixture(outcome===undefined?'':outcome).state),null);
});

test('nearby recognition is outcome and progress aware, once per state per visit, with no payout',()=>{
 const f=fixture();f.system.update(1/60);f.system.update(1/60);
 assert.equal(f.popups.filter(p=>p.id.startsWith('bellhop_practice_')).length,1);
 const initial=f.popups.length;
 f.state.story.flags.bellhop_progress=2;f.system.update(1/60);assert.equal(f.popups.length,initial,'do not cover the native note calls');
 f.bus.emit('save:loaded');f.system.update(1/60);assert.match(f.popups.at(-1).text,/2 of five/);
 f.state.story.flags.bellhop_sung=true;f.state.story.flags.bellhop_paid=true;const count=f.popups.length;f.system.update(1/60);assert.equal(f.popups.length,count);
 f.bus.emit('sector:enter',{sectorId:BELLHOP.sectorId});f.system.update(1/60);assert.match(f.popups.at(-1).text,/still holds/);assert.match(f.popups.at(-1).text,/not paid again/);assert.equal(f.grants.length,0);
});

test('nearby voice never credits the throw to the observer branch',()=>{
 const f=fixture('b');assert.match(phoebePracticeRecognition(f.state,f.robot).text,/A BEARING IS NOT A NOTE/);assert.doesNotMatch(phoebePracticeRecognition(f.state,f.robot).text,/I HEARD IT/);
});

test('dead, reused, missing, out-of-frame and out-of-range tuners cannot invite or speak',()=>{
 for(const mutate of [f=>{f.robot.alive=false;},f=>{f.state.entities.set(f.robot.id,{...f.robot});},f=>{f.robot.pos={x:80,z:-760};},f=>{f.robot.data.authoredCharacter='other';},f=>{f.state.world.currentSectorId='sector_helios_prime';}]){
  const f=fixture();mutate(f);assert.equal(livePhoebeTuner(f.state,f.robot),null);assert.equal(phoebePracticeRecognition(f.state,f.robot),null);
 }
 for(const mutate of [f=>{f.player.pos.x+=1000;},f=>{f.player.alive=false;},f=>{f.state.mode='paused';},f=>{f.state.ui.docked=true;}]){const f=fixture();mutate(f);assert.equal(phoebePracticeRecognition(f.state,f.robot),null);}
 const f=fixture();f.state.story.flags.bellhop_gone=true;assert.match(phoebePracticeDirection(f.state),/CB-9 is gone/);assert.equal(phoebePracticeRecognition(f.state,f.robot),null);assert.equal(f.grants.length,0);
});

test('exceptional retained old-frame bodies keep custody and identities without duplicate bodies or payout',()=>{
 const f=fixture();const owned=f.state.entityList.filter(e=>e.data?.bellhop||e.data?.bellhopCrystal);
 for(const e of owned){e.pos.x-=8192;e.pos.z-=73728;e.flags={persistent:true};e.data.gyreLaunched=true;}
 const before=owned.map(e=>({id:e.id,pos:{...e.pos}}));
 f.state.story.flags.bellhop_progress=2;f.state.story.flags.bellhop_paid=true;
 f.bus.emit('save:loaded');f.system.update(1/60);
 assert.deepEqual(owned.map(e=>({id:e.id,pos:{...e.pos}})),before);
 assert.equal(f.state.entityList.filter(e=>e.alive&&(e.data?.bellhop||e.data?.bellhopCrystal)).length,6);
 assert.equal(consumePhysicsCommand(f.robot),null);assert.equal(f.state.story.flags.bellhop_progress,2);assert.equal(f.state.story.flags.bellhop_paid,true);assert.equal(f.grants.length,0);
 assert.equal(phoebePracticeRecognition(f.state,f.robot),null);assert.match(phoebePracticeDirection(f.state),/not available/);
});

test('stale, foreign-backend, missing-generation and recycled-id impacts cannot advance the chime phrase',()=>{
 for(const patch of [{tick:0},{tick:2},{backend:'legacy'},{aGeneration:null},{bGeneration:999}]){
  const f=fixture(),c=f.state.entityList.find(e=>e.data?.bellhopCrystalIndex===2);
  const event={aId:1,bId:c.id,tick:1,backend:'rapier-dynamic',aGeneration:1,bGeneration:c.occupantGeneration,impulse:100,...patch};f.bus.emit('physics:impact',event);
  assert.equal(f.state.story.flags.bellhop_progress,undefined);assert.equal(f.grants.length,0);
 }
 const f=fixture(),c=f.state.entityList.find(e=>e.data?.bellhopCrystalIndex===2);
 const event={aId:1,bId:c.id,tick:1,backend:'rapier-dynamic',aGeneration:1,bGeneration:c.occupantGeneration,impulse:100};
 f.state.entities.set(c.id,{...c,occupantGeneration:999});f.bus.emit('physics:impact',event);assert.equal(f.state.story.flags.bellhop_progress,undefined);
});

test('unavailable tuner or mixed retained old-frame crystal set neither invites nor judges',()=>{
 for(const mutate of [f=>{f.robot.pos={x:80,z:-760};},f=>{f.state.entities.delete(f.robot.id);},f=>{f.state.story.flags.bellhop_gone=true;},f=>{f.state.entityList.find(e=>e.data?.bellhopCrystalIndex===2).pos={x:0,z:0};}]){
  const f=fixture();mutate(f);const c=f.state.entityList.find(e=>e.data?.bellhopCrystalIndex===2);
  assert.equal(phoebePracticeRecognition(f.state,f.robot),null);
  f.bus.emit('physics:impact',{aId:1,bId:c.id,tick:1,backend:'rapier-dynamic',aGeneration:1,bGeneration:c.occupantGeneration,impulse:100});
  assert.equal(f.state.story.flags.bellhop_progress,undefined);assert.equal(f.grants.length,0);
 }
});


test('legacy a records a lesson outcome without inventing a witnessed physical throw',()=>{
 const f=fixture('a');const text=phoebePracticeDirection(f.state)+' '+phoebePracticeRecognition(f.state,f.robot).text;
 assert.match(text,/ON RECORD/);assert.doesNotMatch(text,/I HEARD IT|real released strike|verified throw|witnessed/i);assert.equal(f.grants.length,0);
});
