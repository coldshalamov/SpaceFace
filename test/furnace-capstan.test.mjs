import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { createFurnaceIntake } from '../src/systems/furnaceIntake.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { furnaceLots, furnaceLotSpec, furnaceMouthGlobal, FURNACE_MITE_KEYS } from '../src/missions/furnaceWorksite.js';
import { FURNACE_CAPSTAN, initFurnaceCapstan, removeFurnaceCapstan, stepFurnaceCapstan, furnaceCapstanRead, furnaceCapstanAvailability, furnaceCapstanOffer, furnaceCapstanResponse } from '../src/missions/furnaceCapstan.js';
function fixture({moved=false,initController=true}={}) {
 const s=createGameState(23),bus=createBus(),calls=[];let id=1;
 s.mode='flight';s.run={kind:'adventure'};s.story={flags:{}};s.world.currentSectorId='sector_ceres_belt';
 s.world.alienEcology={sites:{closed_refinery:{deadFauna:Object.fromEntries(FURNACE_MITE_KEYS.map(k=>[k,true]))}}};
 const m={id:'furnace-test',status:'active',storyTag:'campaign47a:b1:infested',destSectorId:'sector_ceres_belt',params:{furnaceWorksiteVersion:1,furnaceFeedsNeeded:3},objectiveProgress:4,objectiveTarget:4};
 s.missions={active:[m],receipts:[]};
 const helpers={spawnEntity(spec){const e={...spec,id:id++,alive:true,occupantGeneration:id};s.entities.set(e.id,e);s.entityList.push(e);return e;},removeEntity(n){const e=s.entities.get(n);if(e){e.alive=false;bus.queue('entity:destroyed',{id:e.id,type:e.type,entity:e});}s.entities.delete(n);},
 combatPhysics:{createAttachment(p){calls.push({kind:'attach',...p});return {id:p.attachmentId};},setAttachmentReel(p){calls.push({kind:'reel',...p});return {restLength:p.restLength};},cutAttachment(p){calls.push({kind:'cut',...p});return true;},getAttachmentTelemetry(){return {};}}};
 const p=helpers.spawnEntity({type:'player',pos:{x:furnaceMouthGlobal().x,z:furnaceMouthGlobal().z-150},vel:{x:0,z:0},radius:10,mass:20,hull:100,hullMax:100});s.playerId=p.id;s.player.flags={};s.player.credits=743;
 for(const lot of furnaceLots(m)){if(moved){lot.pos.x+=100;lot.vel.x=3;}const e=helpers.spawnEntity(furnaceLotSpec(m,lot));lot.entityId=e.id;}
 const ctx={state:s,bus,helpers,registry:{get:n=>n==='combat'?{kernel}:null}},kernel=getCombatKernel(ctx);
 const owner={ctx,state:s,bus,helpers,_restoring:false,_adventure:()=>s.world.currentSectorId==='sector_ceres_belt'},offs=[];
 if(initController){initFurnaceCapstan(owner,(name,fn)=>offs.push(bus.on(name,fn)));stepFurnaceCapstan(owner,0);}
 const a=s.entityList.find(e=>e.alive&&e.data?.furnaceCapstanId);s.player.targetId=a?.id??null;
 const offer=(choice)=>{const o=furnaceCapstanOffer(s,furnaceCapstanAvailability(s,a),'req-'+calls.length+'-'+s.tick,s.simTime+10);assert.ok(o);if(choice)assert.ok(o.actions.some(row=>row.id===choice));return o;};
 const choose=(o,id)=>{bus.emit('contactHail:offer',o);const res=furnaceCapstanResponse(s,o,id);assert.ok(res);bus.emit('contactHail:response',res);return res;};
 return {s,bus,owner,kernel,m,a,calls,offer,choose,record:()=>s.story.flags.furnace_capstan};
}
test('three physical originals are moored without changing mass, pose, velocity or receipt',()=>{
 const f=fixture(),before=f.m.params.furnaceLots.map(l=>structuredClone(f.s.entities.get(l.entityId)));
 assert.equal(f.calls.filter(c=>c.kind==='attach').length,3);assert.equal(f.a.physicsBody.dynamic,false);
 stepFurnaceCapstan(f.owner,1/60);assert.equal(f.calls.filter(c=>c.kind==='attach').length,3);
 before.forEach((old,i)=>{const e=f.s.entities.get(f.m.params.furnaceLots[i].entityId);assert.deepEqual(e.pos,old.pos);assert.deepEqual(e.vel,old.vel);assert.equal(e.mass,40);});
 assert.equal(f.s.player.credits,743);assert.equal(f.m.params.furnaceFeeds,undefined);
});
test('old moved original receives no silent cable or pose reset; explicit hail seats at current gap',()=>{
 const f=fixture({moved:true});assert.equal(f.calls.length,0);assert.ok(f.record().slots.every(r=>r.mode==='released'));
 f.choose(f.offer('furnace_haul'),'furnace_haul');stepFurnaceCapstan(f.owner,1/60);
 assert.equal(f.calls.filter(c=>c.kind==='attach').length,1);assert.equal(f.calls.find(c=>c.kind==='attach').targetId,f.m.params.furnaceLots[0].entityId);
});
test('only an offered, current, one-use command winds one drum; duplicate reply does nothing',()=>{
 const f=fixture(),o=f.offer('furnace_haul'),r=f.choose(o,'furnace_haul');
 assert.equal(f.record().slots[0].mode,'reeling');assert.equal(f.record().slots[1].mode,'held');
 stepFurnaceCapstan(f.owner,1/60);const length=f.record().slots[0].length;
 f.bus.emit('contactHail:response',{...r,choice:'furnace_release'});assert.equal(f.record().slots[0].mode,'reeling');assert.equal(f.record().slots[0].length,length);
});
test('expiry, target change, pod occupant replacement and cable replacement reject stale offers',()=>{
 for(const change of ['expiry','target','pod','cable']){const f=fixture(),o=f.offer('furnace_haul');
  if(change==='expiry')f.s.simTime=o.expiresAt;
  if(change==='target')f.s.player.targetId=null;
  if(change==='pod'){const old=f.s.entities.get(o.furnaceCapstan.podId);f.s.entities.set(old.id,{...old,occupantGeneration:old.occupantGeneration+1});}
  if(change==='cable'){const line=f.s.combat.attachments.byId[o.furnaceCapstan.lineId];line.state='broken';f.s.combat.attachments.byId.replaced={...line,id:'replaced',state:'active'};}
  assert.equal(furnaceCapstanResponse(f.s,o,'furnace_haul'),null,change);
 }
});
test('line break is durable release; re-haul does not reuse old tension length',()=>{
 const f=fixture(),read=furnaceCapstanRead(f.s,f.a);f.record().slots[0].length=90;
 f.kernel.attachments.cut(read.lineId,f.a.id,'test_break');assert.equal(f.record().slots[0].mode,'released');assert.equal(f.record().slots[0].length,null);
 const count=f.calls.filter(c=>c.kind==='attach').length;stepFurnaceCapstan(f.owner,1/60);assert.equal(f.calls.filter(c=>c.kind==='attach').length,count);
 const pod=f.s.entities.get(read.podId);pod.pos.x+=20; // Explicit fixture perturbation, never production route evidence.
 f.choose(f.offer('furnace_haul'),'furnace_haul');stepFurnaceCapstan(f.owner,1/60);
 assert.ok(f.record().slots[0].length>290);
});
test('Continue clears pending consent and stops winding; leaving attendance holds without consuming',()=>{
 const f=fixture(),o=f.offer('furnace_haul');f.bus.emit('contactHail:offer',o);f.bus.emit('save:restoring');f.bus.emit('save:loaded');
 f.bus.emit('contactHail:response',{...o,choice:'furnace_haul'});assert.equal(f.record().slots[0].mode,'held');
 f.choose(f.offer('furnace_haul'),'furnace_haul');f.bus.emit('save:loaded');assert.equal(f.record().slots[0].mode,'held');
 f.choose(f.offer('furnace_haul'),'furnace_haul');f.s.entities.get(f.s.playerId).pos.z-=1000;stepFurnaceCapstan(f.owner,1/60);
 assert.equal(f.record().slots[0].mode,'held');assert.equal(f.m.params.furnaceFeeds,undefined);
});
test('received/lost and corrupt custody produce no replacement work or reward',()=>{
 const f=fixture(),n=f.calls.length;f.m.params.furnaceLots[0].lost=true;stepFurnaceCapstan(f.owner,1/60);assert.equal(f.calls.length,n);
 f.record().slots[1]=null;stepFurnaceCapstan(f.owner,1/60);assert.equal(furnaceCapstanRead(f.s,f.a),null);assert.equal(f.s.player.credits,743);
});

