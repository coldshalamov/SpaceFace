import test from 'node:test';
import assert from 'node:assert/strict';
import { createConvoyRoute } from '../src/features/convoyRaid/route.js';
import { createTrain, getTrainComponents, getCouplerGeometry, severCoupler, damageCoupler,
  braceTrain, planTrainStep, integrateTrainHeadless, markBodyLost, serializeTrain, restoreTrain,
  synchronizeTrain } from '../src/features/convoyRaid/train.js';
import { createRaid, advanceRaid, serializeRaid, restoreRaid, crossedFork } from '../src/features/convoyRaid/controller.js';
import { SWITCHBACK } from '../src/features/convoyRaid/catalog.js';
import { SWITCHBACK_ENCOUNTER_RUNTIME, switchbackOfferReady } from '../src/features/convoyRaid/encounter.js';
import { trigger as switchbackTrigger, runtime as catalogRuntime } from '../src/data/encounters/8103-pro-five-convoyRaid.js';
import { createConvoyRaidSystem, switchbackEntryPoint } from '../src/features/convoyRaid/runtime.js';
import { createSwitchbackInteractionFrame, describeSwitchbackInteraction, createSwitchbackInteractions } from '../src/features/convoyRaid/interactions.js';
import { projectSwitchbackPresentation } from '../src/features/convoyRaid/presentation.js';
import { makeEntity } from '../src/core/entity.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand, writePhysicsControl, queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';

const DT = 1 / 60;
const SEEDS = [4242, 8191];
const targetOf = train => train.bodies.find(b => b.id === train.targetId);
const kinematics = body => ({ x:body.x, z:body.z, vx:body.vx, vz:body.vz, angle:body.angle, omega:body.omega });
const jointsOf = train => train.couplers.filter(c => c.aId === train.targetId || c.bId === train.targetId);
const almost = (a,b,tol=1e-7) => assert.ok(Math.abs(a-b)<=tol, `${a} differs from ${b} by ${Math.abs(a-b)}`);
function trainFor(seed) {
  return createTrain({ seed, id:`test:${seed}`, route:createConvoyRoute({ seed, origin:SWITCHBACK.origin, heading:SWITCHBACK.heading }) });
}
function controllerFixture(seed=4242,mode='theft') {
  const train=trainFor(seed), raid=createRaid({ train, seed, runId:`raid:${seed}` });
  const player={ id:'player', ...kinematics(targetOf(train)), hp:100 };
  let now=0;
  const frame=()=>({ train, player, simTime:now, dt:DT, sectorId:SWITCHBACK.sectorId });
  advanceRaid(raid,frame(),[{type:'choose',choice:mode}]);
  return {train,raid,player,frame,tick(commands=[],extra={}) {now+=DT;return advanceRaid(raid,{...frame(),...extra},commands);},
    get now(){return now;}, set now(value){now=value;} };
}
function applyTrainEffects(train,effects,now=0) {
  for(const effect of effects) {
    if(effect.type==='sever') severCoupler(train,effect.couplerId,{reason:effect.reason,simTime:now});
    if(effect.type==='damageCoupler') damageCoupler(train,effect.couplerId,effect.amount,{reason:effect.reason,simTime:now});
    if(effect.type==='brace') braceTrain(train,{until:effect.until,simTime:now});
  }
}
function isolate(train) { for(const joint of jointsOf(train)) severCoupler(train,joint.id); }
function cross(fixture) {
  const target=targetOf(fixture.train),gate=fixture.train.route.fork;
  Object.assign(target,{x:gate.x-gate.nx*2,z:gate.z-gate.nz*2,vx:gate.nx*8,vz:gate.nz*8});
  Object.assign(fixture.player,{x:target.x,z:target.z});fixture.tick();
  target.x=gate.x+gate.nx*2;target.z=gate.z+gate.nz*2;
  Object.assign(fixture.player,{x:target.x,z:target.z});return fixture.tick();
}
function placeAtReceiver(fixture,speed=0) {
  const target=targetOf(fixture.train),r=fixture.train.route.receivers.illicit;
  Object.assign(target,{x:r.x,z:r.z,vx:speed,vz:0});
  Object.assign(fixture.player,{x:r.x,z:r.z,vx:0,vz:0});
}

