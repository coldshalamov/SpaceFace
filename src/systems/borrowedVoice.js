import { BORROWED_VOICE as C, BORROWED_VOICE_RECORDERS as RECORDERS, borrowedVoiceGate,
  borrowedVoiceIdentity, freshBorrowedVoice, normalizeBorrowedVoice, borrowedSignalQuality, borrowedVoiceJournalPlate } from '../data/borrowedVoice.js';
import { borrowedVoiceRingBody, borrowedVoiceRecorderBody, borrowedVoiceRingRadius,
  borrowedVoiceRingVisualRadius, borrowedVoiceRecorderRadius, borrowedVoiceRecorderVisualRadius } from '../data/borrowedVoiceBody.js';
import { witnessLineOfSight } from '../combat/lineOfSight.js';
import { physicsBodyNativeReady } from '../core/physicsAuthority.js';
import { presentationAllowsPlayerFacingAction } from '../core/presentationAdmission.js';

const owners=new WeakMap(), terminal=new Set(['destroyed','lost']);
const distance=(a,b)=>a&&b?Math.hypot(a.x-b.x,a.z-b.z):Infinity;
const pose=e=>({x:e.pos.x,z:e.pos.z,vx:e.vel?.x||0,vz:e.vel?.z||0,rot:e.rot||0,spin:e.angVel||0});
const clone=v=>structuredClone(v);

