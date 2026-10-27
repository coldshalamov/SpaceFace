import test from 'node:test';
import assert from 'node:assert/strict';
import {bootRealPath,writeRealPathInput} from '../scripts/lib/bench/realPath.mjs';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {combat} from '../src/systems/combat.js';
import {economy} from '../src/systems/economy.js';
import {factions} from '../src/systems/factions.js';
import {save} from '../src/save/saveSystem.js';
import {createSimulation} from '../src/core/sim.js';
// The escort pilot steers around the rescue pair using ordinary thrust inputs.
// Friendly collision is still real; never ram the tug merely to keep a firing solution.
// Intercept the heavier raider first: its burst can destroy the broken Mule while
// an escort that fixates on the small near-tug raider leaves that casualty exposed.
function avoidFriendly(player,vx,vz,friends) {
 for(const ally of friends) {
  if(!ally.alive)continue;
  const dx=player.pos.x-ally.pos.x,dz=player.pos.z-ally.pos.z,dist=Math.hypot(dx,dz);
  const safe=player.radius+ally.radius+45;
  if(!(dist>0)||dist>safe+120)continue;
  const nx=dx/dist,nz=dz/dist,radial=(vx-ally.vel.x)*nx+(vz-ally.vel.z)*nz;
  const minimum=dist<safe?(safe-dist)*1.1:-(dist-safe)*.45;
  if(radial<minimum){vx+=nx*(minimum-radial);vz+=nz*(minimum-radial);}
 }
 return {vx,vz};
}
async function native(MODE){
const h=await bootRealPath({seed:4242,systems:['tacticalAI','flightV3','aiPorts','weapons','physics','collisionConsequences',combat,economy,factions,encounterDirector,save],bounds:{center:{x:0,z:0},radius:3500,hardRadius:4000},prepareState({state}){state.world.currentSectorId='sector_ceres_belt';state.story.beatIndex=7;},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:0}}]});
try {
const d=h.runtime.getSystem('encounterDirector');
const req=d.requestAuthoredEncounter({shapeId:'salvage_watch',encounterId:'hawser-native:1',sectorId:'sector_ceres_belt',anchor:{x:250,z:0},force:true});assert.equal(req.ok,true);const l=h.state.encounterDirector.live[req.encounterId];const f=d.entsOf(l,'hauler')[0],t=d.entsOf(l,'escort')[0],rs=d.entsOf(l,'raider');
const pose=e=>({id:e.id,pos:{...e.pos},vel:{...e.vel},rot:e.rot,radius:e.radius,hull:e.hull,hullMax:e.hullMax,model:e.data?.defId,collisionProxy:e.data?.collisionProxy,hullId:e.data?.hullId,alive:e.alive});
const rows=[];for(const n of ['combat:damage','entity:killed','physics:impact','economy:grantCredits','faction:repDelta','encounter:resolved'])h.bus.on(n,p=>rows.push({n,time:h.state.simTime,p:JSON.parse(JSON.stringify(p))}));
console.log('INITIAL',JSON.stringify({freighter:pose(f),tug:pose(t),raiders:rs.map(pose)}));
h.step(1);h.assertBodies([f,t,...rs]);console.log('PROOF',JSON.stringify(h.proof()));
console.log('PLAYER_WEAPONS',JSON.stringify(h.player.data.weapons));
let minGap=Infinity,minGapPose=null;const samples=[];for(let i=0;i<10260&&l.phase!=='done';i++){const target=rs.filter(e=>e.alive&&e.hull>0).sort((a,b)=>(b.hullMax+(b.shieldMax||0))-(a.hullMax+(a.shieldMax||0))||Math.hypot(a.pos.x-f.pos.x,a.pos.z-f.pos.z)-Math.hypot(b.pos.x-f.pos.x,b.pos.z-f.pos.z))[0]; const p=h.player;if(target){const dx=target.pos.x-p.pos.x,dz=target.pos.z-p.pos.z,dist=Math.hypot(dx,dz),lead=dist/320;const angle=Math.atan2(dz+target.vel.z*lead,dx+target.vel.x*lead);const turn=Math.atan2(Math.sin(angle-p.rot),Math.cos(angle-p.rot));let vx=target.vel.x+dx*(dist-150)/Math.max(dist,1)*.2,vz=target.vel.z+dz*(dist-150)/Math.max(dist,1)*.2;({vx,vz}=avoidFriendly(p,vx,vz,[f,t]));const ax=(vx-p.vel.x)*.03,az=(vz-p.vel.z)*.03,c=Math.cos(p.rot),s=Math.sin(p.rot);writeRealPathInput(h.state,{moveZ:ax*c+az*s,moveX:-ax*s+az*c,turnIntent:turn*2,fire:true});h.state.input.aimAngle=angle;}else{let vx=(t.pos.x-140-p.pos.x)*.2,vz=(t.pos.z-p.pos.z)*.2;({vx,vz}=avoidFriendly(p,vx,vz,[f,t]));const ax=(vx-p.vel.x)*.03,az=(vz-p.vel.z)*.03,c=Math.cos(p.rot),s=Math.sin(p.rot);writeRealPathInput(h.state,{moveZ:ax*c+az*s,moveX:-ax*s+az*c});}h.step(1);const gap=Math.hypot(f.pos.x-t.pos.x,f.pos.z-t.pos.z)-f.radius-t.radius;if(gap<minGap){minGap=gap;minGapPose={time:h.state.simTime,f:pose(f),t:pose(t)};}if((MODE==='approach'&&h.state.simTime>=1)||(MODE==='work'&&l.data.watch.t>=3)){const before={time:h.state.simTime,watch:{...l.data.watch},f:pose(f),t:pose(t),credits:h.state.player.credits,rep:h.state.factions?.faction_mts?.rep??0};const owner=h.runtime.getSystem('save'),env=JSON.parse(JSON.stringify(owner.serialize('hawser-native-'+MODE)));assert.equal(env.data.encounterDirector.live,undefined);assert.equal(owner.loadEnvelope(env,'hawser-native-'+MODE),true);writeRealPathInput(h.state,{});h.step(600);const after={time:h.state.simTime,live:h.state.encounterDirector.live,credits:h.state.player.credits,rep:h.state.factions?.faction_mts?.rep??0,entities:[...h.state.entities.values()].filter(e=>e.type==='ship').map(pose),intents:[...h.state.entities.values()].filter(e=>e.type==='ship').map(e=>e.data?.intent)};assert.equal(Object.keys(after.live).length,0);assert.equal(after.credits,before.credits);assert.equal(after.rep,before.rep);assert.equal(after.entities.some(e=>e.id===t.id),false);console.log('NATIVE_SAVE_PASS',MODE,JSON.stringify({before,after}));return;}if(i%120===0)samples.push({time:h.state.simTime,watch:{...l.data.watch},f:pose(f),t:pose(t),raiders:rs.map(pose)});}
assert.equal(l.outcome,'repaired',JSON.stringify({time:h.state.simTime,minGap,watch:l.data.watch,kills:rows.filter(r=>r.n==='entity:killed'),damage:rows.filter(r=>r.n==='combat:damage').slice(-8),f:pose(f),t:pose(t)}));assert.ok(h.state.simTime<=170);assert.ok(minGap>=15,JSON.stringify({minGap,minGapPose,contacts:rows.filter(r=>r.n==='physics:impact'&&[r.p.aId,r.p.bId].includes(t.id)).slice(0,5).map(r=>({time:r.time,a:r.p.aId,b:r.p.bId,closing:r.p.preSolveClosingSpeed})),final:{freighter:pose(f),tug:pose(t)},work:l.data.watch}));assert.ok(!rows.some(r=>r.n==='physics:impact'&&[r.p.aId,r.p.bId].includes(t.id)&&[r.p.aId,r.p.bId].includes(f.id)));assert.deepEqual(rows.filter(r=>r.n==='economy:grantCredits').map(r=>r.p.amount),[300]);assert.deepEqual(rows.filter(r=>r.n==='faction:repDelta').map(r=>r.p.delta),[6]);console.log('END',JSON.stringify({phase:l.phase,outcome:l.outcome,time:h.state.simTime,watch:l.data.watch,events:rows.filter(r=>r.n!=='physics:impact'&&r.n!=='combat:damage'),minGap,minGapPose,finalPose:{f:pose(f),t:pose(t),player:pose(h.player)},contactPairs:rows.filter(r=>r.n==='physics:impact').map(r=>({time:r.time,a:r.p.aId,b:r.p.bId,impulse:r.p.impulseMag,normal:r.p.normal,closing:r.p.preSolveClosingSpeed})),contacts:rows.filter(r=>r.n==='physics:impact').length,damage:rows.filter(r=>r.n==='combat:damage').length,samples:[samples[0],samples.at(-1)]}));

const at=h.state.simTime, start={f:pose(f),t:pose(t)}, receiptCount=h.state.encounterDirector.receipts.length;
assert.equal(f.data.intent.assistMode,'assisted');assert.equal(t.data.intent.assistMode,'assisted');
assert.equal(f.data.despawnAt,at+20);assert.equal(t.data.despawnAt,at+20);
writeRealPathInput(h.state,{});let tailGap=Infinity;const tail=[];
for(let i=0;i<19*60;i++){h.step(1);tailGap=Math.min(tailGap,Math.hypot(f.pos.x-t.pos.x,f.pos.z-t.pos.z)-f.radius-t.radius);if(i%60===59)tail.push({time:h.state.simTime,f:pose(f),t:pose(t)});}
assert.ok(f.alive&&t.alive);assert.ok(h.state.entities.has(f.id)&&h.state.entities.has(t.id));
for(const [key,e] of [['f',f],['t',t]]){assert.ok(Math.hypot(e.pos.x-start[key].pos.x,e.pos.z-start[key].pos.z)>50);assert.ok(Math.hypot(tail[0][key].vel.x,tail[0][key].vel.z)>Math.hypot(start[key].vel.x,start[key].vel.z)+1);}
assert.ok(tailGap>=15);assert.ok(!rows.some(r=>r.n==='physics:impact'&&[r.p.aId,r.p.bId].includes(t.id)&&[r.p.aId,r.p.bId].includes(f.id)));
h.step(120);assert.equal(h.state.entities.has(f.id),false);assert.equal(h.state.entities.has(t.id),false);
assert.equal(h.state.encounterDirector.receipts.length,receiptCount);assert.deepEqual(rows.filter(r=>r.n==='economy:grantCredits').map(r=>r.p.amount),[300]);assert.deepEqual(rows.filter(r=>r.n==='faction:repDelta').map(r=>r.p.delta),[6]);
console.log('POWERED_DEPARTURE',JSON.stringify({start,repairTime:at,tailGap,tail:tail.filter((_,i)=>[0,4,9,18].includes(i)),retiredAt:h.state.simTime,receiptCount,claimsHomeArrival:false}));
}finally{h.dispose();}

}
test('Hawser attends through native propulsion, keeps clearance, and abandons active work on actual Save/Continue',async()=>{for(const mode of ['complete','approach','work'])await native(mode);});
test('Hawser durable repair receipt and reward persist through registered Save owners without replay',()=>{
for(const mode of ['approach','work','complete']){
const sim=createSimulation({seed:4242,systems:[combat,economy,factions,encounterDirector,save],updateOrder:[encounterDirector]});try{
const state=sim.state,bus=sim.bus,d=sim.registry.get('encounterDirector'),s=sim.registry.get('save');
const p=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:14,mass:16,hull:150,hullMax:150,data:{defId:'ship_wasp',intent:{},ai:{}}});state.playerId=p.id;state.mode='flight';state.world.currentSectorId='sector_ceres_belt';state.story.beatIndex=7;
const events=[];for(const n of ['economy:grantCredits','faction:repDelta','encounter:resolved','save:error'])bus.on(n,p=>events.push({n,p}));
const req=d.requestAuthoredEncounter({shapeId:'salvage_watch',encounterId:'hawser-save:'+mode,sectorId:'sector_ceres_belt',anchor:{x:250,z:0},force:true});assert.equal(req.ok,true);const l=state.encounterDirector.live[req.encounterId];const f=d.entsOf(l,'hauler')[0],t=d.entsOf(l,'escort')[0],raiders=d.entsOf(l,'raider');
if(mode!=='approach'){const dx=t.pos.x-f.pos.x,dz=t.pos.z-f.pos.z,dist=Math.hypot(dx,dz),berth=f.radius+t.radius+35;t.pos.x=f.pos.x+dx/dist*berth;t.pos.z=f.pos.z+dz/dist*berth;}
for(const r of raiders){r.pos.x+=1200;r.pos.z+=1200;}
for(let i=0;i<(mode==='approach'?1:mode==='work'?600:4300)&&l.phase!=='done';i++)sim.step();
const before={time:state.simTime,phase:l.phase,watch:JSON.parse(JSON.stringify(l.data.watch)),credits:state.player.credits,rep:state.factions?.faction_mts?.rep??0,receipts:state.encounterDirector.receipts,entities:[...state.entities.values()].map(e=>({id:e.id,defId:e.data?.defId,intent:e.data?.intent}))};
const envelope=JSON.parse(JSON.stringify(s.serialize('hawser-'+mode)));assert.equal(envelope.data.encounterDirector.live,undefined);
const beforeEvents=events.length;const loaded=s.loadEnvelope(envelope,'hawser-'+mode);assert.equal(loaded,true);
for(let i=0;i<600;i++)sim.step();
const after={time:state.simTime,live:state.encounterDirector.live,credits:state.player.credits,rep:state.factions?.faction_mts?.rep??0,receipts:state.encounterDirector.receipts,entities:[...state.entities.values()].map(e=>({id:e.id,defId:e.data?.defId,intent:e.data?.intent})),events:events.slice(beforeEvents)};
assert.equal(Object.keys(after.live).length,0);assert.equal(after.credits,before.credits);assert.equal(after.rep,before.rep);assert.deepEqual(after.receipts,before.receipts);assert.ok(!after.events.some(e=>e.n==='economy:grantCredits'||e.n==='faction:repDelta'));
if(mode==='complete'){assert.equal(l.outcome,'repaired');assert.equal(before.credits,300);assert.equal(before.rep,6);}else{assert.notEqual(l.phase,'done');assert.equal(before.credits,0);}
console.log('SAVE_PASS',mode,JSON.stringify({before,after,serializedNpcCount:envelope.data.entities?.length}));
}finally{sim.dispose();}
}
});