for(const seed of SEEDS) {
  test(`seed ${seed}: sever preserves every body transform, linear momentum and spin exactly`,()=>{
    const train=trainFor(seed), targetId=train.targetId;
    train.bodies.forEach((b,i)=>{b.vx+=i*3;b.vz-=i*5;b.omega=.13*(i-2);});
    const before=train.bodies.map(kinematics), joints=jointsOf(train);
    assert.equal(joints.length,2);
    severCoupler(train,joints[0].id,{simTime:3});
    assert.deepEqual(train.bodies.map(kinematics),before);
    assert.equal(getTrainComponents(train).length,2);
    severCoupler(train,joints[1].id,{simTime:3});
    assert.deepEqual(train.bodies.map(kinematics),before);
    const components=getTrainComponents(train);assert.equal(components.length,3);
    assert.deepEqual(components.find(c=>c.containsTarget).bodyIds,[targetId]);
    assert.equal(train.targetId,targetId);
    severCoupler(train,joints[0].id,{simTime:9});
    assert.deepEqual(train.bodies.map(kinematics),before);
  });
  test(`seed ${seed}: internal coupler impulses conserve total linear and angular momentum`,()=>{
    const train=trainFor(seed);train.bodies[2].z+=.7;train.bodies[2].omega=.3;train.bodies[3].vx-=4;
    const plan=planTrainStep(train,DT,DT,{drive:false});
    let px=0,pz=0,angular=0;
    for(const j of plan.impulses){const b=train.bodies.find(b=>b.id===j.bodyId);px+=j.ix;pz+=j.iz;angular+=b.x*j.iz-b.z*j.ix+j.angularImpulse;}
    assert.ok(plan.impulses.length>0);almost(px,0);almost(pz,0);almost(angular,0,1e-6);
    assert.ok(plan.impulses.every(j=>[j.ix,j.iz,j.angularImpulse].every(Number.isFinite)));
  });
  test(`seed ${seed}: moving curved train reaches lawful receiver through actual force integration`,()=>{
    const f=controllerFixture(seed,'escort'), start=f.train.routeDistance;
    let settlement=null,maxDistance=0;
    for(let tick=1;tick<=8000;tick++){
      integrateTrainHeadless(f.train,DT,planTrainStep(f.train,DT,tick*DT));
      Object.assign(f.player,kinematics(targetOf(f.train)));
      const effects=f.tick();maxDistance=Math.max(maxDistance,f.train.routeDistance);
      settlement=effects.find(e=>e.type==='settlement');if(settlement)break;
    }
    assert.ok(maxDistance>start+1500);assert.equal(settlement?.outcome,'lawful_delivery');
    assert.equal(settlement.credits,720);assert.ok(f.raid.coverS>=20);
    assert.equal(f.train.couplers.filter(c=>c.severed).length,0);
    const loaded=restoreRaid(serializeRaid(f.raid),{train:f.train,simTime:f.now});
    assert.deepEqual(advanceRaid(loaded,{train:f.train,simTime:f.now+DT,dt:DT}),[]);
  });
  test(`seed ${seed}: exactly one physical target must cross the fork and settle slowly at receiver`,()=>{
    const f=controllerFixture(seed);isolate(f.train);const target=targetOf(f.train);
    placeAtReceiver(f);for(let i=0;i<100;i++)f.tick();
    assert.equal(f.raid.settlement,null,'receiver alone cannot skip gate');
    const gate=f.train.route.fork;
    assert.equal(crossedFork({x:gate.x+gate.nx,z:gate.z+gate.nz},{x:gate.x-gate.nx,z:gate.z-gate.nz},gate),false);
    cross(f);assert.equal(f.raid.forkCrossed,true);assert.equal(f.raid.crimeCommitted,true);
    placeAtReceiver(f,SWITCHBACK.receiverSpeed+10);for(let i=0;i<120;i++)f.tick();
    assert.equal(f.raid.settlement,null,'moving too fast cannot sell');
    target.vx=0;f.player.x+=300;for(let i=0;i<100;i++)f.tick();
    assert.equal(f.raid.settlement,null,'remote cargo arrival cannot sell');
    f.player.x=target.x;let payments=[];
    for(let i=0;i<120;i++)payments.push(...f.tick().filter(e=>e.type==='settlement'));
    assert.equal(payments.length,1);assert.equal(payments[0].outcome,'stolen_escape');assert.equal(payments[0].consumeTarget,true);
    assert.equal(payments[0].targetId,target.id);assert.equal(payments[0].credits,1650);
  });
}

test('quiet service requires continuous matched velocity, supports cancellation, and preserves motion',()=>{
  const f=controllerFixture(),joint=jointsOf(f.train)[0],g=getCouplerGeometry(f.train,joint.id);
  const a=f.train.bodies.find(b=>b.id===joint.aId),b=f.train.bodies.find(b=>b.id===joint.bId);
  Object.assign(f.player,{x:g.x,z:g.z,vx:(a.vx+b.vx)/2,vz:(a.vz+b.vz)/2});
  f.tick([{type:'releaseCoupler',couplerId:joint.id}]);for(let i=0;i<30;i++)f.tick();
  assert.ok(f.raid.quietLatch.heldS>0);f.player.vx+=30;f.tick();assert.equal(f.raid.quietLatch.couplerId,null);
  f.player.vx-=30;f.tick([{type:'releaseCoupler',couplerId:joint.id}]);f.tick([{type:'cancelLatch'}]);
  for(let i=0;i<100;i++)assert.equal(f.tick().some(e=>e.type==='sever'),false);
  const before=f.train.bodies.map(kinematics);let releases=[];
  f.tick([{type:'releaseCoupler',couplerId:joint.id}]);
  for(let i=0;i<80;i++){const e=f.tick();releases.push(...e.filter(e=>e.type==='sever'));applyTrainEffects(f.train,e,f.now);}
  assert.equal(releases.length,1);assert.equal(joint.severed,true);assert.deepEqual(f.train.bodies.map(kinematics),before);
});

