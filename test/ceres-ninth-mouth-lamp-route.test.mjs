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
// Negative route: do not call an angled, moving tow a completed lamp placement.
// The only initial fixture is a Pelican outside the existing production pocket.
// After admission every displacement below comes from raw flight/Line input.
test('rushed native lamp tow refuses Seat and Continue preserves the loose original',async t=>{
 const features=snapshotFeatureMaps();let r;
 try {
  r=await scene();const {rt,s,p,physics,input,key,step,entity}=r;
  let lamp=entity('lamp:0');const start={...lamp.pos},id=lamp.id,life=lamp.occupantGeneration;
  const identity=lamp.data.ninthMouthIdentity;
  const motion=e=>({pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel});
  key('KeyE',true);step(30);key('KeyE',false);key('Digit0',true);step(120);key('Digit0',false);
  input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});
  input.ingestLaneDomEvent({type:'cursorProjection',x:lamp.pos.x,z:lamp.pos.z});step(2);
  key('KeyF',true);step(1);key('KeyF',false);step(6);
  assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,id);
  key('BracketLeft',true);key('Digit0',true);step(180);key('BracketLeft',false);key('Digit0',false);
  key('KeyS',true);step(50);key('KeyS',false);key('Digit0',true);step(1200);key('Digit0',false);
  assert.equal(lamp.id,id);assert.equal(lamp.occupantGeneration,life);
  const moved=Math.hypot(lamp.pos.x-start.x,lamp.pos.z-start.z);assert.ok(moved>100);
  assert.equal(lamp.data.ninthMouthLight,true,'original lamp stays lit while moving');
  key('KeyF',true);step(1);key('KeyF',false);step(20);
  assert.equal(s.player.tether.active,false);
  const offer=s.ceresNinthMouthOffer;
  assert.ok(offer?.choices.some(c=>c.id==='seat:0'&&c.disabled),'rushed placement must not advertise ready');
  const before=motion(lamp);
  rt.bus.emit('ceresNinthMouth:action',{offerId:offer.id,playerLife:offer.playerLife,action:'seat:0'});
  assert.equal(lamp.data.ninthMouthInstalled,false);assert.equal(lamp.physicsBody.dynamic,true);
  assert.deepEqual(motion(lamp),before,'refused intent must not snap, damp or replace the original');
  assert.equal(s.npcJobs.ceresNinthMouth.rescue,null);
  const snapshot=clone(rt.getSystem('save').serialize('ninth-mouth-rushed-lamp'));
  assert.equal(ninthMouthRoleForRecord(s.world.records.byId[identity]),'lamp:0');
  assert.equal(rt.getSystem('save').loadEnvelope(snapshot,'ninth-mouth-rushed-lamp'),true);
  s.mode='flight';s.ui.docked=false;s.ui.screenStack=[];await physics.prepareBackend(s);
  lamp=entity('lamp:0');assert.ok(lamp);
  assert.equal(lamp.data.ninthMouthIdentity,identity);assert.deepEqual(motion(lamp),before);
  assert.equal(lamp.data.ninthMouthInstalled,false);assert.equal(lamp.data.ninthMouthLight,true);
  assert.equal(isNinthMouthBodyEligible(lamp),true);
  step(180);
  assert.ok(physics._sg02.records.get(lamp.id)?.body.isDynamic());
  assert.equal(s.entityList.filter(e=>e.alive&&e.data?.ninthMouthIdentity===identity).length,1);
  assert.equal(s.npcJobs.ceresNinthMouth.rescue,null);
  t.diagnostic(JSON.stringify({proof:'raw-input negative placement and full loose-original Continue',moved,atRelease:localPoint(before.pos),speedAtRelease:Math.hypot(before.vel.x,before.vel.z)}));
 }finally{r?.rt.dispose();restoreFeatureMaps(features);}
});
