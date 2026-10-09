// Latch-only physical paddle motor; native contacts and accepted angles have one writer.
import {LATCH_GEOMETRY as G} from '../data/latchNineGeometry.js';
import {LATCH_RADIUS,isLatchBody,latchPaddlePose,latchPaddleSweep} from '../data/latchNineBody.js';
import {planarProxyObbHalfHeight} from './planarProxyGeometry.js';
const bindings=new WeakMap(),entityBindings=new WeakMap();
const qYaw=a=>({x:0,y:-Math.sin(a/2),z:0,w:Math.cos(a/2)});
function current(owner,rec,b){return !!(b && owner.records.get(rec.entity.id)===rec && rec.entity===b.entity && rec.entity.occupantGeneration===b.life && rec.body===b.body && rec.entity.physicsBody===b.spec && rec.entity.physicsBody.collisionProxyManifest===b.manifest && rec.colliders.length===b.colliders.length && rec.colliders.every((c,i)=>c===b.colliders[i]&&c.handle===b.handles[i]) && isLatchBody(rec.entity) && rec.entity.alive!==false && !(rec.entity.hull<=0) && rec.entity.collides!==false && !rec.entity.data.disabled && rec.body.isEnabled?.()!==false);}
export function bindLatchNative(owner,rec){
 if(!isLatchBody(rec.entity))return false;
 const old=bindings.get(rec);if(old)return current(owner,rec,old);
 // Bind only a current constructed record. Native adoption of a non-rest old snapshot must
 // be rejected by its canonical geometry check, rather than silently resetting its shapes.
 if(owner.records.get(rec.entity.id)!==rec||rec.colliders.length!==G.staticSlabs.length+3)return false;
 const b={entity:rec.entity,life:rec.entity.occupantGeneration,body:rec.body,spec:rec.entity.physicsBody,manifest:rec.entity.physicsBody.collisionProxyManifest,colliders:[...rec.colliders],handles:rec.colliders.map(c=>c.handle),angles:[0,0,0],targets:[0,0,0],blocked:[false,false,false]};
 bindings.set(rec,b);entityBindings.set(rec.entity,{owner,rec,b});return current(owner,rec,b);
}
export function readLatchNative(entity,out){const v=entityBindings.get(entity);if(!v||!current(v.owner,v.rec,v.b))return null;
 const result=out||{angles:[0,0,0],blocked:[false,false,false],controlForce:{},controlTorque:{}};
 for(let i=0;i<3;i++){result.angles[i]=v.b.angles[i];result.blocked[i]=v.b.blocked[i];}
 result.life=v.b.life;result.tick=v.owner.tick;result.bodyHandle=v.rec.body.handle;
 result.controlReceipt=v.rec._ownedControlReceiptTick===v.owner.tick?v.rec._ownedControlReceipt:null;
 result.controlReceiptTick=v.rec._ownedControlReceiptTick;
 for(const k of ['x','y','z']){result.controlForce[k]=v.rec.controlForce?.[k]||0;result.controlTorque[k]=v.rec.controlTorque?.[k]||0;}
 return result;
}
export function requestLatchPaddles(entity,angles){const v=entityBindings.get(entity);if(!v||!current(v.owner,v.rec,v.b)||!Array.isArray(angles)||angles.length!==3||angles.some(x=>!Number.isFinite(x)))return false;v.b.targets=angles.map((a,i)=>Math.max(G.paddles[i].min,Math.min(G.paddles[i].max,a)));return true;}
export function detachLatchNative(rec){const b=bindings.get(rec);if(b&&entityBindings.get(b.entity)?.rec===rec)entityBindings.delete(b.entity);bindings.delete(rec);}
export function stepLatchNative(owner,rec,dt,pairsForm=()=>true,refreshSpine){
 if(!bindLatchNative(owner,rec))return false;const b=bindings.get(rec),e=rec.entity;
 if(!current(owner,rec,b)||!Number.isFinite(dt)||dt<=0||dt>.1)return false;
 const pos=rec.body.translation(),q=rec.body.rotation(),yaw=Math.atan2(-2*q.y*q.w,1-2*q.y*q.y),c=Math.cos(yaw),s=Math.sin(yaw),scale=e.radius/LATCH_RADIUS;
 if(!(scale>0))return false;let changed=false;
 owner.world.propagateModifiedBodyPositionsToColliders();
 for(let i=0;i<3;i++){
  const from=b.angles[i],to=from+Math.sign(b.targets[i]-from)*Math.min(Math.abs(b.targets[i]-from),dt*.65);b.blocked[i]=false;if(from===to)continue;
  const sweep=latchPaddleSweep(i,from,to),hx=sweep.hx*scale,hz=sweep.hz*scale;
  const at={x:pos.x+(c*sweep.x-s*sweep.z)*scale,y:pos.y,z:pos.z+(s*sweep.x+c*sweep.z)*scale};
  const shape=new owner.RAPIER.Cuboid(hx,planarProxyObbHalfHeight(hx,hz),hz);
  for(const peer of owner.records.values()){
   if(peer!==rec&&(peer.entity.alive===false||peer.body.isEnabled?.()===false||!pairsForm(e,rec.spec,peer.entity,peer.spec)))continue;
   for(let j=0;j<peer.colliders.length;j++){
    // Fixed mounting sleeves intentionally overlap the blade root; peer paddles never do.
    if(peer===rec&&(j<G.staticSlabs.length||j===G.staticSlabs.length+i))continue;
    const other=peer.colliders[j];if(other.isSensor?.()||other.isEnabled?.()===false)continue;
    const contact=other.contactShape(shape,at,qYaw(yaw),0);
    if(contact&&contact.distance<0){b.blocked[i]=true;break;}
   }
   if(b.blocked[i])break;
  }
  if(b.blocked[i])continue;
  const p=latchPaddlePose(i,to),collider=rec.colliders[G.staticSlabs.length+i];
  collider.setTranslationWrtParent({x:p.x*e.radius,y:0,z:p.z*e.radius});collider.setRotationWrtParent(qYaw(p.angleDeg*Math.PI/180));
  b.angles[i]=to;if(refreshSpine)rec.coincidentSpines[G.staticSlabs.length+i]=refreshSpine(collider);
  rec.collectorSweepRadius=null;rec.body.wakeUp();changed=true;
 }
 return changed;
}

