import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createVesper, vesperEntitySpec, vesperSteering } from '../src/systems/vesper.js';
import { VESPER as C, freshVesperMemory, normalizeVesperMemory, VESPER_AUDIO_RECIPES } from '../src/data/vesper.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand, resolvePhysicsBodySpec, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { isAttachable } from '../src/systems/tetherGameplay.js';
import { save } from '../src/save/saveSystem.js';
function fixture(memory) {
 const bus=createBus(),events=[],state={simTime:0,tick:0,mode:'flight',timeScale:1,run:{kind:'adventure'},
  world:{currentSectorId:C.sectorId},entities:new Map(),entityList:[],player:{tether:{active:false}},vesper:memory};
 let id=0;const helpers={spawnEntity(spec){const e=makeEntity({...spec,id:++id});state.entities.set(e.id,e);state.entityList.push(e);return e;},
  removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;},voice:{say(p){events.push(['voice',p]);return true;}}};
 const player=helpers.spawnEntity({type:'ship',team:0,pos:{x:C.anchor.x+90,z:C.anchor.z},vel:{x:0,z:0},isPlayer:true,
  radius:4,mass:12,hull:100,hullMax:100,physicsBody:{shape:'ball',dynamic:true,radius:4,mass:12,useMeasuredSkin:false,material:'ship',contact:{linearDamping:0}}});
 state.playerId=player.id;for(const type of ['vesper:note','vesper:voice','vesper:met','vesper:performance','vesper:phraseProgress','audio:cue','comms:log','toast'])bus.on(type,p=>events.push([type,p]));
 const system=createVesper();system.init({state,bus,helpers});
 const step=(dt=1/60)=>{state.simTime+=dt;state.tick++;system.update(dt,state);};step();let seq=0;
 const scan=(extra={})=>bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,pos:{x:player.pos.x,z:player.pos.z},radius:250,...extra});
 const bell=i=>system._get(system._bellIds[i]),hub=()=>system._get(system._hubId);
 const wait=(seconds)=>{for(let n=0;n<Math.ceil(seconds*60);n++)step();};
 const pluck=(i,speed=20,travel=10)=>{const b=bell(i);bus.emit('tether:latched',{targetId:b.id});b.pos.x+=travel;b.vel.x=speed;
  bus.emit('tether:released',{targetId:b.id});};
 const phrase=()=>{pluck(0);wait(1.5);pluck(2);wait(1.5);pluck(1);};
 return {bus,state,helpers,player,system,events,step,scan,bell,hub,wait,pluck,phrase};
}
function impulse(e){const c=consumePhysicsCommand(e);return (c?.impulses||[]).reduce((v,p)=>({x:v.x+p.x,z:v.z+p.z}),{x:0,z:0});}
const alive=f=>f.state.entityList.filter(e=>e.alive&&e.data?.vesper);
test('all production tables include Vesper once and simulation precedes physics',async()=>{
 for(const order of [PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER])assert.equal(order.filter(x=>x==='vesper').length,1);
 assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('vesper')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
 for(const file of ['../src/core/registry.js','../src/runtime/nodeSystemFactoryTable.js']){
  const s=await readFile(new URL(file,import.meta.url),'utf8');assert.match(s,/\['vesper', vesper\]/);
 }
});
test('exactly four neutral, passive, Massline-legal physical bodies; no POI duplicate',async()=>{
 const f=fixture();f.wait(4);assert.equal(alive(f).length,4);
 for(const e of alive(f)){assert.equal(isHostileToPlayer(e,0,f.state),false);assert.equal(e.data.ai.passive,true);
  assert.equal(isAttachable(e,f.player.id,f.state),true);const spec=resolvePhysicsBodySpec(e);
  assert.equal(spec.mass,e.data.vesperBell<0?C.mass:C.bellMass);assert.equal(spec.dynamic,true);}
 const sectors=await readFile(new URL('../src/data/sectors.js',import.meta.url),'utf8');
 assert.match(sectors,/poi_vesper_rehearsal[\s\S]{0,200}runtimeOwner: 'vesper'/);
 assert.throws(()=>vesperEntitySpec(undefined,3),RangeError);
});
test('survival, lab, other sectors never spawn; mode/sector changes clear without event',()=>{
 for(const [kind,sector] of [['survival',C.sectorId],['lab',C.sectorId],['adventure','other']]){
  const f=fixture();f.state.run.kind=kind;f.state.world.currentSectorId=sector;f.step();assert.equal(alive(f).length,0);}
});
test('authenticated nearby scan wakes once; duplicate and foreign pulses cannot',()=>{
 for(const extra of [{source:'other'},{scannerId:999},{seq:NaN},{seq:-1},{pos:{x:0,z:0}},{radius:NaN},{radius:1}]){
  const f=fixture();f.scan(extra);assert.equal(f.state.vesper.met,false);}
 const f=fixture();f.player.flags.docked=true;f.scan();assert.equal(f.state.vesper.met,false);
 f.player.flags.docked=false;f.state.timeScale=0;f.scan();assert.equal(f.state.vesper.met,false);
 f.state.timeScale=1;f.scan();f.scan({seq:1});assert.equal(f.state.vesper.met,true);
 assert.equal(f.events.filter(x=>x[0]==='vesper:met').length,1);
});
test('demonstration is the proper phrase and never counts as a performance or unison',()=>{
 const f=fixture();f.scan();f.wait(3);
 assert.deepEqual(f.events.filter(x=>x[0]==='vesper:note').map(x=>x[1].index),C.phrase);
 assert.equal(f.state.vesper.performances,0);assert.equal(f.state.vesper.unisonHeard,false);
});
test('a real pull-and-release phrase earns a reply and scan toggles optional follow',()=>{
 const f=fixture();f.scan();f.phrase();assert.equal(f.state.vesper.performances,1);
 assert.ok(f.events.some(x=>x[0]==='vesper:performance'&&x[1].kind==='phrase'));
 f.step();assert.equal(f.hub().data.vesperPose.phase,'bloom');f.scan();assert.equal(f.system._following,true);
 f.scan();assert.equal(f.system._following,false);
});
test('stationary releases, tiny travel, unlatched and stale releases cannot earn notes',()=>{
 for(const [speed,travel] of [[0,10],[20,0],[8,6]]){const f=fixture();f.scan();f.pluck(0,speed,travel);assert.equal(f.system._progress,0);}
 const f=fixture();f.scan();f.bus.emit('tether:released',{targetId:f.bell(0).id});assert.equal(f.system._progress,0);
 f.bus.emit('tether:latched',{targetId:f.bell(0).id});f.bus.emit('tether:released',{targetId:999});assert.equal(f.system._progress,0);
 f.bus.emit('tether:broken',{});assert.equal(f.system._held,null);
});
test('cut plus released is consumed once, note cooldown prevents chatter',()=>{
 const f=fixture();f.scan();const b=f.bell(0);f.bus.emit('tether:latched',{targetId:b.id});b.pos.x+=10;b.vel.x=20;
 f.bus.emit('tether:cut',{targetId:b.id});f.bus.emit('tether:released',{targetId:b.id});f.pluck(0);
 assert.equal(f.events.filter(x=>x[0]==='vesper:note').length,1);assert.equal(f.system._progress,1);
});
test('physical contacts ring, but unowned/environmental impacts do not advance the phrase',()=>{
 const f=fixture();f.scan();f.bus.emit('physics:impact',{aId:f.bell(0).id,bId:777,impulse:300,preSolveClosingSpeed:20});
 assert.equal(f.system._progress,0);assert.equal(f.events.filter(x=>x[0]==='vesper:note').length,1);
 f.wait(.6);f.bus.emit('physics:impact',{aId:f.bell(0).id,bId:f.player.id,impulse:300,preSolveClosingSpeed:20});assert.equal(f.system._progress,1);
 f.bus.emit('physics:impact',{aId:f.bell(2).id,bId:f.player.id,impulse:NaN});assert.equal(f.system._progress,1);
});
test('steering is bounded, zero near rest, never mutates poses or player momentum',()=>{
 assert.equal(vesperSteering({x:NaN,z:0},{x:0,z:0},{x:0,z:0}),null);
 const a=vesperSteering({x:10000,z:10000},{x:0,z:0},{x:0,z:0});assert.ok(Math.hypot(a.x,a.z)<=C.returnAcceleration+1e-12);
 const f=fixture(),b=f.bell(0);b.pos.x+=100;const before=b.pos.clone(),vel=b.vel.clone();f.step();
 assert.deepEqual(b.pos,before);assert.deepEqual(b.vel,vel);const force=impulse(b);assert.ok(Math.hypot(force.x,force.z)<=C.bellMass*C.returnAcceleration/60+1e-12);
 assert.deepEqual(impulse(f.player),{x:0,z:0});assert.deepEqual(impulse(f.hub()),{x:0,z:0});
});
test('held bells and ballistic releases receive no magnetic correction; return is not teleport',()=>{
 const f=fixture();const b=f.bell(0);impulse(b);f.bus.emit('tether:latched',{targetId:b.id});b.pos.x+=40;f.wait(1);
 assert.deepEqual(impulse(b),{x:0,z:0});b.vel.x=20;f.bus.emit('tether:released',{targetId:b.id});f.wait(C.ballisticSeconds-.1);
 assert.deepEqual(impulse(b),{x:0,z:0});const x=b.pos.x;f.wait(.2);assert.ok(impulse(b).x<0);assert.equal(b.pos.x,x);
});
test('phrase timeout, pause and sector change discard transient interaction',()=>{
 const f=fixture();f.scan();f.pluck(0);f.wait(C.phraseGap+.1);assert.equal(f.system._progress,0);
 f.pluck(0);f.state.timeScale=0;impulse(f.bell(0));f.system.update(1/60);assert.deepEqual(impulse(f.bell(0)),{x:0,z:0});
 f.state.timeScale=1;f.bus.emit('sector:enter',{});assert.equal(f.system._progress,0);assert.equal(alive(f).length,4);
});
test('damage makes it withdraw without retaliation, force takeover or immortal bodies',()=>{
 const f=fixture();f.scan();f.bus.emit('combat:damage',{targetId:f.hub().id,applied:0});assert.equal(f.state.vesper.mutedUntil,0);
 f.hub().hull-=10;f.bus.emit('combat:damage',{targetId:f.hub().id,applied:10});f.bell(0).pos.x+=100;
 f.step();assert.equal(f.hub().data.vesperPose.phase,'shy');assert.deepEqual(impulse(f.bell(0)),{x:0,z:0});
 f.wait(C.mutedSeconds+.1);assert.equal(f.hub().data.vesperPose.phase,'listen');assert.equal(f.hub().hull,C.hull-10);
});
test('saved bell motion persists, destroyed bodies never resurrect; surviving bells still ring',()=>{
 const f=fixture();f.scan();f.bell(0).pos.x+=120;f.bell(0).vel.x=18;f.bell(0).hull=301;
 const saved=f.system.serialize();f.system.deserialize(saved);f.bus.emit('save:loaded',{});
 assert.equal(f.bell(0).vel.x,18);assert.equal(f.bell(0).hull,301);assert.equal(f.bell(0).pos.x,saved.bells[0].x);
 const b=f.bell(2);b.alive=false;f.bus.emit('entity:killed',{id:b.id});const h=f.hub();h.alive=false;f.bus.emit('entity:killed',{id:h.id});
 const dead=f.system.serialize();f.system.deserialize(dead);f.bus.emit('save:loaded',{});f.wait(2);
 assert.equal(f.hub(),null);assert.equal(f.bell(2),null);assert.equal(alive(f).length,2);
 f.pluck(0);f.step();assert.equal(f.bell(0).data.vesperPose.simTime,f.state.simTime);assert.deepEqual(impulse(f.bell(0)),{x:0,z:0});
 f.bus.emit('game:newGame',{});f.step();assert.equal(alive(f).length,4);assert.equal(f.state.vesper.met,false);
});
test('reverse, simultaneous resonance, quiet and returning visitor Easter eggs are one-time',()=>{
 const f=fixture();f.scan();for(const i of C.reverse){f.pluck(i);f.wait(1.5);}assert.equal(f.state.vesper.reverseHeard,true);
 const g=fixture();g.scan();for(const i of [0,1,2])g.bus.emit('physics:impact',{aId:g.bell(i).id,bId:888,impulse:300,preSolveClosingSpeed:20});
 assert.equal(g.state.vesper.unisonHeard,true);assert.equal(g.state.vesper.performances,0);
 const q=fixture();q.scan();q.wait(C.quietSeconds+.1);assert.equal(q.state.vesper.quietHeard,true);
 q.player.pos.x+=500;q.step();q.wait(8);q.player.pos.x-=500;q.step();assert.equal(q.state.vesper.visits,2);
 assert.ok(q.events.some(x=>x[0]==='vesper:voice'&&x[1].key==='welcome'));
});
test('malformed saves normalize to finite bounded whitelist; both capture and restore routes wired',async()=>{
 const n=normalizeVesperMemory({version:1,met:true,performances:Infinity,visits:1e99,evil:42,mutedUntil:1e99,
 hub:{x:1e99,vx:NaN,hull:-1},bells:[{z:Infinity,angVel:1e99}]},10);
 assert.equal(n.evil,undefined);assert.equal(n.visits,1e6);assert.equal(n.performances,0);assert.equal(n.mutedUntil,24);
 assert.equal(n.hub.dead,true);assert.equal(n.hub.x,1e7);assert.equal(n.hub.vx,0);assert.equal(n.bells[0].angVel,30);
 assert.deepEqual(normalizeVesperMemory({version:99}),freshVesperMemory());
 const f=fixture();f.scan();const expected=f.system.serialize(),saver=Object.create(save);saver.state=f.state;saver._callSerialize=id=>id==='vesper'?expected:null;
 assert.deepEqual(saver._saveCapturePlan().find(([key])=>key==='vesper')[1](),expected);
 const source=await readFile(new URL('../src/save/saveSystem.js',import.meta.url),'utf8');assert.match(source,/data\.vesper = this\._callSerialize\('vesper'\)/);
 assert.match(source,/this\._callDeserialize\('vesper', data\.vesper\)/);
});
test('audio is spatial, finite, unique and follows existing mixer recipes',()=>{
 assert.equal(new Set(VESPER_AUDIO_RECIPES.map(r=>r.id)).size,3);const f=fixture();f.scan();f.pluck(0);
 const cue=f.events.find(x=>x[0]==='audio:cue')[1];assert.equal(cue.position.x,f.bell(0).pos.x);assert.ok(cue.gain>0&&cue.gain<=1);
});
test('identical event streams reproduce identical saved state and note receipts',()=>{
 const run=()=>{const f=fixture();f.scan();f.phrase();f.wait(5);return {save:f.system.serialize(),notes:f.events.filter(x=>x[0]==='vesper:note')};};
 assert.deepEqual(run(),run());
});
test('destroy unsubscribes and removes only its own four bodies',()=>{
 const f=fixture();f.system.destroy();assert.equal(alive(f).length,0);assert.equal(f.player.alive,true);
 f.scan();assert.equal(f.state.vesper.met,false);f.system.init({state:f.state,bus:f.bus,helpers:f.helpers});f.step();assert.equal(alive(f).length,4);
});
test('real Rapier consumes bounded bell return and preserves ballistic flight',async()=>{
 const f=fixture(),b=f.bell(0);b.pos.x-=65;b.vel.x=0;
 const owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try {
  owner.syncFromEntities(alive(f));const start=b.pos.x;
  for(let i=0;i<120;i++){f.step();owner.syncFromEntities(alive(f));owner.step(1/60);}
  assert.ok(b.pos.x>start+1,'real body returned under acceleration');assert.ok(b.vel.x>0&&b.vel.x<10);
  f.bus.emit('tether:latched',{targetId:b.id});
  // Solver-owned pull: direct velocity writes are intentionally ignored by the live authority.
  queuePhysicsImpulse(b,{x:(-20-b.vel.x)*b.mass,y:0,z:0});
  for(let i=0;i<30;i++){f.step();owner.syncFromEntities(alive(f));owner.step(1/60);}
  const before=b.pos.x;f.bus.emit('tether:released',{targetId:b.id});
  for(let i=0;i<60;i++){f.step();owner.syncFromEntities(alive(f));owner.step(1/60);}
  assert.ok(b.pos.x<before-15);assert.ok(b.vel.x<-15);assert.ok(Number.isFinite(b.pos.z));
 }finally{owner.dispose();f.system.destroy();}
});
