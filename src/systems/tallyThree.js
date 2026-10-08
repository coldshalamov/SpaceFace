import { TALLY_THREE, tallyThreeBody, tallyThreeSource, tallyThreeFingerprint, tallyThreeClaimStatus } from '../data/tallyThree.js';
import { makeShipEntitySpec } from './ships.js';
import { deliverTallyThreeCrate } from './cargo.js';
import { TALLY_THREE_RADIUS, tallyThreePhysicalBody } from '../data/tallyThreeBody.js';

function receiverOf(state) {
  let result=null;
  for(const e of state.entityList || [])if(e?.alive!==false&&e.type==='station'&&e.data?.stationId===TALLY_THREE.homeStationId){if(result)return null;result=e;}
  return result;
}
const REFUSAL=Object.freeze({
  'body-or-receiver-changed':'The physical crate or receiver changed. Hail again.',
  'claim-or-contents-changed':'Claim or contents changed. The old quote is void.',
  'claim-disputed':'Claim disputed. Cite the scanned manifest before delivery.',
  'player-custody-required':'Keep your Massline attached until the receiver accepts.',
  'crate-outside-receiver':'Tow the whole crate inside the receiver ring first.',
  'pilot-outside-receiver':'Bring your ship to the receiving ring with the crate.',
  'relative-speed-too-high':'Settle below 8 WU/s relative to the receiver.',
  'value-quote-changed':'The value basis changed. Hail for the current quote.',
  'manifest-not-observed':'Scan this actual crate to read its surviving manifest.',
  'claim-agrees-with-manifest':'The active claim agrees with the manifest. No correction is justified.',
});

