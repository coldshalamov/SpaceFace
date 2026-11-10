import test from 'node:test';import assert from 'node:assert/strict';import {setup} from './fixtures/anvil-orchard-custody-source.mjs';
import {orchardFixedPodRootMatches} from '../src/core/anvilOrchardNative.js';
test('fixed source capsule at exact authored f32 yaw supports current-world snapshot canonicalization',async()=>{const h=await setup();try{assert.equal(h.accept(),4);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),record=h.owner.records.get(pod.id);assert.equal(orchardFixedPodRootMatches(h.owner,record.body,pod),true);const payload=h.owner.exportWorldSnapshot();assert.ok(payload);assert.equal(h.owner.canonicalizeWorldSnapshot(payload),true);assert.equal(h.owner.readOrchardFramePose(h.frame).progress[1],0);}finally{h.close();}});
for(const kind of ['native-x','native-yaw','entity-x','entity-yaw','revision','dynamic','velocity','geometry','orchard-id','orchard-kind'])test(`fixed capsule adoption refuses ${kind} mismatch without replacing the current owner`,async()=>{const h=await setup();try{assert.equal(h.accept(),4);const pod=h.sim.state.entityList.find(e=>e.data?.orchardKind==='pod'),r=h.owner.records.get(pod.id),world=h.owner.world;
if(kind==='orchard-id')pod.data.orchardId='ordinary';if(kind==='orchard-kind')pod.data.orchardKind='ordinary';
if(kind==='native-x'){const t=r.body.translation();r.body.setTranslation({...t,x:t.x+.001},true);}if(kind==='native-yaw')r.body.setRotation({x:0,y:0,z:0,w:1},true);if(kind==='entity-x')pod.pos.x+=.001;if(kind==='entity-yaw')pod.rot+=.00001;if(kind==='revision')pod.physicsBody={...pod.physicsBody,revision:2};if(kind==='dynamic')r.body.setBodyType(h.owner.RAPIER.RigidBodyType.Dynamic,true);if(kind==='velocity')pod.vel.x=1;if(kind==='geometry')r.collider.setShape(new h.owner.RAPIER.Ball(2));
if(kind!=='geometry')assert.equal(orchardFixedPodRootMatches(h.owner,r.body,pod),false);const payload=h.owner.exportWorldSnapshot();assert.ok(payload);assert.equal(h.owner.canonicalizeWorldSnapshot(payload),false);assert.equal(h.owner.world,world);assert.equal(h.owner.records.get(pod.id),r);
}finally{h.close();}});

test('fixed source frame refuses snapshot export after a sub-tolerance native displacement', async () => {
  const h = await setup();
  try {
    const record = h.owner.records.get(h.frame.id), world = h.owner.world;
    const position = record.body.translation();
    record.body.setTranslation({ ...position, x: position.x + .001 }, true);
    const payload = h.owner.exportWorldSnapshot();
    // Frames are guarded even earlier than fixed pods: invalid native bytes
    // cannot leave the current owner at all.
    assert.equal(payload, null);
    assert.equal(h.owner.world, world);
    assert.equal(h.owner.records.get(h.frame.id), record);
  } finally { h.close(); }
});
