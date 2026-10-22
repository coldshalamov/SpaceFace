import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {world} from '../src/systems/world.js';
import {save} from '../src/save/saveSystem.js';
import {zonesForSector} from '../src/data/sectorZones.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
const nativeSystems=new WeakMap();
async function nativeFor(state) {
 const p=nativeSystems.get(state);assert.ok(p,'native probe requires the registered production physics owner');
 assert.equal(await p.prepareBackend(state),true);return p._sg02;
}
const SECTOR='sector_vesta_forge', SHAPE='the_runaway_kiln', ID='test:kiln:continuity';
function fixture(t, extraSystems=[]) {
 // In-memory storage is a fixture; all serialization, validation and restoration use Save.
 const storage=new Map();const previous=globalThis.localStorage;
 globalThis.localStorage={get length(){return storage.size},key(i){return [...storage.keys()][i]??null},getItem(k){return storage.get(k)??null},setItem(k,v){storage.set(k,String(v))},removeItem(k){storage.delete(k)}};
 const sim=createSimulation({seed:4242,systems:[world,...extraSystems,encounterDirector,save]});
 t.after(()=>{sim.dispose();globalThis.localStorage=previous;});
 const {state,bus}=sim;
 if(sim.registry.get('physics'))nativeSystems.set(state,sim.registry.get('physics'));
 const anchor=sectorLocalToGlobalForSector(zonesForSector(SECTOR).find(z=>z.id==='zone_vesta_forge').center,SECTOR);
 // Keep the authored approach separate from the player pose: enterSector repositions the player.
 const player=sim.spawn({type:'ship',team:0,pos:{...anchor},hull:100,hullMax:100,radius:8});state.playerId=player.id;state.mode='flight';
 sim.registry.get('world').enterSector(SECTOR);
 const d=sim.registry.get('encounterDirector');
 assert.equal(d.requestAuthoredEncounter({shapeId:SHAPE,encounterId:ID,sectorId:SECTOR,anchor,force:true}).ok,true);
 const live=state.encounterDirector.live[ID],body=state.entities.get(live.vars.crucibleId);
 const events=[];for(const name of ['encounter:voice','encounter:resolved','economy:grantCredits','faction:repDelta','news:publish','save:loaded','save:error'])bus.on(name,payload=>events.push({name,payload}));
 return {sim,state,bus,d,live,body,events,saver:sim.registry.get('save')};
}
test('actual Save/Continue retains the interrupted moving crucible and coordinator',async t=>{
 const {state,live,body,saver,events}=fixture(t);
 assert.equal(body.type,'payload');
 assert.equal(saver.save('quick'),true);
 assert.equal(await saver.load('quick'),true);
 assert.ok(events.some(e=>e.name==='save:loaded'));
 const restored=state.encounterDirector.live[live.id];
 assert.ok(restored,'Save/Continue dropped the live rescue coordinator');
 const next=state.entities.get(restored.vars.crucibleId);
 assert.ok(next?.alive!==false);
 assert.equal(next.type,'payload');
});

import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {getCombatKernel} from '../src/combat/kernel.js';
import {scalarHitToDamagePacket} from '../src/combat/damage.js';
import {markPhysicsBodyNativeFailure,clearPhysicsBodyNativeFailure,queuePhysicsImpulse} from '../src/core/physicsAuthority.js';
import {RUNAWAY_KILN_RUNTIME as kiln} from '../src/systems/runawayKilnRuntime.js';
const bodies=state=>state.entityList.filter(e=>e.alive!==false&&e.data?.storyPropKind==='runaway_kiln');
const pose=e=>({pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x+0,z:e.vel.z+0},rot:e.rot,angVel:e.angVel,hull:e.hull});
const hits=f=>damage=>getCombatKernel(f.sim.registry.ctx).routeDamage({attackerId:f.state.playerId,targetId:f.state.encounterDirector.live[ID].vars.crucibleId,packet:scalarHitToDamagePacket({damage,damageType:'kinetic'})});

