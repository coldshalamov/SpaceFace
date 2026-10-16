import test from 'node:test';import assert from 'node:assert/strict';
import {ready,tail} from './anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../../src/core/coordinates.js';
export async function scene(mode){
 const h=await ready(),s=h.sim.state,row=JSON.stringify(s.sites.anvilOrchard),x=h.frame.pos.x,z=h.frame.pos.z,podStart={x:h.pod.pos.x,z:h.pod.pos.z};
 const D=3*physicsReachWuFromState(s,h.worker)+2000;
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(31);
 if(mode!=='both-away'){h.pod.pos.x=x+D;h.pod.pos.z=z;h.pod.flags.noInterp=true;}
 if(mode!=='pod-away')h.worker.pos.x=x+D+100;
 sync(32);sync(154);
 assert.equal(h.frame.alive,true);assert.equal(h.pod.alive,true);assert.equal(s.entities.get(h.frame.id),h.frame);assert.equal(s.entities.get(h.pod.id),h.pod);
 assert.equal(h.owner.records.has(h.frame.id),mode==='pod-away');assert.equal(h.owner.records.has(h.pod.id),mode==='frame-away');assert.equal(JSON.stringify(s.sites.anvilOrchard),row);
 return {...h,s,row,sync,x,z,podStart};
}
