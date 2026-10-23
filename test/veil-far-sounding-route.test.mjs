import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {livingPoiBehaviors} from '../src/systems/livingPoiBehaviors.js';
import {scanner} from '../src/systems/scanner.js';
import {missions} from '../src/systems/missions.js';
import {economy} from '../src/systems/economy.js';
import {save} from '../src/save/saveSystem.js';
import {SECTORS} from '../src/data/sectors.js';
import {sectorLocalToGlobalForSector} from '../src/data/sectorCoordinates.js';
import {zonesForSector} from '../src/data/sectorZones.js';
import {planPoiBehaviors} from '../src/systems/livingPoiBehaviors.js';
const SID='sector_veil_nebula', PID='poi_veil_far_sounding';
const sector=SECTORS.find(s=>s.id===SID),lab=sector.pois.find(p=>p.id===PID);
const global=(p)=>sectorLocalToGlobalForSector(p,SID);
function boot(){
 const sim=createSimulation({seed:4242,systems:[economy,missions,livingPoiBehaviors,scanner,save]});const {state,bus}=sim;
 state.mode='flight';state.onboarding={active:false,finished:true};state.world.currentSectorId=SID;state.world.activeSector={id:SID,stations:[],pois:[],fields:[],gates:[]};
 for(const id of ['faction_free','faction_vael','faction_archive'])state.factions[id]={...state.factions[id],rep:500};
 const player=sim.spawn({type:'ship',team:0,pos:global(lab.pos),vel:{x:0,z:0},hull:100,hullMax:100,radius:6,data:{}});state.playerId=player.id;
 const body=sim.spawn({type:'anomaly',team:2,pos:global(lab.pos),radius:10,data:{poi:true,poiId:PID,poiType:'anomaly',sectorId:SID}});
 const wrong=sim.spawn({type:'anomaly',team:2,pos:global(lab.pos),radius:10,data:{poi:true,poiId:'unrelated',poiType:'anomaly',sectorId:SID}});
 state.world.activeSector.pois=[{id:body.id,poiId:PID,pos:body.pos},{id:wrong.id,poiId:'unrelated',pos:wrong.pos}];
 const own=sim.registry.get('livingPoiBehaviors'), scan=sim.registry.get('scanner');own.planSector(SID);
 const offers=[];bus.on('mission:offered',p=>offers.push(p));
 const pulse=(dx,dz=0)=>{player.pos=global({x:lab.pos.x+dx,z:lab.pos.z+dz});state.simTime+=5;scan._pulse(state,player,state.simTime)};
 const row=()=>Object.values(state.livingPoiBehaviors.activeByZone).find(r=>r.zoneName===lab.name);
 return {sim,state,bus,own,scan,player,body,wrong,offers,pulse,row};
}
function finish(h){h.pulse(45);h.pulse(150);h.pulse(255);}

test('placed Far Sounding materializes alongside unchanged generic plans and binds only its actual POI',()=>{
 const h=boot();try{
 assert.equal(lab.type,'wormhole');assert.equal(lab.machineGate,undefined);assert.equal(lab.gatedBy,undefined);const r=h.row();assert.ok(r,'Far Sounding has a live research row');
 assert.equal(r.zoneRadius,300);assert.deepEqual(r.zoneCenter,global(lab.pos));assert.equal(r.anchorEntityId,h.body.id);assert.equal(h.wrong.data.poiBehavior,undefined);
 const before=planPoiBehaviors({seed:4242,sectorId:SID,dayIndex:0,zones:zonesForSector(SID),sector});
 for(const old of before){const row=h.state.livingPoiBehaviors.activeByZone[old.zoneId];assert.ok(row);assert.equal(row.familyId,old.familyId);assert.equal(row.fingerprint,old.fingerprint);}
 assert.equal(Object.keys(h.state.livingPoiBehaviors.activeByZone).length,before.length+1);
 }finally{h.sim.dispose()}
});

