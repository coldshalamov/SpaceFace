import { TOWLINE_TABLE as C, TOWLINE_MEMBERS, towlineActorId, towlineCleanupId, towlineReceiptId,
  freshTowlineTable, normalizeTowlineTable, validTowlineReceipt } from '../data/towlineTable.js';
import { makeShipEntitySpec } from './ships.js';
import { getCombatKernel } from '../combat/kernel.js';
import { attachmentBindsOccupant } from '../combat/attachments.js';
import { resolveDockRange } from '../core/dockRange.js';
import { resolveCollisionProxyManifest, resolveDockAnchor, proxyOuterRadiusWu, hullEnvelopeWu, effectiveCorridorBearingDeg } from '../data/collisionProxyManifests.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { towlineCrewBody, towlineCrewRadius, towlineCrewVisualRadius, towlineCleanupBody, towlineCleanupRadius } from '../data/towlineTableBodies.js';

const owners=new WeakMap();
const sourceTerminal=new Set(['cleared','destroyed','lost']);
const benefitTerminal=new Set(['spent','void']);
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
const pose=e=>({x:e.pos.x,z:e.pos.z,vx:e.vel.x,vz:e.vel.z,rot:e.rot||0,spin:e.angVel||0});
const key=(id,kind)=>`${id}:${kind}`;
const clone=v=>structuredClone(v);

// Three finite physical cleanup jobs. The job runtime owns worker movement/line leases;
// this owner keeps their original source fates and witnessed, exhaustible labor receipts.
export const towlineTable={name:'towlineTable',init(ctx){
  this.ctx=ctx;this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers;this._bindings=new Map();this._retired=new WeakSet();
  this._targets=new Map();this._subs=[];this._busy=false;this._restoring=false;this._nextOffer=0;
  this._row=normalizeTowlineTable(ctx.state.towlineTable);ctx.state.towlineTable=this._row;owners.set(ctx.state,this);
  const on=(event,fn)=>this._subs.push(this.bus.on(event,fn));
  on('mission:completed',p=>{if(['cargo_delivery','salvage_retrieval'].includes(p?.type))this._row.eligible=true;});
  on('cargo:tallyThreeDelivered',()=>{this._row.eligible=true;});
  on('scan:completed',p=>{const e=this.state.entities.get(p?.targetId);if(e?.data?.towlineMemberId)this.offer(e.data.towlineMemberId);
    else if(e)this.offer(this._availableMember(e),e.id);});
  for(const [event,method] of [['take','take'],['deliver','deliver'],['assist','assist'],['release','releaseCleanup']])on(`towlineTable:${event}`,p=>{
    const r=this[method](p?.memberId,p?.revision,p?.targetId);if(!r.ok)this._say(p?.memberId,`Refused · ${r.reason}.`);});
  on('towlineTable:course',()=>{const anchor=this._anchor(this._player());
    if(anchor)this.bus.emit('ui:setCourse',{pos:{x:anchor.x,z:anchor.z},sectorId:C.sectorId,label:'Towline Table · Ceres receiver'});});
  on('npcJobs:towAssistLost',p=>this._leaseEnded(p,false));on('npcJobs:towAssistComplete',p=>this._leaseEnded(p,true));
  on('combat:damage',p=>this._damage(p));
  on('entity:killed',p=>this._lost(this.state.entities.get(p?.targetId??p?.entityId??p?.id)));
  on('entity:destroyed',p=>this._lost(p?.entity));
  on('sector:exit',()=>this._shelve());on('sector:enter',()=>{this._nextOffer=0;});
  on('save:restoring',()=>{this._restoring=true;this._bindings.clear();this._targets.clear();});
  on('save:loaded',()=>this.afterContinue());
},
_member(id){return TOWLINE_MEMBERS.find(m=>m.id===id);},
_player(){const p=this.state.entities.get(this.state.playerId);return p?.alive?p:null;},
_station(){return this.state.entityList.find(e=>e.alive&&e.type==='station'&&e.data?.stationId===C.stationId);},
_anchor(e){const station=this._station();if(!station)return null;const manifest=resolveCollisionProxyManifest(station);
  return resolveDockAnchor(station,manifest,e)||{x:station.pos.x+station.radius+(e?.radius||6)+16,z:station.pos.z};},
_find(id,kind='crew'){
  const k=key(id,kind),old=this._bindings.get(k),worldId=kind==='crew'?towlineActorId(id):towlineCleanupId(id);
  if(old&&this.state.entities.get(old.e.id)===old.e&&old.e.alive&&old.e.occupantGeneration===old.life
    &&old.e.data?.worldRecordId===worldId&&old.e.data.persistenceOwner===C.owner)return old.e;
  if(old&&!this._restoring)this._lost(old.e);this._bindings.delete(k);
  const matches=this.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===worldId&&e.data.identityKey===worldId
    &&e.data.persistenceOwner===C.owner&&e.data.towlineMemberId===id&&e.data.towlineBody===kind);
  if(matches.length!==1)return null;const e=matches[0];this._bindings.set(k,{e,life:e.occupantGeneration});return e;
},
_native(e){const p=this.ctx.registry?.get('physics'),r=p?._sg02?.records.get(e?.id);
  return !p?._nativeRestorePending&&!p?._nativeRestoreDeferred&&r?.entity===e&&r.body&&physicsBodyNativeReady(e)?r:null;},
