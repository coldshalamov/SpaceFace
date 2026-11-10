import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {PRODUCTION_FEATURES} from '../src/runtime/runtimeProfiles.js';
import {PRODUCTION_UPDATE_ORDER} from '../src/runtime/authoritativeSystemManifest.js';
import {world} from '../src/systems/world.js';
import {traffic} from '../src/systems/traffic.js';
import {asteroidSites} from '../src/systems/asteroidSites.js';
import {input,applyFlightKeyEvent} from '../src/systems/input.js';
import {flightV3} from '../src/systems/flightV3.js';
import {fields} from '../src/systems/fields.js';
import {planetRuntime} from '../src/systems/planetRuntime.js';
import {physics} from '../src/core/physics.js';
import {environmentalMachinery} from '../src/systems/environmentalMachinery.js';
import {npcJobsRuntime} from '../src/systems/npcJobsRuntime.js';
import {combat} from '../src/systems/combat.js';
import {collisionConsequences} from '../src/systems/collisionConsequences.js';
import {mining} from '../src/systems/mining.js';
import {cargo} from '../src/systems/cargo.js';
import {economy} from '../src/systems/economy.js';
import {scanner} from '../src/systems/scanner.js';
import {save} from '../src/save/saveSystem.js';
import {makeShipEntitySpec} from '../src/systems/ships.js';
import {PLANET_SITE,PLANET_FLAGS} from '../src/data/planets.js';
import {FIELD_FLAGS} from '../src/data/fields.js';
import {COMBAT_FLAGS} from '../src/data/featureFlags.js';
import {ANVIL_ORCHARD,normalizeOrchardRecord,orchardPhase} from '../src/data/anvilOrchard.js';
import {orchardTowQuote,orchardTowLease} from '../src/world/anvilOrchardTowAssist.js';
const worldRecords={name:'world',init(ctx){this.state=ctx.state;},upsertWorldRecord:world.upsertWorldRecord};
const trafficWork={...traffic,update(dt,state){this._stepAnvilWork(dt,state);}};
async function readyWorld({restoreWorld=false,amount=4}={}){
 const flags={planet:PLANET_FLAGS.enabled,fields:FIELD_FLAGS.enabled,shock:COMBAT_FLAGS.weaponImpulseConsequences};
 PLANET_FLAGS.enabled=true;FIELD_FLAGS.enabled=true;COMBAT_FLAGS.weaponImpulseConsequences=true;
 const selectedSystems=[restoreWorld?{...world,update(){}}:worldRecords,trafficWork,asteroidSites,input,npcJobsRuntime,
  flightV3,fields,planetRuntime,physics,environmentalMachinery,combat,collisionConsequences,cargo,mining,economy,scanner,save];
 // Focused owner composition, with actual production feature gates and relative tick order.
 const updateOrder=PRODUCTION_UPDATE_ORDER.map(id=>selectedSystems.find(d=>d.name===(id==='flightSlot'?flightV3.name:id))).filter(Boolean);
 const sim=createSimulation({seed:424214,runtimeConfig:{profileId:'production',features:PRODUCTION_FEATURES},systems:selectedSystems,updateOrder});
 const state=sim.state;state.mode='flight';state.world.currentSectorId=PLANET_SITE.sectorId;state.settings.gameplay.physicsBackend='rapier-dynamic';
 if(restoreWorld)sim.registry.get('world').enterSector(state.world.currentSectorId,{placePlayer:false});
 sim.step();
 const frame=state.entities.get(state.planet.orchardFrameId),collector=state.entities.get(state.planet.witnessId);
 const receiver=state.entityList.find(e=>e.data?.itinerary?.role==='receiver');assert.ok(frame&&collector&&receiver);
 const dx=frame.pos.x-state.planet.center.x,dz=frame.pos.z-state.planet.center.z,r=Math.hypot(dx,dz);
 const player=sim.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:(receiver.pos.x+frame.pos.x)/2,z:(receiver.pos.z+frame.pos.z)/2},rot:0}),isPlayer:true});
 state.playerId=player.id;state.player.credits=500;state.player.targetId=receiver.id;
 const facade=sim.registry.get('physics');assert.equal(await facade.prepareBackend(state),true);
 // Bounded setup: one normally owned finite pod is filled and mechanically released.
 // Measured service starts at the public hail; no live body pose/velocity is edited afterward.
 collector.data.itinerary.phase='collect';

 assert.equal(sim.registry.get('environmentalMachinery').acceptOrchardNewPod(collector,{frame,socket:1,qty:amount,commodityId:ANVIL_ORCHARD.commodityId}),amount);
 const native=facade._sg02;assert.equal(native.requestOrchardFiniteRelease(frame,1,state),true);
 for(let n=0;n<30;n++){state.tick++;state.simTime=state.tick/60;native.step(1/60,state.tick);native.publishCompletedOrchardContacts(native.completedOrchardTail(),()=>native.drainContactImpacts());}
 const pod=state.entityList.find(e=>e.data?.orchardKind==='pod');assert.equal(native.prepareOrchardPodHandoff(frame,pod,1,state).commit(),true);
 assert.ok(facade.readOrchardPodReady(pod));
 applyFlightKeyEvent(sim.registry.get('input'),{code:'Digit0',pressed:true});
 const offers=[],responses=[],done=[],lost=[],courses=[];sim.bus.on('ui:setCourse',p=>courses.push(p));sim.bus.on('contactHail:offer',p=>offers.push(p));sim.bus.on('contactHail:response',p=>responses.push(p));
 sim.bus.on('npcJobs:towAssistComplete',p=>done.push(p));sim.bus.on('npcJobs:towAssistLost',p=>lost.push(p));
 return {sim,state,frame,collector,receiver,player,pod,facade,native,offers,responses,done,lost,courses,flags};
}
function close(h){h.facade._disableSg02DynamicAuthority();h.sim.dispose();
 PLANET_FLAGS.enabled=h.flags.planet;FIELD_FLAGS.enabled=h.flags.fields;COMBAT_FLAGS.weaponImpulseConsequences=h.flags.shock;}
