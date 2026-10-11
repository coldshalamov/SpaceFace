// Local, presentation-only circuit memories. The mission owner supplies authoritative poses
// and gate events; this observer never writes a mission, entity, physics command or save.
import { raceRecordKey, racingLoadoutCategory } from './racingSteer.js';
import { circuitLaps } from './racingGeometry.js';
import { hash32 } from '../core/rng.js';

export const RACING_GHOST_STORAGE_KEY = 'spaceface.racingGhosts.v1';
// Bump for changes to racing physics/assist tuning, independently of the file schema.
export const RACING_GHOST_TUNING = 'circuit-flight-v3-3';
export const RACING_GHOST_LIMITS = Object.freeze({ seconds:600, samples:6002, gates:2048,
  tapes:8, bytes:1024*1024, interval:0.1, maxGap:0.25 });
const VERSION = 1, EPS = 1e-7, sessions = new WeakMap();
let storageRevision = 0;
const finite = Number.isFinite;
const plain = o => !!o && typeof o === 'object' && !Array.isArray(o)
  && (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const id = s => typeof s === 'string' && s.length > 0 && s.length <= 240
  && /^[a-zA-Z0-9_.:@|+\-]+$/.test(s) && !['__proto__','constructor','prototype'].includes(s);
const angle = a => Math.atan2(Math.sin(a),Math.cos(a));
const round = x => Math.round(x*1000000)/1000000;
const within = (n,lo,hi) => finite(n) && n>=lo && n<=hi;
const onlyKeys = (o,keys) => Object.keys(o).every(k=>keys.includes(k));
function defaultStorage() { try { return globalThis.localStorage; } catch { return null; } }

function metadata(params,state,player) {
  if (!params || params.adventureSpeedId || !Array.isArray(params.gates)
      || params.gates.length<2 || params.gates.length>128) return null;
  const category=racingLoadoutCategory(state,player),key=raceRecordKey(params,category);
  const owned=state?.player?.ownedShips?.[state.player.activeShipIndex||0];
  const meta={key,category,course:params.courseId,revision:params.courseRevision||1,
    contract:params.racingContractId,laps:circuitLaps(params),closed:!!params.closedCircuit,
    gateCount:params.gates.length,route:params.routeBranch||'main',
    geometry:hash32(JSON.stringify(params.gates)).toString(16),
    ...(['race','cup'].includes(params.raceMode)?{packDifficulty:params.raceDifficulty||'club'}:{}),
    hull:owned?.defId||player?.data?.shipDefId||'unknown',
    physics:state?.settings?.gameplay?.physicsBackend||'rapier-dynamic',
    flight:state?.settings?.gameplay?.flightBackend||'v3',tuning:RACING_GHOST_TUNING};
  return validMetadata(meta)?meta:null;
}
function validMetadata(m) {
  return plain(m) && onlyKeys(m,['key','category','course','revision','contract','laps','closed','gateCount','route','geometry','hull','physics','flight','tuning','packDifficulty'])
    && ['key','category','course','contract','route','geometry','hull','physics','flight','tuning'].every(k=>id(m[k]))
    && Number.isSafeInteger(m.revision) && m.revision>=1 && m.revision<=1e6
    && Number.isSafeInteger(m.laps) && m.laps>=1 && m.laps<=100
    && typeof m.closed==='boolean' && Number.isInteger(m.gateCount) && m.gateCount>=2 && m.gateCount<=128
    && (m.packDifficulty===undefined||id(m.packDifficulty))
    && m.key===raceRecordKey({courseId:m.course,courseRevision:m.revision,racingContractId:m.contract,laps:m.laps,
      ...(m.packDifficulty?{raceMode:'race',raceDifficulty:m.packDifficulty}:{})},m.category);
}
function matches(a,b) { return !!a && !!b && Object.keys(b).every(k=>a[k]===b[k]); }
function expectedGate(meta,index) {
  if(index<meta.gateCount)return {lap:0,gate:index};
  const perLap=meta.gateCount-(meta.closed?1:0),rest=index-meta.gateCount;
  return {lap:1+Math.floor(rest/perLap),gate:rest%perLap+(meta.closed?1:0)};
}
function gateTotal(meta) { return meta.gateCount+(meta.laps-1)*(meta.gateCount-(meta.closed?1:0)); }

/** Strict complete-envelope validation, also used before writing anything to local storage. */
export function validateRacingGhost(tape) {
  if(!plain(tape)||!onlyKeys(tape,['version','meta','duration','origin','samples','gates'])||tape.version!==VERSION||!validMetadata(tape.meta)
      ||!within(tape.duration,EPS,RACING_GHOST_LIMITS.seconds)||!Array.isArray(tape.origin)
      ||tape.origin.length!==2||!tape.origin.every(x=>within(x,-1e12,1e12))
      ||!Array.isArray(tape.samples)||tape.samples.length<2||tape.samples.length>RACING_GHOST_LIMITS.samples
      ||!Array.isArray(tape.gates)||tape.gates.length!==gateTotal(tape.meta)
      ||tape.gates.length>RACING_GHOST_LIMITS.gates)return false;
  let previous=-1;
  for(const sample of tape.samples){
    if(!Array.isArray(sample)||sample.length!==5||!sample.every(finite)
        ||!within(sample[0],0,tape.duration+EPS)||sample[0]<=previous
        ||(previous>=0&&sample[0]-previous>RACING_GHOST_LIMITS.maxGap+EPS)
        ||!within(sample[1],-1e7,1e7)||!within(sample[2],-1e7,1e7)
        ||!within(sample[3],-Math.PI-EPS,Math.PI+EPS)||!within(sample[4],-10000,10000))return false;
    previous=sample[0];
  }
  if(tape.samples[0][0]>RACING_GHOST_LIMITS.interval+EPS||Math.abs(previous-tape.duration)>EPS)return false;
  previous=-1;
  for(let i=0;i<tape.gates.length;i++){
    const gate=tape.gates[i],expected=expectedGate(tape.meta,i);
    if(!Array.isArray(gate)||gate.length!==3||gate[0]!==expected.lap||gate[1]!==expected.gate
        ||!within(gate[2],0,tape.duration+EPS)||gate[2]<=previous)return false;
    previous=gate[2];
  }
  return Math.abs(previous-tape.duration)<=EPS;
}
function readStore(storage) {
  try {
    const raw=storage?.getItem?.(RACING_GHOST_STORAGE_KEY);
    if(!raw)return [];
    // Envelopes contain ASCII IDs/numbers. Reject before JSON parsing or allocating arrays.
    if(typeof raw!=='string'||raw.length>RACING_GHOST_LIMITS.bytes
        ||new TextEncoder().encode(raw).byteLength>RACING_GHOST_LIMITS.bytes)return [];
    const parsed=JSON.parse(raw);
    if(!plain(parsed)||!onlyKeys(parsed,['version','tapes'])||parsed.version!==VERSION||!Array.isArray(parsed.tapes)
        ||parsed.tapes.length>RACING_GHOST_LIMITS.tapes)return [];
    if(!parsed.tapes.every(validateRacingGhost))return [];
    if(new Set(parsed.tapes.map(t=>t.meta.key)).size!==parsed.tapes.length)return [];
    return parsed.tapes;
  }catch{return [];}
}
export function readRacingGhost(storage,params,state,player=state?.entities?.get?.(state.playerId)) {
  const meta=metadata(params,state,player);
  return meta?readStore(storage).find(t=>matches(t.meta,meta))||null:null;
}
export function exportRacingGhost(storage,params,state,player) {
  const tape=readRacingGhost(storage,params,state,player);
  return tape?JSON.stringify(tape):null;
}
/** Menu-safe management uses a validated persisted key, without inventing a live fitted hull. */
export function listRacingGhosts(storage) {
  return readStore(storage).map(t=>({key:t.meta.key,courseId:t.meta.course,courseRevision:t.meta.revision,
    contractId:t.meta.contract,hullId:t.meta.hull,elapsedS:t.duration,category:t.meta.category,laps:t.meta.laps}));
}
export function exportRacingGhostByKey(storage,key) {
  if(!id(key))return null;
  const tape=readStore(storage).find(t=>t.meta.key===key);return tape?JSON.stringify(tape):null;
}
export function clearRacingGhostByKey(storage,key) {
  if(!id(key))return {ok:false,reason:'invalid_key'};
  if(!storage?.setItem)return {ok:false,reason:'storage_unavailable'};
  try {
    const tapes=readStore(storage).filter(t=>t.meta.key!==key);
    storage.setItem(RACING_GHOST_STORAGE_KEY,JSON.stringify({version:VERSION,tapes}));
    storageRevision++;return {ok:true,reason:'cleared'};
  }catch{return {ok:false,reason:'storage_failed'};}
}
export function clearRacingGhost(storage,params,state,player) {
  const meta=metadata(params,state,player);
  if(!meta)return {ok:false,reason:'incompatible'};
  return clearRacingGhostByKey(storage,meta.key);
}
export function rememberRacingGhost(storage,tape) {
  if(!validateRacingGhost(tape))return {ok:false,reason:'invalid_tape'};
  if(!storage?.setItem)return {ok:false,reason:'storage_unavailable'};
  const tapes=readStore(storage),previous=tapes.find(t=>matches(t.meta,tape.meta));
  if(previous&&previous.duration<=tape.duration)return {ok:false,reason:'slower',tape:previous};
  const kept=tapes.filter(t=>t.meta.key!==tape.meta.key);kept.push(tape);
  while(kept.length>RACING_GHOST_LIMITS.tapes)kept.shift();
  let text=JSON.stringify({version:VERSION,tapes:kept});
  while(text.length>RACING_GHOST_LIMITS.bytes&&kept.length>1){kept.shift();text=JSON.stringify({version:VERSION,tapes:kept});}
  if(text.length>RACING_GHOST_LIMITS.bytes)return {ok:false,reason:'too_large'};
  try{storage.setItem(RACING_GHOST_STORAGE_KEY,text);storageRevision++;return {ok:true,reason:'saved',tape};}
  catch{return {ok:false,reason:'storage_failed'};}
}

function session(state,params,storage) {
  if(!state||!params)return null;
  let current=sessions.get(state);
  if(!current||current.params!==params){
    current={params,storage,revision:storageRevision,tape:readRacingGhost(storage,params,state),record:null,ended:false};
    sessions.set(state,current);
  }else if(current.storage!==storage||current.revision!==storageRevision){
    current.storage=storage;current.revision=storageRevision;current.tape=readRacingGhost(storage,params,state);
  }
  return current;
}
export function getRacingGhostPlayback(state,params,storage=defaultStorage()) {
  if(params?.raceFitChanged||params?.resetCount>0)return null;
  return session(state,params,storage)?.tape||null;
}
export function resetRacingGhostSession(state) { if(state)sessions.delete(state); }
export function invalidateRacingGhost(state,reason='invalidated') {
  const current=sessions.get(state);
  if(current){current.ended=true;if(current.record)current.record.invalid=reason;current.record=null;}
}
function reject(current,reason) { current.ended=true;current.record=null;return {ok:false,reason}; }
function sample(player,time,origin) {
  const pos=player?.pos;
  if(!pos||![pos.x,pos.z,player.rot].every(finite)||!within(pos.y??0,-10000,10000))return null;
  return [round(time),round(pos.x-origin[0]),round(pos.z-origin[1]),angle(round(angle(player.rot))),round(pos.y||0)];
}
function lerpSample(a,b,t,out=[]) {
  const f=b[0]>a[0]?Math.max(0,Math.min(1,(t-a[0])/(b[0]-a[0]))):0;
  out[0]=round(t);out[1]=round(a[1]+(b[1]-a[1])*f);out[2]=round(a[2]+(b[2]-a[2])*f);
  out[3]=angle(round(angle(a[3]+angle(b[3]-a[3])*f)));out[4]=round(a[4]+(b[4]-a[4])*f);return out;
}

/** Call once per simulation step, after gate scoring; finish after raceClean is resolved. */
export function observeRacingGhost(params,player,state,{events=[],finish=false,storage=defaultStorage()}={}) {
  const current=session(state,params,storage);
  if(!current||current.ended)return {ok:false,reason:'inactive'};
  if(params.adventureSpeedId)return reject(current,'not_circuit');
  if(params.resetCount>0||params.raceFitChanged||params.raceInvalidated
      ||player?.alive===false)return reject(current,'unclean');
  if(!finite(params.raceStartSimS))return {ok:false,reason:'grid'};
  const time=state.simTime-params.raceStartSimS;
  if(!within(time,0,RACING_GHOST_LIMITS.seconds))return reject(current,'duration');
  let record=current.record;
  if(!record){
    if(time>RACING_GHOST_LIMITS.interval+EPS)return reject(current,'partial_start');
    const meta=metadata(params,state,player);
    if(!meta||(params.raceCategory&&params.raceCategory!==meta.category))return reject(current,'incompatible');
    const origin=[player?.pos?.x,player?.pos?.z],first=sample(player,time,origin);
    if(!first||!origin.every(finite))return reject(current,'invalid_pose');
    record=current.record={meta,origin,samples:[first],gates:[],last:first};
  }
  const next=sample(player,time,record.origin),last=record.last;
  if(!next||next[0]<last[0])return reject(current,'invalid_sequence');
  const dt=next[0]-last[0],distance=Math.hypot(next[1]-last[1],next[2]-last[2]);
  const speed=Math.hypot(player?.vel?.x||0,player?.vel?.z||0);
  if(dt>RACING_GHOST_LIMITS.maxGap+EPS||(dt===0&&distance>EPS)
      ||distance>10+dt*Math.max(1200,speed*4+500))return reject(current,'discontinuity');
  if(next[0]-record.samples.at(-1)[0]>=RACING_GHOST_LIMITS.interval-EPS){
    if(racingLoadoutCategory(state,player)!==record.meta.category)return reject(current,'fit_changed');
    record.samples.push(next);
  }
  if(!Array.isArray(events)||events.length>128)return reject(current,'invalid_gates');
  for(const event of events){
    const expected=expectedGate(record.meta,record.gates.length),previous=record.gates.at(-1)?.[2]??-1;
    if(event?.lap!==expected.lap||event?.gateIndex!==expected.gate||!within(event.elapsedS,0,time+EPS)
        ||event.elapsedS<=previous||record.gates.length>=RACING_GHOST_LIMITS.gates)return reject(current,'invalid_gates');
    record.gates.push([event.lap,event.gateIndex,round(event.elapsedS)]);
  }
  record.last=next;
  if(record.samples.length>RACING_GHOST_LIMITS.samples)return reject(current,'too_large');
  if(!finish)return {ok:true,reason:'recording'};
  if(params.raceClean!==true||racingLoadoutCategory(state,player)!==record.meta.category
      ||!events.at(-1)?.finished)return reject(current,'unclean');
  const duration=record.gates.at(-1)?.[2];
  if(!finite(duration)||duration<last[0])return reject(current,'invalid_finish');
  while(record.samples.length&&record.samples.at(-1)[0]>=duration)record.samples.pop();
  record.samples.push(lerpSample(last,next,duration));
  const tape={version:VERSION,meta:record.meta,duration,origin:record.origin,samples:record.samples,gates:record.gates};
  current.ended=true;current.record=null;
  return rememberRacingGhost(storage,tape);
}

/** Allocates nothing with `out`; positions returned remain galactic-global. */
export function sampleRacingGhost(tape,elapsed,out={}) {
  if(!tape?.samples?.length||!finite(elapsed)||elapsed<0||elapsed>tape.duration)return null;
  const rows=tape.samples;let lo=0,hi=rows.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(rows[mid][0]<=elapsed)lo=mid;else hi=mid;}
  const a=rows[lo],b=rows[hi],f=b[0]>a[0]?Math.max(0,Math.min(1,(elapsed-a[0])/(b[0]-a[0]))):0;
  out.x=tape.origin[0]+a[1]+(b[1]-a[1])*f;out.z=tape.origin[1]+a[2]+(b[2]-a[2])*f;
  out.heading=angle(a[3]+angle(b[3]-a[3])*f);out.y=a[4]+(b[4]-a[4])*f;return out;
}
export function raceGhostSplitDelta(tape,event) {
  if(!tape||!finite(event?.elapsedS))return null;
  const gate=tape.gates.find(g=>g[0]===event.lap&&g[1]===event.gateIndex);
  return gate?event.elapsedS-gate[2]:null;
}