_line(a,b){if(!a?.alive||!b?.alive)return null;const attachments=getCombatKernel(this.ctx).attachments;
  const line=attachments.listForEntity(a.id).find(l=>l.state==='active'&&['attachment_massline','tether_standard'].includes(l.defId)
    &&((l.ownerId===a.id&&l.targetId===b.id)||(l.ownerId===b.id&&l.targetId===a.id))
    &&attachmentBindsOccupant(l,a.id,a.occupantGeneration)&&attachmentBindsOccupant(l,b.id,b.occupantGeneration));
  if(!line)return null;
  if(this.state.settings?.gameplay?.physicsBackend==='rapier-dynamic'&&(!this._native(a)||!this._native(b)
    ||!this.helpers.combatPhysics?.getAttachmentTelemetry?.({attachmentId:line.id,physicsHandle:line.physicsHandle})))return null;
  return line;
},
_receiver(e){if(!e?.alive||Math.hypot(e.vel.x,e.vel.z)>C.receiverSpeed)return null;
  const r=resolveDockRange({...this.state,playerId:e.id});return r.stationId===C.stationId?r.station:null;},
_berth(station,id,kind){const manifest=resolveCollisionProxyManifest(station),outer=manifest?proxyOuterRadiusWu(manifest,station):station.radius;
  const index=TOWLINE_MEMBERS.findIndex(m=>m.id===id),d=outer+(kind==='cleanup'?330:430),
    base=(station.rot||0)+(manifest?effectiveCorridorBearingDeg(manifest,station)*Math.PI/180:0)+Math.PI/2+index*.34;
  for(const offset of [0,.12,-.12,.24,-.24]){const angle=base+offset,pos={x:station.pos.x+Math.cos(angle)*d,z:station.pos.z+Math.sin(angle)*d};
    if(this.state.entityList.some(e=>e.alive&&e.collides!==false&&['ship','station','asteroid','wreck','payload'].includes(e.type)
      &&distance(e.pos,pos)<hullEnvelopeWu(e)+28))continue;return pos;}
  return null;
},
_spawn(id,kind){const m=this._member(id),r=this._row.members[id],s=r.source;
  if((kind==='crew'&&(r.status!=='live'||r.betrayed))||(kind==='cleanup'&&sourceTerminal.has(s.status))||this._find(id,kind))return;
  const station=this._station();if(!station)return;const saved=kind==='crew'?r.pose:s.pose,pos=saved?{x:saved.x,z:saved.z}:this._berth(station,id,kind);if(!pos)return;
  const budget=this.helpers.spawnBudget;if(kind==='crew'&&(!budget||budget.request(1,towlineActorId(id))!==1))return;
  const worldId=kind==='crew'?towlineActorId(id):towlineCleanupId(id);
  let spec;
  if(kind==='crew'){
    spec=makeShipEntitySpec('ship_hawser',{team:2,factionId:'faction_free',pos,rot:saved?.rot??-Math.PI/2,ai:{passive:true,holdFire:true}});
    spec.mass=m.mass;spec.radius=towlineCrewRadius(id);spec.physicsBody=towlineCrewBody(id);
    spec.flightModel={flightClass:'freighter',mass:m.mass,inertia:spec.physicsBody.inertiaY,mainAccel:12,reverseAccel:10,strafeAccel:8,
      angularAccel:2,angularBrake:3,maxYawRate:1.2,maxSpeed:m.speed,boostMult:1,boostMaxSpeedMult:1,normalMaxSpeedMult:1,
      linearDrag:0,lateralDrag:0,assistStrength:0,reverseBrake:2.4};
  }else spec={type:'payload',team:2,factionId:'faction_free',pos,radius:towlineCleanupRadius(id),mass:m.cleanupMass,physicsBody:towlineCleanupBody(id)};
  spec.hull=kind==='crew'?r.hull:s.hull;spec.hullMax=kind==='crew'?160:60;spec.shield=0;spec.shieldMax=0;spec.weapons=[];
  spec.vel=saved?{x:saved.vx,z:saved.vz}:{x:0,z:0};spec.angVel=saved?.spin||0;spec.rot=saved?.rot??spec.rot??0;
  spec.flags={persistent:true,missionPinned:true};spec.data={...spec.data,worldRecordId:worldId,identityKey:worldId,
    persistenceOwner:C.owner,homeSectorId:C.sectorId,sectorId:C.sectorId,transientSector:true,towlineMemberId:id,towlineBody:kind,
    name:kind==='crew'?`${m.name} · ${m.role}`:`${m.name}'s original yard obstruction`,callsign:m.name.toUpperCase(),
    scannable:true,scanLabel:kind==='crew'?`${m.name} · Towline Table`:'Towline Table · finite cleanup original',
    weapons:[],fittings:[],miningBeam:null,salvagePool:{},authoredSalvagePool:{},lifetimeS:Infinity};
  if(kind==='crew'){spec.data.derived={...spec.data.derived,flightModel:{...spec.flightModel}};
    spec.data.authoredAssetId=m.assetId;spec.data.visualRadius=towlineCrewVisualRadius(id);
  }else{spec.data.authoredAssetId='SF_PROP_TOWLINE_DEBRIS';spec.data.authoredPayloadAssetId='SF_PROP_TOWLINE_DEBRIS';}
  const e=this.helpers.spawnEntity(spec);if(!e){if(kind==='crew')budget.release(worldId);return;}
  if(kind==='crew'&&!budget.bindEntity(e.id,worldId)){this._retired.add(e);this.helpers.removeEntity(e.id);budget.release(worldId);return;}
  this._bindings.set(key(id,kind),{e,life:e.occupantGeneration});
  if(kind==='crew')this._assign(e,id);
},
_assign(e,id){if(this.helpers.npcJobs?.byEntity(e.id))return;const anchor=this._anchor(e);
  if(!anchor)return;this.helpers.npcJobs?.assign(e,{kind:'tender',sectorId:C.sectorId,speed:this._member(id).speed,
    route:[{id:`${id}:yard`,pos:{x:e.pos.x,z:e.pos.z}},{id:`${id}:receiver`,pos:{x:anchor.x,z:anchor.z}}],workS:30});
},
_lease(id){return this.helpers.npcJobs?.byEntity(this._find(id)?.id);},
_cancel(id){const entry=this._lease(id);if(entry)this.helpers.npcJobs.release(entry.job.id);},
_cleanup(id){const r=this._row.members[id],s=r.source,crew=this._find(id),body=this._find(id,'cleanup');
  if(!crew||!body||r.betrayed||!['waiting','crew'].includes(s.status)||this._restoring)return;
  if(s.startedAt!=null&&this.state.simTime>=s.startedAt+C.cleanupDeadlineS)return;
  const entry=this._lease(id);if(entry?.towAssist)return;this._assign(crew,id);
  const dest=this._anchor(body);if(!dest)return;
  const out=this.helpers.npcJobs?.requestTowAssist(crew.id,body.id,dest,{holder:C.owner,claimId:`${towlineCleanupId(id)}:lease`,feeCr:0,
    deliverW:1,timeoutS:s.startedAt==null?C.cleanupDeadlineS:Math.max(5,s.startedAt+C.cleanupDeadlineS-this.state.simTime)});
  if(out?.granted){s.status='crew';if(s.startedAt==null)s.startedAt=this.state.simTime;this._row.revision++;}
},
take(id,revision){const r=this._row.members[id],crew=this._find(id),body=this._find(id,'cleanup'),player=this._player();
  if(this._busy||this._restoring||revision!==this._row.revision||!r||!crew||!body||r.betrayed
    ||!['waiting','crew'].includes(r.source.status)||r.source.startedAt!=null&&this.state.simTime>=r.source.startedAt+C.cleanupDeadlineS
    ||distance(player?.pos,body.pos)>C.offerRange)return {ok:false,reason:'cleanup_changed_or_out_of_range'};
  if(getCombatKernel(this.ctx).attachments.listForEntity(body.id).some(a=>a.state==='active'&&a.ownerId!==crew.id&&a.ownerId!==player.id))return {ok:false,reason:'another_line_has_custody'};
  this._busy=true;try{r.source.status='player';if(r.source.startedAt==null)r.source.startedAt=this.state.simTime;
    this._row.revision++;this._cancel(id);this._assign(crew,id);
    this._say(id,id==='mara'?'Your line. Bring this exact frame back slow; I will witness the handover.'
      :id==='odo'?'Original frame, Ceres receiver. I record work, not promises.':'Take the load gently. We can tell jokes after it is clear.');return {ok:true};
  }finally{this._busy=false;}
},
releaseCleanup(id,revision){const r=this._row.members[id],body=this._find(id,'cleanup'),player=this._player();
  if(this._busy||this._restoring||revision!==this._row.revision||r?.source.status!=='player'||!body||distance(player?.pos,body.pos)>C.offerRange)return {ok:false,reason:'cleanup_changed'};
  this._busy=true;try{const line=this._line(player,body);if(line){const out=getCombatKernel(this.ctx).attachments.cut(line.id,player.id,'towline_return_job');if(!out?.ok)return {ok:false,reason:'line_cut_refused'};}
    if(r.source.status!=='player')return {ok:false,reason:'original_lost'};
    r.source.status='waiting';this._row.revision++;this._say(id,'The original stays on this job. Its first deadline is unchanged.');return {ok:true};
  }finally{this._busy=false;}
},
_deliveryGate(id,by='player'){const r=this._row.members[id],body=this._find(id,'cleanup'),owner=by==='player'?this._player():this._find(id);
  if(!r||!body||!owner||sourceTerminal.has(r.source.status)||r.source.startedAt!=null&&this.state.simTime>=r.source.startedAt+C.cleanupDeadlineS)return null;
  const receiver=this._receiver(body);if(!receiver||this._receiver(owner)!==receiver&&by==='player')return null;
  const line=this._line(owner,body);if(!line)return null;
  const witness=this._find(id),witnessed=!!witness&&!r.betrayed&&distance(witness.pos,body.pos)<=C.witnessRange;
  if(by==='player'&&r.source.status!=='player')return null;
  if(by==='crew'&&r.source.status!=='crew')return null;
  return {r,body,owner,receiver,line,witnessed};
},
deliver(id,revision,by='player'){if(this._busy||this._restoring||revision!==this._row.revision)return {ok:false,reason:'handover_changed'};
  const gate=this._deliveryGate(id,by);if(!gate)return {ok:false,reason:'slow_receiver_and_original_native_line_required'};
  this._busy=true;try{const again=this._deliveryGate(id,by);if(!again||again.body!==gate.body||again.line!==gate.line||again.owner!==gate.owner)return {ok:false,reason:'custody_changed'};
    const source=gate.r.source;source.status='cleared';source.receipt=by==='player'&&gate.witnessed?
      {id:towlineReceiptId(id),sourceId:towlineCleanupId(id),memberId:id,stationId:C.stationId,by:'player',at:this.state.simTime}:null;
    // Reserve the terminal source and its named receipt before cut/removal callbacks.
    gate.r.benefit=source.receipt?{receiptId:source.receipt.id,status:'earned',target:null,acceptedAt:null,deadline:null,leaseId:null}:null;
    this._row.revision++;this._retired.add(gate.body);
    const out=getCombatKernel(this.ctx).attachments.cut(gate.line.id,gate.owner.id,'towline_receiver');
    if(!out?.ok){this._retired.delete(gate.body);source.status=by==='player'?'player':'crew';source.receipt=null;gate.r.benefit=null;return {ok:false,reason:'line_cut_refused'};}
    this._bindings.delete(key(id,'cleanup'));this.helpers.removeEntity(gate.body.id);this._cancel(id);if(this._find(id))this._assign(this._find(id),id);
    this.bus.emit('towlineTable:cleanupAccepted',{sourceId:towlineCleanupId(id),memberId:id,by,witnessed:gate.witnessed,receipt:clone(source.receipt)});
    this._say(id,source.receipt?'Witnessed. One cargo tow on my labor; choose one real load at Ceres.'
      :by==='crew'?'The crew cleared this original. No player labor receipt was issued.':'The obstruction is clear. Without a living witness there is no crew service receipt.');return {ok:true,receipt:clone(source.receipt)};
  }finally{this._busy=false;}
},
_targetMatches(e,t){return !!e?.alive&&e.data?.worldRecordId===t.worldRecordId&&(e.data.identityKey||e.data.worldRecordId)===t.identityKey
  &&(e.data.salvageSourceKey||null)===t.sourceKey&&(e.data.persistenceOwner||null)===t.persistenceOwner;},
