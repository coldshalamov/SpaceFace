import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3, computeAutopilotGuidance, resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { input } from '../src/systems/input.js';
import { insertDressingRow } from '../src/world/dressingTable.js';
import { currentSolidDressingRows, physicalObstacleRadius, queryNearbyPhysicalObstacles } from '../src/core/physicalObstacleQuery.js';
import { resolveCollisionProxyManifest } from '../src/data/collisionProxyManifests.js';
import { markPhysicsBodyNativeFailure, clearPhysicsBodyNativeFailure } from '../src/core/physicsAuthority.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/forge-approach-dressing.json',import.meta.url)));
const continued=JSON.parse(fs.readFileSync(new URL('./fixtures/forge-continue-793.json',import.meta.url)));
function guidanceFor(dressing) {
 const player={...structuredClone(fixture.player),pos:{x:fixture.stall.x,z:fixture.stall.z-60},vel:{x:0,z:0}};
 const station=structuredClone(fixture.station),list=[player,station];
 const state={mode:'flight',playerId:player.id,world:{currentSectorId:'sector_vesta_forge'},entityList:list,entities:new Map(list.map(e=>[e.id,e]))};
 const props=dressing.map(spec=>{
  const row=insertDressingRow(state,{...spec,homeSectorId:'sector_vesta_forge'});
  if(spec.occupantGeneration!=null)row.occupantGeneration=spec.occupantGeneration;
  return row;
 });
 state.spatialHash=new SpatialHash(128);
 state.spatialHash.rebuild(list);
 const autopilot={active:true,targetEntityId:station.id};
 const target=resolveAutopilotTarget(state,autopilot);
 const distance=Math.hypot(target.x-player.pos.x,target.z-player.pos.z);
 return {state,player,target,autopilot,distance,props,read:()=>computeAutopilotGuidance(state,player,target,distance,20,autopilot)};
}

test('the real Forge course sees cold solid dressing omitted from the core spatial hash',()=>{
 const h=guidanceFor(structuredClone(fixture.dressing));
 h.state.spatialHash=new SpatialHash(128);
 h.state.spatialHash.rebuild(h.state.entityList);
 assert.equal(h.target.entity.data.stationId,'station_forge');
 assert.equal(h.target.dockingStage,'corridor-mouth');
 assert.ok(Math.abs(h.target.x+492.687145883789)<1e-6);
 const hopper=h.props.find(e=>e.id===2309);
 assert.equal(h.state.entities.has(hopper.id),false);
 assert.equal(h.state.entityList.includes(hopper),false);
 assert.equal(h.state.spatialHash.queryRadius(hopper.pos.x,hopper.pos.z,100,[]).includes(hopper),false);
 assert.equal(h.read().avoiding,true,'the Ore Hopper must be in the physical obstacle set');
 assert.ok(Math.abs(h.autopilot._avoidanceSide)===1);
});

for(const kind of ['noncolliding','scripted','visual','ghost'])test(`${kind} FX remains outside autopilot obstacle guidance`,()=>{
 const hopper=structuredClone(fixture.dressing.find(e=>e.id===2309));
 if(kind==='noncolliding')hopper.collides=false;
 if(kind==='scripted')hopper.physicsBody=false;
 if(kind==='visual')delete hopper.physicsBody;
 if(kind==='ghost')hopper.physicsBody.material='projectile';
 assert.equal(guidanceFor([hopper]).read().avoiding,false);
});

function manualWarning(dressing, host=null) {
 const h=guidanceFor([dressing]);
 h.player.vel={x:0,z:50};
 h.state.simTime=0;
 const owner=host||Object.create(flightV3);
 const warnings=[];
 owner.bus={emit:(name,p)=>{if(name==='flight:sweptHull')warnings.push({...p});}};
 const velocity={...h.player.vel};
 const advisory=owner._publishSweptHullAdvisory(h.player,h.state,{}, {handFlown:true,controlsActive:true});
 assert.deepEqual(h.player.vel,velocity,'the manual warning never commands motion');
 return {advisory,warnings,owner};
}

