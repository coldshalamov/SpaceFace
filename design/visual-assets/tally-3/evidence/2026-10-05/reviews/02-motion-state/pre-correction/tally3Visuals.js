import { tally3StateForEntity } from '../systems/tally3.js';
// Presentation only: sim supplies the phase, exact accepted receipt and current body lifetime.
import { TALLY3 } from '../data/tally3.js';
import { isTally3Actor, TALLY3_PLACE_FILE, TALLY3_PLACE_ID, TALLY3_ASSET_ID,
  TALLY3_RADIUS, tally3PlaceTransform, tally3BodySpec } from '../data/tally3Body.js';
export {isTally3Actor,TALLY3_PLACE_FILE,tally3PlaceTransform};
export function tally3CatalogRow(isPublished) {
  return {id:TALLY3_PLACE_ID,assetId:TALLY3_ASSET_ID,family:'tally-3',file:TALLY3_PLACE_FILE,
    fit:'authored-origin',placeScale:1,entityRadius:TALLY3_RADIUS,colliderKind:'compound',
    colliderId:tally3BodySpec().collisionProxyManifest.id,solid:true,
    packagedLive:isPublished(TALLY3_PLACE_FILE),referenceState:'folded'};
}
export function createTally3MotionDriver(root,entity,controllers) {
  if(!isTally3Actor(entity))return null;
  const source=root?.userData?.tally3AuthoredSource;
  if(source?.assetId!==TALLY3_ASSET_ID || String(source.file||'').replace(/^.*assets\/ships\/(?:release\/)?parts\//,'')!==TALLY3_PLACE_FILE)return null;
  const live=(controllers||[]).filter(c=>c.rigId==='tally_3_claim_assessor');
  if(!live.length)return null;
  const owner=entity,life=entity.occupantGeneration;
  let signature=null,generation=0,retired=false;
  return {update(current,simNow,a11y,state){
    if(retired)return;
    state=state||tally3StateForEntity(current);
    const pose=current?.data?.tally3Presentation;
    const valid=!!state&&current===owner&&current.occupantGeneration===life&&current.alive!==false&&current.hull>0
      &&isTally3Actor(current)&&(!state?.entities||state.entities.get(current.id)===current);
    const receipt=state?.economy?.tally3Settlement?.receipt;
    let phase=valid?pose?.phase:'patrol';
    if(phase==='receipt'&&(!receipt||receipt.receiptId!==pose.receiptId
      ||state?.salvage?.tally3?.source?.disposition!=='returned'))phase='patrol';
    const rawNow=Number(state?.simTime??simNow)||0;
    const elapsed=Math.max(0,rawNow-(Number(pose?.startedAt)||rawNow));
    const clip=phase==='assess'?'assess':phase==='disputed'?'disputed':phase==='receipt'?'receipt'
      :phase==='withdraw'?'withdraw':['offer','wait_delivery'].includes(phase)?'assess':'rest';
    const key=`${valid}:${pose?.serial}:${phase}:${pose?.targetId}:${pose?.receiptId}`;
    if(key===signature)return;signature=key;
    const start=clip==='assess'&&phase!=='assess'?simNow-1.4:simNow-elapsed;
    for(const c of live)c.setState({state:clip,startTimeS:start,generation:++generation,noBridge:true});
  },dispose(){if(retired)return;retired=true;for(const c of live)c.setState({state:'rest',generation:++generation});}};
}