test('actual scanner needs three distinct in-footprint ranges and boards one normal causal offer',()=>{
 const h=boot();try{
 h.pulse(301);assert.equal(h.row()?.progress,0);h.pulse(45);h.pulse(-45);h.pulse(0,45);assert.equal(h.row().progress,1);
 h.pulse(150);h.pulse(255);assert.equal(h.row().status,'resolved');assert.equal(h.offers.length,1);assert.equal(h.offers[0].stationId,'station_veil');assert.equal(h.offers[0].source,'poiBehavior');
 h.pulse(0,-200);assert.equal(h.offers.length,1);assert.equal(h.sim.registry.get('missions').acceptMission(h.offers[0].id),true);assert.equal(h.state.missions.active.length,1);
 }finally{h.sim.dispose()}
});

test('explicit Far Sounding zone IDs cannot bypass its physical footprint',()=>{
 const h=boot();try{const r=h.row();assert.ok(r);for(const dx of [301,600,900])h.bus.emit('scan:pulse',{zoneId:r.zoneId,pos:global({x:lab.pos.x+dx,z:lab.pos.z})});assert.equal(r.progress,0);
 h.bus.emit('poi:interact',{zoneId:r.zoneId,verb:'sound'});assert.equal(r.progress,0);
 }finally{h.sim.dispose()}
});

test('partial progress resets under existing owner serialization; resolved and generic aftermath coexist',()=>{
 const h=boot();try{
 h.pulse(-200);assert.equal(h.row()?.progress,1);const partial=h.own.serialize();h.own.deserialize(partial);h.own.planSector(SID);assert.equal(h.row().progress,0);
 const generic=Object.values(h.state.livingPoiBehaviors.activeByZone).find(r=>r.familyId==='anomaly_research'&&r!==h.row());
 const points=[];for(let x=-600;x<=600;x+=200)for(let z=-600;z<=600;z+=200){const p={x:generic.zoneCenter.x+x,z:generic.zoneCenter.z+z};if(h.own._zoneIdAt(p)===generic.zoneId&&points.every(q=>Math.hypot(q.x-p.x,q.z-p.z)>=180))points.push(p);}
 assert.ok(points.length>=3);for(const p of points.slice(0,3)){h.player.pos=p;h.scan._pulse(h.state,h.player,h.state.simTime);}
 assert.equal(generic.status,'resolved');h.state.simTime+=10;finish(h);const data=h.own.serialize();assert.equal(Object.keys(data.aftermath).length,2);
 h.own.deserialize(data);h.state.simTime=600;h.own.planSector(SID,{dayIndex:1});assert.equal(h.row().status,'aftermath');assert.equal(h.state.livingPoiBehaviors.activeByZone[generic.zoneId].status,'aftermath');assert.equal(h.row().zoneRadius,300);
 const n=h.offers.length;h.pulse(-200);assert.equal(h.offers.length,n);
 h.state.simTime=3000;h.own.planSector(SID,{dayIndex:5});assert.equal(h.row().status,'available');
 }finally{h.sim.dispose()}
});

test('actual Save/Continue retains accepted causal mission and resolved sounding, without reposting on return',async()=>{
 const storage=new Map();const prior=globalThis.localStorage;globalThis.localStorage={get length(){return storage.size},key:i=>[...storage.keys()][i]??null,getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)};
 const h=boot();try{finish(h);assert.equal(h.offers.length,1);const owner=h.sim.registry.get('missions');assert.equal(owner.acceptMission(h.offers[0].id),true);const id=h.state.missions.active[0].id;
 const saver=h.sim.registry.get('save');assert.equal(saver.save('quick'),true);h.state.missions.active=[];h.state.livingPoiBehaviors.aftermath={};const loaded=await saver.load('quick');assert.ok(loaded);assert.ok(h.state.missions.active.some(m=>m.id===id));
 h.state.world.currentSectorId=SID;h.own.planSector(SID);assert.equal(h.row().status,'aftermath');h.bus.emit('sector:exit',{sectorId:SID});h.own.planSector('sector_triton_wake');h.state.world.currentSectorId=SID;h.own.planSector(SID);assert.equal(h.row().status,'aftermath');const n=h.offers.length;h.pulse(-200);assert.equal(h.offers.length,n);
 }finally{h.sim.dispose();globalThis.localStorage=prior}
});

