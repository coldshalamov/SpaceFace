import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { writePhysicsControl, queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { COUNTERWEIGHT_EVENT_BY_ID as EVENTS, VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { createCircuitPhysical, makeCohortSpec, venueGlobalPos, fittedManifest } from '../src/features/counterweightCircuit/physical.js';
import { cradleFit, receiverFootprint, COURSE_CLEARANCE_SHIFTS, pickCourseShift } from '../src/features/counterweightCircuit/course.js';
import { createAttemptState, advanceAttempt } from '../src/features/counterweightCircuit/attempt.js';

const DT=1/60;
let flags;
test.before(()=>{flags=snapshotFeatureMaps();applyFeatureConfigToMaps(PRODUCTION_FEATURES);});
test.after(()=>restoreFeatureMaps(flags));

// Scene initialization only. Every post-admission move below is a force or
// impulse through the production membrane. No loop writes any pose/velocity.
async function fixture(event='soft_berth', playerLocal={x:255,z:0}, def=EVENTS[event]) {
  const probe={id:'circuitPhysicalProbe',name:'circuitPhysicalProbe',init(ctx){this.ctx=ctx;this.physical=createCircuitPhysical(ctx);}};
  const sim=createSimulation({seed:80404,systems:[ships,physics,combat,collisionConsequences,probe]});
  const s=sim.state;
  s.mode='flight';s.world.currentSectorId=VENUE_SECTOR_ID;s.ui.docked=false;
  s.settings.gameplay.physicsBackend='rapier-dynamic';
  sim.registry.get('ships').newGame();
  const p=sim.spawn(makeShipEntitySpec('ship_kestrel',{isPlayer:true,player:s.player,pos:venueGlobalPos(playerLocal),fittings:[]}));
  s.playerId=p.id;
  const owner=sim.registry.get('circuitPhysicalProbe'),physical=owner.physical;
  const native=sim.registry.get('physics');
  await native.prepareBackend(s);
  const tick=(control=null)=>{
    s.tick++;s.simTime=s.tick*DT;
    if(control)control();
    native.update(DT,s);
    sim.registry.get('combat').update(DT,s);
    sim.registry.get('collisionConsequences').update(DT,s);
    return cohort ? physical.observe(cohort,def,DT) : null;
  };
  let cohort=null;
  tick();
  const admission=physical.admitCohort(def,1,{x:0,z:0});
  cohort=admission.cohort;
  assert.equal(admission.completeCohort,true);
  assert.equal(admission.status,'pending','spawn specs are not native readiness');
  tick();tick();
  assert.equal(physical.cohortAdmission(cohort,def).status,'ready');
  const kernel=getCombatKernel(owner.ctx);
  const attach=(body)=>{
    const r=kernel.attachments.create({defId:'tether_standard',ownerId:p.id,targetId:body.id,
      sourceWorld:{...p.pos},targetWorld:{...body.pos}});
    assert.equal(r.ok,true,r.reason);return r.attachment;
  };
  return {sim,s,p,native,physical,cohort,tick,kernel,attach,def};
}

function driveTo(body,goal,{speed=12,accel=8,goalVel={x:0,z:0}}={}) {
  const dx=goal.x-body.pos.x,dz=goal.z-body.pos.z,d=Math.hypot(dx,dz);
  const desired=Math.min(speed,d*1.2,Math.sqrt(2*accel*d));
  const ax=(dx/Math.max(d,.001)*desired+goalVel.x-body.vel.x)*2;
  const az=(dz/Math.max(d,.001)*desired+goalVel.z-body.vel.z)*2;
  const scale=Math.min(1,accel/Math.max(.001,Math.hypot(ax,az)));
  writePhysicsControl(body,{source:'physical-native-test-input',force:{x:ax*scale*body.mass,y:0,z:az*scale*body.mass},
    torque:{x:0,y:-body.angVel*(body.physicsBody?.inertiaY||body.mass)*4,z:0},maxSpeed:speed+Math.hypot(goalVel.x,goalVel.z)});
}

test('measured open cradle, starter native mass, full footprint and downlane gate plane',async()=>{
  const f=await fixture();
  const load=f.cohort.get('load'),cradle=f.cohort.get('cradle');
  assert.equal(fittedManifest('place_ceres_section_cradle',32).primitives.length,11);
  assert.equal(cradle.physicsBody.shape,'compound');
  assert.equal(resolvePhysicsBodySpec(load).mass,18);
  assert.ok(f.native._sg02.records.get(load.id).body.mass()<=20);
  assert.ok(Math.abs(f.native._sg02.records.get(load.id).body.mass()-18)<.001);
  assert.equal(f.native._sg02.records.get(cradle.id).colliders.length,11);
  assert.equal(f.physical.observe(f.cohort,f.def).receivers['load:cradle'].stable,false);
  for(const id of ['long_arm','counterweight_finale']) {
    const g=EVENTS[id].gate,n={x:-g.axis.z,z:g.axis.x};
    assert.equal(Math.abs(n.x),1);assert.equal(n.z,0);
  }
  const b=cradleFit(32);
  assert.ok(b.maxX-b.minX>52);
  assert.ok(receiverFootprint(load,cradle).maxZ<b.mouthZ);
});

test('all obstructed candidates fail closed; partial admission rolls back',async()=>{
  const def=EVENTS.soft_berth;
  const blockers=COURSE_CLEARANCE_SHIFTS.map(z=>({id:100+z,alive:true,collides:true,radius:30,
    pos:venueGlobalPos({x:def.bodies[0].local.x,z})}));
  assert.equal(pickCourseShift({entityList:blockers},def,venueGlobalPos),null);
  const f=await fixture();
  const removed=[];
  const realSpawn=f.physical.ctx.helpers.spawnEntity;
  let calls=0;
  f.physical.ctx.helpers.spawnEntity=(spec)=>++calls===2?null:realSpawn(spec);
  const realRemove=f.physical.ctx.helpers.removeEntity;
  f.physical.ctx.helpers.removeEntity=(id,...args)=>{removed.push(id);return realRemove(id,...args);};
  const result=f.physical.admitCohort(def,2,{x:0,z:180});
  assert.equal(result.status,'failure');assert.equal(result.completeCohort,false);
  assert.equal(result.cohort.size,0);assert.equal(removed.length,1);
  const moving=EVENTS.moving_berth;
  const midRoute=COURSE_CLEARANCE_SHIFTS.map(z=>({alive:true,collides:true,radius:20,
    pos:venueGlobalPos({x:620,z:60+z})}));
  assert.equal(pickCourseShift({entityList:midRoute},moving,venueGlobalPos),null,'whole native itinerary is clearance tested');
});

test('lost original cannot bind a replacement copying its markers or respawn during admission',async()=>{
  const f=await fixture(),load=f.cohort.get('load'),identity=load.data.worldRecordId;
  // Negative lifetime fixture: the old occupant is gone, public tags copied.
  load.alive=false;
  f.sim.spawn(makeCohortSpec(f.def.bodies[0],1,{x:0,z:0}));
  assert.equal(f.physical.byIdentity(identity),null);
  assert.equal(f.physical.byIdentity(identity),null,'a second lookup cannot adopt copied public tags');
  assert.equal(f.physical.cohortAdmission(f.cohort,f.def).status,'failure');
  assert.equal(f.physical.admitCohort(f.def,1,{x:0,z:0}).reason,'original_missing');
});

test('player force loads the native rope and an accepted cut preserves the original motion',async()=>{
  const f=await fixture();const load=f.cohort.get('load');
  const id=load.id,life=load.occupantGeneration,start=load.pos.x;
  const line=f.attach(load);
  let taut=false,obs;
  for(let i=0;i<180;i++) {
    obs=f.tick(()=>driveTo(f.p,venueGlobalPos({x:340,z:0}),{speed:10,accel:5}));
    taut ||= obs.lines.some(l=>l.id===line.id && l.taut && l.tension>0);
  }
  assert.equal(taut,true,'native tension witness');
  assert.ok(load.pos.x>start+5,'line-induced original movement');
  const before={x:load.vel.x,z:load.vel.z};
  assert.equal(f.kernel.attachments.cut(line.id,f.p.id,'tether_cut').ok,true);
  obs=f.physical.observe(f.cohort,f.def);
  assert.deepEqual(obs.releases,[{id:line.id,role:'load'}]);
  assert.equal(load.id,id);assert.equal(load.occupantGeneration,life);
  assert.deepEqual({x:load.vel.x,z:load.vel.z},before,'release does not script velocity');
  assert.equal(f.physical.observe(f.cohort,f.def).releases.length,0);
});

test('real native crash uses one canonical hull packet, with stale occupant/duplicate refusal',async()=>{
  const def={...EVENTS.fragile_freight,bodies:EVENTS.fragile_freight.bodies.map(b=>b.role==='pod'?{...b,local:{x:320,z:-20}}:b)};
  const f=await fixture('fragile_freight',{x:240,z:80},def),pod=f.cohort.get('pod');
  const damage=[],impacts=[];
  f.sim.bus.on('combat:damage',r=>{if(r.targetId===pod.id)damage.push(r);});
  f.sim.bus.on('physics:impact',r=>{if(r.aId===pod.id||r.bId===pod.id)impacts.push({...r});});
  queuePhysicsImpulse(pod,{x:pod.mass*30,y:0,z:0},{source:'physical-test-launch'});
  for(let i=0;i<150 && !damage.length;i++)f.tick();
  assert.ok(impacts.length>0,'actual native collision');
  assert.equal(damage.length,1,'one hull writer, no feature plus generic double packet');
  assert.ok(pod.hull<pod.hullMax,'canonical condition really falls');
  const receipt=impacts[0],hull=pod.hull;
  f.sim.bus.emit('physics:impact',receipt);
  f.sim.bus.emit('physics:impact',{...receipt,tick:f.s.tick,aGeneration:-1,bGeneration:-1});
  assert.equal(pod.hull,hull);
});

test('force-driven approach enters the actual mouth and seats against native back support',async()=>{
  // Short owner route fixture: start the same 18t original outside the mouth;
  // production control forces carry it through open geometry and into support.
  const def={...EVENTS.soft_berth,bodies:EVENTS.soft_berth.bodies.map(b=>b.role==='load'?{...b,local:{x:470,z:0}}:b)};
  const f=await fixture('soft_berth',{x:420,z:60},def);
  const load=f.cohort.get('load'),receiver=f.cohort.get('cradle');
  const goal={x:receiver.pos.x+24,z:receiver.pos.z};
  let maxDwell=0,dwell=0,entered=false,insideWithoutContact=false;
  for(let i=0;i<1900 && maxDwell<1.25;i++) {
    const obs=f.tick(()=>driveTo(load,goal,{speed:3,accel:3}));
    const r=obs.receivers['load:cradle'];
    entered ||= r.entered;
    insideWithoutContact ||= r.inside && !r.supportContact && !r.stable;
    dwell=r.stable?dwell+DT:0;maxDwell=Math.max(maxDwell,dwell);
  }
  assert.equal(entered,true,'observed actual open-mouth crossing');
  assert.equal(insideWithoutContact,true,'free-floating interior does not count as seated');
  assert.ok(maxDwell>=1.2,`native contact stable dwell ${maxDwell}; ${JSON.stringify({pose:load.pos,receiver:receiver.pos,footprint:receiverFootprint(load,receiver),observation:f.physical.observe(f.cohort,def).receivers,contacts:f.physical.ctx.helpers.combatPhysics.sampleSolidContacts(load.id,{targetId:receiver.id})})}`);
  assert.equal(load.hull,load.hullMax,'gentle seating keeps canonical condition');
});

test('pilot-force tow and player release seat the authored original without load controls',async()=>{
  const f=await fixture(),load=f.cohort.get('load'),receiver=f.cohort.get('cradle');
  const original={id:load.id,generation:load.occupantGeneration,record:load.data.worldRecordId};
  const line=f.attach(load);
  let cut=false,dwell=0,maxDwell=0,taut=false,lastSupport=null;
  for(let i=0;i<5200 && maxDwell<1.2;i++) {
    const obs=f.tick(()=>driveTo(f.p,{x:receiver.pos.x+6,z:receiver.pos.z+(cut?-16:0)},{speed:7,accel:5}));
    taut ||= obs.lines.some(l=>l.id===line.id&&l.taut);
    if(!cut && load.pos.x>receiver.pos.x-38 && load.vel.x>1 && load.vel.x<=4) {
      assert.equal(f.kernel.attachments.cut(line.id,f.p.id,'tether_cut').ok,true);cut=true;
    }
    const r=obs.receivers['load:cradle'];dwell=r.stable?dwell+DT:0;maxDwell=Math.max(dwell,maxDwell);
    if(r.supportContact)lastSupport={t:f.s.simTime,r,footprint:receiverFootprint(load,receiver)};
  }
  assert.equal(taut,true);assert.equal(cut,true,`pilot ${JSON.stringify(f.p.pos)} load ${JSON.stringify(load.pos)} v ${load.vel.x}`);
  assert.ok(maxDwell>=1.2,`pilot-only seat dwell ${maxDwell}: ${JSON.stringify({lastSupport,pilot:f.p.pos,load:load.pos,vel:load.vel,receiver:receiver.pos,footprint:receiverFootprint(load,receiver),r:f.physical.observe(f.cohort,f.def).receivers})}`);
  assert.deepEqual({id:load.id,generation:load.occupantGeneration,record:load.data.worldRecordId},original);
});

test('dynamic berth brakes, dwells and turns around its bounded route through native forces',async()=>{
  const f=await fixture('moving_berth',{x:200,z:140}),barge=f.cohort.get('barge');
  const itinerary=f.def.bodies.find(b=>b.role==='barge').itinerary;
  const start={x:barge.pos.x,z:barge.pos.z},life=barge.occupantGeneration;
  f.physical.driveMobile(barge,itinerary);
  let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,braked=false,turned=false;
  const destination=venueGlobalPos(itinerary.waypoints[1]);
  for(let i=0;i<2800;i++) {
    f.tick(()=>f.physical.stepMobile(DT));
    minX=Math.min(minX,barge.pos.x);maxX=Math.max(maxX,barge.pos.x);
    minZ=Math.min(minZ,barge.pos.z);maxZ=Math.max(maxZ,barge.pos.z);
    if(Math.hypot(barge.pos.x-destination.x,barge.pos.z-destination.z)<3
      && Math.hypot(barge.vel.x,barge.vel.z)<.5)braked=true;
    turned ||= braked && barge.pos.z<start.z-10;
  }
  assert.ok(maxX-start.x>150);assert.equal(braked,true);assert.equal(turned,true);
  assert.ok(minX>=start.x-3 && maxX<=destination.x+3 && minZ>=start.z-123 && maxZ<=start.z+3);
  assert.ok(Math.abs(barge.rot+Math.PI/2)<.08,'receiving bay remains heading-stable');
  assert.equal(barge.occupantGeneration,life);
});

test('moving bay seats by relative speed while both original bodies remain in native motion',async()=>{
  const base=EVENTS.moving_berth;
  const def={...base,bodies:base.bodies.map(b=>b.role==='load'?{...b,local:{x:395,z:60}}:b)};
  const f=await fixture('moving_berth',{x:300,z:140},def),load=f.cohort.get('load'),barge=f.cohort.get('barge');
  f.physical.driveMobile(barge,def.bodies.find(b=>b.role==='barge').itinerary);
  let dwell=0,maxDwell=0,moving=false;
  for(let i=0;i<2000 && maxDwell<1.5;i++) {
    const obs=f.tick(()=>{
      f.physical.stepMobile(DT);
      driveTo(load,{x:barge.pos.x+29,z:barge.pos.z},{speed:5,accel:5,goalVel:barge.vel});
    });
    const r=obs.receivers['load:barge'];
    dwell=r.stable?dwell+DT:0;maxDwell=Math.max(maxDwell,dwell);
    moving ||= r.stable && Math.hypot(load.vel.x,load.vel.z)>4 && Math.hypot(barge.vel.x,barge.vel.z)>4;
  }
  assert.ok(maxDwell>=1.5,`relative seat dwell ${maxDwell}: ${JSON.stringify(f.physical.observe(f.cohort,def).receivers)}`);
  assert.equal(moving,true,'absolute speed may exceed four; accepted relative speed cannot');
});

test('native pilot orbit produces a real curved loaded trajectory and original player release',async()=>{
  const f=await fixture('long_arm',{x:220,z:0}),load=f.cohort.get('load'),anchor=f.cohort.get('counterweight');
  const line=f.attach(load);
  let waypoint=1,previous=null,sweep=0,maxSweep=0,loadedFrames=0;
  for(let i=0;i<2400 && maxSweep<1.8;i++) {
    const theta=Math.PI+waypoint*.35;
    const goal={x:anchor.pos.x+200*Math.cos(theta),z:anchor.pos.z+200*Math.sin(theta)};
    if(Math.hypot(f.p.pos.x-goal.x,f.p.pos.z-goal.z)<22)waypoint++;
    const obs=f.tick(()=>driveTo(f.p,goal,{speed:26,accel:8}));
    const bearing=Math.atan2(load.pos.z-anchor.pos.z,load.pos.x-anchor.pos.x);
    const loaded=obs.lines.find(l=>l.id===line.id)?.taut;
    if(loaded) {
      loadedFrames++;
      if(previous!=null)sweep+=Math.atan2(Math.sin(bearing-previous),Math.cos(bearing-previous));
      maxSweep=Math.max(maxSweep,Math.abs(sweep));previous=bearing;
    } else {sweep=0;previous=null;}
  }
  assert.ok(maxSweep>=1.75,`real same-line taut sweep ${maxSweep}; loaded frames ${loadedFrames}`);
  assert.equal(f.kernel.attachments.cut(line.id,f.p.id,'tether_cut').ok,true);
  const obs=f.tick();assert.deepEqual(obs.releases,[{id:line.id,role:'load'}]);
  assert.equal(obs.bodies.load.id,load.id);
});

test('actual free downlane native crossing satisfies the authored Long Arm plane',async()=>{
  const base=EVENTS.long_arm;
  const def={...base,legs:[base.legs[3]],bodies:base.bodies.map(b=>b.role==='load'?{...b,local:{x:600,z:0}}:b),
    gate:{...base.gate,absPos:venueGlobalPos(base.gate.pos)}};
  const f=await fixture('long_arm',{x:550,z:50},def),fsm=createAttemptState(def);
  queuePhysicsImpulse(f.cohort.get('load'),{x:18*20,y:0,z:0},{source:'native-plane-launch-fixture'});
  for(let i=0;i<120 && fsm.phase!=='complete';i++)advanceAttempt(fsm,def,f.tick());
  assert.equal(fsm.phase,'complete','actual +X movement crosses tangent-Z gate');
});

test('both broad basin approaches accept the released original only after full native containment',async()=>{
  for(const lateral of [-16,16]) {
    const base=EVENTS.clean_sling,basinDef=base.bodies.find(b=>b.role==='basin');
    const def={...base,bodies:base.bodies.map(b=>b.role==='load'?{...b,local:{x:basinDef.local.x-65,z:basinDef.local.z+lateral}}:b)};
    const f=await fixture('clean_sling',{x:basinDef.local.x-125,z:basinDef.local.z+lateral},def);
    const load=f.cohort.get('load'),line=f.attach(load),id=load.id,life=load.occupantGeneration;
    f.physical.observe(f.cohort,def);
    assert.equal(f.kernel.attachments.cut(line.id,f.p.id,'tether_cut').ok,true);
    // One launch impulse initializes the released approach; no further load controls.
    queuePhysicsImpulse(load,{x:load.mass*2.5,y:0,z:0},{source:'basin-approach-launch-fixture'});
    let dwell=0,maxDwell=0,entered=false,partialRefused=false;
    for(let i=0;i<3100 && maxDwell<1.5;i++) {
      const r=f.tick().receivers['load:basin'];
      entered ||= r.entered;partialRefused ||= r.entered&&!r.inside&&!r.stable;
      dwell=r.stable?dwell+DT:0;maxDwell=Math.max(maxDwell,dwell);
    }
    assert.equal(entered,true);assert.equal(partialRefused,true);
    assert.ok(maxDwell>=1.5,`approach ${lateral}: ${maxDwell} ${JSON.stringify(f.physical.observe(f.cohort,def).receivers)}`);
    assert.equal(load.id,id);assert.equal(load.occupantGeneration,life);
    assert.ok(Math.hypot(f.p.pos.x-f.cohort.get('basin').pos.x,f.p.pos.z-f.cohort.get('basin').pos.z)>95);
  }
});

test('native save snapshot retains motion, generations, custody and real rope through semantic owner validation',async()=>{
  const f=await fixture(),load=f.cohort.get('load'),line=f.attach(load);
  for(let i=0;i<100;i++)f.tick(()=>driveTo(f.p,venueGlobalPos({x:340,z:0}),{speed:10,accel:5}));
  const source=f.native._sg02,saved=JSON.parse(JSON.stringify(source.exportWorldSnapshot()));
  const entities=[...f.s.entities.values()].map(e=>({...JSON.parse(JSON.stringify(e)),occupantGeneration:e.occupantGeneration}));
  const restored=await createSg02DynamicBodyOwner({fixedDt:source.fixedDt,quantum:source.quantum,
    mode:source.mode,captureContactImpacts:source.captureContactImpacts,publishTelemetry:source.publishTelemetry});
  try {
    assert.deepEqual(restored.exportWorldSnapshot().runtime,saved.runtime,'same native runtime contract');
    assert.equal(restored.adoptWorldSnapshot(saved,entities,{resolveAttachmentContract:id=>f.kernel.attachments.physicsContract(id)}),true);
    assert.deepEqual(restored.quantizedSnapshot(),source.quantizedSnapshot());
    assert.ok(restored.attachments.has(line.id));
    const original=entities.find(e=>e.id===load.id);
    assert.equal(original.occupantGeneration,load.occupantGeneration);
    assert.equal(original.data.worldRecordId,load.data.worldRecordId);
    assert.equal(original.data.physicalCustodyOnly,true);
    for(let i=0;i<12;i++){source.step(DT);restored.step(DT);}
    assert.deepEqual(restored.quantizedSnapshot(),source.quantizedSnapshot(),'continued real motion remains identical');
  } finally {restored.dispose();}
});
