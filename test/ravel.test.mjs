import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createRavelFixture as fixture } from '../tools/ravel/labRuntime.js';
import { ravelEntitySpec, RAVEL_GLOBAL_ANCHOR as O } from '../src/systems/ravel.js';
import { RAVEL as C, freshRavelMemory, normalizeRavelMemory, RAVEL_AUDIO_RECIPES } from '../src/data/ravel.js';
import { sectorLocalToGlobalForSector } from '../src/data/sectorCoordinates.js';
import { SECTORS } from '../src/data/sectors.js';
import { makeEntity, stampOccupantGeneration } from '../src/core/entity.js';
import { resolvePhysicsBodySpec, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { playerOwnsSpoolLine, sweptWaveHit, boundedServo } from '../src/characters/ravelRules.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { save } from '../src/save/saveSystem.js';
const ticks=(f,n)=>{for(let i=0;i<n;i++)f.step();};
function active(f){f.scan();f.scan();assert.equal(f.system._phase,'windup');}
function fakeCanonicalLine(f,e,overrides={}){const a={state:'active',ownerId:f.player.id,targetId:e.id,
 ownerGeneration:f.player.occupantGeneration,targetGeneration:e.occupantGeneration,...overrides};
 f.state.combat.attachments.byId.fixture=a;return a;}

test('both production paths contain exactly one RAVEL, before physics',()=>{
 for(const list of [PRODUCTION_INIT_ORDER,PRODUCTION_UPDATE_ORDER])assert.equal(list.filter(x=>x==='ravel').length,1);
 assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('ravel')<PRODUCTION_UPDATE_ORDER.indexOf('physics'));
});
test('global entity, local chart POI and spatial audio agree outside Helios',()=>{
 const f=fixture(),core=f.system._core();
 assert.deepEqual({x:core.pos.x,z:core.pos.z},{x:-21420,z:21100});
 const s=SECTORS.find(s=>s.id===C.sectorId),poi=s.pois.find(p=>p.runtimeOwner==='ravel');
 assert.deepEqual(sectorLocalToGlobalForSector(poi.pos,s.id),O);
 f.scan();const cue=f.events.find(x=>x[0]==='audio:cue')[1];assert.deepEqual(cue.position,O);
 assert.equal(resolvePhysicsBodySpec(core).dynamic,false);
 assert.ok(f.system._spools.every(e=>resolvePhysicsBodySpec(e).dynamic));f.destroy();
});
test('bounded memory rejects unsupported versions, forged phase, impossible hull and masks',()=>{
 assert.deepEqual(normalizeRavelMemory({version:99}),freshRavelMemory());
 const m=normalizeRavelMemory({version:1,met:true,hull:Infinity,freed:9,broken:-1,visits:1e20,phase:'cast',pacified:true});
 assert.equal(m.hull,C.hull);assert.equal(m.freed,0);assert.equal(m.broken,0);assert.equal(m.visits,1e6);
 assert.equal(m.phase,undefined);assert.equal(m.pacified,false);
 const n=normalizeRavelMemory({version:1,hull:-2,freed:7,broken:7});
 assert.equal(n.destroyed,true);assert.equal(n.pacified,false);assert.equal(n.broken,0);
});
test('one cohort; never appears in arcade, laboratory or another sector',()=>{
 const f=fixture();ticks(f,180);assert.equal(f.state.entityList.filter(e=>e.alive&&e.data?.ravelPart).length,4);
 for(const [kind,sector]of[['survival',C.sectorId],['lab',C.sectorId],['adventure','sector_helios_prime']]){
  f.state.run.kind=kind;f.state.world.currentSectorId=sector;f.bus.emit('sector:enter',{});assert.equal(f.system._core(),null);
 }f.destroy();
});
const partsOf=f=>f.state.entityList.filter(e=>e.alive&&e.data?.ravelPart);
test('streaming: nothing is minted for a far pilot; the encounter streams in and out with hysteresis and never flaps',()=>{
 const f=fixture(),exit=f.system._exitRadius();assert.ok(exit>400);
 f.player.pos.x=O.x+exit+400;f.player.pos.z=O.z;ticks(f,130);
 assert.equal(partsOf(f).length,0,'a far pilot costs nothing: no core or spool is minted');
 let spawned=0;const spawn=f.helpers.spawnEntity;
 f.helpers.spawnEntity=s=>{const e=spawn(s);if(e?.data?.ravelPart)spawned++;return e;};
 f.player.pos.x=O.x+exit-C.streamInMargin-60;ticks(f,130);
 assert.equal(partsOf(f).length,4,'inside the stream-in radius the encounter appears whole');
 const ids=()=>partsOf(f).map(e=>e.id).sort((a,b)=>a-b).join();const born=ids(),afterIn=spawned;
 f.player.pos.x=O.x+exit-C.streamOutMargin-40;ticks(f,130);
 assert.equal(partsOf(f).length,4,'inside the hysteresis band it stays');
 f.player.pos.x=O.x+exit-C.streamInMargin+20;ticks(f,130);
 assert.equal(partsOf(f).length,4,'between the two radii it neither appears nor vanishes');
 assert.equal(spawned,afterIn,'and nothing is re-minted while it stays');assert.equal(ids(),born,'the same bodies, no thrash');
 f.player.pos.x=O.x+exit-C.streamOutMargin+40;ticks(f,130);
 assert.equal(partsOf(f).length,0,'past the stream-out radius it is withdrawn whole');
 f.player.pos.x=O.x+200;ticks(f,130);
 assert.equal(partsOf(f).length,4,'and returns as core + three spools');f.destroy();
});
test('an anonymous shell promoted from a shelved far-actor row is removed by its owner stamp; the real cohort stays singular',()=>{
 const f=fixture();ticks(f,5);
 const twin=f.helpers.spawnEntity({type:'drone',team:2,pos:{x:O.x,z:O.z},radius:5,mass:5,hull:5,hullMax:5,
  data:{persistenceOwner:'ravel',homeSectorId:C.sectorId}});
 const stranger=f.helpers.spawnEntity({type:'drone',team:2,pos:{x:O.x+9,z:O.z},radius:5,mass:5,hull:5,hullMax:5,
  data:{persistenceOwner:'traffic'}});
 ticks(f,130);
 assert.equal(twin.alive,false,'our twin is cleaned up');assert.equal(stranger.alive,true,'and nobody else\'s entity is touched');
 assert.equal(partsOf(f).length,4);f.destroy();
});
test('a duplicate core does not survive the census beside the adopted one',()=>{
 const f=fixture();ticks(f,5);
 const dupe=f.helpers.spawnEntity(ravelEntitySpec('core'));ticks(f,130);
 assert.equal(dupe.alive,false);assert.equal(partsOf(f).length,4);f.destroy();
});
test('every ravel body carries the owner stamp the census cleans shells by',()=>{
 const f=fixture();
 for(const e of partsOf(f))assert.equal(e.data.persistenceOwner,'ravel');
 assert.equal(ravelEntitySpec('spool',2).data.persistenceOwner,'ravel');f.destroy();
});
test('scan consent: hail, then challenge, then cancel; duplicate sequence never arms',()=>{
 const f=fixture();f.scan();assert.equal(f.state.ravel.met,true);assert.equal(f.system._phase,'idle');
 f.scan({seq:1});assert.equal(f.system._phase,'idle');f.scan();assert.equal(f.system._phase,'windup');
 f.scan();assert.equal(f.system._phase,'idle');assert.ok(f.system._core().flags.invuln);f.destroy();
});
test('rejects foreign, impossible, distant, paused and docked scan pulses',()=>{
 for(const p of[{source:'npc'},{scannerId:42},{seq:NaN},{pos:{x:0,z:0}},{radius:NaN},{radius:1}]){
  const f=fixture();f.scan(p);assert.equal(f.state.ravel.met,false);f.destroy();}
 for(const flag of['pause','dock','distant']){const f=fixture();
  if(flag==='pause')f.state.timeScale=0;else if(flag==='dock')f.player.flags.docked=true;else f.player.pos.x+=500;
  f.scan();assert.equal(f.state.ravel.met,false);f.destroy();}
});
test('full telegraph duration, locked aim, exposed-only core and no instant retaliation',()=>{
 const f=fixture();active(f);const aim=f.system._angle;const h=f.system._core().hull;
 f.damage(f.system._core(),100);assert.equal(f.system._core().hull,h);
 f.player.pos.z+=100;ticks(f,125);assert.equal(f.system._phase,'windup');assert.equal(f.system._angle,aim);
 ticks(f,3);assert.equal(f.system._phase,'cast');ticks(f,92);assert.equal(f.system._phase,'exposed');
 f.damage(f.system._core(),100);assert.ok(f.system._core().hull<h);assert.equal(f.state.ravel.hull,f.system._core().hull);
 ticks(f,255);assert.equal(f.system._phase,'recover');assert.equal(f.system._core().flags.invuln,true);f.destroy();
});
test('swept crest catches a crossing ship but not a clear sideways dodge',()=>{
 assert.equal(sweptWaveHit({x:120,z:0},{x:60,z:0},{x:0,z:0},0,90,94,4),true);
 assert.equal(sweptWaveHit({x:120,z:80},{x:60,z:80},{x:0,z:0},0,90,94,4),false);
 assert.equal(sweptWaveHit({x:NaN,z:0},{x:60,z:0},{x:0,z:0},0,90,94,4),false);
});
test('real combat routing absorbs wave in shields, at most once per cast',()=>{
 const f=fixture();active(f);const h=f.player.hull,shield=f.player.shield;ticks(f,218);
 assert.equal(f.events.filter(x=>x[0]==='ravel:hit').length,1);
 assert.equal(f.player.hull,h);assert.ok(f.player.shield<shield);f.destroy();
});
test('moving outside the warning lane avoids both damage and shove',()=>{
 const f=fixture();active(f);f.player.pos.set(O.x,0,O.z+190);const h=f.player.hull,shield=f.player.shield;
 ticks(f,220);assert.equal(f.events.filter(x=>x[0]==='ravel:hit').length,0);assert.equal(f.player.hull,h);assert.equal(f.player.shield,shield);f.destroy();
});
test('pause freezes clocks, leaving or docking cancels and cannot carry a charged shot',()=>{
 const f=fixture();active(f);ticks(f,50);const phase=f.system._elapsed;f.state.timeScale=0;ticks(f,500);
 assert.equal(f.system._elapsed,phase);f.state.timeScale=1;f.player.flags.docked=true;f.step();assert.equal(f.system._phase,'idle');
 f.player.flags.docked=false;f.scan();f.player.pos.x=O.x+C.leashRadius+10;f.step();assert.equal(f.system._phase,'idle');f.destroy();
});
test('ownership uses kernel ownerId, excludes foreign/broken/recycled endpoint bindings',()=>{
 const f=fixture(),e=f.system._spools[0];fakeCanonicalLine(f,e);assert.equal(playerOwnsSpoolLine(f.state,e),true);
 fakeCanonicalLine(f,e,{ownerId:333});assert.equal(playerOwnsSpoolLine(f.state,e),false);
 fakeCanonicalLine(f,e,{state:'broken'});assert.equal(playerOwnsSpoolLine(f.state,e),false);
 fakeCanonicalLine(f,e,{targetGeneration:e.occupantGeneration+1});assert.equal(playerOwnsSpoolLine(f.state,e),false);
 fakeCanonicalLine(f,e,{ownerGeneration:f.player.occupantGeneration+1});assert.equal(playerOwnsSpoolLine(f.state,e),false);f.destroy();
});
test('unowned blast displacement cannot accidentally earn a peaceful solution',()=>{
 const f=fixture();active(f);const e=f.system._spools[0];e.pos.x=O.x+150;e.pos.z=O.z;ticks(f,50);assert.equal(f.state.ravel.freed,0);f.destroy();
});
test('three player-threaded sustained extractions pacify without currency, repeated credit or attacks',()=>{
 const f=fixture();active(f);const credits=f.state.player.credits;
 for(let i=0;i<3;i++){const e=f.system._spools[i];fakeCanonicalLine(f,e);e.pos.set(O.x+150,0,O.z);ticks(f,25);}
 assert.equal(f.state.ravel.freed,7);assert.equal(f.state.ravel.broken,0);assert.equal(f.system._phase,'peace');
 assert.equal(f.events.filter(x=>x[0]==='ravel:pacified').length,1);assert.equal(f.state.player.credits,credits);
 const n=f.events.filter(x=>x[0]==='ravel:cast').length;ticks(f,500);assert.equal(f.events.filter(x=>x[0]==='ravel:cast').length,n);f.destroy();
});
test('shot counterweights give a scarred alternative and never rematerialize',()=>{
 const f=fixture();active(f);for(const e of f.system._spools.slice())f.damage(e,10000);
 assert.equal(f.state.ravel.broken,7);assert.equal(f.state.ravel.pacified,true);ticks(f,100);
 assert.ok(f.system._spools.every(e=>e===null));assert.ok(f.events.some(x=>x[0]==='ravel:voice'&&x[1].key==='scarred'));f.destroy();
});
test('core death is permanent across save and sector recook',()=>{
 const f=fixture();active(f);ticks(f,220);f.damage(f.system._core(),10000);assert.equal(f.state.ravel.destroyed,true);
 const m=f.system.serialize();f.system.deserialize(m);f.bus.emit('save:loaded',{});ticks(f,130);
 assert.equal(f.system._core(),null);assert.equal(f.state.ravel.hull,0);f.destroy();
});
test('save captures memory on both routes and restores an idle, not half-charged encounter',async()=>{
 const f=fixture();active(f);ticks(f,70);const m=f.system.serialize();const saver=Object.create(save);saver.state=f.state;
 saver._callSerialize=id=>id==='ravel'?m:null;const task=saver._saveCapturePlan().find(([k])=>k==='ravel');assert.deepEqual(task[1](),m);
 const source=await fs.readFile(new URL('../src/save/saveSystem.js',import.meta.url),'utf8');
 assert.match(source,/data\.ravel = this\._callSerialize\('ravel'\)/);assert.match(source,/this\._callDeserialize\('ravel', data\.ravel\)/);
 f.bus.emit('save:restoring',{});f.system.deserialize(m);f.bus.emit('save:loaded',{});
 assert.equal(f.system._phase,'idle');assert.equal(f.system._elapsed,0);assert.equal(f.system._core().hull,m.hull);f.destroy();
});
test('quiet fourth-place and voluntary return easter eggs persist and speak once',()=>{
 const f=fixture({...freshRavelMemory(),met:true,freed:7});const e=f.system._spools[0];
 f.player.pos.set(O.x+110,0,O.z);ticks(f,1100);assert.equal(f.state.ravel.quiet,true);
 fakeCanonicalLine(f,e);e.pos.set(O.x+28,0,O.z);f.step();assert.equal(f.state.ravel.returned,true);ticks(f,100);
 for(const key of['quiet','returned'])assert.equal(f.events.filter(x=>x[0]==='ravel:voice'&&x[1].key===key).length,1);f.destroy();
});
test('bounded servo writes no pose and rejects invalid steps',()=>{
 const e=makeEntity(ravelEntitySpec('spool'));e.pos.x+=10000;const before=e.vel.clone();
 const dv=boundedServo(e,O,1/60);assert.ok(Math.hypot(dv.x,dv.z)<=C.returnAcceleration/60+1e-8);assert.deepEqual(e.vel,before);
 assert.equal(boundedServo(e,O,Infinity),null);
});
test('lifecycle removes cook providers, queued callbacks and only its own entities',()=>{
 const f=fixture();f.state.render.sectorEnterCookWillRun=()=>true;f.bus.emit('sector:enter',{});
 assert.equal(f.state.render.deferredEnterMaterializers.length,1);f.system.destroy();
 assert.equal(f.helpers.sectorCookProviders.length,0);assert.equal(f.state.render.deferredEnterMaterializers.length,0);
 assert.equal(f.player.alive,true);f.destroy();
});
test('real Rapier cast moves counterweights; fixed core stays fixed',async()=>{
 const f=fixture();const owner=await f.enablePhysics();active(f);ticks(f,150);
 assert.ok(f.system._spools.some(e=>Math.hypot(e.vel.x,e.vel.z)>30));
 const core=f.system._core();assert.ok(Math.hypot(core.pos.x-O.x,core.pos.z-O.z)<.01);
 assert.equal(owner.records.get(core.id).spec.dynamic,false);f.destroy();
});
test('real Massline joint is recognized and physically tows a spool through the release radius',async()=>{
 const f=fixture();const e=f.system._spools[0];f.player.pos.set(e.pos.x+32,0,e.pos.z);await f.enablePhysics();
 const result=f.grip(e);assert.equal(result.ok,true,JSON.stringify(result));assert.equal(playerOwnsSpoolLine(f.state,e),true);
 active(f);let farthest=0;
 for(let i=0;i<270&&!f.state.ravel.freed;i++){
   f.thrust(1,0);f.step();farthest=Math.max(farthest,Math.hypot(e.pos.x-O.x,e.pos.z-O.z));
 }
 assert.ok(f.state.ravel.freed&1,`real joint failed to pull: r=${farthest}, player=${f.player.pos.x-O.x}`);f.destroy();
});
test('deterministic encounter transcript does not call ambient random',()=>{
 const run=()=>{const f=fixture();active(f);ticks(f,600);const out=JSON.stringify([f.system.serialize(),f.events]);f.destroy();return out;};
 const original=Math.random;try{Math.random=()=>{throw Error('ambient randomness');};assert.equal(run(),run());}finally{Math.random=original;}
});
test('five distinct spatial recipe IDs',()=>{assert.equal(new Set(RAVEL_AUDIO_RECIPES.map(x=>x.id)).size,5);});