test('braced service latch refuses release and noisy shots can destroy a selected coupler',()=>{
  const f=controllerFixture(),joint=jointsOf(f.train)[0],g=getCouplerGeometry(f.train,joint.id);
  Object.assign(f.player,{x:g.x,z:g.z,vx:f.train.bodies[0].vx,vz:f.train.bodies[0].vz});
  braceTrain(f.train,{until:4,simTime:0});
  f.tick([{type:'releaseCoupler',couplerId:joint.id}]);assert.equal(f.raid.quietLatch.couplerId,null);
  for(let i=0;i<3;i++)applyTrainEffects(f.train,f.tick([{type:'damageCoupler',couplerId:joint.id,amount:.9,actor:'player',id:`hit${i}`}]),f.now);
  assert.equal(joint.severed,true);assert.equal(f.raid.crimeCommitted,true);assert.ok(f.raid.noise>0);
});

test('a pinned carriage creates sustained strain and bounded real graph separation',()=>{
  const train=trainFor(4242),last=train.bodies.at(-1);last.x-=180;
  let broken=false;
  for(let i=1;i<=180;i++){planTrainStep(train,DT,i*DT,{drive:false});if(train.couplers.some(c=>c.severed)){broken=true;break;}}
  assert.equal(broken,true);assert.ok(getTrainComponents(train).length>1);
  assert.ok(train.couplers.every(c=>Number.isFinite(c.strain)&&Number.isFinite(c.integrity)));
});

test('duplicate damage receipt is consumed once and command flooding stays bounded',()=>{
  const f=controllerFixture(),joint=jointsOf(f.train)[0];
  const command={type:'damageCoupler',id:'one-impact',couplerId:joint.id,amount:.4,actor:'player'};
  const first=f.tick([command,command]);assert.equal(first.filter(e=>e.type==='damageCoupler').length,1);
  applyTrainEffects(f.train,first,f.now);assert.equal(f.tick([command]).filter(e=>e.type==='damageCoupler').length,0);
  const flood=Array.from({length:1000},(_,i)=>({...command,id:`flood:${i}`}));
  const effects=f.tick(flood);assert.ok(effects.length<=SWITCHBACK.maxEffectsPerTick);assert.ok(f.raid.commandReceipts.length<=SWITCHBACK.maxCommandReceipts);
});

test('one-tick arrival earns no escort pay; verified player defense differs from observing enemy damage',()=>{
  const f=controllerFixture(4242,'escort'),target=targetOf(f.train),r=f.train.route.receivers.lawful;
  Object.assign(target,{x:r.x,z:r.z,vx:0,vz:0});Object.assign(f.player,{x:r.x,z:r.z});
  f.tick([{type:'attack',actor:'other',targetId:target.id}]);assert.equal(f.raid.defended,false);assert.equal(f.raid.settlement,null);
  f.tick([{type:'defend',actor:'player',raiderId:'unknown',damage:4}],{raiders:[{id:'raider:0',x:r.x,z:r.z}]});
  assert.equal(f.raid.defended,false);
  const e=f.tick([{type:'defend',actor:'player',raiderId:'raider:0',damage:4}],{raiders:[{id:'raider:0',x:r.x,z:r.z,hp:10}]});
  assert.equal(f.raid.defended,true);assert.equal(e.find(x=>x.type==='settlement')?.outcome,'lawful_defense');
});

test('partial train loss keeps target identity and reduces lawful reward; target loss never retargets',()=>{
  const f=controllerFixture(8191,'escort'),target=targetOf(f.train),other=f.train.bodies.find(b=>b.role==='carriage'&&!b.target);
  markBodyLost(f.train,other.id);f.tick();assert.equal(f.raid.phase,'running');assert.equal(f.raid.targetId,target.id);
  f.raid.coverS=25;const r=f.train.route.receivers.lawful;
  Object.assign(target,{x:r.x,z:r.z,vx:0,vz:0});Object.assign(f.player,{x:r.x,z:r.z});
  const receipt=f.tick().find(e=>e.type==='settlement');assert.equal(receipt.outcome,'lawful_partial');assert.equal(receipt.credits,520);
  const lost=controllerFixture();markBodyLost(lost.train,lost.train.targetId);
  const e=lost.tick();assert.equal(e.find(x=>x.type==='settlement').outcome,'convoy_lost');assert.equal(lost.raid.targetId,lost.train.targetId);
});

test('collateral theft has a lower settlement and a missing target remains missing after restore',()=>{
  const f=controllerFixture(),other=f.train.bodies.find(b=>b.role==='carriage'&&!b.target);
  markBodyLost(f.train,other.id);f.tick([{type:'bodyLost',bodyId:other.id,actor:'player'}]);
  isolate(f.train);cross(f);placeAtReceiver(f);let receipt;
  for(let i=0;i<100;i++)receipt=f.tick().find(e=>e.type==='settlement')||receipt;
  assert.equal(receipt.outcome,'stolen_collateral');assert.equal(receipt.credits,1450);
  const lost=trainFor(4242);markBodyLost(lost,lost.targetId);
  const restored=restoreTrain(serializeTrain(lost));
  synchronizeTrain(restored,[{id:restored.targetId,hp:360,x:1,z:2,vx:3,vz:4}]);
  assert.equal(targetOf(restored).lost,true);assert.equal(restored.targetId,lost.targetId);
});