test('native-observed motion, damage, elapsed time and one-time counters survive repeated actual loads',async t=>{
 const f=fixture(t,[physics]),{state,live,body,saver,bus,events}=f;
 const native=await nativeFor(state);
 // Deliberate one-body native laboratory, using the registered owner; not ordinary towing.
 native.syncFromEntities([body]);
 const before=pose(body);
 for(let i=1;i<=120;i++){native.step(1/60,i);state.tick=i;state.simTime=i/60;}
 assert.ok(Math.hypot(body.pos.x-before.pos.x,body.pos.z-before.pos.z)>0.1,'native owner actually moved the body in the real placed scene');
 assert.equal(hits(f)(3).ok,true);
 bus.emit('scan:pulse',{actorId:state.playerId});bus.emit('tether:attached',{actorId:state.playerId,targetId:body.id});
 assert.equal(live.vars.scanned,true);assert.equal(live.vars.latchedOnce,true);assert.equal(live.vars.struck,1);
 const causality=structuredClone(live.causality);
 const startedAt=live.vars.startedAt,fired=state.encounterDirector.stats.fired;
 assert.equal(saver.save('quick'),true);
 const captured=state.encounterDirector.stats.openRunawayKiln;
 let atRestore;bus.on('save:loaded',()=>{const e=bodies(state)[0];if(e)atRestore=pose(e);});
 const expected=JSON.parse(JSON.stringify({pos:captured.pos,vel:captured.vel,rot:captured.rot,angVel:captured.angVel,hull:captured.hull}));
 const nativePosition=native.records.get(body.id).body.translation(),origin=native.getFrameOrigin();
 assert.deepEqual(expected.pos,{x:nativePosition.x+origin.x,z:nativePosition.z+origin.z});
 for(let i=0;i<3;i++){
  assert.equal(await saver.load('quick'),true);
  const resumed=state.encounterDirector.live[ID],next=state.entities.get(resumed.vars.crucibleId);
  assert.deepEqual(atRestore,expected);
  // Existing native coincidence ladder uses 2.5-WU steps; this placed fixture needs at most two.
  assert.ok(Math.hypot(next.pos.x-expected.pos.x,next.pos.z-expected.pos.z)<=5.001);
  assert.deepEqual({...pose(next),pos:expected.pos},expected);assert.equal(resumed.vars.startedAt,startedAt);assert.deepEqual(resumed.causality,causality);
  assert.equal(resumed.vars.struck,1);assert.equal(resumed.vars.scanned,true);assert.equal(resumed.vars.latchedOnce,true);
  assert.equal(state.encounterDirector.stats.fired,fired);assert.equal(bodies(state).length,1);
  assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
 }
 const resumed=state.encounterDirector.live[ID],next=state.entities.get(resumed.vars.crucibleId);
 const voiceCount=events.filter(e=>e.name==='encounter:voice').length;
 bus.emit('scan:pulse',{actorId:state.playerId});bus.emit('tether:attached',{actorId:state.playerId,targetId:next.id});
 assert.equal(events.filter(e=>e.name==='encounter:voice').length,voiceCount);
 // A fresh native owner is the disclosed scalar-reconstruction check, not solver-snapshot or towing proof.
 const resumedNative=await nativeFor(state);
 resumedNative.syncFromEntities([next]);
 assert.equal([...resumedNative.records.values()].filter(r=>r.entity===next).length,1);
 assert.equal(resumedNative.records.get(next.id).body.mass(),150);
 const x=next.pos.x,z=next.pos.z;resumedNative.step(1/60,state.tick+1);
 assert.ok(Math.hypot(next.pos.x-x,next.pos.z-z)>0.3);
 assert.equal(hits(f)(3).ok,true);
 assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome,'detonated');
 assert.equal(events.filter(e=>e.name==='news:publish').length,1);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(bodies(state).length,0);assert.equal(events.filter(e=>e.name==='news:publish').length,1);
});