export const tallyThree={
  name:'tallyThree',
  init(ctx){
    this.state=ctx.state;this.bus=ctx.bus;this.helpers=ctx.helpers;this.registry=ctx.registry;
    this._offers=new Map();this._unsubs=[];this._nextTick=0;
    const on=(event,fn)=>this._unsubs.push(this.bus.on(event,fn));
    on('sector:enter',()=>{this._offers.clear();this._nextTick=0;});
    on('save:restoring',()=>{this._offers.clear();this._nextTick=0;});
    on('game:new',()=>{this._offers.clear();this._nextTick=0;});
    on('game:newGame',()=>this.newGame());
    on('sector:exit',()=>this._releaseAssessor());
    on('scan:completed',p=>{
      const body=this.state.entities.get(p?.targetId??p?.entityId);
      this.helpers.salvage?.observeTallyManifest(body);
    });
    on('cargo:tallyThreeDelivered',p=>{
      if(p?.receiptId!==tallyThreeSource(this.state)?.delivery?.receiptId)return;
      const actor=tallyThreeBody(this.state,TALLY_THREE.assessorId);
      if(actor)actor.data.tallyThree={phase:'receipt',tick:this.state.tick,receiptId:p.receiptId};
    });
    on('entity:killed',p=>{
      const body=this.state.entities.get(p?.entityId??p?.id??p?.targetId);
      if(body?.data?.worldRecordId===TALLY_THREE.assessorId){
        this.helpers.salvage?.noteTally('assessorLost');this.helpers.spawnBudget?.releaseEntity(body.id,body);
      }
      if(body?.data?.worldRecordId===TALLY_THREE.worldRecordId){
        const source=tallyThreeSource(this.state);
        this.helpers.salvage?.drainSource({sourceKey:TALLY_THREE.sourceKey,minerId:'destroyed',requested:source?.remainingPool});
      }
    });
  },
  update(_dt,state){
    if(state.mode!=='flight'||state.world?.currentSectorId!==TALLY_THREE.sectorId||state.tick<this._nextTick)return;
    this._nextTick=state.tick+60;
    const source=tallyThreeSource(state);
    // The durable accepted custody receipt survives an interrupted credit consumer. This is
    // completion of that accepted delivery, never a new proximity sale or an appraisal reward.
    if(source?.delivery&&!state.economy?.committedIntents?.[source.delivery.receiptId])
      this.registry.get('economy')?.settleTallyThreeDelivery(source.delivery);
    const existing=tallyThreeBody(state,TALLY_THREE.assessorId),budget=this.helpers.spawnBudget;
    if(!source||source.assessorLost){if(existing)this._releaseAssessor();return;}
    if(existing){
      if(budget?.ownerForEntity(existing.id)!==TALLY_THREE.assessorId){
        if(!budget||budget.request(1,TALLY_THREE.assessorId)!==1||!budget.bindEntity(existing.id,TALLY_THREE.assessorId))this._releaseAssessor();
      }
      return;
    }
    const crate=tallyThreeBody(state,TALLY_THREE.worldRecordId);
    if(!crate||typeof this.helpers.spawnEntity!=='function'||!budget||budget.request(1,TALLY_THREE.assessorId)!==1)return;
    const spec=makeShipEntitySpec(TALLY_THREE.assessorShipId,{
      team:2,factionId:'faction_dmc',pos:{x:crate.pos.x+150,z:crate.pos.z+90},
      ai:{passive:true,archetype:'fleeing_trader'},
    });
    spec.radius=TALLY_THREE_RADIUS;
    spec.physicsBody=tallyThreePhysicalBody(spec.mass);
    spec.data={...spec.data,worldRecordId:TALLY_THREE.assessorId,sectorId:TALLY_THREE.sectorId,homeSectorId:TALLY_THREE.sectorId,
        derived:{...spec.data.derived,radius:TALLY_THREE_RADIUS},
        placeId:'place_tally_three',archetypeGlb:'place_tally_three',placeScale:1,
        callsign:'Tally-3',name:'Tally-3',role:'claim_assessor',trafficRole:'tug',transientSector:true,
        tallyThree:{phase:'patrol',tick:state.tick}};
    let actor;
    try{actor=this.helpers.spawnEntity(spec);}catch(error){budget.release(TALLY_THREE.assessorId);throw error;}
    if(!actor||!budget.bindEntity(actor.id,TALLY_THREE.assessorId)){
      if(actor)this.helpers.removeEntity?.(actor.id);budget.release(TALLY_THREE.assessorId);
    }
  },
  offer(availability,requestId,expiresAt){
    const state=this.state,source=tallyThreeSource(state),crate=tallyThreeBody(state,TALLY_THREE.worldRecordId);
    if(!source)return null;
    this.helpers.salvage?.noteTally('met');
    const receiver=receiverOf(state),value=this.registry.get('economy')?.quoteTallyThreeCrate(source);
    const actor=tallyThreeBody(state,TALLY_THREE.assessorId);
    if(actor)actor.data.tallyThree={phase:source.disputedBy?'disputed':'assess',tick:state.tick};
    const quote={crate,generation:crate?.occupantGeneration,receiver,fingerprint:tallyThreeFingerprint(source),
      qty:value?.qty,quoteCr:value?.quoteCr};
    this._offers.clear();this._offers.set(requestId,{quote,expiresAt,targetId:availability.targetId});
    const speaker=actor?'TALLY-3':'CERES RECEIVER';
    const delivered=source.delivery;
    return {requestId,targetId:availability.targetId,kind:'tally_three',expiresAt,
      lines:delivered?[`${speaker} · DELIVERED`,`${TALLY_THREE.manifestId} · one accepted crate; no second payment.`]
        :[`${speaker} · ${tallyThreeClaimStatus(source)} · ${value?.ok?`${value.qty}u / ${value.quoteCr} cr`:'VALUE UNAVAILABLE'}`,
          `${source.claimId===TALLY_THREE.claimId?'Ceres Refinery':source.claimId||'No active claim'} · ${TALLY_THREE.manifestId} · Ceres receiver`],
      actions:delivered?[]:[{id:'tally_deliver',label:'DELIVER'},{id:'tally_contest',label:'CITE MANIFEST'},{id:'tally_receiver',label:'RECEIVER COURSE'}]};
  },
  choose(offer,choice){
    const active=this._offers.get(offer.requestId);
    if(!active||active.targetId!==offer.targetId||this.state.simTime>=active.expiresAt)return null;
    const source=tallyThreeSource(this.state);let text,result=null;
    if(choice==='tally_receiver'){
      const receiver=receiverOf(this.state);
      if(!receiver)text='Ordinary receiver is unavailable in this sector.';
      else {this.bus.emit('ui:setCourse',{pos:{x:receiver.pos.x,z:receiver.pos.z},targetEntityId:receiver.id,
        label:'Ceres claim receiver',arrivalRadius:60,autopilot:true});text='Ceres Refinery receives the same crate. Keep your Massline attached; confirm at the ring.';}
    }else if(choice==='tally_contest'){
      result=this.helpers.salvage?.contestTallyClaim();
      text=result?.ok?'The scanned manifest corrects the claimant. The old quote is void; hail again.':REFUSAL[result?.reason]||'No surviving evidence supports a correction.';
    }else if(choice==='tally_deliver'){
      result=deliverTallyThreeCrate(this.state,active.quote,this.registry);
      text=result.ok?`${result.duplicate?'Already accepted':'Returned intact'} · ${result.qty}u · ${result.creditedCr} cr credited${result.duplicate?' once':''}.`
        :result.custodyAccepted?'Crate accepted by Ceres Refinery. Payment is pending on the accepted receipt.'
          :REFUSAL[result.reason]||'Receiver declined. Custody and payment remain unaccepted.';
      const actor=tallyThreeBody(this.state,TALLY_THREE.assessorId);
      if(result.ok&&!result.duplicate&&actor)actor.data.tallyThree={phase:'receipt',tick:this.state.tick,receiptId:result.receiptId};
    }else return null;
    this._offers.delete(offer.requestId);
    return {...offer,choice,lines:[`TALLY CLAIM · ${tallyThreeClaimStatus(source)}`,text],actions:[],expiresAt:this.state.simTime+4,
      accepted:result?.ok===true,receiptId:result?.receiptId||null};
  },
  _releaseAssessor(){
    const actor=tallyThreeBody(this.state,TALLY_THREE.assessorId);
    if(actor)this.helpers.removeEntity?.(actor.id);
    this.helpers.spawnBudget?.release(TALLY_THREE.assessorId);
  },
  newGame(){this._releaseAssessor();this._offers?.clear();this._nextTick=0;},
  destroy(){this._releaseAssessor();for(const off of this._unsubs||[])if(typeof off==='function')off();this._unsubs=[];this._offers?.clear();},
};
