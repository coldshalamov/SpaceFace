import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {CERES_WORKFLEET_CONTRACT as C,ceresWorkfleetPose} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,ceresWorkfleetHeadReturnTarget,ceresWorkfleetAtPose,driveCeresWorkfleetBody} from '../src/systems/ceresWorkfleet.js';
const make=(role,id,at)=>({id,occupantGeneration:id,...ceresWorkfleetHardwareSpec(role),pos:{x:at.x,z:at.z},rot:at.rot});
const pose=e=>({...e.pos,rot:e.rot});
test('displaced return aligns outside the actual bow before entering the authored corridor',()=>{
 const breaker=make('breaker',1,{x:40,z:-30,rot:.2});
 let head=make('cutterHead',2,ceresWorkfleetPose(pose(breaker),{x:150,z:45,rot:0}));
 const before=JSON.stringify([breaker,head]);let next=ceresWorkfleetHeadReturnTarget(breaker,head,0);
 assert.equal(next.advance,false);assert.deepEqual(next.pose,ceresWorkfleetPose(pose(breaker),C.route.headPosesInBreaker.at(-1)));
 assert.equal(JSON.stringify([breaker,head]),before,'route observation writes no body state');
 head=make('cutterHead',2,ceresWorkfleetPose(pose(breaker),{x:0,z:60,rot:0}));
 next=ceresWorkfleetHeadReturnTarget(breaker,head,0);assert.equal(next.advance,false);
 const escape=ceresWorkfleetPose(pose(breaker),{...C.route.headPosesInBreaker.at(-1),z:60});
 assert.ok(Math.hypot(next.pose.x-escape.x,next.pose.z-escape.z)<1e-9,'an exterior head clears forward without a diagonal rail crossing');
 for(let i=0;i<3;i++){
  head=make('cutterHead',2,ceresWorkfleetPose(pose(breaker),{x:155,z:0,rot:0}));next=ceresWorkfleetHeadReturnTarget(breaker,head,i);
  assert.equal(next.advance,true);assert.deepEqual(next.pose,ceresWorkfleetPose(pose(breaker),C.route.headPosesInBreaker[2-i]));
 }
});
for(const frame of [{x:0,z:0,rot:0},{x:40,z:-30,rot:.2}])test(`real native return preserves both bodies and follows the moving carrier frame (${frame.rot})`,async()=>{
 const breaker=make('breaker',1,frame),head=make('cutterHead',2,ceresWorkfleetPose(frame,{x:150,z:45,rot:0}));
 const native=await createSg02DynamicBodyOwner({publishTelemetry:false});
 try{
  native.syncFromEntities([breaker,head]);const handles=[native.records.get(1).body.handle,native.records.get(2).body.handle];const nativeMass=native.records.get(2).body.mass();let index=0,peakCarrierTravel=0;
  for(let i=0;i<10000&&index<3;i++){
   const next=ceresWorkfleetHeadReturnTarget(breaker,head,index);driveCeresWorkfleetBody(head,next.pose,{speed:5,accel:8,angularSpeed:.3,angularAccel:.6});
   driveCeresWorkfleetBody(breaker,frame,{speed:.5,accel:.1});native.step(1/60);
   peakCarrierTravel=Math.max(peakCarrierTravel,Math.hypot(breaker.pos.x-frame.x,breaker.pos.z-frame.z));
   if(next.advance&&ceresWorkfleetAtPose(head,next.pose))index++;
  }
  assert.equal(index,3);assert.ok(peakCarrierTravel<.2,'return cannot press the carrier sideways through its own rail');
  assert.deepEqual([native.records.get(1).body.handle,native.records.get(2).body.handle],handles);
  assert.equal(native.records.get(2).body.mass(),nativeMass);assert.equal(native.records.get(2).spec.mass,60);assert.equal(head.mass,60);assert.equal(breaker.mass,3200);
 }finally{native.dispose();}
});
