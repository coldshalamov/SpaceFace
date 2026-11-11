import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { isNinthMouthBodyEligible, ninthMouthRoleForRecord } from '../src/world/ceresNinthMouthBodies.js';
import { domKeyEvent } from '../src/systems/input.js';
import { CERES_NINTH_MOUTH as CUT, worldPoint, localPoint } from '../src/data/ceresNinthMouth.js';
import { ceresNinthMouthStatus } from '../src/systems/ceresNinthMouth.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
const clone=v=>JSON.parse(JSON.stringify(v));
async function scene() {
 const rt=createAuthoritativeRuntime({profileId:'production',nodeSafeOnly:true,seed:47});
 applyFeatureConfigToMaps(rt.config.features);
 const s=rt.state;s.mode='flight';s.run.kind='adventure';s.ui.screenStack=[];s.world.currentSectorId=CUT.sectorId;
 rt.getSystem('ships').newGame();
 const p=rt.spawn(makeShipEntitySpec('ship_pelican',{isPlayer:true,player:s.player,team:0,pos:worldPoint({x:-900,z:0}),fittings:[]}));
 p.rot=Math.PI;s.playerId=p.id;
 const physics=rt.getSystem('physics');await physics.prepareBackend(s);
 const input=rt.getSystem('input'); input.ingestLaneDomEvent({type:'viewport',width:640,height:480});
 const step=n=>{for(let i=0;i<n;i++)rt.step(1/60);};
 const key=(code,pressed)=>domKeyEvent(input,{code,pressed,blocked:false,repeat:false});
 const entity=role=>s.entityList.find(e=>e.alive&&e.data?.ninthMouthRole===role);
 step(60);
 // Let existing player-relative services settle before flying into the authored pocket.
 key('KeyS',true); for(let n=0;n<1800 && localPoint(p.pos).x < -240;n++)step(1);key('KeyS',false);
 key('Digit0',true);step(240);key('Digit0',false);step(60);
 return {rt,s,p,physics,input,step,key,entity,jobs:rt.getSystem('npcJobsRuntime')};
}
test('production admission and real Line tow of the original rescue barge',async t=>{
 const features=snapshotFeatureMaps();let r;
 try {
  r=await scene(); const {rt,s,p,input,key,step,entity,jobs}=r;
  assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthIdentity).length,8);
  const barge=entity('barge');assert.ok(barge); assert.ok(s.ceresNinthMouthOffer);
  const start={...barge.pos}, events=[];rt.bus.on('ceresNinthMouth:rescueCommitted',e=>events.push(e));
  input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
  input.ingestLaneDomEvent({type:'cursorProjection',x:barge.pos.x,z:barge.pos.z});step(2);
  key('KeyF',true);step(1);key('KeyF',false);step(6);
  t.diagnostic('Initial '+JSON.stringify({player:localPoint(p.pos),barge:localPoint(barge.pos),lineActive:s.player.tether.active,mass:barge.mass}));
  assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,barge.id);
  key('KeyW',true);for(let n=0;n<1000 && localPoint(p.pos).x > -235;n++)step(1);key('KeyW',false);
  key('Digit0',true);step(1200);
  t.diagnostic('Settled '+JSON.stringify({player:localPoint(p.pos),barge:localPoint(barge.pos),v:barge.vel,lineActive:s.player.tether.active}));
  if(s.player.tether.active){key('KeyF',true);step(1);key('KeyF',false);}step(180);key('Digit0',false);
  const moved=distance(start,barge.pos);
  t.diagnostic('Tow '+JSON.stringify({moved,player:localPoint(p.pos),barge:localPoint(barge.pos),v:barge.vel,status:ceresNinthMouthStatus(jobs),lineActive:s.player.tether.active}));
  assert.ok(moved>100,'original body moved through native Line');
  assert.equal(s.npcJobs.ceresNinthMouth.rescue?.count,1,'original arrives released and settled through raw Line controls');
  assert.equal(events.length,1);
  const receipt=clone(s.npcJobs.ceresNinthMouth.rescue);
  const snapshot=clone(rt.getSystem('save').serialize('ninth-mouth-arrival'));
  for(const role of [...CUT.definitions.map(d=>d.role),'barge']) assert.equal(ninthMouthRoleForRecord(s.world.records.byId[CUT.id+':'+role]),role,'production world capture owns '+role);
  const before={pos:{x:barge.pos.x,z:barge.pos.z},vel:{x:barge.vel.x,z:barge.vel.z},rot:barge.rot};
  assert.equal(rt.getSystem('save').loadEnvelope(snapshot,'ninth-mouth-arrival'),true);
  s.mode='flight';s.ui.docked=false;s.ui.screenStack=[];await r.physics.prepareBackend(s);
  const restored=entity('barge');assert.ok(restored);
  assert.deepEqual({pos:{x:restored.pos.x,z:restored.pos.z},vel:{x:restored.vel.x,z:restored.vel.z},rot:restored.rot},before);
  step(180);
  assert.deepEqual(s.npcJobs.ceresNinthMouth.rescue,receipt);
  assert.equal(events.length,1,'Continue cannot emit another arrival');
  assert.equal(ceresNinthMouthStatus(jobs).rescuedBarges,1);
  assert.ok(s.ceresNinthMouthOffer?.detail.includes('original barge reached'));
  for(const role of [...CUT.definitions.map(d=>d.role),'barge']) {assert.equal(ninthMouthRoleForRecord(s.world.records.byId[CUT.id+':'+role]),role);assert.equal(isNinthMouthBodyEligible(entity(role)),true);}
  assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthRole==='barge').length,1);
  const world=rt.getSystem('world'), atDeparture={...restored.pos};
  world.enterSector('sector_helios_prime',{fromJump:true});step(30);
  world.enterSector(CUT.sectorId,{fromJump:true});await r.physics.prepareBackend(s);step(30);
  const returned=entity('barge');assert.ok(returned,'sector return rematerializes the original barge');
  assert.ok(distance(returned.pos,atDeparture)<10,'return keeps real outcome, not authored spawn pose');
  assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthRole==='barge').length,1);
  assert.deepEqual(s.npcJobs.ceresNinthMouth.rescue,receipt);
  assert.equal(events.length,1);
  for(const role of [...CUT.definitions.map(d=>d.role),'barge']) {assert.equal(ninthMouthRoleForRecord(s.world.records.byId[CUT.id+':'+role]),role);assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthRole===role).length,1);}
  t.diagnostic('Continue and sector-return preserved original identity, pose and one receipt');
 } finally { r?.rt.dispose();restoreFeatureMaps(features); }
});
function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z);}


