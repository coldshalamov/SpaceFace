import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3, computeAutopilotGuidance, resolveAutopilotTarget } from '../src/systems/flightV3.js';
import { SpatialHash } from '../src/core/spatialHash.js';
import { input } from '../src/systems/input.js';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/forge-approach-dressing.json',import.meta.url)));
function guidanceFor(dressing) {
 const player={...structuredClone(fixture.player),pos:{x:fixture.stall.x,z:fixture.stall.z-60},vel:{x:0,z:0}};
 const station=structuredClone(fixture.station),list=[player,station,...dressing];
 const state={mode:'flight',playerId:player.id,entityList:list,entities:new Map(list.map(e=>[e.id,e]))};
 const autopilot={active:true,targetEntityId:station.id};
 const target=resolveAutopilotTarget(state,autopilot);
 const distance=Math.hypot(target.x-player.pos.x,target.z-player.pos.z);
 return {state,player,target,autopilot,distance,read:()=>computeAutopilotGuidance(state,player,target,distance,20,autopilot)};
}

test('the real Forge course sees native solid FX dressing through the spatial query',()=>{
 const h=guidanceFor(structuredClone(fixture.dressing));
 h.state.spatialHash=new SpatialHash(128);
 h.state.spatialHash.rebuild(h.state.entityList);
 assert.equal(h.target.entity.data.stationId,'station_forge');
 assert.equal(h.target.dockingStage,'corridor-mouth');
 assert.ok(Math.abs(h.target.x+492.687145883789)<1e-6);
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

test('native flight rounds the captured Forge dressing and reaches the real dock anchor',async()=>{
 const sim=createSimulation({seed:4242,systems:[input,flightV3,physics]});
 try{
  const state=sim.state;state.mode='flight';state.world.currentSectorId='sector_vesta_forge';state.settings.gameplay.physicsBackend='rapier-dynamic';state.settings.gameplay.flightBackend='v3';
  const playerSpec=structuredClone(fixture.player);
  // Initial fixture staging only: begin before the observed stall on that same approach.
  playerSpec.pos={x:fixture.stall.x,z:fixture.stall.z-160};playerSpec.vel={x:0,z:0};
  playerSpec.rot=Math.atan2(fixture.station.pos.z-playerSpec.pos.z,fixture.station.pos.x-playerSpec.pos.x);
  const player=sim.spawn(playerSpec);state.playerId=player.id;
  const station=sim.spawn(structuredClone(fixture.station));
  const props=fixture.dressing.map(spec=>sim.spawn(structuredClone(spec)));
  Object.assign(state.nav.autopilot,{active:true,targetEntityId:station.id,target:{...station.pos},label:'Forge Foundry',arrivalRadius:20,status:'engaged'});
  assert.equal(await sim.registry.get('physics').prepareBackend(state,{}),true);
  const native=sim.registry.get('physics')._sg02;
  assert.equal(native.records.get(props.find(e=>e.id===2309).id).colliders.length,24,'same original measured Hopper compound');
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