import {admitCapturedVessel,captureAndTransfer} from '../src/systems/shipControlTransfer.js';
test('Hawser actual custody APIs preserve capture through registered Save without departure control or reward replay',()=>{for(const kind of ['mule','tug'])for(const action of ['secure','handoff','foreign']){
const mode='complete'; const sim=createSimulation({seed:4242,systems:[combat,economy,factions,encounterDirector,save],updateOrder:[encounterDirector]});try{
const state=sim.state,bus=sim.bus,d=sim.registry.get('encounterDirector'),s=sim.registry.get('save');
const p=sim.spawn({type:'ship',team:0,pos:{x:0,z:0},vel:{x:0,z:0},radius:14,mass:16,hull:150,hullMax:150,data:{defId:'ship_wasp',intent:{},ai:{}}});state.playerId=p.id;state.mode='flight';state.world.currentSectorId='sector_ceres_belt';state.story.beatIndex=7;
const events=[];for(const n of ['economy:grantCredits','faction:repDelta','encounter:resolved','save:error'])bus.on(n,p=>events.push({n,p}));
const req=d.requestAuthoredEncounter({shapeId:'salvage_watch',encounterId:'hawser-save:'+mode,sectorId:'sector_ceres_belt',anchor:{x:250,z:0},force:true});assert.equal(req.ok,true);const l=state.encounterDirector.live[req.encounterId];const f=d.entsOf(l,'hauler')[0],t=d.entsOf(l,'escort')[0],raiders=d.entsOf(l,'raider');
if(mode!=='approach'){const dx=t.pos.x-f.pos.x,dz=t.pos.z-f.pos.z,dist=Math.hypot(dx,dz),berth=f.radius+t.radius+35;t.pos.x=f.pos.x+dx/dist*berth;t.pos.z=f.pos.z+dz/dist*berth;}
for(const r of raiders){r.pos.x+=1200;r.pos.z+=1200;}
for(let i=0;i<(mode==='approach'?1:mode==='work'?600:4300)&&l.phase!=='done';i++)sim.step();

assert.equal(l.outcome,'repaired');const actor=kind==='mule'?f:t,other=kind==='mule'?t:f,packet=actor.data.intent,expiry=actor.data.despawnAt;
actor.data.vesselId='watch:'+actor.id;actor.data.shipjackGeneration=1;state.run={kind:'adventure'};
state.player.ownedShips ||= [];state.player.activeShipIndex=0;if(!state.player.ownedShips.length)state.player.ownedShips.push({defId:'ship_wasp',fittings:[]});
const owner={state,bus,validateTransferFittings:()=>true,nextInstanceId:()=>'watch:instance',getTransferCargoCapacity:()=>100,recomputeEntity(){},publishActiveRoleContext(){}};
const request={targetId:actor.id,targetGeneration:1,vesselId:actor.data.vesselId,operationId:'watch:transfer'};
if(action==='handoff'){
 p.pos={x:actor.pos.x+10000,z:actor.pos.z};assert.equal(captureAndTransfer(owner,request).ok,false);assert.equal(actor.data.intent,packet);assert.equal(actor.data.despawnAt,expiry);
 p.pos={...actor.pos};p.vel={...actor.vel};assert.equal(captureAndTransfer(owner,request).reason,'cargo_owner_unavailable');assert.equal(actor.data.intent,packet);assert.equal(actor.data.despawnAt,expiry);
 bus.on('ship:parkedHoldSwap',event=>bus.emit('cargo:parkedHoldSwapped',event));const r=captureAndTransfer(owner,request);assert.equal(r.ok,true,r.reason);assert.equal(state.playerId,actor.id);
}else{
 if(action==='foreign'){actor.data.intent={moveZ:.2,owner:'successor'};actor.data.despawnAt=expiry+100;}
 const foreign=actor.data.intent,foreignExpiry=actor.data.despawnAt;assert.equal(admitCapturedVessel(owner,request).ok,true);
 if(action==='foreign'){assert.equal(actor.data.intent,foreign);assert.equal(actor.data.despawnAt,foreignExpiry);console.log('FOREIGN_OWNER_PASS',kind);continue;}
}
assert.ok(actor.flags.persistent);assert.ok(actor.data.intent==null);assert.equal(actor.data.despawnAt,undefined);assert.equal(packet.moveX,0);assert.equal(packet.moveZ,0);assert.equal(other.data.intent.assistMode,'assisted');
const before={credits:state.player.credits,rep:state.factions.faction_mts.rep,receipts:structuredClone(state.encounterDirector.receipts)};
for(let i=0;i<21*60;i++)sim.step();assert.ok(state.entities.has(actor.id));assert.equal(state.entities.has(other.id),false);
const envelope=JSON.parse(JSON.stringify(s.serialize('departure-custody')));const priorEvents=events.length;assert.equal(s.loadEnvelope(envelope,'departure-custody'),true);for(let i=0;i<120;i++)sim.step();
const restored=[...state.entities.values()].find(e=>e.data?.vesselId===actor.data.vesselId);assert.ok(restored,'captured vessel survives Continue');assert.ok(restored.data.intent==null);assert.equal(restored.data.despawnAt,undefined);
assert.equal(state.player.credits,before.credits);assert.equal(state.factions.faction_mts.rep,before.rep);assert.deepEqual(state.encounterDirector.receipts,before.receipts);assert.ok(!events.slice(priorEvents).some(e=>e.n==='economy:grantCredits'||e.n==='faction:repDelta'));
console.log('CUSTODY_SAVE_PASS',JSON.stringify({kind,action,oldExpiry:expiry,time:state.simTime,vesselId:restored.data.vesselId,playerId:state.playerId,restoredId:restored.id,credits:state.player.credits,rep:state.factions.faction_mts.rep}));
}finally{sim.dispose();}}});


