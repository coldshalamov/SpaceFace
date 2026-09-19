/** Bounded observations of REAL owner transactions. Cash flow is NOT profit or invented income.
 * 48 fifteen-minute bins cover twelve hours. Quiet intervals remain zero, never interpolated.
 */
const BIN_S=900,COUNT=48;
const FIELDS=['cashInCr','cashOutCr','buyCr','saleCr','offers','accepts','resourceWorkS','publishedUnits','depletedRequests'];
const empty=(index)=>Object.fromEntries([['index',index],...FIELDS.map(k=>[k,0])]);
export function createEconomyPulse(now=0) {
 return {version:1,observedFromS:Math.max(0,Number.isFinite(now)?now:0),lastCashInAt:null,bins:[]};
}
export function recordEconomyPulse(economy,now,fields) {
 if(!economy || !Number.isFinite(now) || now<0)return;
 const p=economy.pulse ||= createEconomyPulse(now),index=Math.floor(now/BIN_S);
 p.bins=p.bins.filter(b=>b.index>index-COUNT&&b.index<=index);
 let b=p.bins.find(b=>b.index===index);if(!b){b=empty(index);p.bins.push(b);}
 for(const key of FIELDS)if(Number.isFinite(fields[key])&&fields[key]>=0)b[key]+=fields[key];
 if(fields.cashInCr>0)p.lastCashInAt=now;
}
export function recordEconomyCash(economy,now,delta,reason='') {
 if(!Number.isFinite(delta)||delta===0)return;
 recordEconomyPulse(economy,now,{cashInCr:Math.max(0,delta),cashOutCr:Math.max(0,-delta),
  buyCr:String(reason).startsWith('trade:buy:')?Math.max(0,-delta):0,
  saleCr:String(reason).startsWith('trade:sell:')?Math.max(0,delta):0});
}
export function restoreEconomyPulse(raw,now=0) {
 const p=createEconomyPulse(now);
 if(!raw || raw.version!==1)return p;
 p.observedFromS=Number.isFinite(raw.observedFromS)?Math.max(0,Math.min(now,raw.observedFromS)):now;
 p.lastCashInAt=Number.isFinite(raw.lastCashInAt)&&raw.lastCashInAt>=0&&raw.lastCashInAt<=now?raw.lastCashInAt:null;
 const current=Math.floor(now/BIN_S),seen=new Set();
 for(const src of (Array.isArray(raw.bins)?raw.bins:[]).slice(-COUNT)) {
  if(!Number.isSafeInteger(src?.index)||src.index<=current-COUNT||src.index>current||seen.has(src.index))continue;
  const b=empty(src.index);for(const k of FIELDS)b[k]=Number.isFinite(src[k])?Math.max(0,src[k]):0;
  p.bins.push(b);seen.add(src.index);
 }
 return p;
}
export function economyPulseReport(economy,now=0) {
 const p=restoreEconomyPulse(economy?.pulse,now),last=Math.floor(now/BIN_S);
 const first=Math.max(last-COUNT+1,Math.floor(p.observedFromS/BIN_S));
 const rows=[];
 for(let index=first;index<=last;index++) {
  const b=p.bins.find(b=>b.index===index)||empty(index);
  const start=Math.max(index*BIN_S,p.observedFromS),end=Math.min((index+1)*BIN_S,now);
  rows.push({...b,startS:start,endS:end,complete:end-start===BIN_S,netCashFlowCr:b.cashInCr-b.cashOutCr});
 }
 return {scope:'Observed cash flow; sale proceeds include principal. Not a profit or gameplay-completion estimate.',
  observedFromS:p.observedFromS,throughS:now,binS:BIN_S,
  lastCashInAt:p.lastCashInAt,secondsSinceCashIn:p.lastCashInAt==null?null:now-p.lastCashInAt,rows};
}
