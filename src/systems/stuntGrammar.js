// PQ-146 registered observer. Physics owns evidence; this owner routes recognition and accounting.
import { createStuntDetector } from '../combat/stuntTaxonomy.js';
import { bindStuntEvidence, unbindStuntEvidence, resetStuntEvidence, bodyLife, noteBodyDeath, journalFor, pruneEvidence, closeFieldIntervals, observeReleaseGrade, serializeStuntEvidence, restoreStuntEvidence } from '../combat/stuntEvidence.js';
import { admitStuntThreat } from '../combat/stuntScoring.js';
import { runOwnsReward } from '../combat/rewardEligibility.js';
import { StuntFlightObserver } from '../combat/stuntFlightEvidence.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { remapStuntReferences } from '../combat/stuntSaveReferences.js';
import { serializeProjectileEvidence, restoreProjectileEvidence, pendingProjectileBodyIds } from '../combat/stuntProjectileEvidence.js';
import { bankIfQuiet, createComboState, recordKill, recordTrick, recordBridge, resetRound, settleCrash, trickPay } from './stuntCombo.js';
import { awardContractCompletion, contractCompletionsFor, heldCargoPodLot, isCivilianEntity } from '../combat/stuntContracts.js';
import { isSalvageRightsItem, makeSalvageRightsItem } from '../data/killRewards.js';
export const STUNT_SYSTEM_SCHEMA_VERSION=2;
export const MAX_RECENT_TRICKS=64;
/** New saved narrative/provenance payload beyond the world's physical state: at most 512 KiB. */
export const STUNT_SAVE_PAYLOAD_LIMIT=512*1024;
const payloadBytes=record=>JSON.stringify(record).length;
// Compaction ladder, cheapest truth loss first. Histories are resampled after load; incident and
// trick rows lose only their oldest entries; an unresolved chain is never declared complete.
const COMPACTION_STEPS=[
  ['histories',r=>{if(r.flight)r.flight.history=[];if(r.projectiles){r.projectiles.playerHistory=[];r.projectiles.surfaceHistory={};}}],
  ['banks',r=>{const combo=r.state?.combo;if(!combo)return;combo.banks=(combo.banks??[]).slice(-2);combo.lastTricks=(combo.lastTricks??[]).slice(-4);
    for(const bank of combo.banks)for(const act of bank.acts??[])act.evidence=(act.evidence??[]).slice(0,3);}],
  ['incidents',r=>{if(r.detector)r.detector.incidents=(r.detector.incidents??[]).slice(-64);r.state.recentTricks=(r.state.recentTricks??[]).slice(-16);}],
  ['chains',r=>{for(const [,incident] of r.detector?.incidents??[])incident.causeChain=(incident.causeChain??[]).slice(0,4);
    for(const trick of r.state.recentTricks??[])trick.causeChain=(trick.causeChain??[]).slice(0,4);}],
  ['contacts',r=>{if(r.projectiles)for(const [id,c] of Object.entries(r.projectiles.contacts??{}))if(c.emitted)delete r.projectiles.contacts[id];}],
  ['incidents-min',r=>{if(r.detector)r.detector.incidents=(r.detector.incidents??[]).slice(-16);r.state.recentTricks=(r.state.recentTricks??[]).slice(-4);}],
];
export function boundStuntSavePayload(record,limit=STUNT_SAVE_PAYLOAD_LIMIT) {
  if(!record||typeof record!=='object')return record;
  let bytes=payloadBytes(record);
  if(bytes<=limit)return record;
  record.compacted=[];
  for(const [name,step] of COMPACTION_STEPS) {
    step(record);record.compacted.push(name);
    bytes=payloadBytes(record);
    if(bytes<=limit)break;
  }
  record.payloadBytes=bytes;record.payloadLimit=limit;
  return record;
}
function ensure(state) {
  if(!state.stunts || state.stunts.schemaVersion!==2) state.stunts={...state.stunts,schemaVersion:2,recentTricks:[],totalTricksDetected:0,tricksByRarity:{common:0,uncommon:0,rare:0,legendary:0},combo:createComboState(),pay:{credits:0,reputation:0,salvageRights:0},contracts:{harm:[]}};
  const st=state.stunts;st.contracts??={harm:[]};st.contracts.harm??=[];
  return st;
}
function noteContractHarm(st,entry) {
  const harm=st.contracts.harm;harm.push(entry);if(harm.length>16)harm.shift();
}
// FB-014 — salvage rights are heard AND kept: every mint and every claim also lands as a
// durable receipt the ship ledger projects (player.salvageRightsLog). Bounded like the other
// receipt arrays; the id dedupes a save/load relay of the same event.
function noteSalvageRightsReceipt(s,record) {
  const player=s.player||(s.player={});
  const log=player.salvageRightsLog||(player.salvageRightsLog=[]);
  if(log.some(r=>r&&r.id===record.id))return;
  log.push(record);if(log.length>48)log.shift();
}

