import test from 'node:test';
import assert from 'node:assert/strict';
import {bootRealPath,writeRealPathInput} from '../scripts/lib/bench/realPath.mjs';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {combat} from '../src/systems/combat.js';
import {economy} from '../src/systems/economy.js';
import {factions} from '../src/systems/factions.js';
import {save} from '../src/save/saveSystem.js';
import {createSimulation} from '../src/core/sim.js';
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
let minGap=Infinity,minGapPose=null;const samples=[];for(let i=0;i<10260&&l.phase!=='done';i++){const target=rs.filter(e=>e.alive&&e.hull>0).sort((a,b)=>Math.hypot(a.pos.x-t.pos.x,a.pos.z-t.pos.z)-Math.hypot(b.pos.x-t.pos.x,b.pos.z-t.pos.z))[0]; const p=h.player;if(target){const dx=target.pos.x-p.pos.x,dz=target.pos.z-p.pos.z,dist=Math.hypot(dx,dz),lead=dist/320;const angle=Math.atan2(dz+target.vel.z*lead,dx+target.vel.x*lead);const turn=Math.atan2(Math.sin(angle-p.rot),Math.cos(angle-p.rot));const vx=target.vel.x+dx*(dist-150)/Math.max(dist,1)*.2,vz=target.vel.z+dz*(dist-150)/Math.max(dist,1)*.2,ax=(vx-p.vel.x)*.03,az=(vz-p.vel.z)*.03,c=Math.cos(p.rot),s=Math.sin(p.rot);writeRealPathInput(h.state,{moveZ:ax*c+az*s,moveX:-ax*s+az*c,turnIntent:turn*2,fire:true});h.state.input.aimAngle=angle;}else{const vx=(t.pos.x-140-p.pos.x)*.2,vz=(t.pos.z-p.pos.z)*.2,ax=(vx-p.vel.x)*.03,az=(vz-p.vel.z)*.03,c=Math.cos(p.rot),s=Math.sin(p.rot);writeRealPathInput(h.state,{moveZ:ax*c+az*s,moveX:-ax*s+az*c});}h.step(1);const gap=Math.hypot(f.pos.x-t.pos.x,f.pos.z-t.pos.z)-f.radius-t.radius;if(gap<minGap){minGap=gap;minGapPose={time:h.state.simTime,f:pose(f),t:pose(t)};}if((MODE==='approach'&&h.state.simTime>=1)||(MODE==='work'&&l.data.watch.t>=3)){const before={time:h.state.simTime,watch:{...l.data.watch},f:pose(f),t:pose(t),credits:h.state.player.credits,rep:h.state.factions?.faction_mts?.rep??0};const owner=h.runtime.getSystem('save'),env=JSON.parse(JSON.stringify(owner.serialize('hawser-native-'+MODE)));assert.equal(env.data.encounterDirector.live,undefined);assert.equal(owner.loadEnvelope(env,'hawser-native-'+MODE),true);writeRealPathInput(h.state,{});h.step(600);const after={time:h.state.simTime,live:h.state.encounterDirector.live,credits:h.state.player.credits,rep:h.state.factions?.faction_mts?.rep??0,entities:[...h.state.entities.values()].filter(e=>e.type==='ship').map(pose),intents:[...h.state.entities.values()].filter(e=>e.type==='ship').map(e=>e.data?.intent)};assert.equal(Object.keys(after.live).length,0);assert.equal(after.credits,before.credits);assert.equal(after.rep,before.rep);assert.equal(after.entities.some(e=>e.id===t.id),false);console.log('NATIVE_SAVE_PASS',MODE,JSON.stringify({before,after}));return;}if(i%120===0)samples.push({time:h.state.simTime,watch:{...l.data.watch},f:pose(f),t:pose(t),raiders:rs.map(pose)});}
assert.equal(l.outcome,'repaired');assert.ok(h.state.simTime<=170);assert.ok(minGap>=15);assert.ok(!rows.some(r=>r.n==='physics:impact'&&[r.p.aId,r.p.bId].includes(t.id)&&[r.p.aId,r.p.bId].includes(f.id)));assert.deepEqual(rows.filter(r=>r.n==='economy:grantCredits').map(r=>r.p.amount),[300]);assert.deepEqual(rows.filter(r=>r.n==='faction:repDelta').map(r=>r.p.delta),[6]);console.log('END',JSON.stringify({phase:l.phase,outcome:l.outcome,time:h.state.simTime,watch:l.data.watch,events:rows.filter(r=>r.n!=='physics:impact'&&r.n!=='combat:damage'),minGap,minGapPose,finalPose:{f:pose(f),t:pose(t),player:pose(h.player)},contactPairs:rows.filter(r=>r.n==='physics:impact').map(r=>({time:r.time,a:r.p.aId,b:r.p.bId,impulse:r.p.impulseMag,normal:r.p.normal,closing:r.p.preSolveClosingSpeed})),contacts:rows.filter(r=>r.n==='physics:impact').length,damage:rows.filter(r=>r.n==='combat:damage').length,samples:samples.filter((_,i)=>i%10===0)}));
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
