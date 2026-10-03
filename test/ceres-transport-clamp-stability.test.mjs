import test from 'node:test';
import assert from 'node:assert/strict';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { ceresWorkfleetHardwareSpec, ceresWorkfleetWorldPose, ceresWorkfleetSocket, driveCeresWorkfleetBody } from '../src/systems/ceresWorkfleet.js';
import { CERES_WORKFLEET_CONTRACT as C, ceresWorkfleetPose } from '../src/data/ceresWorkfleet.js';
import { ATTACHMENT_DEFS } from '../src/data/combatDefs.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
const DT=1/60,definition=ATTACHMENT_DEFS.find(d=>d.id==='attachment_transport_clamp');
async function fixture({maxForce=Infinity,forceScale=1}={}) {
  const breaker={id:1,occupantGeneration:1,...ceresWorkfleetHardwareSpec('breaker')};
  const head={id:2,occupantGeneration:2,...ceresWorkfleetHardwareSpec('cutterHead')};
  breaker.data.jobId=head.data.jobId='job:ceres:second_measure:long_plate';
  const owner=await createSg02DynamicBodyOwner({publishTelemetry:false});
  owner.setFrameOrigin({x:-12288,z:8192},1);owner.syncFromEntities([breaker,head]);
  owner.createAttachment({attachmentId:'mount',defId:definition.id,ownerId:2,targetId:1,
    sourceWorld:ceresWorkfleetSocket(head,'cutterHead','SOCKET_Mount'),targetWorld:ceresWorkfleetSocket(breaker,'breaker','SOCKET_Cutter_Dock'),
    restLength:.026060374168755757,spring:{...definition.spring,maxForce},forceScale,break:definition.break});
  return {owner,breaker,head};
}
function energy({owner,breaker,head}) {
  const kinetic=[breaker,head].reduce((sum,e)=>{const r=owner.records.get(e.id),v=r.body.linvel(),w=r.body.angvel();
    return sum+.5*r.body.mass()*(v.x*v.x+v.z*v.z)+.5*r.body.principalInertia().y*w.y*w.y;},0);
  const line=owner.getAttachmentTelemetry({attachmentId:'mount'});
  // Evaluate kinetic and elastic terms at the SAME post-step pose, not the previous
  // spring pass's saved potential. This fixture has no reel work.
  return {kinetic,total:kinetic+.5*definition.spring.K*Math.max(0,line.distance-line.restLength)**2};
}
async function run({kick=500,angle=0,torque=0,controls=false,contacts=true,continueAt=null}={}) {
  let h=await fixture(),peak=0,peakKinetic=0,openingEnergy=0,tailSpeed=0,tailError=0,restored=false;
  const inputEnergy=kick*kick/(2*h.head.mass)+torque*torque/(2*h.head.physicsBody.inertiaY);
  try {
    if(!contacts)for(const c of h.owner.records.get(h.head.id).colliders)c.setCollisionGroups(0);
    for(let i=0;i<1800;i++) {
      if(i===60){queuePhysicsImpulse(h.head,{x:kick*Math.cos(angle),z:kick*Math.sin(angle)},{source:'clamp-disturbance-proof'});
        if(torque)queuePhysicsTorqueImpulse(h.head,{y:torque},{source:'clamp-disturbance-proof'});}
      const target=ceresWorkfleetPose({...h.breaker.pos,rot:h.breaker.rot},C.assets.breaker.headMountedPose);
      if(controls){driveCeresWorkfleetBody(h.breaker,ceresWorkfleetWorldPose(C.route.breakerWorkPose),{speed:.5,accel:.2,angularSpeed:.035,angularAccel:.025});
        driveCeresWorkfleetBody(h.head,target,{speed:10,accel:8,angularSpeed:.3,angularAccel:.6});}
      h.owner.step(DT);const measured=energy(h);
      if(i===60)openingEnergy=measured.total;
      if(i>=60){peak=Math.max(peak,measured.total);peakKinetic=Math.max(peakKinetic,measured.kinetic);}
      if(i>1500){tailSpeed=Math.max(tailSpeed,Math.hypot(h.head.vel.x,h.head.vel.z));tailError=Math.max(tailError,Math.hypot(h.head.pos.x-target.x,h.head.pos.z-target.z));}
      if(i===continueAt){
        const line=h.owner.attachments.get('mount');
        const saved=JSON.parse(JSON.stringify({breaker:h.breaker,head:h.head,line:{attachmentId:'mount',defId:line.defId,ownerId:2,targetId:1,
          sourceAnchorLocal:line.anchorA,targetAnchorLocal:line.anchorB,restLength:line.restLength,spring:definition.spring,break:definition.break,springState:line.springState}}));
        h.owner.dispose();h={breaker:saved.breaker,head:saved.head,owner:await createSg02DynamicBodyOwner({publishTelemetry:false})};
        h.breaker.occupantGeneration=3;h.head.occupantGeneration=4;
        h.owner.setFrameOrigin({x:-12288,z:8192},1);h.owner.syncFromEntities([h.breaker,h.head]);
        const before={head:{...h.head.vel},breaker:{...h.breaker.vel},headSpin:h.head.angVel,breakerSpin:h.breaker.angVel};
        assert.ok(h.owner.createAttachment(saved.line));
        assert.deepEqual({head:{...h.head.vel},breaker:{...h.breaker.vel},headSpin:h.head.angVel,breakerSpin:h.breaker.angVel},before,'restore must not repair momentum');
        if(!contacts)for(const c of h.owner.records.get(h.head.id).colliders)c.setCollisionGroups(0);
        restored=true;
      }
    }
    return {inputEnergy,openingEnergy,peak,peakKinetic,tailSpeed,tailError,restored};
  }finally{h.owner.dispose();}
}

