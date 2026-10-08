import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const ILEX_ARK = Object.freeze({ id:'ilex:seed-ark:v1', actorId:'ilex:seed-ark:carrier',
  originSectorId:'sector_tethys_junction', destinationSectorId:'sector_ceres_belt', stationId:'station_ceres',
  persistenceOwner:'ilexArk', deadlineS:3000, offerRange:360, receiverSpeed:8,
  baseRewardCr:1200, vaultRewardCr:300, harvestDelayS:120, provisionsPerVault:12 });
export const ILEX_VAULT_IDS = Object.freeze(['vault_1','vault_2','vault_3','vault_4','vault_5','vault_6']);
export const ILEX_START = Object.freeze(sectorLocalToGlobalForSector({x:690,z:760},ILEX_ARK.originSectorId));
export const ILEX_RECEIVER = Object.freeze(sectorLocalToGlobalForSector({x:-1100,z:620},ILEX_ARK.destinationSectorId));
// An open corridor above the busy hubs: both sides of the incident remain flyable.
export const ILEX_ROUTE = Object.freeze([
  Object.freeze(sectorLocalToGlobalForSector({x:-2450,z:1150},ILEX_ARK.originSectorId)),
  Object.freeze({x:1800,z:9342}), Object.freeze({x:-5000,z:9342}),
  Object.freeze(sectorLocalToGlobalForSector({x:3444,z:780},ILEX_ARK.destinationSectorId)),
  Object.freeze({x:ILEX_RECEIVER.x+210,z:ILEX_RECEIVER.z+170}),
]);
const terminal = new Set(['delivered','destroyed','lost']);
export function ilexVaultIds(ids){return ILEX_VAULT_IDS.filter(id=>Array.isArray(ids)&&ids.includes(id));}
export function freshIlexArk(){return {schema:1,id:ILEX_ARK.id,eligible:false,phase:'waiting',
  acceptedAt:null,deadline:null,routeIndex:0,incident:false,carrierStatus:'live',carrierPose:null,carrierHull:460,
  revision:0,settlement:null,vaults:Object.fromEntries(ILEX_VAULT_IDS.map(id=>[id,{status:'attached',hull:85,collar:28,pose:null}]))};}
function boundedPose(p){return p&&['x','z','vx','vz','rot','spin'].every(k=>Number.isFinite(p[k]))
  && Math.abs(p.x)<1e7&&Math.abs(p.z)<1e7&&Math.hypot(p.vx,p.vz)<1e5 ? {...p}:null;}
export function normalizeIlexArk(raw){
  const row=freshIlexArk();if(raw?.schema!==1||raw.id!==row.id)return row;
  row.eligible=raw.eligible===true;row.phase=['waiting','active','settled'].includes(raw.phase)?raw.phase:'waiting';
  row.acceptedAt=Number.isFinite(raw.acceptedAt)&&raw.acceptedAt>=0?raw.acceptedAt:null;
  row.deadline=row.acceptedAt==null?null:row.acceptedAt+ILEX_ARK.deadlineS;
  row.routeIndex=Math.max(0,Math.min(ILEX_ROUTE.length,Math.trunc(raw.routeIndex)||0));row.incident=raw.incident===true;
  row.carrierStatus=['live','lost','received'].includes(raw.carrierStatus)?raw.carrierStatus:'live';
  row.carrierPose=boundedPose(raw.carrierPose);row.carrierHull=Math.max(0,Math.min(460,Number(raw.carrierHull)||0));
  row.revision=Math.max(0,Math.min(100,Math.trunc(raw.revision)||0));
  for(const id of ILEX_VAULT_IDS){const v=raw.vaults?.[id];if(!v)continue;
    const status=['attached','releasing','drifting',...terminal].includes(v.status)?v.status:'lost';
    row.vaults[id]={status,hull:Math.max(0,Math.min(85,Number(v.hull)||0)),
      collar:Math.max(0,Math.min(28,Number(v.collar)||0)),pose:boundedPose(v.pose)};
    if(!terminal.has(status)&&status!=='attached'&&!row.vaults[id].pose)row.vaults[id].status='lost';
  }
  if(row.phase==='settled'){
    const ids=ILEX_VAULT_IDS.filter(id=>row.vaults[id].status==='delivered');
    const r=raw.settlement;
    if(validIlexOutcome(r)&&JSON.stringify(ids)===JSON.stringify(r.deliveredVaultIds))row.settlement={...r,deliveredVaultIds:[...ids]};
    else row.phase='active';
  }
  return row;
}
export function validIlexOutcome(r){return !!r&&r.id===`${ILEX_ARK.id}:outcome`&&r.stationId===ILEX_ARK.stationId
  &&Array.isArray(r.deliveredVaultIds)&&JSON.stringify(ilexVaultIds(r.deliveredVaultIds))===JSON.stringify(r.deliveredVaultIds)
  &&Number.isFinite(r.at)&&r.at>=0&&r.harvestAt===r.at+ILEX_ARK.harvestDelayS
  &&r.rewardCr===(r.deliveredVaultIds.length?ILEX_ARK.baseRewardCr+r.deliveredVaultIds.length*ILEX_ARK.vaultRewardCr:0);}
export function ilexOutcomeText(ids,carrierAlive=true){
  const n=ilexVaultIds(ids).length;
  return n===6?'Six vaults accepted. All six seed lines survive; the Ceres greenhouse can establish the complete planting.'
    :n===0?'No vault reached the greenhouse. The planting cannot begin. Ilex asks for the incident record, not a claim of successful delivery.'
    :`${n}/6 vault${n===1?'':'s'} accepted. ${6-n} seed line${6-n===1?' is':'s are'} missing; Ceres plants only the surviving lines.${carrierAlive?'':' The carrier was lost; its recovered vaults still count.'}`;
}
export function ilexReleasePose(entity,socket,nativeBody=null){
  const c=Math.cos(entity.rot||0),s=Math.sin(entity.rot||0),dx=socket.x*c-socket.z*s,dz=socket.x*s+socket.z*c;
  const x=entity.pos.x+dx,z=entity.pos.z+dz,spin=entity.angVel||0;
  const measured=nativeBody?.velocityAtPoint?.({x,y:0,z});
  return {x,z,vx:measured?.x??entity.vel.x-spin*dz,vz:measured?.z??entity.vel.z+spin*dx,rot:entity.rot||0,spin};
}