test('queued intentional teardown cannot disable or release a recycled newer anchor',()=>{
 const f=fixture(),before=structuredClone(f.record().slots),oldLines=Object.values(f.s.combat.attachments.byId);
 removeFurnaceCapstan(f.owner);
 // Deliberate fixture construction of the canonical ID-recycling hazard.
 const replacement={...f.a,alive:true,occupantGeneration:f.a.occupantGeneration+1};
 f.s.entities.set(replacement.id,replacement);f.s.entityList.push(replacement);
 f.bus.flush();assert.equal(f.record().disabled,undefined);assert.deepEqual(f.record().slots,before);
 assert.ok(oldLines.every(line=>line.state==='broken'),'old canonical cables still break');
 stepFurnaceCapstan(f.owner,1/60);
 assert.equal(Object.values(f.s.combat.attachments.byId).filter(line=>line.state==='active').length,3);
 f.owner.helpers.removeEntity(replacement.id);f.bus.flush();assert.equal(f.record().disabled,true);
 f.bus.emit('save:loaded');stepFurnaceCapstan(f.owner,1/60);
 assert.equal(f.s.entityList.filter(e=>e.alive&&e.data?.furnaceCapstanId).length,0,'true loss is not repaired on Continue');
});
test('cancellation removes only yard equipment and grants no cargo, credit or receipt',()=>{
 const f=fixture(),pods=f.m.params.furnaceLots.map(l=>structuredClone(f.s.entities.get(l.entityId)));
 f.m.status='cancelled';stepFurnaceCapstan(f.owner,1/60);f.bus.flush();
 assert.equal(f.a.alive,false);assert.equal(f.record().disabled,undefined);
 pods.forEach(old=>assert.deepEqual(f.s.entities.get(old.id),old));
 assert.equal(f.s.player.credits,743);assert.equal(f.m.params.furnaceFeeds,undefined);
});

