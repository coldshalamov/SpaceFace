import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createBracket, bracketEntitySpec } from '../src/systems/bracket.js';
import { BRACKET as C, BRACKET_AUDIO_RECIPES, freshBracketMemory, normalizeBracketMemory } from '../src/data/bracket.js';
import { goalCrossing, predictKeeperTarget, legalShot, keeperControl } from '../src/characters/bracketRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand, resolvePhysicsBodySpec, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { save } from '../src/save/saveSystem.js';

function fixture(memory) {
  const state = { simTime:0,tick:0,mode:'flight',timeScale:1,run:{kind:'adventure'},
    world:{currentSectorId:C.sectorId},entities:new Map(),entityList:[],player:{tether:{active:false}},bracket:memory };
  const bus=createBus(),events=[]; let id=0,seq=0;
  const helpers={spawnEntity(spec){const e=makeEntity({...spec,id:++id});state.entities.set(e.id,e);state.entityList.push(e);return e;},
    removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;state.entities.delete(id);const at=state.entityList.findIndex(e=>e.id===id);if(at>=0)state.entityList.splice(at,1);},
    voice:{say(p){events.push(['voice',p]);return true;}}};
  const player=helpers.spawnEntity({type:'ship',team:0,isPlayer:true,pos:{x:C.anchor.x,z:C.anchor.z+70},
    radius:4,mass:18,hull:100,hullMax:100,maxSpeed:250,physicsBody:{dynamic:true,shape:'ball',radius:4,mass:18,
      material:'ship',useMeasuredSkin:false,contact:{linearDamping:0,angularDamping:0}}});
  state.playerId=player.id;
  for(const name of ['bracket:voice','bracket:matchStarted','bracket:matchFinished','bracket:shotResolved','bracket:save','audio:cue'])bus.on(name,p=>events.push([name,p]));
  const system=createBracket();system.init({state,bus,helpers});
  const step=(dt=1/60)=>{state.simTime+=dt;state.tick++;system.update(dt,state);};
  const advance=(s)=>{for(let i=0;i<Math.ceil(s*60);i++)step();};
  const scan=(o={})=>bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,pos:{x:player.pos.x,z:player.pos.z},radius:300,...o});
  step();
  const start=()=>{scan();advance(C.serveSeconds+.05);assert.equal(system._phase,'play');return system._entity('ball');};
  return{state,bus,helpers,player,events,system,step,advance,scan,start};
}
function scriptedGoal(f,bank=false) {
 const b=f.system._entity('ball');assert.ok(b);
 f.bus.emit('tether:attached',{actorId:f.player.id,targetId:b.id});
 b.pos.set(C.anchor.x+39,0,C.anchor.z+C.goalZ-C.ballRadius+1);b.vel.set(0,0,-120);
 f.system._previousBall={x:39,z:C.goalZ-C.ballRadius+3};f.step();
 if(bank)f.bus.emit('collision',{aId:b.id,bId:f.system._ids['bumper-left']});
 b.pos.z-=2;f.step();assert.equal(f.system._phase,'result');
}

