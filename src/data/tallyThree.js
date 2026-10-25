import {normalizeLineProgression,lineClassForIndex} from './lineProgression.js';
// SF20-03: one finite claim crate. Salvage owns this source; Tally only reads its facts.
import { CERES_SECOND_MEASURE_LOCAL_POS } from './sectorAnchors.js';
import { sectorLocalToGlobalForSector } from './sectorCoordinates.js';

export const TALLY_THREE = Object.freeze({
  sourceKey: 'salvage-point:ceres:tally-three:crate', salvagePointId: 'ceres:tally-three:crate',
  worldRecordId: 'ceres:tally-three:claim-crate', assessorId: 'ceres:tally-three:assessor',
  sectorId: 'sector_ceres_belt', zoneId: 'ceres:tally-three', homeStationId: 'station_ceres',
  claimId: 'station_ceres', ownerName: 'Ceres Refinery', manifestId: 'CERES-RECOVERY-03',
  pool: Object.freeze({cmdty_salvage_electronics: 4}), mass: 180, radius: 6,
  pos: Object.freeze(sectorLocalToGlobalForSector({x:CERES_SECOND_MEASURE_LOCAL_POS.x-980,
    z:CERES_SECOND_MEASURE_LOCAL_POS.z-680}, 'sector_ceres_belt')),
  assessRange: 420, receiverMargin: 24, maxDeliverySpeed: 8,
  // Hawser locomotion/stats drive the authored Tally assessor; its source hull owns geometry.
  assessorShipId: 'ship_hawser',
});

export function tallyThreeSource(state) { return state?.salvage?.sources?.[TALLY_THREE.sourceKey] || null; }
export function tallyThreeBody(state, worldRecordId) {
  const index=state?.entityIndex;
  if(index?.ready && index.byWorldRecordId instanceof Map && index.byWorldRecordIdCount instanceof Map){
    if(index.byWorldRecordIdCount.get(worldRecordId)!==1)return null;
    const e=index.byWorldRecordId.get(worldRecordId);return e?.alive!==false?e:null;
  }
  let found=null;
  for(const e of state?.entityList || [])if(e?.alive!==false&&e.data?.worldRecordId===worldRecordId){if(found)return null;found=e;}
  return found;
}
export function tallyThreeFingerprint(source) {
  return JSON.stringify([source?.sourceKey,source?.claimId,source?.disputedBy,
    Object.entries(source?.remainingPool || {}).sort(([a],[b])=>a.localeCompare(b)),source?.evidenceRevision||0]);
}
export function tallyThreeClaimStatus(source) {
  if(source?.disputedBy||source?.evidenceObserved&&source.claimId&&source.claimId!==TALLY_THREE.claimId)return 'DISPUTED';
  return source?.claimId?'OWNED':'UNCLAIMED';
}

/** Selected crate, assessor, or ordinary receiver. Never makes proximity a transfer. */
export function tallyThreeHail(state,target,player) {
  if(state?.world?.currentSectorId!==TALLY_THREE.sectorId||!target||!player)return null;
  const source=tallyThreeSource(state),crate=tallyThreeBody(state,TALLY_THREE.worldRecordId);
  const assessor=tallyThreeBody(state,TALLY_THREE.assessorId);
  const receiver=target.type==='station'&&target.data?.stationId===TALLY_THREE.homeStationId;
  if(target!==crate&&target!==assessor&&!receiver)return null;
  if(!source)return null;
  const distance=Math.hypot(player.pos.x-target.pos.x,player.pos.z-target.pos.z);
  if(distance>TALLY_THREE.assessRange)return null;
  return {enabled:true,reason:null,targetId:target.id,kind:'tally_three',entity:target,distance,
    label:receiver?'HAIL RECOVERY RECEIVER':'HAIL TALLY-3',ordinaryReceiver:receiver,assessorAvailable:!!assessor,
    source,crate};
}

/** Read-only hail snapshot of the original crate, never the selected assessor/station.
 * Unlike the progression owner's defensive 1T fallback, unknown physical mass is
 * not evidence for reassuring a pilot: guidance explicitly reports unavailable.
 */
export function tallyThreeTowAssessment(state) {
  const crate=tallyThreeBody(state,TALLY_THREE.worldRecordId);
  const physical=Number(crate?.physicsBody?.mass),fallback=Number(crate?.mass);
  const massT=Number.isFinite(physical)&&physical>0?physical:Number.isFinite(fallback)&&fallback>0?fallback:null;
  if(!crate||massT==null)return {available:false,text:'Tow assessment unavailable: original crate mass is not known.'};
  const progress=normalizeLineProgression(state?.lineProgression);
  const cls=lineClassForIndex(progress.classIndex),overClass=massT>cls.fullControlMassT;
  const amount=n=>Number(n.toFixed(2)).toString();
  // Preserve the strict over-class distinction when compact rounding would hide it.
  const massLabel=overClass&&Number(amount(massT))<=cls.fullControlMassT
    ?'>'+amount(cls.fullControlMassT):amount(massT);
  return {available:true,massT,classIndex:cls.index,fullControlMassT:cls.fullControlMassT,overClass,
    text:`${massLabel}T load · Class ${cls.label} controls ${amount(cls.fullControlMassT)}T. ${overClass
      ?'Temporary hold: heat can snap the line.'
      :'Keep custody; settle below 8 WU/s.'}`};
}