test('native impulse rescue pays once; terminal Save/Continue does not resurrect it',async t=>{
 const {state,live,body,d,saver,events}=fixture(t,[physics]);
 const native=await nativeFor(state);native.syncFromEntities([body]);

 // Controlled physical impulse fixture, not a player rope maneuver.
 queuePhysicsImpulse(body,{x:-body.vel.x*150,y:0,z:-body.vel.z*150});
 native.syncFromEntities([body]);native.step(1/60,state.tick);
 assert.ok(Math.hypot(body.vel.x,body.vel.z)<12);
 kiln.tick(d,live,state,state.simTime);
 assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome,'saved');
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,1);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(bodies(state).length,0);assert.equal(state.encounterDirector.live[ID],undefined);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,1);
 assert.equal(state.story.depthProgramEncounters.history.filter(e=>e.shapeId===SHAPE).length,1);
});

test('elapsed timeout continues rather than restarting after Continue',async t=>{
 const {state,live,body,saver,d}=fixture(t,[physics]);
 state.simTime=419;assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 const native=await nativeFor(state);
 native.step(1/60,state.tick);
 state.simTime=421;d._tickLive(state.encounterDirector,state,state.simTime);
 assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome,'drifted');
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
});

test('duplicate load notifications retain only this exact owned life; New Game clears it',t=>{
 const {state,bus,d,body}=fixture(t);
 bus.emit('save:started',{});bus.emit('save:loaded',{});bus.emit('save:loaded',{});
 assert.equal(bodies(state).length,1);
 assert.ok(state.encounterDirector.live[ID]);
 assert.equal(bodies(state)[0],body,'duplicate event preserves the existing physical authority');
 bus.emit('game:new',{});
 assert.equal(bodies(state).length,0);assert.deepEqual(state.encounterDirector.live,{});
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 bus.emit('save:loaded',{});assert.equal(bodies(state).length,0);
});

test('continuous membership retains the rescue; hard exit clears continuation',async t=>{
 const {state,bus,saver}=fixture(t);
 bus.emit('sector:exit',{sectorId:SECTOR,continuous:true});
 state.world.currentSectorId='sector_helios_prime';
 bus.emit('sector:enter',{sectorId:'sector_helios_prime',continuous:true});
 assert.ok(state.encounterDirector.live[ID]);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.ok(state.encounterDirector.live[ID]);assert.equal(bodies(state).length,1);
 bus.emit('sector:exit',{sectorId:'sector_helios_prime'});
 assert.equal(state.encounterDirector.live[ID],undefined);
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(bodies(state).length,0);
});

test('native failure cannot masquerade as zero-speed rescue or serialize invalid motion',t=>{
 const {state,live,body,d,bus,events}=fixture(t);
 const owner={},receipt=markPhysicsBodyNativeFailure(body,owner);
 body.vel.x=0;body.vel.z=0;
 kiln.tick(d,live,state,0);bus.emit('save:started',{});
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 clearPhysicsBodyNativeFailure(body,owner,receipt);
 body.vel.x=24;body.hull=37;bus.emit('save:started',{});
 assert.equal(state.encounterDirector.stats.openRunawayKiln.hull,37);
 body.pos.x=NaN;bus.emit('save:started',{});assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
});

test('malformed, stale, other-run, terminal and inherited records fail closed',t=>{
 const {state,bus}=fixture(t);bus.emit('save:started',{});
 const good=structuredClone(state.encounterDirector.stats.openRunawayKiln);
 const invalid=[null,[],{...good,schemaVersion:2},{...good,seed:1},{...good,capturedAt:good.capturedAt+1},{...good,elapsed:-1},{...good,hull:0},{...good,hull:Infinity},{...good,pos:{x:NaN,z:0}},{...good,struck:2},{...good,encounterId:'__proto__'},{...good,currentSectorId:'elsewhere'},Object.create(good)];
 for(const row of invalid){delete state.encounterDirector.stats.openRunawayKiln;state.encounterDirector.stats.openRunawayKiln=row;bus.emit('save:loaded',{});assert.equal(bodies(state).length,0);assert.equal(state.encounterDirector.live[ID],undefined);assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);}
 state.story.depthProgramEncounters={schemaVersion:1,completed:{[SHAPE]:{encounterId:ID,outcome:'lost'}},history:[]};
 state.encounterDirector.stats.openRunawayKiln=good;bus.emit('save:loaded',{});assert.equal(bodies(state).length,0);
});