function hire(h){
 h.sim.bus.emit('contactHail:request',{targetId:h.receiver.id});const offer=h.offers.at(-1);
 assert.ok(offer?.orchardQuote,JSON.stringify(offer));assert.equal(offer.orchardQuote.feeCr,32);
 const frontendOffer=structuredClone(offer);
 frontendOffer.orchardQuote.feeCr=1;frontendOffer.orchardQuote.amount=99;
 // The ordinary frontend returns scalar choice fields; a forged transported quote
 // cannot replace scanner's retained request capability.
 h.sim.bus.emit('contactHail:choice',{requestId:frontendOffer.requestId,targetId:h.receiver.id,choice:'tow_assist',orchardQuote:frontendOffer.orchardQuote});
 assert.ok(h.state.npcJobs.byId[h.receiver.data.jobId]?.towAssist,JSON.stringify(h.responses));
 assert.equal(h.state.player.credits,468);return offer;
}
test('public hire uses existing receiver and physically retrieves an intact finite pod',async()=>{
 const h=await readyWorld();try{
  const manifest=structuredClone(h.receiver.data.cargoManifest),source=h.state.sites.anvilOrchard.sourceRemaining;
  assert.equal(h.state.runtime.features.combat.weaponImpulseConsequences,true);
  assert.equal(h.state.runtime.features.massline2.enabled,true);
  assert.equal(h.state.runtime.features.massline2.masslineHeadFrameCoupler,true);
  hire(h);const start={...h.pod.pos}, data=structuredClone(h.pod.data);let attached=false,minRadius=Infinity,maxHeat=0;
  const damage=[];h.sim.bus.on('combat:collisionConsequence',p=>{if(p.targetId===h.pod.id)damage.push({tick:h.state.tick,phase:h.state.npcJobs.byId[h.receiver.data.jobId]?.towAssist?.phase,targetId:p.targetId,otherId:p.otherId,otherType:p.otherType,hullDamage:p.hullDamage,otherName:h.state.entities.get(p.otherId)?.data?.name,otherKind:h.state.entities.get(p.otherId)?.data?.orchardKind});});
  const impacts=[];h.sim.bus.on('physics:impact',p=>{if((p.aId===h.pod.id||p.bId===h.pod.id)){const other=h.state.entities.get(p.aId===h.pod.id?p.bId:p.aId);impacts.push({tick:h.state.tick,aId:p.aId,bId:p.bId,otherName:other?.data?.name,otherKind:other?.data?.orchardKind,otherRole:other?.data?.itinerary?.role,dp:p.dp,impulse:p.impulse,phase:h.state.npcJobs.byId[h.receiver.data.jobId]?.towAssist?.phase});if(impacts.length>32)impacts.shift();}});
  let priorHull=h.pod.hull;const hullChanges=[],forecast=[];
  assert.equal(h.sim.registry.get('fields').hasExternal(h.state.planet.fieldId),true);
  for(let n=0;n<14400&&!h.done.length&&!h.lost.length;n++){
   if(n%600===0){if(process.env.ORCHARD_TRACE)console.error('ORCHARD_TICK',n,h.state.tick,JSON.stringify({assist:h.state.npcJobs.byId[h.receiver.data.jobId]?.towAssist,worker:h.receiver.pos,wv:h.receiver.vel,pod:h.pod.pos,pv:h.pod.vel}));await new Promise(resolve=>setImmediate(resolve));}
   h.sim.step();const entry=h.state.npcJobs.byId[h.receiver.data.jobId];
   const phase=orchardPhase(h.state.sites.anvilOrchard,h.state.tick);if(forecast.at(-1)?.phase!==phase?.phase)forecast.push({tick:h.state.tick,...phase});
   if(entry?.towAttachmentId && !attached){const line=h.sim.registry.get('npcJobsRuntime')._combatAttachments().get(entry.towAttachmentId);console.log('ORCHARD_POLICY',JSON.stringify({policy:line.tetherPolicy,relativeSpeed:Math.hypot(h.receiver.vel.x-h.pod.vel.x,h.receiver.vel.z-h.pod.vel.z),restLength:line.restLength}));assert.equal(line.tetherPolicy.headId,'frame_coupler');}
   attached ||= !!entry?.towAttachmentId;
   if(h.pod.hull<priorHull){hullChanges.push({tick:h.state.tick,phase:entry?.towAssist?.phase,before:priorHull,after:h.pod.hull,forecast:orchardPhase(h.state.sites.anvilOrchard,h.state.tick),contacts:impacts.filter(p=>p.tick>=h.state.tick-2),podSpeed:Math.hypot(h.pod.vel.x,h.pod.vel.z),tenderDistance:Math.hypot(h.receiver.pos.x-h.pod.pos.x,h.receiver.pos.z-h.pod.pos.z),restLength:entry?.towAttachmentId?h.sim.registry.get('npcJobsRuntime')._combatAttachments().get(entry.towAttachmentId)?.restLength:null});priorHull=h.pod.hull;}
   maxHeat=Math.max(maxHeat,h.state.planet.ships?.[h.pod.id]?.heat||0);
   assert.ok(h.facade.readOrchardPodReady(h.pod),`retained readiness at tick ${h.state.tick}: ${JSON.stringify({alive:h.pod.alive,hull:h.pod.hull,data:h.pod.data,mode:h.state.mode,playerHull:h.player.hull,podResident:h.native.records.has(h.pod.id),frameResident:h.native.records.has(h.frame.id),podCurrent:h.state.entities.get(h.pod.id)===h.pod,row:h.state.sites.anvilOrchard,vel:h.pod.vel,pos:h.pod.pos})}`);
   assert.deepEqual(h.pod.data,data);
   assert.ok(normalizeOrchardRecord(h.state.sites.anvilOrchard));
   minRadius=Math.min(minRadius,Math.hypot(h.pod.pos.x-h.state.planet.center.x,h.pod.pos.z-h.state.planet.center.z)-h.pod.radius);
  }
  console.log('ORCHARD_ASSIST_ROUTE',JSON.stringify({done:h.done,lost:h.lost,attached,minRadius,maxHeat,podAlive:h.pod.alive,podHull:h.pod.hull,
   moved:Math.hypot(h.pod.pos.x-start.x,h.pod.pos.z-start.z),tick:h.state.tick,worker:h.receiver.pos,pod:h.pod.pos,podSpeed:Math.hypot(h.pod.vel.x,h.pod.vel.z),workerSpeed:Math.hypot(h.receiver.vel.x,h.receiver.vel.z),fieldId:h.state.planet.fieldId,forecast,damage,hullChanges,impacts}));
  assert.equal(h.done.length,1);assert.equal(h.lost.length,0);assert.ok(attached);
  assert.equal(h.courses.length,1);assert.equal(h.courses[0].targetEntityId,h.pod.id);assert.equal(h.courses[0].autopilot,false);
  assert.deepEqual(h.receiver.data.cargoManifest,manifest);
  const row=h.state.sites.anvilOrchard;
  assert.equal(row.sourceRemaining+row.lots.reduce((n,l)=>n+l.units,0),48);
  assert.equal(row.lots.find(l=>l.id===h.pod.data.worldRecordId).units,4);
  assert.equal(source-row.sourceRemaining,row.lots.filter(l=>l.id!==h.pod.data.worldRecordId).reduce((n,l)=>n+l.units,0));
  assert.equal(h.receiver.data.jobId,undefined);assert.equal(orchardTowLease(h.state,h.pod),null);
  assert.ok(Math.hypot(h.pod.pos.x-h.state.planet.center.x,h.pod.pos.z-h.state.planet.center.z)-h.pod.radius>PLANET_SITE.field.radius);
  assert.ok(Math.hypot(h.pod.vel.x,h.pod.vel.z)<=20);
  assert.ok(h.player.alive && h.player.hull>0);
  const keys=h.sim.registry.get('input'),press=(code,pressed)=>applyFlightKeyEvent(keys,{code,pressed});
  const before=h.state.player.cargo.items[ANVIL_ORCHARD.commodityId]||0;
  const receipts=[];h.sim.bus.on('pickup:collected',p=>{if(p.pickupId===h.pod.id)receipts.push({...p});});
  for(let n=0;n<7200&&h.pod.alive!==false;n++){
   if(n%600===0){if(process.env.ORCHARD_TRACE)console.error('PICKUP_TICK',n,h.state.tick);await new Promise(resolve=>setImmediate(resolve));}
   const dx=h.pod.pos.x-h.player.pos.x,dz=h.pod.pos.z-h.player.pos.z,d=Math.hypot(dx,dz),speed=Math.hypot(h.player.vel.x,h.player.vel.z);
   const error=Math.atan2(Math.sin(Math.atan2(dz,dx)-h.player.rot),Math.cos(Math.atan2(dz,dx)-h.player.rot));
   const turn=error-h.player.angVel*.4;
   press('ArrowLeft',turn<-.035);press('ArrowRight',turn>.035);
   const brake=d<4||speed>65||Math.abs(error)>.5||speed*speed/90>d-4;
   press('Digit0',brake);press('KeyW',!brake&&d>4);h.sim.step();
   if(h.pod.alive!==false && !h.facade.readOrchardPodReady(h.pod)){console.log('READY_LOST',JSON.stringify({tick:h.state.tick,d,data:h.pod.data,prior:data,cargo:h.state.player.cargo,framePose:!!h.facade.readOrchardFramePose(h.frame),pod:h.pod.pos,player:h.player.pos}));assert.fail('ready custody lost during pickup route');}
  }
  console.log('PICKUP_DEBUG',JSON.stringify({player:h.player.pos,vel:h.player.vel,alive:h.player.alive,hull:h.player.hull,pod:h.pod.pos,podVel:h.pod.vel,ready:!!h.facade.readOrchardPodReady(h.pod),mode:h.state.mode,playerId:h.state.playerId}));
  assert.equal(h.pod.alive,false,'normal proximity pickup after keyboard flight');
  assert.equal(h.state.player.cargo.items[ANVIL_ORCHARD.commodityId],before+4);
  const collectedRow=h.state.sites.anvilOrchard;
  assert.equal(collectedRow.lots.find(l=>l.id===data.worldRecordId).outcome,'delivered');
  assert.equal(collectedRow.sourceRemaining+collectedRow.lots.reduce((n,l)=>n+l.units,0),48);
  assert.equal(receipts.length,1);assert.equal(receipts[0].acceptedAmount,4);assert.equal(receipts[0].rejectedAmount,0);
  for(let n=0;n<30;n++)h.sim.step();
  assert.equal(receipts.length,1);assert.equal(h.state.player.cargo.items[ANVIL_ORCHARD.commodityId],before+4);
  assert.equal(h.state.player.credits,468);
  console.log('ORCHARD_ASSIST_PICKUP',JSON.stringify({tick:h.state.tick,sourceRemaining:collectedRow.sourceRemaining,lots:collectedRow.lots,receipts}));
 }finally{close(h);}
});

