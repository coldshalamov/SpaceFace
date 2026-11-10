// Scale 4's small return visit: the measuring owner supplies the readings.
// This contact never weighs, transfers freight, pays, or advances a mission.
import { KESSLER_SCALE } from '../data/kessler.js';
const KEY = 'kessler_comparison_watch';
const sane = n => Number.isFinite(n) && n > 0;
const validSample = row => sane(row?.plate) && sane(row?.stamp) && row.plate < row.stamp && sane(row?.count);
function flags(state) { return state.story?.flags; }
function now(state) { return Number.isFinite(state.simTime) ? state.simTime : 0; }
function localPilot(state, pad) {
 const p = state.entities?.get(state.playerId);
 return state.mode === 'flight' && !state.ui?.docked && p?.alive && Number.isFinite(p.pos?.x) && Number.isFinite(p.pos?.z)
  && Math.hypot(p.pos.x-pad.x,p.pos.z-pad.z) <= 350;
}
function say(bus,id,sender,text,persist=false) {
 bus?.emit('comms:popup',{id,sender,category:'story',text,ttl:9,persist});
}
export function recordKesslerComparison(state, reading) {
 const f=flags(state);if(!f||!sane(reading.count)||!reading.variance||!sane(reading.trueRead)||!sane(reading.plateRead)||reading.plateRead>=reading.trueRead)return;
 let watch=f[KEY];
 const sample={plate:reading.plateRead,stamp:reading.trueRead,count:reading.count};
 if(!watch||watch.version!==1||!validSample(watch.first)){watch=f[KEY]={version:1,first:sample,firstAt:now(state),firstSpoken:false,second:null,secondSpoken:false};return;}
 // A reweighed equal load cannot establish the promised different-load comparison.
 // Owner count is monotonic; no entity-id lease or reference escapes into save data.
 if(watch.second||!validSample(watch.first)||sample.count<=watch.first.count||Math.round(sample.stamp*10)===Math.round(watch.first.stamp*10))return;
 watch.second=sample;watch.secondAt=now(state);
}
export function tickKesslerComparison(state,bus,pad) {
 const f=flags(state);if(!f||!localPilot(state,pad))return;
 const candidate=f[KEY],watch=candidate?.version===1&&validSample(candidate.first)?candidate:null,t=now(state);
 if(watch?.version===1&&validSample(watch.second)&&!watch.secondSpoken&&t-watch.secondAt>=4){
  watch.secondSpoken=true;watch.firstSpoken=true;
  const a=watch.first,b=watch.second;
  say(bus,'kessler_second_load','LOG',`Two different loads: ${a.stamp.toFixed(1)}t stamped, ${a.plate.toFixed(1)}t on the plate; then ${b.stamp.toFixed(1)}t stamped, ${b.plate.toFixed(1)}t on the plate. Both short. Keeping both slips. The freight still belongs to you.`,true);return;
 }
 if(watch?.version===1&&!watch.firstSpoken&&!watch.second&&t-watch.firstAt>=4){
  watch.firstSpoken=true;
  say(bus,'kessler_first_comparison','LOG','One short reading is not a pattern. Bring a load with a different stamped mass back to Scale 4 and I can keep the slips side by side. Same stamp, no new comparison. Use freight you already have.',true);return;
 }
 if(!f.kessler_comparison_arrival&&!watch){
  f.kessler_comparison_arrival=true;
  say(bus,'kessler_comparison_arrival',KESSLER_SCALE.sender,'Scale 4 is the open ring between the racks. Bring a jettisoned cargo pod inside ninety and settle it below eight. We read the load; we do not take it. Leave yourself room to catch it again.');
 }
}
