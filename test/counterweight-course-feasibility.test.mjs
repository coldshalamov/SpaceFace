import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, writePhysicsControl, cancelOwnedPhysicsControl } from '../src/core/physicsAuthority.js';
import { ships, makeShipEntitySpec } from '../src/systems/ships.js';
import { combat } from '../src/systems/combat.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { economy } from '../src/systems/economy.js';
import { save } from '../src/save/saveSystem.js';
import { scanner } from '../src/systems/scanner.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { PRODUCTION_FEATURES } from '../src/runtime/runtimeProfiles.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { createCounterweightCircuitSystem } from '../src/features/counterweightCircuit/runtime.js';
import { venueAnchorGlobal, venueGlobalPos } from '../src/features/counterweightCircuit/physical.js';
import { COUNTERWEIGHT_EVENT_BY_ID, VENUE_SECTOR_ID } from '../src/features/counterweightCircuit/definition.js';
import { ghostPoseAt } from '../src/features/counterweightCircuit/ghost.js';
import { freshEventRecord } from '../src/features/counterweightCircuit/scoring.js';

let previousFlags;
test.before(() => { previousFlags = snapshotFeatureMaps(); applyFeatureConfigToMaps(PRODUCTION_FEATURES); });
test.after(() => restoreFeatureMaps(previousFlags));

const DT = 1 / 60;
const okay = (r) => assert.equal(r?.ok, true, r?.reason || JSON.stringify(r));

async function fixture({ seed = 8206, playerX = 40, withSave = false } = {}) {
  const circuit = createCounterweightCircuitSystem();
  const sim = createSimulation({
    seed,
    systems: [ships, economy, physics, combat, collisionConsequences, scanner, tetherGameplay, ...(withSave ? [save] : []), circuit],
  });
  const s = sim.state;
  s.mode = 'flight';
  s.world.currentSectorId = VENUE_SECTOR_ID;
  s.input.actions ||= {};
  s.settings.gameplay.physicsBackend = 'rapier-dynamic';
  s.ui.docked = false;
  const anchor = venueAnchorGlobal();
  sim.registry.get('ships').newGame();
  const player = sim.spawn(makeShipEntitySpec('ship_kestrel', {
    isPlayer: true, player: s.player,
    pos: { x: anchor.x + playerX, z: anchor.z }, fittings: [],
  }));
  s.playerId = player.id;
  const owner = sim.registry.get('counterweightCircuit');
  const native = sim.registry.get('physics');
  const kernel = getCombatKernel(owner.ctx);
  const offers = [];
  sim.bus.on('counterweightCircuit:offer', (o) => offers.push(o));
  function tick(count = 1, control = null) {
    for (let i = 0; i < count; i++) {
      s.tick++; s.simTime = s.tick * DT;
      if (control) control();
      native.update(DT, s);
      sim.registry.get('combat').update(DT, s);
      sim.registry.get('collisionConsequences').update(DT, s);
      sim.registry.get('tetherGameplay').update(DT, s);
      owner.update(DT, s);
    }
  }
  await native.prepareBackend(s);
  native.update(DT, s);
  tick(3);
  const row = () => s.world.counterweightCircuit;
  const attach = (entity) => {
    const r = kernel.attachments.create({
      defId: 'tether_standard', ownerId: player.id, targetId: entity.id,
      sourceWorld: { ...player.pos }, targetWorld: { ...entity.pos },
    });
    okay(r);
    return r.attachment;
  };
  const near = (entity, dx = 30, dz = 0) => {
    player.pos.set(entity.pos.x + dx, 0, entity.pos.z + dz);
    player.vel.set(0, 0, 0);
    native.update(DT, s);
  };
  const acceptPresentation = () => {
    const attempt = owner._attempt(), admission = s.counterweightCircuitView.admission;
    tick(3);
    sim.bus.emit('counterweightCircuit:presentationReady', { attemptId: attempt.attemptId,
      generation: admission.generation, bodies: admission.bodies.map(({ id, generation }) => ({ id, generation })) });
    tick(1);
    assert.equal(attempt.admissionPending, false, 'fixture supplies a presentation receipt after native admission');
  };
  return { sim, s, owner, native, kernel, player, tick, row, attach, near, offers, anchor, acceptPresentation };
}