test('earned sounding lead reaches a real neighboring target and settles through scanner and economy owners',()=>{
 const h=boot();try{
 finish(h);assert.equal(h.offers.length,1);const offer=h.offers[0],owner=h.sim.registry.get('missions');assert.equal(owner.acceptMission(offer.id),true);
 const mission=h.state.missions.active.find(m=>m.sourceOfferId===offer.id);assert.ok(mission);assert.ok(sector.neighbors.includes(offer.destSectorId));
 const events=[];for(const name of ['mission:completed','economy:grantCredits'])h.bus.on(name,p=>events.push({name,p}));const before=h.state.player.credits;
 h.state.world.currentSectorId=offer.destSectorId;h.state.world.activeSector={id:offer.destSectorId,stations:[],fields:[],pois:[],gates:[]};h.bus.emit('sector:enter',{sectorId:offer.destSectorId});
 assert.equal(mission.targetEntityIds.length,1);const target=h.state.entities.get(mission.targetEntityIds[0]);assert.ok(target?.alive);assert.equal(target.data.worldRecordId,mission.params.poiSignalFollowup.targetRecordId);
 h.player.pos={x:target.pos.x+900,z:target.pos.z};h.scan._pulse(h.state,h.player,h.state.simTime);const signalId=`signal:entity:${target.id}`;assert.equal(h.state.signalInvestigation.records[signalId].stage,1);
 h.scan._pulse(h.state,h.player,h.state.simTime+8.1);assert.equal(h.state.signalInvestigation.records[signalId].stage,2);h.bus.emit('signal:track',{signalId});h.player.pos={...target.pos};h.scan._updateTrackedSignal(h.state);
 assert.equal(h.state.missions.active.includes(mission),false);assert.equal(events.filter(e=>e.name==='mission:completed'&&e.p.missionId===mission.id).length,1);assert.equal(events.filter(e=>e.name==='economy:grantCredits'&&e.p.reason===`mission:${mission.id}`).length,1);assert.ok(h.state.player.credits>before);assert.ok(h.state.player.researchPoints>0);
 const receipt=h.state.missions.receipts.find(r=>r.missionId===mission.id);assert.equal(receipt.causeFingerprint,offer.cause.fingerprint);assert.equal(receipt.targetRecordId,target.data.worldRecordId);
 h.scan._updateTrackedSignal(h.state);assert.equal(events.filter(e=>e.name==='mission:completed'&&e.p.missionId===mission.id).length,1);
 console.log('VEIL_ROUTE_RESULT',JSON.stringify({seed:4242,stationId:offer.stationId,destination:offer.destSectorId,targetRecordId:receipt.targetRecordId,creditDelta:h.state.player.credits-before,researchPoints:h.state.player.researchPoints,completionCount:events.filter(e=>e.name==='mission:completed').length}));
 }finally{h.sim.dispose()}
});

test('missing exact sounding body never annotates an unrelated neighbor; nonfinite pulses do not count',()=>{
 const h=boot();try{
 h.state.world.activeSector.pois=h.state.world.activeSector.pois.filter(p=>p.id!==h.body.id);h.state.entities.delete(h.body.id);h.own.planSector(SID);
 const r=h.row();assert.ok(r);assert.equal(r.anchorEntityId,undefined);assert.equal(h.wrong.data.poiBehavior,undefined);
 for(const pos of [{x:NaN,z:r.zoneCenter.z},{x:r.zoneCenter.x,z:Infinity},null])h.bus.emit('scan:pulse',{zoneId:r.zoneId,pos});assert.equal(r.progress,0);
 h.own.planSector('sector_triton_wake');assert.equal(h.row(),undefined);
 }finally{h.sim.dispose()}
});