// Only the save owner's four exact Ceres body aliases enter this bounded pending branch.
// It contains proof fragments, never another copy of the live stunt owner or its counters.
function containsBodyAlias(value,aliases) {
  if(typeof value==='string')return aliases.has(value);
  if(!value||typeof value!=='object')return false;
  return Object.values(value).some(child=>containsBodyAlias(child,aliases));
}
function pendingBodyProofs(raw,aliases,tick) {
  if(!aliases.size)return null;
  const evidence=raw?.evidence;
  const lives=(evidence?.lives||[]).filter(([,life])=>aliases.has(String(life.entityId)));
  const lifeIds=new Set(lives.map(([,life])=>life.id));
  const roots=(evidence?.roots||[]).filter(([,root])=>lifeIds.has(root.sourceLife)&&root.tick<=tick&&tick-root.tick<=480);
  const shots=Object.fromEntries(Object.entries(raw?.projectiles?.shots||{})
    .filter(([,shot])=>shot.tick<=tick&&tick-shot.tick<=480&&containsBodyAlias(shot,aliases)));
  const contacts=Object.fromEntries(Object.entries(raw?.projectiles?.contacts||{})
    .filter(([,contact])=>shots[contact.projectileLife]||containsBodyAlias(contact,aliases)));
  return {aliases,savedTick:tick,evidence:evidence?{...evidence,lives,roots,
    bodies:(evidence.bodies||[]).filter(([life])=>lifeIds.has(life)),
    constraints:(evidence.constraints||[]).filter(([,constraint])=>lifeIds.has(constraint.lifeId)||containsBodyAlias(constraint,aliases))}:null,
    projectiles:raw?.projectiles?{...raw.projectiles,shots,contacts,playerHistory:[],surfaceHistory:{}}:null};
}
function mergePendingProofs(record,pending,tick) {
  if(!pending||tick<pending.savedTick||tick-pending.savedTick>480)return record;
  const mergeRows=(oldRows,currentRows,key=([id])=>id)=>[...new Map([...(oldRows||[]),...(currentRows||[])].map(row=>[key(row),row])).values()];
  if(record.evidence&&pending.evidence) {
    const a=pending.evidence,b=record.evidence;
    const roots=a.roots.filter(([,root])=>root.tick<=tick&&tick-root.tick<=480);
    record.evidence={...b,sequence:Math.max(a.sequence,b.sequence),
      lives:mergeRows(a.lives,b.lives,([,life])=>life.id),roots:mergeRows(roots,b.roots).slice(-32),
      bodies:mergeRows(a.bodies,b.bodies),constraints:mergeRows(a.constraints,b.constraints).slice(-32)};
  }
  if(pending.projectiles) {
    const current=record.projectiles||pending.projectiles;
    record.projectiles={...current,shots:Object.fromEntries(Object.entries({...pending.projectiles.shots,...current.shots})
      .filter(([,shot])=>shot.tick<=tick&&tick-shot.tick<=480).slice(-64)),
      contacts:Object.fromEntries(Object.entries({...pending.projectiles.contacts,...current.contacts}).slice(-32))};
  }
  return record;
}
export const stuntGrammar={
  id:'stuntGrammar',name:'stuntGrammar',
  // serialize() wraps every branch in structuredClone before bounding; saveSystem must not
  // clonePlain the whole payload a second time during autosave capture.
  saveSnapshotOwned: true,
  init(ctx) {
    this.destroy();this.state=ctx.state;this.bus=ctx.bus;this._unsubs=[];
    bindStuntEvidence(this.state);ensure(this.state);this.detector=createStuntDetector({playerId:this.state.playerId});this.flight=new StuntFlightObserver();
    for(const entity of this.state.entities?.values?.()??[]) this._admit(entity);
    for(const event of ['combat:collisionConsequence','combat:projectileConsequence','tether:releaseRated','entity:killed','combat:kill','entity:spawned',
      'run:started','game:started','game:newGame','save:restoring','save:loaded','run:waveCleared','run:wavePlanned','player:death','player:died','combat:damage','physics:impact',
      'pickup:collected']) {
      const off=this.bus?.on(event,p=>this._event(event,p??{}));if(typeof off==='function')this._unsubs.push(off);
    }
  },
  destroy() { for(const off of this._unsubs??[])off();this._unsubs=[];this._pendingBodyRestore=null;journalFor(this.state)?.pendingRootTicks?.clear();unbindStuntEvidence(this.state);this.detector=null;this.flight=null; },
  serialize() {
    const s=this.state;if(!s||(s.run?.kind==='survival'&&s.run.phase!=='inactive'))return null;
    if(!this.detector||!this.flight)return null;
    const record=structuredClone({revision:2,mode:'adventure',state:ensure(s),evidence:serializeStuntEvidence(s,pendingProjectileBodyIds(s)),projectiles:serializeProjectileEvidence(s),detector:this.detector.serialize(),flight:this.flight.serialize()});
    return boundStuntSavePayload(mergePendingProofs(record,this._pendingBodyRestore&&structuredClone(this._pendingBodyRestore),s.tick));
  },
  deserialize(raw,remap=null,{pendingBodyRefs=[]}={}) {
    const s=this.state;
    this._pendingBodyRestore=null;
    if(raw?.revision!==2||raw.mode!=='adventure'){s.stunts=null;ensure(s);resetStuntEvidence(s);this.detector=createStuntDetector({playerId:s.playerId});this.flight=new StuntFlightObserver();return;}
    s.stunts=remapStuntReferences(structuredClone(raw.state),remap);ensure(s);restoreStuntEvidence(s,raw.evidence,remap);
    restoreProjectileEvidence(s,raw.projectiles,remap);
    this.detector=createStuntDetector({playerId:s.playerId});this.detector.deserialize(remapStuntReferences(structuredClone(raw.detector),remap));this.flight=new StuntFlightObserver();
    this.flight.restore(remapStuntReferences(structuredClone(raw.flight),remap));
    remapStuntReferences(s.story?.titles,remap);remapStuntReferences(s.story?.lineContracts,remap);remapStuntReferences(s.barkDirector?.stuntRecognition,remap);
    const aliases=new Set(pendingBodyRefs.slice(0,4).filter(id=>typeof id==='string'&&id.startsWith('ceres-ref:')));
    if(aliases.size)this._pendingBodyRestore=pendingBodyProofs(remapStuntReferences(structuredClone(raw),remap),aliases,s.tick);
    journalFor(s).pendingRootTicks=new Map(this._pendingBodyRestore?.evidence?.roots.map(([id,root])=>[id,root.tick])||[]);
  },
  resumeBodyReferences(remap,dropped=[]) {
    const s=this.state,j=journalFor(s),pending=this._pendingBodyRestore;
    if(!j)return;
    // Mutate only references in already-live records; do not replay a serialized detector,
    // journal or owner over progress earned while a site body was materializing.
    for(const map of [j.roots,j.bodies,j.constraints,this.detector?.incidents,this.flight?.tracks]) {
      for(const row of map?.values()||[])remapStuntReferences(row,remap);
    }
    for(const value of [s.stunts,j.projectiles,this.detector?.detectedTricks,this.flight?.history,
      s.story?.titles,s.story?.lineContracts,s.barkDirector?.stuntRecognition])remapStuntReferences(value,remap);
    if(!pending)return;
    remapStuntReferences(pending.evidence,remap);remapStuntReferences(pending.projectiles,remap);
    if(s.tick>=pending.savedTick&&s.tick-pending.savedTick<=480) {
      restoreStuntEvidence(s,pending.evidence,null,{append:true});
      restoreProjectileEvidence(s,pending.projectiles,null,{append:true});
    }
    for(const alias of [...remap.keys(),...dropped])pending.aliases.delete(alias);
    this._pendingBodyRestore=pendingBodyProofs(pending,pending.aliases,pending.savedTick);
    j.pendingRootTicks=new Map(this._pendingBodyRestore?.evidence?.roots.map(([id,root])=>[id,root.tick])||[]);
  },
  _admit(entity) {
    if(!entity)return;
    const life=bodyLife(entity,this.state);
    if(entity.data?.runCohort==='survival') {
      entity.data.bodyLifeId=life.id;
      admitStuntThreat(entity,`${this.state.run?.seed??0}:${this.state.run?.wave??0}`);
    }
  },
  _publishBanks(before) {
    const combo=ensure(this.state).combo;
    for(const bank of combo.banks??[])if(bank.bankId>before)this.bus?.emit('stunt:styleBanked',bank);
  },
  /** PQ-155.03 — an authoritative recognition posts Pitborn standing plus a salvage-rights claim,
   *  never credits. An amendment pays only the upgrade delta over the episode's previous name.
   *  Outside scored runs the right mints as a physical claim chit at the contact site; inside a
   *  run it stays on the session ledger (the run wallet keeps run rewards out of campaign). */
  _payTrick(st,trick,prevTrick,tick) {
    const pay=trickPay(trick),prev=trickPay(prevTrick);
    const rep=Math.max(0,pay.reputation-prev.reputation),rights=Math.max(0,pay.salvageRights-prev.salvageRights);
    if(rep<=0&&rights<=0)return;
    st.pay.reputation+=rep;st.pay.salvageRights+=rights;
    if(rep>0)this.bus?.emit('faction:repDelta',{factionId:pay.factionId,delta:rep,reason:'stunt_trick',trickId:trick.trickId,episodeId:trick.episodeId,tick});
    if(rights<=0)return;
    this.bus?.emit('stunt:salvageRights',{salvageRights:rights,trickId:trick.trickId,name:trick.name,episodeId:trick.episodeId,rarity:trick.rarity,tick});
    noteSalvageRightsReceipt(this.state,{id:`srmint:${trick.episodeId}:${tick}`,kind:'mint',at:tick,
      amount:rights,trickId:trick.trickId,name:trick.name,episodeId:trick.episodeId,rarity:trick.rarity});
    const s=this.state;
    if(s.run?.kind==='survival'&&s.run.phase!=='inactive')return;
    const chit=makeSalvageRightsItem(rights,`${trick.trickId}:${trick.episodeId}`);
    const pos=trick.terminalPos||s.entities?.get?.(s.playerId)?.pos||null;
    if(!chit||!pos||!Number.isFinite(pos.x)||!Number.isFinite(pos.z))return;
    this.bus?.emit('loot:drop',{pos:{x:pos.x,z:pos.z},vel:{x:0,z:0},source:'stunt_claim',items:[chit]});
  },
  /** A scooped claim chit settles into the player's redeemable balance. The shared payload's
   *  acceptance fields are the synchronous commit receipt (the cargo.js convention). */
  _collectRightsChit(p) {
    const s=this.state;
    if(p.collectorId!==s.playerId)return;
    const data=p.pickupId!=null?s.entities?.get?.(p.pickupId)?.data:null;
    if(!isSalvageRightsItem(p)&&!isSalvageRightsItem(data))return;
    const amount=Math.max(0,Math.floor(Number(data?.salvageRights??p.salvageRights??p.amount)||0));
    if(amount<=0){p.acceptedAmount=0;p.rejectedAmount=0;p.invalidAmount=true;return;}
    p.acceptedAmount=amount;p.rejectedAmount=0;
    if(p.rightsGranted===true||data?.rightsGranted===true)return;
    p.rightsGranted=true;if(data)data.rightsGranted=true;
    const player=s.player||(s.player={});
    player.salvageRights=Math.max(0,Math.floor(Number(player.salvageRights)||0))+amount;
    this.bus?.emit('stunt:salvageRightsClaimed',{salvageRights:amount,pickupId:p.pickupId??null,grantReason:data?.grantReason??p.grantReason??null,tick:s.tick});
    noteSalvageRightsReceipt(s,{id:`srclaim:${p.pickupId??'hand'}:${s.tick}`,kind:'claim',at:s.tick,
      amount,grantReason:data?.grantReason??p.grantReason??null});
  },
  _event(event,p) {
    const s=this.state,st=ensure(s),tick=Number.isFinite(p.tick)?p.tick:s.tick;
    if(event==='combat:damage'){
      if(p.targetId===s.playerId&&p.attackerId!==s.playerId)this.flight.damage(tick);
      else if(p.attackerId===s.playerId&&isCivilianEntity(s.entities?.get?.(p.targetId)))noteContractHarm(st,{tick,targetId:p.targetId});
      return;
    }
    if(event==='physics:impact'){if(p.aId===s.playerId||p.bId===s.playerId)this.flight.contact(tick);return;}
    if(event==='pickup:collected'){this._collectRightsChit(p);return;}
    if(event==='save:restoring') { unbindStuntEvidence(s);return; }
    if(event==='save:loaded') { bindStuntEvidence(s);return; }
    if(['run:started','game:started','game:newGame'].includes(event)) {
      this._pendingBodyRestore=null;
      resetStuntEvidence(s);s.stunts=null;ensure(s);this.detector=createStuntDetector({playerId:s.playerId});this.flight=new StuntFlightObserver();
      for(const e of s.entities?.values?.()??[])this._admit(e);return;
    }
    if(event==='entity:spawned') { this._admit(p.entity??s.entities?.get?.(p.id));return; }
    if(event==='tether:releaseRated') { observeReleaseGrade(p.targetId,p.classification,tick,s);return; }
    const bankBefore=(st.combo.nextBankId??1)-1;
    if(event==='combat:collisionConsequence'&&p.targetId===s.playerId) {
      const player=s.entities.get(s.playerId),life=bodyLife(player,s);
      settleCrash(st.combo,{tick,deltaVCruise:life?.cruise>0?p.deltaV/life.cruise:0,
        helmLossSeconds:p.helmLossSeconds,entryHullLossFraction:life?.hull>0?p.hullDamage/life.hull:0});
      this._publishBanks(bankBefore);return;
    }
    if(event==='run:waveCleared'||event==='run:wavePlanned') {
      resetRound(st.combo,tick,{begin:event==='run:wavePlanned'});this._publishBanks(bankBefore);return;
    }
    if(event==='player:died'||event==='player:death') { settleCrash(st.combo,{playerDeath:true,tick});this._publishBanks(bankBefore);return; }
    const survival=s.run?.kind==='survival'&&s.run.phase!=='inactive';
    if(event==='entity:killed'||event==='combat:kill') {
      const entity=s.entities?.get?.(p.id??p.targetId??p.victimId);if(!entity)return;
      const life=noteBodyDeath(entity,s);
      if((p.killerId??p.provenance?.actorId)===s.playerId&&isCivilianEntity(entity))noteContractHarm(st,{tick,targetId:entity.id,killed:true});
      if(survival&&runOwnsReward(entity)) {
        const threat=admitStuntThreat(entity);
        recordKill(st.combo,{lifeId:threat.lifeId??life.id,threatClass:threat.threatClass,playerOwned:(p.killerId??p.provenance?.actorId)===s.playerId,weaponId:p.weaponId,tick});
      }
      return;
    }
    this.detector.setPlayerId(s.playerId);
    for(const trick of this.detector.processEvent(event,{...p,tick})) {
      const old=st.recentTricks.findIndex(t=>t.episodeId===trick.episodeId);
      const prevTrick=old>=0?st.recentTricks[old]:null;
      if(old>=0)st.recentTricks[old]=trick;
      else {st.recentTricks.push(trick);st.totalTricksDetected++;st.tricksByRarity[trick.rarity]++;}
      if(st.recentTricks.length>64)st.recentTricks.shift();
      this._payTrick(st,trick,prevTrick,tick);
      if(survival)recordTrick(st.combo,trick);
      this.bus?.emit(trick.amendment?'stunt:trickAmended':'stunt:trickDetected',trick);
      for(const contractId of contractCompletionsFor(trick,{cargoPodHeld:heldCargoPodLot(s)!=null,civilianHarm:st.contracts.harm})) {
        const card=awardContractCompletion(s,contractId,trick,tick);
        if(card)this.bus?.emit('stunt:lineContractCompleted',card);
      }
    }
    this._publishBanks(bankBefore);
  },
  update(_dt,state) {
    if(state.mode!=='flight')return;
    const st=ensure(state),j=journalFor(state);
    // The per-tick sweep's `lives` pass is unbounded (PQ-210.01 Crucible CPU profile); sweep it
    // every 30th sim tick. Roots/bodies/contacts/constraints stay per-tick, and the serialize
    // path prunes at cadence 1 before it reads, so nothing observable moves.
    pruneEvidence(state,state.tick,30);closeFieldIntervals(state,state.tick);
    for(const receipt of this.flight.update(state)) {
      if(receipt.escape.closeShave&&!receipt.stuntEvidence.root.needle) {
        recordBridge(st.combo,{kind:'close_shave',tick:receipt.tick,threatEpisodeId:receipt.escape.threatEpisodeId,preventedInterception:true});
        this.bus?.emit('stunt:bridge',{trickId:'near_miss',name:'Close Shave',role:'bridge',actorId:state.playerId,
          rootId:receipt.stuntEvidence.root.id,rootTick:receipt.stuntEvidence.root.tick,tick:receipt.tick,evidence:receipt.stuntEvidence});
      }
      this._event('stunt:escapeConsequence',receipt);
    }
    st.pressure=j?.pressure;
    if(st.contracts.harm.length)st.contracts.harm=st.contracts.harm.filter(h=>state.tick-h.tick<=480);
    if(!st.combo.activeCount)return;
    // Until trajectory pressure has been observed, missing threat information cannot mean quiet.
    let loaded=false,pending=-1;
    for(const c of j?.constraints.values()??[])if(c.attached&&c.loadedTicks>0) {
      loaded=true;
      const target=state.entities.get(c.targetId),root=j.roots.get(c.rootId);
      if(target?.alive!==false&&root)recordBridge(st.combo,{kind:'loaded_constraint',tick:state.tick,setupId:root.id,
        liveHostile:isHostileForAI(state,target,state.entities.get(state.playerId)),
        displacementLengths:c.displacement/root.reference.length,usefulDeltaVCruise:Math.hypot(root.dv.x,root.dv.z)/root.reference.cruise});
    }
    for(const r of j?.roots.values()??[])if(!this.detector.incidents.has(r.id))pending=Math.max(pending,r.tick+480);
    const before=(st.combo.nextBankId??1)-1;
    bankIfQuiet(st.combo,state.tick,{incomingInterception:st.pressure?.incomingInterception??true,loadedManipulation:loaded,pendingUntilTick:pending});
    this._publishBanks(before);
  },
};