function drivePilot(body, goal, { speed = 7, accel = 5 } = {}) {
  const dx = goal.x - body.pos.x, dz = goal.z - body.pos.z, distance = Math.hypot(dx, dz);
  const desired = Math.min(speed, distance * 1.2, Math.sqrt(2 * accel * distance));
  const ax = (dx / Math.max(distance, .001) * desired - body.vel.x) * 2;
  const az = (dz / Math.max(distance, .001) * desired - body.vel.z) * 2;
  const scale = Math.min(1, accel / Math.max(.001, Math.hypot(ax, az)));
  writePhysicsControl(body, { source: 'counterweight-integrated-test',
    force: { x: ax * scale * body.mass, y: 0, z: az * scale * body.mass },
    torque: { x: 0, y: -body.angVel * (body.physicsBody?.inertiaY || body.mass) * 4, z: 0 }, maxSpeed: speed });
}



test('Split Decision: two original native loads park and score through one line', async () => {
  const f=await fixture({playerX:225}),{s,owner,player,tick,attach,kernel,acceptPresentation,row}=f;
  assert.equal(owner._startAttempt('split_decision',false),true);acceptPresentation();
  const attempt=owner._attempt(),a=attempt.cohort.get('load_b'),b=attempt.cohort.get('load_a');
  const sa=attempt.cohort.get('shelf_b'),sb=attempt.cohort.get('shelf_a');
  const original=[a,b].map(x=>({id:x.id,gen:x.occupantGeneration}));
  let line=attach(a),cut=false,latest;
  const physical=owner._physical(),observe=physical.observe;
  physical.observe=(...args)=>{latest=observe(...args);return latest;};
  for(let i=0;i<8000 && owner._attempt();i++) {
    tick(1,()=>{drivePilot(a,{x:sa.pos.x+24,z:sa.pos.z},{speed:3,accel:3});drivePilot(player,{x:a.pos.x-24,z:a.pos.z+20},{speed:6,accel:4});});
    if(!cut && a.pos.x>sa.pos.x-38 && a.vel.x>0 && a.vel.x<=4) {assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}
    if(cut && latest?.receivers['load_b:shelf_b']?.stable)break;
  }
  assert.ok(cut,JSON.stringify({a:a.pos,vel:a.vel,sa:sa.pos,player:player.pos,attempt:owner._attempt()?.fsm,last:row().lastResult,line:kernel.attachments.get(line.id)}));
  assert.equal(latest?.receivers['load_b:shelf_b']?.stable,true,'first native support');
  for(let i=0;i<7000 && Math.hypot(player.pos.x-b.pos.x,player.pos.z-b.pos.z)>34;i++)tick(1,()=>drivePilot(player,{x:b.pos.x-24,z:b.pos.z}));
  assert.ok(Math.hypot(player.pos.x-b.pos.x,player.pos.z-b.pos.z)<=34,`cannot approach second: ${JSON.stringify({player:player.pos,b:b.pos})}`);
  line=attach(b);tick(2);assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;
  for(let i=0;i<9000 && owner._attempt();i++) {
    tick(1,()=>{if (!cut || b.pos.x<sb.pos.x+12) drivePilot(b,{x:sb.pos.x+24,z:sb.pos.z},{speed:3,accel:3}); else cancelOwnedPhysicsControl(b,'counterweight-integrated-test');drivePilot(player,{x:b.pos.x-45,z:b.pos.z-40},{speed:6,accel:4});});
    if(!cut && b.pos.x>sb.pos.x-38 && b.vel.x>0 && b.vel.x<=4) {assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}
  }
  assert.equal(!!owner._attempt(),false,JSON.stringify({cut,a:a.pos,b:b.pos,player:player.pos,fsm:attempt.fsm,receivers:latest?.receivers}));
  assert.equal(row().lastResult.outcome,'complete');assert.equal(row().records.split_decision.paid,true);
  assert.deepEqual([a,b].map(x=>({id:x.id,gen:x.occupantGeneration})),original);
});
function driveBodyRelative(body,goal,goalVel={x:0,z:0},{speed=12,accel=5}={}) {
 const dx=goal.x-body.pos.x,dz=goal.z-body.pos.z,d=Math.hypot(dx,dz),v=Math.min(speed,d*1.2,Math.sqrt(2*accel*d));
 const ax=(dx/Math.max(d,.001)*v+goalVel.x-body.vel.x)*2,az=(dz/Math.max(d,.001)*v+goalVel.z-body.vel.z)*2;
 const scale=Math.min(1,accel/Math.max(.001,Math.hypot(ax,az)));
 writePhysicsControl(body,{source:'counterweight-relative-fixture',force:{x:ax*scale*body.mass,y:0,z:az*scale*body.mass},torque:{x:0,y:-body.angVel*(body.physicsBody?.inertiaY||body.mass)*4,z:0},maxSpeed:speed+Math.hypot(goalVel.x,goalVel.z)});
}

