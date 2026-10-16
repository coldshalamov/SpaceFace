import test from 'node:test';
import assert from 'node:assert/strict';
import {ready,tail} from './fixtures/anvil-orchard-custody-ready.mjs';
import {physicsReachWuFromState} from '../src/world/activityRuntime.js';
import {applyFrameOrigin,snapFrameOrigin} from '../src/core/coordinates.js';
async function approachingRetirement(kind){
 const h=await ready(),s=h.sim.state,x=h.frame.pos.x,z=h.frame.pos.z,podStart={...h.pod.pos},D=3*physicsReachWuFromState(s,h.worker)+2000;
 const sync=t=>{s.tick=t;s.simTime=t/60;applyFrameOrigin(s,snapFrameOrigin(h.worker.pos,{}));h.facade._syncSg02FrameOrigin(s);h.facade._syncSg02DynamicAuthorityEntities(s);tail(h,t);};
 h.worker.pos.x=x+100;h.worker.pos.z=z;h.worker.flags.noInterp=true;sync(31);
 h.pod.pos.x=x+D;h.pod.pos.z=z;h.pod.flags.noInterp=true;
 if(kind==='frame')h.worker.pos.x=x+D+100;
 sync(32);
 return {...h,s,x,z,podStart,sync};
}
for(const kind of ['pod','frame'])test(`${kind}: throw before first native retirement must preserve same-life return`,async()=>{
 const h=await approachingRetirement(kind),target=h[kind],record=h.owner.records.get(target.id),world=h.owner.world,body=record.body,colliders=[...record.colliders];
 const remove=world.removeCollider;let fired=0,thrown=null;
 world.removeCollider=function(c,...args){
  if(c===colliders[0]){fired++;delete world.removeCollider;throw Error('injected_before_native_retirement');}
  return remove.call(this,c,...args);
 };
 try{
  try{h.sync(154);}catch(e){thrown=e.message;}
  const afterThrow={recordSame:h.owner.records.get(target.id)===record,bodySame:world.getRigidBody(body.handle)===body,collidersAllPresent:colliders.every(c=>world.getCollider(c.handle)===c),managedColliders:colliders.filter(c=>h.owner._colliderOwners.get(c.handle)?.rec===record).length,colliderCount:colliders.length,dynamicManaged:h.owner.dynamicRecords.has(record),ready:!!h.owner.readOrchardPodReady(h.pod,h.s),framePose:!!h.owner.readOrchardFramePose(h.frame),authority:h.owner.orchardAuthorityAvailable()};
  h.sync(155);
  const retired={recordPresent:h.owner.records.has(target.id),finite:JSON.stringify(h.s.sites.anvilOrchard)};
  h.worker.pos.x=h.x+100;h.worker.pos.z=h.z;h.worker.flags.noInterp=true;h.pod.pos.x=h.podStart.x;h.pod.pos.z=h.podStart.z;h.pod.flags.noInterp=true;h.sync(156);
  const returned={frame:h.owner.records.has(h.frame.id),pod:h.owner.records.has(h.pod.id),ready:!!h.owner.readOrchardPodReady(h.pod,h.s),framePose:!!h.owner.readOrchardFramePose(h.frame),pending:[...h.owner._pendingNativeRebuilds.values()].map(v=>v.error?.message)};
  const saves=h.sim.registry.get('save'),env=JSON.parse(JSON.stringify(saves.serialize('retirement-failure-'+kind)));delete env.checksum;
  const loaded=saves.loadEnvelope(env),pod=h.s.entityList.find(e=>e.data?.orchardKind==='pod');
  const continued={loaded,physicsSnapshot:!!env.data.physics,pending:h.facade._nativeRestorePending,mode:h.s.physicsRuntime?.nativeRestore?.mode,ready:!!h.facade.readOrchardPodReady(pod)};
  console.log(JSON.stringify({kind,fired,thrown,afterThrow,retired:retired.recordPresent,returned,continued}));
  assert.equal(fired,1);assert.equal(thrown,'injected_before_native_retirement');
  assert.equal(returned.ready,true,'an ordinary retry/return after a no-native-mutation removal failure must retain released custody');
  assert.equal(returned.framePose,true,'a source no-native-mutation removal failure must not lose the motor return permission');
 }finally{delete world.removeCollider;h.close();}
});
