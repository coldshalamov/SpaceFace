import test from 'node:test';
import assert from 'node:assert/strict';
import {ready,tail} from './anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../../src/core/coordinates.js';
export async function approachingRetirement(kind){
 const h=await ready(),s=h.sim.state,x=h.frame.pos.x,z=h.frame.pos.z,podStart={...h.pod.pos},D=3*physicsReachWuFromState(s,h.worker)+2000;
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(31);
 h.pod.pos.x=x+D;h.pod.pos.z=z;h.pod.flags.noInterp=true;
 if(kind==='frame')h.worker.pos.x=x+D+100;
 sync(32);
 return {...h,s,x,z,podStart,sync};
}