test('departed or off-sector sounding cannot earn readings; only valid reentry resumes it',()=>{
 const h=boot();try{
 const r=h.row();h.state.world.currentSectorId='sector_triton_wake';finish(h);assert.equal(r.progress,0,'retained plan is not current-sector presence');
 h.state.world.currentSectorId=SID;h.bus.emit('sector:exit',{sectorId:'sector_triton_wake'});h.pulse(45);assert.equal(r.progress,1,'unrelated exit leaves Triton present');
 h.bus.emit('sector:exit',{sectorId:SID});h.pulse(150);h.pulse(255);assert.equal(r.progress,1,'exit suspends before world changes sector');
 h.bus.emit('scan:pulse',{sectorId:SID,zoneId:r.zoneId,pos:global({x:lab.pos.x,z:lab.pos.z+200})});assert.equal(r.progress,1,'explicit old identity cannot bypass departure');
 h.state.world.enterSerial=7;h.bus.emit('sector:enter',{sectorId:SID,enterEpoch:6});h.pulse(150);assert.equal(r.progress,1,'stale arrival does not restore presence');
 h.bus.emit('sector:enter',{sectorId:SID,enterEpoch:7});h.bus.emit('scan:pulse',{sectorId:'sector_triton_wake',zoneId:r.zoneId,pos:global({x:lab.pos.x,z:lab.pos.z+200})});assert.equal(r.progress,1,'wrong supplied sector fails closed');
 h.pulse(150);h.pulse(255);assert.equal(r.status,'resolved');assert.equal(h.offers.length,1);
 }finally{h.sim.dispose()}
});

test('sounding departure latch is transient across deserialize and New Game',()=>{
 const h=boot();try{
 h.bus.emit('sector:exit',{sectorId:SID});const saved=h.own.serialize();assert.equal(JSON.stringify(saved).includes('presenceSuspended'),false);assert.equal(JSON.stringify(h.state.world.poiReadouts).includes('presenceSuspended'),false);
 h.own.deserialize(saved);h.own.planSector(SID);h.pulse(-200);assert.equal(h.row().progress,1);
 h.bus.emit('sector:exit',{sectorId:SID});h.own.newGame();h.own.planSector(SID);h.pulse(-200);assert.equal(h.row().progress,1);
 }finally{h.sim.dispose()}
});


test('exact radial boundaries and actionable guidance preserve sound rather than triangulate',()=>{
 const h=boot();try {
 const r=h.row();assert.equal(r.contract.verb,'sound');assert.match(r.contract.objective,/<105 WU/);assert.match(r.contract.objective,/210–300 WU/);assert.equal(h.state.world.poiReadouts[r.zoneId].objective,r.contract.objective);
 const text=[];h.bus.on('toast',p=>text.push(p.text));
 h.pulse(104.99);assert.equal(r.progress,1);h.pulse(-104.99);assert.equal(r.progress,1);
 h.pulse(105);assert.equal(r.progress,2);h.pulse(209.99);assert.equal(r.progress,2);
 assert.ok(text.some(t=>t.includes('Next: far 210–300 WU')));h.pulse(210);assert.equal(r.status,'resolved');
 assert.equal(h.state.livingPoiBehaviors.aftermath[r.behaviorId].kind,'charted_sounding');
 }finally {h.sim.dispose()}
 const edge=boot();try {edge.pulse(300);assert.equal(edge.row().progress,1);edge.pulse(300.01);assert.equal(edge.row().progress,1);edge.pulse(150);edge.pulse(45);assert.equal(edge.row().status,'resolved');}finally{edge.sim.dispose()}
});