test('real lamp Line motion; staged native Seat survives ticks and Continue, then Unbolt restores towable body',async t=>{
 const features=snapshotFeatureMaps();let r;
 try {
  r=await scene();const {rt,s,p,physics,input,key,step,entity}=r;
  const motion=e=>({pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel});
  let lamp=entity('lamp:0');const life=lamp.occupantGeneration,id=lamp.id,initial={...lamp.pos};
  const aim=()=>{
   input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
   input.ingestLaneDomEvent({type:'cursorProjection',x:lamp.pos.x,z:lamp.pos.z});step(2);
  };
  const latch=()=>{aim();key('KeyF',true);step(1);key('KeyF',false);step(6);
   assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,lamp.id);};
  const choose=action=>{const offer=s.ceresNinthMouthOffer;
   assert.ok(offer?.choices.some(c=>c.id===action&&!c.disabled),JSON.stringify(offer));
   rt.bus.emit('ceresNinthMouth:action',{offerId:offer.id,playerLife:offer.playerLife,action});};
  const posture=fixed=>{
   const row=physics._sg02.records.get(lamp.id);assert.ok(row,'lamp retains its native collider after every normal tick');
   assert.equal(row.entity,lamp);assert.equal(row.body.isFixed(),fixed);assert.equal(row.body.isDynamic(),!fixed);
   assert.ok(row.colliders.length>0);for(const collider of row.colliders) assert.equal(physics._sg02.world.getCollider(collider.handle),collider);
   assert.equal(lamp.physicsBody.dynamic,!fixed);assert.equal(lamp.data.ninthMouthInstalled,fixed);
   assert.equal(s.entityIndex.physicsStatics.includes(lamp),fixed);
   assert.equal(s.entityIndex.physicsDynamics.includes(lamp),!fixed);
   assert.equal(lamp.mass,8);assert.equal(isNinthMouthBodyEligible(lamp),true);
  };
  latch();key('KeyS',true);step(120);key('KeyS',false);key('Digit0',true);step(180);
  const moved=distance(initial,lamp.pos);assert.ok(moved>5);assert.equal(lamp.id,id);assert.equal(lamp.occupantGeneration,life);
  t.diagnostic(JSON.stringify({proof:'raw-input lamp acquisition and motion, not complete seating route',moved}));
  if(s.player.tether.active){key('KeyF',true);step(1);key('KeyF',false);}key('Digit0',false);
  // Separate native-posture fixture: deliberately staged positions are NOT
  // evidence of an ordinary player route to the mark. Production actions below
  // must maintain the original collider, never repair it by moving a result pose.
  const origin=physics._sg02._frameOrigin||{x:0,z:0},at=worldPoint(CUT.lamps[0].local);
  for(const [e,where] of [[lamp,at],[p,{x:at.x-50,z:at.z+30}]]){
   const body=physics._sg02.records.get(e.id).body;
   body.setTranslation({x:where.x-origin.x,y:0,z:where.z-origin.z},true);
   body.setLinvel({x:0,y:0,z:0},true);body.setAngvel({x:0,y:0,z:0},true);
  }
  step(60);posture(false);
  const before=motion(lamp);choose('seat:0');
  assert.deepEqual(motion(lamp),before,'Seat writes no pose or velocity');
  for(const ticks of [1,1,1,30,120]){step(ticks);posture(true);assert.ok(distance(lamp.pos,before.pos)<.1);}
  assert.ok(s.ceresNinthMouthOffer.choices.some(c=>c.id==='unseat:0'&&!c.disabled));
  const saved=clone(rt.getSystem('save').serialize('ninth-mouth-seated-light'));
  assert.equal(rt.getSystem('save').loadEnvelope(saved,'ninth-mouth-seated-light'),true);
  s.mode='flight';s.ui.docked=false;s.ui.screenStack=[];await physics.prepareBackend(s);
  lamp=entity('lamp:0');assert.ok(lamp);
  for(const ticks of [1,1,1,30,120]){step(ticks);posture(true);assert.ok(distance(lamp.pos,before.pos)<.1);}
  assert.equal(lamp.data.ninthMouthLight,true);
  const seatedPose=motion(lamp);choose('unseat:0');
  assert.deepEqual(motion(lamp),seatedPose,'Unbolt writes no pose or velocity');
  for(const ticks of [1,1,1,30,120]){step(ticks);posture(false);}
  const unboltedStart={...lamp.pos};latch();key('KeyW',true);step(120);key('KeyW',false);key('Digit0',true);step(180);key('Digit0',false);
  posture(false);const movedAfterUnbolt=distance(unboltedStart,lamp.pos);assert.ok(movedAfterUnbolt>5,'Unbolt restores actual native Line motion');
  assert.equal(s.npcJobs.ceresNinthMouth.rescue,null,'lamp work cannot award a barge arrival');
  const looseMotion=motion(lamp);
  const looseSaved=clone(rt.getSystem('save').serialize('ninth-mouth-unbolted-light'));
  assert.equal(rt.getSystem('save').loadEnvelope(looseSaved,'ninth-mouth-unbolted-light'),true);
  s.mode='flight';s.ui.docked=false;s.ui.screenStack=[];await physics.prepareBackend(s);lamp=entity('lamp:0');
  assert.deepEqual(motion(lamp),looseMotion);step(3);posture(false);
  assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthRole==='lamp:0').length,1);
  t.diagnostic(JSON.stringify({proof:'staged native Seat/Continue/Unbolt posture plus real Line after Unbolt',movedAfterUnbolt,mass:lamp.mass,light:lamp.data.ninthMouthLight}));
 } finally { r?.rt.dispose();restoreFeatureMaps(features); }
});
