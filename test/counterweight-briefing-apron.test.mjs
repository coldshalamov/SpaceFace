import test from 'node:test';
import { projectCounterweightCircuitJournal, eventPreviewSpec, attemptProgressSpec } from '../src/features/counterweightCircuit/readModel.js';
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
async function fixture(event='soft_berth', playerLocal={x:255,z:0}, def=EVENTS[event], shift={x:0,z:0}) {
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
  physical.setCourseShift(shift);
  const admission=physical.admitCohort(def,1,shift);
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


// Real Rapier bodies, no synthetic success or post-admission pose writes.
test('registrar center and interaction edge remain an untimed briefing apron',async()=>{
  for(const shiftZ of COURSE_CLEARANCE_SHIFTS) {
    for(const local of [{x:0,z:0},{x:160,z:0},{x:-160,z:0},{x:0,z:160},{x:0,z:-160}]) {
      const f=await fixture('soft_berth',local,EVENTS.soft_berth,{x:0,z:shiftZ});
      const attempt=createAttemptState(f.def,{attemptId:1});
      for(let i=0;i<30;i++) advanceAttempt(attempt,f.def,f.tick());
      assert.equal(attempt.phase,'staged',`apron ${JSON.stringify(local)} shift ${shiftZ}`);
      assert.equal(attempt.armedAt,null);
    }
  }
});
test('real departure arms once, without moving the original course',async()=>{
  const f=await fixture('soft_berth',{x:159,z:0});
  const attempt=createAttemptState(f.def,{attemptId:1});
  const load=f.cohort.get('load'),original={id:load.id,generation:load.occupantGeneration};
  let arms=0;
  for(let i=0;i<240;i++) {
    const obs=f.tick(()=>driveTo(f.p,venueGlobalPos({x:175,z:0}),{speed:3,accel:2}));
    arms+=advanceAttempt(attempt,f.def,obs).filter(e=>e.type==='armed').length;
  }
  assert.ok(f.p.pos.x-venueGlobalPos({x:0,z:0}).x>160);
  assert.equal(attempt.phase,'running');assert.equal(arms,1);
  assert.equal(load.id,original.id);assert.equal(load.occupantGeneration,original.generation);
});
test('leaving apron away from a shifted course does not start its clock',async()=>{
  const f=await fixture('soft_berth',{x:-175,z:0},EVENTS.soft_berth,{x:0,z:360});
  const attempt=createAttemptState(f.def,{attemptId:1});
  for(let i=0;i<30;i++)advanceAttempt(attempt,f.def,f.tick());
  assert.equal(attempt.phase,'staged');
});
test('deliberate native line binding still commits while inside apron',async()=>{
  const f=await fixture('soft_berth',{x:159,z:0});
  f.attach(f.cohort.get('load'));
  const attempt=createAttemptState(f.def,{attemptId:1});
  const events=advanceAttempt(attempt,f.def,f.tick());
  assert.equal(attempt.phase,'running');assert.equal(events.filter(e=>e.type==='armed').length,1);
});

test('all seven courses leave the registrar-center briefing untimed',async()=>{
  for(const def of Object.values(EVENTS)) {
    const f=await fixture(def.id,{x:0,z:0},def);
    const attempt=createAttemptState(def,{attemptId:1});
    for(let i=0;i<10;i++)advanceAttempt(attempt,def,f.tick());
    assert.equal(attempt.phase,'staged',def.id);
  }
});
test('returning to the briefing apron never pauses an armed clock',async()=>{
  const f=await fixture('soft_berth',{x:175,z:0});
  const attempt=createAttemptState(f.def,{attemptId:1});
  advanceAttempt(attempt,f.def,f.tick());
  const armedAt=attempt.armedAt;
  assert.equal(attempt.phase,'running');
  for(let i=0;i<360;i++) advanceAttempt(attempt,f.def,f.tick(()=>driveTo(f.p,venueGlobalPos({x:150,z:0}),{speed:6,accel:2})));
  assert.ok(Math.hypot(f.p.pos.x-venueGlobalPos({x:0,z:0}).x,f.p.pos.z-venueGlobalPos({x:0,z:0}).z)<=160);
  assert.equal(attempt.phase,'running');assert.equal(attempt.armedAt,armedAt);
  assert.ok(projectCounterweightCircuitJournal(f.s,{attempt:{eventId:'soft_berth',fsm:attempt}}).attempt.elapsedS>=5.99);
});

test('preview and staged progress explain the same deliberate start',async()=>{
  const f=await fixture('soft_berth',{x:0,z:0});
  f.s.world.counterweightCircuit={records:{},settings:{}};
  assert.match(eventPreviewSpec(f.s,'soft_berth').detail,/leave the registrar apron/i);
  const attempt={eventId:'soft_berth',fsm:createAttemptState(f.def,{attemptId:1})};
  assert.match(attemptProgressSpec(f.s,{attempt}).detail,/Clock waiting/);
  attempt.admissionPending=true;
  assert.doesNotMatch(attemptProgressSpec(f.s,{attempt}).detail,/Clock waiting/);
  attempt.admissionPending=false;attempt.fsm.phase='running';attempt.fsm.armedAt=f.s.simTime;
  assert.doesNotMatch(attemptProgressSpec(f.s,{attempt}).detail,/Clock waiting/);
});
