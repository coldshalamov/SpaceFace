import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { pallasDriftNativeFixture } from './fixtures/pallas-drift-native.mjs';
import { PALLAS_REEF_CREW as C, PALLAS_REEF_INTAKE_ID as ID, reefBody } from '../src/data/pallasReefCrew.js';
import { reefDriftApproach, reefPose } from '../src/systems/pallasReefSource.js';

test('production jump departure and return retain original carrier custody, then resume Drift intake', {timeout:240000}, async t => {
 const h=await pallasDriftNativeFixture({worldUpdates:true});t.after(()=>h.close());
 const {state,sim}=h,source=()=>sim.helpers.salvage.source(C.sourceKey);
 const trace=[];
 const record=label=>{const carrier=reefBody(state,C.actors[2].id),section=reefBody(state,C.sectionId),station=state.entityList.find(e=>e.alive!==false&&e.type==='station'&&e.data?.stationId===C.homeStationId);trace.push({label,tick:state.tick,at:state.simTime,sector:state.world.currentSectorId,jump:state.jump.state,player:{...state.entities.get(state.playerId)?.pos},nativePlayer:reefPose(h.owner,state.entities.get(state.playerId)),carrier:carrier&&{id:carrier.id,pos:{...carrier.pos},generation:carrier.occupantGeneration},section:section&&{id:section.id,pos:{...section.pos}},nativeStation:station&&reefPose(h.owner,station),phase:state.traffic.pallasReefCrew?.phase,pool:source()?.remainingPool,intake:source()?.intake,ready:carrier&&reefDriftApproach(h.owner,carrier)?.ready});writeFileSync('return-route-trace.json',JSON.stringify(trace,null,2));};
 const runUntil=(predicate,limit)=>{for(let i=0;i<limit&&!predicate();i++)h.step();assert.ok(predicate(),`condition not reached after ${limit} native ticks`);};
 runUntil(()=>state.traffic.pallasReefCrew?.receipt,60*50);
 const carrier=reefBody(state,C.actors[2].id),section=reefBody(state,C.sectionId),receipt=structuredClone(state.traffic.pallasReefCrew.receipt);
 const line=sim.registry.get('combat').kernel.attachments.listForEntity(section.id,true).find(a=>a.ownerId===carrier.id);
 assert.ok(line);assert.deepEqual(source().remainingPool,C.pool);record('original-transferred');
 const outside='sector_sker_haven';assert.ok(state.world.sectors[C.sectorId].neighbors.includes(outside));
 const events=[];for(const name of ['jump:chargeStart','jump:chargeAbort','jump:start','jump:arrive'])sim.bus.on(name,p=>{events.push({name,p});writeFileSync('return-travel-events.json',JSON.stringify(events,null,2));});
 sim.bus.emit('world:requestJump',{targetSectorId:outside,via:'gate'});
 assert.equal(state.jump.state,'CHARGING');
 for(let i=0;i<60*12&&state.world.currentSectorId!==outside;i++)h.step();
 record('departure-attempt');assert.equal(state.world.currentSectorId,outside,'ordinary production travel must advance its real world clock');
 runUntil(()=>state.jump.state==='IDLE',60*30);h.step(3);record('outside-native');
 assert.deepEqual(source().remainingPool,C.pool);assert.equal(source().intake,null);assert.equal(state.economy.committedIntents?.[ID],undefined);
 assert.deepEqual(state.traffic.pallasReefCrew.receipt,receipt);
 const nativePlayer=reefPose(h.owner,state.entities.get(state.playerId));assert.ok(nativePlayer);assert.ok(Math.hypot(nativePlayer.pos.x-carrier.pos.x,nativePlayer.pos.z-carrier.pos.z)>1000,'player actually departed original work site');
 sim.bus.emit('world:requestJump',{targetSectorId:C.sectorId,via:'gate'});assert.equal(state.jump.state,'CHARGING');
 runUntil(()=>state.world.currentSectorId===C.sectorId,60*12);h.step(3);record('returned-native');writeFileSync('returned-save.json',JSON.stringify(sim.registry.get('save').serialize('drift-returned-native')));
 assert.deepEqual(source().remainingPool,C.pool);assert.equal(source().intake,null);assert.deepEqual(state.traffic.pallasReefCrew.receipt,receipt);
 assert.equal(reefBody(state,C.actors[2].id),carrier);assert.equal(reefBody(state,C.sectionId),section);
 assert.ok(sim.registry.get('combat').kernel.attachments.listForEntity(section.id,true).some(a=>a.id===line.id&&a.ownerId===carrier.id));
 for(let i=0;i<60*360&&!source().intake;i++){h.step();if(i%600===0)record('resume');}
 record('final');assert.ok(source().intake,'genuine returned native custody must resume physical intake');assert.equal(source().intake.receiptId,ID);assert.deepEqual(source().remainingPool,{});
});