test('ordinary owner tick teaches first approach through voice and preserves generic zone identity',()=>{
 const h=boot();try {
 const spoken=[];h.own.helpers.voice={say:p=>{spoken.push(p);return true}};
 h.state.livingPoiBehaviors.currentZoneId='zone_veil_anomaly';h.player.pos=global({x:lab.pos.x+301,z:lab.pos.z});h.sim.step(1/60);assert.equal(spoken.length,0);
 h.player.pos=global(lab.pos);h.sim.step(1/60);assert.equal(spoken.length,1);assert.match(spoken[0].text,/close <105 WU.*middle 105–<210 WU.*far 210–300 WU/);
 assert.equal(h.row().progress,0);assert.equal(h.offers.length,0);assert.equal(h.state.livingPoiBehaviors.currentZoneId,'zone_veil_anomaly');
 for(let i=0;i<20;i++)h.sim.step(1/60);assert.equal(spoken.length,1);
 h.pulse(45);assert.equal(h.row().progress,1);assert.match(spoken.at(-1).text,/Next: middle 105–<210 WU; far 210–300 WU/);
 const n=spoken.length;h.scan._pulse(h.state,h.player,h.state.simTime);assert.equal(spoken.length,n,'same-time duplicate is quiet');
 h.pulse(-45);assert.equal(h.row().progress,1);assert.equal(spoken.length,n+1,'ordinary repeat scan recovers missing ranges');
 h.state.simTime=0;h.scan._pulse(h.state,h.player,0);assert.equal(spoken.length,n+2,'clock reset does not suppress forever');
 const serialized=JSON.stringify(h.own.serialize());assert.equal(serialized.includes('rangeGuidanceAt'),false);
 }finally{h.sim.dispose()}
});

test('first-approach voice rejects stale presence and malformed positions before valid reentry',()=>{
 const h=boot();try {
 const spoken=[];h.own.helpers.voice={say:p=>{spoken.push(p);return true}};
 h.player.pos={x:NaN,z:0};h.sim.step(1/60);assert.equal(spoken.length,0);h.player.pos=global(lab.pos);
 h.state.world.currentSectorId='sector_triton_wake';h.sim.step(1/60);assert.equal(spoken.length,0);h.state.world.currentSectorId=SID;
 h.bus.emit('sector:exit',{sectorId:SID});h.sim.step(1/60);assert.equal(spoken.length,0);
 h.state.world.enterSerial=3;h.bus.emit('sector:enter',{sectorId:SID,enterEpoch:2});h.sim.step(1/60);assert.equal(spoken.length,0);
 h.bus.emit('sector:enter',{sectorId:SID,enterEpoch:3});h.sim.step(1/60);assert.equal(spoken.length,1);assert.equal(h.row().progress,0);
 }finally{h.sim.dispose()}
});


test('already resolved or restored aftermath without approach memory stays quiet on owner ticks',()=>{
 const h=boot();try {
 finish(h);assert.equal(h.row().status,'resolved');assert.equal(h.state.livingPoiBehaviors.entered[h.row().behaviorId],undefined);
 const spoken=[];h.own.helpers.voice={say:p=>{spoken.push(p);return true}};
 for(let i=0;i<5;i++)h.sim.step(1/60);assert.equal(spoken.length,0);
 const saved=h.own.serialize();h.own.deserialize(saved);h.own.planSector(SID);assert.equal(h.row().status,'aftermath');
 for(let i=0;i<5;i++)h.sim.step(1/60);assert.equal(spoken.length,0);
 }finally{h.sim.dispose()}
});


test('tutorial deferral produces one readout then waits quietly until one released cue',()=>{
 const h=boot();try {
 h.state.onboarding={active:true,finished:false};const spoken=[],readouts=[];
 h.own.helpers.voice={say:p=>{spoken.push(p);return true}};h.bus.on('poi:behaviorReadout',p=>readouts.push(p));
 for(let i=0;i<20;i++)h.sim.step(1/60);assert.equal(readouts.length,1);assert.equal(spoken.length,0);assert.equal(h.row().progress,0);assert.equal(h.offers.length,0);
 h.state.onboarding={active:false,finished:true};h.sim.step(1/60);assert.equal(spoken.length,1);assert.match(spoken[0].text,/close <105 WU/);assert.equal(readouts.length,2);
 for(let i=0;i<20;i++)h.sim.step(1/60);assert.equal(spoken.length,1);assert.equal(readouts.length,2);assert.equal(h.row().progress,0);assert.equal(h.offers.length,0);
 }finally{h.sim.dispose()}
});
