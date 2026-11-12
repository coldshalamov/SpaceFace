import {authoredFurnaceWorksite,furnaceReceiptMatches,furnaceMouthGlobal} from './furnaceWorksite.js';
import {FURNACE_INTAKE} from '../data/furnace.js';
import {spawnPayloadEntity} from '../combat/industrialBeam.js';
const KEY='furnace_casing_return';
const materialId='cr_feed:cooled_casing:v1';
export function casingReceiptCandidate(state,e){
 if(state.story?.flags?.[KEY])return null;
 const m=state.missions?.active?.find(m=>m.id===e.data?.furnaceMissionId&&authoredFurnaceWorksite(m));
 if(!m||m.params.furnaceLedgerInvalid||!furnaceReceiptMatches(m,{entityId:e.id,missionId:m.id,lotSlot:e.data.furnaceLotSlot,sectorId:FURNACE_INTAKE.sectorId},e))return null;
 const lots=m.params.furnaceLots;if(lots.length!==3||lots.filter(l=>l.received&&!l.lost).length!==2||lots.some(l=>l.lost))return null;
 return m;
}
export function commitCasingReceipt(state,m){
 const flags=state.story?.flags;if(!flags||flags[KEY]||!m||!Array.isArray(m.params?.furnaceLots)||m.params.furnaceLots.length!==3||!m.params.furnaceLots.every(l=>l.received&&!l.lost))return;
 flags[KEY]={version:1,state:'pending',missionId:m.id};
}
function pocket(state){
 const mouth=furnaceMouthGlobal();
 for(const dx of [-300,-380,-460])for(const dz of [-100,100,-220,220]){
  const pos={x:mouth.x+dx,z:mouth.z+dz};
  if((state.entityList||[]).some(e=>e?.alive&&e.physicsBody!==false&&e.collides!==false&&Number.isFinite(e.pos?.x)&&Number.isFinite(e.pos?.z)&&Math.hypot(pos.x-e.pos.x,pos.z-e.pos.z)<Math.max(0,Number(e.radius)||0)+100))continue;
  if((state.world?.dressing?.rows||[]).some(e=>e?.alive!==false&&e.collides!==false&&Number.isFinite(e.pos?.x)&&Number.isFinite(e.pos?.z)&&Math.hypot(pos.x-e.pos.x,pos.z-e.pos.z)<Math.max(0,Number(e.radius)||0)+100))continue;
  return pos;
 }
 return null;
}
export function issueFurnaceCasing(owner){
 const s=owner.state,record=s.story?.flags?.[KEY];
 // A saved in-flight reservation fails closed: its spawn callback may already have collected the shell.
 if(record?.version===1&&record.state==='issuing'){record.state='issued';return;}
 if(owner._restoring||s.mode!=='flight'||s.world?.currentSectorId!==FURNACE_INTAKE.sectorId||s.run?.kind==='survival'||record?.version!==1||record.state!=='pending'||typeof record.missionId!=='string')return;
 const existing=(s.entityList||[]).find(e=>e?.alive&&e.type==='payload'&&e.data?.furnaceCasingReturnId===materialId&&e.data?.furnaceCasingMissionId===record.missionId);
 if(existing){record.state='issued';return;}
 const pos=pocket(s);if(!pos)return;
 record.state='issuing';
 let body;try{body=spawnPayloadEntity(s,{pos,vel:{x:0,z:0},radius:8,mass:20,physicsBody:{shape:'ball',radius:8,mass:20,dynamic:true,ccd:true},payloadType:'cut_panel',salvagePool:{cmdty_scrap_metal:2},ownerId:s.playerId,factionId:'player',homeSectorId:FURNACE_INTAKE.sectorId,transientSector:false},{spawnEntity:spec=>owner.helpers?.spawnEntity?.({...spec,flags:{persistent:true},data:{...spec.data,furnaceCasingReturnId:materialId,furnaceCasingMissionId:record.missionId,scanLabel:'CR-FEED · cooled empty casing · 2 scrap units · recover or leave',name:'Cooled empty casing'}})});}catch{record.state='issued';record.spawnFault=true;return;}
 if(!body){record.state='pending';return;}
 record.state='issued';record.issuedAt=Number.isFinite(s.simTime)?s.simTime:0;
 owner.bus?.emit('comms:popup',{id:'furnace_casing_return',sender:'CR-FEED',category:'story',ttl:10,persist:true,text:'Three quarantine loads burned. The quench tray has kicked one empty casing out west, clear of the mouth. Two units of scrap if you want it. The ore is gone; this is only the shell.'});
}