test('Moving Berth native relative-speed witness completes the scored owner',async()=>{
 const {owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:235});
 row().records.soft_berth={...freshEventRecord(),completions:1};
 assert.equal(owner._startAttempt('moving_berth',false),true);acceptPresentation();
 const attempt=owner._attempt(),load=attempt.cohort.get('load'),barge=attempt.cohort.get('barge');
 const line=attach(load);tick(3);assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);
 for(let i=0;i<9000&&owner._attempt();i++)tick(1,()=>driveBodyRelative(load,{x:barge.pos.x+29,z:barge.pos.z},barge.vel,{speed:10,accel:5}));
 assert.equal(!!owner._attempt(),false,JSON.stringify({load:load.pos,barge:barge.pos,vel:load.vel,bargeVel:barge.vel,fsm:attempt.fsm}));
 assert.equal(row().lastResult.outcome,'complete');assert.equal(row().records.moving_berth.paid,true);
});

test('bounded pilot-only Moving Berth approach remains pending without a false award',async()=>{
 const {s,owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:235});
 row().records.soft_berth={...freshEventRecord(),completions:1};assert.equal(owner._startAttempt('moving_berth',false),true);acceptPresentation();
 const attempt=owner._attempt(),load=attempt.cohort.get('load'),barge=attempt.cohort.get('barge');
 const line=attach(load);let cut=false;s.input.actions.reelDelta=-1;
 for(let i=0;i<7000&&owner._attempt();i++) {
  tick(1,()=>drivePilot(player,{x:barge.pos.x+6,z:barge.pos.z+(cut?-16:0)},{speed:7,accel:4}));
  const rel=Math.hypot(load.vel.x-barge.vel.x,load.vel.z-barge.vel.z);
  if(!cut && load.pos.x>barge.pos.x-40 && load.pos.x<barge.pos.x-25 && rel<4) {s.input.actions.reelDelta=0;assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}
 }
 assert.equal(cut,false);assert.equal(owner._attempt()?.fsm.phase,'running');assert.equal(row().records.moving_berth?.paid ?? false,false);
});