test('active restore restarts latch and gate samples; a mismatched target closes without reward',()=>{
  const f=controllerFixture();f.raid.quietLatch={couplerId:f.train.couplers[0].id,heldS:1.19,requiredS:1.2};
  f.raid.previousTarget={x:-10000,z:-10000,vx:1,vz:1};
  const saved=serializeRaid(f.raid),loaded=restoreRaid(saved,{train:f.train});
  assert.equal(loaded.quietLatch.heldS,0);assert.equal(loaded.previousTarget,null);
  saved.targetId='wrong-carriage';const invalid=restoreRaid(saved,{train:f.train});
  assert.equal(invalid.phase,'settled');assert.equal(invalid.outcome,'invalid_restore');
  assert.deepEqual(advanceRaid(invalid,{train:f.train,simTime:10,dt:DT}),[]);
});

// Integration fixture: real canonical entity factory, event bus, and physicsAuthority command
// mailbox; injected builders replace only omitted authored spawn-catalog dependencies. This is
// deliberately not a GPU/Rapier world or a claim of local player acceptance.
function runtimeFixture(seed=4242,choice='theft',autoStart=true) {
  const bus=createBus(),entry=switchbackEntryPoint(),state={meta:{seed},mode:'flight',timeScale:1,simTime:0,tick:0,
    world:{currentSectorId:SWITCHBACK.sectorId},entities:new Map(),entityList:[],playerId:1,player:{credits:7},run:{kind:'adventure'}};
  let nextId=1;const removed=[];
  const spawnEntity=spec=>{const e=makeEntity(spec);e.id=nextId++;e.occupantGeneration=1;state.entities.set(e.id,e);state.entityList.push(e);return e;};
  const player=spawnEntity({type:'ship',hull:100,hullMax:100,pos:entry,data:{ai:null},isPlayer:true});
  const events=[];for(const name of ['economy:grantCredits','faction:repDelta','convoyRaid:settled'])bus.on(name,p=>events.push({name,...p}));
  const builders={makeShipEntitySpec:()=>({type:'ship',data:{ai:null},hull:900,hullMax:900}),
    makeEnemySpawnSpec:(id,level,pos)=>({type:'ship',pos,mass:40,hull:100,hullMax:100,data:{ai:{},defId:id}})};
  const registry=new Map([['lawSecurity',{reportIncident:()=>({accepted:true,incidentReceiptId:'law:test'})}]]);
  const helpers={spawnEntity,removeEntity(id){const e=state.entities.get(id);if(e)e.alive=false;state.entities.delete(id);removed.push(id);},
    spawnBudget:{request:n=>n,bindEntity(){},release(){},releaseSome(){}}};
  const system=createConvoyRaidSystem(builders);system.init({state,bus,helpers,registry});
  if(autoStart){const started=system.start({runId:`live:${seed}`,seed,choice});assert.equal(started.ok,true,started.reason);}
  const record=system.snapshot();
  return {system,state,bus,player,events,removed,record,spawnEntity,registry,
    tick(){state.simTime+=DT;state.tick++;system.update(DT,state);},
    entity(bodyId){return state.entities.get(record.bindings[bodyId].entityId);}};
}

test('production adapter queues through real physicsAuthority without writing transforms or velocity',()=>{
  const f=runtimeFixture();const target=f.entity(f.record.train.targetId);target.pos.z+=2;
  const before={pos:{...target.pos},vel:{...target.vel},rot:target.rot,angVel:target.angVel};
  f.tick();const command=consumePhysicsCommand(target);assert.ok(command&&command.impulses.length>0);
  assert.deepEqual({pos:{...target.pos},vel:{...target.vel},rot:target.rot,angVel:target.angVel},before);
  assert.equal(consumePhysicsCommand(target),null,'mailbox consumes once');assert.equal(f.state.player.credits,7);
  for(const body of f.record.train.bodies)assert.equal(resolvePhysicsBodySpec(f.entity(body.id)).contact.angularDamping,0,'freight must not silently damp angular momentum');
  assert.equal(f.record.train.bodies.length,5);assert.equal(f.record.escortBindings.length,2);assert.equal(Object.keys(f.record.receiverBindings).length,2);
  f.system.destroy();
});

test('runtime validates command identity and rejects recycled entity occupants',()=>{
  const f=runtimeFixture();assert.equal(f.system.command({runId:'other',type:'abandon'}),false);
  assert.equal(f.system.command({runId:f.record.id,type:'damageCoupler',couplerId:f.record.train.couplers[0].id,amount:1}),false);
  const body=f.record.train.bodies.find(b=>b.role==='carriage'&&!b.target),binding=f.record.bindings[body.id];
  const recycled=makeEntity({type:'ship',hull:100,pos:{x:1,z:2},data:{convoyRaid:{runId:f.record.id,bodyId:body.id}}});
  recycled.id=binding.entityId;recycled.occupantGeneration=2;f.state.entities.set(recycled.id,recycled);
  f.tick();assert.equal(body.lost,true);assert.equal(consumePhysicsCommand(recycled),null);
  f.system.destroy();
});

