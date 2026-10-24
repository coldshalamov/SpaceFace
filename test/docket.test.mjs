import test from 'node:test';
import assert from 'node:assert/strict';
import { createDocket, docketEntitySpec } from '../src/systems/docket.js';
import { DOCKET as C, DOCKET_LINES, DOCKET_TOLD, freshDocketMemory, normalizeDocketMemory, DOCKET_AUDIO_RECIPES } from '../src/data/docket.js';
import { deliveryCheck, inApproachShelf, boundedServo, violatesRegister } from '../src/characters/docketRules.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, TABLE_CLOCK_IDS } from '../src/runtime/authoritativeSystemManifest.js';
import { isHostileToPlayer } from '../src/systems/scanner.js';
import { save } from '../src/save/saveSystem.js';
import { RECIPES } from '../src/data/audioRecipes.js';

function fixture(memory) {
  const bus=createBus(), events=[];
  const state={simTime:0, tick:0, mode:'flight', timeScale:1, run:{kind:'adventure'},
    world:{currentSectorId:C.sectorId}, entities:new Map(),entityList:[],
    combat:{attachments:{byId:{}}},player:{tether:{active:false}},docket:memory};
  let id=0;
  const helpers={spawnEntity(spec){ const e=makeEntity({...spec,id:++id});state.entities.set(e.id,e);state.entityList.push(e);return e; },
    removeEntity(id){ const e=state.entities.get(id);if(e)e.alive=false; },
    voice:{say(p){events.push(['voice',p]);return true;}}};
  const player=helpers.spawnEntity({type:'ship',team:0,pos:{x:C.anchor.x+65,z:C.anchor.z},vel:{x:0,z:0},
    radius:4,mass:12,hull:100,hullMax:100,maxSpeed:250,isPlayer:true,physicsBody:{shape:'ball',dynamic:true,
      radius:4,mass:12,useMeasuredSkin:false,material:'ship',contact:{linearDamping:0,angularDamping:0}}});
  state.playerId=player.id;
  for(const type of ['docket:met','docket:delivered','docket:voice','audio:cue','comms:log','toast'])bus.on(type,p=>events.push([type,p]));
  const system=createDocket();system.init({state,bus,helpers});
  function step(dt=1/60){state.simTime+=dt;state.tick++;system.update(dt,state);}
  step();
  let seq=0;
  function scan(overrides={}){bus.emit('scan:pulse',{source:'player-scanner',scannerId:player.id,seq:++seq,
    pos:{x:player.pos.x,z:player.pos.z},radius:250,simTime:state.simTime,...overrides});}
  function holdLine(on){state.combat.attachments.byId=on
    ?{a:{state:'active',ownerId:player.id,targetId:system._entity().id}}:{};}
  return {bus,state,helpers,player,system,events,step,scan,holdLine};
}
function drain(e){const c=consumePhysicsCommand(e);return (c?.impulses||[]).reduce((v,p)=>({x:v.x+p.x,z:v.z+p.z}),{x:0,z:0});}
function voices(f){return f.events.filter(x=>x[0]==='docket:voice').map(x=>x[1].key);}

