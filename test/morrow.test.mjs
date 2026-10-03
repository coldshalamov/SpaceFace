import test from 'node:test';
import assert from 'node:assert/strict';
import { createMorrow, morrowEntitySpec, advanceMorrowOrbit, morrowLaunchDelta } from '../src/systems/morrow.js';
import { MORROW as C, freshMorrowMemory, normalizeMorrowMemory, MORROW_AUDIO_RECIPES } from '../src/data/morrow.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { save } from '../src/save/saveSystem.js';

function fixture(memory) {
  const bus=createBus(), events=[];
  const state={simTime:0, tick:0, mode:'flight', timeScale:1, run:{kind:'adventure'},
    world:{currentSectorId:C.sectorId}, entities:new Map(),entityList:[],player:{tether:{active:false}},morrow:memory};
  let id=0;
  const helpers={spawnEntity(spec){ const e=makeEntity({...spec,id:++id});state.entities.set(e.id,e);state.entityList.push(e);return e; },
    removeEntity(id){ const e=state.entities.get(id);if(e)e.alive=false; },
    voice:{say(p){events.push(['voice',p]);return true;}}};
  const player=helpers.spawnEntity({type:'ship',team:0,pos:{x:C.anchor.x+65,z:C.anchor.z},vel:{x:0,z:30},
    radius:4,mass:12,hull:100,hullMax:100,maxSpeed:250,isPlayer:true,physicsBody:{shape:'ball',dynamic:true,
      radius:4,mass:12,useMeasuredSkin:false,material:'ship',contact:{linearDamping:0,angularDamping:0}}});
  state.playerId=player.id;
  for(const type of ['morrow:met','morrow:launch','morrow:voice','audio:cue','comms:log'])bus.on(type,p=>events.push([type,p]));
  const system=createMorrow();system.init({state,bus,helpers});
  function step(dt=1/60){state.simTime+=dt;state.tick++;system.update(dt,state);}
  step();
  let seq=0;
  function scan(overrides={}){bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,
    pos:{x:player.pos.x,z:player.pos.z},radius:250,simTime:state.simTime,...overrides});}
  function orbit(seconds=7,speed=30,radius=65){
    for(let i=0;i<seconds*60;i++){
      const a=i/60*speed/radius;
      player.pos.set(C.anchor.x+Math.cos(a)*radius,0,C.anchor.z+Math.sin(a)*radius);
      player.vel.set(-Math.sin(a)*speed,0,Math.cos(a)*speed);step();
      if(system._phase==='release')break;
    }
  }
  return {bus,state,helpers,player,system,events,step,scan,orbit};
}
function drain(e){const c=consumePhysicsCommand(e);return (c?.impulses||[]).reduce((v,p)=>({x:v.x+p.x,z:v.z+p.z}),{x:0,z:0});}