for(const terminal of ['cancel','timeout','worker-death','pod-death','world-replacement','worker-life-replacement'])
 test(`Orchard ${terminal} clears exact lease and restores existing receiver duty`,async()=>{
 const h=await readyWorld();try{
  const manifest=structuredClone(h.receiver.data.cargoManifest);hire(h);
  const jobs=h.sim.registry.get('npcJobsRuntime'),jobId=h.receiver.data.jobId,entry=h.state.npcJobs.byId[jobId];
  assert.ok(orchardTowLease(h.state,h.pod));
  if(terminal==='cancel')jobs.releaseControl(jobId,entry.towAssist.claimId);
  if(terminal==='timeout')h.state.simTime+=241;
  if(terminal==='worker-death')h.receiver.alive=false;
  if(terminal==='pod-death')h.pod.alive=false;
  if(terminal==='world-replacement')h.state.world={...h.state.world};
  let replacement,replacementData;
  if(terminal==='worker-life-replacement'){
   replacement={...h.receiver,data:structuredClone(h.receiver.data),ai:{sentinel:true}};
   replacementData=structuredClone(replacement.data);h.state.entities.set(h.receiver.id,replacement);
  }
  jobs._stepTowAssists();jobs._stepTowAssists();
  assert.equal(orchardTowLease(h.state,h.pod),null);assert.equal(h.state.npcJobs.byId[jobId],undefined);
  assert.equal(h.lost.length,1);assert.equal(h.state.player.credits,468);
  assert.deepEqual(h.receiver.data.cargoManifest,manifest);
  if(replacement){assert.deepEqual(replacement.ai,{sentinel:true});assert.deepEqual(replacement.data,replacementData);}
  else assert.equal(h.receiver.data.jobId,undefined);
 }finally{close(h);}
});