// A physical retained record. This owner never advances global revelation, invents
// speech, writes credits, or turns a cosmetic orientation into a recovered fact.
export const borrowedVoice={name:'borrowedVoice',init(ctx){
  this.ctx=ctx;this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers;
  this._bindings=new Map();this._signals=new Map();this._subs=[];this._restoring=false;
  this._nextSample=0;this._scanSeq=-1;this._busy=false;this.deserialize(ctx.state.borrowedVoice);owners.set(ctx.state,this);
  const on=(event,fn)=>this._subs.push(ctx.bus.on(event,fn));
  on('scan:pulse',p=>{if(p?.source!=='player-scanner'||!Number.isSafeInteger(p.seq)||p.seq<=this._scanSeq)return;
    this._scanSeq=p.seq;this.inspect(this.state.player?.targetId);});
  on('scan:completed',p=>{if(p?.targetId!=null)this.inspect(p.targetId);});
  on('borrowedVoice:disposition',p=>this.choose(p?.disposition,p?.revision));
  on('entity:killed',p=>this._lost(p?.targetId??p?.victimId??p?.id));
  on('entity:destroyed',p=>this._lost(p?.id,p?.entity));
  on('sector:exit',()=>this._shelve());
  on('sector:enter',()=>{this._nextSample=0;this._signals.clear();});
  on('save:restoring',()=>{this._restoring=true;this._bindings.clear();this._signals.clear();});
  on('save:loaded',()=>this.afterContinue());
},
_player(){const p=this.state.entities.get(this.state.playerId);return p?.alive?p:null;},
_active(){return !this._restoring&&borrowedVoiceGate(this.state)&&this.state.mode==='flight'
  &&this.state.world?.currentSectorId===C.sectorId
  &&!(this.state.run?.kind==='survival'&&this.state.run.phase!=='inactive');},
_find(id){const expected=borrowedVoiceIdentity(id),old=this._bindings.get(id);
  if(old){return this.state.entities.get(old.e.id)===old.e&&old.e.alive
    &&old.e.occupantGeneration===old.life&&old.e.data?.worldRecordId===expected?old.e:null;}
  const matches=this.state.entityList.filter(e=>e.alive&&e.data?.worldRecordId===expected
    &&e.data.identityKey===expected&&e.data.persistenceOwner===C.owner);
  if(matches.length!==1)return null;const e=matches[0];this._bindings.set(id,{e,life:e.occupantGeneration});return e;
},
_native(e){const p=this.ctx.registry?.get('physics'),n=p?._sg02;
  const r=n?.records.get(e?.id);
  if(p?._nativeRestorePending||p?._nativeRestoreDeferred||r?.entity!==e||!r.body||!physicsBodyNativeReady(e))return null;
  if(r.proxyId!==e.physicsBody?.collisionProxyManifest?.id||r.revision!==e.physicsBody?.revision)return null;
  if(e.physicsBody?.dynamic!==false){const age=this.state.tick-n?._simTick;
    if(r._postStepReadTick!==n.tick||!Number.isInteger(n._simTick)||age<0||age>2)return null;}
  return r;
},
_spawn(id){if(this._find(id)||this._bindings.has(id))return;
  if(id==='ring'&&terminal.has(this._row.ringOutcome))return;
  const identity=borrowedVoiceIdentity(id);
  if(this.state.entityList.some(e=>e.alive&&e.data?.worldRecordId===identity))return;
  const definition=RECORDERS.find(r=>r.id===id),saved=definition&&this._row.recorderOutcomeIds[id];
  if(definition&&terminal.has(saved.status))return;
  const ring=id==='ring',body=ring?borrowedVoiceRingBody():borrowedVoiceRecorderBody(id),p=saved?.pose;
  const position=p?{x:p.x,z:p.z}:{x:C.center.x+(definition?.offset.x||0),z:C.center.z+(definition?.offset.z||0)};
  const asset=ring?'SF_PLACE_BORROWED_VOICE_RING':`SF_PROP_BORROWED_VOICE_${id.toUpperCase()}`;
  const e=this.helpers.spawnEntity({type:ring?'wreck':'payload',team:0,pos:position,
    vel:p?{x:p.vx,z:p.vz}:{x:0,z:0},rot:p?.rot??definition?.rot??0,angVel:p?.spin||0,
    radius:ring?borrowedVoiceRingRadius:borrowedVoiceRecorderRadius(id),
    visualRadius:ring?borrowedVoiceRingVisualRadius:borrowedVoiceRecorderVisualRadius(id),mass:body.mass,
    hull:ring?600:35,hullMax:ring?600:35,physicsBody:body,collides:true,flags:{persistent:true},
    data:{identityKey:identity,worldRecordId:identity,persistenceOwner:C.owner,homeSectorId:C.sectorId,
      borrowedVoiceKind:ring?'ring':'recorder',borrowedVoiceRecorderId:ring?null:id,
      authoredAssetId:asset,authoredPayloadAssetId:asset,
      placeId:ring?'borrowed_voice_ring':null,scannable:true,name:ring?'Broken recorder ring':definition.name,
      scanLabel:ring?'Retained maintenance signal':definition.name,lifetimeS:Infinity,
      payloadType:ring?null:'borrowed_voice_recorder',commodityId:null,amount:0,
      salvagePool:{},authoredSalvagePool:{},debrisCache:{resolved:true},signalIsolated:this._row.disposition==='quarantine'}});
  if(!e)return;this._bindings.set(id,{e,life:e.occupantGeneration});if(saved)saved.status='live';else this._row.ringOutcome='live';
},
_sample(){const player=this._player(),ring=this._find('ring');if(!player||!ring||distance(player.pos,C.center)>600){this._signals.clear();return;}
  const receiver={x:ring.pos.x+C.receiver.x,z:ring.pos.z+C.receiver.z};
  for(const r of RECORDERS){const e=this._find(r.id);if(!e)continue;
    const prior=this._signals.get(r.id),ready=this.state.settings?.gameplay?.physicsBackend!=='rapier-dynamic'||(!!this._native(e)&&!!this._native(ring));
    const clear=ready&&presentationAllowsPlayerFacingAction(e,this.state)&&presentationAllowsPlayerFacingAction(ring,this.state)
      &&this._row.disposition!=='quarantine'&&witnessLineOfSight(this.state,e,receiver);
    const quality=borrowedSignalQuality(e,receiver,clear),now=this.state.simTime;
    const continuous=prior&&prior.entity===e&&prior.life===e.occupantGeneration&&prior.at<=now&&now-prior.at<=C.sampleSeconds*2.1;
    const above=quality>=C.clearThreshold||(continuous&&prior.above&&quality>=C.lostThreshold);
    this._signals.set(r.id,{entity:e,life:e.occupantGeneration,quality,at:now,above,
      clearSince:above?(continuous&&prior.above?prior.clearSince:now):null});
  }
},
inspect(entityId){if(!this._active())return {ok:false,reason:'unreadable'};
  const player=this._player(),e=this.state.entities.get(entityId),id=e?.data?.borrowedVoiceRecorderId;
  if(!player||(!id&&e!==this._find('ring'))||(id&&e!==this._find(id))||distance(player.pos,e?.pos)>C.scanRange
    ||!presentationAllowsPlayerFacingAction(e,this.state))return {ok:false,reason:'source_range'};
  if(!this._row.located){this._row.located=true;this._row.evidenceRevision++;}
  const r=RECORDERS.find(r=>r.id===id),signal=this._signals.get(id);
  if(r&&!this._row.recoveredFragmentIds.includes(r.evidenceId)&&signal?.entity===e&&signal.life===e.occupantGeneration
    &&signal.above&&signal.clearSince!=null&&this.state.simTime-signal.at<=C.sampleSeconds*2.1
    &&this.state.simTime-signal.clearSince>=C.clearSeconds&&this._row.disposition!=='quarantine'){
    this._row.recoveredFragmentIds.push(r.evidenceId);this._row.evidenceRevision++;
    this.bus.emit('borrowedVoice:fragmentRecovered',{id:r.evidenceId,sourceId:borrowedVoiceIdentity(id),text:r.text,
      revision:this._row.evidenceRevision,at:this.state.simTime});
    // The durable journal carries the complete canonical fragment. Shared captions remain
    // optional presentation; an unavailable voice slot cannot lose or duplicate evidence.
    this.helpers.voice?.say?.({id:r.evidenceId,channel:'comms',priority:28,text:`${r.name}: ${r.text}`,ttl:8});
  }
  this._offer(id);return {ok:true,recovered:r?this._row.recoveredFragmentIds.includes(r.evidenceId):false};
},
_offer(id=null){const signal=this._signals.get(id),r=RECORDERS.find(r=>r.id===id);
  this.bus.emit('borrowedVoice:offer',{revision:this._row.evidenceRevision,
    recovered:this._row.recoveredFragmentIds.length,disposition:this._row.disposition,
    quality:r?Math.round((signal?.quality||0)*100):null,
    text:borrowedVoiceJournalPlate(this.state)?.body||'Three retained signal sources. Tow clear of shielding and point the antenna toward the broken ring. Unknown words remain unknown.',
    canChoose:this._row.recoveredFragmentIds.length>0&&['open','leave'].includes(this._row.disposition)});
},
_refreshStaleDecision(disposition){const player=this._player();
  if(!['archive','quarantine','leave'].includes(disposition)||!this._active()||this.state.ui?.docked===true||!player
    ||!(distance(player.pos,C.center)<=C.siteRange)||!this._row.recoveredFragmentIds.length
    ||!['open','leave'].includes(this._row.disposition))return;
  this.bus.emit('toast',{text:'The record changed while you were reviewing it. Check the updated evidence before choosing.',
    kind:'info',ttl:6});
  this._offer();
},
choose(disposition,revision){if(this._busy)return {ok:false,reason:'record_changed'};
  if(revision!==this._row.evidenceRevision){this._refreshStaleDecision(disposition);return {ok:false,reason:'record_changed'};}
  if(!this._active()||this.state.ui?.docked===true||!['archive','quarantine','leave'].includes(disposition)||!this._row.recoveredFragmentIds.length
  ||!['open','leave'].includes(this._row.disposition)||!(distance(this._player()?.pos,C.center)<=C.siteRange))return {ok:false,reason:'record_changed'};
  if(disposition===this._row.disposition)return {ok:true,duplicate:true};
  const economy=this.ctx.registry?.get('economy');
  if(disposition==='archive'&&!this._row.archiveReceipt&&typeof economy?.grantCredits!=='function')return {ok:false,reason:'credit_owner_missing'};
  this._busy=true;try{this._row.disposition=disposition;this._row.evidenceRevision++;
    if(disposition==='archive'&&!this._row.archiveReceipt){this._row.archiveReceipt={id:`${C.id}:archive`,amount:C.archiveCr,at:this.state.simTime};
      economy.grantCredits(C.archiveCr,'recovery:borrowed-voice');}
    if(disposition==='quarantine'){this._signals.clear();for(const b of this._bindings.values())b.e.data.signalIsolated=true;}
    this.bus.emit('borrowedVoice:dispositionAccepted',{id:C.id,disposition,revision:this._row.evidenceRevision,
      evidenceIds:[...this._row.recoveredFragmentIds],at:this.state.simTime});
    this.bus.emit('toast',{text:disposition==='quarantine'?'Signal isolated. The missing segment is still missing.'
      :disposition==='archive'?'Record archived. Source continuity remains unconfirmed.':'Record left attached. The evidence stays in your journal.',kind:'info',ttl:6});
    this._offer();return {ok:true};
  }finally{this._busy=false;}
},
_lost(entityId,entity=null){if(this._restoring)return;
  const ring=this._bindings.get('ring');
  if(ring?.e.id===entityId&&(!entity||entity===ring.e)&&ring.life===ring.e.occupantGeneration){
    if(terminal.has(this._row.ringOutcome))return;
    this._row.ringOutcome='destroyed';this._row.evidenceRevision++;this._signals.clear();return;}
  for(const r of RECORDERS){const b=this._bindings.get(r.id);if(!b||b.e.id!==entityId||(entity&&b.e!==entity)
    ||b.life!==b.e.occupantGeneration)continue;
    const row=this._row.recorderOutcomeIds[r.id];if(terminal.has(row.status))return;
    row.status='destroyed';row.pose=pose(b.e);this._row.evidenceRevision++;this._signals.delete(r.id);
  }
},
_capture(){for(const r of RECORDERS){const e=this._find(r.id);if(e){const row=this._row.recorderOutcomeIds[r.id];row.pose=pose(e);if(!terminal.has(row.status))row.status='live';}}},
_shelve(){if(this._restoring)return;this._capture();
  for(const [id,b]of this._bindings){if(this.state.entities.get(b.e.id)!==b.e)continue;
    if(id!=='ring'&&!terminal.has(this._row.recorderOutcomeIds[id].status))this._row.recorderOutcomeIds[id].status='shelved';
    if(id==='ring'&&!terminal.has(this._row.ringOutcome))this._row.ringOutcome='shelved';
    this._bindings.delete(id);this.helpers.removeEntity(b.e.id);}
  this._signals.clear();
},
update(dt,state){if(!this._active())return;for(const id of ['ring',...RECORDERS.map(r=>r.id)])this._spawn(id);
  if(state.simTime<this._nextSample)return;this._nextSample=state.simTime+C.sampleSeconds;
  if(this._row.disposition!=='quarantine')this._sample();
},
serialize(){this._capture();return clone(normalizeBorrowedVoice(this._row));},
deserialize(raw){this._row=normalizeBorrowedVoice(raw);this.state.borrowedVoice=this._row;this._bindings.clear();this._signals.clear();this._nextSample=0;},
afterContinue(){this._restoring=false;this._bindings.clear();this._signals.clear();this._nextSample=0;this._scanSeq=-1;},
newGame(){this._restoring=true;for(const e of [...this.state.entityList])if(e.data?.persistenceOwner===C.owner)this.helpers.removeEntity(e.id);
  this.deserialize(freshBorrowedVoice());this._restoring=false;this._scanSeq=-1;},
destroy(){for(const off of this._subs||[])off();owners.delete(this.state);this._bindings.clear();this._signals.clear();},
};

