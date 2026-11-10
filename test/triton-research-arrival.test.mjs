import test from 'node:test';
import assert from 'node:assert/strict';
import {livingPoiBehaviors} from '../src/systems/livingPoiBehaviors.js';
import {VoiceQueue} from '../src/ui/voiceArbiter.js';
import {createBus} from '../src/core/eventBus.js';
import {SECTORS} from '../src/data/sectors.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
import {tritonResearchLine} from '../src/world/tritonResearchArrival.js';
const sid='sector_triton_wake', pid='poi_triton_field_lab';
const sector=SECTORS.find(s=>s.id===sid), lab=sector.pois.find(p=>p.id===pid);
const global=p=>sectorLocalToGlobalForSector(p,sid);
function boot() {
 const bus=createBus(), cues=[], offers=[], events=[];
 const player={id:1,alive:true,pos:global(lab.pos)};
 const body={id:2,alive:true,pos:global(lab.pos),data:{poiId:pid}};
 const state={meta:{seed:4242},simTime:0,mode:'flight',playerId:1,
   entities:new Map([[1,player],[2,body]]),factions:{},onboarding:{active:false},
   world:{currentSectorId:sid,sectors:{[sid]:sector},
     activeSector:{stations:[],fields:[],gates:[],pois:[{id:2,poiId:pid,pos:body.pos}]}}};
 const system=Object.create(livingPoiBehaviors);
 system.init({state,bus,helpers:{voice:{say:c=>{cues.push(c);bus.emit('voice:surface',c);return true;}}}});
 system.planSector(sid);
 bus.on('mission:offered',p=>offers.push(p));bus.on('poi:behaviorGuidance',p=>events.push(p));
 const row=()=>state.livingPoiBehaviors.activeByZone['authored:'+pid];
 const move=(x,z)=>{player.pos=global({x:lab.pos.x+x,z:lab.pos.z+z});system.update();};
 const scan=(x,z)=>{player.pos=global({x:lab.pos.x+x,z:lab.pos.z+z});state.simTime+=4;
   bus.emit('scan:pulse',{pos:player.pos});};
 const finish=()=>{scan(-200,0);scan(0,200);scan(200,0);};
 return {state,bus,system,cues,offers,events,player,body,row,move,scan,finish};
}
test('ordinary approach identifies the distinct Archive site once without earning research',()=>{
 const h=boot();h.move(301,0);assert.equal(h.cues.length,0);h.move(250,0);
 assert.match(h.cues[0]?.text,/ARCHIVE FIELD LAB.*Optional/);assert.match(h.cues[0].text,/300 WU.*180 WU/);
 assert.equal(h.row().progress,0);assert.equal(h.offers.length,0);
 h.move(301,0);h.move(250,0);h.system.update();assert.equal(h.cues.length,1);
});
test('paused, docked, tutorial, absent and dead lab arrivals remain quiet',()=>{
 for(const condition of ['paused','docked','tutorial','absent','dead','wrong','deadPlayer','nonfinite']) {
   const h=boot();
   if(condition==='paused')h.state.mode='pause';
   if(condition==='docked')h.state.ui={docked:true};
   if(condition==='tutorial')h.state.onboarding={active:true,finished:false};
   if(condition==='absent')h.state.entities.delete(2);
   if(condition==='dead')h.body.alive=false;
   if(condition==='wrong')h.body.data.poiId='poi_triton_watcher';
   if(condition==='deadPlayer')h.player.alive=false;
   if(condition==='nonfinite')h.player.pos.x=NaN;
   h.system.update();assert.equal(h.cues.length,0,condition);
 }
 const h=boot();h.state.onboarding={active:true};h.system.update();h.state.onboarding.finished=true;h.system.update();
 assert.equal(h.cues.length,1);
});
test('close sample explains rejection with bounded repeat feedback and no extra progress',()=>{
 const h=boot();h.move(200,0);h.scan(-200,0);const n=h.cues.length;
 h.scan(-150,0);assert.equal(h.row().progress,1);assert.equal(h.cues.length,n+1);
 assert.match(h.cues.at(-1).text,/Same baseline; no new reading/);
 h.bus.emit('scan:pulse',{pos:h.player.pos});assert.equal(h.cues.length,n+1);
 assert.equal(h.offers.length,0);
});
test('arbitrary qualifying positions remain valid and the actual lead names the separate Wake desk',()=>{
 const h=boot();h.scan(-125,-125);h.scan(125,-125);h.scan(0,125);
 assert.equal(h.row().status,'resolved');assert.equal(h.offers.length,1);
 assert.equal(h.offers[0].stationId,'station_triton');assert.equal(h.offers[0].type,'recon_scan');
 assert.notEqual(h.offers[0].destSectorId,sid);
 assert.match(h.cues.at(-1).text,/Three bearings agree.*Triton Wake Lab/);
});
test('outcome is not immediately mistaken for a return; later echo visit speaks once',()=>{
 const h=boot();h.move(0,0);h.finish();const n=h.cues.length;h.system.update();assert.equal(h.cues.length,n);
 h.move(301,0);h.move(250,0);assert.equal(h.cues.length,n+1);
 assert.match(h.cues.at(-1).text,/stabilized echo still holds/);
 h.move(301,0);h.move(250,0);assert.equal(h.cues.length,n+1);assert.equal(h.offers.length,1);
});
test('sector departure suspends guidance and stale entry cannot restore presence',()=>{
 const h=boot();h.bus.emit('sector:exit',{sectorId:sid});h.system.update();assert.equal(h.cues.length,0);
 h.state.world.enterSerial=7;h.bus.emit('sector:enter',{sectorId:sid,enterEpoch:6});h.system.update();assert.equal(h.cues.length,0);
 h.bus.emit('sector:enter',{sectorId:sid,enterEpoch:7});h.system.update();assert.equal(h.cues.length,1);
 h.bus.emit('sector:exit',{sectorId:sid});h.state.world.currentSectorId='sector_veil_nebula';h.system.update();assert.equal(h.cues.length,1);
});
test('Continue retains quiet arrival/return keys using the existing serialization owner',()=>{
 const h=boot();h.move(0,0);h.finish();h.move(301,0);h.move(200,0);
 const saved=h.system.serialize();assert.equal(JSON.stringify(saved).includes('_tritonInside'),false);
 const n=h.cues.length;h.system.deserialize(saved);h.system.planSector(sid);h.system.update();
 assert.equal(h.cues.length,n);assert.equal(h.row().status,'aftermath');assert.equal(h.offers.length,1);
 // Old schema-2 saves have no presentation keys; they still offer one honest return cue.
 for(const k of Object.keys(saved.entered))if(k.includes(':triton:'))delete saved.entered[k];
 h.system.deserialize(saved);h.system.planSector(sid);h.system.update();
 assert.equal(h.cues.length,n+1);assert.match(h.cues.at(-1).text,/echo still holds/);
});
test('resolved sector leave/return observes the echo without requiring a radial flyout',()=>{
 const h=boot();h.move(0,0);h.finish();const n=h.cues.length;
 h.bus.emit('sector:exit',{sectorId:sid});h.system.update();assert.equal(h.cues.length,n);
 h.bus.emit('sector:enter',{sectorId:sid});h.system.update();
 assert.equal(h.cues.length,n+1);assert.match(h.cues.at(-1).text,/echo still holds/);
 h.bus.emit('sector:exit',{sectorId:sid});h.bus.emit('sector:enter',{sectorId:sid});h.system.update();
 assert.equal(h.cues.length,n+1);assert.equal(h.offers.length,1);
});
test('partial Continue resets only existing survey progress and rejected scan recovers guidance',()=>{
 const h=boot();h.move(0,0);h.scan(-200,0);const saved=h.system.serialize(), n=h.cues.length;
 h.system.deserialize(saved);h.system.planSector(sid);h.system.update();
 assert.equal(h.row().progress,0);assert.equal(h.cues.length,n);
 h.scan(-200,0);h.scan(-200,0);assert.equal(h.row().progress,1);
 assert.match(h.cues.at(-1).text,/Same baseline/);
});
test('expired echo gives one fresh-work invitation on replan, without claiming new work',()=>{
 const h=boot();h.move(0,0);h.finish();h.state.simTime=3600;h.system.planSector(sid,{dayIndex:6});h.system.update();
 assert.match(h.cues.at(-1).text,/old echo has faded/);assert.equal(h.row().progress,0);assert.equal(h.offers.length,1);
 const n=h.cues.length;h.move(301,0);h.move(200,0);assert.equal(h.cues.length,n);
});
test('no desk emission means no invented lead or commodity settlement',()=>{
 const h=boot();h.system._emitMissionLead=()=>false;h.finish();
 assert.equal(h.offers.length,0);assert.match(h.cues.at(-1).text,/No research lead posted/);
 assert.doesNotMatch(h.cues.at(-1).text,/comparison.*settled|Triton Wake Lab’s contracts desk/);
 assert.doesNotMatch(tritonResearchLine({...h.row(),stationId:'other'},'outcome',{leadEmitted:true}),/Triton Wake Lab’s contracts desk/);
});
test('real voice queue can expire an invitation without consuming it; retry surfaces after story',()=>{
 const h=boot(), queue=new VoiceQueue();
 h.system.helpers.voice={say:cue=>!!queue.enqueue(cue,h.state.simTime*1000)};
 queue.enqueue({id:'story',channel:'story',text:'Story holds floor',ttl:12},0);queue.step(0);
 h.move(0,0);const key=h.row().behaviorId;
 assert.equal(h.state.livingPoiBehaviors.entered[key],undefined,'enqueue is not delivery');
 queue.step(8100);assert.equal(queue.active.id,'story');
 h.state.simTime=8.1;h.system.update();
 h.state.simTime=12.1;const surfaced=queue.step(12100);
 assert.match(surfaced.text,/scan 3 positions.*300 WU.*180 WU/);
 h.bus.emit('voice:surface',surfaced);assert.equal(h.state.livingPoiBehaviors.entered[key],true);
 queue.step(12116);assert.equal(queue.active?.id,surfaced.id,'acknowledged cue remains visible next frame');
 queue.step(15100);assert.equal(queue.active?.id,surfaced.id,'cue retains its display window');
 h.state.simTime=30;h.system.update();assert.equal(h.row()._tritonPending,undefined);
 h.move(301,0);h.move(0,0);assert.equal(h.row()._tritonPending,undefined);
});
test('progress with same voice ID cannot acknowledge an unseen invitation',()=>{
 const h=boot();h.system.helpers.voice={say:()=>true};h.move(0,0);
 const pending=h.row()._tritonPending;assert.ok(pending);
 h.bus.emit('voice:surface',{id:'poi:'+h.row().behaviorId,text:'Different progress line'});
 assert.equal(h.state.livingPoiBehaviors.entered[pending.key],undefined);
 h.state.simTime=9;h.system.update();assert.ok(h.row()._tritonPending);
});
test('leaving or completing invalidates queued approach rather than speaking stale work',()=>{
 for(const action of ['leave','outcome','sector','dead']) {
   const h=boot(), queue=new VoiceQueue();
   h.system.helpers.voice={say:cue=>!!queue.enqueue(cue,h.state.simTime*1000)};
   h.move(0,0);const cue=queue._items[0];assert.ok(cue.valid());
   if(action==='leave')h.move(301,0);
   if(action==='outcome')h.finish();
   if(action==='sector')h.bus.emit('sector:exit',{sectorId:sid});
   if(action==='dead')h.body.alive=false;
   assert.equal(cue.valid(),false,action);
 }
});
test('without a voice helper the direct toast fallback consumes only its displayed invitation',()=>{
 const h=boot(), toasts=[];delete h.system.helpers.voice;
 h.bus.on('toast',p=>toasts.push(p));h.move(0,0);
 assert.equal(toasts.length,1);assert.equal(h.state.livingPoiBehaviors.entered[h.row().behaviorId],true);
 h.move(301,0);h.move(0,0);assert.equal(toasts.length,1);
});
test('an explicit authored-zone entry uses the same deferred delivery acknowledgment',()=>{
 const h=boot();h.system.helpers.voice={say:()=>true};
 h.bus.emit('world:zoneEntered',{zoneId:h.row().zoneId});
 assert.ok(h.row()._tritonPending);assert.equal(h.state.livingPoiBehaviors.entered[h.row().behaviorId],undefined);
});
test('explicit aftermath entry preserves the existing retry of a previously unposted lead',()=>{
 const h=boot();const emit=h.system._emitMissionLead;h.system._emitMissionLead=()=>false;h.finish();
 assert.equal(h.offers.length,0);h.system._emitMissionLead=emit;
 h.system.planSector(sid);assert.equal(h.row().status,'aftermath');
 h.bus.emit('world:zoneEntered',{zoneId:h.row().zoneId});assert.equal(h.offers.length,1);
 assert.equal(h.offers[0].stationId,'station_triton');
 h.bus.emit('world:zoneEntered',{zoneId:h.row().zoneId});assert.equal(h.offers.length,1);
});