test('stale quote and existing worker job refuse before charging',async()=>{
 const h=await readyWorld();try{
  const quote=orchardTowQuote(h.state,h.receiver);assert.ok(quote);
  h.state.simTime=quote.expiresAt;
  const traffic=h.sim.registry.get('traffic');
  assert.equal(traffic.requestOrchardTowAssist(h.receiver,quote).granted,false);
  assert.equal(h.state.player.credits,500);
  const fresh=orchardTowQuote(h.state,h.receiver),jobId=`job:${h.receiver.data.worldRecordId}`,sentinel={sentinel:true};
  h.state.npcJobs.byId[jobId]=sentinel;
  assert.equal(traffic.requestOrchardTowAssist(h.receiver,fresh).granted,false);
  assert.equal(h.state.npcJobs.byId[jobId],sentinel);assert.equal(h.state.player.credits,500);
 }finally{close(h);}
});

test('Continue job-owner restore refunds once and returns the existing receiver to ordinary duty',async()=>{
 const h=await readyWorld();try{
  hire(h);const jobs=h.sim.registry.get('npcJobsRuntime'),manifest=structuredClone(h.receiver.data.cargoManifest);
  // Isolate the service owner's serialized lease policy. Full-world native Continue is
  // a separate integration requirement; this seam makes no full-Continue claim.
  const saved=JSON.parse(JSON.stringify(jobs.serialize()));
  jobs.deserialize(saved);jobs._reportDroppedTowAssists();
  assert.equal(h.state.player.credits,500);assert.equal(orchardTowLease(h.state,h.pod),null);
  jobs._reportDroppedTowAssists();assert.equal(h.state.player.credits,500);
  assert.equal(Object.keys(h.state.npcJobs.byId).length,0);
  assert.equal(h.receiver.data.jobId,undefined);assert.deepEqual(h.receiver.data.cargoManifest,manifest);
 }finally{close(h);}
});

for(const endpoint of ['pod','receiver'])test(`existing ${endpoint} line refuses Orchard dispatch without charging`,async()=>{
 const h=await readyWorld();try{
  const a=h.sim.registry.get('npcJobsRuntime')._combatAttachments();
  const made=a.create({defId:'tether_standard',ownerId:h.player.id,targetId:h[endpoint].id});
  assert.equal(made.ok,true,JSON.stringify(made));
  assert.equal(orchardTowQuote(h.state,h.receiver),null);assert.equal(h.state.player.credits,500);
 }finally{close(h);}
});