test('off-center clamp does not amplify a free isolated disturbance across 24 planar impulse cases',async()=>{
  for(const angle of Array.from({length:8},(_,i)=>i*Math.PI/4))for(const kick of [100,500,2000]) {
    const r=await run({angle,kick,contacts:false});
    assert.ok(r.peakKinetic<=r.inputEnergy*1.00001,JSON.stringify({angle,kick,...r}));
    assert.ok(r.peak<=r.openingEnergy*1.00001,JSON.stringify({angle,kick,...r}));
    // The imposed impulse's first 60 Hz advance stores <0.3% in the compliant spring.
    assert.ok(r.openingEnergy<=r.inputEnergy*1.003,JSON.stringify({angle,kick,...r}));
  }
});
test('unchanged real compound contacts and bounded actuators settle 24 mount disturbances',async()=>{
  for(const angle of Array.from({length:8},(_,i)=>i*Math.PI/4))for(const kick of [100,500,2000]) {
    const r=await run({angle,kick,controls:true,contacts:true});
    assert.ok(r.tailSpeed<.04,JSON.stringify({angle,kick,...r}));assert.ok(r.tailError<.06,JSON.stringify({angle,kick,...r}));
  }
});
test('pure angular impulses do not create unpowered contact-free clamp energy',async()=>{
  for(const torque of [-2000,-500,-100,100,500,2000]) {
    const r=await run({kick:0,torque,contacts:false});
    assert.ok(r.peakKinetic<=r.inputEnergy*1.00001,JSON.stringify({torque,...r}));
    assert.ok(r.peak<=r.openingEnergy*1.00001,JSON.stringify({torque,...r}));
  }
});
test('earned off-center coupling survives semantic Continue without velocity repair and settles',async()=>{
  for(const continueAt of [61,120,300]) {
    const r=await run({kick:500,controls:true,contacts:true,continueAt});
    assert.equal(r.restored,true);assert.ok(r.tailSpeed<.04,JSON.stringify(r));assert.ok(r.tailError<.06,JSON.stringify(r));
  }
});

test('finite off-center clamp force caps bind the final applied impulse, including forceScale',async()=>{
  for(const maxForce of [20,100,1000])for(const forceScale of [0,.25,1,4]) {
    const h=await fixture({maxForce,forceScale});try{
      for(const c of h.owner.records.get(h.head.id).colliders)c.setCollisionGroups(0);
      queuePhysicsImpulse(h.head,{x:2000,z:1000},{source:'finite-clamp-cap-proof'});
      for(let i=0;i<300;i++){
        h.owner.step(DT);const rec=h.owner.records.get(h.head.id),line=h.owner.attachments.get('mount');
        assert.ok(Math.hypot(rec.appliedForce.x,rec.appliedForce.z)<=maxForce+1e-6,JSON.stringify({maxForce,forceScale,force:rec.appliedForce}));
        assert.ok(line.springState.lastImpulse<=maxForce*DT+1e-6);
      }
    }finally{h.owner.dispose();}
  }
});
