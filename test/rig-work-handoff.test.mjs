import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse } from '../src/core/physicsAuthority.js';
import { economy } from '../src/systems/economy.js';
import { createRigPhysicsAdapter } from '../src/features/rigWorkshop/physics.js';
import { createRigWorkshopSystem } from '../src/features/rigWorkshop/runtime.js';
import { createWorkshopJobs, rigJobAvailability } from '../src/features/rigWorkshop/jobs.js';
import { captureRigWorkshop, restoreRigWorkshop } from '../src/features/rigWorkshop/persistence.js';

const DT = 1 / 60;
const clone = (value) => JSON.parse(JSON.stringify(value));

async function nativeFixture() {
  const native = await createSg02DynamicBodyOwner();
  const helpers = { combatPhysics: createSg02CombatPhysicsPort(native) };
  const sim = createSimulation({ seed: 8202, systems: [economy], helpers, updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_ceres_belt';
  state.player.credits = 1000;
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 100, hull: 1000, hullMax: 1000, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, shape: 'ball', radius: 8, mass: 100,
      inertiaY: 3000, ccd: true, revision: 0, useMeasuredSkin: false }, data: {} });
  state.playerId = player.id;
  const w = state.rigWorkshop = { version: 1, ownerId: 'pilot:8202',
    bench: { pos: { x: 0, z: 0 }, sectorId: state.world.currentSectorId }, rigs: [], stock: 8, jobs: {}, receipts: [] };
  const physics = createRigPhysicsAdapter(sim.registry.ctx);
  const events = [];
  bus.on('economy:grantCredits', (payload) => events.push(payload));
  const step = (ticks = 1) => {
    for (let i = 0; i < ticks; i++) {
      sim.step(DT);
      native.syncFromEntities(state.entityList);
      physics.update(DT, state.rigWorkshop);
      physics.kernel.prePhysics(DT);
      native.step(DT);
      physics.kernel.postPhysics();
    }
  };
  return { native, sim, state, bus, get w() { return state.rigWorkshop; }, player, physics, events, step,
    close() { physics.dispose(); native.dispose(); sim.dispose(); } };
}



import { workshopAftermath, workshopNextWork } from '../src/features/rigWorkshop/aftermath.js';

async function settled(h, count=2) {
  h.physics.ensureTemplates(h.w); h.step(3);
  const system=createRigWorkshopSystem(); system.init(h.sim.registry.ctx);
  const result=system.jobs.accept(h.w,'kiln'); assert.equal(result.ok,true);h.step(2);
  const job=result.job;
  h.player.pos.x=job.destination.x;h.player.pos.z=job.destination.z;
  for(const record of job.cargo.slice(0,count)) {
    const e=h.state.entities.get(record.id);e.pos.x=job.destination.x;e.pos.z=job.destination.z;
    record.collectedByRig=h.w.rigs[0].id;record.travelled=200;
  }
  if(count) assert.equal(system.jobs.deliver(h.w).ok,true);
  if(!job.settled) assert.equal(system.jobs.settlePartial(h.w).ok,true);
  return {system,job};
}
const choose=(system,h,id)=>{ const p=h.w.prompt;return system.choose({promptId:p.id,revision:p.revision,choiceId:id}); };