test('manual swept warning preserves the real solid dressing identity and fresh generation',()=>{
 const hopper=structuredClone(fixture.dressing.find(e=>e.id===2309));
 hopper.occupantGeneration=17;
 const first=manualWarning(hopper);
 assert.equal(first.advisory.active,true);
 assert.equal(first.advisory.contactId,2309);
 assert.equal(first.advisory.contactType,'fx');
 assert.equal(first.warnings[0].contactGeneration,17);
 assert.ok(first.advisory.contactRadius>=hopper.radius);
 const replacement={...structuredClone(hopper),occupantGeneration:18};
 const next=manualWarning(replacement,first.owner);
 assert.equal(next.warnings.length,1,'a replacement life warns immediately instead of retaining an old id-only face');
 assert.equal(next.warnings[0].contactId,2309);
 assert.equal(next.warnings[0].contactGeneration,18);
});

for(const kind of ['noncolliding','scripted','visual','ghost'])test(`${kind} FX produces no manual swept warning`,()=>{
 const hopper=structuredClone(fixture.dressing.find(e=>e.id===2309));
 if(kind==='noncolliding')hopper.collides=false;
 if(kind==='scripted')hopper.physicsBody=false;
 if(kind==='visual')delete hopper.physicsBody;
 if(kind==='ghost')hopper.physicsBody.material='projectile';
 const result=manualWarning(hopper);
 assert.equal(result.advisory.active,false);
 assert.equal(result.warnings.length,0);
});

test('physical discovery filters the current nearby cohort, dedupes core overlap and reads live admission',()=>{
 const h=guidanceFor(structuredClone(fixture.dressing));
 const hopper=h.props.find(e=>e.id===2309);
 const remote=insertDressingRow(h.state,{...structuredClone(hopper),id:9001,homeSectorId:'sector_elsewhere'});
 const far=insertDressingRow(h.state,{...structuredClone(hopper),id:9002,pos:{x:1e6,z:1e6}});
 // Compatibility overlap must not count a native body twice.
 h.state.entityList.push(hopper);
 h.state.entities.set(hopper.id,hopper);
 h.state.spatialHash.rebuild(h.state.entityList);
 const read=()=>queryNearbyPhysicalObstacles(h.state,hopper.pos,40,[]);
 assert.equal(read().filter(e=>e.id===hopper.id).length,1);
 assert.equal(read().includes(remote),false);
 assert.equal(read().includes(far),false);
 assert.equal(currentSolidDressingRows(h.state).includes(remote),false);
 far.collides=false;
 assert.equal(currentSolidDressingRows(h.state).includes(far),false,'admission is live even without a membership change');
 hopper.occupantGeneration=99;
 assert.equal(read().find(e=>e.id===hopper.id).occupantGeneration,99);
 h.state.world.currentSectorId='sector_elsewhere';
 assert.equal(currentSolidDressingRows(h.state).includes(remote),true,'sector changes invalidate the cohort');
 assert.equal(currentSolidDressingRows(h.state).includes(hopper),false);
});

test('a compact native hull beyond its primitive fallback remains in the near obstacle query',()=>{
 const h=guidanceFor([]);
 const spec=structuredClone(fixture.dressing.find(e=>e.id===2309));
 const manifest=resolveCollisionProxyManifest(spec);
 spec.physicsBody.collisionProxyManifest={...manifest,id:'compact-extent-regression',
  compactHull:[{x:4,z:0},{x:-4,z:0},{x:0,z:0.1}]};
 const row=insertDressingRow(h.state,spec);
 assert.ok(physicalObstacleRadius(row)>=row.radius*4);
 assert.equal(queryNearbyPhysicalObstacles(h.state,{x:row.pos.x+row.radius*3,z:row.pos.z},1,[]).includes(row),true);
});

