import { MODULES } from './modules.js';
import { WEAPONS } from './weapons.js';

export const SABLE_VENN=Object.freeze({sectorId:'sector_ceres_belt',stationId:'station_ceres',
  worldRecordId:'ceres:sable-venn:patchwork',shipId:'ship_hawser',callsign:'Patchwork'});
const CATALOG=new Set([...MODULES,...WEAPONS].map(m=>m.id));
export function freshSableVenn(){return {met:false,demonstratedItemIds:[],lastReceiptId:null,workshopLost:false};}
export function normalizeSableVenn(raw){return {met:raw?.met===true,workshopLost:raw?.workshopLost===true,
  demonstratedItemIds:[...new Set((Array.isArray(raw?.demonstratedItemIds)?raw.demonstratedItemIds:[]).filter(id=>CATALOG.has(id)))].slice(-32),
  lastReceiptId:typeof raw?.lastReceiptId==='string'?raw.lastReceiptId.slice(0,180):null};}
export function sableVennWorkshop(state){
  let body=null;for(const e of state?.entityList||[])if(e.alive!==false&&e.data?.worldRecordId===SABLE_VENN.worldRecordId){if(body)return null;body=e;}
  return body;
}
export function sableShipworksAvailable(state,stationId){
  if(stationId!==SABLE_VENN.stationId||state?.world?.currentSectorId!==SABLE_VENN.sectorId||state.sableVenn?.workshopLost)return false;
  const actor=sableVennWorkshop(state),budget=state.spawnBudget;
  if(!actor||state.entities?.get(actor.id)!==actor||actor.data.sectorId!==SABLE_VENN.sectorId
    ||budget?.entityOwners?.get(String(actor.id))!==SABLE_VENN.worldRecordId||budget.entityRefs?.get(String(actor.id))!==actor)return false;
  const station=state.entityList.find(e=>e.alive!==false&&e.type==='station'&&e.data?.stationId===stationId);
  return !!station&&Math.hypot(actor.pos.x-station.pos.x,actor.pos.z-station.pos.z)<=station.radius+250;
}
export function sableVennServiceAvailable(state){return state?.ui?.docked===true&&sableShipworksAvailable(state,state.ui.dockedStationId);}
// Presentation reads accepted owner facts only; an old entity or budget slot never
// becomes a receipt source after Continue or sector rematerialization.
export function sableVennPresentation(state,entity){
  if(!sableShipworksAvailable(state,SABLE_VENN.stationId)||sableVennWorkshop(state)!==entity)return null;
  const stamp=entity.data.sableVenn,memory=state.sableVenn;
  if(!stamp||!Number.isInteger(stamp.tick)||stamp.tick<0||stamp.tick>state.tick)return null;
  if(stamp.phase==='demonstrate'&&!memory?.demonstratedItemIds?.includes(stamp.moduleId))return null;
  if(stamp.phase==='receipt'&&(!stamp.receiptId||stamp.receiptId!==memory?.lastReceiptId))return null;
  if(!['available','demonstrate','receipt'].includes(stamp.phase))return null;
  return {phase:stamp.phase,tick:stamp.tick,moduleId:stamp.moduleId||null,receiptId:stamp.receiptId||null,entity,simTime:state.simTime};
}