test('runtime restore never spawns missing freight and settled owners emit money/reputation only once',()=>{
  const f=runtimeFixture(),nonTarget=f.record.train.bodies.find(b=>b.role==='carriage'&&!b.target);
  const missing=f.entity(nonTarget.id);const saved=f.system.serialize(),count=f.state.entityList.length;
  f.state.entities.delete(missing.id);f.state.entityList=f.state.entityList.filter(e=>e!==missing);
  f.system.restore(saved);assert.equal(f.system.snapshot().train.bodies.find(b=>b.id===nonTarget.id).lost,true);
  assert.equal(f.state.entityList.length,count-1);
  // Drive the actual adapter to physical theft settlement via observed body state.
  const r=f.system.snapshot();isolate(r.train);const target=f.state.entities.get(r.bindings[r.train.targetId].entityId),gate=r.train.route.fork;
  target.pos.set(gate.x-gate.nx*2,0,gate.z-gate.nz*2);target.vel.set(gate.nx*8,0,gate.nz*8);f.player.pos.copy(target.pos);f.tick();
  target.pos.set(gate.x+gate.nx*2,0,gate.z+gate.nz*2);f.player.pos.copy(target.pos);f.tick();
  assert.equal(r.raid.forkCrossed,true);
  const receiver=r.train.route.receivers.illicit;target.pos.set(receiver.x,0,receiver.z);target.vel.set(0,0,0);f.player.pos.copy(target.pos);
  for(let i=0;i<100;i++)f.tick();
  assert.equal(r.raid.phase,'settled');assert.equal(f.events.filter(e=>e.name==='economy:grantCredits').length,1);
  assert.equal(f.events.filter(e=>e.name==='faction:repDelta').length,1);assert.equal(f.removed.filter(id=>id===target.id).length,1);
  const after=f.system.serialize();f.system.restore(after);for(let i=0;i<10;i++)f.tick();
  assert.equal(f.events.filter(e=>e.name==='economy:grantCredits').length,1);assert.equal(f.events.filter(e=>e.name==='faction:repDelta').length,1);
  f.system.destroy();
});

test('presentation reads target identity, non-color tells and service eligibility without mutating sim',()=>{
  const f=controllerFixture(),g=getCouplerGeometry(f.train,jointsOf(f.train)[0].id);
  Object.assign(f.player,{x:g.x,z:g.z,vx:f.train.bodies[0].vx,vz:f.train.bodies[0].vz});
  const before=JSON.stringify({train:serializeTrain(f.train),raid:serializeRaid(f.raid)});
  const hint=describeSwitchbackInteraction({raid:f.raid,train:f.train,player:f.player,simTime:0,mode:'flight'},createSwitchbackInteractionFrame());
  assert.equal(hint.visible,true);assert.equal(hint.eligible,true);
  const view=projectSwitchbackPresentation(f.raid,f.train,{simTime:0,reducedMotion:true,reducedFlash:true});
  assert.equal(view.targetId,f.train.targetId);assert.ok(view.targetSerial);assert.equal(view.bodyCount,5);
  assert.equal(JSON.stringify({train:serializeTrain(f.train),raid:serializeRaid(f.raid)}),before);
});

test('a real velocity shock propagates through couplers and frees the target without damage commands',()=>{
  const train=trainFor(4242),targetId=train.targetId,body=train.bodies[2];body.vx+=100;
  for(let tick=1;tick<=180;tick++){
    const plan=planTrainStep(train,DT,tick*DT);
    integrateTrainHeadless(train,DT,plan);
  }
  assert.ok(train.couplers.filter(c=>c.severed).length>=2);
  assert.equal(train.targetId,targetId);assert.ok(getTrainComponents(train).length>=3);
  assert.ok(train.bodies.every(b=>[b.x,b.z,b.vx,b.vz,b.omega].every(Number.isFinite)));
});

test('runtime cancel intent cancels the physical service latch before release',()=>{
  const f=runtimeFixture(),joint=jointsOf(f.record.train)[0],g=getCouplerGeometry(f.record.train,joint.id);
  const a=f.record.train.bodies.find(b=>b.id===joint.aId),b=f.record.train.bodies.find(b=>b.id===joint.bId);
  f.player.pos.set(g.x,0,g.z);f.player.vel.set((a.vx+b.vx)/2,0,(a.vz+b.vz)/2);
  assert.equal(f.system.command({runId:f.record.id,type:'releaseCoupler',couplerId:joint.id}),true);f.tick();
  assert.equal(f.record.raid.quietLatch.couplerId,joint.id);
  assert.equal(f.system.command({runId:f.record.id,type:'cancelLatch'}),true);f.tick();
  assert.equal(f.record.raid.quietLatch.couplerId,null);assert.equal(joint.severed,false);
  f.system.destroy();
});

test('runtime converts actual player combat evidence against its raider into lawful defense',()=>{
  const f=runtimeFixture(8191,'escort');
  f.record.train.routeDistance=f.record.train.route.length*.31;f.tick();
  assert.equal(f.record.raiderBindings.length,2);
  const raider=f.state.entities.get(f.record.raiderBindings[0].entityId);
  f.bus.emit('combat:damage',{targetId:raider.id,attackerId:f.player.id,applied:25,amount:25,pos:{...raider.pos}});f.tick();
  assert.equal(f.record.raid.defended,true);assert.equal(f.record.raid.crimeCommitted,false);
  f.system.destroy();
});

test('an unattended environmental fork crossing does not falsely criminalize a lawful escort',()=>{
  const f=controllerFixture(4242,'escort');isolate(f.train);cross(f);
  assert.equal(f.raid.crimeCommitted,false);assert.equal(f.raid.forkCrossed,false);
  // A genuine recovery tow is lawful until the player diverts that handled freight through the illicit fork.
  f.tick([{type:'interference',bodyId:f.train.targetId}]);assert.equal(f.raid.crimeCommitted,false);
  cross(f);assert.equal(f.raid.crimeCommitted,true);assert.equal(f.raid.forkCrossed,true);
});

