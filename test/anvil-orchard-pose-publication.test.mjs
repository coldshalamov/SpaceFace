import test from 'node:test';
import assert from 'node:assert/strict';
import {createSimulation} from '../src/core/sim.js';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {createOrchardCollarState} from '../src/core/anvilOrchardNative.js';
import {ORCHARD_GEOMETRY as G,orchardFrameBodySpec} from '../src/data/anvilOrchardBody.js';
async function fixture(){const sim=createSimulation(),frame=sim.spawn({type:'wreck',pos:{x:13200,z:8300},rot:.713,radius:G.radius,hull:300,physicsBody:orchardFrameBodySpec(),
 data:{orchardId:'anvil_storm_orchard',orchardKind:'frame',worldRecordId:G.worldRecordId,masslineTetherable:false,orchardCollars:createOrchardCollarState([0,14,30])}});
 const owner=await createSg02DynamicBodyOwner();owner.syncFromEntities([frame]);return {sim,frame,owner,rec:owner.records.get(frame.id),close(){owner.dispose();sim.dispose();}};}
test('normal source publication provides one immutable current receipt across draws',async()=>{
 const f=await fixture();try{const first=f.owner.readOrchardFramePose(f.frame);assert.ok(first);assert.equal(Object.isFrozen(first),true);for(let i=0;i<20;i++)assert.equal(f.owner.readOrchardFramePose(f.frame),first);assert.deepEqual(first.progress,[0,14,30]);assert.equal(first.completedNativeTick,null);}finally{f.close();}
});
for(const [name,mutate] of [
 ['instance local pose',f=>f.rec.colliders[0].setTranslationWrtParent({x:1,y:0,z:0})],
 ['prototype local pose',f=>f.owner.RAPIER.Collider.prototype.setTranslationWrtParent.call(f.rec.colliders[0],{x:1,y:0,z:0})],
 ['shape',f=>f.rec.colliders[0].setShape(new f.owner.RAPIER.Cuboid(1,1,1))],
 ['skin',f=>f.rec.colliders[0].setContactSkin(.1)],
 ['material',f=>f.rec.colliders[0].setFriction(.99)],
 ['filter',f=>f.rec.colliders[0].setCollisionGroups(0)],
 ['enabled',f=>f.rec.colliders[0].setEnabled(false)],
 ['root',f=>f.rec.body.setTranslation({x:13201,y:0,z:8300},false)],
 ['CCD',f=>f.rec.body.enableCcd(true)],
 ['type',f=>f.rec.body.setBodyType(f.owner.RAPIER.RigidBodyType.KinematicPositionBased,false)],
 ['native collider addition',f=>f.owner.world.createCollider(f.owner.RAPIER.ColliderDesc.ball(1),f.rec.body)],
 ['native removal/reallocation',f=>{f.owner.world.removeCollider(f.rec.colliders[0],false);f.owner.world.createCollider(f.owner.RAPIER.ColliderDesc.ball(1),f.rec.body);}],
 ['manifest mutation',f=>{f.frame.physicsBody.collisionProxyManifest.convexParts[0].points[0].x+=.1;}],
 ['progress mutation',f=>{f.frame.data.orchardCollars.progress[1]++;}],
 ['same-value body replacement',f=>{f.frame.physicsBody=structuredClone(f.frame.physicsBody);}],
 ['same-value data replacement',f=>{f.frame.data={...f.frame.data};}],
])test(`published pose refuses stale ${name} without simulation advancement`,async()=>{
 const f=await fixture();try{assert.ok(f.owner.readOrchardFramePose(f.frame));mutate(f);assert.equal(f.owner.readOrchardFramePose(f.frame),null);}finally{f.close();}
});
test('full normal synchronization can publish a restored pose after a dirty native mutation',async()=>{
 const f=await fixture();try{const first=f.owner.readOrchardFramePose(f.frame),c=f.rec.colliders[0],position=c.translationWrtParent();c.setTranslationWrtParent({x:1,y:0,z:0});assert.equal(f.owner.readOrchardFramePose(f.frame),null);c.setTranslationWrtParent(position);f.owner.syncFromEntities([f.frame]);const next=f.owner.readOrchardFramePose(f.frame);assert.ok(next);assert.notEqual(next,first);assert.equal(f.owner.readOrchardFramePose(f.frame),next);}finally{f.close();}
});
test('rebase and cold replacement withdraw the old published object and revalidate current membership',async()=>{
 const f=await fixture();try{const first=f.owner.readOrchardFramePose(f.frame);f.owner.setFrameOrigin({x:13000,z:8100},1);f.owner.syncFromEntities([f.frame]);const rebased=f.owner.readOrchardFramePose(f.frame);assert.ok(rebased);assert.notEqual(rebased,first);f.owner.rebuildWorldFromEntities([f.frame]);f.owner.syncFromEntities([f.frame]);const cold=f.owner.readOrchardFramePose(f.frame);assert.ok(cold);assert.notEqual(cold,rebased);assert.equal(cold.completedNativeTick,null);f.owner.dispose();assert.equal(f.owner.readOrchardFramePose(f.frame),null);}finally{f.sim.dispose();}
});
