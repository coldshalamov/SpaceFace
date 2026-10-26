import assert from 'node:assert/strict';
import {save} from '../src/save/saveSystem.js';
import {bootRealPath,writeRealPathInput} from '../scripts/lib/bench/realPath.mjs';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {combat} from '../src/systems/combat.js';
import {cargo} from '../src/systems/cargo.js';
import {economy} from '../src/systems/economy.js';
import {factions} from '../src/systems/factions.js';
const results=[];
for(const choice of ['shadow','bait']){
 const h=await bootRealPath({seed:4242,systems:['tacticalAI','flightV3','aiPorts','weapons','physics','collisionConsequences',combat,cargo,economy,factions,encounterDirector,save],bounds:{center:{x:0,z:0},radius:4200,hardRadius:4700},prepareState({state}){state.world.currentSectorId='sector_helios_prime';state.story.beatIndex=7;state.story.depthProgramEncounters={completed:{opening_hauler_raid:{outcome:'defended'}}};},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:200}}]});
 try{
 const d=h.runtime.getSystem('encounterDirector');
 const req=d.requestAuthoredEncounter({shapeId:'salvage_tail',encounterId:'tail-native:1',sectorId:'sector_helios_prime',anchor:{x:0,z:0},force:false});
 console.log('TAIL_ADMISSION',JSON.stringify({choice,req}));assert.equal(req.ok,true);
 const live=h.state.encounterDirector.live[req.encounterId],m=d.entsOf(live,'hauler')[0],rs=d.entsOf(live,'raider'),start={...m.pos},rows=[],samples=[];
 for(const n of ['combat:damage','physics:impact','weapon:fired','encounter:resolved','economy:grantCredits'])h.bus.on(n,p=>rows.push({n,t:h.state.simTime,p:structuredClone(p)}));
 h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:choice});
 let firstFire=null,holdSamples=0,slipStoppedAt=null; const ids=[m,...rs].map(e=>({id:e.id,generation:e.occupantGeneration}));
 h.step(60*60,{before(){
 const p=h.player,goal={x:m.pos.x-120,z:m.pos.z+120};const dx=goal.x-p.pos.x,dz=goal.z-p.pos.z,range=Math.hypot(dx,dz),scale=range?Math.min(115,range*.5)/range:0;const ax=(dx*scale-p.vel.x)*.04,az=(dz*scale-p.vel.z)*.04,c=Math.cos(p.rot),s=Math.sin(p.rot);writeRealPathInput(h.state,{moveZ:ax*c+az*s,moveX:-ax*s+az*c});
 },after({index}){
 if(index===1)h.assertBodies([m,...rs]);
 if(firstFire===null&&rs.some(e=>e.data.intent?.fire))firstFire=h.state.simTime;
 if(rs.some(e=>e.data.intent?.fireBlockReason==='arrival_hold'))holdSamples++;
 if(choice==='bait'&&slipStoppedAt===null&&m.data.intent?.moveX===0)slipStoppedAt=h.state.simTime;
 for(const e of [m,...rs]) for(const q of [e.pos.x,e.pos.z,e.vel.x,e.vel.z]) assert.ok(Number.isFinite(q));
 if(index%60===0)samples.push({time:h.state.simTime,m:{pos:{...m.pos},vel:{...m.vel},hull:m.hull,intent:{...m.data.intent}},rs:rs.map(e=>({id:e.id,pos:{...e.pos},hull:e.hull,hold:e.data.ai.arrivalHoldUntil,intent:{...e.data.intent}})),phase:live.phase});
 return live.phase!=='done';
 }});
 assert.equal(h.proof().backend,'rapier-dynamic');assert.equal(h.proof().aiBackend,'sg06-tactical');assert.equal(h.proof().contactCaptureEnabled,true);
 assert.deepEqual([m,...rs].map(e=>({id:e.id,generation:e.occupantGeneration})),ids);
 const at2=samples.find(s=>s.time>=2),at10=samples.find(s=>s.time>=10),at15=samples.find(s=>s.time>=15),at27=samples.find(s=>s.time>=27);
 if(choice==='shadow'){assert.ok(at2.m.pos.x-start.x>10);assert.ok(at2.rs.every(e=>e.intent.fire===false&&e.hold===26));assert.ok(at27.rs.every(e=>e.hold===undefined));assert.notEqual(at27.rs[0].intent.fireBlockReason,'arrival_hold');assert.ok(firstFire>=26&&firstFire<60);}
 else{assert.ok(at10.m.pos.z-start.z>100);assert.equal(at10.m.intent.moveX,0);assert.equal(at10.m.intent.moveZ,0);assert.equal(at10.m.intent.assistMode,'newtonian');assert.ok(Math.hypot(at15.m.pos.x-at10.m.pos.x,at15.m.pos.z-at10.m.pos.z)>100);assert.ok(Number.isFinite(firstFire));assert.ok(slipStoppedAt>=3&&slipStoppedAt<5);}
 const result={choice,ids,start,samples,firstFire,holdSamples,slipStoppedAt,phase:live.phase,outcome:live.outcome,rows:rows.filter(r=>r.n!=='physics:impact'),impacts:{observations:rows.filter(r=>r.n==='physics:impact').length,unique:[...new Map(rows.filter(r=>r.n==='physics:impact').map(r=>[r.p.pairKey+':'+r.p.tick,r])).values()]},proof:h.proof()};results.push(result);
 const report={...result,samples:result.samples.filter((s,i)=>i<5||i%5===0||[25,26,27,59].includes(Math.floor(s.time))),rows:result.rows.map(r=>({n:r.n,t:r.t,p:r.n==='combat:damage'?{targetId:r.p.targetId,attackerId:r.p.attackerId,amount:r.p.amount,applied:r.p.applied,hullDamage:r.p.hullDamage,beforeHull:r.p.before?.hull,afterHull:r.p.after?.hull,weaponId:r.p.weaponId}:r.p})),impacts:{observations:result.impacts.observations,unique:result.impacts.unique.map(r=>({t:r.t,tick:r.p.tick,aId:r.p.aId,bId:r.p.bId,pairKey:r.p.pairKey,aGeneration:r.p.aGeneration,bGeneration:r.p.bGeneration,trauma:r.p.trauma,impulse:r.p.impulse,preSolveClosingSpeed:r.p.preSolveClosingSpeed}))}};
 console.log('TAIL_ROUTE',JSON.stringify(report));
 }finally{h.dispose();}
}
console.log('TAIL_RESULTS',JSON.stringify(results.map(r=>({choice:r.choice,phase:r.phase,outcome:r.outcome,samples:r.samples.length}))));

