// Full production world. Initial observer relocation/cargo12/violence spill only.
// Measured leg uses normalized keyboard events and explicit Hail choices; no body edits.
import {writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {anvilReceiverFixture} from './anvil-receiver-native.mjs';
import {anvilWorkerRecordId} from '../../src/systems/anvilWork.js';
import {domKeyEvent} from '../../src/systems/input.js';
import {PLANET_SITE} from '../../src/data/planets.js';
import {anvilSpillReturnQuote,anvilSpillReturnFacts} from '../../src/world/anvilSpillRecovery.js';
const f=await anvilReceiverFixture(),s=f.state,sim=f.runtime,keys=sim.getSystem('input');
const key=(code,pressed)=>domKeyEvent(keys,{code,pressed,blocked:false,repeat:false});
try{
 let receiver=f.actor('receiver');const original=receiver||s.world.records.byId[anvilWorkerRecordId(s,'receiver')];
 assert.ok(original);f.world.relocatePlayerInSector({x:original.pos.x-180,z:original.pos.z});f.step(3);receiver=f.actor('receiver');assert.ok(receiver);
 const player=s.entities.get(s.playerId);
 f.owner._setTrafficManifest(receiver,s.traffic.freighters.find(r=>r.id===receiver.id),f.owner._buildMinerManifest(receiver,0,PLANET_SITE.harvest.commodityShallow,12));receiver.data.itinerary.phase='delivery';
 const pod=f.owner._spillHaulerCargoFromViolence(receiver,null,'panic_jettison');assert.ok(pod);f.step(2);
 const frames=[];const capture=label=>frames.push({label,tick:s.tick,simTime:s.simTime,receipt:structuredClone(receiver.data.itinerary.anvilSpillReturn),entities:[receiver,pod,player].map(e=>({id:e.id,type:e.type,pos:{...e.pos},vel:{...e.vel},rot:e.rot,radius:e.radius,hull:e.hull,data:structuredClone(e.data)}))});capture('measured-start');
 const start={receiver:{...receiver.pos},pod:{...pod.pos},player:{...player.pos},tick:s.tick};
 const report=()=>({start,tick:s.tick,elapsed:(s.tick-start.tick)/60,receiver:{pos:receiver.pos,vel:receiver.vel,hull:receiver.hull,phase:receiver.data.itinerary.phase,cargo:receiver.data.cargoManifest.totalQty},pod:{pos:pod.pos,vel:pod.vel,hull:pod.hull,amount:pod.data.amount},player:{pos:player.pos,vel:player.vel,hull:player.hull},tether:s.player.tether,receiverTravel:Math.hypot(receiver.pos.x-start.receiver.x,receiver.pos.z-start.receiver.z),podTravel:Math.hypot(pod.pos.x-start.pod.x,pod.pos.z-start.pod.z),relativeSpeed:Math.hypot(pod.vel.x-receiver.vel.x,pod.vel.z-receiver.vel.z),payloadData:pod.data,receipt:receiver.data.itinerary.anvilSpillReturn,facts:!!anvilSpillReturnFacts(s,receiver),ready:!!anvilSpillReturnQuote(s,receiver)});
 keys.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});keys.ingestLaneDomEvent({type:'cursorProjection',x:pod.pos.x,z:pod.pos.z});f.step(2);
 key('KeyF',true);f.step();key('KeyF',false);f.step(2);
 if(s.player.tether?.targetId!==pod.id){console.log(JSON.stringify({ok:false,reason:'normal acquisition failed',...report()}));process.exitCode=1;}
 else{
 let offer,response;sim.bus.on('contactHail:offer',p=>offer=p);sim.bus.on('contactHail:response',p=>response=p);
 capture('pre-rendezvous-request');const requestSpeed=Math.hypot(receiver.vel.x,receiver.vel.z),creditsBefore=s.player.credits;console.log(JSON.stringify({requestSpeed,requestState:report()}));
 s.player.targetId=receiver.id;sim.bus.emit('contactHail:request',{targetId:receiver.id});
 assert.ok(offer?.actions.some(a=>a.id==='spill_rendezvous'),JSON.stringify({reason:'rendezvous unavailable',offer,...report()}));
 assert.ok(offer.expiresAt<=s.simTime+4);assert.ok(offer.lines.length<=2&&offer.actions.length<=3);
 sim.bus.emit('contactHail:choice',{requestId:offer.requestId,targetId:receiver.id,choice:'spill_rendezvous'});
 assert.equal(receiver.data.itinerary.anvilSpillReturn.rendezvousRemainingS,30,JSON.stringify(response));
 capture('rendezvous-request-accepted');
 const phys=sim.getSystem('physics'),native=phys._sg02,a=s.combat.attachments.byId[s.player.tether.attachmentId];
 const pinned={epoch:phys._sg02Token,world:native.world,line:native.attachments.get(a.id),handle:a.physicsHandle,bodies:[receiver,player,pod].map(e=>({entity:e,record:native.records.get(e.id),body:native.records.get(e.id).body,spec:e.physicsBody,nativeSpec:native.records.get(e.id).spec,revision:native.records.get(e.id).revision}))};
 const nativeDiagnostic=()=>({epoch:phys._sg02Token===pinned.epoch,owner:phys._sg02===native,world:native.world===pinned.world,line:native.attachments.get(a.id)===pinned.line,handle:a.physicsHandle===pinned.handle,ready:phys._diag.sg02Ready,restorePending:phys._nativeRestorePending,restoreDeferred:phys._nativeRestoreDeferred,rebuilds:native._pendingNativeRebuilds?.size,indexCount:s.entityIndex.byWorldRecordIdCount.get(receiver.data.worldRecordId),indexSame:s.entityIndex.byWorldRecordId.get(receiver.data.worldRecordId)===receiver,bodies:pinned.bodies.map(b=>{const r=native.records.get(b.entity.id),p=r.body.translation(),v=r.body.linvel(),o=native._frameOrigin;return {id:b.entity.id,record:r===b.record,body:r.body===b.body,spec:b.entity.physicsBody===b.spec,nativeSpec:r.spec===b.nativeSpec,revision:r.revision===b.revision,enabled:r.body.isEnabled(),poseGap:Math.hypot(p.x+o.x-b.entity.pos.x,p.z+o.z-b.entity.pos.z),velocityGap:Math.hypot(v.x-b.entity.vel.x,v.z-b.entity.vel.z)};})});
 let previousBudget=30,cancellationLogged=false;
 // Observer-only wrapper delegates every owner tick unchanged, solely recording native parity.
 const originalStep=f.owner._stepAnvilWork;let ownerBoundaryReported=false;
 f.owner._stepAnvilWork=function(dt,state){
  const before=nativeDiagnostic();
  if(!ownerBoundaryReported&&(!before.line||!before.handle||!before.epoch||before.bodies.some(b=>!b.record||!b.body||!b.spec||!b.nativeSpec||!b.revision||!b.enabled||b.poseGap>=.1||b.velocityGap>=.1))){ownerBoundaryReported=true;console.log(JSON.stringify({ownerBoundaryTick:s.tick,nativeDiagnostic:before}));}
  return originalStep.call(this,dt,state);
 };


 key('Digit0',true);key('KeyF',true);f.step(12);key('BracketLeft',true);f.step(8);key('BracketLeft',false);key('KeyF',false);
 let ready=false,preChoice=null;for(let i=0;i<600;i++){
  f.step();const left=receiver.data.itinerary.anvilSpillReturn.rendezvousRemainingS;
  if(i>0&&left===previousBudget&&!cancellationLogged){cancellationLogged=true;console.log(JSON.stringify({firstUnchargedTick:s.tick,nativeDiagnostic:nativeDiagnostic(),state:report()}));capture('first-cancellation');}
  previousBudget=left;if(i%30===0){capture('transport-'+i);console.log(JSON.stringify({sample:report()}));}
  if(anvilSpillReturnQuote(s,receiver)){ready=true;break;}
  if(!pod.alive||!receiver.alive||!player.alive||pod.data.salvorClaimedBy)break;
 }
 if(ready){preChoice={relativeSpeed:Math.hypot(pod.vel.x-receiver.vel.x,pod.vel.z-receiver.vel.z),receiverSpeed:Math.hypot(receiver.vel.x,receiver.vel.z),budget:receiver.data.itinerary.anvilSpillReturn.rendezvousRemainingS};capture('pre-choice');s.player.targetId=receiver.id;sim.bus.emit('contactHail:request',{targetId:receiver.id});if(offer?.actions.some(a=>a.id==='return_gas'))sim.bus.emit('contactHail:choice',{requestId:offer.requestId,targetId:receiver.id,choice:'return_gas'});}
 const ok=pod.data.amount===0&&receiver.data.cargoManifest.totalQty===12;
 capture(ok?'accepted':'failed-final');if(process.env.ANVIL_RENDEZVOUS_CAPTURE_PATH)writeFileSync(process.env.ANVIL_RENDEZVOUS_CAPTURE_PATH,JSON.stringify({sourceScope:process.env.PUBLIC_TREE||'canonical candidate',ok,frames},null,2));assert.equal(s.player.credits,creditsBefore,'cooperation pays nothing');console.log(JSON.stringify({ok,requestSpeed,preChoice,offer,response,...report()}));if(!ok)process.exitCode=1;
 }
}finally{f.close();}