test('crew work advice follows real offers, active work, irreversible empty closure and exhausted board',()=>{
 const w={jobs:{},activeJobId:null};
 assert.equal(workshopNextWork(w).id,'needle');
 w.jobs.needle={settled:true,delivered:[1]};assert.equal(workshopNextWork(w).id,'kiln');
 w.jobs.kiln={settled:true,delivered:[2]};assert.equal(workshopNextWork(w).id,'relay');
 assert.match(workshopNextWork(w).detail,/does not accept/);
 w.jobs.relay={settled:false,title:'The Quiet Relay'};w.activeJobId='relay';assert.equal(workshopNextWork(w).kind,'active');
 w.jobs.relay.settled=true;w.activeJobId=null;assert.equal(workshopNextWork(w).kind,'finished');
 delete w.jobs.relay;w.jobs.kiln.delivered=[];assert.equal(workshopNextWork(w).kind,'closed');
 assert.match(workshopNextWork(w).detail,/cannot be paid or reopened/);
});
test('receiving crew bridges settled work to original bench without accepting, spending or autopilot',async()=>{
 const h=await nativeFixture();let system;
 try {({system}=await settled(h)); const courses=[];h.bus.on('ui:setCourse',p=>courses.push(p));
  const before=JSON.stringify({jobs:h.w.jobs,receipts:h.w.receipts,stock:h.w.stock,credits:h.state.player.credits});
  system._showAftermath('kiln');choose(system,h,'next-work');assert.match(h.w.prompt.title,/Needle Orchard/);
  choose(system,h,'bench-return');assert.equal(courses.length,1);assert.deepEqual(courses[0].pos,h.w.bench.pos);assert.equal(courses[0].autopilot,false);
  assert.equal(JSON.stringify({jobs:h.w.jobs,receipts:h.w.receipts,stock:h.w.stock,credits:h.state.player.credits}),before);
  const cold=await nativeFixture();let other;
  try {assert.equal(restoreRigWorkshop(cold.state,captureRigWorkshop(h.state),cold.physics).ok,true);cold.step(3);
   other=createRigWorkshopSystem();other.init(cold.sim.registry.ctx);const job=cold.w.jobs.kiln;const receiver=cold.state.entities.get(job.receiverId);
   cold.player.pos.x=receiver.pos.x;cold.player.pos.z=receiver.pos.z;other._showAftermath('kiln');choose(other,cold,'next-work');
   assert.match(cold.w.prompt.title,/Needle Orchard/);assert.equal(cold.w.activeJobId,null);
  } finally {other?.destroy();cold.close();}
 } finally {system?.destroy();h.close();}
});
test('crew handoff rejects departure and rereads changed work instead of routing stale choices',async()=>{
 const h=await nativeFixture();let system;
 try {({system}=await settled(h));const courses=[];h.bus.on('ui:setCourse',p=>courses.push(p));
  system._showWorkHandoff('kiln');h.player.pos.x+=1000;choose(system,h,'bench-return');assert.equal(courses.length,0);
  h.player.pos.x-=1000;system._showWorkHandoff('kiln');
  // An ordinary accepted job changes the next activity while the old card is visible.
  const old=h.w.prompt;h.player.pos.x=h.w.bench.pos.x;h.player.pos.z=h.w.bench.pos.z;
  const accepted=system.jobs.accept(h.w,'needle');assert.equal(accepted.ok,true);
  const receiver=h.state.entities.get(h.w.jobs.kiln.receiverId);h.player.pos.x=receiver.pos.x;h.player.pos.z=receiver.pos.z;
  courses.length=0;system.choose({promptId:old.id,revision:old.revision,choiceId:'bench-return'});
  assert.equal(courses.length,0);assert.match(h.w.prompt.title,/Continue the open/);assert.ok(h.w.prompt.options.some(o=>o.id==='current-order'));
  choose(system,h,'current-order');assert.equal(h.w.prompt.title,'Where next?');
 } finally {system?.destroy();h.close();}
});

test('handoff never invents an aboard load, present sled or surviving delivered stock',async()=>{
 const h=await nativeFixture();let system;
 try {({system}=await settled(h));const kiln=h.w.jobs.kiln;
  for(const id of kiln.delivered) h.state.entities.get(id).hull=0;
  // No rig is present at the bench; advice must remain historical rather than relocate it.
  for(const rig of h.w.rigs) for(const id of rig.partIds){const e=h.state.entities.get(id);if(e)e.pos.x+=2000;}
  assert.equal(workshopAftermath(h.state,h.w,'kiln').originals.length,0);
  const w={jobs:{needle:{settled:true,delivered:[1]}},rigs:[]};
  assert.match(workshopNextWork(w).detail,/was built/);assert.doesNotMatch(workshopNextWork(w).detail,/already at the bench/);
  w.jobs.kiln={settled:false,title:'A Very Bad Centre of Gravity',cargo:[]};w.activeJobId='kiln';
  assert.equal(workshopNextWork(w).title,'Continue the open work order');
  w.jobs.kiln.settled=true;w.jobs.kiln.delivered=[2];w.jobs.relay={settled:true};w.activeJobId=null;
  assert.match(workshopNextWork(w).detail,/do not guarantee/);
 }finally{system?.destroy();h.close();}
});
