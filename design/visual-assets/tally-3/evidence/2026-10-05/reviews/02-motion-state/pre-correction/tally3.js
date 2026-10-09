// Imported by salvage: one finite source and one embodied assessor, no independent system/save root.
import { TALLY3, TALLY3_SOURCE, TALLY3_EVIDENCE } from '../data/tally3.js';
import { TALLY3_ACTOR_KEY, TALLY3_PLACE_ID, TALLY3_RADIUS, TALLY3_MASS,
  TALLY3_CRATE_RADIUS, isTally3Actor, isTally3Crate, tally3BodySpec, tally3CradleSensor } from '../data/tally3Body.js';
import { zonesForSector } from '../data/sectorZones.js';
import { sectorLocalToGlobalForSector } from '../data/sectorCoordinates.js';
import { indexedTypeScan } from '../world/livingWorldViews.js';
import { createTally3Claims, freshTally3State, normalizeTally3State } from './tally3Claims.js';

const BUDGET_KEY = 'salvage:tally3';
const dist = (a, b) => a?.pos && b?.pos ? Math.hypot(a.pos.x-b.pos.x, a.pos.z-b.pos.z) : Infinity;
const live = e => !!e && e.alive !== false && (e.hull == null || e.hull > 0);
const sourceBody = isTally3Crate;
const ACTOR_STATE = new WeakMap();
// Read-only presentation observation, bound to the exact current physical occupant.
export function tally3StateForEntity(entity) {
  const binding=ACTOR_STATE.get(entity);
  return binding && entity?.occupantGeneration===binding.life
    && binding.state.entities?.get(entity.id)===entity ? binding.state : null;
}
const get = (state,id) => state.entities?.get(id) || null;

