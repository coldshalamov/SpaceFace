// The existing homestead intake settles a deliberately offered whole food load.
// Quotes are live-object memory, never saved authority to consume a restored pod.
const offers=new WeakMap();
export const PROVISION_UNLOAD=Object.freeze({seconds:2,relativeSpeed:3,maxSampleGap:.25});
export function provisionFreightCandidate(owner,e){
 const mass=owner.ctx?.registry?.get('lootShards')?.gardenFeedMass(e);
 const valid=e?.alive&&e.data?.commodityId==='cmdty_food'&&Number.isSafeInteger(e.data.amount)&&e.data.amount>=10&&Number.isFinite(mass)&&mass>0;
 if(!valid&&e&&typeof e==='object')offers.get(owner)?.delete(e);
 return !!valid;
}
export function offerProvisionFreight(owner,e,rec,house,radius,fee){
 const reject=()=>{const rows=offers.get(owner),old=rows?.get(e);if(old?.house===house){rows.delete(e);cancel(old);}return false;};
 const cancel=old=>{const wasUnloading=old?.unloading;if(old){delete old.unloading;delete old.lastSample;old.heldFor=0;}if(wasUnloading){owner.bus.emit('comms:popup',{id:`frontier_food_stop:${e.id}`,sender:rec.name||'Frontier household',category:'story',ttl:5,text:'Unloading stopped. Your provisions are still aboard the pod.'});}};
 const s=owner.state,p=s.entities.get(s.playerId),t=s.player?.tether,a=s.combat?.attachments?.byId?.[String(t?.attachmentId)];
 if(s.mode!=='flight'||s.run?.kind==='survival'||s.physicsVenue?.active||s.ui?.docked||s.player?.flags?.docked
  ||!p?.alive||!provisionFreightCandidate(owner,e)||!t?.active||t.targetId!==e.id||a?.state!=='active'
  ||a.id!==t.attachmentId||a.defId!=='tether_standard'||a.ownerId!==p.id||a.targetId!==e.id
  ||a.ownerGeneration!==p.occupantGeneration||a.targetGeneration!==e.occupantGeneration||rec.sectorId!==s.world?.currentSectorId)return reject();
 const distance=Math.hypot(e.pos.x-house.pos.x,e.pos.z-house.pos.z);
 if(!Number.isFinite(distance)||distance>600)return reject();
 // Only the nearest live household may quote this load; overlapping approaches do not spam competing offers.
 const nearer=(s.frontier?.homesteads||[]).some(r=>{const b=s.entities.get(r.entityId);
  if(r===rec||r.gone||r.sectorId!==s.world?.currentSectorId||!b?.alive||b.data?.homestead!==true
   ||(r.gen!=null&&r.gen!==b.occupantGeneration))return false;
  const d=Math.hypot(e.pos.x-b.pos.x,e.pos.z-b.pos.z);
  return d<distance||(d===distance&&b.id<house.id);
 });
 if(nearer)return false;
 let rows=offers.get(owner);if(!rows){rows=new WeakMap();offers.set(owner,rows);}
 const old=rows.get(e),amount=e.data.amount;
 const matches=old?.house===house&&old.houseLife===house.occupantGeneration&&old.bodyLife===e.occupantGeneration
  &&old.attachment===a&&old.attachmentId===a.id&&old.amount===amount&&old.fee===fee&&old.player===p&&old.playerLife===p.occupantGeneration;
 if(distance>radius){
  if(matches)cancel(old);
  if(!matches){rows.set(e,{attachment:a,attachmentId:a.id,house,houseLife:house.occupantGeneration,bodyLife:e.occupantGeneration,amount,fee,player:p,playerLife:p.occupantGeneration});
   owner.bus.emit('comms:popup',{id:`frontier_food_offer:${e.id}`,sender:rec.name||'Frontier household',category:'story',ttl:12,persist:true,
    text:`We can put all ${amount} units of Provisions aboard. We will pay you ${Math.round(fee)} credits. Tow this whole load inside our ${radius} WU receiving ring, then hold it below ${PROVISION_UNLOAD.relativeSpeed} WU/s relative to our frame for ${PROVISION_UNLOAD.seconds} seconds to unload. Moving faster, leaving or cutting the line stops unloading. Keep it outside to keep your food; we cannot split a sealed pod. This is one household delivery.`});}
  return false;
 }
 if(!matches)return reject();
 const speed=Math.hypot(e.vel?.x-house.vel?.x,e.vel?.z-house.vel?.z),now=s.simTime;
 if(!Number.isFinite(speed)||speed>PROVISION_UNLOAD.relativeSpeed||!Number.isFinite(now)){cancel(old);return false;}
 const gap=now-old.lastSample;
 if(!old.unloading||!Number.isFinite(gap)||gap<0||gap>PROVISION_UNLOAD.maxSampleGap){
  cancel(old);if(old.unloading)return false;old.unloading=true;old.heldFor=0;old.lastSample=now;
  owner.bus.emit('comms:popup',{id:`frontier_food_unload:${e.id}`,sender:rec.name||'Frontier household',category:'story',ttl:4,text:`Hold the load steady. ${PROVISION_UNLOAD.seconds} seconds, then all ${amount} units come aboard for ${Math.round(fee)} credits. Cut or move out to keep it.`});
  return false;
 }else old.heldFor+=gap;
 old.lastSample=now;
 return old.heldFor+1e-9>=PROVISION_UNLOAD.seconds;
}
export function clearProvisionFreightOffers(owner){offers.delete(owner);}