test('runtime service release propagates a finite brace to every surviving coupling',()=>{
  const f=runtimeFixture(),joint=jointsOf(f.record.train)[0],g=getCouplerGeometry(f.record.train,joint.id);
  const a=f.record.train.bodies.find(b=>b.id===joint.aId),b=f.record.train.bodies.find(b=>b.id===joint.bId);
  f.player.pos.set(g.x,0,g.z);f.player.vel.set((a.vx+b.vx)/2,0,(a.vz+b.vz)/2);
  f.system.command({runId:f.record.id,type:'releaseCoupler',couplerId:joint.id});
  for(let i=0;i<75;i++)f.tick();
  assert.equal(joint.severed,true);assert.ok(f.record.train.braceUntil>f.state.simTime);
  for(const c of f.record.train.couplers.filter(c=>!c.severed))assert.ok(c.braceUntil>f.state.simTime);
  assert.ok(f.record.train.braceUntil<=f.state.simTime+8);
  f.system.destroy();
});

test('settling a lawful contract preserves physical coupling and continues owner-queued train forces',()=>{
  const f=runtimeFixture(4242,'escort'),r=f.record,target=f.entity(r.train.targetId),receiver=r.train.route.receivers.lawful;
  const dx=receiver.x-target.pos.x,dz=receiver.z-target.pos.z;
  for(const body of r.train.bodies){const e=f.entity(body.id);e.pos.x+=dx;e.pos.z+=dz;e.vel.set(0,0,0);}
  f.player.pos.copy(target.pos);r.raid.coverS=25;f.tick();
  assert.equal(r.raid.phase,'settled');assert.equal(r.train.couplers.filter(c=>c.severed).length,0);
  for(const body of r.train.bodies)consumePhysicsCommand(f.entity(body.id));
  f.tick();let queued=0;
  for(const body of r.train.bodies){const c=consumePhysicsCommand(f.entity(body.id));queued+=(c?.impulses.length||0)+(c?.torqueImpulses.length||0);}
  assert.ok(queued>0,'completed contracts must not freeze a living coupled train');
  assert.equal(f.events.filter(e=>e.name==='economy:grantCredits').length,1);
  f.system.destroy();
});

test('runtime rejects mismatched saved run/train identity without spawning or paying',()=>{
  const f=runtimeFixture(),saved=f.system.serialize(),count=f.state.entityList.length;
  saved.active.id='different-run';
  assert.equal(f.system.restore(saved),false);assert.equal(f.system.snapshot(),null);
  assert.equal(f.state.entityList.length,count);assert.equal(f.events.length,0);
  f.system.destroy();
});

for(const seed of SEEDS)test(`seed ${seed}: existing prompt-deck action is one-shot, cancelable and stale-safe`,()=>{
  const train=trainFor(seed),raid=createRaid({runId:`prompt:${seed}`,seed,train});
  const g=getCouplerGeometry(train,train.couplers[1].id),a=train.bodies[1],b=train.bodies[2];
  const player={id:'player',x:g.mid.x,z:g.mid.z,vx:(a.vx+b.vx)/2,vz:(a.vz+b.vz)/2,hp:100};
  advanceRaid(raid,{train,player,simTime:0,dt:0},[{type:'choose',choice:'theft'}]);
  const input={train,raid,player,simTime:0,mode:'flight'},decisions=new Map(),commands=[];
  const deck={hasDecision:id=>decisions.has(id),offerDecision:s=>{decisions.set(s.id,s);return true;},
    updateDecision:(id,s)=>{if(!decisions.has(id))return false;decisions.set(id,s);return true;},resolveDecision:id=>decisions.delete(id)};
  const ui=createSwitchbackInteractions({bus:{emit:(event,p)=>{assert.equal(event,'convoyRaid:command');commands.push(p);}},getDeck:()=>deck});
  assert.equal(describeSwitchbackInteraction(input).eligible,true);ui.update(input);
  const card=[...decisions.values()][0];card.onChoose('release');card.onChoose('release');
  assert.equal(commands.length,1);assert.equal(commands[0].type,'releaseCoupler');
  advanceRaid(raid,{train,player,simTime:DT,dt:DT},[commands[0]]);input.simTime=DT;ui.update(input);assert.equal(ui.inspect().servicing,true);
  const cancel=[...decisions.values()][0];cancel.onChoose('cancel');assert.equal(commands[1].type,'cancelLatch');
  advanceRaid(raid,{train,player,simTime:2*DT,dt:DT},[commands[1]]);assert.equal(raid.quietLatch.couplerId,null);assert.equal(train.couplers[1].severed,false);
  ui.dispose();assert.equal(decisions.size,0);card.onChoose('release');assert.equal(commands.length,2);
  braceTrain(train,{until:4,simTime:1});input.simTime=1;assert.equal(describeSwitchbackInteraction(input).eligible,false);
  player.x+=1000;assert.equal(describeSwitchbackInteraction(input).visible,false);
});