_targetFor(id){const b=this._row.members[id]?.benefit;if(!b?.target)return null;const old=this._targets.get(id);
  if(old&&this.state.entities.get(old.e.id)===old.e&&old.e.occupantGeneration===old.life&&this._targetMatches(old.e,b.target))return old.e;
  if(old&&!this._restoring){b.status='spent';this._targets.delete(id);return null;}
  const matches=this.state.entityList.filter(e=>this._targetMatches(e,b.target));if(matches.length!==1)return null;
  const e=matches[0];this._targets.set(id,{e,life:e.occupantGeneration});return e;
},
_targetGate(id,target){const r=this._row.members[id],m=this._member(id),crew=this._find(id),player=this._player(),b=r?.benefit;
  if(!r||r.status!=='live'||r.betrayed||!crew||!player||!b||!['earned','paused'].includes(b.status))return 'no_available_labor_receipt';
  if(b.deadline!=null&&this.state.simTime>=b.deadline)return 'original_deadline_expired';
  if(!target?.alive||!['payload','wreck'].includes(target.type)||!(target.mass>0)||target.mass>m.towMass
    ||!target.data?.worldRecordId||target.physicsBody===false)return 'finite_load_exceeds_this_crew';
  if(b.target&&!this._targetMatches(target,b.target))return 'receipt_already_bound_to_another_original';
  if(distance(player.pos,target.pos)>C.offerRange||distance(crew.pos,target.pos)>C.assistRange)return 'load_out_of_local_reach';
  const d=target.data,f=target.flags||{};
  if(d.towlineBody||d.worldSiteId||d.worldObjectId||f.missionPinned||d.missionId||d.missionTag||d.contractId||d.freightCustody||d.freightCustodyPod
    ||d.persistenceOwner||d.cargoManifest?.protected||d.cargoManifest?.reservedBy||d.salvorClaimedBy!=null||d.npcTowedByJobId!=null)return 'another_owner_or_claim_has_custody';
  if(d.salvageSourceKey){const s=this.helpers.salvage?.source?.(d.salvageSourceKey);if(!s||s.extracted||s.claimId)return 'source_not_available';}
  if(getCombatKernel(this.ctx).attachments.listForEntity(target.id).some(a=>a.state==='active'))return 'detach_the_current_line_first';
  return null;
},
assist(id,revision,targetId){if(this._busy||this._restoring||revision!==this._row.revision)return {ok:false,reason:'service_offer_changed'};
  const r=this._row.members[id],b=r?.benefit,target=b?.target?this._targetFor(id):this.state.entities.get(targetId);
  const reason=this._targetGate(id,target);if(reason)return {ok:false,reason};
  const crew=this._find(id),dest=this._anchor(target);if(!dest)return {ok:false,reason:'receiver_unavailable'};
  this._busy=true;const previous=clone(b);
  try{
    // Reserve one immutable original BEFORE the canonical lease can emit any synchronous event.
    b.status='dispatching';b.target={worldRecordId:target.data.worldRecordId,identityKey:target.data.identityKey||target.data.worldRecordId,
      sourceKey:target.data.salvageSourceKey||null,persistenceOwner:target.data.persistenceOwner||null};
    const at=b.acceptedAt??this.state.simTime;b.acceptedAt=at;b.deadline=at+C.assistDeadlineS;b.leaseId=`${b.receiptId}:labor`;
    this._targets.set(id,{e:target,life:target.occupantGeneration});
    this._assign(crew,id);const out=this.helpers.npcJobs?.requestTowAssist(crew.id,target.id,dest,{holder:C.owner,claimId:b.leaseId,feeCr:0,
      rangeW:C.assistRange,deliverW:1,timeoutS:Math.max(5,b.deadline-this.state.simTime)});
    if(r.status==='lost'||r.betrayed||this._find(id)!==crew){b.status='void';this._cancel(id);this._row.revision++;return {ok:false,reason:'crew_lost_during_dispatch'};}
    if(!out?.granted){r.benefit=previous;this._targets.delete(id);return {ok:false,reason:out?.reason||'no_working_tow_owner'};}
    b.status='active';this._row.revision++;this._say(id,'Labor waived. This original load, Ceres receiver, one deadline. Stay with the working line.');
    this.bus.emit('towlineTable:assistAccepted',{memberId:id,receiptId:b.receiptId,targetId:target.id,deadline:b.deadline});return {ok:true};
  }finally{this._busy=false;}
},
_leaseEnded(p,complete){if(this._restoring)return;for(const m of TOWLINE_MEMBERS){if(p?.jobId!==`job:${towlineActorId(m.id)}`)continue;
  const b=this._row.members[m.id].benefit;if(b?.status==='active'){
    // Only this coordinator's current native/receiver observation earns the physical arrival.
    // Advisory completion alone cannot assert custody after the job owner has already cut its line.
    b.status='paused';this._row.revision++;this._say(m.id,complete?'Line released. The same original can resume within its first deadline.':`Tow interrupted · ${p.reason||'worker unavailable'}. The same original and deadline remain.`);
  }
}},
_observeAssist(id){const r=this._row.members[id],b=r.benefit;if(!b||!['active','paused'].includes(b.status))return;
  if(r.status==='lost'||r.betrayed||this.state.simTime>=b.deadline){b.status=r.status==='lost'||r.betrayed?'void':'spent';this._cancel(id);this._row.revision++;return;}
  const target=this._targetFor(id),crew=this._find(id);if(b.status==='spent'){this._cancel(id);this._row.revision++;return;}if(!target||!crew)return;
  const d=target.data,f=target.flags||{},source=d.salvageSourceKey?this.helpers.salvage?.source?.(d.salvageSourceKey):null;
  if(d.salvorClaimedBy!=null||f.missionPinned||d.missionId||d.missionTag||d.contractId||d.persistenceOwner
    ||d.freightCustody||d.freightCustodyPod||d.cargoManifest?.protected||d.cargoManifest?.reservedBy
    ||d.salvageSourceKey&&(!source||source.extracted||source.claimId)){
    b.status='spent';this._cancel(id);this._row.revision++;this._say(id,'Current custody changed. I released the working line; this accepted service is closed.');return;
  }
  const entry=this._lease(id),line=this._line(crew,target);
  if(b.status==='active'&&entry?.towAssist?.claimId===b.leaseId&&entry.towAssist.targetId===target.id&&line&&this._receiver(target)){
    b.status='spent';this._row.revision++;this._cancel(id);this._assign(crew,id);
    // The foreign cargo/source owner keeps the actual body and its goods. This receipt records
    // fulfilled labor only; its delivery value is still settled through the ordinary receiver.
    this.bus.emit('towlineTable:assistFulfilled',{memberId:id,receiptId:b.receiptId,targetWorldRecordId:b.target.worldRecordId,at:this.state.simTime});
    this._say(id,'Original load at Ceres. My labor is settled; its cargo and sale remain yours to handle.');
  }else if(b.status==='active'&&!entry?.towAssist){b.status='paused';this._row.revision++;}
},
_damage(p){const e=this.state.entities.get(p?.targetId);if(e?.data?.persistenceOwner!==C.owner||!(p.hullDamage>0))return;
  const r=this._row.members[e.data.towlineMemberId];if(!r)return;
  if(e.data.towlineBody==='crew'){r.hull=e.hull;
    if(p.attackerId===this.state.playerId&&['projectile','beam','action','weapon'].includes(p.origin?.kind)){r.betrayed=true;if(r.benefit)r.benefit.status='void';this._cancel(e.data.towlineMemberId);this._row.revision++;
      this._say(e.data.towlineMemberId,'You fired on a working crew. My service is withdrawn.');}
  }else r.source.hull=e.hull;
},
_lost(e){if(!e||this._retired.has(e)||e.data?.persistenceOwner!==C.owner)return;
  const id=e.data.towlineMemberId,kind=e.data.towlineBody,r=this._row.members[id],bound=this._bindings.get(key(id,kind));
  if(!r||!['crew','cleanup'].includes(kind)||bound&&(bound.e!==e||bound.life!==e.occupantGeneration)
    ||!bound&&this.state.entities.get(e.id)!==e)return;
  if(kind==='crew'){if(r.status==='lost')return;r.status='lost';r.hull=0;if(r.benefit)r.benefit.status='void';this._cancel(id);
    this.helpers.spawnBudget?.releaseEntity(e.id,e);this._say(id,'This crew member is lost. Their berth stays empty; no replacement service is issued.');
  }else if(!sourceTerminal.has(r.source.status)){r.source.status='destroyed';r.source.hull=0;this._say(id,'The original obstruction was destroyed. No recovery receipt was earned.');}
  this._bindings.delete(key(id,kind));this._row.revision++;
},
_capture(){for(const m of TOWLINE_MEMBERS){const r=this._row.members[m.id],crew=this._find(m.id),body=this._find(m.id,'cleanup');
  if(crew){r.pose=pose(crew);r.hull=crew.hull;}if(body){r.source.pose=pose(body);r.source.hull=body.hull;}}},
