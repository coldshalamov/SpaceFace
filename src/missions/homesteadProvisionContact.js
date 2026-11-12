import { FRONTIER_HOMESTEAD } from '../data/factions/free.js';
const pos = p => Number.isFinite(p?.x) && Number.isFinite(p?.z);
const tag = 'homesteadProvisionGuide';
export function tickHomesteadProvisionContact(owner) {
  const s=owner.state;if(!s)return;
  const a=s.frontier?.barnAttempt;
  const rec=s.frontier?.homesteads?.find(r=>r.entityId===a?.frameId && r.frontierMissionId===a.missionId
    && r.frontierSite===a.siteId && r.gone!==true && r.partial!==true);
  const e=rec && owner._steadEnt(s,rec);
  const valid=s.mode==='flight' && s.run?.kind!=='survival' && !s.physicsVenue?.active
    && a?.status==='completed' && rec?.sectorId===s.world?.currentSectorId && e && pos(e.pos)
    && e.data.frontierMissionId===a.missionId && e.data.frontierSite===a.siteId
    && e.occupantGeneration===a.frameGen && rec.gen===a.frameGen;
  let ring;
  for(const r of [...(s.entityList||[])]){
    if(!r?.alive||r.data?.[tag]!==true)continue;
    if(valid&&!ring&&r.data.frameId===e.id&&r.data.frameGen===rec.gen&&r.pos.x===e.pos.x&&r.pos.z===e.pos.z&&r.physicsBody===false)ring=r;
    else owner.helpers.removeEntity(r.id);
  }
  if(!valid)return;
  if(!ring)ring=owner.helpers.spawnEntity({type:'beacon',pos:{...e.pos},radius:1,mass:0,hull:1,hullMax:1,collides:false,physicsBody:false,homeSectorId:rec.sectorId,
    data:{[tag]:true,frameId:e.id,frameGen:rec.gen,parentType:'story_prop',circuitMark:true,ringRadius:FRONTIER_HOMESTEAD.supplyRadius,
      visualRadius:FRONTIER_HOMESTEAD.supplyRadius,tetherable:false,masslineTetherable:false,scannerSignalKind:'salvage'}});
  if(ring)ring.data.scanLabel=`${rec.name||'HOMESTEAD'} SUPPLIES · ${rec.stranded?'SUPPLY REQUEST OPEN':`${rec.supplies} deliveries recorded`}`;
  const p=s.entities.get(s.playerId);if(!p?.alive||!pos(p.pos)||s.ui?.docked||s.player?.flags?.docked||Math.hypot(p.pos.x-e.pos.x,p.pos.z-e.pos.z)>650)return;
  if(!rec.provisionContact||typeof rec.provisionContact!=='object'||Array.isArray(rec.provisionContact))rec.provisionContact={};
  const mem=rec.provisionContact;
  const say=(id,text)=>owner.bus.emit('comms:popup',{id:`homestead_provision:${a.missionId}:${id}`,sender:rec.name||'FRONTIER HOMESTEAD',category:'story',ttl:12,persist:false,text});
  if(!mem.welcomed){
    mem.welcomed=true;mem.suppliesAtWelcome=Number(rec.supplies)||0;
    const staged=s.entityList.some(b=>b?.alive&&b.data?.supplyCargo===true&&pos(b.pos)&&Math.hypot(b.pos.x-e.pos.x,b.pos.z-e.pos.z)<=800);
    say('welcome',`The welders have packed up. We live here now. ${rec.stranded?'Our supply request is open. ':''}${staged?'There are Homestead Supplies nearby. Tow a supply pod’s center inside this larger ring and we take it aboard.':'When you find a Homestead Supplies pod, bring its center inside this larger ring and we take it aboard.'} The board pays for that work. Modules built the frame; supplies keep it running. Watch the solid hull inside the ring.`);
    return;
  }
  if(rec.supplies>mem.suppliesAtWelcome&&!mem.received){
    mem.received=true;say('received',`We recorded a supply delivery after your first visit. ${rec.stranded?'We need another run now; the board has our request.':'The stores are aboard and the supply request is clear.'} This place is more than the job that raised it.`);return;
  }
  if(rec.stranded&&!mem.stranded){mem.stranded=true;say('stranded','The frame is still standing, but the stores need attention. Bring a Homestead Supplies pod into receiving range. The open request is for supplies, not another building module.');}
}