test('presentation coupler tells coincide with physical anchors and distinguish a detached chain from one free target',()=>{
  const f=controllerFixture(),view=projectSwitchbackPresentation(f.raid,f.train,{simTime:0});
  for(let i=0;i<f.train.couplers.length;i++){
    const geometry=getCouplerGeometry(f.train,f.train.couplers[i].id);
    almost(view.couplers[i].ax,geometry.a.x);almost(view.couplers[i].bz,geometry.b.z);
  }
  const joints=jointsOf(f.train);severCoupler(f.train,joints[0].id);
  let split=projectSwitchbackPresentation(f.raid,f.train,{simTime:1});
  assert.equal(split.targetDetached,true);assert.equal(split.targetAlone,false);
  severCoupler(f.train,joints[1].id);split=projectSwitchbackPresentation(f.raid,f.train,{simTime:1});
  assert.equal(split.targetDetached,true);assert.equal(split.targetAlone,true);assert.match(split.readout.target,/FREE CARRIAGE/);
  markBodyLost(f.train,f.train.targetId);split=projectSwitchbackPresentation(f.raid,f.train,{simTime:2});
  assert.equal(split.targetLost,true);assert.match(split.readout.target,/LOST/);
});

test('convoy control replaces stock flight braking while preserving already queued player-power impulses',()=>{
  const f=runtimeFixture(),tug=f.entity(f.record.train.bodies[0].id);
  writePhysicsControl(tug,{source:'flightV3',mode:'actuator',force:{x:-400,y:0,z:300},torque:{x:0,y:90,z:0},maxSpeed:50});
  queuePhysicsImpulse(tug,{x:17,y:0,z:-9},{source:'test-player-shove'});
  f.tick();const command=consumePhysicsCommand(tug);
  assert.equal(command.control.source,'convoyRaid:tug');assert.equal(command.control.mode,'actuator');
  assert.deepEqual(command.control.force,{x:0,y:0,z:0});assert.deepEqual(command.control.torque,{x:0,y:0,z:0});
  assert.ok(command.impulses.some(j=>j.x===17&&j.z===-9),'queued Shove impulse survives continuous-control replacement');
  assert.ok(command.impulses.length>1,'train force joins external force through same owner queue');
  f.system.destroy();
});

test('escort doctrine keeps its response clock, never attacks guarded freight, and pursues a witnessed thief',()=>{
  const f=runtimeFixture(8191,'escort');
  const guards=f.record.escortBindings.map(b=>f.state.entities.get(b.entityId));
  assert.ok(guards.every(e=>e.data.ai.activity.targetId===null));
  const clocks=guards.map(e=>e.data.ai.activity.startedTick);
  for(let i=0;i<30;i++)f.tick();
  assert.deepEqual(guards.map(e=>e.data.ai.activity.startedTick),clocks,'same guard order must not reset first-fire response window');
  f.bus.emit('tether:attached',{actorId:f.player.id,targetId:f.entity(f.record.train.targetId).id,controllerId:f.player.id});
  for(let i=0;i<30;i++)f.tick();
  assert.equal(f.record.raid.crimeCommitted,true);assert.equal(guards[1].team,1);
  assert.equal(guards[1].data.ai.retaliationTargetId,f.player.id);
  assert.equal(guards[1].data.ai.activity.targetId,f.player.id);
  assert.equal(guards[0].data.ai.activity.targetId,null,'screening guard must not target the protected cargo');
  f.system.destroy();
});

function directorFixture(state) {
  const calls=[];
  return {calls,now:()=>state.simTime,
    abort(live,reason){calls.push({type:'abort',reason});live.phase='done';live.outcome=reason;},
    resolve(live,outcome){calls.push({type:'resolve',outcome});live.phase='done';live.outcome=outcome;},
    say(live,kind,text){calls.push({type:'say',kind,text});},
    offerChoices(live,choices,fallback,deadlineAt){calls.push({type:'choices',choices,fallback,deadlineAt});}};
}

test('real encounter wrapper offers without spawning; decline, timeout and wrong-sector remain optional',()=>{
  assert.equal(catalogRuntime,SWITCHBACK_ENCOUNTER_RUNTIME);
  for(const ending of ['decline','timeout','wrong-sector']) {
    const f=runtimeFixture(4242,'theft',false),d=directorFixture(f.state),live={id:`offer:${ending}`,vars:{},phase:'initial'};
    if(ending==='wrong-sector')f.state.world.currentSectorId='sector_helios_prime';
    SWITCHBACK_ENCOUNTER_RUNTIME.fire(d,live,f.state);
    assert.equal(f.state.entityList.length,1,'offers do not create physical freight');
    if(ending==='wrong-sector') {
      assert.equal(switchbackOfferReady(f.state),false);assert.equal(d.calls.at(-1).type,'abort');
    } else {
      assert.equal(live.phase,'offer');assert.deepEqual(d.calls.find(c=>c.type==='choices').choices,['escort','theft','decline']);
      if(ending==='decline')SWITCHBACK_ENCOUNTER_RUNTIME.choose(d,live,f.state,'decline');
      else SWITCHBACK_ENCOUNTER_RUNTIME.tick(d,live,f.state,live.deadlineAt+.01);
      assert.equal(live.outcome,'declined');
    }
    assert.equal(f.state.entityList.length,1);assert.equal(f.system.snapshot(),null);assert.equal(f.events.length,0);
    f.system.destroy();
  }
});

