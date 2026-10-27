import assert from 'node:assert/strict';
import {save} from '../src/save/saveSystem.js';
import {bootRealPath,writeRealPathInput} from '../scripts/lib/bench/realPath.mjs';
import {encounterDirector} from '../src/systems/encounterDirector.js';
import {combat} from '../src/systems/combat.js';
import {economy} from '../src/systems/economy.js';
import {factions} from '../src/systems/factions.js';
const h=await bootRealPath({seed:4242,systems:['tacticalAI','flightV3','aiPorts','weapons','physics','collisionConsequences',combat,economy,factions,encounterDirector,save],bounds:{center:{x:0,z:0},radius:4200,hardRadius:4700},prepareState({state}){state.world.currentSectorId='sector_ceres_belt';state.story.beatIndex=7;},hulls:[{hullId:'ship_wasp',isPlayer:true,pos:{x:0,z:200}}]});
try{
 const d=h.runtime.getSystem('encounterDirector');
 const req=d.requestAuthoredEncounter({shapeId:'salvage_dispute',encounterId:'pitborn-native:1',sectorId:'sector_ceres_belt',anchor:{x:0,z:0},force:true});
 assert.equal(req.ok,true); const live=h.state.encounterDirector.live[req.encounterId],m=live.data.dispute;
 const tender=h.state.entities.get(m.tenderId),pod=h.state.entities.get(m.podId),wreck=h.state.entities.get(m.wreckId);

 const start={...pod.pos},events=[],samples=[];
 const kernel=h.runtime.getSystem('actions')?.kernel||h.runtime.getSystem('combat')?.kernel;
 let attachment=null,stage='seek',waypoint=0,terminal=null,minWreckContact=Infinity;
 const route=[{x:-600,z:650},{x:-600,z:-650}];
 const physics=h.runtime.getSystem('physics');
 const contact=(a,b)=>{const sg=physics._sg02,ar=sg.records.get(a.id),br=sg.records.get(b.id);if(!ar||!br)return null;let distance=Infinity;for(const ca of ar.colliders)for(const cb of br.colliders){const c=ca.contactCollider(cb,3000);if(c)distance=Math.min(distance,c.distance);}return Number.isFinite(distance)?distance:null;};
 const remove=d.helpers.removeEntity;
 d.helpers.removeEntity=(id,options)=>{if(id===pod.id)terminal={time:h.state.simTime,poses:{tender:{...tender.pos},pod:{...pod.pos},wreck:{...wreck.pos}},actualGap:contact(tender,pod),radiusGap:Math.hypot(tender.pos.x-pod.pos.x,tender.pos.z-pod.pos.z)-tender.radius-pod.radius,relativeSpeed:Math.hypot(tender.vel.x-pod.vel.x,tender.vel.z-pod.vel.z),podDisplacement:Math.hypot(pod.pos.x-start.x,pod.pos.z-start.z),bodies:{tender:tender.physicsBody,pod:pod.physicsBody,wreck:wreck.physicsBody},activeLine:kernel.attachments.get(attachment?.id)?.state};return remove(id,options);};
 for(const n of ['encounter:voice','encounter:resolved','tether:attached','tether:broke','economy:grantCredits','faction:repDelta','physics:impact'])h.bus.on(n,p=>{if(n!=='physics:impact'||[p.aId,p.bId].includes(tender.id)||[p.aId,p.bId].includes(pod.id))events.push({n,t:h.state.simTime,p});});
 h.step(18000,{before(){
   const p=h.player;
   if(!attachment&&Math.hypot(p.pos.x-pod.pos.x,p.pos.z-pod.pos.z)<95){
     const result=h.withFeatures(()=>kernel.attachments.create({defId:'tether_standard',ownerId:p.id,targetId:pod.id}));
     assert.equal(result.ok,true,JSON.stringify(result));attachment=result.attachment;stage='tow';
   }
   let goal;
   if(stage==='seek')goal={x:pod.pos.x-65,z:pod.pos.z};
   else if(waypoint<route.length){goal=route[waypoint];if(Math.hypot(goal.x-p.pos.x,goal.z-p.pos.z)<35)waypoint++;}
   else {const dx=start.x-tender.pos.x,dz=start.z-tender.pos.z,len=Math.hypot(dx,dz);goal={x:tender.pos.x-dx/len*(attachment.restLength-48),z:tender.pos.z-dz/len*(attachment.restLength-48)};}
   const dx=goal.x-p.pos.x,dz=goal.z-p.pos.z,range=Math.hypot(dx,dz),scale=range>0?Math.min(28,range*.3)/range:0;
   const ax=(dx*scale-p.vel.x)*.04,az=(dz*scale-p.vel.z)*.04,c=Math.cos(p.rot),s=Math.sin(p.rot);
   writeRealPathInput(h.state,{moveZ:ax*c+az*s,moveX:-ax*s+az*c});
 },after({index}){
   if(index===1)h.assertBodies([tender,pod,wreck]);
   if(index%30===0){const gap=contact(tender,wreck);if(gap!=null)minWreckContact=Math.min(minWreckContact,gap);}
   if(index%600===0)samples.push({time:h.state.simTime,stage,waypoint,player:{...h.player.pos},pod:{...pod.pos},line:attachment&&kernel.attachments.get(attachment.id)?.state});
   return live.phase!=='done';
 }});
 const impactRows=events.filter(e=>e.n==='physics:impact');const uniqueImpacts=[...new Map(impactRows.map(e=>[e.p.pairKey+':'+e.p.tick,e])).values()];
 console.log('PITBORN_TOW',JSON.stringify({time:h.state.simTime,outcome:live.outcome,terminal,minWreckContact,pool:wreck.data.salvagePool,claim:wreck.data.salvorClaimedBy,events:events.filter(e=>e.n!=='physics:impact'),impacts:{observations:impactRows.length,unique:uniqueImpacts},samples,proof:h.proof()}));
 assert.equal(live.outcome,'rescued');assert.ok(terminal.podDisplacement>100);assert.ok(terminal.actualGap>0);assert.ok(terminal.relativeSpeed<=5);assert.equal(h.state.entities.get(pod.id),undefined);assert.equal(wreck.data.salvorClaimedBy,undefined);

 assert.equal(events.filter(e=>e.n==='economy:grantCredits'&&e.p.reason==='salvage_dispute:rescued').length,1);
 assert.equal(impactRows.some(e=>[e.p.aId,e.p.bId].includes(tender.id)&&[e.p.aId,e.p.bId].includes(wreck.id)),false);
 const owner=h.runtime.getSystem('save'),credits=h.state.player.credits,envelope=JSON.parse(JSON.stringify(owner.serialize('pitborn-rescued')));
 assert.equal(credits,260);assert.equal(envelope.data.encounterDirector.live,undefined);
 assert.ok(envelope.data.encounterDirector.receipts.some(x=>x.shapeId==='salvage_dispute'||x.shape==='salvage_dispute'||x.encounterId===live.id),JSON.stringify(envelope.data.encounterDirector.receipts));
 assert.equal(owner.loadEnvelope(envelope,'pitborn-rescued'),true);writeRealPathInput(h.state,{});h.step(120);
 assert.equal(h.state.player.credits,credits);assert.equal(Object.keys(h.state.encounterDirector.live).length,0);
 console.log('PITBORN_COMPLETED_SAVE',JSON.stringify({credits:h.state.player.credits,receipts:h.state.encounterDirector.receipts,live:h.state.encounterDirector.live}));
}finally{h.dispose();}