test('lease rejects create transfer and rebind at both endpoints without touching existing lines',async()=>{
 const h=await readyWorld();try{
  const other=h.sim.spawn({...makeShipEntitySpec('ship_mule',{pos:{x:h.player.pos.x+30,z:h.player.pos.z},rot:0})});
  h.facade._syncSg02DynamicAuthorityEntities(h.state);
  const a=h.sim.registry.get('npcJobsRuntime')._combatAttachments();
  const made=a.create({defId:'tether_standard',ownerId:h.player.id,targetId:other.id});assert.equal(made.ok,true,JSON.stringify(made));
  const line=made.attachment,original={ownerId:line.ownerId,targetId:line.targetId,physicsHandle:line.physicsHandle};
  hire(h);
  for(const endpoint of [h.pod,h.receiver]){
   assert.equal(a.create({defId:'tether_standard',ownerId:h.player.id,targetId:endpoint.id}).reason,'orchard_tow_reserved');
   assert.equal(a.create({defId:'tether_standard',ownerId:endpoint.id,targetId:other.id}).reason,'orchard_tow_reserved');
   assert.equal(a.rebind(line.id,h.player.id,{targetId:endpoint.id}).reason,'orchard_tow_reserved');
   assert.equal(a.rebind(line.id,h.player.id,{ownerId:endpoint.id}).reason,'orchard_tow_reserved');
   assert.equal(a.transfer(line.id,h.player.id,endpoint.id).reason,'orchard_tow_reserved');
   assert.equal(line.state,'active');assert.deepEqual({ownerId:line.ownerId,targetId:line.targetId,physicsHandle:line.physicsHandle},original);
  }
  h.state.simTime+=241;
  const rebound=a.rebind(line.id,h.player.id,{targetId:h.receiver.id});assert.equal(rebound.ok,true,JSON.stringify(rebound));
 }finally{close(h);}
});

for(const amount of [1,2,3])test(`finite ${amount}-unit quote charges exactly quarter base value`,async()=>{
 const h=await readyWorld({amount});try{
  const quote=orchardTowQuote(h.state,h.receiver);assert.equal(quote.amount,amount);assert.equal(quote.feeCr,amount*8);
  const result=h.sim.registry.get('traffic').requestOrchardTowAssist(h.receiver,quote);
  assert.equal(result.granted,true);assert.equal(h.state.player.credits,500-amount*8);
  assert.equal(h.sim.registry.get('traffic').requestOrchardTowAssist(h.receiver,quote).granted,false);
  assert.equal(h.state.player.credits,500-amount*8);assert.equal(h.pod.data.amount,amount);
 }finally{close(h);}
});

test('admission cancelled during charge refunds only the actual charged fee',async()=>{
 const h=await readyWorld();try{
  h.sim.bus.on('economy:chargeCredits',()=>h.sim.registry.get('npcJobsRuntime').release(h.receiver.data.jobId));
  const quote=orchardTowQuote(h.state,h.receiver);
  const result=h.sim.registry.get('traffic').requestOrchardTowAssist(h.receiver,quote);
  assert.equal(result.granted,false);assert.equal(h.state.player.credits,500);
  assert.equal(h.receiver.data.jobId,undefined);assert.equal(orchardTowLease(h.state,h.pod),null);
 }finally{close(h);}
});

test('receiver existing hardware can bind a native Orchard line without permanent refitting',async()=>{
 const h=await readyWorld();try{
  const before=structuredClone(h.receiver.data.derived),head=h.receiver.data.npcMasslineHeadId;
  const a=h.sim.registry.get('npcJobsRuntime')._combatAttachments();
  const made=a.create({defId:'tether_standard',ownerId:h.receiver.id,targetId:h.pod.id,controlMode:'npc_tow'});
  assert.equal(made.ok,true,JSON.stringify(made));assert.ok(h.native.attachments.has(made.attachment.id));
  assert.deepEqual(h.receiver.data.derived,before);assert.equal(h.receiver.data.npcMasslineHeadId,head);
 }finally{close(h);}
});

for(const replaced of ['pod','receiver'])test(`transported hail refuses replaced ${replaced} before charging`,async()=>{
 const h=await readyWorld();try{
  h.sim.bus.emit('contactHail:request',{targetId:h.receiver.id});const front=structuredClone(h.offers.at(-1));
  const original=h[replaced],replacement={...original,data:structuredClone(original.data)};
  h.state.entities.set(original.id,replacement);
  h.sim.bus.emit('contactHail:choice',{requestId:front.requestId,targetId:front.targetId,choice:'tow_assist'});
  assert.equal(h.state.player.credits,500);assert.equal(Object.keys(h.state.npcJobs.byId).length,0);
 }finally{close(h);}
});

test('unleased native pod keeps ordinary two-line attachment capacity',async()=>{
 const h=await readyWorld();try{
  const a=h.sim.registry.get('npcJobsRuntime')._combatAttachments();
  const first=a.create({defId:'tether_standard',ownerId:h.receiver.id,targetId:h.pod.id});
  const second=a.create({defId:'tether_standard',ownerId:h.player.id,targetId:h.pod.id});
  assert.equal(first.ok,true,JSON.stringify(first));assert.equal(second.ok,true,JSON.stringify(second));
  assert.notEqual(first.attachment.id,second.attachment.id);
  assert.ok(h.native.attachments.has(first.attachment.id));assert.ok(h.native.attachments.has(second.attachment.id));
  assert.ok(h.facade.readOrchardPodReady(h.pod));
 }finally{close(h);}
});

