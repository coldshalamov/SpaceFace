// CR-FEED's optional release shoulder. Mission and intake owners still settle every lot.
import { authoredFurnaceWorksite, furnaceMouthGlobal, furnaceReceiptMatches } from './furnaceWorksite.js';
import { FURNACE_INTAKE } from '../data/furnace.js';
export function furnaceReceivingJob(state) {
 return state.missions?.active?.find(m=>authoredFurnaceWorksite(m)&&!m.params.furnaceLedgerInvalid
  &&Number.isFinite(m.objectiveTarget)&&m.objectiveTarget>0&&m.objectiveProgress>=m.objectiveTarget
  &&Array.isArray(m.params.furnaceLots)&&m.params.furnaceLots.some(l=>!l.received&&!l.lost))||null;
}
export function furnaceShoulderSpec(m) {
 const mouth=furnaceMouthGlobal();
 return {type:'beacon',pos:{x:mouth.x+180,z:mouth.z},vel:{x:0,z:0},radius:8,mass:1,hull:1,hullMax:1,
  collides:false,physicsBody:false,homeSectorId:FURNACE_INTAKE.sectorId,
  data:{furnaceReceivingShoulder:true,missionId:m.id,parentType:'story_prop',circuitMark:true,ringRadius:35,visualRadius:35,
   scannerSignalKind:'salvage',scanLabel:'CR-FEED RELEASE · aim the marked pod at the intake',tetherable:false,masslineTetherable:false}};
}
export function syncFurnaceReceivingLane(owner) {
 const state=owner.state,m=furnaceReceivingJob(state),rows=(state.entityList||[]).filter(e=>e?.alive&&e.data?.furnaceReceivingShoulder);
 let guide=null;
 for(const e of rows){if(m&&e.data.missionId===m.id&&!guide)guide=e;else owner.helpers?.removeEntity?.(e.id);}
 if(!m)return;
 if(!guide)guide=owner.helpers?.spawnEntity?.(furnaceShoulderSpec(m));
 const player=state.entities?.get(state.playerId),flags=state.story?.flags;
 if(!guide||!flags||flags.furnace_receiving_brief===m.id||state.mode!=='flight'||state.ui?.docked||!player?.alive)return;
 if(!Number.isFinite(player.pos?.x)||!Number.isFinite(player.pos?.z)||Math.hypot(player.pos.x-guide.pos.x,player.pos.z-guide.pos.z)>500)return;
 flags.furnace_receiving_brief=m.id;
 owner.bus?.emit('comms:popup',{id:'furnace_receiving_brief',sender:'CR-FEED',category:'story',ttl:10,persist:true,
  text:'Mites cleared. Marked quarantine lots, not ordinary rock. The small release ring is outside the mouth: bring one load up, aim it at the intake, and let it cross the lip. Tow or fling; we count the pod, not your hull. Keep the other lots out of your swing.'});
}
export function furnaceLotCallout(state,e) {
 const m=state.missions?.active?.find(m=>authoredFurnaceWorksite(m)&&m.id===e.data?.furnaceMissionId);
 const lots=m?.params?.furnaceLots,slot=e.data?.furnaceLotSlot,row=lots?.find(l=>l.slot===slot);
 if(!row||m.params.furnaceLedgerInvalid||!furnaceReceiptMatches(m,{entityId:e.id,missionId:m.id,lotSlot:slot,sectorId:FURNACE_INTAKE.sectorId},e))return null;
 const received=lots.filter(l=>l.received).length+1,lost=lots.filter(l=>l.lost&&!l.received).length;
 const remaining=lots.filter(l=>l!==row&&!l.received&&!l.lost).length;
 return `CR-FEED: Quarantine lot ${slot+1} received. ${received}/3 through the mouth${lost?`; ${lost} lost outside it`:''}. ${received===3?'All three accounted for at intake.':remaining?'Keep the next marked lot clear until your line is ready.':'No marked lots remain outside; lost lots did not reach intake.'}`;
}
