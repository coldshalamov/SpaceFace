import test from 'node:test';
import assert from 'node:assert/strict';
import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
import {tail} from './fixtures/anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../src/core/coordinates.js';
for(const after of [false,true])test(`empty source: failure ${after?'after':'before'} native removal retains ${after?'no-solve recovery':'original source lease'}`,async()=>{
 const h=await setup(),s=h.sim.state,x=h.frame.pos.x,z=h.frame.pos.z,D=3*physicsReachWuFromState(s,h.worker)+2000;
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(1);h.worker.pos.x=x+D;h.worker.flags.noInterp=true;sync(2);
 const rec=h.owner.records.get(h.frame.id),world=h.owner.world,first=rec.colliders[0],remove=world.removeCollider;let calls=0;
 world.removeCollider=function(c,...args){if(c!==first)return remove.call(this,c,...args);calls++;delete world.removeCollider;if(after)remove.call(this,c,...args);throw Error('empty_source_retirement_failure');};
 try{
  assert.throws(()=>sync(124),/empty_source_retirement_failure/);assert.equal(calls,1);
  const result={sameRecord:h.owner.records.get(h.frame.id)===rec,nativeColliderPresent:world.getCollider(first.handle)===first,sourcePose:!!h.facade.readOrchardFramePose(h.frame),authority:h.owner.orchardAuthorityAvailable()};console.log(JSON.stringify({after,...result}));
  assert.equal(result.sameRecord,true);
  if(after)assert.equal(result.authority,false,'partial empty-source retirement must suspend solves until exact retirement finishes');
  else assert.equal(result.sourcePose,true,'a failure before native mutation must not detach the source lease');
 }finally{delete world.removeCollider;h.close();}
});