test('recycled or foreign numeric IDs never capture, warn, retire or reward the new body',t=>{
 const {state,live,body,d,bus,sim,events}=fixture(t);
 d.helpers.removeEntity(body.id,{immediate:true});
 const foreign=sim.spawn({type:'payload',pos:{x:1,z:2},hull:70,hullMax:70});
 assert.equal(foreign.id,body.id,'fixture genuinely recycles the ID');
 foreign.data={...body.data,worldRecordId:'foreign-owner'};
 kiln.event(d,live,state,'playerHitSquad',{targetId:foreign.id});
 bus.emit('save:started',{});assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 kiln.tick(d,live,state,0);
 assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome,'lost');
 assert.equal(foreign.hull,70);assert.equal(foreign.alive,true);assert.equal(foreign.data.despawnAt,undefined);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});


test('restored zero-speed projection cannot settle until native dynamic readiness',async t=>{
 const {state,bus,d,saver,events}=fixture(t,[physics]);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 const live=state.encounterDirector.live[ID],body=state.entities.get(live.vars.crucibleId),velocity={...body.vel};
 body.vel.x=0;body.vel.z=0;
 kiln.tick(d,live,state,state.simTime);
 assert.ok(state.encounterDirector.live[ID]);assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
 bus.emit('save:started',{});assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 body.vel.x=velocity.x;body.vel.z=velocity.z;
 const native=await nativeFor(state);
 native.step(1/60,state.tick+1);
 kiln.tick(d,live,state,state.simTime);assert.ok(state.encounterDirector.live[ID]);
});

test('save reads current native scalars after save:started listeners, not an earlier frame',async t=>{
 const {state,body,bus,saver}=fixture(t,[physics]);
 const native=await nativeFor(state);
 const before=body.pos.x;
 bus.on('save:started',()=>{native.step(1/60,1);state.tick=1;state.simTime=1/60;});
 assert.equal(saver.save('quick'),true);const expected=pose(body);
 assert.notEqual(body.pos.x,before);assert.equal(await saver.load('quick'),true);
 assert.equal(state.simTime,1/60);assert.deepEqual(pose(bodies(state)[0]),expected);
});

test('actual paced save unfreeze retakes current native scalars at the serialization boundary',async t=>{
 const {state,body,saver}=fixture(t,[physics]);
 const native=await nativeFor(state);
 state.mode='paused';
 // Scheduling-only fixture: force one existing generator yield, then unfreeze there.
 // The real serializer, fallback recapture, encoder, storage and load remain unchanged.
 const originalSteps=saver._serializeDataSteps,originalYield=saver._restoreFrameYield;
 saver._serializeDataSteps=function*(){const it=originalSteps.call(this);const first=it.next();const until=performance.now()+25;while(performance.now()<until){};yield first.value;return yield*it;};
 let unfroze=false;
 saver._restoreFrameYield=async()=>{if(!unfroze){unfroze=true;state.mode='flight';native.step(1/60,1);state.tick=1;state.simTime=1/60;}else await originalYield.call(saver);};
 assert.equal(await saver.saveAsync('quick'),true);assert.equal(unfroze,true);
 const expected=pose(body);
 saver._serializeDataSteps=originalSteps;saver._restoreFrameYield=originalYield;
 assert.equal(await saver.load('quick'),true);assert.equal(state.simTime,1/60);
 assert.deepEqual(pose(bodies(state)[0]),expected);
});

test('a real missing crucible settles lost and stays absent after Save/Continue',async t=>{
 const {state,body,live,d,saver,events}=fixture(t);
 d.helpers.removeEntity(body.id,{immediate:true});kiln.tick(d,live,state,0);
 assert.equal(state.story.depthProgramEncounters.completed[SHAPE].outcome,'lost');
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(bodies(state).length,0);assert.equal(state.encounterDirector.live[ID],undefined);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});


test('immediate Save after load before native admission retains finite motion on a second load',async t=>{
 const {state,body,saver,events}=fixture(t);const expected=pose(body);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(saver.save('warmup'),true);assert.equal(await saver.load('warmup'),true);
 assert.deepEqual(pose(bodies(state)[0]),expected);assert.equal(bodies(state).length,1);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});