export function borrowedVoicePresentation(state,entity){const owner=owners.get(state),kind=entity?.data?.borrowedVoiceKind;
  const id=kind==='ring'?'ring':entity?.data?.borrowedVoiceRecorderId;
  if(!owner?._active()||owner._find(id)!==entity)return null;
  const signal=owner._signals.get(id),fresh=signal?.entity===entity&&signal.life===entity.occupantGeneration
    &&signal.at<=state.simTime&&state.simTime-signal.at<=C.sampleSeconds*2.1;
  const qualities=kind==='ring'?RECORDERS.map(r=>{const e=owner._find(r.id),s=owner._signals.get(r.id);
    return e&&s?.entity===e&&s.life===e.occupantGeneration&&owner._native(e)&&s.at<=state.simTime
      &&state.simTime-s.at<=C.sampleSeconds*2.1?s.quality:0;}):[];
  return {kind,recorderId:kind==='ring'?null:id,ownerLife:entity.occupantGeneration,tick:state.tick,simTime:state.simTime,
    nativeBodyReady:!!owner._native(entity),quality:owner._row.disposition==='quarantine'?0
      :kind==='ring'?Math.max(0,...qualities):fresh?signal.quality:0,
    fragmentRevision:owner._row.recoveredFragmentIds.length,disposition:owner._row.disposition,
    phase:owner._row.disposition==='quarantine'?'quarantine':fresh&&signal.above?'clear':'interference'};
}

export function borrowedVoiceScannerReading(state,entity){const owner=owners.get(state),id=entity?.data?.borrowedVoiceRecorderId;
  const r=RECORDERS.find(r=>r.id===id);
  if(!r||!owner?._active()||owner._find(id)!==entity)return null;
  const signal=owner._signals.get(id),fresh=signal?.entity===entity&&signal.life===entity.occupantGeneration
    &&signal.at<=state.simTime&&state.simTime-signal.at<=C.sampleSeconds*2.1;
  const recovered=owner._row.recoveredFragmentIds.includes(r.evidenceId);
  return {kind:'anomaly',label:r.name,detail:recovered?r.text
    :owner._row.disposition==='quarantine'?'Signal isolated · unrecovered words remain unknown'
    :`Retained recorder · signal ${Math.round((fresh?signal.quality:0)*100)}% · tow clear of shielding and align with the ring`};
}