_shelve(){this._capture();for(const m of TOWLINE_MEMBERS){const b=this._row.members[m.id].benefit;if(b?.status==='active')b.status='paused';
  this._cancel(m.id);for(const kind of ['crew','cleanup']){const e=this._find(m.id,kind);if(!e)continue;this._retired.add(e);this._bindings.delete(key(m.id,kind));
    this.helpers.removeEntity(e.id);if(kind==='crew')this.helpers.spawnBudget?.releaseEntity(e.id,e);}}},
_availableMember(target){return TOWLINE_MEMBERS.find(m=>!this._targetGate(m.id,target))?.id;},
offer(id,targetId){const m=this._member(id),r=this._row.members[id],player=this._player(),crew=this._find(id),body=this._find(id,'cleanup');if(!m||!r||!player)return false;
  if(distance(player.pos,crew?.pos)>C.offerRange&&distance(player.pos,body?.pos)>C.offerRange)return false;
  const target=r.benefit?.target?this._targetFor(id):this.state.entities.get(targetId??this.state.player.targetId),canAssist=!this._targetGate(id,target);
  const b=r.benefit,source=r.source,canTake=!!crew&&!r.betrayed&&!!body&&['waiting','crew'].includes(source.status);
  const text=r.status==='lost'?`${m.name}'s berth is empty. Their death and unfinished original are retained.`
    :r.betrayed?'This member remembers deliberate fire on the crew; service is withdrawn.'
    :!sourceTerminal.has(source.status)?`One original ${m.cleanupMass}-mass obstruction. ${source.status==='player'?'Your line':'The crew is working it'}. Return it slowly to Ceres; a living nearby witness earns one real cargo tow. ${Math.max(0,Math.ceil((source.startedAt??this.state.simTime)+C.cleanupDeadlineS-this.state.simTime))}s remain. Declining keeps your campaign open.`
    :b&&!benefitTerminal.has(b.status)?`One witnessed labor receipt. ${m.name} can tow up to ${m.towMass} mass within ${C.assistRange} WU to Ceres. ${b.target?'It is already bound to the same original and deadline.':'Scan an available loose cargo body, then ask for this member’s tow.'} The crew stays mortal; cargo value uses its ordinary receiver.`
    :source.status==='cleared'?'The original is clear. This job and any accepted labor have a finite outcome.':'This original was lost. It cannot be reminted for another favor.';
  this.bus.emit('towlineTable:offer',{memberId:id,name:m.name,revision:this._row.revision,targetId:target?.id,
    status:r.status==='lost'?'EMPTY BERTH':b?.status?.toUpperCase()||source.status.toUpperCase(),headline:`${m.name} · ${m.role}`,text,
    canTake,canDeliver:!!this._deliveryGate(id),canAssist,resume:!!b?.target,canRelease:source.status==='player'&&!!body,canCourse:!!this._station()});return true;
},
_say(id,text){const m=this._member(id);this.bus.emit('toast',{text:`${m?.name||'Towline Table'} · ${text}`,kind:'info',ttl:6});
  this.bus.emit('comms:log',{from:m?.name||'TOWLINE TABLE',text,kind:'character'});},