export function createTally3Runtime(owner) {
  const { state, bus, helpers, registry } = owner;
  let actor = null, crate = null, restoring = false, budgetBound = false;
  let active = null, sequence = 0, lastChoice = null, retired = false, voiceReceipt = null;
  const subs = [];
  const memory = () => state.salvage?.tally3 || null;
  const claims = createTally3Claims({ state, bus, helpers, registry,
    getSource: () => memory()?.source,
    getCrate: () => crate && get(state,crate.id) === crate ? crate : null,
    getReceiver: receiver,
  });
  const on = (name,fn) => { const off = bus.on(name,fn); subs.push(typeof off==='function'?off:()=>bus.off?.(name,fn)); };
  function fact() {const s=memory()?.source;if(s)bus.emit('tally3:fact',{sourceKey:s.sourceKey,lotId:s.lotId,claimRevision:s.claimRevision,disposition:s.disposition});}
  function cancelVoice() { if (voiceReceipt) helpers.voice?.cancel?.(voiceReceipt); voiceReceipt=null; }
  function phase(name, targetId=null, receiptId=null) {
    if (!actor || !actor.data) return;
    actor.data.tally3Presentation = { phase:name, startedAt:Number(state.simTime)||0,
      targetId, receiptId, serial:++sequence };
  }
  function close(reason='closed') {
    claims.invalidateOffers();
    if (active) bus.emit('tally3:closed',{ requestId:active.requestId, reason });
    active = null; lastChoice = null; cancelVoice(); phase('withdraw');
  }
  function say(text, milestone) {
    const mem = memory(); if (!mem || !live(actor) || !text) return false;
    if (milestone && mem.milestoneIds?.includes(milestone)) return false;
    const now = Number(state.simTime)||0;
    if (Number.isFinite(mem.lastVoiceAt) && now-mem.lastVoiceAt < 90) return false;
    const voice = helpers.voice;
    if (!voice?.sayOwned) return false;
    cancelVoice();
    const granted = voice.sayOwned({id:'tally3:voice',channel:'comms',text:`Tally-3: ${text}`,kind:'info',ttl:4});
    if (!granted) return false;
    voiceReceipt=granted;
    mem.lastVoiceAt = now;
    if (milestone) mem.milestoneIds = [...(mem.milestoneIds||[]),milestone].slice(-16);
    return true;
  }
  function receiver(id) {
    if (id === TALLY3.cradleReceiverId) {
      const sensor = tally3CradleSensor(actor);
      return sensor && get(state,actor.id) === actor && !memory()?.destroyed ? {entity:actor,sensor} : null;
    }
    if (id !== TALLY3.stationReceiverId) return null;
    for (const station of indexedTypeScan(state,['stations'],state.entityList||[])) {
      if (station.type !== 'station' || station.data?.stationId !== id || !live(station)) continue;
      const radius = Number(station.data?.dockRadius || station.radius);
      if (!(radius>0) || !station.pos) continue;
      return { entity:station, sensor:{x:station.pos.x,z:station.pos.z,radius} };
    }
    return null;
  }
  function bindBudget() {
    if (budgetBound || !live(actor) || !helpers.spawnBudget) return budgetBound;
    if (helpers.spawnBudget.request(1,BUDGET_KEY)!==1) return false;
    if (!helpers.spawnBudget.bindEntity(actor.id,BUDGET_KEY)) { helpers.spawnBudget.release(BUDGET_KEY); return false; }
    return budgetBound=true;
  }
  function releaseBudget() {
    if (actor) helpers.spawnBudget?.releaseEntity?.(actor.id,actor);
    helpers.spawnBudget?.release?.(BUDGET_KEY); budgetBound=false;
  }
  function adopt() {
    actor=null; crate=null;
    // Exactly one bounded lifecycle census. No frame-by-frame entity-map classification.
    const bodies=[],actors=[];
    for (const e of state.entityList||[]) {
      if (sourceBody(e) && live(e)) bodies.push(e);
      if (isTally3Actor(e) && live(e)) actors.push(e);
    }
    if (bodies.length===1) crate=bodies[0];
    if (actors.length===1) {actor=actors[0];ACTOR_STATE.set(actor,{state,life:actor.occupantGeneration});}
    const mem=memory(); if (!mem) return;
    if (bodies.length>1 || actors.length>1) { mem.source.integrityError='duplicate_body'; close('duplicate_body'); return; }
    if (mem.source?.remainingQty===0 && ['returned','destroyed','lost','kept','stolen'].includes(mem.source?.disposition)) {
      if (crate) helpers.removeEntity?.(crate.id); crate=null;
    }
    if (actor) { mem.hull=actor.hull; if (mem.destroyed) { helpers.removeEntity?.(actor.id); actor=null; } }
    if (crate) mem.activeWreckId=TALLY3_SOURCE.sourceKey;
  }
  function materialize() {
    if (retired || restoring || state.world?.currentSectorId!==TALLY3_SOURCE.sectorId) return;
    if (!memory()) state.salvage.tally3=freshTally3State();
    const mem=memory();
    if (mem.source?.integrityError || !mem.source) return;
    const site=zonesForSector(TALLY3_SOURCE.sectorId).find(z=>z.id===TALLY3_SOURCE.zoneId);
    if (!site?.center) { mem.source.integrityError='site_missing'; return; }
    const center=sectorLocalToGlobalForSector(site.center,TALLY3_SOURCE.sectorId);
    if (!actor && !mem.destroyed && !mem.assessorSpawned) {
      const budget=helpers.spawnBudget;
      // A real population slot is required. No legacy no-budget fallback for authored actors.
      if (budget?.request?.(1,BUDGET_KEY)===1) {
        actor=helpers.spawnEntity?.({type:'ship',team:2,factionId:'faction_dmc',
          pos:center,vel:{x:0,z:0},rot:0,radius:TALLY3_RADIUS,mass:TALLY3_MASS,
          hull:120,hullMax:120,shield:0,collides:true,physicsBody:tally3BodySpec(),
          flags:{persistent:true},data:{tally3ActorKey:TALLY3_ACTOR_KEY,role:'tally3_assessor',
            name:'Tally-3',callsign:'TALLY-3',placeId:TALLY3_PLACE_ID,sectorId:TALLY3_SOURCE.sectorId,
            homeSectorId:TALLY3_SOURCE.sectorId,ai:{passive:true},salvagePool:{},
            tally3Presentation:{phase:'patrol',startedAt:Number(state.simTime)||0,serial:++sequence}}});
        if (actor) { ACTOR_STATE.set(actor,{state,life:actor.occupantGeneration});mem.assessorSpawned=true; mem.hull=actor.hull; budgetBound=budget.bindEntity(actor.id,BUDGET_KEY); }
        else budget.release(BUDGET_KEY);
      }
    } else if (actor) bindBudget();
    if (!crate && !mem.crateSpawned && mem.source.disposition==='open') {
      crate=helpers.spawnEntity?.({type:'payload',team:2,factionId:'faction_dmc',
        pos:{x:center.x+58,z:center.z+12},vel:{x:0,z:0},rot:0,
        radius:TALLY3_CRATE_RADIUS,mass:32,hull:36,hullMax:36,collides:true,
        physicsBody:{schemaVersion:1,dynamic:true,mass:32,shape:'capsule',radius:TALLY3_CRATE_RADIUS,material:'debris',useMeasuredSkin:false},
        flags:{persistent:true},data:{kind:'tally3_claim_crate',name:'Driller electronics crate',
          commodityId:TALLY3_SOURCE.commodityId,tally3SourceKey:TALLY3_SOURCE.sourceKey,
          tally3LotId:TALLY3_SOURCE.lotId,sectorId:TALLY3_SOURCE.sectorId,
          cargoIdentity:{ownerId:mem.source.claimantId},scanLabel:'Driller electronics crate',
          // No generic pickup/salvagePool/manifest tag: explicit claim choice owns cargo intake.
          tally3ReleaseRecordId:TALLY3_EVIDENCE.release.id}});
      if (crate) { mem.crateSpawned=true; mem.activeWreckId=TALLY3_SOURCE.sourceKey; }
    }
  }
  function validSelection(targetId) {
    const player=get(state,state.playerId), selected=state.player?.targetId;
    if (state.mode!=='flight' || state.ui?.docked || !live(player) || targetId!==selected) return false;
    const target=get(state,targetId);
    return live(target) && (target===crate || target===actor || target.data?.stationId===TALLY3.stationReceiverId)
      && dist(player,target)<=420 && (live(crate) || target===actor);
  }
  function view(reason=null) {
    if (!active) return null;
    const readout=claims.inspect({bodyId:crate?.id});
    active.viewSerial=++sequence; active.readout=readout;
    const out={...readout,requestId:active.requestId,targetId:active.targetId,readoutSerial:active.viewSerial,
      reason,mode:active.mode,offer:active.offer||null,
      assessorAlive:live(actor)&&!memory()?.destroyed};
    bus.emit('tally3:readout',out); return out;
  }
  function inspect(p={}) {
    materialize();
    const targetId=p.targetId ?? state.player?.targetId;
    if (!validSelection(targetId)) return {ok:false,reason:'selection_or_range_invalid'};
    const result=claims.inspect({bodyId:crate?.id});
    close('replaced');
    active={requestId:`tally3:${++sequence}`,targetId,bodyId:crate?.id??null,bodyLife:crate?.occupantGeneration??null,mode:'inspect'};
    phase(result.terminal?'patrol':'assess',crate?.id??null); view(result.ok?null:result.reason);
    return result;
  }
  function action(p={}) {
    if (!active || p.requestId!==active.requestId || p.targetId!==active.targetId || p.readoutSerial!==active.viewSerial
      || !validSelection(active.targetId) || active.bodyId!==(crate?.id??null)
      || active.bodyLife!==(crate?.occupantGeneration??null)) { close('stale_selection'); return {ok:false,reason:'stale_selection'}; }
    if (p.choice==='close') { close(); return {ok:true}; }
    let result;
    if (p.choice==='return') {
      const candidates=[TALLY3.cradleReceiverId,TALLY3.stationReceiverId];
      const receiverId=candidates.find(id=>{const r=receiver(id);return r&&Math.hypot(crate.pos.x-r.sensor.x,crate.pos.z-r.sensor.z)<=r.sensor.radius;})
        || (live(actor)&&!memory()?.destroyed?TALLY3.cradleReceiverId:TALLY3.stationReceiverId);
      result=claims.offerReturn({bodyId:crate.id,receiverId});
      if (result.ok) { active.mode='return'; active.offer=result.offer; phase('wait_delivery',crate.id); }
    } else if (p.choice==='confirm_return' && active.mode==='return' && active.offer) {
      result=claims.confirmReturn({offerId:active.offer.offerId,bodyId:crate.id,receiverId:active.offer.receiverId});
      if (result.ok) {
        const id=result.receipt?.receiptId||result.receipt?.id;
        close('returned'); phase('receipt',null,id);
        if (!result.duplicate) {fact();bus.emit('tally3:receipt',{...result,kind:'returned'});}
        say('Returned intact. I will round nothing down.','returned'); return result;
      }
    } else if (p.choice==='contest') {
      result=claims.contest({bodyId:crate.id,evidenceId:TALLY3_EVIDENCE.release.id,
        claimRevision:p.claimRevision,evidenceRevision:p.evidenceRevision});
      if (result.ok) {fact();phase('offer',crate.id);say('The record is wrong. How inconvenient for the record.','corrected');}
    } else if (p.choice==='take') {active.mode='theft_warning';active.warning={claimRevision:p.claimRevision,evidenceRevision:p.evidenceRevision};result={ok:true};}
    else if (p.choice==='confirm_theft' && active.mode==='theft_warning') {
      result=claims.take({bodyId:crate.id,mode:'theft',...active.warning});
    } else if (p.choice==='keep') result=claims.take({bodyId:crate.id,mode:'keep',claimRevision:p.claimRevision,evidenceRevision:p.evidenceRevision});
    else return {ok:false,reason:'invalid_choice'};
    lastChoice=result;
    if (result?.ok && result.acceptedQty>0) {
      fact();bus.emit('tally3:receipt',{...result,kind:result.mode});
      if (!result.remainingQty) close('taken');
    }
    if (active) view(result?.ok?null:result?.reason);
    return result;
  }
  function update() {
    if (retired||restoring) return;
    const mem=memory();
    if (!mem) return;
    if (!mem.assessorSpawned && !mem.destroyed && helpers.spawnBudget?.available?.()>0) materialize();
    if (actor && (!live(actor)||get(state,actor.id)!==actor)) {mem.destroyed=true;mem.hull=0;releaseBudget();cancelVoice();if(active)view('assessor_destroyed');actor=null;}
    if (crate && (!live(crate)||get(state,crate.id)!==crate) && mem.source?.remainingQty>0) {claims.markDestroyed({bodyId:crate.id});fact();crate=null;}
    if (active && !validSelection(active.targetId)) close('selection_or_range_changed');
    const gesture = actor?.data?.tally3Presentation;
    if (!active && gesture?.targetId != null
      && (gesture.targetId !== state.player?.targetId || !live(crate) || crate.id !== gesture.targetId
        || state.mode !== 'flight' || state.ui?.docked || dist(get(state,state.playerId),crate)>TALLY3.inspectRadius)
      && ['assess','offer','disputed','wait_delivery'].includes(gesture.phase)) {
      cancelVoice(); phase('withdraw');
    }
    if (live(actor) && state.world?.currentSectorId===TALLY3_SOURCE.sectorId) {
      const player=get(state,state.playerId);
      if (dist(player,actor)<=420) {
        if (!mem.met) {mem.met=true;say('Owner identified. You may still move it. Moving is not owning.','met');}
      } else cancelVoice();
      if (Number.isFinite(actor.hull)) mem.hull=actor.hull;
      const pose=actor.data.tally3Presentation;
      if(pose?.phase==='assess' && state.simTime-pose.startedAt>=1.4) phase('offer',pose.targetId);
      else if(pose?.phase==='receipt' && state.simTime-pose.startedAt>=0.45) phase('withdraw');
      else if(pose?.phase==='withdraw' && state.simTime-pose.startedAt>=1.1) phase('patrol');
    }
  }
  on('tally3:inspect',inspect); on('tally3:choose',action);
  on('scan:pulse',p=>{const result=claims.discoverEvidence(p||{});if(result?.ok && !result.duplicate){phase('disputed',crate?.id);if(active)view();}});
  on('sector:enter',()=>{if(!restoring)adopt();});
  on('sector:exit',p=>{close('sector_exit');if(!p?.continuous&&!p?.noTeleport)releaseBudget();});
  on('save:restoring',()=>{restoring=true;close('restore');releaseBudget();actor=null;crate=null;});
  on('save:loaded',()=>{restoring=false;adopt();claims.reconcile();const mem=memory();
    if(mem?.crateSpawned&&!crate&&mem.source?.remainingQty>0){claims.markDestroyed({bodyId:null,reason:'lost'});fact();}
    if(mem?.assessorSpawned&&!actor){mem.destroyed=true;mem.hull=0;}
    materialize();});
  on('entity:killed',p=>{if(p?.id===actor?.id||p?.id===crate?.id)update();});
  return {claims,inspect,action,update,materialize,adopt,getActor:()=>actor,getCrate:()=>crate,getReceiver:receiver,
    serialize(){ update();const mem=memory();return mem ? normalizeTally3State(mem) : null; },
    deserialize(raw){close('restore');actor=null;crate=null;if(raw!=null)state.salvage.tally3=normalizeTally3State(raw);},
    newGame(){close('new_game');releaseBudget();if(actor)helpers.removeEntity?.(actor.id);if(crate)helpers.removeEntity?.(crate.id);actor=null;crate=null;restoring=false;},
    destroy(){retired=true;close('destroy');releaseBudget();for(const off of subs)off();},
    getLastChoice:()=>lastChoice,
    preservesCrate(entity){return entity===crate && get(state,entity?.id)===entity && live(entity)
      && sourceBody(entity) && entity.flags?.persistent===true && memory()?.source?.remainingQty>0
      && !memory()?.source?.integrityError && ['open','corrected','kept','stolen'].includes(memory()?.source?.disposition);}};
}
