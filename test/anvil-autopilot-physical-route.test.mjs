import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation,SIM_DT} from '../src/core/sim.js';
import {physics} from '../src/core/physics.js';
import {flightV3} from '../src/systems/flightV3.js';
import {input,applyFlightKeyEvent} from '../src/systems/input.js';
import {fields} from '../src/systems/fields.js';
import {planetRuntime} from '../src/systems/planetRuntime.js';
import {world} from '../src/systems/world.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {PLANET_FLAGS,PLANET_SITE} from '../src/data/planets.js';
import {FIELD_FLAGS} from '../src/data/fields.js';

test('local autopilot settles safely at Anvil and stays under control', async t=>{
 const old=[PLANET_FLAGS.enabled,FIELD_FLAGS.enabled]; PLANET_FLAGS.enabled=true; FIELD_FLAGS.enabled=true;
 const sim=createSimulation({seed:424214,systems:[{...world,update(){}},input,flightV3,fields,planetRuntime,physics]});
 t.after(()=>{sim.dispose();[PLANET_FLAGS.enabled,FIELD_FLAGS.enabled]=old;});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=PLANET_SITE.sectorId;s.settings.gameplay.physicsBackend='rapier-dynamic';sim.step();
 const c=s.planet.center; const target={x:c.x+1708,z:c.z};
 const p=sim.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:c.x+3000,z:c.z},rot:Math.PI}),isPlayer:true});s.playerId=p.id;
 assert.equal(await sim.registry.get('physics').prepareBackend(s),true);
 sim.bus.emit('ui:setCourse',{pos:target,label:'test',arrivalRadius:80,autopilot:true});
 let arrived=-1,min=Infinity;
 for(let i=0;i<12000;i++){sim.step(SIM_DT);min=Math.min(min,Math.hypot(p.pos.x-c.x,p.pos.z-c.z));if(s.nav.autopilot.status==='arrived'&&arrived<0)arrived=i;if(arrived>=0 && i-arrived===1800)break;}
 console.log({arrived,min,radius:Math.hypot(p.pos.x-c.x,p.pos.z-c.z),dist:Math.hypot(p.pos.x-target.x,p.pos.z-target.z),speed:Math.hypot(p.vel.x,p.vel.z),nav:s.nav.autopilot});
 assert.ok(arrived>=0);assert.ok(Math.hypot(p.pos.x-target.x,p.pos.z-target.z)<150,'must stay near arrival');
 s.world.currentSectorId='sector_dione_lane';
 for(let i=0;i<3;i++)sim.step(SIM_DT);
 assert.equal(s.nav.autopilot.active,false,'leaving the planet sector releases the hold');
});

test('public Anvil chart course rounds the planet to the Orchard side', async t=>{
 const {buildSystemModel,systemZoneTarget,commitCoursePayload}=await import('../src/ui/galaxyMap.js');
 const {anvilOrchardFramePosition}=await import('../src/data/planets.js');
 const old=[PLANET_FLAGS.enabled,FIELD_FLAGS.enabled];PLANET_FLAGS.enabled=true;FIELD_FLAGS.enabled=true;
 const sim=createSimulation({seed:424214,systems:[{...world,update(){}},input,flightV3,fields,planetRuntime,physics]});
 t.after(()=>{sim.dispose();[PLANET_FLAGS.enabled,FIELD_FLAGS.enabled]=old;});
 const s=sim.state;s.mode='flight';s.world.currentSectorId=PLANET_SITE.sectorId;s.settings.gameplay.physicsBackend='rapier-dynamic';sim.step();
 const c=s.planet.center, frame=anvilOrchardFramePosition(c), angle=Math.atan2(frame.z-c.z,frame.x-c.x);
 const p=sim.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:c.x-Math.cos(angle)*3000,z:c.z-Math.sin(angle)*3000},rot:angle}),isPlayer:true});s.playerId=p.id;
 assert.equal(await sim.registry.get('physics').prepareBackend(s),true);
 const model=buildSystemModel(s,PLANET_SITE.sectorId), zone=model.zones.find(z=>z.id===PLANET_SITE.zoneId);
 const course=commitCoursePayload(s,systemZoneTarget(zone,PLANET_SITE.sectorId,p.pos));
 assert.equal(course.planetaryApproach,PLANET_SITE.id);
 sim.bus.emit('ui:setCourse',course);
 let arrived=-1,min=Infinity;
 for(let i=0;i<24000;i++){sim.step(SIM_DT);min=Math.min(min,Math.hypot(p.pos.x-c.x,p.pos.z-c.z));if(s.nav.autopilot.arrivalHolding&&arrived<0)arrived=i;if(arrived>=0&&i-arrived===600)break;}
 const finalRadius=Math.hypot(p.pos.x-c.x,p.pos.z-c.z),frameDistance=Math.hypot(p.pos.x-frame.x,p.pos.z-frame.z);
 console.log({arrived,min,finalRadius,frameDistance,nav:s.nav.autopilot});
 assert.ok(arrived>=0,'physical course reaches the destination');
 assert.ok(min>PLANET_SITE.bands.sling+PLANET_SITE.hysteresis,'route stays outside the hazardous sling band');
 assert.ok(frameDistance<650,'arrival is on the working frame side');
 applyFlightKeyEvent(sim.registry.get('input'),{code:'KeyW',pressed:true});
 sim.step(SIM_DT);
 assert.equal(s.nav.autopilot.active,false,'manual flight immediately releases the station keeping');
 assert.equal(s.nav.autopilot.status,'manual');
});
