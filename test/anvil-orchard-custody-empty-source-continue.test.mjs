import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
import {tail} from './fixtures/anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../src/core/coordinates.js';
for(const scalar of [false,true])test(`empty source: ${scalar?'scalar':'native'} Continue preserves dormancy and normal return before first harvest`,async()=>{
 const h=await setup(),s=h.sim.state,x=h.frame.pos.x,z=h.frame.pos.z,D=3*physicsReachWuFromState(s,h.worker)+2000,row=JSON.stringify(s.sites.anvilOrchard);
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 try{
  h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(1);assert.ok(h.facade.readOrchardFramePose(h.frame));
  h.worker.pos.x=x+D;h.worker.flags.noInterp=true;sync(2);sync(124);assert.equal(h.owner.records.has(h.frame.id),false);assert.equal(s.entities.get(h.frame.id),h.frame);assert.equal(h.frame.alive,true);assert.equal(JSON.stringify(s.sites.anvilOrchard),row);
  const save=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(save.serialize('empty-source-dormant')));delete env.checksum;if(scalar)env.data.physics=null;assert.equal(save.loadEnvelope(env),true);h.worker=s.entities.get(s.playerId);h.frame=s.entityList.find(e=>e.data?.orchardKind==='frame');assert.equal(h.owner.records.has(h.frame.id),false);h.worker.pos.x=x+100;h.worker.flags.noInterp=true;sync(125);
  console.log(JSON.stringify({resident:h.owner.records.has(h.frame.id),pose:!!h.facade.readOrchardFramePose(h.frame),failures:[...h.owner._pendingNativeRebuilds.values()].map(v=>v.error?.message)}));
  assert.equal(h.owner.records.has(h.frame.id),true,'living empty source must return with its retained motor authority');
  assert.ok(h.facade.readOrchardFramePose(h.frame));assert.equal(JSON.stringify(s.sites.anvilOrchard),row);
 }finally{h.close();}
});