import {admitCapturedVessel} from '../src/systems/shipControlTransfer.js';
for(const mode of ['interrupted','capture','foreign','completed','lost']){
 const h=await bootRealPath({seed:4242,systems:['tacticalAI','flightV3','aiPorts','weapons','physics','collisionConsequences',combat,cargo,economy,factions,encounterDirector,save],bounds:{center:{x:0,z:0},radius:4200,hardRadius:4700},prepareState({state}){state.world.currentSectorId='sector_helios_prime';state.story.beatIndex=7;state.story.depthProgramEncounters={completed:{opening_hauler_raid:{outcome:'defended'}}};},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:200}}]});
 try{
 const d=h.runtime.getSystem('encounterDirector'),s=h.runtime.getSystem('save');
 const req=d.requestAuthoredEncounter({shapeId:'salvage_tail',encounterId:'tail-save:'+mode,sectorId:'sector_helios_prime',anchor:{x:0,z:0},force:false});assert.equal(req.ok,true);
 const live=h.state.encounterDirector.live[req.encounterId],m=d.entsOf(live,'hauler')[0],rs=d.entsOf(live,'raider'),intent=m.data.intent,events=[];
 for(const n of ['combat:damage','entity:killed','economy:grantCredits','faction:repDelta','encounter:resolved'])h.bus.on(n,p=>events.push({n,t:h.state.simTime,p:structuredClone(p)}));
 h.bus.emit('encounter:choose',{encounterId:live.id,choiceId:'shadow'});h.step(120);h.assertBodies([m,...rs]);
 if(mode==='capture'||mode==='foreign'){
 m.data.vesselId='tail:vessel';m.data.shipjackGeneration=1;h.state.run={kind:'adventure'};h.state.player.ownedShips||=[];h.state.player.activeShipIndex=0;
 if(mode==='foreign'){m.data.intent={moveZ:.2,owner:'successor'};rs[0].data.ai.arrivalHoldUntil=999;}
 const packet=m.data.intent,hold=rs[0].data.ai.arrivalHoldUntil;
 const owner={state:h.state,bus:h.bus,helpers:d.helpers,validateTransferFittings:()=>true,nextInstanceId:()=>'tail:instance',getTransferCargoCapacity:()=>100,recomputeEntity(){},publishActiveRoleContext(){}};
 const captured=admitCapturedVessel(owner,{targetId:m.id,targetGeneration:1,vesselId:'tail:vessel',operationId:'tail:capture'});assert.equal(captured.ok,true,JSON.stringify(captured));
 if(mode==='foreign'){assert.equal(m.data.intent,packet);assert.equal(rs[0].data.ai.arrivalHoldUntil,hold);}
 else{assert.equal(m.data.intent,undefined);for(const r of rs)assert.equal(r.data.ai.arrivalHoldUntil,undefined);}
 h.step(120);assert.equal(live.outcome,'interrupted');assert.equal(events.some(e=>e.n==='economy:grantCredits'||e.n==='faction:repDelta'),false);
 }
 if(mode==='completed'||mode==='lost'){
 const kernel=h.runtime.getSystem('combat').kernel;
 for(const target of mode==='completed'?rs:[m]){
 const attacker=mode==='completed'?h.player:rs[0];
 const result=h.withFeatures(()=>kernel.routeDamage({attackerId:attacker.id,targetId:target.id,packet:{channels:{kinetic:100000},penetration:0,shieldBypass:0},origin:{kind:'qualification',id:'tail-terminal-route'}}));
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(target.alive,false);
 }
 h.step(240);
 console.log('TAIL_DAMAGE_TERMINAL',JSON.stringify({mode,outcome:live.outcome,phase:live.phase,predation:live.plan.predation,custody:live.data.freightCargoCustody,pickups:[...h.state.entities.values()].filter(e=>e.type==='pickup').map(e=>({id:e.id,data:e.data})),events}));
 if(mode==='completed'){assert.equal(live.outcome,'defended');assert.equal(events.filter(e=>e.n==='economy:grantCredits'&&e.p.reason==='salvage_tail:defended').length,1);}
 if(mode==='lost'){assert.ok(live.data.freightCargoCustody&&!live.data.freightCargoCustody.terminal);assert.equal(live.outcome,null);assert.equal(events.some(e=>e.n==='faction:repDelta'&&e.p.reason==='salvage_tail_lost'),false);assert.equal(events.some(e=>e.n==='economy:grantCredits'&&e.p.reason==='salvage_tail:defended'),false);}
 }
 const completedStory=structuredClone(h.state.story.depthProgramEncounters),credits=h.state.player.credits,cooldowns=structuredClone(h.state.encounterDirector.cooldowns),resolved=h.state.encounterDirector.stats.resolved,env=JSON.parse(JSON.stringify(s.serialize('tail:'+mode)));
 assert.equal(env.data.encounterDirector.live,undefined);assert.equal(s.loadEnvelope(env,'tail:'+mode),true);writeRealPathInput(h.state,{});h.step(120);
 assert.equal(h.state.player.credits,credits);assert.deepEqual(h.state.story.depthProgramEncounters,completedStory);assert.deepEqual(h.state.encounterDirector.cooldowns,cooldowns);assert.equal(h.state.encounterDirector.stats.resolved,resolved);assert.equal(Object.keys(h.state.encounterDirector.live).length,mode==='lost'?1:0);
 if(mode==='lost'){
  const restored=h.state.encounterDirector.live[live.id],r=restored.data.freightCargoCustody;
  const accounted=x=>x.carrierQty+x.playerCollectedQty+x.raiderSecuredQty+x.stationRecoveredQty+x.deliveredQty+x.lostQty+x.pods.filter(p=>p.status==='live').reduce((n,p)=>n+p.qty,0);
  assert.equal(env.data.encounterDirector.stats.openFreightCustodies.length,1);assert.equal(accounted(r),r.initialQty);assert.equal(r.terminal,false);
  h.step(Math.max(1,Math.ceil((r.deadlineAt-h.state.simTime+2)*60)));
  assert.equal(restored.outcome,'hauler_lost');assert.equal(r.terminal,true);assert.equal(accounted(r),r.initialQty);
  const penalties=events.filter(e=>e.n==='faction:repDelta'&&e.p.reason==='salvage_tail_lost');assert.equal(penalties.length,1);assert.equal(penalties[0].p.delta,-3);
  const terminalStory=structuredClone(h.state.story.depthProgramEncounters),terminalResolved=h.state.encounterDirector.stats.resolved;
  const terminal=JSON.parse(JSON.stringify(s.serialize('tail:lost:terminal')));assert.equal(s.loadEnvelope(terminal,'tail:lost:terminal'),true);h.step(120);
  assert.equal(events.filter(e=>e.n==='faction:repDelta'&&e.p.reason==='salvage_tail_lost').length,1);assert.deepEqual(h.state.story.depthProgramEncounters,terminalStory);assert.equal(h.state.encounterDirector.stats.resolved,terminalResolved);assert.equal(Object.keys(h.state.encounterDirector.live).length,0);
 }

 if(!['foreign','lost'].includes(mode)){assert.equal(intent.moveX,0);assert.equal(intent.moveZ,0);}
 if(mode==='capture')assert.ok([...h.state.entities.values()].some(e=>e.data?.vesselId==='tail:vessel'),'captured original survives Continue');
 console.log('TAIL_SAVE',JSON.stringify({mode,credits:h.state.player.credits,cooldowns:h.state.encounterDirector.cooldowns,resolved:h.state.encounterDirector.stats.resolved,completedStory:h.state.story.depthProgramEncounters,receipts:h.state.encounterDirector.receipts,proof:h.proof()}));
 }finally{h.dispose();}
}
