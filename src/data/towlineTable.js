export const TOWLINE_TABLE = Object.freeze({id:'ceres:towline-table:v1',sectorId:'sector_ceres_belt',stationId:'station_ceres',
  owner:'towlineTable',offerRange:420,witnessRange:600,receiverSpeed:8,cleanupDeadlineS:480,assistDeadlineS:210,assistRange:700});
export const TOWLINE_MEMBERS = Object.freeze([
  Object.freeze({id:'mara',name:'Mara',role:'clamp tug',assetId:'SF_SHIP_TOWLINE_MARA',mass:180,towMass:180,speed:6,cleanupMass:180}),
  Object.freeze({id:'odo',name:'Odo',role:'winch tug',assetId:'SF_SHIP_TOWLINE_ODO',mass:90,towMass:120,speed:8,cleanupMass:120}),
  Object.freeze({id:'kit',name:'Kit',role:'rescue skiff',assetId:'SF_SHIP_TOWLINE_KIT',mass:60,towMass:80,speed:5,cleanupMass:80}),
]);
export const towlineActorId=id=>`ceres:towline-table:${id}`;
export const towlineCleanupId=id=>`ceres:towline-table:cleanup:${id}`;
export const towlineReceiptId=id=>`${towlineCleanupId(id)}:witnessed-return`;
const sourceStates=new Set(['waiting','crew','player','cleared','destroyed','lost']);
const benefitStates=new Set(['earned','dispatching','active','paused','spent','void']);
const pose=p=>p&&['x','z','vx','vz','rot','spin'].every(k=>Number.isFinite(p[k]))&&Math.abs(p.x)<1e7&&Math.abs(p.z)<1e7
  &&Math.hypot(p.vx,p.vz)<1e5?{x:p.x,z:p.z,vx:p.vx,vz:p.vz,rot:p.rot,spin:p.spin}:null;
export function freshTowlineTable(){return {schema:1,id:TOWLINE_TABLE.id,eligible:false,revision:0,members:Object.fromEntries(TOWLINE_MEMBERS.map(m=>[m.id,
  {status:'live',betrayed:false,pose:null,hull:160,source:{status:'waiting',pose:null,hull:60,startedAt:null,receipt:null},benefit:null}]))};}
export function validTowlineReceipt(r,id){return !!r&&r.id===towlineReceiptId(id)&&r.sourceId===towlineCleanupId(id)
  &&r.memberId===id&&r.stationId===TOWLINE_TABLE.stationId&&r.by==='player'&&Number.isFinite(r.at)&&r.at>=0;}
function targetRecord(t){return t&&typeof t.worldRecordId==='string'&&t.worldRecordId.length<180
  &&typeof t.identityKey==='string'&&t.identityKey.length<200?{worldRecordId:t.worldRecordId,identityKey:t.identityKey,
    sourceKey:typeof t.sourceKey==='string'?t.sourceKey:null,persistenceOwner:typeof t.persistenceOwner==='string'?t.persistenceOwner:null}:null;}
export function normalizeTowlineTable(raw){const row=freshTowlineTable();if(raw?.schema!==1||raw.id!==row.id)return row;
  row.eligible=raw.eligible===true;row.revision=Math.max(0,Math.min(1e6,Math.trunc(raw.revision)||0));
  for(const m of TOWLINE_MEMBERS){const saved=raw.members?.[m.id],out=row.members[m.id];if(!saved)continue;
    out.status=saved.status==='lost'?'lost':'live';out.betrayed=saved.betrayed===true;out.pose=pose(saved.pose);
    out.hull=Math.max(0,Math.min(160,Number(saved.hull)||0));
    const s=saved.source||{};out.source={status:sourceStates.has(s.status)?s.status:'lost',pose:pose(s.pose),
      hull:Math.max(0,Math.min(60,Number(s.hull)||0)),startedAt:Number.isFinite(s.startedAt)&&s.startedAt>=0?s.startedAt:null,receipt:null};
    if(out.source.status==='cleared'&&validTowlineReceipt(s.receipt,m.id))out.source.receipt={...s.receipt};
    // Crew completion is a real cleared obstruction, but never a player favor. A malformed
    // receipt cannot turn an intact original or an NPC delivery into free service.
    if(s.receipt&&!out.source.receipt&&out.source.status==='cleared')out.source.status='lost';
    const b=saved.benefit,target=targetRecord(b?.target);
    if(out.source.receipt&&b&&b.receiptId===out.source.receipt.id&&benefitStates.has(b.status)){
      const at=Number.isFinite(b.acceptedAt)&&b.acceptedAt>=out.source.receipt.at?b.acceptedAt:null;
      out.benefit={receiptId:b.receiptId,status:b.status==='dispatching'?'paused':b.status,target,
        acceptedAt:at,deadline:at==null?null:at+TOWLINE_TABLE.assistDeadlineS,leaseId:typeof b.leaseId==='string'?b.leaseId:null};
      if(['active','paused'].includes(out.benefit.status)&&(!target||at==null))out.benefit.status='void';
      if(out.status==='lost'||out.betrayed)out.benefit.status='void';
    }
  }
  return row;
}
// A narrow admission for a finite, noncommodity cleanup original. This does not make
// arbitrary flags, scenery, cargo manifests or other missions eligible for NPC towing.
export function isTowlineCleanupTarget(state,target){
  if(!target||target.alive===false||target.type!=='payload'||target.physicsBody?.dynamic!==true)return false;
  const id=target.data?.towlineMemberId,m=TOWLINE_MEMBERS.find(m=>m.id===id),r=state.towlineTable?.members?.[id];
  return !!m&&state.towlineTable?.id===TOWLINE_TABLE.id&&r?.status==='live'&&!r.betrayed
    &&['waiting','crew'].includes(r.source.status)&&target.data.persistenceOwner===TOWLINE_TABLE.owner
    &&target.data.towlineBody==='cleanup'&&target.data.worldRecordId===towlineCleanupId(id)
    &&target.data.identityKey===towlineCleanupId(id)&&target.mass===m.cleanupMass
    &&state.entities?.get(target.id)===target&&!target.data.npcTowedByJobId;
}
