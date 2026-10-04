import test from 'node:test';import assert from 'node:assert/strict';
import {createSimulation} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/core/sim.js';
import {createSg02DynamicBodyOwner} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/core/sg02DynamicBodyOwner.js';
import {LATCH_GEOMETRY as G} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/data/latchNineGeometry.js';
import {latchBodySpec,LATCH_RADIUS,latchPaddleSweep} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/data/latchNineBody.js';
import {bindLatchNative,readLatchNative,requestLatchPaddles,stepLatchNative,detachLatchNative} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/core/latchNineNative.js';
import {stepLatchPropulsion,latchPropulsionFrame} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/systems/latchNinePropulsion.js';
async function fixture(yaw=0){
 const sim=createSimulation({seed:9,systems:[]}),state=sim.state;state.mode='flight';state.world.currentSectorId='sector_tethys_junction';
 const entity=sim.spawn({type:'prop',hull:100,mass:140,radius:LATCH_RADIUS,pos:{x:0,z:0},vel:{x:0,z:0},rot:yaw,angVel:0,collides:true,physicsBody:latchBodySpec(),data:{role:'latch_nine',placeId:'place_latch_nine',latchNineService:{stationId:'station_tethys',sectorId:'sector_tethys_junction',box:{minX:19,maxX:21,minZ:-1,maxZ:1}}}});
 const owner=await createSg02DynamicBodyOwner({mode:'rapier-dynamic'});owner.syncFromEntities(state.entityList);const rec=owner.records.get(entity.id);return {sim,state,entity,owner,rec,close(){owner.dispose();sim.dispose();}};
}

import {writePhysicsControl,consumePhysicsCommand} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/core/physicsAuthority.js';
import {forgetLatchPropulsion} from '/workspace/scratch/d2415e46e35b/recovery-latch-20261004/normal-route-v2/src/systems/latchNinePropulsion.js';

test('failed native integration cannot certify the pending firing',async()=>{const h=await fixture();try{bindLatchNative(h.owner,h.rec);stepLatchPropulsion(h.state,h.entity,1/60);const step=h.owner.world.step;h.owner.world.step=()=>{throw new Error('injected-native-failure');};assert.throws(()=>h.owner.step(1/60),/injected-native-failure/);assert.equal(latchPropulsionFrame(h.state,h.entity),null);h.owner.world.step=step;}finally{h.close();}});
test('a subsequent native tick with no Latch command extinguishes the old accepted receipt',async()=>{const h=await fixture();try{bindLatchNative(h.owner,h.rec);stepLatchPropulsion(h.state,h.entity,1/60);h.owner.step(1/60);assert(latchPropulsionFrame(h.state,h.entity));h.owner.step(1/60);assert.equal(latchPropulsionFrame(h.state,h.entity),null);}finally{h.close();}});
test('both signed yaw offsets receive socket-derived restoring moments',async()=>{for(const yaw of [-.3,.3]){const h=await fixture(yaw);try{bindLatchNative(h.owner,h.rec);stepLatchPropulsion(h.state,h.entity,1/60);h.owner.step(1/60);const f=latchPropulsionFrame(h.state,h.entity);assert(f);const moment=f.thrusters.reduce((sum,t,i)=>sum+(t.position[0]*-t.exhaust[2]-t.position[2]*-t.exhaust[0])*t.fraction*G.thrusters[i].maxForce,0);assert(moment*yaw<0);assert(Math.abs(h.rec.controlTorque.y-moment)<1e-5);assert(Math.abs(h.entity.rot)<Math.abs(yaw));}finally{h.close();}}});