test('a recorded failed native dressing body is neither an avoidance obstacle nor a swept warning',()=>{
 const h=guidanceFor([structuredClone(fixture.dressing.find(e=>e.id===2309))]);
 const hopper=h.props[0],owner={};
 assert.equal(h.read().avoiding,true);
 const receipt=markPhysicsBodyNativeFailure(hopper,owner);
 assert.equal(currentSolidDressingRows(h.state).includes(hopper),false);
 assert.equal(physicalObstacleRadius(hopper),null);
 assert.equal(h.read().avoiding,false);
 h.player.vel={x:0,z:50};h.state.simTime=0;
 const flight=Object.create(flightV3);
 flight.bus={emit:()=>assert.fail('a missing physical body must not warn')};
 assert.equal(flight._publishSweptHullAdvisory(h.player,h.state,{}, {handFlown:true,controlsActive:true}).active,false);
 clearPhysicsBodyNativeFailure(hopper,owner,receipt);
 assert.equal(currentSolidDressingRows(h.state).includes(hopper),true,'successful native admission restores the same physical row');
 assert.equal(h.read().avoiding,true);
});

for(const continuation of [false,true])test(`native ${continuation?'captured 793 Continue':'pre-stall approach'} reaches the real dock anchor with cold dressing`,async()=>{
 const sim=createSimulation({seed:4242,systems:[input,flightV3,physics]});
 try{
  const state=sim.state;state.mode='flight';state.world.currentSectorId='sector_vesta_forge';state.settings.gameplay.physicsBackend='rapier-dynamic';state.settings.gameplay.flightBackend='v3';
  const playerSpec=structuredClone(continuation?continued.player:fixture.player);
  // Initial fixture staging only: begin before the observed stall on that same approach.
  if(!continuation){
   playerSpec.pos={x:fixture.stall.x,z:fixture.stall.z-160};playerSpec.vel={x:0,z:0};
   playerSpec.rot=Math.atan2(fixture.station.pos.z-playerSpec.pos.z,fixture.station.pos.x-playerSpec.pos.x);
  }
  const player=sim.spawn(playerSpec);state.playerId=player.id;
  const station=sim.spawn(structuredClone(fixture.station));
  // Continue regenerates these fixed bodies in the cold dressing table with fresh IDs.
  const sourceDressing=continuation?continued.dressing:fixture.dressing;
  const props=sourceDressing.map(spec=>{
   const restored=structuredClone(spec);delete restored.id;
   return insertDressingRow(state,{...restored,homeSectorId:state.world.currentSectorId});
  });
  Object.assign(state.nav.autopilot,{active:true,targetEntityId:station.id,target:{...station.pos},label:'Forge Foundry',arrivalRadius:20,status:'engaged'});
  assert.equal(await sim.registry.get('physics').prepareBackend(state,{}),true);
  const native=sim.registry.get('physics')._sg02;
  const hopper=props[sourceDressing.findIndex(e=>e.data.name==='Ore Hopper')];
  assert.equal(state.entities.has(hopper.id),false);
  assert.equal(native.records.get(hopper.id).colliders.length,24,'same original measured Hopper compound');
  let arrived=false,dockAvailable=false,maxZ=player.pos.z,solidContacts=0;
  sim.bus.on('dock:range',p=>{if(p.stationId==='station_forge'&&p.inRange)dockAvailable=true;});
  for(let tick=0;tick<2400;tick++){
   sim.step(SIM_DT);
   maxZ=Math.max(maxZ,player.pos.z);
   const records=native.sampleSolidContacts(player.id);
   solidContacts+=records.filter(r=>props.some(e=>e.id===r.targetId)).length;
   if(state.nav.autopilot.status==='arrived')arrived=true;
   if(dockAvailable)break;
  }
  assert.ok(maxZ>fixture.stall.z+250,`physical course must pass the hopper; max z ${maxZ}; final ${JSON.stringify({pos:player.pos,vel:player.vel,rot:player.rot,nav:state.nav.autopilot,solidContacts})}`);
  assert.equal(solidContacts,0,'avoidance must not rely on ramming the original dressing');
  assert.equal(dockAvailable,true,`ordinary physical docking gate should admit, current ${JSON.stringify({nav:state.nav.autopilot,pos:player.pos,vel:player.vel,rot:player.rot,arrived})}`);
  const anchor=resolveAutopilotTarget(state,{targetEntityId:station.id});
  assert.ok(Math.hypot(player.pos.x-anchor.x,player.pos.z-anchor.z)<=anchor.arrivalRadius+1);
  assert.ok(Math.hypot(player.vel.x,player.vel.z)<12);
  for(const prop of props)assert.equal(prop.alive,true,'terrain is preserved');
 }finally{sim.dispose();}
});