update(_dt,state){if(this._restoring)return;
  if(!this._row.eligible)this._row.eligible=!!state.missions?.completedLog?.some(r=>['cargo_delivery','salvage_retrieval'].includes(r.type)&&r.success>0)
    ||!!state.salvage?.sources?.['salvage-point:ceres:tally-three:crate']?.delivery;
  if(!this._row.eligible||state.world.currentSectorId!==C.sectorId)return;
  for(const m of TOWLINE_MEMBERS){const r=this._row.members[m.id];this._spawn(m.id,'crew');this._spawn(m.id,'cleanup');
    if(!sourceTerminal.has(r.source.status)&&r.source.startedAt!=null&&state.simTime>=r.source.startedAt+C.cleanupDeadlineS){r.source.status='lost';this._row.revision++;
      this._cancel(m.id);const e=this._find(m.id,'cleanup');if(e){this._retired.add(e);this._bindings.delete(key(m.id,'cleanup'));this.helpers.removeEntity(e.id);}this._say(m.id,'Cleanup window closed. No replacement original or labor receipt.');}
    if(this._deliveryGate(m.id,'crew'))this.deliver(m.id,this._row.revision,'crew');
    this._observeAssist(m.id);this._cleanup(m.id);
  }
  if(state.simTime>=this._nextOffer){this._nextOffer=state.simTime+90;const p=this._player(),near=TOWLINE_MEMBERS.find(m=>distance(p?.pos,this._find(m.id)?.pos)<160);
    if(near)this.offer(near.id);}
},
serialize(){this._capture();return clone(normalizeTowlineTable(this._row));},
deserialize(raw){this._row=normalizeTowlineTable(raw);this.state.towlineTable=this._row;this._bindings.clear();this._targets.clear();},
afterContinue(){this._restoring=false;this._bindings.clear();this._targets.clear();this._nextOffer=0;
  for(const m of TOWLINE_MEMBERS){const b=this._row.members[m.id].benefit;if(b?.status==='active')b.status='paused';}
},
newGame(){this._shelve();this._row=freshTowlineTable();this.state.towlineTable=this._row;this._bindings.clear();this._targets.clear();this._nextOffer=0;this._restoring=false;},
destroy(){this._shelve();for(const off of this._subs||[])off();this._subs=[];owners.delete(this.state);},
};