test('snapshot reads are pure detached projections and stale getter cannot read a new run',t=>{
 const {state,bus,body}=fixture(t);const stats=state.encounterDirector.stats;
 const getter=Object.getOwnPropertyDescriptor(stats,'openRunawayKiln').get;
 const first=getter(),second=getter();assert.deepEqual(first,second);assert.notEqual(first,second);
 first.pos.x=123;assert.notEqual(body.pos.x,123);assert.notEqual(second.pos.x,123);
 bus.emit('game:new',{});assert.equal(getter(),undefined);
});


test('inactive Save/Continue adds no continuity key or unrelated stats serialization drift',async t=>{
 const {state,bus,saver}=fixture(t);
 bus.emit('game:new',{});
 const before=JSON.stringify(state.encounterDirector.stats);
 assert.equal(Object.hasOwn(state.encounterDirector.stats,'openRunawayKiln'),false);
 assert.equal(saver.save('quick'),true);
 assert.equal(JSON.stringify(state.encounterDirector.stats),before);
 assert.equal(await saver.load('quick'),true);
 assert.equal(Object.hasOwn(state.encounterDirector.stats,'openRunawayKiln'),false);
 // Existing load normalization owns these two empty recency lists.
 assert.deepEqual(state.encounterDirector.stats,{...JSON.parse(before),recentFingerprints:[],recentVarietyKeys:[]});
});


import {physics} from '../src/core/physics.js';
import {tetherGameplay} from '../src/systems/tetherGameplay.js';
test('real attachment and Save owners release the transient Kiln line rather than bind a recycled endpoint',async t=>{
 const {state,sim,body,saver}=fixture(t,[physics,tetherGameplay]);
 sim.step(1/60); // Refresh the ordinary entity index before native admission.
 const p=sim.registry.get('physics');assert.equal(await p.prepareBackend(state),true);
 const kernel=getCombatKernel(sim.registry.ctx);
 const result=kernel.attachments.create({defId:'tether_standard',ownerId:state.playerId,targetId:body.id});
 assert.equal(result.ok,true,result.reason);
 assert.equal(p._sg02.attachments.size,1);
 // Canonical attachment is real; seed only the player-facing mirror, not a gameplay latch gesture.
 state.player.tether={active:true,targetId:body.id,attachmentId:result.attachment.id};
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(state.player.tether.active,false);assert.equal(state.player.tether.targetId,null);
 assert.equal(state.player.tether.attachmentId,null);
 assert.equal(Object.values(state.combat.attachments.byId).filter(a=>a.state==='active').length,0);
 assert.equal(sim.registry.get('tetherGameplay')._active,null);
 assert.equal(state.physicsRuntime.nativeRestore.exact,false,'transient reconstruction is not an exact whole-world native checkpoint');
 assert.equal(bodies(state).length,1);
 assert.equal(await p.prepareBackend(state),true);assert.equal(p._sg02.attachments.size,0);
 assert.equal([...p._sg02.records.values()].filter(r=>r.entity?.data?.storyPropKind==='runaway_kiln').length,1);
});


test('the eligible authored Forge approach targets actual Depot Three, not the first station',t=>{
 const {state,live,body,d,events}=fixture(t);
 const depot=state.world.activeSector.stations.find(e=>e.stationId==='station_depot3');
 assert.deepEqual({x:live.vars.ring.x,z:live.vars.ring.z},{x:depot.pos.x,z:depot.pos.z});
 assert.ok(Math.hypot(body.vel.x,body.vel.z)>23.9);
 kiln.tick(d,live,state,state.simTime);
 assert.equal(live.phase,'runaway');assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});