test('Fragile Freight ordered native gates and receiver compose into a scored result',async()=>{
 const {owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:175});
 assert.equal(owner._startAttempt('fragile_freight',false),true);acceptPresentation();
 const attempt=owner._attempt(),pod=attempt.cohort.get('pod'),receiver=attempt.cohort.get('receiver');
 const line=attach(pod);let cut=false;
 for(let i=0;i<12000&&owner._attempt();i++) {
  const leg=attempt.fsm.legIndex, gate=['baffle_a','baffle_b','baffle_c'][leg-1],g=attempt.def.gates?.[gate];
  const absolute=g?venueGlobalPos({x:g.pos.x+attempt.shift.x,z:g.pos.z+attempt.shift.z}):null;
  const goal=absolute?{x:absolute.x+35,z:absolute.z}:{x:receiver.pos.x+24,z:receiver.pos.z};
  tick(1,()=>{driveBodyRelative(pod,goal,{x:0,z:0},{speed:8,accel:4});drivePilot(player,{x:pod.pos.x-20,z:pod.pos.z+20},{speed:8,accel:5});});
  if(!cut&&leg>=4&&pod.pos.x>receiver.pos.x-42){assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}
 }
 assert.equal(!!owner._attempt(),false,JSON.stringify({pod:pod.pos,player:player.pos,fsm:attempt.fsm,line:kernel.attachments.get(line.id)?.state}));
 assert.equal(row().lastResult.outcome,'complete');assert.equal(row().records.fragile_freight.paid,true);
});

test('Finale same-Line native swing and authentic release reach the ordered gate leg',async()=>{
 const {owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:220});
 for(const id of ['soft_berth','long_arm','clean_sling','fragile_freight','split_decision'])row().records[id]={...freshEventRecord(),completions:1};
 assert.equal(owner._startAttempt('counterweight_finale',false),true);acceptPresentation();
 const attempt=owner._attempt(),load=attempt.cohort.get('load'),anchor=attempt.cohort.get('counterweight');
 const line=attach(load);let waypoint=1;
 for(let i=0;i<4800&&owner._attempt()&&attempt.fsm.legIndex<2;i++) {
  const theta=Math.PI+waypoint*.35,goal={x:anchor.pos.x+200*Math.cos(theta),z:anchor.pos.z+200*Math.sin(theta)};
  if(Math.hypot(player.pos.x-goal.x,player.pos.z-goal.z)<22)waypoint++;
  tick(1,()=>drivePilot(player,goal,{speed:26,accel:8}));
 }
 assert.equal(attempt.fsm.legIndex,2,JSON.stringify({fsm:attempt.fsm,load:load.pos,anchor:anchor.pos}));
 assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);tick(1);
 assert.equal(attempt.fsm.legIndex,3);
});

test('Fragile Freight pilot force and canonical reel clear three native gates and score',async()=>{
 const {s,owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:175});
 assert.equal(owner._startAttempt('fragile_freight',false),true);acceptPresentation();
 const attempt=owner._attempt(),pod=attempt.cohort.get('pod'),receiver=attempt.cohort.get('receiver');
 const line=attach(pod);let cut=false,maxLeg=0;s.input.actions.reelDelta=-1;
 for(let i=0;i<8000&&owner._attempt();i++){
  const leg=attempt.fsm.legIndex;maxLeg=Math.max(maxLeg,leg);
  const gate=attempt.def.gates?.[['baffle_a','baffle_b','baffle_c'][leg-1]];
  const target=gate?venueGlobalPos({x:gate.pos.x+attempt.shift.x+50,z:gate.pos.z+attempt.shift.z}):{x:receiver.pos.x+6,z:receiver.pos.z};
  tick(1,()=>drivePilot(player,{x:target.x,z:target.z+(cut?-16:0)},{speed:7,accel:4}));
  if(!cut&&leg>=4&&pod.pos.x>receiver.pos.x-38&&pod.vel.x>0&&pod.vel.x<=4){s.input.actions.reelDelta=0;assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}
 }
 assert.equal(maxLeg,4);assert.equal(!!owner._attempt(),false);
 assert.equal(row().lastResult.outcome,'complete');assert.equal(row().records.fragile_freight.paid,true);
});