test('production intake reinitialization preserves pending intentional teardown provenance',()=>{
 // One canonical owner: no separate fixture capstan listeners or adopted fixture anchor.
 const f=fixture({initController:false}),intake=createFurnaceIntake();
 intake.init(f.owner.ctx);
 const old=f.s.entityList.find(e=>e.alive&&e.data?.furnaceCapstanId);
 const before=structuredClone(f.record().slots),oldLines=Object.values(f.s.combat.attachments.byId);
 intake.init(f.owner.ctx);
 const replacement=f.s.entityList.find(e=>e.alive&&e.data?.furnaceCapstanId);
 assert.ok(replacement);assert.notEqual(replacement,old);
 f.bus.flush();
 assert.equal(f.record().disabled,undefined,'queued intentional teardown cannot disable the current gantry');
 assert.deepEqual(f.record().slots,before);assert.ok(furnaceCapstanRead(f.s,replacement));
 assert.ok(oldLines.every(line=>line.state==='broken'));
 assert.equal(f.s.entityList.filter(e=>e.alive&&e.data?.furnaceCapstanId).length,1);
 assert.equal(f.owner.helpers.sectorCookProviders.length,1,'reinit does not duplicate owner materializers');
 assert.equal(Object.values(f.s.combat.attachments.byId).filter(line=>line.state==='active').length,3);
 f.owner.helpers.removeEntity(replacement.id);f.bus.flush();
 assert.equal(f.record().disabled,true,'real replacement loss still disables equipment');
 intake.init(f.owner.ctx);f.bus.flush();
 assert.equal(f.s.entityList.filter(e=>e.alive&&e.data?.furnaceCapstanId).length,0,'reinit cannot repair real loss');
 intake.destroy();
});