for(const changed of [false,true])test(`completion guidance ${changed?'preserves a newer course':'uses existing waypoint owner without autopilot'}`,async()=>{
 const h=await readyWorld();try{
  hire(h);const scanner=h.sim.registry.get('scanner');
  if(changed)h.state.nav.waypoint={label:'player new course',pos:{x:1,z:2}};
  // A stale same-job notification must not consume the current lot/life guidance.
  scanner._guideOrchardPickup({jobId:h.receiver.data.jobId,targetId:h.pod.id,targetGeneration:h.pod.occupantGeneration+1,lotId:h.pod.data.worldRecordId});
  assert.ok(scanner._orchardTowGuidance);assert.equal(h.courses.length,0);
  // Focused delivery-notification contract. Physical completion is covered by the route test.
  scanner._guideOrchardPickup({jobId:h.receiver.data.jobId,targetId:h.pod.id,targetGeneration:h.pod.occupantGeneration,lotId:h.pod.data.worldRecordId});
  assert.equal(h.courses.length,changed?0:1);
  if(!changed){assert.equal(h.courses[0].targetEntityId,h.pod.id);assert.equal(h.courses[0].autopilot,false);}
  scanner._guideOrchardPickup({jobId:h.receiver.data.jobId,targetId:h.pod.id,targetGeneration:h.pod.occupantGeneration,lotId:h.pod.data.worldRecordId});assert.equal(h.courses.length,changed?0:1);
 }finally{close(h);}
});

test('cancelling an attached lease removes native line without changing finite custody or receiver equipment',async()=>{
 const h=await readyWorld();try{
  const derived=structuredClone(h.receiver.data.derived),head=h.receiver.data.npcMasslineHeadId,data=structuredClone(h.pod.data);
  hire(h);const jobs=h.sim.registry.get('npcJobsRuntime'),jobId=h.receiver.data.jobId,entry=h.state.npcJobs.byId[jobId];
  // Focused cleanup seam: create the real line through the same service owner, then cancel.
  assert.equal(jobs._attachTowAssist(entry,h.receiver,h.pod),true);
  const id=entry.towAttachmentId;assert.ok(h.native.attachments.has(id));
  jobs.release(jobId);jobs.release(jobId);
  assert.equal(h.native.attachments.has(id),false);assert.equal(orchardTowLease(h.state,h.pod),null);
  assert.ok(h.facade.readOrchardPodReady(h.pod));assert.deepEqual(h.pod.data,data);
  assert.deepEqual(h.receiver.data.derived,derived);assert.equal(h.receiver.data.npcMasslineHeadId,head);
  assert.equal(h.receiver.data.jobId,undefined);assert.equal(h.state.player.credits,468);assert.equal(h.lost.length,1);
 }finally{close(h);}
});


test('production host accepts scalar hail choice and ignores a forged frontend quote clone',async()=>{
 // Transport contract only: an explicitly staged native frame avoids claiming a normal
 // world-entry route. All hail/choice traffic crosses the production command channel.
 const {readFileSync}=await import('node:fs');
 const base=new URL('../',import.meta.url).href;
const [{createSimHost},{ANVIL_ORCHARD,createOrchardRecord},{ORCHARD_GEOMETRY:G,orchardFrameBodySpec},{createOrchardMotorState},{makeShipEntitySpec},{applyFrameOrigin,snapFrameOrigin},{SIM_COMMAND_TYPES}]=await Promise.all(['scripts/lib/simWorkerHost.mjs','src/data/anvilOrchard.js','src/data/anvilOrchardBody.js','src/core/anvilOrchardNative.js','src/systems/ships.js','src/core/coordinates.js','scripts/lib/simCommandChannel.mjs'].map(p=>import(base+p)));
const lane=createSimHost();try{
const init=await lane.init({profile:'production',bridgeAll:true,seed:424214,scenarioContract:JSON.parse(readFileSync(new URL('src/data/scenarios/47a.scenario.json',base)))});const {state,sim,registry}=lane.host;
state.mode='flight';state.ui.screenStack=[];state.ui.docked=false;state.world.currentSectorId=ANVIL_ORCHARD.sectorId;state.sites.anvilOrchard=createOrchardRecord(0);
const center={x:11900,z:8300};registry.get('traffic').ensureAnvilWorker(state,spec=>sim.spawn(spec),center);
const worker=state.entityList.find(e=>e.data?.itinerary?.role==='collector');const receiver=state.entityList.find(e=>e.data?.itinerary?.role==='receiver');assert.ok(worker&&receiver);
const player=sim.spawn({...makeShipEntitySpec('ship_kestrel',{pos:{x:13900,z:8300},rot:0}),isPlayer:true});state.playerId=player.id;state.player.targetId=receiver.id;state.player.credits=500;
const frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:0,radius:G.radius,hull:300,flags:{persistent:true},physicsBody:orchardFrameBodySpec(),data:{orchardId:ANVIL_ORCHARD.id,orchardKind:'frame',worldRecordId:G.worldRecordId,placeId:'place_anvil_storm_orchard',authoredAssetId:G.assetId,authoredPayloadAssetId:G.assetId,masslineTetherable:false,orchardCollars:createOrchardMotorState()}});
Object.assign(state.planet,{center,orchardFrameId:frame.id,active:true});applyFrameOrigin(state,snapFrameOrigin(player.pos,{}));const p=registry.get('physics');assert.equal(await p.prepareBackend(state),true);worker.data.itinerary.phase='collect';
assert.equal(registry.get('environmentalMachinery').acceptOrchardNewPod(worker,{frame,socket:1,qty:4,commodityId:ANVIL_ORCHARD.commodityId}),4);const native=p._sg02;assert.equal(native.requestOrchardFiniteRelease(frame,1,state),true);
for(let tick=1;tick<=30;tick++){state.tick=tick;state.simTime=tick/60;native.step(1/60,tick);native.publishCompletedOrchardContacts(native.completedOrchardTail(),()=>native.drainContactImpacts());}
const pod=state.entityList.find(e=>e.data?.orchardKind==='pod');assert.equal(native.prepareOrchardPodHandoff(frame,pod,1,state).commit(),true);
let seq=0;const send=async(type,payload)=>structuredClone(await lane.tick({tick:++seq,steps:0,ackEnd:init.journalSequence,commands:[{seq,t:SIM_COMMAND_TYPES.BUS,p:{emit:type,payload}}]}));
const reply=await send('contactHail:request',{targetId:receiver.id});
const event=reply.events.find(e=>(e.type||e.t)==='contactHail:offer');assert.ok(event);const offer=event.payload||event.p;assert.equal(offer.orchardQuote.feeCr,32);assert.notEqual(offer.orchardQuote,registry.get('scanner')._contactHail.orchardQuote);offer.orchardQuote.feeCr=1;
await send('contactHail:choice',{requestId:offer.requestId,targetId:offer.targetId,choice:'tow_assist',orchardQuote:offer.orchardQuote});assert.equal(state.player.credits,468);assert.ok(state.npcJobs.byId[receiver.data.jobId]?.towAssist);
}finally{lane.host.registry.get('physics')._disableSg02DynamicAuthority();await lane.shutdown();}

});