test('bounded Split pilot approach remains pending without a false award',async()=>{
 const {s,owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:225});
 assert.equal(owner._startAttempt('split_decision',false),true);acceptPresentation();
 const attempt=owner._attempt(),a=attempt.cohort.get('load_b'),b=attempt.cohort.get('load_a'),sa=attempt.cohort.get('shelf_b'),sb=attempt.cohort.get('shelf_a');
 const physical=owner._physical(),observe=physical.observe;let latest;physical.observe=(...args)=>{latest=observe(...args);return latest;};
 let line=attach(a),cut=false;s.input.actions.reelDelta=-1;
 for(let i=0;i<8500&&owner._attempt();i++){
  tick(1,()=>drivePilot(player,{x:sa.pos.x+6,z:sa.pos.z+(cut?-16:0)},{speed:7,accel:5}));
  if(!cut&&a.pos.x>sa.pos.x-32&&Math.abs(a.pos.z-sa.pos.z)<10&&Math.abs(a.vel.z)<.5&&a.vel.x>0&&a.vel.x<=4){s.input.actions.reelDelta=0;assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}
  if(cut&&latest?.receivers['load_b:shelf_b']?.stable)break;
 }
 assert.equal(owner._attempt()?.fsm.phase,'running');assert.equal(row().records.split_decision?.paid ?? false,false);
});

test('Finale native pilot route reaches berth after authentic gate and reacquire',async()=>{
 const {s,owner,player,tick,attach,kernel,acceptPresentation,row}=await fixture({playerX:220});
 for(const id of ['soft_berth','long_arm','clean_sling','fragile_freight','split_decision'])row().records[id]={...freshEventRecord(),completions:1};
 assert.equal(owner._startAttempt('counterweight_finale',false),true);acceptPresentation();
 const attempt=owner._attempt(),load=attempt.cohort.get('load'),anchor=attempt.cohort.get('counterweight'),cradle=attempt.cohort.get('cradle'),gate=attempt.def.gate.absPos;
 let line=attach(load),waypoint=1,cut=false,reacquired=false,berthCut=false,maxLeg=0,reposition=true,berthStage=0;
 for(let i=0;i<12000&&owner._attempt();i++) {
  const leg=attempt.fsm.legIndex;maxLeg=Math.max(maxLeg,leg);
  if(leg<2){const theta=Math.PI+waypoint*.35,goal={x:anchor.pos.x+200*Math.cos(theta),z:anchor.pos.z+200*Math.sin(theta)};
   if(Math.hypot(player.pos.x-goal.x,player.pos.z-goal.z)<22)waypoint++;tick(1,()=>drivePilot(player,goal,{speed:26,accel:8}));continue;}
  if(leg===2){if(load.pos.x<gate.x-55)reposition=false;else if(load.pos.x>gate.x+10)reposition=true;s.input.actions.reelDelta=-1;tick(1,()=>drivePilot(player,reposition?{x:gate.x-90,z:gate.z-35}:{x:gate.x+65,z:gate.z},{speed:10,accel:5}));
   if(!cut&&load.pos.x<gate.x&&load.pos.x>gate.x-35&&Math.abs(load.pos.z-gate.z)<20&&load.vel.x>1){s.input.actions.reelDelta=0;assert.equal(kernel.attachments.cut(line.id,player.id,'tether_cut').ok,true);cut=true;}continue;}
  if(leg===3){tick(1,()=>drivePilot(player,{x:load.pos.x+15,z:load.pos.z},{speed:10,accel:5}));continue;}
  if(leg===4&&!reacquired){if(Math.hypot(player.pos.x-load.pos.x,player.pos.z-load.pos.z)<140){line=attach(load);reacquired=true;s.input.actions.reelDelta=-1;}tick();continue;}
  const points=[{x:cradle.pos.x-40,z:cradle.pos.z-65},{x:cradle.pos.x+65,z:cradle.pos.z-65},{x:cradle.pos.x+65,z:cradle.pos.z}];
  const target=points[berthStage];if(Math.hypot(player.pos.x-target.x,player.pos.z-target.z)<10&&berthStage<2)berthStage++;
  tick(1,()=>drivePilot(player,points[berthStage],{speed:7,accel:5}));
 }
 assert.equal(maxLeg,5,'native swing, cut, gate crossing and reacquire completed');
 assert.equal(cut,true);assert.equal(reacquired,true);
 assert.equal(owner._attempt()?.fsm.phase,'running');assert.equal(row().records.counterweight_finale?.paid ?? false,false);
});