test('registered on both production paths and queues before physics',()=>{
  assert.equal(PRODUCTION_INIT_ORDER.filter(x=>x==='morrow').length,1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter(x=>x==='morrow').length,1);
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('morrow')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
});
test('one neutral authored body, no stock AI or oversized collider',()=>{
 const f=fixture();for(let i=0;i<300;i++)f.step();
 assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.morrow).length,1);
 const e=f.system._entity();assert.equal(isHostileToPlayer(e,0,f.state),false);assert.equal(e.data.ai.passive,true);
 const spec=resolvePhysicsBodySpec(e);assert.equal(spec.mass,C.mass);assert.equal(spec.radius,C.radius);
 f.system.destroy();assert.equal(e.alive,false);
});
test('does not appear in survival, lab, or another sector',()=>{
 for(const [kind,sector] of [['survival',C.sectorId],['lab',C.sectorId],['adventure','elsewhere']]){
  const f=fixture();f.state.run.kind=kind;f.state.world.currentSectorId=sector;f.bus.emit('sector:enter',{});
  for(let i=0;i<180;i++)f.step();assert.equal(f.system._entity(),null);
 }
});
test('scan wakes, scans again to arm, replay ignored, third scan cancels',()=>{
 const f=fixture();f.scan();assert.equal(f.state.morrow.met,true);assert.equal(f.system._phase,'idle');
 f.scan({seq:1});assert.equal(f.system._phase,'idle');f.scan();assert.equal(f.system._phase,'armed');
 f.scan();assert.equal(f.system._phase,'idle');assert.equal(f.events.filter(x=>x[0]==='morrow:met').length,1);
});
test('rejects foreign, impossible, distant, docked and paused pulses',()=>{
 for(const change of [{source:'other'},{scannerId:999},{seq:NaN},{pos:{x:0,z:0}},{radius:NaN},{radius:1}]){
  const f=fixture();f.scan(change);assert.equal(f.state.morrow.met,false);
 }
 const f=fixture();f.player.flags.docked=true;f.scan();assert.equal(f.state.morrow.met,false);
 f.player.flags.docked=false;f.state.timeScale=0;f.scan();assert.equal(f.state.morrow.met,false);
 f.state.timeScale=1;f.player.pos.x+=500;f.scan();assert.equal(f.state.morrow.met,false);
});
test('continuous arc accepts both directions but not oscillation or teleport',()=>{
 for(const sign of [-1,1]){const t={angle:null,sweep:0,sign:0};let earned=false;
  for(let i=0;i<300;i++)earned=advanceMorrowOrbit(t,sign*i*.009,65,40,1/60)||earned;assert.ok(earned);}
 const t={angle:null,sweep:0,sign:0};for(let i=0;i<500;i++)assert.equal(advanceMorrowOrbit(t,i%2*.01,65,30,1/60),false);
 assert.equal(advanceMorrowOrbit(t,2,65,30,1/60),false);assert.equal(t.sweep,0);
 for(const [r,s] of [[20,30],[101,30],[60,1]]){advanceMorrowOrbit(t,0,r,s,1/60);assert.equal(t.sweep,0);}
});
test('launch direction follows momentum, capped delta speed; no stationary boost',()=>{
 assert.deepEqual(morrowLaunchDelta({x:30,z:40}),{x:28.799999999999997,z:38.400000000000006});
 assert.equal(morrowLaunchDelta({x:0,z:0}),null);assert.equal(morrowLaunchDelta({x:220,z:0}),null);
 assert.equal(morrowLaunchDelta({x:185,z:0}).x,5);assert.equal(morrowLaunchDelta({x:NaN,z:1}),null);
});
test('real scan-to-arc-to-windup launch has bounded membrane impulses and opposite recoil',()=>{
 const f=fixture();f.scan();f.scan();f.orbit();assert.equal(f.system._phase,'release');
 const before={x:f.player.vel.x,z:f.player.vel.z};const launch=f.events.find(x=>x[0]==='morrow:launch')[1];
 let px=0,pz=0,mx=0,mz=0;drain(f.system._entity());
 for(let i=0;i<40;i++){f.step();const p=drain(f.player),m=drain(f.system._entity());px+=p.x;pz+=p.z;mx+=m.x;mz+=m.z;}
 assert.deepEqual({x:f.player.vel.x,z:f.player.vel.z},before,'simulation never mutates velocity');
 assert.ok(Math.abs(px-launch.deltaVelocity.x*f.player.mass)<1e-6);assert.ok(Math.abs(pz-launch.deltaVelocity.z*f.player.mass)<1e-6);
 assert.ok(Math.abs(mx+px)<1e-6&&Math.abs(mz+pz)<1e-6);
 assert.equal(f.state.morrow.launches,1);f.scan();assert.equal(f.system._phase,'idle');
 assert.ok(f.state.morrow.cooldownUntil>f.state.simTime);
});
test('refuses an obstructed release and never queues a player impulse',()=>{
 const f=fixture();f.scan();f.scan();
 // Place a solid directly along the instantaneous direction at the moment of release.
 const original=f.system._launch.bind(f.system);
 f.system._launch=(p,e)=>{const v=morrowLaunchDelta(p.vel),len=Math.hypot(v.x,v.z);f.helpers.spawnEntity({type:'asteroid',radius:25,
  pos:{x:p.pos.x+v.x/len*45,z:p.pos.z+v.z/len*45},hull:100});original(p,e);};
 f.orbit();assert.equal(f.state.morrow.launches,0);assert.deepEqual(drain(f.player),{x:0,z:0});
 assert.ok(f.events.some(x=>x[0]==='morrow:voice'&&x[1].key==='obstruction'));
});
test('existing tether, leaving annulus, damage, pause and docking are safe',()=>{
 const f=fixture();f.scan();f.state.player.tether.active=true;f.scan();assert.equal(f.system._phase,'idle');
 f.state.player.tether.active=false;f.scan();assert.equal(f.system._phase,'armed');
 f.state.player.tether.active=true;f.step();assert.equal(f.system._phase,'idle');
 f.state.player.tether.active=false;f.scan();f.orbit(5);assert.equal(f.system._phase,'windup');
 f.player.pos.x=C.anchor.x+200;f.step();assert.equal(f.system._phase,'idle');
 f.player.pos.x=C.anchor.x+65;f.scan();const e=f.system._entity();
 f.bus.emit('combat:damage',{targetId:e.id,applied:0});assert.equal(f.system._phase,'armed');
 f.bus.emit('combat:damage',{targetId:e.id,applied:10});assert.equal(f.system._phase,'shy');
 f.scan();assert.equal(f.system._phase,'shy');drain(f.player);drain(e);
 f.state.timeScale=0;f.system.update(1);assert.deepEqual(drain(f.player),{x:0,z:0});assert.deepEqual(drain(e),{x:0,z:0});
});
test('new game, destruction, loads and sector changes do not duplicate or resurrect',()=>{
 const f=fixture();f.scan();const e=f.system._entity();e.hull=900;const saved=f.system.serialize();
 f.system.deserialize(saved);f.bus.emit('save:loaded',{});assert.equal(f.system._entity().hull,900);assert.equal(f.system._phase,'idle');
 const e2=f.system._entity();e2.alive=false;f.bus.emit('entity:killed',{id:e2.id});const dead=f.system.serialize();assert.equal(dead.destroyed,true);
 f.system.deserialize(dead);f.bus.emit('save:loaded',{});for(let i=0;i<130;i++)f.step();assert.equal(f.system._entity(),null);
 f.bus.emit('game:newGame',{});f.step();assert.ok(f.system._entity());assert.equal(f.state.morrow.met,false);
 f.state.world.currentSectorId='away';f.bus.emit('sector:enter',{});assert.equal(f.system._entity(),null);
 f.state.world.currentSectorId=C.sectorId;f.bus.emit('sector:enter',{});assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.morrow).length,1);
});
test('rituals are optional, deterministic, one-time and persist across visits',()=>{
 const f=fixture();f.scan();f.player.vel.set(0,0,0);
 for(let i=0;i<1340;i++)f.step();assert.equal(f.state.morrow.quietHeard,true);
 for(let i=0;i<250;i++){f.player.rot=i*.06;f.step();}assert.equal(f.state.morrow.danced,true);
 const saved=f.system.serialize();assert.equal(saved.quietHeard,true);assert.equal(saved.danced,true);
 assert.equal(f.events.filter(x=>x[0]==='morrow:voice'&&x[1].key==='quiet').length,1);
 f.player.pos.x+=300;for(let i=0;i<420;i++)f.step();f.player.pos.x-=300;f.step();assert.equal(f.state.morrow.visits,2);
 assert.ok(f.events.some(x=>x[0]==='morrow:voice'&&x[1].key==='welcome'));
});
test('save whitelist is bounded and both save capture paths include memory',()=>{
 const m=normalizeMorrowMemory({version:1,met:true,launches:Infinity,visits:1e100,hull:-1,cooldownUntil:1e200,evil:42},100);
 assert.equal(m.destroyed,true);assert.equal(m.visits,1e6);assert.equal(m.launches,0);assert.equal(m.cooldownUntil,128);assert.equal(m.evil,undefined);
 assert.deepEqual(normalizeMorrowMemory({version:99}),freshMorrowMemory());
 const f=fixture();f.scan();const expected=f.system.serialize();
 const saver=Object.create(save);saver.state=f.state;saver._callSerialize=id=>id==='morrow'?expected:null;
 const task=saver._saveCapturePlan().find(([key])=>key==='morrow');assert.deepEqual(task[1](),expected);
 // Source contract guards the separate synchronous/export route and dependency-ordered restore.
 return import('node:fs/promises').then(async fs=>{const s=await fs.readFile(new URL('../src/save/saveSystem.js',import.meta.url),'utf8');
  assert.match(s,/data\.morrow = this\._callSerialize\('morrow'\)/);
  assert.match(s,/this\._callDeserialize\('morrow', data\.morrow\)/);});
});
test('audio recipes are unique and cues use the live spatial mixer contract',()=>{
 assert.equal(new Set(MORROW_AUDIO_RECIPES.map(r=>r.id)).size,5);
 const f=fixture();f.scan();f.step();const cue=f.events.find(x=>x[0]==='audio:cue')[1];
 assert.equal(cue.position.x,C.anchor.x);assert.equal(cue.position.z,C.anchor.z);assert.equal(cue.gain,.7);
});
test('real Rapier consumes the release: actual speed increases, no teleport, finite recoil',async()=>{
 const f=fixture();f.scan();f.scan();f.orbit();const e=f.system._entity();
 // Drain the long scripted approach's unconsumed station-keeping zeros before real integration.
 drain(e);const owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try{
  owner.syncFromEntities([f.player,e]);const initial=Math.hypot(f.player.vel.x,f.player.vel.z);
  let previous=f.player.pos.clone();
  for(let i=0;i<32;i++){f.step();owner.syncFromEntities([f.player,e]);owner.step(1/60);
   assert.ok(f.player.pos.distanceTo(previous)<4,'bounded real-world displacement');previous.copy(f.player.pos);}
  const final=Math.hypot(f.player.vel.x,f.player.vel.z);
  assert.ok(final>initial+40&&final<=initial+C.deltaSpeed+.2,`actual velocity ${initial} -> ${final}`);
  assert.ok(Math.hypot(e.vel.x,e.vel.z)>0);assert.ok(Number.isFinite(e.pos.x));
 }finally{owner.dispose();f.system.destroy();}
});


test('Morrow refuses to sling a ship into its own hub',()=>{
 const f=fixture();f.scan();f.scan();f.orbit(5);assert.equal(f.system._phase,'windup');
 const e=f.system._entity();f.player.pos.set(C.anchor.x+65,0,C.anchor.z);f.player.vel.set(-30,0,0);
 for(let i=0;i<90;i++)f.step();assert.equal(f.state.morrow.launches,0);assert.deepEqual(drain(f.player),{x:0,z:0});
});