test('another NPC cannot hire the original finite pod during the approach lease',async()=>{
 const h=await readyWorld();try{
  const offer=hire(h),jobs=h.sim.registry.get('npcJobsRuntime');
  const jobId=jobs.assign(h.collector,{kind:'tender',sectorId:PLANET_SITE.sectorId,
   route:[{id:'a',pos:{...h.collector.pos}},{id:'b',pos:{...h.receiver.pos}}]});
  assert.ok(jobId);assert.equal(h.state.npcJobs.byId[h.receiver.data.jobId].towAttachmentId,null);
  const result=jobs.requestTowAssist(h.collector.id,h.pod.id,offer.orchardQuote.destination,{feeCr:32});
  assert.equal(result.granted,false);assert.equal(h.state.player.credits,468);
  assert.equal(orchardTowLease(h.state,h.pod).worker,h.receiver);
 }finally{close(h);}
});

for(const result of ['success','null','throw','cancel','worker-replacement','pod-replacement','data-replacement','pod-data-replacement','derived-replacement','descriptor-change'])test(`scoped coupler creation restores equipment and fences ${result}`,async()=>{
 const h=await readyWorld();try{
  const jobs=h.sim.registry.get('npcJobsRuntime');hire(h);
  const id=h.receiver.data.jobId,entry=h.state.npcJobs.byId[id],a=jobs._combatAttachments();
  const data=h.receiver.data,derived=data.derived;
  Object.defineProperty(derived,'masslineHeadId',{value:'tractor',writable:true,enumerable:false,configurable:true});
  const before=Object.getOwnPropertyDescriptor(derived,'masslineHeadId'),npc=Object.getOwnPropertyDescriptor(data,'npcMasslineHeadId');
  let created;
  if(result==='null'||result==='throw'){jobs._combatAttachments=()=>({...a,create(){if(result==='throw')throw Error('test refusal');return null;}});}
  else h.sim.bus.on('tether:attached',()=>{
   if(result==='cancel')jobs.release(id);
   if(result==='worker-replacement'||result==='pod-replacement'){
    const original=result==='worker-replacement'?h.receiver:h.pod;
    h.state.entities.set(original.id,{...original,data:structuredClone(original.data)});
   }
   if(result==='derived-replacement')data.derived={marker:true};
   if(result==='pod-data-replacement')h.pod.data={...h.pod.data};
   if(result==='data-replacement')h.receiver.data={...data,derived:{marker:true}};
   if(result==='descriptor-change')Object.defineProperty(derived,'masslineHeadId',{value:'frame_coupler',writable:true,enumerable:true,configurable:true});
  });
  const ok=jobs._attachTowAssist(entry,h.receiver,h.pod);
  if(['null','throw','cancel','worker-replacement','pod-replacement','data-replacement','pod-data-replacement'].includes(result))assert.equal(ok,false);
  if(result==='success'){
   assert.equal(ok,true);created=a.get(entry.towAttachmentId);assert.equal(created.tetherPolicy.headId,'frame_coupler');
  }
  if(!['data-replacement','derived-replacement','descriptor-change'].includes(result)){
   assert.deepEqual(Object.getOwnPropertyDescriptor(derived,'masslineHeadId'),before);
   assert.deepEqual(Object.getOwnPropertyDescriptor(data,'npcMasslineHeadId'),npc);
  }
  if(result==='derived-replacement'){assert.deepEqual(data.derived,{marker:true});assert.deepEqual(Object.getOwnPropertyDescriptor(data,'npcMasslineHeadId'),npc);}
  if(result==='data-replacement')assert.deepEqual(h.receiver.data.derived,{marker:true});
  if(result==='descriptor-change')assert.equal(Object.getOwnPropertyDescriptor(derived,'masslineHeadId').enumerable,true);
  if(['cancel','worker-replacement','pod-replacement'].includes(result))assert.equal([...h.native.attachments.values()].length,0);
 }finally{close(h);}
});

