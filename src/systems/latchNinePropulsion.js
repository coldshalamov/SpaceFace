// Bounded force allocation to actual authored sockets. No position/velocity writes.
import {LATCH_GEOMETRY as G} from '../data/latchNineGeometry.js';
import {readLatchNative,requestLatchPaddles} from '../core/latchNineNative.js';
import {writeOwnedPhysicsControl,cancelOwnedPhysicsControl,physicsBodyNativeReady} from '../core/physicsAuthority.js';
const live=new WeakMap();
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stepLatchPropulsion(state,entity,dt){
 const frame=readLatchNative(entity),service=entity?.data?.latchNineService,box=service?.box;
 if(!frame||state.entities?.get(entity.id)!==entity||!physicsBodyNativeReady(entity)||!Number.isFinite(entity.pos?.x)||!Number.isFinite(entity.pos?.z)||state.mode!=='flight'||state.world?.currentSectorId!==service?.sectorId||!Number.isFinite(dt)||dt<=0||!box||!['minX','maxX','minZ','maxZ'].every(k=>Number.isFinite(box[k]))||box.minX>box.maxX||box.minZ>box.maxZ){forgetLatchPropulsion(entity);return false;}
 const yaw=Number.isFinite(entity.rot)?Math.atan2(Math.sin(entity.rot),Math.cos(entity.rot)):0,c=Math.cos(yaw),s=Math.sin(yaw),x=entity.pos.x,z=entity.pos.z;
 const anchor={x:(box.minX+box.maxX)/2,z:(box.minZ+box.maxZ)/2};
 const fx=clamp((anchor.x-x)*34-(entity.vel?.x||0)*160,-1600,1600),fz=clamp((anchor.z-z)*34-(entity.vel?.z||0)*160,-1600,1600);
 const desire=[c*fx+s*fz,-s*fx+c*fz,clamp(-yaw*600-(entity.angVel||0)*650,-1400,1400)];
 const values=G.thrusters.map(()=>0),columns=G.thrusters.map(t=>{const dx=-t.exhaust[0],dz=-t.exhaust[2];return [dx,dz,t.position[0]*dz-t.position[2]*dx];});
 // Fixed bounded coordinate descent, deterministic and nonnegative; yaw is dimensionally
 // weighted so translation is not sacrificed merely to match a long moment arm.
 const residual=[...desire],weight=[1,1,.06];
 for(let pass=0;pass<12;pass++)for(let i=0;i<columns.length;i++){
  const v=columns[i],den=v.reduce((sum,a,k)=>sum+a*a*weight[k],0),delta=v.reduce((sum,a,k)=>sum+a*residual[k]*weight[k],0)/den;
  const capacity=v[0]!==0&&v[0]*desire[0]<=0?0:G.thrusters[i].maxForce;
  const next=clamp(values[i]+delta,0,capacity),change=next-values[i];values[i]=next;
  for(let k=0;k<3;k++)residual[k]-=v[k]*change;
 }
 const actual=desire.map((v,k)=>v-residual[k]);
 // The membrane takes game-yaw torque; the native owner converts it to physical -Y.
 const receipt=writeOwnedPhysicsControl(entity,{mode:'latch-service',source:'latch-nine',force:{x:c*actual[0]-s*actual[1],y:0,z:s*actual[0]+c*actual[1]},torque:{x:0,y:actual[2],z:0},maxSpeed:7});
 let entry=live.get(entity);
 if(!entry||entry.state!==state||entry.life!==entity.occupantGeneration||entry.bodySpec!==entity.physicsBody)
   entry={state,life:entity.occupantGeneration,bodySpec:entity.physicsBody,nativeScratch:{angles:[0,0,0],blocked:[false,false,false],controlForce:{},controlTorque:{}},pending:null,accepted:null};
 // Capture the last consumed frame before installing the next pending submission.
 acceptWitness(entry,frame);
 entry.pending={receipt,simTime:state.simTime,submittedTick:frame.tick,
   presentation:Object.freeze({force:Object.freeze([...actual]),thrusters:Object.freeze(G.thrusters.map((t,i)=>Object.freeze({id:t.id,node:t.node,position:t.position,exhaust:t.exhaust,fraction:values[i]/t.maxForce})))}),
   worldForce:{x:c*actual[0]-s*actual[1],z:s*actual[0]+c*actual[1]},torqueY:actual[2]};
 live.set(entity,entry);
 const phase=state.latchNine?.phase;
 requestLatchPaddles(entity,phase==='GUIDE'?[.55,.55,.55]:phase==='APPROACH'?[0,0,.48]:[0,0,0]);
 return true;
}
function acceptWitness(entry,native){
 const pending=entry.pending;
 if(pending&&native.controlReceipt===pending.receipt&&native.controlReceiptTick===native.tick&&native.tick>pending.submittedTick)entry.accepted=pending;
}
export function latchPropulsionFrame(state,entity){
 const entry=live.get(entity),native=entry&&readLatchNative(entity,entry.nativeScratch);
 if(!entry||entry.state!==state||state.entities?.get(entity.id)!==entity||entry.life!==entity.occupantGeneration||entry.bodySpec!==entity.physicsBody||!native||!physicsBodyNativeReady(entity)||state.mode!=='flight'||state.world?.currentSectorId!==entity.data.latchNineService?.sectorId||!Number.isFinite(state.simTime))return null;
 acceptWitness(entry,native);
 const accepted=entry.accepted;
 if(!accepted||native.controlReceipt!==accepted.receipt||native.controlReceiptTick!==native.tick||state.simTime-accepted.simTime<0||state.simTime-accepted.simTime>.1)return null;
 // Identity proves ownership; this additional numeric check rejects a clamped/altered
 // native control response instead of pretending all requested nozzle thrust was applied.
 if(!['x','z'].every(k=>Math.abs(native.controlForce[k]-accepted.worldForce[k])<1e-5)||Math.abs(native.controlTorque.y-accepted.torqueY)>1e-5)return null;
 return accepted.presentation;
}
export function forgetLatchPropulsion(entity){const old=live.get(entity);if(old?.pending)cancelOwnedPhysicsControl(entity,old.pending.receipt);live.delete(entity);}

export function latchPropulsionState(entity){return live.get(entity)?.state||null;}
export function latchPropulsionFrameForEntity(entity){const state=latchPropulsionState(entity);return state?latchPropulsionFrame(state,entity):null;}