for(const [acceleration,mode] of [[325,'held'],[820,'held'],[820,'reeling']])test(`native local winch ${mode} at ${acceleration} WU/s² holds or trips finite reach`,async()=>{
 // Deliberately staged native stress fixture, not earned-world field evidence.
 const f=fixture(),native=await createSg02DynamicBodyOwner({publishTelemetry:true});
 try{
  native.syncFromEntities(f.s.entityList);
  const service=f.kernel.attachments;
  for(const line of Object.values(f.s.combat.attachments.byId))assert.ok(native.createAttachment({...line,attachmentId:line.id,...service.physicsContract(line.id)}));
  for(const key of ['createAttachment','setAttachmentReel','cutAttachment','getAttachmentTelemetry'])f.owner.helpers.combatPhysics[key]=native[key].bind(native);
  const pod=f.s.entities.get(f.m.params.furnaceLots[2].entityId),line=Object.values(f.s.combat.attachments.byId).find(a=>a.targetId===pod.id);
  f.record().slots[2].mode=mode;
  let peakForce=0,peakDistance=0;
  for(let i=0;i<1800;i++){
   f.s.tick++;f.s.simTime+=1/60;
   native.applyImpulse({entityId:pod.id,impulse:{x:40*acceleration/60,z:0},reason:'field'});
   native.step(1/60,f.s.tick);service.updateTelemetryAndBreak();
   const tel=native.getAttachmentTelemetry({attachmentId:line.id});
   if(tel){peakForce=Math.max(peakForce,tel.tension);peakDistance=Math.max(peakDistance,tel.distance);}
   if((i+1)%30===0)stepFurnaceCapstan(f.owner,.5); // Actual owner's coarse cadence.
   assert.ok(peakForce<=16000.001);
   if(line.state!=='active')break;
  }
  if(acceleration===325){assert.equal(line.state,'active');assert.equal(f.record().slots[2].mode,'held');assert.ok(peakDistance<900);}
  else{
   assert.equal(line.state,'broken');assert.equal(line.breakReason,'furnace_cable_reach');
   assert.equal(f.record().slots[2].mode,'released');assert.equal(f.record().slots[2].length,null);
   assert.ok(peakDistance<1500,'coarse native reach trip is bounded, not an indefinite cable');
   f.bus.emit('save:loaded');stepFurnaceCapstan(f.owner,.5);
   assert.equal(Object.values(f.s.combat.attachments.byId).filter(a=>a.state==='active'&&a.targetId===pod.id).length,0);
  }
  assert.equal(pod.mass,40);assert.equal(f.s.player.credits,743);assert.equal(f.m.params.furnaceFeeds,undefined);
  console.log('NATIVE_CAPSTAN_LIMIT',JSON.stringify({acceleration,peakForce,peakDistance,state:line.state,reason:line.breakReason,mode:f.record().slots[2].mode}));
 }finally{native.dispose();}
});

test('a recycled anchor cannot trip current custody through an old-generation cable',()=>{
 const f=fixture(),pod=f.s.entities.get(f.m.params.furnaceLots[2].entityId);
 const old=Object.values(f.s.combat.attachments.byId).find(line=>line.targetId===pod.id);
 removeFurnaceCapstan(f.owner);
 const replacement={...f.a,alive:true,occupantGeneration:f.a.occupantGeneration+1};
 f.s.entities.set(replacement.id,replacement);f.s.entityList.push(replacement);
 pod.pos.x+=400; // Staged recycled-ID/overrun fixture, not native journey evidence.
 stepFurnaceCapstan(f.owner,.5);
 assert.equal(old.state,'active','old cable awaits its original destruction receipt');
 assert.equal(f.record().slots[2].mode,'held','stale endpoints cannot trip the current slot');
 f.bus.flush();assert.equal(old.state,'broken');assert.equal(f.record().slots[2].mode,'held');
});

test('true loss queued before production reinit removes any premature successor',()=>{
 const f=fixture({initController:false}),intake=createFurnaceIntake();intake.init(f.owner.ctx);
 const old=f.s.entityList.find(e=>e.alive&&e.data?.furnaceCapstanId);
 const pods=f.m.params.furnaceLots.map(l=>structuredClone(f.s.entities.get(l.entityId)));
 f.owner.helpers.removeEntity(old.id);intake.init(f.owner.ctx);f.bus.flush();
 assert.equal(f.record().disabled,true);
 assert.equal(f.s.entityList.filter(e=>e.alive&&e.data?.furnaceCapstanId).length,0);
 intake.update(.5);f.bus.emit('save:loaded');intake.update(.5);f.bus.flush();
 assert.equal(f.s.entityList.filter(e=>e.alive&&e.data?.furnaceCapstanId).length,0);
 pods.forEach(pod=>assert.deepEqual(f.s.entities.get(pod.id),pod));
 assert.equal(f.s.player.credits,743);assert.equal(f.m.params.furnaceFeeds,undefined);
 intake.destroy();
});
