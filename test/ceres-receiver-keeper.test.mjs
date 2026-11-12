import test from 'node:test';
import assert from 'node:assert/strict';
import {createSg02DynamicBodyOwner} from '../src/core/sg02DynamicBodyOwner.js';
import {queuePhysicsImpulse,queuePhysicsTorqueImpulse} from '../src/core/physicsAuthority.js';
import {CERES_WORKFLEET_CONTRACT as C} from '../src/data/ceresWorkfleet.js';
import {ceresWorkfleetHardwareSpec,ceresWorkfleetSocket} from '../src/systems/ceresWorkfleet.js';
import {ATTACHMENT_DEFS} from '../src/data/combatDefs.js';
import {segmentHitsProxy} from '../src/combat/lineOfSight.js';
const DT=1/60,def=ATTACHMENT_DEFS.find(d=>d.id==='attachment_transport_clamp');
async function fixture({open=false,offset=0,velocity=0}={}){
 const cradle={id:1,occupantGeneration:1,...ceresWorkfleetHardwareSpec('cradle')};
 cradle.data.ceresWorkfleetSlide=open?0:1;cradle.data.ceresWorkfleetSlideTarget=1;
 const radius=C.existing.section.radius,mass=1800;
 const section={id:2,occupantGeneration:2,type:'wreck',alive:true,hull:1000,pos:{x:cradle.pos.x,z:cradle.pos.z+offset},vel:{x:0,z:velocity},rot:0,angVel:0,radius,mass,collides:true,
  data:{worldRecordId:C.identities.payload,worldSiteId:C.siteId,worldSitePayloadId:'long_plate',worldSiteStructural:true,persistenceOwner:'asteroidSites'},
  physicsBody:{schemaVersion:1,dynamic:true,radius,mass,inertiaY:mass*(34**2+55**2)/3,ccd:true,revision:0,material:'wreck',
   collisionProxyManifest:{schemaVersion:1,id:`world-site-structure:${C.identities.payload}`,referenceRadius:'radius',primitives:C.existing.section.boxes.map((b,i)=>({kind:'obb',id:`matched-section-${i}`,x:b.center.x/radius,z:b.center.z/radius,hx:b.size.x/2/radius,hz:b.size.z/2/radius,angle:0}))}}};
 const owner=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT,frameOrigin:{...cradle.pos}});owner.syncFromEntities([cradle,section]);
 assert.ok(owner.createAttachment({attachmentId:'receiver',defId:def.id,ownerId:1,targetId:2,sourceWorld:ceresWorkfleetSocket(cradle,'cradle','SOCKET_Service_Head'),targetWorld:ceresWorkfleetSocket(section,'section','SOCKET_Cut_B'),restLength:8,spring:def.spring,break:def.break,tick:0}));
 return {owner,cradle,section};
}
function distance(h){return Math.hypot(h.section.pos.x-h.cradle.pos.x,h.section.pos.z-h.cradle.pos.z);}
function assertOriginal(h){assert.equal(h.section.mass,1800);assert.equal(h.owner.records.get(2).body.mass(),1800);assert.equal(h.owner.records.get(2).colliders.length,5);assert.equal(h.owner.records.get(1).colliders.length,11);assert.equal(h.owner.attachments.get('receiver').target.entity,h.section);}
async function continueSemantic(h){
 const a=h.owner.attachments.get('receiver'),saved=JSON.parse(JSON.stringify({cradle:h.cradle,section:h.section,line:{attachmentId:'receiver',defId:a.defId,ownerId:1,targetId:2,sourceAnchorLocal:a.anchorA,targetAnchorLocal:a.anchorB,restLength:a.restLength,spring:def.spring,break:def.break,springState:a.springState}}));
 // JSON saves intentionally canonicalize signed zero; compare the exact wire momentum.
 const before=JSON.parse(JSON.stringify({pos:{...h.section.pos},vel:{...h.section.vel},rot:h.section.rot,angVel:h.section.angVel}));h.owner.dispose();
 h.cradle=saved.cradle;h.section=saved.section;h.cradle.occupantGeneration+=10;h.section.occupantGeneration+=10;
 h.owner=await createSg02DynamicBodyOwner({publishTelemetry:false,fixedDt:DT,frameOrigin:{...h.cradle.pos}});h.owner.syncFromEntities([h.cradle,h.section]);assert.ok(h.owner.createAttachment(saved.line));
 assert.deepEqual({pos:{...h.section.pos},vel:{...h.section.vel},rot:h.section.rot,angVel:h.section.angVel},before,'semantic restore never repairs pose or momentum');
}
test('fixed keeper faces match the source boxes and leave the full central fairlead channel clear',async()=>{
 const h=await fixture();try{
  const boxes=C.assets.cradle.states.open.boxes.filter(b=>b.id.startsWith('depth_keeper_'));assert.equal(boxes.length,2);
  assert.deepEqual(boxes.map(b=>[b.center.x-b.size.x/2,b.center.x+b.size.x/2,b.center.z-b.size.z/2,b.center.z+b.size.z/2]),[[-10,-4,56.5,65],[4,10,56.5,65]]);
  const c=h.owner.records.get(1);h.owner.world.propagateModifiedBodyPositionsToColliders();
  for(const x of [-7,-3.99,0,3.99,7]){
   const expected=Math.abs(x)>4,ray=new h.owner.RAPIER.Ray({x,y:0,z:55},{x:0,y:0,z:1});
   assert.equal(c.colliders.some(c=>c.castRay(ray,8,true)>=0),expected);
   assert.equal(segmentHitsProxy(h.cradle,{x:h.cradle.pos.x+x,z:h.cradle.pos.z+55},{x:h.cradle.pos.x+x,z:h.cradle.pos.z+63}),expected);
  }
 }finally{h.owner.dispose();}
});
test('both signed residual velocities and planar impulses remain physically inside the unchanged2WU receiver envelope',async()=>{
 const cases=[{velocity:.05},{velocity:-.05},{x:0,z:90},{x:0,z:-90},{x:90,z:0},{x:-90,z:0},{x:64,z:64},{x:-64,z:64},{x:64,z:-64},{x:-64,z:-64},{x:0,z:90,torque:500},{x:0,z:-90,torque:-500}];
 for(const trial of cases){const h=await fixture({velocity:trial.velocity||0});try{
  if(trial.x||trial.z)queuePhysicsImpulse(h.section,{x:trial.x||0,y:0,z:trial.z||0});
  if(trial.torque)queuePhysicsTorqueImpulse(h.section,{x:0,y:trial.torque,z:0});
  let max=0;for(let i=0;i<18000;i++){h.owner.step(DT);max=Math.max(max,distance(h));}
  assert.ok(max<=2,JSON.stringify({trial,max,position:h.section.pos}));assertOriginal(h);
 }finally{h.owner.dispose();}}
});
test('long retained motion survives native rebasing and three fresh-life semantic Continues without repair',async()=>{
 const h=await fixture();try{
  queuePhysicsImpulse(h.section,{x:20,y:0,z:90});let max=0;
  for(let i=0;i<18000;i++){
   h.owner.step(DT);max=Math.max(max,distance(h));
   if(i===1200)h.owner.setFrameOrigin({x:-12288,z:8192},1);
   if([3000,6000,9000].includes(i)){await continueSemantic(h);assertOriginal(h);}
  }
  assert.ok(max<=2,JSON.stringify({max,position:h.section.pos}));assert.equal(h.section.occupantGeneration,32);assertOriginal(h);
 }finally{h.owner.dispose();}
});
test('a real obstruction stops the swept pads and removal permits the same original body to be retained',async()=>{
 const h=await fixture({open:true});try{
  const obstacle={id:3,occupantGeneration:3,type:'wreck',alive:true,collides:true,hull:100,mass:100,radius:5,pos:{x:h.cradle.pos.x+50,z:h.cradle.pos.z},vel:{x:0,z:0},rot:0,data:{worldRecordId:'proof:obstruction'},physicsBody:{schemaVersion:1,dynamic:false,radius:5,mass:100,shape:'ball',useMeasuredSkin:false,material:'wreck'}};
  h.owner.syncFromEntities([h.cradle,h.section,obstacle]);for(let i=0;i<240;i++)h.owner.step(DT);
  assert.equal(h.cradle.data.ceresWorkfleetSlideBlocked,true);assert.equal(h.cradle.data.ceresWorkfleetSlideBlocker,'proof:obstruction');assert.ok(h.cradle.data.ceresWorkfleetSlide<.5);
  obstacle.alive=false;h.owner.syncFromEntities([h.cradle,h.section]);for(let i=0;i<240;i++)h.owner.step(DT);
  assert.ok(h.cradle.data.ceresWorkfleetSlide>.99);assertOriginal(h);
 }finally{h.owner.dispose();}
});
test('cutting the remaining receiver line removes its negative-Z retention and preserves the released body momentum',async()=>{
 const h=await fixture();try{
  const before={...h.section.vel};assert.equal(h.owner.cutAttachment({attachmentId:'receiver',reason:'owner_cut'}),true);assert.deepEqual(h.section.vel,before);
  queuePhysicsImpulse(h.section,{x:0,y:0,z:-90});for(let i=0;i<12000;i++)h.owner.step(DT);
  assert.ok(h.section.pos.z<h.cradle.pos.z-2,'loss remains a real failed retention, never a hidden constraint');assert.equal(h.section.mass,1800);assert.equal(h.owner.attachments.size,0);
 }finally{h.owner.dispose();}
});