test('geographic direct encounter request starts one physical cast and director ticks never advance physics',()=>{
  const f=runtimeFixture(8191,'theft',false),requests=[];
  f.registry.set('encounterDirector',{requestAuthoredEncounter(spec){requests.push(spec);return{ok:true};}});
  assert.equal(f.system.requestOffer().ok,true);assert.equal(requests.length,1);
  assert.equal(requests[0].shapeId,SWITCHBACK.encounterId);assert.equal(requests[0].zoneType,'mining_belt');
  assert.deepEqual(switchbackTrigger.zoneTypes,[],'ambient calendar cannot put this departure at an arbitrary zone');
  assert.equal(f.system.requestOffer(),false,'proximity updates cannot repeat offers');
  const d=directorFixture(f.state),live={id:'director:accepted',vars:{},phase:'initial'};
  SWITCHBACK_ENCOUNTER_RUNTIME.fire(d,live,f.state);
  SWITCHBACK_ENCOUNTER_RUNTIME.choose(d,live,f.state,'theft');
  assert.equal(live.phase,'switchback_running');const count=f.state.entityList.length;
  assert.equal(count,10,'one player, five freight bodies, two escorts, two real receivers');
  const record=f.system.snapshot(),before=record.train.bodies.map(kinematics);
  SWITCHBACK_ENCOUNTER_RUNTIME.choose(d,live,f.state,'escort');
  for(let i=0;i<8;i++)SWITCHBACK_ENCOUNTER_RUNTIME.tick(d,live,f.state,10+i);
  assert.equal(f.state.entityList.length,count);assert.deepEqual(record.train.bodies.map(kinematics),before);
  for(const body of record.train.bodies)assert.equal(consumePhysicsCommand(f.state.entities.get(record.bindings[body.id].entityId)),null);
  assert.ok(f.state.entityList.filter(e=>e!==f.player).every(e=>e.flags.persistent===true));
  f.system.destroy();
});

test('save deserialize stages freight before actor respawn and save:loaded safely rebinds new physical IDs',()=>{
  const f=runtimeFixture(),saved=f.system.serialize(),actors=f.state.entityList.filter(e=>e!==f.player);
  const originalTargetId=f.record.bindings[f.record.train.targetId].entityId;
  f.bus.emit('save:restoring',{});f.state.entities=new Map([[f.player.id,f.player]]);f.state.entityList=[f.player];
  assert.equal(f.system.deserialize(saved),true);
  assert.ok(f.system.snapshot().train.bodies.every(b=>!b.lost),'deserialization is not an absent-body verdict');
  f.tick();assert.ok(f.system.snapshot().train.bodies.every(b=>!b.lost),'load pause prevents premature tombstones');
  for(const actor of actors)f.spawnEntity({...actor,pos:{...actor.pos},vel:{...actor.vel},data:{...actor.data},flags:{...actor.flags}});
  f.bus.emit('save:loaded',{});const record=f.system.snapshot();
  assert.ok(record.train.bodies.every(b=>!b.lost));assert.notEqual(record.bindings[record.train.targetId].entityId,originalTargetId);
  assert.equal(f.state.entityList.length,actors.length+1);assert.equal(record.raid.targetId,saved.active.raid.targetId);
  f.tick();assert.equal(record.raid.phase,'running');assert.equal(f.events.length,0);
  f.system.destroy();
});

test('NPC tether attachment does not criminalize the player',()=>{
  const f=runtimeFixture(),cargo=f.entity(f.record.train.targetId),escort=f.state.entities.get(f.record.escortBindings[0].entityId);
  f.bus.emit('tether:attached',{actorId:escort.id,targetId:cargo.id,controllerId:escort.id});f.tick();
  assert.equal(f.record.raid.crimeCommitted,false);assert.equal(f.record.raid.targetHandled,false);
  f.system.destroy();
});

test('Twin Bridle cargo-first attachment attributes the player controller at the other endpoint',()=>{
  const f=runtimeFixture(),cargo=f.entity(f.record.train.targetId);
  const anchor=f.spawnEntity({type:'payload',pos:{...cargo.pos},hull:100,ownerId:f.player.id,data:{}});
  f.bus.emit('tether:attached',{actorId:cargo.id,targetId:anchor.id,controllerId:f.player.id});f.tick();
  assert.equal(f.record.raid.crimeCommitted,true);assert.equal(f.record.raid.targetHandled,true);
  assert.equal(f.record.raid.targetId,cargo.data.convoyRaid.bodyId);
  f.system.destroy();
});

test('field hitch attribution accepts a player-owned anchor while ignoring an unrelated source',()=>{
  const f=runtimeFixture(),cargo=f.entity(f.record.train.targetId);
  const npcAnchor=f.spawnEntity({type:'payload',pos:{...cargo.pos},hull:100,ownerId:999,data:{}});
  f.bus.emit('fields:hitchLatched',{sourceId:npcAnchor.id,entityId:cargo.id});f.tick();
  assert.equal(f.record.raid.crimeCommitted,false);
  const playerAnchor=f.spawnEntity({type:'payload',pos:{...cargo.pos},hull:100,ownerId:f.player.id,data:{}});
  f.bus.emit('fields:hitchLatched',{sourceId:playerAnchor.id,entityId:cargo.id});f.tick();
  assert.equal(f.record.raid.crimeCommitted,true);assert.equal(f.record.raid.targetHandled,true);
  f.system.destroy();
});
