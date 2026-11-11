import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { isNinthMouthBodyEligible, ninthMouthRoleForRecord } from '../src/world/ceresNinthMouthBodies.js';
import { domKeyEvent } from '../src/systems/input.js';
import { CERES_NINTH_MOUTH as CUT, worldPoint, localPoint } from '../src/data/ceresNinthMouth.js';
import { ceresNinthMouthStatus } from '../src/systems/ceresNinthMouth.js';
import { applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { masslineFlightRead } from '../src/ui/masslineCadenceReadout.js';
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


// This pilot writes raw keys only. Native physics owns every displacement after
// the single outside-pocket fixture in scene(). A slow Line pull followed by a
// released coast is deliberate: payloads in vacuum do not acquire fake drag.
test('fast counter-pull earned original lamp Seat, original barge rescue, Continue and sector return',async t=>{
 const features=snapshotFeatureMaps();let r;
 try {
  r=await scene();const {rt,s,p,key,step,input,entity,physics,jobs}=r;
  const timing={arrival:s.simTime};let lamp=entity('lamp:0');const original={id:lamp.id,life:lamp.occupantGeneration,identity:lamp.data.ninthMouthIdentity,pos:{...lamp.pos}};
  const motion=e=>({pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel});
  const aim=e=>{input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});input.ingestLaneDomEvent({type:'cursorProjection',x:e.pos.x,z:e.pos.z});step(2);};
  const tap=c=>{key(c,true);step(1);key(c,false);step(6);};
  const clear=()=>{for(const k of ['KeyW','KeyS','KeyQ','KeyE','Digit0'])key(k,false);};
  const move=(x,z,max=3000,limit=10)=>{for(let n=0;n<max;n++){const q=localPoint(p.pos),dx=x-q.x,dz=z-q.z;const vx=Math.max(-limit,Math.min(limit,dx*1.5)),vz=Math.max(-limit,Math.min(limit,dz*1.5));key('KeyS',p.vel.x<vx-1);key('KeyW',p.vel.x>vx+1);key('KeyQ',p.vel.z<vz-1);key('KeyE',p.vel.z>vz+1);key('Digit0',Math.hypot(dx,dz)<3);step(1);if(Math.hypot(dx,dz)<2&&Math.hypot(p.vel.x,p.vel.z)<1)break;}clear();key('Digit0',true);step(120);key('Digit0',false);};
  const choose=action=>{const o=s.ceresNinthMouthOffer;assert.ok(o.choices.some(c=>c.id===action&&!c.disabled));rt.bus.emit('ceresNinthMouth:action',{offerId:o.id,playerLife:o.playerLife,action});};
  if(s.ceresNinthMouthOffer.guidance?.role!=='lamp:0')choose('guide:lamp:0');choose('close');
  move(-160,-45);aim(lamp);tap('KeyF');
  timing.lampAttached=s.simTime;assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,original.id);
  // Denied intent cannot transform an attached, out-of-place original.
  const unsafe=motion(lamp),offer=s.ceresNinthMouthOffer;
  rt.bus.emit('ceresNinthMouth:action',{offerId:offer.id,playerLife:offer.playerLife,action:'seat:0'});
  assert.equal(lamp.data.ninthMouthInstalled,false);assert.deepEqual(motion(lamp),unsafe);

  // Give the original a brisk native impulse, then let it coast while the
  // pilot flies around its path. Reattach from BEHIND, so actual radial Line
  // damping opposes the load's velocity rather than creating tangential orbit.
  key('KeyS',true);key('KeyQ',true);step(6);key('KeyS',false);key('KeyQ',false);key('Digit0',true);step(120);key('Digit0',false);
  assert.equal(s.ceresNinthMouthOffer.guidance.role,'lamp:0');assert.equal(s.ceresNinthMouthOffer.guidance.attached,true);
  assert.equal(masslineFlightRead(s).cue,s.ceresNinthMouthOffer.guidance.instruction);
  tap('KeyF');timing.lampReleased=s.simTime;
  const launchSpeed=Math.hypot(lamp.vel.x,lamp.vel.z);assert.ok(launchSpeed>5,'brisk haul is not the slow-coast workaround');
  move(-180,10,3000,30);
  assert.equal(s.ceresNinthMouthOffer.guidance.stage,'intercept');assert.equal(s.ceresNinthMouthOffer.guidance.entityId,original.id);
  assert.ok(s.ceresNinthMouthOffer.choices.some(c=>c.id==='seat:0'&&c.disabled),'fast released body cannot be seated');
  move(-220,-65,3000,30);
  let rearLatch=false,arrested=false;
  key('Digit0',true);
  for(let n=0;n<3000;n++){
   step(1);const l=localPoint(lamp.pos),v=Math.hypot(lamp.vel.x,lamp.vel.z);
   if(!rearLatch&&l.x>-102){aim(lamp);tap('KeyF');rearLatch=true;timing.rearLatch=s.simTime;assert.equal(s.player.tether.targetId,original.id);}
   if(rearLatch&&v<1){arrested=true;timing.loadArrested=s.simTime;assert.equal(s.ceresNinthMouthOffer.guidance.entityId,original.id);assert.equal(s.ceresNinthMouthOffer.guidance.attached,true);assert.equal(masslineFlightRead(s).cue,s.ceresNinthMouthOffer.guidance.instruction);tap('KeyF');break;}
  }
  assert.ok(arrested,'rear Line removes actual velocity through native forces');assert.equal(s.player.tether.active,false);
  move(-170,0,3000,30);
  let ready=false;
  for(let n=0;n<1200;n++){
   step(1);const l=localPoint(lamp.pos);
   if(Math.hypot(l.x+95,l.z+23)<8&&Math.hypot(lamp.vel.x,lamp.vel.z)<1){ready=true;step(16);break;}
   if(l.x>-80)break;
  }
  assert.ok(ready,'briskly hauled original reaches its mark at real safe native speed');clear();
  const seatedAt=motion(lamp),seat=s.ceresNinthMouthOffer;
  assert.equal(seat.guidance.stage,'seat');assert.equal(seat.guidance.coastEta,null);
  assert.ok(seat.choices.some(c=>c.id==='talk'),'Seat remains available with radio compacted');
  assert.ok(seat?.choices.some(c=>c.id==='seat:0'&&!c.disabled),JSON.stringify(seat));
  rt.bus.emit('ceresNinthMouth:action',{offerId:seat.id,playerLife:seat.playerLife,action:'seat:0'});
  timing.lampSeated=s.simTime;assert.ok(timing.lampSeated-timing.arrival<40,'bounded faster route, not two-minute coast');assert.equal(lamp.data.ninthMouthInstalled,true);assert.deepEqual(motion(lamp),seatedAt,'Seat does not snap or zero velocity');
  step(120);assert.equal(physics._sg02.records.get(lamp.id).body.isFixed(),true);
  assert.equal(lamp.id,original.id);assert.equal(lamp.occupantGeneration,original.life);assert.equal(lamp.data.ninthMouthLight,true);
  assert.ok(Math.hypot(lamp.pos.x-original.pos.x,lamp.pos.z-original.pos.z)>100);
  assert.equal(s.npcJobs.ceresNinthMouth.rescue,null,'lamp never awards rescue');
  t.diagnostic(JSON.stringify({proof:'raw brisk haul, release, rear Line counter-pull, safe release and native Seat',lamp:localPoint(lamp.pos),releaseSpeed:Math.hypot(seatedAt.vel.x,seatedAt.vel.z),nativeFixed:true}));
  // Continue with the same production player and original waiting barge.
  move(-194,0);const barge=entity('barge'),bargeStart={...barge.pos},events=[];rt.bus.on('ceresNinthMouth:rescueCommitted',e=>events.push(e));
  aim(barge);tap('KeyF');assert.equal(s.player.tether.targetId,barge.id);
  key('KeyW',true);for(let n=0;n<1000&&localPoint(p.pos).x>-235;n++)step(1);key('KeyW',false);key('Digit0',true);step(1200);
  if(s.player.tether.active)tap('KeyF');step(180);key('Digit0',false);
  assert.ok(Math.hypot(barge.pos.x-bargeStart.x,barge.pos.z-bargeStart.z)>100);
  timing.bargeReceived=s.simTime;assert.equal(s.npcJobs.ceresNinthMouth.rescue?.count,1);assert.equal(events.length,1);t.diagnostic(JSON.stringify({phaseSimSeconds:timing}));
  const receipt=clone(s.npcJobs.ceresNinthMouth.rescue),before=Object.fromEntries([...CUT.definitions.map(d=>d.role),'barge'].map(role=>[role,motion(entity(role))]));
  const saved=clone(rt.getSystem('save').serialize('earned-ninth-mouth'));
  assert.equal(rt.getSystem('save').loadEnvelope(saved,'earned-ninth-mouth'),true);s.mode='flight';s.ui.docked=false;s.ui.screenStack=[];await physics.prepareBackend(s);
  for(const [role,pose] of Object.entries(before))assert.deepEqual(motion(entity(role)),pose);
  lamp=entity('lamp:0');step(180);assert.equal(lamp.data.ninthMouthInstalled,true);assert.equal(physics._sg02.records.get(lamp.id).body.isFixed(),true);
  assert.deepEqual(s.npcJobs.ceresNinthMouth.rescue,receipt);assert.equal(events.length,1);assert.equal(ceresNinthMouthStatus(jobs).lights,1);
  const world=rt.getSystem('world');world.enterSector('sector_helios_prime',{fromJump:true});step(30);world.enterSector(CUT.sectorId,{fromJump:true});await physics.prepareBackend(s);step(30);
  assert.deepEqual(s.npcJobs.ceresNinthMouth.rescue,receipt);assert.equal(events.length,1);assert.equal(entity('lamp:0').data.ninthMouthInstalled,true);
  for(const role of [...CUT.definitions.map(d=>d.role),'barge']){assert.equal(ninthMouthRoleForRecord(s.world.records.byId[CUT.id+':'+role]),role);assert.equal(isNinthMouthBodyEligible(entity(role)),true);assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthRole===role).length,1);}
  t.diagnostic('One original lamp seated, original barge rescued once, full Continue and sector return preserved both. Other two lamps remain loose originals.');
 }finally{r?.rt.dispose();restoreFeatureMaps(features);}
});
