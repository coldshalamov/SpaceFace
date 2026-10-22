// Optional bounded diagnostic, never part of the default test/CI command.
// Initial combat clearance and player placement are scenario setup, not combat/arrival proof.
// Afterwards only ordinary DOM controls move the player; no cargo/carrier pose edits.
import fs from 'node:fs';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import {vestaWinnowRecoveryFixture} from './vesta-winnow-recovery-native.mjs';
import {vestaWinnowPhase} from '../../src/data/environmentalMachinery.js';
import {domKeyEvent} from '../../src/systems/input.js';
import {resolveCollisionProxyManifest,resolveCorridorAxisWorld,proxyOuterRadiusWu,hullEnvelopeWu} from '../../src/data/collisionProxyManifests.js';
import {winnowRecoveryFacts,winnowReceiverAnchor} from '../../src/world/vestaWinnowRecovery.js';
const out=process.env.VESTA_PROOF_DIR||fs.mkdtempSync(path.join(tmpdir(),'spaceface-vesta-stage-'));
console.log('PROOF_DIRECTORY',out);
fs.mkdirSync(out,{recursive:true});
const f=await vestaWinnowRecoveryFixture();
try{
 const {state:s,runtime}=f,keys=runtime.getSystem('input'),phys=runtime.getSystem('physics'),world=runtime.getSystem('world');
 const resume=process.env.VESTA_RESUME;
 let sourceId;
 if(resume){const saved=JSON.parse(gunzipSync(fs.readFileSync(resume)));sourceId=saved.sourceId;if(!f.save.loadEnvelope(saved.envelope))throw Error('Continue refused');}
 else{
  const original=f.pods.reduce((a,b)=>a.pos.x<b.pos.x?a:b);sourceId=original.data.vestaWinnowPod.podId;
  // Combat-owner scenario clearance, not a claim that the keyboard pilot fought this encounter.
  for(const {e} of f.cast.filter(c=>c.role==='raider'))runtime.getSystem('combat').onHit({targetId:e.id,ownerId:s.playerId,damage:100000,damageType:'kinetic',pos:{...e.pos}});
  world.relocatePlayerInSector({x:original.pos.x-100,z:original.pos.z,heading:Math.PI},{reason:'vesta-initial-player'});
 }
 const carrier=()=>s.entityList.find(e=>e.alive&&e.data?.namedLaneContactId==='lane_tann_slag_carrier');
 const source=()=>s.entityList.find(e=>e.alive&&e.data?.vestaWinnowPod?.podId===sourceId);
 const key=(code,pressed)=>domKeyEvent(keys,{code,pressed,blocked:false,repeat:false});
 const save=(label)=>{const file=path.join(out,`${label}.json.gz`);fs.writeFileSync(file,gzipSync(JSON.stringify({sourceId,envelope:f.save.serialize(label)})));console.log('SAVE',label,file,s.simTime);return file;};
 const report=()=>{const e=carrier(),p=source(),rec=s.traffic.freighters.find(r=>r.id===e?.id),native=phys._sg02?.records.get(e?.id);return {t:s.simTime,player:s.entities.get(s.playerId)?.pos,pod:p&&{id:p.id,pos:p.pos,vel:p.vel,amount:p.data.amount},line:s.player.tether,tann:e&&{id:e.id,pos:e.pos,vel:e.vel,rot:e.rot,job:e.data.jobId,jobPhase:s.npcJobs.byId[e.data.jobId]?.job?.phase,intent:e.data.intent,route:e.data.itinerary,flags:e.flags,civilianReaction:e.data.civilianReaction,recordReaction:rec?.civilianReaction,native:!!native,bodyRevision:e.physicsBody?.revision,nativeRevision:native?.revision,colliders:native?.colliders?.length,bodyEnabled:native?.body?.isEnabled(),bodyDynamic:native?.body?.isDynamic()},facts:winnowRecoveryFacts(s,f.batchId)};};
 const obstacles=()=>{const e=carrier(),a=phys._sg02?.records.get(e.id);return s.entityList.filter(x=>x.alive&&x.id!==e.id&&x.pos&&Math.hypot(x.pos.x-e.pos.x,x.pos.z-e.pos.z)<(x.radius||0)+e.radius+60).map(x=>{const b=phys._sg02?.records.get(x.id);let contact=null;if(a&&b)for(const ac of a.colliders)for(const bc of b.colliders){const c=ac.contactCollider(bc,0);if(c&&c.distance<=0)contact=c.distance;}return{id:x.id,type:x.type,pos:x.pos,radius:x.radius,label:x.data?.scanLabel||x.data?.stationId,contact};});};
 console.log('NATIVE_READY',await phys.prepareBackend(s),'RESUMED',!!resume,'SOURCE',sourceId);
 f.step(3);
 // A resumed live line skips the latch branch; ordinary mouse activity must still
 // activate Helm Assist after input's transient screen state is rebuilt.
 keys.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
 const p=source();
 if(p&&!s.player.tether?.active){keys.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});keys.ingestLaneDomEvent({type:'cursorProjection',x:p.pos.x,z:p.pos.z});f.step(2);key('KeyF',true);f.step();key('KeyF',false);f.step(2);}
 console.log('START',JSON.stringify(report()));
 const station=s.entityList.find(e=>e.data?.stationId==='station_forge'),proxy=resolveCollisionProxyManifest(station),axis=resolveCorridorAxisWorld(station,proxy);
 const radius=proxyOuterRadiusWu(proxy,station)+hullEnvelopeWu(carrier())+80;
 const goal={x:station.pos.x+axis.x*(radius+100),z:station.pos.z+axis.z*(radius+100)};
 s.settings.gameplay.controlScheme='helm-assist';let released=false,releaseNext=false,still=0;
 const stage=process.env.VESTA_STOP_STAGE||'admitted';
 for(let i=0;i<60*160;i++){
  const e=carrier(),p=source(),player=s.entities.get(s.playerId),distance=Math.hypot(player.pos.x-goal.x,player.pos.z-goal.z),speed=Math.hypot(player.vel.x,player.vel.z);
  keys.ingestLaneDomEvent({type:'cursorProjection',x:goal.x,z:goal.z});const move=distance>20&&speed<Math.min(50,distance*.6);key('KeyW',move);key('Digit0',!move);
  if(!released&&p&&s.player.tether?.active&&e?.data.vestaWinnowRecovery&&Math.hypot(p.vel.x,p.vel.z)<8&&Math.hypot(p.vel.x-e.vel.x,p.vel.z-e.vel.z)<8&&vestaWinnowPhase(s.simTime).phase==='calm'&&Math.hypot(p.pos.x-e.pos.x,p.pos.z-e.pos.z)<160){key('KeyF',true);released=true;releaseNext=true;}
  else if(releaseNext){key('KeyF',false);releaseNext=false;console.log('PLAYER_RELEASE',s.simTime,JSON.stringify(report()));}
  f.step();const facts=winnowRecoveryFacts(s,f.batchId);
  if(i%300===0)console.log('TRACE',JSON.stringify(report()));
  const anchor=e&&winnowReceiverAnchor(station,e);
  const reached=stage==='admitted'?!!e?.data.vestaWinnowRecovery:stage==='transport'?facts.aboard>0:stage==='berth'?facts.phase==='deliver'&&anchor&&Math.hypot(e.pos.x-anchor.x,e.pos.z-anchor.z)<anchor.dockRadius+25:facts.delivered>0;
  if(reached){save(stage);console.log('CHECKPOINT',stage,JSON.stringify(report()));break;}
  if(e?.data.vestaWinnowRecovery&&!e.data.jobId&&Math.hypot(e.vel.x,e.vel.z)<.5&&Math.hypot(e.pos.x-(goal.x-axis.x*100),e.pos.z-(goal.z-axis.z*100))>80)still++;else still=0;
  if(still>600){save('stall');console.log('STALL',JSON.stringify(report()),JSON.stringify(obstacles()));break;}
  if(i===60*160-1){save('bounded-end');console.log('BOUNDED_END',JSON.stringify(report()),JSON.stringify(obstacles()));}
 }
}finally{f.close();}