test('early secure rescue custody retains original native hulls through immediate Continue without work or retirement',async()=>{
 for(const kind of ['escort','hauler']) {
  const h=await bootRealPath({seed:4242,systems:['flightV3','aiPorts','physics',combat,economy,factions,encounterDirector,save],bounds:{center:{x:0,z:0},radius:3500,hardRadius:4000},prepareState({state}){state.world.currentSectorId='sector_ceres_belt';state.story.beatIndex=7;state.run={kind:'adventure'};},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:0}}]});
  try {
   const state=h.state,d=h.runtime.getSystem('encounterDirector'),phys=h.runtime.getSystem('physics'),storage=h.runtime.getSystem('save');
   const req=d.requestAuthoredEncounter({shapeId:'salvage_watch',encounterId:'hawser-early-native:'+kind,sectorId:'sector_ceres_belt',anchor:{x:250,z:0},force:true});assert.equal(req.ok,true);
   const live=state.encounterDirector.live[req.encounterId],actor=d.entsOf(live,kind)[0];h.step(1);h.assertBodies([actor]);
   const vesselId='hawser:early:'+kind;actor.data.vesselId=vesselId;actor.data.shipjackGeneration=1;
   state.player.ownedShips||=[];state.player.activeShipIndex=0;if(!state.player.ownedShips.length)state.player.ownedShips.push({defId:'ship_wasp',fittings:[]});
   const owner={state,bus:h.bus,helpers:d.helpers,validateTransferFittings:()=>true,nextInstanceId:()=>'hawser:early:instance',getTransferCargoCapacity:()=>100,recomputeEntity(){},publishActiveRoleContext(){}};
   assert.equal(admitCapturedVessel(owner,{targetId:actor.id,targetGeneration:1,vesselId,operationId:'hawser:early:secure'}).ok,true);
   assert.equal(live.outcome,'watch_over');assert.equal(actor.data.despawnAt,undefined);assert.equal(actor.flags.persistent,true);
   const credits=state.player.credits,rep=state.factions?.faction_mts?.rep??0,receipts=structuredClone(state.encounterDirector.receipts),cargo=structuredClone(actor.data.cargoManifest);
   const envelope=JSON.parse(JSON.stringify(storage.serialize('early-rescue-custody')));assert.equal(storage.loadEnvelope(envelope),true);assert.equal(await phys.prepareBackend(state),true);
   const restored=state.entityList.find(e=>e.alive&&e.data?.vesselId===vesselId);assert.ok(restored);h.step(3);assert.equal(await phys.prepareBackend(state),true);h.assertBodies([restored]);
   assert.equal(restored.data.despawnAt,undefined);assert.deepEqual(restored.data.cargoManifest,cargo);
   h.step(22*60);assert.equal(state.entities.get(restored.id),restored);assert.equal(restored.data.despawnAt,undefined);assert.ok(!restored.data.intent);
   assert.equal(state.player.credits,credits);assert.equal(state.factions?.faction_mts?.rep??0,rep);assert.deepEqual(state.encounterDirector.receipts,receipts);
   console.log('EARLY_CUSTODY_NATIVE_CONTINUE',JSON.stringify({kind,vesselId,id:restored.id,credits,rep,receipts:receipts.length,native:true,alive:restored.alive,cargo:restored.data.cargoManifest}));
  } finally {h.dispose();}
 }
});