for(const native of [false,true])test(`paid hire survives populated world ${native?'native':'scalar'} Continue as one refund and same finite lot`,async()=>{
 const h=await readyWorld({restoreWorld:true});try{
  // readyWorld entered the actual sector before admitting workers; never resurrect
  // a receiver retired by hard-entry traffic cleanup.
  assert.ok(h.state.entityList.some(e=>e.type==='station'&&e.data.stationId==='station_tethys'));
  h.state.player.targetId=h.receiver.id;
  const manifest=structuredClone(h.receiver.data.cargoManifest),receiverRecord=h.receiver.data.worldRecordId;
  hire(h);const row=structuredClone(h.state.sites.anvilOrchard),lot=h.pod.data.worldRecordId;
  const saver=h.sim.registry.get('save'),envelope=JSON.parse(JSON.stringify(saver.serialize('orchard-paid-continue')));
  delete envelope.checksum;if(!native)envelope.data.physics=null;
  assert.equal(saver.loadEnvelope(envelope),true);
  const state=h.sim.state,pod=state.entityList.find(e=>e.data?.worldRecordId===lot);
  assert.ok(pod);assert.ok(h.facade.readOrchardPodReady(pod));
  assert.deepEqual(state.sites.anvilOrchard,row);assert.equal(state.player.credits,500);
  assert.equal(Object.values(state.npcJobs.byId).filter(e=>e.orchardAssist||e.towAssist).length,0);
  assert.equal(orchardTowLease(state,pod),null);
  const receiver=state.entityList.find(e=>e.alive!==false&&e.data?.worldRecordId===receiverRecord);
  assert.ok(receiver);assert.equal(receiver.data.jobId,undefined);
  assert.equal(receiver.data.itinerary.role,'receiver');assert.deepEqual(receiver.data.cargoManifest,manifest);
  h.sim.registry.get('npcJobsRuntime')._reportDroppedTowAssists();assert.equal(state.player.credits,500);
 }finally{close(h);}
});

for(const action of ['cancel','replace'])test(`reel callback ${action} cannot resume stale service intents`,async()=>{
 const h=await readyWorld();try{
  hire(h);const jobs=h.sim.registry.get('npcJobsRuntime'),id=h.receiver.data.jobId,entry=h.state.npcJobs.byId[id];
  assert.equal(jobs._attachTowAssist(entry,h.receiver,h.pod),true);entry.towAssist.phase='tow';
  let replacement,before,calls=0;
  h.sim.bus.on('tether:reel',()=>{calls++;
   if(action==='cancel')jobs.release(id);
   else {replacement={...h.receiver,data:structuredClone(h.receiver.data)};h.state.entities.set(h.receiver.id,replacement);before=structuredClone(replacement.data);}
  });
  jobs._stepTowAssist(entry,id);assert.equal(calls,1);
  if(replacement)assert.deepEqual(replacement.data,before);
  else assert.equal(h.receiver.data.intent.moveZ,0);
  jobs._stepTowAssists();assert.equal(h.done.length,0);assert.equal(orchardTowLease(h.state,h.pod),null);
 }finally{close(h);}
});

test('pause preserves exact lease and endpoint exclusivity until resume',async()=>{
 const h=await readyWorld();try{
  const other=h.sim.spawn({...makeShipEntitySpec('ship_mule',{pos:{x:h.player.pos.x+30,z:h.player.pos.z},rot:0})});
  h.facade._syncSg02DynamicAuthorityEntities(h.state);
  const a=h.sim.registry.get('npcJobsRuntime')._combatAttachments(),line=a.create({defId:'tether_standard',ownerId:h.player.id,targetId:other.id}).attachment;
  assert.ok(line);hire(h);const lease=orchardTowLease(h.state,h.pod);h.state.mode='paused';
  assert.equal(orchardTowLease(h.state,h.pod),lease);
  for(const endpoint of [h.pod,h.receiver]){
   assert.equal(a.create({defId:'tether_standard',ownerId:h.player.id,targetId:endpoint.id}).reason,'orchard_tow_reserved');
   assert.equal(a.rebind(line.id,h.player.id,{targetId:endpoint.id}).reason,'orchard_tow_reserved');
   assert.equal(a.transfer(line.id,h.player.id,endpoint.id).reason,'orchard_tow_reserved');
  }
  h.state.mode='flight';assert.equal(orchardTowLease(h.state,h.pod),lease);
  h.state.mode='menu';assert.equal(orchardTowLease(h.state,h.pod),null);
 }finally{close(h);}
});