export function towlineCrewPresentation(state,entity){const owner=owners.get(state),id=entity?.data?.towlineMemberId,m=owner?._member(id);
  if(!m||owner._find(id)!==entity||entity.alive===false)return null;
  const r=owner._row.members[id],entry=owner._lease(id),target=r.benefit?.status==='active'?owner._targetFor(id):owner._find(id,'cleanup'),line=owner._line(entity,target);
  const native=owner._native(entity),bodyOwner=owner.ctx.registry?.get('physics')?._sg02,
    age=Number.isFinite(bodyOwner?._simTick)?state.tick-bodyOwner._simTick:Infinity;
  const nativeBodyReady=!!native&&native.proxyId===(entity.physicsBody?.collisionProxyManifest?.id||null)
    &&native.revision===(entity.physicsBody?.revision||0)&&native._postStepReadTick===bodyOwner.tick&&age>=0&&age<=2;
  const targetNative=owner._native(target),targetBodyReady=!!targetNative&&targetNative.proxyId===(target.physicsBody?.collisionProxyManifest?.id||null)
    &&targetNative.revision===(target.physicsBody?.revision||0)&&targetNative._postStepReadTick===bodyOwner.tick&&age>=0&&age<=2;
  const readyLine=nativeBodyReady&&targetBodyReady?line:null;
  const receipt=r.source.status==='cleared'&&validTowlineReceipt(r.source.receipt,id)&&r.source.receipt.at<=state.simTime?r.source.receipt:null;
  const dx=(target?.vel?.x||0)-entity.vel.x,dz=(target?.vel?.z||0)-entity.vel.z;
  return {memberId:id,phase:r.status==='lost'?'lost':readyLine?'tow':entry?.towAssist?'approach':r.source.status==='player'?'witness':'berth',tick:state.tick,
    ownerLife:entity.occupantGeneration,simTime:state.simTime,sourceRevision:owner._row.revision,nativeBodyReady,
    nativeJointReady:!!readyLine,attachmentId:readyLine?.id||null,lineLength:readyLine?distance(entity.pos,target.pos):null,
    relativeTowSpeed:readyLine?Math.hypot(dx,dz):0,relativeLineSpeed:readyLine?((target.pos.x-entity.pos.x)*dx+(target.pos.z-entity.pos.z)*dz)/Math.max(1,distance(entity.pos,target.pos)):0,
    receiptId:receipt?.id||null,benefitStatus:r.benefit?.status||null};
}
