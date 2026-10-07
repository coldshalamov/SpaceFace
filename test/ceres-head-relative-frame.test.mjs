import test from 'node:test';import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetPose} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetThrust,ceresWorkfleetCarrierPointVelocity as pointVelocity,ceresWorkfleetHeadReturnReady as ready,
 ceresWorkfleetHardwareSpec,driveCeresWorkfleetBody} from '../src/systems/ceresWorkfleet.js';
const vector=(x,z)=>({x,z});
test('carrier point velocity includes zero, positive and opposite angular motion',()=>{
 const b={pos:vector(10,20),vel:vector(3,4),angVel:0},p=vector(15,27);
 assert.deepEqual(pointVelocity(b,p),vector(3,4));b.angVel=1;assert.deepEqual(pointVelocity(b,p),vector(-4,9));b.angVel=-1;assert.deepEqual(pointVelocity(b,p),vector(10,-1));
});
test('relative docking is translation invariant and refuses mismatched motion or an unverified corridor',()=>{
 const b={pos:vector(0,0),vel:vector(2,-1),rot:.1,angVel:.02},target={x:10,z:20,rot:.1};
 const h={pos:vector(10,20),vel:pointVelocity(b,target),rot:.1,angVel:.02};assert.equal(ready(b,h,target,true),true);
 b.vel.x+=3;b.vel.z+=2;h.vel.x+=3;h.vel.z+=2;assert.equal(ready(b,h,target,true),true);
 h.vel.x+=.121;assert.equal(ready(b,h,target,true),false);h.vel.x-=.121;
 h.angVel=-.02;assert.equal(ready(b,h,target,true),false);h.angVel=.02;
 assert.equal(ready(b,h,target,false),false);h.pos.x+=.201;assert.equal(ready(b,h,target,true),false);
});
test('feed-forward caps total requested velocity and final acceleration',()=>{
 const e={pos:vector(0,0),vel:vector(0,0),mass:60,rot:0,angVel:0,physicsBody:{inertiaY:1000}};
 const target={x:100,z:100,rot:0};let c=ceresWorkfleetThrust(e,target,{speed:5,totalSpeed:10,accel:100,referenceVelocity:vector(100,100)});
 assert.ok(Math.abs(Math.hypot(c.force.x,c.force.z)/60/1.8-10)<1e-10,'sum of correction and frame velocity is capped');
 c=ceresWorkfleetThrust(e,target,{speed:5,totalSpeed:10,accel:8,referenceVelocity:vector(100,100)});assert.ok(Math.hypot(c.force.x,c.force.z)<=480+1e-9);
 const a=ceresWorkfleetThrust({...e,vel:vector(1,2)},{x:.1,z:.2,rot:0},{speed:5,totalSpeed:10,accel:8,referenceVelocity:vector(2,3)});
 const z=ceresWorkfleetThrust({...e,vel:vector(3,1)},{x:.1,z:.2,rot:0},{speed:5,totalSpeed:10,accel:8,referenceVelocity:vector(4,2)});
 assert.deepEqual([Math.fround(a.force.x),Math.fround(a.force.z)],[Math.fround(z.force.x),Math.fround(z.force.z)],'common translation preserves the exact force accepted by the f32 native owner');
});
for(const sample of [{velocity:vector(2,-1),spin:0,headSpin:0},{velocity:vector(.5,.3),spin:.004,headSpin:-.004},{velocity:vector(-.5,.4),spin:-.004,headSpin:.004}])test(`native head docks in moving/spinning carrier frame ${sample.spin}`,async()=>{
 const frame={x:C.sitePlacement.pos.x-80,z:C.sitePlacement.pos.z-220,rot:Math.PI/2};
 const b={id:1,occupantGeneration:1,...ceresWorkfleetHardwareSpec('breaker'),pos:vector(frame.x,frame.z),rot:frame.rot,vel:{...sample.velocity},angVel:sample.spin};
 const initial=ceresWorkfleetPose(frame,{x:-16,z:0,rot:0});
 const h={id:2,occupantGeneration:2,...ceresWorkfleetHardwareSpec('cutterHead'),pos:vector(initial.x,initial.z),rot:initial.rot,vel:vector(-sample.velocity.x,-sample.velocity.z),angVel:sample.headSpin};
 const native=await createSg02DynamicBodyOwner({publishTelemetry:false,frameOrigin:{x:-12288,z:8192}});
 try{native.syncFromEntities([b,h]);const handles=[native.records.get(1).body.handle,native.records.get(2).body.handle];let accepted=false;
  for(let i=0;i<3600;i++){
   const target=ceresWorkfleetPose({...b.pos,rot:b.rot},{x:-16,z:30,rot:0});
   // Only ordinary membrane thrust is applied after initial construction. No pose,
   // velocity, mass or kinematic setter is used during the physical run.
   driveCeresWorkfleetBody(h,target,{speed:5,totalSpeed:10,accel:8,angularSpeed:.3,angularAccel:.6,
    referenceVelocity:pointVelocity(b,target),referenceAngularVelocity:b.angVel});native.step(1/60);
   if(ready(b,h,ceresWorkfleetPose({...b.pos,rot:b.rot},{x:-16,z:30,rot:0}),true)){accepted=true;break;}
  }
  assert.ok(accepted,JSON.stringify({carrier:b.pos,head:h.pos,vel:h.vel,spin:h.angVel}));assert.equal(b.mass,3200);assert.equal(h.mass,60);
  assert.deepEqual([native.records.get(1).body.handle,native.records.get(2).body.handle],handles);
 }finally{native.dispose();}
});
