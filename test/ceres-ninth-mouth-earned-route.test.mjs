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
 // The Line, winch, brake and strafe are rebindable flight verbs; seat the keys this run taps.
 s.settings.controls.bindings={tether:['KeyF'],brake:['Digit0'],reelIn:['BracketLeft'],reelOut:['BracketRight'],strafeLeft:['KeyQ'],strafeRight:['KeyE'],contextWheel:[],interact:[]};
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
test('earned original lamp Seat, original barge rescue, Continue and sector return',async t=>{
 const features=snapshotFeatureMaps();let r;
 try {
  r=await scene();const {rt,s,p,key,step,input,entity,physics,jobs}=r;
  const timing={arrival:s.simTime};let lamp=entity('lamp:0');const original={id:lamp.id,life:lamp.occupantGeneration,identity:lamp.data.ninthMouthIdentity,pos:{...lamp.pos}};
  const rock=entity('fallen_rock'),barge0=entity('barge');let rockShiftDiag=null,bargeHit=null,prevBvx=barge0.vel.x,prevBvz=barge0.vel.z;
  const watchRock=()=>{
   if(!rockShiftDiag&&s.npcJobs?.ceresNinthMouth?.rockShifted){rockShiftDiag={t:s.simTime,rock:localPoint(rock.pos),vel:{x:rock.vel.x,z:rock.vel.z},
    near:s.entityList.filter(e=>e!==rock&&e.alive&&Math.hypot(e.pos.x-rock.pos.x,e.pos.z-rock.pos.z)<80).map(e=>({type:e.type,name:e.data?.name||e.name,d:+Math.hypot(e.pos.x-rock.pos.x,e.pos.z-rock.pos.z).toFixed(1),vx:+e.vel.x.toFixed(2),vz:+e.vel.z.toFixed(2)}))};}
   if(!bargeHit&&Math.hypot(barge0.vel.x-prevBvx,barge0.vel.z-prevBvz)>.3){const near=e=>e!==barge0&&e.alive&&Math.hypot(e.pos.x-barge0.pos.x,e.pos.z-barge0.pos.z)<120;
    bargeHit={t:s.simTime,at:localPoint(barge0.pos),vel:{x:+barge0.vel.x.toFixed(2),z:+barge0.vel.z.toFixed(2)},
     near:s.entityList.filter(near).map(e=>({type:e.type,name:e.data?.name||e.name,r:+e.radius?.toFixed(1),d:+Math.hypot(e.pos.x-barge0.pos.x,e.pos.z-barge0.pos.z).toFixed(1),vx:+e.vel.x.toFixed(2),vz:+e.vel.z.toFixed(2)}))};}
   prevBvx=barge0.vel.x;prevBvz=barge0.vel.z;};
  t.diagnostic('Scene0 '+JSON.stringify({rockShifted:s.npcJobs?.ceresNinthMouth?.rockShifted,rock:localPoint(rock.pos),barge:localPoint(barge0.pos),bargeVel:{x:barge0.vel.x,z:barge0.vel.z},debris:s.entityList.filter(e=>e.data?.ninthMouthDebris).length}));
  const motion=e=>({pos:{x:e.pos.x,z:e.pos.z},vel:{x:e.vel.x,z:e.vel.z},rot:e.rot,angVel:e.angVel});
  const aim=e=>{input.ingestLaneDomEvent({type:'mousemove',clientX:320,clientY:240,movementX:1,movementY:0});input.ingestLaneDomEvent({type:'cursorProjection',x:e.pos.x,z:e.pos.z});step(2);};
  const tap=c=>{key(c,true);step(1);key(c,false);step(6);};
  const clear=()=>{for(const k of ['KeyW','KeyS','KeyQ','KeyE','Digit0'])key(k,false);};
  const move=(x,z,max=3000)=>{for(let n=0;n<max;n++){const q=localPoint(p.pos),dx=x-q.x,dz=z-q.z;const vx=Math.max(-10,Math.min(10,dx*1.5)),vz=Math.max(-10,Math.min(10,dz*1.5));key('KeyS',p.vel.x<vx-1);key('KeyW',p.vel.x>vx+1);key('KeyQ',p.vel.z<vz-1);key('KeyE',p.vel.z>vz+1);key('Digit0',Math.hypot(dx,dz)<3);step(1);if(Math.hypot(dx,dz)<2&&Math.hypot(p.vel.x,p.vel.z)<1)break;}clear();key('Digit0',true);step(120);key('Digit0',false);};
  const choose=action=>{const o=s.ceresNinthMouthOffer;assert.ok(o.choices.some(c=>c.id===action&&!c.disabled));rt.bus.emit('ceresNinthMouth:action',{offerId:o.id,playerLife:o.playerLife,action});};
  if(s.ceresNinthMouthOffer.guidance?.role!=='lamp:0')choose('guide:lamp:0');choose('close');
  move(-160,-45);aim(lamp);tap('KeyF');
  timing.lampAttached=s.simTime;assert.equal(s.player.tether.active,true);assert.equal(s.player.tether.targetId,original.id);
  // Denied intent cannot transform an attached, out-of-place original.
  const unsafe=motion(lamp),offer=s.ceresNinthMouthOffer;
  rt.bus.emit('ceresNinthMouth:action',{offerId:offer.id,playerLife:offer.playerLife,action:'seat:0'});
  assert.equal(lamp.data.ninthMouthInstalled,false);assert.deepEqual(motion(lamp),unsafe);
  // Drag the lamp on the Line until its own velocity carries it inside the seat
  // mark, then release and let the real coast finish. Loose rock shed when the
  // wall gives can knock the load off its course; the pilot delivers it again.
  let ready=false;let hit=null,prevVx=lamp.vel.x,prevVz=lamp.vel.z;
  for(let attempt=0;attempt<3&&!ready;attempt++){
   const pl=localPoint(p.pos),lq=localPoint(lamp.pos);
   if(s.player.tether.targetId!==original.id){
    if(Math.hypot(lq.x-pl.x,lq.z-pl.z)>70)move(lq.x+40,lq.z+15);
    aim(lamp);tap('KeyF');
   }
   assert.equal(s.player.tether.targetId,original.id);
   for(let n=0;n<12000;n++){
    const tp=localPoint(p.pos),off=(tp.x+95)*-.319+(tp.z+23)*.948;
    const corr=Math.max(-.6,Math.min(.6,off*.04));
    const vx=.65*.948+corr*.319,vz=.65*.319-corr*.948;
    key('KeyS',p.vel.x<vx-.1);key('KeyW',p.vel.x>vx+.1);key('KeyQ',p.vel.z<vz-.1);key('KeyE',p.vel.z>vz+.1);key('Digit0',false);step(1);watchRock();
    if(n===30&&attempt===0){assert.equal(s.ceresNinthMouthOffer.guidance.role,'lamp:0');assert.equal(s.ceresNinthMouthOffer.guidance.attached,true);const read=masslineFlightRead(s);assert.ok(read.tow);assert.equal(read.cue,s.ceresNinthMouthOffer.guidance.instruction);}
    const l=localPoint(lamp.pos),rem=Math.hypot(l.x+95,l.z+23);
    const v2=lamp.vel.x**2+lamp.vel.z**2,dot=(-95-l.x)*lamp.vel.x+(-23-l.z)*lamp.vel.z;
    const disc=dot*dot-v2*(rem*rem-64);
    const eta=v2>.0025&&dot>0&&disc>=0?(dot-Math.sqrt(disc))/v2:Infinity;
    if((rem<25&&rem>8)||eta<40)break;
   }
   if(s.player.tether.active)tap('KeyF');timing.lampReleased=s.simTime;
   assert.equal(s.player.tether.active,false);
   const remAtRelease=Math.hypot(localPoint(lamp.pos).x+95,localPoint(lamp.pos).z+23);
   t.diagnostic('Released '+JSON.stringify({attempt,player:localPoint(p.pos),lamp:localPoint(lamp.pos),lampVel:{x:lamp.vel.x,z:lamp.vel.z}}));
   move(-180,10);
   if(attempt===0&&remAtRelease>8){
    assert.equal(s.ceresNinthMouthOffer.guidance.stage,'coast');assert.ok(s.ceresNinthMouthOffer.guidance.coastEta>0);
    assert.ok(s.ceresNinthMouthOffer.choices.some(c=>c.id==='seat:0'&&c.disabled),'projected arrival does not authorize Seat');
   }
   for(let n=0;n<6000;n++){
    const q=localPoint(p.pos),vx=Math.max(-10,Math.min(10,(-170-q.x)*1.5)),vz=Math.max(-10,Math.min(10,-q.z*1.5));
    const ax=vx-p.vel.x,az=vz-p.vel.z,fw=ax*Math.cos(p.rot)+az*Math.sin(p.rot),side=-ax*Math.sin(p.rot)+az*Math.cos(p.rot);
    key('KeyW',fw>1);key('KeyS',fw<-1);key('KeyE',side>1);key('KeyQ',side<-1);key('Digit0',Math.hypot(-170-q.x,q.z)<3);step(1);watchRock();
    const l=localPoint(lamp.pos);
    if(!hit&&Math.hypot(lamp.vel.x-prevVx,lamp.vel.z-prevVz)>.3){const near=e=>e!==lamp&&e.alive&&Math.hypot(e.pos.x-lamp.pos.x,e.pos.z-lamp.pos.z)<140;
     hit={n,at:{x:+l.x.toFixed(1),z:+l.z.toFixed(1)},vel:{x:+lamp.vel.x.toFixed(2),z:+lamp.vel.z.toFixed(2)},
      near:s.entityList.filter(near).map(e=>({type:e.type,name:e.data?.name||e.name,role:e.data?.ninthMouthRole,r:+e.radius?.toFixed(1),d:+Math.hypot(e.pos.x-lamp.pos.x,e.pos.z-lamp.pos.z).toFixed(1),vx:+e.vel.x.toFixed(2),vz:+e.vel.z.toFixed(2)}))};}
    prevVx=lamp.vel.x;prevVz=lamp.vel.z;
    if(Math.hypot(l.x+95,l.z+23)<7&&Math.hypot(lamp.vel.x,lamp.vel.z)<1){ready=true;break;}
    if(l.x>-80)break;
    if(Math.hypot(lamp.vel.x,lamp.vel.z)<.05&&Math.hypot(l.x+95,l.z+23)>40)break;
   }
   if(!ready)t.diagnostic('Deliver '+JSON.stringify({attempt,lamp:localPoint(lamp.pos),vel:{x:lamp.vel.x,z:lamp.vel.z}}));
  }
  t.diagnostic('Coast '+JSON.stringify({ready,lamp:localPoint(lamp.pos),vel:{x:lamp.vel.x,z:lamp.vel.z},hit,rockShiftDiag,bargeHit}));
  assert.ok(ready,'original lamp reaches its mark with real native speed below threshold');clear();step(16);
  const seatedAt=motion(lamp),seat=s.ceresNinthMouthOffer;
  assert.equal(seat.guidance.stage,'seat');assert.equal(seat.guidance.coastEta,null);
  assert.ok(seat.choices.some(c=>c.id==='talk'),'Seat remains available with radio compacted');
  assert.ok(seat?.choices.some(c=>c.id==='seat:0'&&!c.disabled),JSON.stringify(seat));
  rt.bus.emit('ceresNinthMouth:action',{offerId:seat.id,playerLife:seat.playerLife,action:'seat:0'});
  timing.lampSeated=s.simTime;assert.equal(lamp.data.ninthMouthInstalled,true);assert.deepEqual(motion(lamp),seatedAt,'Seat does not snap or zero velocity');
  step(120);assert.equal(physics._sg02.records.get(lamp.id).body.isFixed(),true);
  assert.equal(lamp.id,original.id);assert.equal(lamp.occupantGeneration,original.life);assert.equal(lamp.data.ninthMouthLight,true);
  assert.ok(Math.hypot(lamp.pos.x-original.pos.x,lamp.pos.z-original.pos.z)>100);
  assert.equal(s.npcJobs.ceresNinthMouth.rescue,null,'lamp never awards rescue');
  t.diagnostic(JSON.stringify({proof:'raw Line acquisition, tow, release, mark arrival and native Seat',lamp:localPoint(lamp.pos),releaseSpeed:Math.hypot(seatedAt.vel.x,seatedAt.vel.z),nativeFixed:true}));
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
