// PQ-146 registered observer. Physics owns evidence; this owner routes recognition and accounting.
import { createStuntDetector } from '../combat/stuntTaxonomy.js';
import { bindStuntEvidence, unbindStuntEvidence, resetStuntEvidence, bodyLife, noteBodyDeath, journalFor, pruneEvidence, closeFieldIntervals, observeReleaseGrade, serializeStuntEvidence, restoreStuntEvidence } from '../combat/stuntEvidence.js';
import { admitStuntThreat } from '../combat/stuntScoring.js';
import { runOwnsReward } from '../combat/rewardEligibility.js';
import { StuntFlightObserver } from '../combat/stuntFlightEvidence.js';
import { isHostileForAI } from '../ai/engagementAuthority.js';
import { bankIfQuiet, createComboState, recordKill, recordTrick, recordBridge, resetRound, settleCrash } from './stuntCombo.js';
export const STUNT_SYSTEM_SCHEMA_VERSION=2;
export const MAX_RECENT_TRICKS=64;
function ensure(state) {
  if(!state.stunts || state.stunts.schemaVersion!==2) state.stunts={...state.stunts,schemaVersion:2,recentTricks:[],totalTricksDetected:0,tricksByRarity:{common:0,uncommon:0,rare:0,legendary:0},combo:createComboState(),pay:{credits:0,reputation:0,salvageRights:0}};
  return state.stunts;
}
export const stuntGrammar={
  id:'stuntGrammar',name:'stuntGrammar',
  init(ctx) {
    this.destroy();this.state=ctx.state;this.bus=ctx.bus;this._unsubs=[];
    bindStuntEvidence(this.state);ensure(this.state);this.detector=createStuntDetector({playerId:this.state.playerId});this.flight=new StuntFlightObserver();
    for(const entity of this.state.entities?.values?.()??[]) this._admit(entity);
    for(const event of ['combat:collisionConsequence','tether:releaseRated','entity:killed','combat:kill','entity:spawned',
      'run:started','game:started','game:newGame','save:restoring','save:loaded','run:waveCleared','player:death','player:died','combat:damage','physics:impact']) {
      const off=this.bus?.on(event,p=>this._event(event,p??{}));if(typeof off==='function')this._unsubs.push(off);
    }
  },
  destroy() { for(const off of this._unsubs??[])off();this._unsubs=[];unbindStuntEvidence(this.state);this.detector=null; },
  serialize() {
    const s=this.state;if(s.run?.kind==='survival'&&s.run.phase!=='inactive')return null;
    return structuredClone({revision:2,mode:'adventure',state:ensure(s),evidence:serializeStuntEvidence(s),detector:this.detector.serialize(),flight:this.flight.serialize()});
  },
  deserialize(raw,remap=null) {
    const s=this.state;
    if(raw?.revision!==2||raw.mode!=='adventure'){s.stunts=null;ensure(s);resetStuntEvidence(s);this.detector=createStuntDetector({playerId:s.playerId});return;}
    s.stunts=structuredClone(raw.state);ensure(s);restoreStuntEvidence(s,raw.evidence,remap);
    this.detector=createStuntDetector({playerId:s.playerId});this.detector.deserialize(raw.detector);this.flight=new StuntFlightObserver();
    // Histories use entity references; a rematerialized world must resample them.
    if(!remap||[...remap].every(([old,id])=>String(id)===old))this.flight.restore(raw.flight);
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
  _event(event,p) {
    const s=this.state,st=ensure(s),tick=Number.isFinite(p.tick)?p.tick:s.tick;
    if(event==='combat:damage'){if(p.targetId===s.playerId&&p.attackerId!==s.playerId)this.flight.damage(tick);return;}
    if(event==='physics:impact'){if(p.aId===s.playerId||p.bId===s.playerId)this.flight.contact(tick);return;}
    if(event==='save:restoring') { unbindStuntEvidence(s);return; }
    if(event==='save:loaded') { bindStuntEvidence(s);return; }
    if(['run:started','game:started','game:newGame'].includes(event)) {
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
      if(survival&&runOwnsReward(entity)) {
        const threat=admitStuntThreat(entity);
        recordKill(st.combo,{lifeId:threat.lifeId??life.id,threatClass:threat.threatClass,playerOwned:(p.killerId??p.provenance?.actorId)===s.playerId,weaponId:p.weaponId,tick});
      }
      return;
    }
    this.detector.setPlayerId(s.playerId);
    for(const trick of this.detector.processEvent(event,{...p,tick})) {
      const old=st.recentTricks.findIndex(t=>t.episodeId===trick.episodeId);
      if(old>=0)st.recentTricks[old]=trick;
      else {st.recentTricks.push(trick);st.totalTricksDetected++;st.tricksByRarity[trick.rarity]++;}
      if(st.recentTricks.length>64)st.recentTricks.shift();
      if(survival)recordTrick(st.combo,trick);
      this.bus?.emit(trick.amendment?'stunt:trickAmended':'stunt:trickDetected',trick);
    }
    this._publishBanks(bankBefore);
  },
  update(_dt,state) {
    if(state.mode!=='flight')return;
    const st=ensure(state),j=journalFor(state);pruneEvidence(state,state.tick);closeFieldIntervals(state,state.tick);
    for(const receipt of this.flight.update(state)) {
      if(receipt.escape.closeShave&&!receipt.stuntEvidence.root.needle) {
        recordBridge(st.combo,{kind:'close_shave',tick:receipt.tick,threatEpisodeId:receipt.escape.threatEpisodeId,preventedInterception:true});
        this.bus?.emit('stunt:bridge',{trickId:'near_miss',name:'Close Shave',role:'bridge',actorId:state.playerId,
          rootId:receipt.stuntEvidence.root.id,rootTick:receipt.stuntEvidence.root.tick,tick:receipt.tick,evidence:receipt.stuntEvidence});
      }
      this._event('stunt:escapeConsequence',receipt);
    }
    st.pressure=j?.pressure;
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