test('production browser and node factories are wired once before physics',async()=>{
 assert.equal(PRODUCTION_INIT_ORDER.filter(n=>n==='bracket').length,1);
 assert.equal(PRODUCTION_UPDATE_ORDER.filter(n=>n==='bracket').length,1);
 assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('bracket')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
 for(const file of ['src/core/registry.js','src/runtime/nodeSystemFactoryTable.js']){
  const s=await readFile(new URL('../'+file,import.meta.url),'utf8');assert.match(s,/\['bracket', bracket\]/);
 }
});
test('one keeper and four static court parts; real solid ball with authored mass',()=>{
 const f=fixture();f.advance(6);assert.equal(f.state.entityList.filter(e=>e.data?.bracketPart).length,5);
 const ball=f.start();const spec=resolvePhysicsBodySpec(ball);
 assert.equal(spec.mass,C.ballMass);assert.equal(spec.radius,C.ballRadius);assert.equal(spec.dynamic,true);assert.equal(spec.material,'debris');
 for(const part of ['post-left','post-right','bumper-left','bumper-right'])assert.equal(resolvePhysicsBodySpec(f.system._entity(part)).dynamic,false);
 assert.equal(f.system._entity('keeper').data.ai.passive,true);f.system.destroy();assert.equal(f.state.entityList.length,1);
});
test('no spawn in another sector, Crucible, or isolated scenarios',()=>{
 for(const [kind,sector]of[['swarm',C.sectorId],['survival',C.sectorId],['lab',C.sectorId],['adventure','elsewhere']]){
  const f=fixture();f.state.run.kind=kind;f.state.world.currentSectorId=sector;f.bus.emit('sector:enter',{});f.advance(3);
  assert.equal(f.state.entityList.filter(e=>e.data?.bracketPart).length,0);
 }
});
test('scanner provenance and duplicate sequence are checked, second genuine scan cancels',()=>{
 const f=fixture();f.scan();assert.equal(f.system._phase,'serve');f.scan({seq:1});assert.equal(f.system._phase,'serve');
 f.scan();assert.equal(f.system._phase,'idle');assert.equal(f.state.bracket.matches,0);
});
test('forged, distant, docked, paused, zero-radius and malformed scans do not start games',()=>{
 for(const bad of[{source:'fake'},{scannerId:99},{seq:NaN},{pos:{x:0,z:0}},{pos:{x:NaN,z:0}},{radius:0},{radius:NaN},{radius:1}]){
  const f=fixture();f.scan(bad);assert.equal(f.system._phase,'idle');
 }
 const f=fixture();f.player.flags.docked=true;f.scan();assert.equal(f.system._phase,'idle');f.player.flags.docked=false;
 f.state.timeScale=0;f.scan();assert.equal(f.system._phase,'idle');f.state.timeScale=1;
 f.player.pos.x+=1000;f.scan();assert.equal(f.system._phase,'idle');
});
test('swept whole-ball crossing scores; side entry, backwards crossing, teleport and pole overlap do not',()=>{
 const z=C.goalZ-C.ballRadius;
 assert.ok(goalCrossing({x:30,z:z+2},{x:30,z:z-2},C.ballRadius,1/60));
 for(const[a,b]of[[{x:30,z:z-2},{x:30,z:z+2}],[{x:49,z:z+2},{x:49,z:z-2}],
  [{x:0,z:z+100},{x:0,z:z-100}],[{x:0,z:z+1},{x:NaN,z:z-1}],
  [{x:0,z:z-2},{x:0,z:z-4}]])assert.equal(goalCrossing(a,b,C.ballRadius,1/60),null);
 assert.equal(goalCrossing({x:0,z:z+2},{x:0,z:z-2},C.ballRadius,0),null);
});
test('legal shots need recent physical player authorship and actual travel',()=>{
 assert.ok(legalShot(1,2,20,30));
 for(const v of[[-100,2,20,30],[3,2,20,30],[1,2,7,30],[1,2,20,1],[NaN,2,20,30]])assert.equal(legalShot(...v),false);
 const f=fixture(),b=f.start();b.vel.set(0,0,-120);b.pos.set(C.anchor.x+39,0,C.anchor.z+C.goalZ-C.ballRadius-1);
 f.system._previousBall={x:39,z:C.goalZ-C.ballRadius+1};f.step();assert.equal(f.system._score,0);
});
test('goal settles once and never writes credits, cargo or player physics',()=>{
 const f=fixture();f.state.player.credits=123;f.state.player.cargo={metal:7};f.start();scriptedGoal(f);f.advance(.5);
 assert.equal(f.system._score,1);assert.equal(f.events.filter(e=>e[0]==='bracket:shotResolved').length,1);
 assert.equal(f.state.player.credits,123);assert.deepEqual(f.state.player.cargo,{metal:7});
 const cmd=consumePhysicsCommand(f.player);assert.ok(!cmd || (!cmd.control && !cmd.impulses.length));
});
test('keeper reads trajectory at a bounded cadence and commits through tell and dash',()=>{
 const f=fixture(),b=f.start();f.system._launched=true;
 b.pos.set(C.anchor.x+20,0,C.anchor.z+20);b.vel.set(40,0,-90);f.step();
 assert.equal(f.system._keeperPhase,'tell');const target=f.system._targetX;
 b.vel.x=-80;f.advance(.3);assert.equal(f.system._targetX,target);
 f.advance(.31);assert.equal(f.system._keeperPhase,'dash');assert.equal(f.system._targetX,target);
 assert.equal(predictKeeperTarget({pos:{x:0,z:30},vel:{x:0,z:30}}),null);
 assert.equal(predictKeeperTarget({pos:{x:0,z:5000},vel:{x:100,z:-10}}),null);
});
test('station keeping crosses physics membrane without writing transforms',()=>{
 const f=fixture(),e=f.system._entity('keeper');e.pos.x+=50;const before=e.pos.clone();f.step();
 assert.deepEqual(e.pos,before);const c=consumePhysicsCommand(e);assert.equal(c.control.source,'bracket');
 assert.ok(Math.abs(c.control.force.x)<=C.keeperMass*72);assert.equal(c.impulses.length,0);
 assert.ok(Number.isFinite(keeperControl(e,0,0,2).torque.y));
});
test('five shots form a completed match, persist score, and raise difficulty only after wins',()=>{
 const f=fixture();f.start();
 for(let i=0;i<5;i++){scriptedGoal(f,i===0);f.advance(C.resultSeconds+.05);if(i<4)f.advance(C.serveSeconds+.05);}
 assert.equal(f.system._phase,'finished');assert.equal(f.state.bracket.matches,1);assert.equal(f.state.bracket.wins,1);
 assert.equal(f.state.bracket.best,5);assert.equal(f.state.bracket.bankGoals,1);assert.equal(f.state.bracket.perfect,true);
 assert.equal(f.system._gesture,'no-hands');assert.equal(f.events.filter(x=>x[0]==='bracket:matchFinished').length,1);
 f.scan();assert.equal(f.system._tier,1);
});
test('canceled match cannot carry bank credit into another match',()=>{
 const f=fixture();f.start();scriptedGoal(f,true);assert.equal(f.system._matchBanks,1);f.scan();f.scan();
 assert.equal(f.system._matchBanks,0);assert.equal(f.state.bracket.matches,0);assert.equal(f.state.bracket.bankGoals,0);
});
test('timeout serves a fresh object; old tether cannot claim the new ball',()=>{
 const f=fixture(),first=f.start();f.state.player.tether={active:true,targetId:first.id};f.advance(C.shotSeconds+.05);
 assert.equal(f.system._phase,'result');assert.equal(f.system._score,0);f.advance(C.resultSeconds+C.serveSeconds+.1);
 const next=f.system._entity('ball');assert.notEqual(next.id,first.id);assert.equal(f.system._touchAt,-100);
});
test('pause preserves the attempt and queues no force; docking, death or leaving cancel',()=>{
 const f=fixture();f.start();const keeper=f.system._entity('keeper');consumePhysicsCommand(keeper);
 f.state.timeScale=0;f.system.update(1/60);assert.equal(consumePhysicsCommand(keeper),null);assert.equal(f.system._phase,'play');
 f.state.timeScale=1;f.player.flags.docked=true;f.step();assert.equal(f.system._phase,'idle');
 f.player.flags.docked=false;f.start();f.player.pos.x+=500;f.step();assert.equal(f.system._phase,'idle');
});
test('zero damage ignored; real fire folds hands and enforces timeout',()=>{
 const f=fixture();f.start();const e=f.system._entity('keeper');f.bus.emit('combat:damage',{targetId:e.id,applied:0});assert.equal(f.system._phase,'play');
 f.bus.emit('combat:damage',{targetId:e.id,applied:10});assert.equal(f.system._phase,'closed');assert.equal(f.system._entity('ball'),null);
 f.scan();assert.equal(f.system._phase,'closed');f.advance(C.retreatSeconds+.1);f.scan();assert.equal(f.system._phase,'serve');
});
test('death persists through load; new game revives once, sector cleanup handles splicing lists',()=>{
 const f=fixture();const e=f.system._entity('keeper');e.hull=0;e.alive=false;f.bus.emit('entity:killed',{id:e.id});
 const saved=f.system.serialize();assert.equal(saved.destroyed,true);f.system.deserialize(saved);f.bus.emit('save:loaded',{});f.advance(3);
 assert.equal(f.system._entity('keeper'),null);f.bus.emit('game:newGame',{});f.step();assert.ok(f.system._entity('keeper'));
 f.state.world.currentSectorId='away';f.bus.emit('sector:exit',{});assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.bracketPart).length,0);
});
test('load cancels transient match, preserves memory and does not duplicate court',()=>{
 const f=fixture();f.start();f.system._entity('keeper').hull=612;const saved=f.system.serialize();
 f.bus.emit('save:restoring',{});f.system.deserialize(saved);f.bus.emit('save:loaded',{});f.step();
 assert.equal(f.system._phase,'idle');assert.equal(f.system._entity('keeper').hull,612);
 assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.bracketPart).length,5);
 assert.equal(f.system._entity('ball'),null);
});
test('quiet Easter eggs are one-time memory, not repeated ambient chatter',()=>{
 const f=fixture();f.scan();f.scan();f.advance(44);assert.ok(f.state.bracket.quiet);assert.ok(f.state.bracket.tiny);
 assert.equal(f.events.filter(e=>e[0]==='bracket:voice'&&e[1].key==='quiet').length,1);
 const saved=f.system.serialize();f.system.deserialize(saved);f.bus.emit('save:loaded',{});f.advance(44);
 assert.equal(f.events.filter(e=>e[0]==='bracket:voice'&&e[1].key==='tiny').length,1);
});
test('memory is finite, bounded, versioned and rejects runtime fields',()=>{
 assert.deepEqual(normalizeBracketMemory({version:12}),freshBracketMemory());
 const m=normalizeBracketMemory({version:1,matches:4,wins:99,best:Infinity,hull:-5,goals:NaN,bankGoals:1e99,armed:true});
 assert.equal(m.wins,4);assert.equal(m.hull,0);assert.equal(m.destroyed,true);assert.equal(m.best,0);assert.equal(m.bankGoals,1e6);assert.equal(m.armed,undefined);
});
test('bounded and direct save capture include BRACKET, restored before world hydration',async()=>{
 const ctx={_callSerialize:name=>name==='bracket'?{version:1,met:true}:null};
 const plan=save._saveCapturePlan.call(ctx);assert.deepEqual(plan.find(p=>p[0]==='bracket')[1](),{version:1,met:true});
 const s=await readFile(new URL('../src/save/saveSystem.js',import.meta.url),'utf8');
 assert.match(s,/data\.bracket = this\._callSerialize\('bracket'\)/);assert.match(s,/this\._callDeserialize\('bracket', data\.bracket\)/);
});
test('authored sounds are distinct, spatial and registered in live recipe bank',async()=>{
 assert.equal(new Set(BRACKET_AUDIO_RECIPES.map(r=>r.id)).size,4);
 const f=fixture();f.scan();const cue=f.events.find(e=>e[0]==='audio:cue')[1];assert.equal(cue.position.x,C.anchor.x);
 const s=await readFile(new URL('../src/data/audioRecipes.js',import.meta.url),'utf8');assert.match(s,/\.\.\.BRACKET_AUDIO_RECIPES/);
});
test('deterministic transcript repeats with ambient RNG forbidden',()=>{
 const old=Math.random;Math.random=()=>{throw Error('ambient RNG');};
 try{const run=()=>{const f=fixture();f.start();scriptedGoal(f);f.advance(7);return JSON.stringify({memory:f.system.serialize(),events:f.events,phase:f.system._phase});};assert.equal(run(),run());}finally{Math.random=old;}
});
test('real Rapier: player contact launches ball and produces authored-contact receipt',async()=>{
 const f=fixture(),b=f.start(),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try{
  f.player.pos.set(b.pos.x,0,b.pos.z+12);f.player.vel.set(0,0,-45);
  let touched=false,moved=false;
  for(let i=0;i<45;i++){f.step();owner.syncFromEntities(f.state.entityList);owner.step(1/60);
   for(const hit of owner.drainContactImpacts()){f.bus.emit('collision',hit);if((hit.aId===b.id&&hit.bId===f.player.id)||(hit.bId===b.id&&hit.aId===f.player.id))touched=true;}
   moved ||= b.vel.z < -10;
  }
  assert.ok(touched,'Rapier produced a player/ball contact');assert.ok(moved,'ball really accelerates');assert.ok(f.system._launched);
 }finally{owner.dispose();f.system.destroy();}
});
test('real Rapier: bumper rebounds ball, keeper moves by force, scene remains finite',async()=>{
 const f=fixture(),b=f.start(),keeper=f.system._entity('keeper'),owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try{
  b.pos.set(C.anchor.x+C.bumperX-25,0,C.anchor.z+C.bumperZ);b.vel.set(75,0,0);
  const x0=keeper.pos.x;let hit=false,rebounded=false;
  f.bus.emit('tether:attached',{actorId:f.player.id,targetId:b.id});
  for(let i=0;i<60;i++){
   f.system._keeperPhase='dash';f.system._keeperUntil=f.state.simTime+1;f.system._targetX=28;
   f.step();owner.syncFromEntities(f.state.entityList);owner.step(1/60);
   for(const p of owner.drainContactImpacts()){f.bus.emit('collision',p);if(p.aId===b.id||p.bId===b.id)hit=true;}
   rebounded ||= b.vel.x< -5; 
  }
  assert.ok(hit);assert.ok(rebounded);assert.ok(keeper.pos.x>x0+5);assert.ok(Number.isFinite(keeper.pos.z));
 }finally{owner.dispose();f.system.destroy();}
});
