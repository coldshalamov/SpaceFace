import { ALIEN_SITES } from './alienEcology.js';

// Retained Understory signal at an existing Charon host; never a new revelation axis.
export const BORROWED_VOICE = Object.freeze({
  id: 'charon:borrowed-voice', owner: 'borrowedVoice', siteId: 'warm_freighter',
  sectorId: ALIEN_SITES.warm_freighter.sectorId,
  center: Object.freeze({ x: ALIEN_SITES.warm_freighter.center.x + 125, z: ALIEN_SITES.warm_freighter.center.z + 95 }),
  receiver: Object.freeze({ x: 0, z: 0 }), revelation: 2, sampleSeconds: .2,
  scanRange: 110, siteRange: 180, clearThreshold: .65, lostThreshold: .5, clearSeconds: 1.2,
  archiveCr: 600,
});
export const BORROWED_VOICE_RECORDERS = Object.freeze([
  Object.freeze({ id:'a', evidenceId:'borrowed-voice:fragment-a', name:'Receiver Two · broken dish',
    text:'—third shift. Receiver two is answering before we call—', offset:Object.freeze({x:-23,z:-9}), rot:1.6 }),
  Object.freeze({ id:'b', evidenceId:'borrowed-voice:fragment-b', name:'Shift register · fork antenna',
    text:'—not a second crew. Same words. Wrong order—', offset:Object.freeze({x:14,z:20}), rot:-.4 }),
  Object.freeze({ id:'c', evidenceId:'borrowed-voice:fragment-c', name:'Maintenance recorder · missing mast',
    text:'—leave the recorder attached. We need to know what it remembers—', offset:Object.freeze({x:6,z:-25}), rot:2.5 }),
]);
const ids=new Set(BORROWED_VOICE_RECORDERS.map(r=>r.evidenceId));
const outcomes=new Set(['unseen','live','shelved','destroyed','lost']);
export function borrowedVoiceGate(state) { return Number(state?.world?.alienEcology?.revelation)>=BORROWED_VOICE.revelation; }
export function borrowedVoiceIdentity(id){return `${BORROWED_VOICE.id}:${id}`;}
export function freshBorrowedVoice(){return {schema:1,id:BORROWED_VOICE.id,located:false,ringOutcome:'unseen',recoveredFragmentIds:[],
  disposition:'open',evidenceRevision:0,archiveReceipt:null,
  recorderOutcomeIds:Object.fromEntries(BORROWED_VOICE_RECORDERS.map(r=>[r.id,{status:'unseen',pose:null}])),
};}
export function normalizeBorrowedVoice(raw){const row=freshBorrowedVoice();if(raw?.schema!==1||raw.id!==row.id)return row;
  row.located=raw.located===true;
  row.ringOutcome=outcomes.has(raw.ringOutcome)?raw.ringOutcome:'unseen';
  row.recoveredFragmentIds=[...new Set((Array.isArray(raw.recoveredFragmentIds)?raw.recoveredFragmentIds:[]).filter(id=>ids.has(id)))];
  row.disposition=['open','archive','quarantine','leave'].includes(raw.disposition)?raw.disposition:'open';
  row.evidenceRevision=Math.max(row.recoveredFragmentIds.length,Math.min(12,Math.max(0,Math.trunc(Number(raw.evidenceRevision)||0))));
  for(const r of BORROWED_VOICE_RECORDERS){const p=raw.recorderOutcomeIds?.[r.id],out=row.recorderOutcomeIds[r.id];
    out.status=outcomes.has(p?.status)?p.status:'unseen';
    if(['x','z','vx','vz','rot','spin'].every(k=>Number.isFinite(p?.pose?.[k])&&Math.abs(p.pose[k])<1e7))out.pose={...p.pose};
  }
  const receipt=raw.archiveReceipt;
  if(row.disposition==='archive'&&row.recoveredFragmentIds.length&&receipt?.id===`${row.id}:archive`
    &&receipt.amount===BORROWED_VOICE.archiveCr&&Number.isFinite(receipt.at)&&receipt.at>=0)
    row.archiveReceipt={id:receipt.id,amount:receipt.amount,at:receipt.at};
  return row;
}
// Cosmetic transforms are deliberately absent. Three bounded segment queries supply clear.
export function borrowedSignalQuality(entity,receiver,clear){if(!clear||!entity?.pos||!receiver)return 0;
  const dx=receiver.x-entity.pos.x,dz=receiver.z-entity.pos.z,d=Math.hypot(dx,dz);
  if(!Number.isFinite(d)||!Number.isFinite(entity.rot))return 0;
  const alignment=d<.001?1:(Math.cos(entity.rot)*dx+Math.sin(entity.rot)*dz)/d;
  const distance=Math.max(0,1-d/80),angle=Math.max(0,Math.min(1,(alignment+.2)/1.2));
  return Math.max(0,Math.min(1,distance*angle));
}
export function borrowedVoiceJournalPlate(state){const row=normalizeBorrowedVoice(state?.borrowedVoice);
  if(!borrowedVoiceGate(state)||!row.located||!row.recoveredFragmentIds.length)return null;
  const body=BORROWED_VOICE_RECORDERS.map(r=>row.recoveredFragmentIds.includes(r.evidenceId)
    ?`${r.name}: ${r.text}`:`${r.name}: UNKNOWN${['destroyed','lost'].includes(row.recorderOutcomeIds[r.id].status)?' — original source lost':''}`).join('\n');
  return {id:row.id,sectorId:BORROWED_VOICE.sectorId,poiId:null,title:'Borrowed Voice — retained signal',
    meta:`${row.recoveredFragmentIds.length}/3 PHYSICAL SOURCES · ${row.disposition.toUpperCase()}`,
    body:`${body}\nRecovered record. Source continuity remains unconfirmed.`,
    note:row.disposition==='quarantine'?'Signal isolated. The missing segment is still missing.'
      :'Hypotheses: retained maintenance memory, or a damaged repeating circuit. The record cannot establish a second crew.',
    completedAt:row.archiveReceipt?.at||0};
}