test('registered on both production paths, on the table clock, before physics',()=>{
  assert.equal(PRODUCTION_INIT_ORDER.filter(x=>x==='docket').length,1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter(x=>x==='docket').length,1);
  assert.ok(TABLE_CLOCK_IDS.includes('docket'),'character set-pieces queue impulses every fixed step');
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('docket')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
});
test('one neutral authored body, no stock AI, spec is throwable',()=>{
 const f=fixture();for(let i=0;i<300;i++)f.step();
 assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.docket).length,1);
 const e=f.system._entity();assert.equal(isHostileToPlayer(e,0,f.state),false);assert.equal(e.data.ai.passive,true);
 assert.equal(e.data.authoredCharacter,'docket');
 f.system.destroy();assert.equal(e.alive,false);
});
test('does not appear in survival, lab, or another sector',()=>{
 for(const [kind,sector] of [['survival',C.sectorId],['lab',C.sectorId],['adventure','elsewhere']]){
  const f=fixture();f.state.run.kind=kind;f.state.world.currentSectorId=sector;f.bus.emit('sector:enter',{});
  for(let i=0;i<180;i++)f.step();assert.equal(f.system._entity(),null);
 }
});
test('scan wakes the manifest, brief names the address, told lines do not repeat',()=>{
 const f=fixture();f.scan();assert.equal(f.state.docket.met,true);assert.ok(voices(f).includes('hello'));
 f.state.simTime+=10;f.scan();assert.ok(voices(f).includes('brief'));
 assert.equal(f.events.filter(x=>x[0]==='docket:met').length,1);
});
test('rejects foreign, impossible, distant, docked and paused pulses',()=>{
 for(const change of [{source:'other'},{scannerId:999},{seq:NaN},{pos:{x:0,z:0}},{radius:NaN},{radius:1}]){
  const f=fixture();f.scan(change);assert.equal(f.state.docket.met,false);
 }
 const f=fixture();f.player.flags.docked=true;f.scan();assert.equal(f.state.docket.met,false);
 f.player.flags.docked=false;f.state.timeScale=0;f.scan();assert.equal(f.state.docket.met,false);
 f.state.timeScale=1;f.player.pos.x+=500;f.scan();assert.equal(f.state.docket.met,false);
});
test('delivery latch is positional: inside the cradle AND at rest',()=>{
 assert.equal(deliveryCheck({pos:{...C.depot},vel:{x:0,z:0}}).arrived,true);
 assert.equal(deliveryCheck({pos:{...C.depot},vel:{x:80,z:0}}).arrived,false,'a fast pass is transit, not delivery');
 assert.equal(deliveryCheck({pos:{...C.depot},vel:{x:25,z:0}}).arrived,false,'even a gentle toss through is transit');
 assert.equal(deliveryCheck({pos:{...C.depot},vel:{x:C.arriveSpeed-1,z:0}}).arrived,true,'the servo parks under the latch');
 assert.equal(deliveryCheck({pos:{x:C.depot.x+C.depotRadius+1,z:C.depot.z},vel:{x:0,z:0}}).arrived,false);
});
test('parking the parcel inside the cradle delivers it: latch, payoff, news, persistence',()=>{
 const f=fixture();f.scan();const e=f.system._entity();
 e.pos.x=C.depot.x;e.pos.z=C.depot.z;e.vel={x:0,z:0};f.step();
 assert.equal(f.state.docket.delivered,true);assert.ok(voices(f).includes('arrived'));
 assert.equal(f.events.filter(x=>x[0]==='docket:delivered').length,1);
 assert.ok(f.events.some(x=>x[0]==='comms:log'&&x[1].text===DOCKET_LINES.news));
 const saved=f.system.serialize();assert.equal(saved.delivered,true);
});
test('crossing into the cradle the trim announces itself once ever, floor or no floor',()=>{
 const f=fixture();f.scan();f.state.simTime+=10;const e=f.system._entity();
 // A fast entry holds the floor with 'in transit': the close line waits rather than being dropped.
 e.pos.x=C.depot.x;e.pos.z=C.depot.z;e.vel={x:120,z:0};f.step();
 assert.ok(voices(f).includes('inTransit'));assert.ok(!voices(f).includes('close'));
 f.state.simTime+=7;f.step();assert.ok(voices(f).includes('close'));assert.ok(f.state.docket.told.includes('close'));
 f.state.simTime+=7;f.step();assert.equal(voices(f).filter(k=>k==='close').length,1);
});
test('a fast pass through the cradle is called as an overshoot and does not latch',()=>{
 const f=fixture();f.scan();f.state.simTime+=10;const e=f.system._entity();
 e.pos.x=C.depot.x;e.pos.z=C.depot.z;e.vel={x:120,z:0};f.step();
 assert.equal(f.state.docket.delivered,false);
 f.state.simTime+=10; // the in-transit line holds the voice floor; the call waits its turn
 e.pos.x=C.depot.x+C.depotRadius+50;e.vel={x:120,z:0};f.step();
 assert.ok(voices(f).includes('overshoot'));assert.equal(f.state.docket.overshoots,1);
});
test('the approach shelf trims toward the address; a delivered parcel holds the dock',()=>{
 const f=fixture();const e=f.system._entity();
 e.pos.x=C.depot.x+C.approachShelf*0.5;e.pos.z=C.depot.z;e.vel={x:0,z:0};f.step();
 const imp=drain(e);assert.ok(imp.x<0,'trim impulse pulls toward the depot');
 const f2=fixture();const e2=f2.system._entity();
 e2.pos.x=C.depot.x;e2.pos.z=C.depot.z;e2.vel={x:0,z:0};f2.step();assert.equal(f2.state.docket.delivered,true);
 e2.pos.x=C.depot.x+60;e2.vel={x:0,z:0};drain(e2);f2.step();
 const imp2=drain(e2);assert.ok(imp2.x<0,'delivered parcel station-keeps at the dock');
});
test('undelivered and untouched it drifts home so the encounter stays findable',()=>{
 const f=fixture();const e=f.system._entity();
 e.pos.x=C.anchor.x+400;e.pos.z=C.anchor.z;e.vel={x:0,z:0};
 f.state.simTime+=C.touchedQuietSeconds+1;f.step();
 const imp=drain(e);assert.ok(imp.x<0,'homing impulse pulls back toward the anchor');
});
test('a line on the parcel is called postage; carried fast it calls itself in transit',()=>{
 const f=fixture();f.scan();const e=f.system._entity();
 f.holdLine(true);f.step();assert.ok(voices(f).includes('lineOn'));
 e.vel={x:200,z:0};f.state.simTime+=C.transitCooldown+1;f.step();
 assert.ok(voices(f).includes('inTransit'));
});
test('damage logs against the carrier; destruction stays undelivered forever',()=>{
 const f=fixture();f.scan();f.state.simTime+=10;const e=f.system._entity();
 f.bus.emit('combat:damage',{targetId:e.id,applied:0});assert.equal(f.state.docket.wronged,0);
 f.bus.emit('combat:damage',{targetId:e.id,applied:10});assert.equal(f.state.docket.wronged,1);
 assert.ok(voices(f).includes('wronged'));
 e.alive=false;f.bus.emit('entity:killed',{id:e.id});
 const saved=f.system.serialize();assert.equal(saved.destroyed,true);assert.equal(saved.delivered,false);
 f.system.deserialize(saved);f.bus.emit('save:loaded',{});for(let i=0;i<130;i++)f.step();assert.equal(f.system._entity(),null);
 assert.ok(f.events.some(x=>x[0]==='comms:log'&&x[1].kind==='character'));
});
test('new game, loads and sector changes do not duplicate or resurrect',()=>{
 const f=fixture();f.scan();const e=f.system._entity();e.hull=90;const saved=f.system.serialize();
 f.system.deserialize(saved);f.bus.emit('save:loaded',{});assert.equal(f.system._entity().hull,90);
 f.bus.emit('game:newGame',{});f.step();assert.ok(f.system._entity());assert.equal(f.state.docket.met,false);
 f.state.world.currentSectorId='away';f.bus.emit('sector:enter',{});assert.equal(f.system._entity(),null);
 f.state.world.currentSectorId=C.sectorId;f.bus.emit('sector:enter',{});assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.docket).length,1);
});
test('save whitelist is bounded and both save capture paths include memory',()=>{
 const m=normalizeDocketMemory({version:1,met:true,delivered:true,visits:1e100,hull:-1,overshoots:1e9,told:['hello','bogus'],evil:42});
 assert.equal(m.destroyed,true);assert.equal(m.delivered,true);assert.equal(m.visits,1e6);
 assert.deepEqual(m.told,['hello']);assert.equal(m.evil,undefined);
 assert.deepEqual(normalizeDocketMemory({version:99}),freshDocketMemory());
 const f=fixture();f.scan();const expected=f.system.serialize();
 const saver=Object.create(save);saver.state=f.state;saver._callSerialize=id=>id==='docket'?expected:null;
 const task=saver._saveCapturePlan().find(([key])=>key==='docket');assert.deepEqual(task[1](),expected);
 return import('node:fs/promises').then(async fs=>{const s=await fs.readFile(new URL('../src/save/saveSystem.js',import.meta.url),'utf8');
  assert.match(s,/data\.docket = this\._callSerialize\('docket'\)/);
  assert.match(s,/this\._callDeserialize\('docket', data\.docket\)/);});
});
test('every line passes the shipping-paperwork register lint',()=>{
 for(const [k,text] of Object.entries(DOCKET_LINES)) assert.deepEqual(violatesRegister(text),[],`${k}: ${text}`);
});
test('audio recipes are unique, registered in RECIPES, and cues use the live spatial mixer contract',()=>{
 assert.equal(new Set(DOCKET_AUDIO_RECIPES.map(r=>r.id)).size,DOCKET_AUDIO_RECIPES.length);
 for(const r of DOCKET_AUDIO_RECIPES) assert.ok(RECIPES.some(x=>x.id===r.id),r.id);
 const f=fixture();const e=f.system._entity();
 e.pos.x=C.depot.x;e.pos.z=C.depot.z;e.vel={x:0,z:0};f.scan();f.step();
 const cue=f.events.find(x=>x[0]==='audio:cue')[1];
 assert.equal(cue.position.x,C.depot.x);assert.equal(cue.position.z,C.depot.z);assert.equal(cue.gain,.7);
});
test('destroyed after delivery files the receipt memorial, not the undelivered one',()=>{
 const f=fixture();f.scan();const e=f.system._entity();
 e.pos.x=C.depot.x;e.pos.z=C.depot.z;e.vel={x:0,z:0};f.step();assert.equal(f.state.docket.delivered,true);
 e.alive=false;f.bus.emit('entity:killed',{id:e.id});
 assert.ok(f.events.some(x=>x[0]==='comms:log'&&x[1].text===DOCKET_LINES.memorialDelivered));
 assert.ok(!f.events.some(x=>x[0]==='comms:log'&&x[1].text===DOCKET_LINES.memorial));
 assert.equal(f.system.serialize().destroyed,true);assert.equal(f.system.serialize().delivered,true);
});
test('after destruction, scanning the berth or the address finds the dark manifest',()=>{
 for(const site of [C.depot,C.anchor]){
  const f=fixture();f.scan();const e=f.system._entity();
  e.alive=false;f.bus.emit('entity:killed',{id:e.id});
  f.player.pos.x=site.x+20;f.player.pos.z=site.z;f.state.simTime+=10;f.scan();
  assert.ok(voices(f).includes('memorialScan'),`site ${site.x},${site.z}`);
 }
 // An intact parcel never answers with the memorial; a live scan says something alive.
 const f=fixture();f.scan();assert.ok(!voices(f).includes('memorialScan'));
});
test('delivering before first contact: the scan reads the closed manifest, not the intro',()=>{
 const f=fixture();const e=f.system._entity();
 e.pos.x=C.depot.x;e.pos.z=C.depot.z;e.vel={x:0,z:0};f.step();assert.equal(f.state.docket.delivered,true);
 f.player.pos.x=C.depot.x+30;f.player.pos.z=C.depot.z;
 f.state.simTime+=10; // let the arrival line's floor lapse; deliveredHello is a courtesy stamp
 f.scan();
 assert.equal(f.state.docket.met,true);assert.ok(voices(f).includes('deliveredHello'));
 assert.ok(!voices(f).includes('hello'));
 assert.equal(f.events.filter(x=>x[0]==='docket:met').length,1);
});
test('the wrong-leg call needs an opened manifest and a listener in earshot',()=>{
 const f=fixture();const e=f.system._entity();
 e.pos.x=C.depot.x+3*Math.hypot(C.anchor.x-C.depot.x,C.anchor.z-C.depot.z);e.pos.z=C.depot.z;e.vel={x:0,z:0};
 f.player.pos.x=e.pos.x-200;f.player.pos.z=e.pos.z;f.step(); // in earshot but never met: silent
 assert.ok(!voices(f).includes('wrongway'));
 f.scan(); // met — but the scan pulse had to happen next to the parcel, so move there first
 f.state.simTime+=10;f.step();assert.ok(voices(f).includes('wrongway'));
 f.player.pos.x=e.pos.x+10000;f.state.simTime+=10;f.step();
 assert.equal(voices(f).filter(k=>k==='wrongway').length,1,'out of earshot it does not nag');
});
test('destroy unregisters the census cook provider',()=>{
 const f=fixture();const providers=f.helpers.sectorCookProviders;
 assert.equal(providers.length,1);f.system.destroy();assert.equal(providers.length,0);
});