// Read-only post-solve evidence for recognition. No absence-of-event inference: the native
// owner explicitly queries current solid contact geometry for the exact current player.
export function readLatchApproachEvidence(state,tender,out=[]){
 const binding=entityBindings.get(tender);if(!binding||!current(binding.owner,binding.rec,binding.b))return null;
 const owner=binding.owner,player=state?.entities?.get(state.playerId),record=player&&owner.records.get(player.id);
 if(!player?.alive||!(player.hull>0)||record?.entity!==player||record.body?.isEnabled?.()===false)return null;
 const stations=(state.entityIndex?.stations||state.entityList||[]).filter(e=>e.alive&&e.type==='station'&&e.data?.stationId==='station_tethys'&&state.entities?.get(e.id)===e);
 if(stations.length!==1)return null;const station=stations[0],stationRecord=owner.records.get(station.id);if(stationRecord?.entity!==station)return null;
 const origin=owner.getFrameOrigin(),position=record.body.translation();
 if(Math.abs(position.x+origin.x-player.pos.x)>.001||Math.abs(position.z+origin.z-player.pos.z)>.001)return null;
 if(typeof owner.sampleSolidContacts!=='function')return null;
 out.length=0;owner.sampleSolidContacts(player.id,{out});
 return {tick:owner.tick,player,playerLife:player.occupantGeneration,playerBody:record.body,playerSpec:player.physicsBody,station,stationLife:station.occupantGeneration,stationBody:stationRecord.body,enterSerial:state.world?.enterSerial,tender,tenderLife:tender.occupantGeneration,tenderBody:binding.rec.body,hull:player.hull,lastDamageT:player.lastDamageT,clear:out.length===0};
}
