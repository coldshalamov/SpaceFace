import {isMasslineLatchedPickup} from './mining.js';
import {KESSLER_SCALE} from '../data/kessler.js';
import {kesslerPadPosition} from './kesslerScaleWorksite.js';
const tag='kesslerFreightRecovery';
export function clearKesslerRecovery(owner){for(const e of [...(owner.state?.entityList||[])])if(e?.alive&&e.data?.[tag])owner.helpers?.removeEntity?.(e.id);}
export function tickKesslerRecovery(owner){
 const s=owner.state,p=s?.entities?.get(s.playerId),pad=kesslerPadPosition();
 if(!s||s.mode!=='flight'||s.run?.kind==='survival'||s.physicsVenue?.active||s.ui?.docked||s.player?.flags?.docked||s.world?.currentSectorId!==KESSLER_SCALE.sectorId||!p?.alive||![p.pos?.x,p.pos?.z].every(Number.isFinite)){clearKesslerRecovery(owner);return;}
 let selected;
 for(const w of s.entityList||[]){const d=w?.data,receipt=d?.kesslerReceipt;if(!w?.alive||s.entities.get(w.id)!==w||w.type!=='payload'||d?.jettisonedCargo!==true||d.kesslerRead!==true||d.physicalCustodyOnly||!Number.isSafeInteger(w.occupantGeneration)||!Number.isFinite(receipt?.plateRead)||!Number.isFinite(receipt?.trueRead)||![w.pos?.x,w.pos?.z].every(Number.isFinite)||typeof d.commodityId!=='string')continue;
  // Pool mirrors the remaining cargo units but predates some saved pods; an absent or
  // unreadable key falls back to the pod's stamped amount rather than losing the fix.
  const poolQty=d.salvagePool&&typeof d.salvagePool==='object'?d.salvagePool[d.commodityId]:undefined;
  const quantity=Number.isFinite(poolQty)?poolQty:d.amount;
  if(!Number.isFinite(quantity)||quantity<=0)continue;
  const distance=Math.hypot(w.pos.x-p.pos.x,w.pos.z-p.pos.z);if(distance>400||Math.hypot(w.pos.x-pad.x,w.pos.z-pad.z)>600||selected&&distance>=selected.distance)continue;
  selected={w,d,receipt,quantity,distance};
 }
 if(!selected){clearKesslerRecovery(owner);return;}
 const {w,d,receipt,quantity}=selected,key=`${w.id}:${w.occupantGeneration}`;let guide;
 for(const e of [...(s.entityList||[])])if(e?.alive&&e.data?.[tag]){if(!guide&&e.data.freightKey===key&&e.physicsBody===false)guide=e;else owner.helpers.removeEntity(e.id);}
 if(!guide)guide=owner.helpers.spawnEntity?.({type:'beacon',pos:{x:w.pos.x,z:w.pos.z},radius:1,mass:0,hull:1,hullMax:1,collides:false,physicsBody:false,homeSectorId:KESSLER_SCALE.sectorId,data:{[tag]:true,freightKey:key,parentType:'story_prop',circuitMark:true,ringRadius:18,visualRadius:18,tetherable:false,masslineTetherable:false,scannerSignalKind:'salvage'}});
 if(!guide)return;guide.pos.x=w.pos.x;guide.pos.z=w.pos.z;
 const latched=isMasslineLatchedPickup(s,p,w);
 guide.data.scanLabel=`FREIGHT RETURN LAST FIX · ${quantity}u ${d.commodityId.replace(/^cmdty_/,'').replaceAll('_',' ')} aboard pod · ${latched?'release its line, then approach':'approach to collect'} as cargo space allows · ${receipt.trueRead.toFixed(1)}t was the body stamp, not cargo quantity`;
 guide.data.freightRead={entityId:w.id,generation:w.occupantGeneration,quantity,commodityId:d.commodityId,plateRead:receipt.plateRead,trueRead:receipt.trueRead};
}