test('post-admission forged projections cannot capture or settle different native motion',async t=>{
 const {state,sim,saver,d,events}=fixture(t,[physics]);
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 const live=state.encounterDirector.live[ID],body=bodies(state)[0];
 const owner=await nativeFor(state);
 // One-body native laboratory isolates this provenance test from placed-scene contacts.
 owner.syncFromEntities([body]);owner.step(1/60,1);state.tick=1;state.simTime=1/60;
 const rec=owner.records.get(body.id),p=rec.body.translation(),v=rec.body.linvel();
 const origin=owner.getFrameOrigin();assert.ok(Math.hypot(v.x,v.z)>23);
 body.pos.x+=777;body.pos.z-=123;body.vel.x=0;body.vel.z=0;body.rot=2;body.angVel=7;
 const row=state.encounterDirector.stats.openRunawayKiln;
 assert.deepEqual(row.pos,{x:p.x+origin.x,z:p.z+origin.z});
 assert.deepEqual(row.vel,{x:v.x,z:v.z});assert.equal(row.rot||0,0);assert.equal(row.angVel,0);
 kiln.tick(d,live,state,state.simTime);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
 assert.equal(live.phase,'runaway');
 // Failed native construction closes both lanes even with old dynamic telemetry.
 const receipt=markPhysicsBodyNativeFailure(body,owner);
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 kiln.tick(d,live,state,state.simTime);assert.equal(live.phase,'runaway');
 clearPhysicsBodyNativeFailure(body,owner,receipt);
 // Body contract/revision mismatch cannot silently adopt the writable projection.
 body.physicsBody.revision++;
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 kiln.tick(d,live,state,state.simTime);assert.equal(live.phase,'runaway');
 body.physicsBody.revision--;
 // A new game tick without a completed owner step cannot settle, even if native is stopped.
 rec.body.setLinvel({x:0,y:0,z:0},true);state.tick++;
 kiln.tick(d,live,state,state.simTime);assert.equal(live.phase,'runaway');
 // Save still reads actual native state, not the stale telemetry or forged mirror.
 assert.equal(Math.hypot(state.encounterDirector.stats.openRunawayKiln.vel.x,state.encounterDirector.stats.openRunawayKiln.vel.z),0);
 // Retiring the owner leaves stale telemetry but no native authority.
 owner.dispose();
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 kiln.tick(d,live,state,state.simTime);assert.equal(live.phase,'runaway');
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});

test('unregistered native telemetry never upgrades a no-physics unit fixture to settlement authority',async t=>{
 const {state,live,body,d,events}=fixture(t);
 const owner=await createSg02DynamicBodyOwner({publishTelemetry:true});t.after(()=>owner.dispose());
 owner.syncFromEntities([body]);owner.step(1/60,1);state.tick=1;
 body.vel.x=0;body.vel.z=0;body.angVel=7;
 assert.equal(state.encounterDirector.stats.openRunawayKiln,undefined);
 kiln.tick(d,live,state,state.simTime);
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});


test('eligible approach with registered physics does not immediately reward admission',async t=>{
 const {state,body,live,d,events}=fixture(t,[physics]);
 const authored={...body.pos};const owner=await nativeFor(state);
 assert.ok(Math.hypot(body.pos.x-authored.x,body.pos.z-authored.z)<=5.001);
 kiln.tick(d,live,state,state.simTime);assert.equal(live.phase,'runaway');
 owner.step(1/60,1);state.tick=1;state.simTime=1/60;
 kiln.tick(d,live,state,state.simTime);assert.equal(live.phase,'runaway');
 assert.equal(events.filter(e=>e.name==='economy:grantCredits').length,0);
});

test('native rotation and angular velocity survive scalar reconstruction without trusting mirrors',async t=>{
 const {state,body,bus,saver}=fixture(t,[physics]);body.rot=0.4;body.angVel=0.7;
 const owner=await nativeFor(state);owner.syncFromEntities([body]);owner.step(1/60,1);state.tick=1;state.simTime=1/60;
 const expected=state.encounterDirector.stats.openRunawayKiln;
 assert.equal(expected.angVel,-owner.records.get(body.id).body.angvel().y);assert.ok(expected.angVel>0);assert.ok(expected.rot>0.4);
 body.rot=2;body.angVel=7;
 let restored;bus.on('save:loaded',()=>{restored=pose(bodies(state)[0]);});
 assert.equal(saver.save('quick'),true);assert.equal(await saver.load('quick'),true);
 assert.equal(restored.rot,expected.rot);assert.equal(restored.angVel,expected.angVel);
});
