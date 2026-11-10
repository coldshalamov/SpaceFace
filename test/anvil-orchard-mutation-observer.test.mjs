import test from 'node:test';
import assert from 'node:assert/strict';
import {loadRapierCompatRuntime,orchardRapierBaseline} from '../src/core/rapierCompatRuntime.js';
import {createOrchardNativeLane,installOrchardMutationObservation,
 observeOrchardNativeObjects,ORCHARD_PUBLIC_MUTATORS} from '../src/core/anvilOrchardCollarQuery.js';
const R=await loadRapierCompatRuntime();
const baseline=orchardRapierBaseline(R);
assert.equal(baseline?.observationEnabled,true,'the actual default loader installs observation before exposing its runtime');
function fixture(){const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.fixed()),collider=world.createCollider(R.ColliderDesc.ball(2),body);
 const lane=createOrchardNativeLane(R,world,baseline),watch=observeOrchardNativeObjects(lane,[body,collider]);return {world,body,collider,lane,watch};}
test('pristine observation installation is idempotent and retains exact dispatch',()=>{
 const fn=R.Collider.prototype.setShape;assert.equal(installOrchardMutationObservation(R),true);assert.equal(R.Collider.prototype.setShape,fn);
 assert.ok(ORCHARD_PUBLIC_MUTATORS.RigidBody.includes('enableCcd'));assert.ok(ORCHARD_PUBLIC_MUTATORS.Collider.includes('setVoxel'));
});
for(const [name,call] of [
 ['local translation',f=>f.collider.setTranslationWrtParent({x:1,y:0,z:2})],
 ['prototype local translation',f=>R.Collider.prototype.setTranslationWrtParent.call(f.collider,{x:1,y:0,z:2})],
 ['shape',f=>f.collider.setShape(new R.Cuboid(1,2,3))],
 ['radius',f=>f.collider.setRadius(3)],
 ['contact skin',f=>f.collider.setContactSkin(.1)],
 ['filter',f=>f.collider.setCollisionGroups(0)],
 ['material',f=>f.collider.setFriction(.5)],
 ['body type',f=>f.body.setBodyType(R.RigidBodyType.KinematicPositionBased,false)],
 ['CCD',f=>f.body.enableCcd(true)],
 ['root',f=>f.body.setTranslation({x:4,y:0,z:7},false)],
 ['mass',f=>f.body.setAdditionalMass(12,false)],
 ['enable',f=>f.collider.setEnabled(false)],
])test(`observes public ${name} mutation before and after native dispatch`,()=>{
 const f=fixture();try{assert.equal(f.watch.serial(),0);call(f);assert.ok(f.watch.serial()>=2);assert.equal(f.lane.verify(),true);}finally{f.watch.retire();f.world.free();}
});
test('invalid input dirties before an original setter exception and preserves thrown identity',()=>{
 const f=fixture(),error=Error('read-input');let seen;
 try {const shape={intoRaw(){seen=f.watch.serial();throw error;}};assert.throws(()=>f.collider.setShape(shape),e=>e===error);assert.ok(seen>=1);assert.ok(f.watch.serial()>=2);}
 finally{f.watch.retire();f.world.free();}
});
test('an existing subscription cannot be replaced, retrieved or retired by a second caller',()=>{
 const f=fixture();try {assert.equal(observeOrchardNativeObjects(f.lane,[f.collider]),null);f.collider.setRadius(4);assert.ok(f.watch.serial()>0);assert.equal(f.watch.retire(),true);assert.equal(f.watch.serial(),null);assert.equal(f.watch.retire(),false);}
 finally{f.world.free();}
});
test('unregistered bodies retain setter return, receiver and native values',()=>{
 const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.dynamic()),c=world.createCollider(R.ColliderDesc.ball(1),body);
 const vectorPrototype=Object.getPrototypeOf(body.translation());
 try{assert.equal(body.setTranslation({x:3,y:0,z:4},false),undefined);const t=body.translation();assert.equal(Object.getPrototypeOf(t),vectorPrototype);assert.deepEqual([t.x,t.y,t.z],[3,0,4]);assert.equal(c.setRadius(2),undefined);assert.equal(c.radius(),2);}
 finally{world.free();}
});
test('unregistered worlds retain ordinary solves and exact dispatch exceptions',()=>{
 const world=new R.World({x:0,y:0,z:0}),body=world.createRigidBody(R.RigidBodyDesc.dynamic());
 const error=Error('unregistered pipeline failure'),original=world.physicsPipeline.step;let receiver;
 try{
  world.createCollider(R.ColliderDesc.ball(1),body);body.setLinvel({x:3,y:0,z:0},true);
  assert.equal(world.step(),undefined);assert.ok(body.translation().x>0);
  world.physicsPipeline.step=function(){receiver=this;throw error;};
  assert.throws(()=>R.World.prototype.step.call(world),e=>e===error);assert.equal(receiver,world.physicsPipeline);
 }finally{world.physicsPipeline.step=original;world.free();}
});
test('later foreign prototype wrappers are preserved and refuse a repeated installation',()=>{
 const prototype=R.Collider.prototype,original=prototype.setShape,foreign=function(...args){return original.apply(this,args);};prototype.setShape=foreign;
 try{assert.equal(installOrchardMutationObservation(R),false);assert.equal(prototype.setShape,foreign);}finally{prototype.setShape=original;}
});
