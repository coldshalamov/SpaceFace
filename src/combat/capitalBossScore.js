import { requireCapitalBossEncounter } from '../data/encounters/capital-boss.js';
import { resolveBossShapes, bodyIntersectsBossShapes } from './capitalBossGeometry.js';

const copy = value => JSON.parse(JSON.stringify(value));
const key = id => `${typeof id}:${String(id)}`;
const compareIds=(a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0;
const requireTick=t=>{if(!Number.isSafeInteger(t)||t<0) throw new TypeError('A nonnegative fixed simulation tick is required');};
const getBeat=(score,id)=>score.beats.find(b=>b.id===id);
// Native action-family gates also apply to authored attacks. A thermal overload or tumble is
// not bypassed merely because this attack uses an authored footprint instead of action_burst.
const REQUIRED_ACTION_TAGS = Object.freeze({
  weapon: ['weapon', 'burst'], drive: ['dash', 'sling'],
  tether_spool: ['tether', 'attach', 'reel', 'sling'],
});
export function validFightId(id) {return typeof id==='string' && /^[A-Za-z0-9][A-Za-z0-9_:/.-]{0,159}$/.test(id) && !['constructor','prototype','__proto__'].includes(id);}

/** JSON-only state. The caller owns this record inside GameState, never inside the renderer. */
export function createCapitalBossFight({ encounterId, fightId, bossId, targetId, tick=0, mirror=1 }) {
  requireCapitalBossEncounter(encounterId);requireTick(tick);
  if(!validFightId(fightId) || bossId==null || targetId==null || bossId===targetId) throw new TypeError('Distinct boss/target and a fight id are required');
  return { version:1,encounterId,fightId:String(fightId),bossId,targetId,mirror:mirror<0?-1:1,
    lastTick:tick-1,clock:0,started:false,suspended:false,terminal:null,actIndex:-1,
    phase:'intro',actStartedAt:0,nextAt:0,sequence:0,castOrdinal:0,cast:null,
    wings:{},lastVoiceAt:-1000000,lastOrderSignature:null,lastWingGate:null,
    telemetry:{casts:0,cancelled:0,hits:0,actsSeen:[],actsSkipped:[],suspensions:0} };
}
export function restoreCapitalBossFight(saved) {
  if(!saved || saved.version!==1) throw new TypeError('Unsupported capital fight save version');
  requireCapitalBossEncounter(saved.encounterId);
  requireTick(saved.clock);
  if(!Number.isSafeInteger(saved.lastTick)||saved.lastTick < -1||saved.actIndex < -1||saved.actIndex>2)
    throw new TypeError('Invalid capital fight save');
  if(!validFightId(saved.fightId)||!Number.isInteger(saved.actIndex)||typeof saved.started!=='boolean'||
    typeof saved.suspended!=='boolean'||!saved.telemetry||!saved.wings||
    !Number.isSafeInteger(saved.nextAt)||saved.nextAt<0||
    (saved.cast && (!getBeat(requireCapitalBossEncounter(saved.encounterId).score,saved.cast.beatId)||
      !Array.isArray(saved.cast.hitKeys)||!Array.isArray(saved.cast.shapes)))) throw new TypeError('Malformed capital fight save');
  return copy(saved);
}
/** Rebind only after the mission owner has rematerialized durable roles. No numeric id survives by assumption. */
export function rebindCapitalBossFight(r, { bossId,targetId,wingIds={} }) {
  if(bossId==null||targetId==null||bossId===targetId) throw new TypeError('Invalid role rebind');
  const mapping=new Map([[key(r.bossId),bossId],[key(r.targetId),targetId]]);
  r.bossId=bossId;r.targetId=targetId;
  for(const [wingId,ids] of Object.entries(wingIds)) {
    const old=r.wings[wingId]?.ids||[];
    if(old.length!==ids.length) throw new TypeError(`Role cardinality changed for ${wingId}; retain tombstones`);
    old.forEach((id,i)=>{if(id!=null)mapping.set(key(id),ids[i]);});
    if(r.wings[wingId]) r.wings[wingId].ids=[...ids];
  }
  if(r.cast) r.cast.hitKeys=r.cast.hitKeys.filter(k=>!mapping.has(k)||mapping.get(k)!=null).map(k=>mapping.has(k)?key(mapping.get(k)):k);
  r.lastOrderSignature=null;r.lastWingGate=null;
}
export function bindCapitalBossWing(r, wingId, entityIds) {
  const w=r.wings[wingId],definition=requireCapitalBossEncounter(r.encounterId).score.wings.find(x=>x.id===wingId);
  if(!w || !definition) throw new RangeError(`Unrequested wing: ${wingId}`);
  if(!Array.isArray(entityIds)||entityIds.length!==definition.members.length||
    new Set(entityIds.filter(x=>x!=null).map(key)).size!==entityIds.filter(x=>x!=null).length) throw new TypeError('Invalid wing receipt');
  if(w.bound && JSON.stringify(w.ids)!==JSON.stringify(entityIds)) throw new Error('Wing spawn receipt changed');
  w.ids=[...entityIds];w.bound=true;r.lastWingGate=null;
}

/** One invocation per fixed tick. Returns owner commands/facts; it never damages or moves entities. */
export function stepCapitalBossFight(r,o) {
  requireTick(o.tick);
  if(o.tick===r.lastTick) return [];
  if(o.tick<r.lastTick) throw new RangeError('Boss score cannot run backwards');
  if(!Number.isFinite(o.simTime)) throw new TypeError('Observation requires state.simTime');
  if(!r.suspended && r.started && !r.terminal && o.active!==false && o.tick!==r.lastTick+1)
    throw new RangeError('Missing fixed ticks: suspend before unloading; never catch up attacks');
  r.lastTick=o.tick;
  const e=requireCapitalBossEncounter(r.encounterId),s=e.score,out=[];
  const emit=(type,payload={})=>out.push({type,fightId:r.fightId,encounterId:r.encounterId,tick:o.tick,simTime:o.simTime,...payload});
  const voice=(text,priority='chatter',force=false)=>{
    if(!text||(!force && r.clock-r.lastVoiceAt<s.voiceGapTicks)) return;
    r.lastVoiceAt=r.clock;emit('voice',{text,priority});
  };
  const cancel=reason=>{
    if(r.cast) {emit('telegraphEnd',{castId:r.cast.id,reason});r.telemetry.cancelled++;r.cast=null;}
  };
  const order=(phase,beat=null,heading=null)=>{
    const motion=phase==='active'&&beat ? beat.motion : {forward:0,brake:true};
    const value={entityId:r.bossId,phase,suppressStockFire:true,forward:motion.forward,
      brake:motion.brake,heading:heading??null};
    const signature=JSON.stringify(value);
    if(signature!==r.lastOrderSignature) {r.lastOrderSignature=signature;emit('order',value);}
  };
  const wingGate=(allowed)=>{
    // One attacker receives a token at a time, and only in the boss's recovery.
    const ids=Object.values(r.wings).filter(w=>w.bound&&r.clock>=w.readyAt).flatMap(w=>w.ids).filter(id=>id!=null).sort(compareIds);
    const turn=Math.floor(r.clock/90)%Math.max(1,ids.length);
    const value=ids.map((id,i)=>({entityId:id,suppressStockFire:!allowed||i!==turn}));
    // Include ingress members too: there must never be an un-gated warmup interval.
    for(const w of Object.values(r.wings)) for(const id of w.ids) if(id!=null&&!ids.includes(id)) value.push({entityId:id,suppressStockFire:true});
    const signature=JSON.stringify(value);
    if(signature!==r.lastWingGate) {r.lastWingGate=signature;emit('wingGate',{orders:value});}
  };
  const finish=outcome=>{
    cancel(outcome);r.terminal=outcome;r.phase='terminal';order('terminal');wingGate(false);
    voice(outcome==='victory'?s.victory:outcome==='mutual'?'Both hulls lost. No victory is declared by the score.':s.lossLesson,'objective',true);
    emit('ended',{outcome,telemetry:copy(r.telemetry)});
  };
  if(r.terminal) return out;
  // Absence is not destruction: sector unload/save rematerialization must not invent a kill.
  if(o.boss?.id===r.bossId && (o.boss.alive===false||o.boss.hull<=0)) {
    finish(o.target && (o.target.alive===false||o.target.hull<=0)?'mutual':'victory');return out;
  }
  if(o.target?.id===r.targetId && (o.target.alive===false||o.target.hull<=0)) {finish('defeat');return out;}
  if(o.active===false || !o.boss || !o.target) {
    if(!r.suspended) {cancel('suspended');r.suspended=true;r.telemetry.suspensions++;r.phase='suspended';order('suspended');wingGate(false);emit('suspended');}
    return out;
  }
  if(o.boss.id!==r.bossId||o.target.id!==r.targetId) throw new TypeError('Observation roles do not match fight');
  for(const body of [o.boss,o.target]) if(!Number.isFinite(body.pos?.x)||!Number.isFinite(body.pos?.z)) throw new TypeError('Finite XZ positions required');
  if(!Number.isFinite(o.boss.hull)||!Number.isFinite(o.boss.hullMax)||o.boss.hullMax<=0) throw new TypeError('Finite capital hull bounds required');
  const boss=o.boss,target=o.target,disabled=new Set(boss.disabled||[]);
  const blockedTags=new Set(boss.blockedActionTags||[]);
  const blockReason=b=>disabled.has('subsystem_power')||b.requires.some(x=>disabled.has(`subsystem_${x}`))
    ? 'subsystem_disabled'
    : b.requires.some(x=>(REQUIRED_ACTION_TAGS[x]||[]).some(tag=>blockedTags.has(tag)))
      ? 'action_family_blocked' : null;
  const usable=b=>blockReason(b)===null;
  if(!r.started) {
    r.started=true;r.phase='intro';r.nextAt=r.clock+s.introTicks;
    emit('started',{bossId:r.bossId,targetId:r.targetId,name:s.name,lesson:s.lesson});voice(s.intro,'objective',true);order('intro');wingGate(false);
  }
  if(r.suspended) {
    r.suspended=false;r.phase=r.actIndex<0?'intro':'transition';
    r.nextAt=Math.max(r.nextAt,r.clock+s.resumeTicks);
    r.lastOrderSignature=null;order(r.phase);wingGate(false);emit('resumed',{warmupTicks:s.resumeTicks});
  }
  const enterAct=index=>{
    cancel('act_changed');
    for(let i=r.actIndex+1;i<index;i++) r.telemetry.actsSkipped.push(s.acts[i].id);
    r.actIndex=index;r.actStartedAt=r.clock;r.sequence=0;r.phase='transition';r.nextAt=r.clock+s.transitionTicks;
    const act=s.acts[index];r.telemetry.actsSeen.push(act.id);
    const disabledBark=Object.entries(act.disabledBarks||{}).find(([id])=>disabled.has(id))?.[1];
    emit('actChanged',{actId:act.id,index,title:act.title,doctrineId:act.doctrine});
    voice(disabledBark||act.bark,'objective',true);order('transition');wingGate(false);
    for(const w of s.wings) if(index>=w.atAct && !r.wings[w.id]) {
      r.wings[w.id]={ids:[],bound:false,readyAt:r.clock+w.ingressTicks};
      emit('wingRequested',{wing:copy(w),bossId:r.bossId,targetId:r.targetId});
    }
  };
  if(r.actIndex<0) {
    if(r.clock>=r.nextAt) {
      let index=0;
      for(let i=1;i<s.acts.length;i++) if(shouldEnter(s.acts[i],boss,disabled)) index=i;
      enterAct(index);
    }
  } else {
    let next=r.actIndex;
    for(let i=r.actIndex+1;i<s.acts.length;i++) if(shouldEnter(s.acts[i],boss,disabled)) next=i;
    if(next!==r.actIndex) enterAct(next);
  }
  if(r.cast && !usable(getBeat(s,r.cast.beatId))) {
    const reason=blockReason(getBeat(s,r.cast.beatId));
    cancel(reason);r.phase='recovery';r.nextAt=r.clock+150;
    emit('countered',{reason});order('recovery');
  }
  if(r.cast) {
    const c=r.cast,b=getBeat(s,c.beatId),age=r.clock-c.startedAt;
    if(age < b.tellTicks) {
      r.phase='tell';
      if(age<=b.trackTicks) c.shapes=resolveBossShapes(b,boss,target,r.mirror);
      if(!c.locked && age>=b.trackTicks) {
        c.locked=true;c.heading=lockedHeading(boss,target,b,disabled,r.mirror);
        emit('telegraph',{...telegraph(r,c,b),locked:true});
      } else if(!c.locked && age%6===0) emit('telegraph',telegraph(r,c,b));
      order('tell',null,c.heading);wingGate(false);
    } else if(age < b.tellTicks+b.activeTicks) {
      r.phase='active';
      if(!c.fired) {c.fired=true;emit('attack',{...telegraph(r,c,b),locked:true});}
      order('active',b,c.heading);wingGate(false);
      const targets=(o.targets||[target]).filter(x=>x&&x.alive!==false&&x.id!==boss.id).sort((a,b)=>compareIds(a.id,b.id)).slice(0,8);
      for(const body of targets) {
        const k=key(body.id);
        // On the first live tick, test current geometry only: motion completed while the tell
        // was harmless must not retroactively count as a hit. Later active ticks use a sweep.
        if(!c.hitKeys.includes(k) && bodyIntersectsBossShapes(body,c.shapes,age>b.tellTicks)) {
          c.hitKeys.push(k);r.telemetry.hits++;
          emit('damage',{attackerId:boss.id,targetId:body.id,packet:copy(b.packet),origin:{kind:'capital_score',id:c.id}});
          emit('hit',{castId:c.id,beatId:b.id,targetId:body.id,counter:b.counter});
        }
      }
    } else {
      emit('telegraphEnd',{castId:c.id,reason:'spent'});r.cast=null;r.phase='recovery';r.nextAt=r.clock+b.recoverTicks;
      if(b.expose) emit('damage',{attackerId:boss.id,targetId:boss.id,
        packet:{channels:{},statuses:[{id:b.expose.status,stacks:1,durationTicks:b.expose.durationTicks}],flags:{}},
        origin:{kind:'capital_exposure',id:c.id}});
      emit('recovery',{beatId:b.id,durationTicks:b.recoverTicks,exposure:b.expose});order('recovery');wingGate(true);
    }
  } else if(r.actIndex>=0 && r.clock>=r.nextAt) {
    const act=s.acts[r.actIndex];let selected=null;
    // Answer range camping with a visible, committed authored attack, never an offscreen tax.
    // Keep the low-cost opening lesson first. Destroying this attack's hardware still defeats it.
    if(s.rangeResponse && r.sequence>=act.opening.length &&
      Math.hypot(target.pos.x-boss.pos.x,target.pos.z-boss.pos.z)>=s.rangeResponse.minRange) {
      const response=getBeat(s,s.rangeResponse.beatId);
      if(usable(response)) selected=response;
    }
    // Bounded skip: a broken subsystem may remove a whole family, never stall on its first beat.
    for(let tries=0;!selected && tries<act.opening.length+act.pattern.length;tries++) {
      const n=r.sequence++,id=n<act.opening.length?act.opening[n]:act.pattern[(n-act.opening.length)%act.pattern.length];
      const b=getBeat(s,id);if(usable(b)) {selected=b;break;}
    }
    if(selected) {
      const b=selected;r.castOrdinal++;r.telemetry.casts++;r.phase='tell';
      r.cast={id:`${r.fightId}:${r.castOrdinal}`,beatId:b.id,startedAt:r.clock,locked:b.trackTicks===0,
        fired:false,hitKeys:[],heading:lockedHeading(boss,target,b,disabled,r.mirror),shapes:resolveBossShapes(b,boss,target,r.mirror)};
      emit('telegraph',telegraph(r,r.cast,b));order('tell',null,r.cast.heading);wingGate(false);
    } else {r.phase='disabled';r.nextAt=r.clock+30;order('disabled');wingGate(false);}
  } else {order(r.phase);wingGate(r.phase==='recovery');}
  r.clock++;return out;
}
function shouldEnter(act,boss,disabled) {
  return boss.hull/boss.hullMax<=act.enter.hullAtMost || (act.enter.anyDisabled||[]).some(id=>disabled.has(id));
}
function lockedHeading(boss,target,beat,disabled,mirror) {
  const first=beat.shapes[0];
  return first.aim==='target'&&!disabled.has('subsystem_sensor')&&!disabled.has('subsystem_power')
    ? Math.atan2(target.pos.z-boss.pos.z,target.pos.x-boss.pos.x) : (boss.rot||0);
}
function telegraph(r,c,b) {
  return {castId:c.id,beatId:b.id,title:b.title,cue:b.cue,counter:b.counter,locked:c.locked,
    clock:r.clock,startedAt:c.startedAt,fireAt:c.startedAt+b.tellTicks,
    endAt:c.startedAt+b.tellTicks+b.activeTicks,shapes:copy(c.shapes)};
}
