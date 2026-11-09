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

// Fixture setup moves the unloaded rig to a pickup position. Every metre of
// cargo travel after capture is solved by the actual native owner below; no
// cargo pose, travelled-distance ledger, or reward is forged by the test.
function stageUnloadedRig(h, rig, holder, cargo, offset = { x: -5, z: 0 }) {
  const delta = { x: cargo.pos.x + offset.x - holder.pos.x, z: cargo.pos.z + offset.z - holder.pos.z };
  for (const id of rig.partIds) {
    const body = h.state.entities.get(id);
    body.pos.x += delta.x; body.pos.z += delta.z;
    body.vel.x = 0; body.vel.z = 0; body.angVel = 0;
  }
  h.player.pos.x = cargo.pos.x - 110; h.player.pos.z = cargo.pos.z + 95;
  h.native.syncFromEntities(h.state.entityList);
}

function driveNativeRig(h, jobs, rig, destination, ticks = 4200) {
  const root = h.state.entities.get(rig.partIds[0]);
  const totalMass = rig.partIds.concat(rig.cargoIds).reduce((sum, id) => sum + h.state.entities.get(id).mass, 0);
  for (let i = 0; i < ticks; i++) {
    const dx = destination.x - root.pos.x, dz = destination.z - root.pos.z;
    const d = Math.hypot(dx, dz);
    const v = Math.min(22, d * 0.45);
    const desiredX = d > 0.01 ? dx / d * v : 0, desiredZ = d > 0.01 ? dz / d * v : 0;
    const jx = Math.max(-totalMass * 0.12, Math.min(totalMass * 0.12, (desiredX - root.vel.x) * totalMass * 0.025));
    const jz = Math.max(-totalMass * 0.12, Math.min(totalMass * 0.12, (desiredZ - root.vel.z) * totalMass * 0.025));
    queuePhysicsImpulse(root, { x: jx, z: jz });
    // Scripted helm applies bounded physical counter-torque to the frame. It
    // cannot freeze a cargo body or erase angular momentum through a pose write.
    queuePhysicsTorqueImpulse(root, { y: Math.max(-500, Math.min(500, -root.angVel * totalMass * 16)) });
    h.step();
    jobs.update(h.w);
    const loadSettled = rig.cargoIds.every((id) => {
      const body = h.state.entities.get(id);
      return Math.hypot(body.vel.x, body.vel.z) < 2 && Math.abs(body.angVel || 0) < 0.3;
    });
    if (d < 10 && Math.hypot(root.vel.x, root.vel.z) < 1 && loadSettled) return i + 1;
  }
  return ticks;
}



function earnPriorOrders(h, jobs) {
  // Receipt-boundary fixture: actual originals and payment path, seeded earlier travel.
  for (const id of ['needle', 'kiln']) {
    const accepted=jobs.accept(h.w,id); assert.equal(accepted.ok,true,accepted.reason); h.step(3);
    const job=accepted.job;
    h.player.pos={x:job.destination.x-90,z:job.destination.z};
    for (const [i,record] of job.cargo.entries()) {
      const body=h.state.entities.get(record.id);
      body.pos={x:job.destination.x-30,z:job.destination.z+i*20};body.vel={x:0,z:0};body.angVel=0;
      record.collectedByRig=h.w.rigs[0].id;record.travelled=200;
    }
    h.native.syncFromEntities(h.state.entityList);
    // Individual receipts exercise the full seven-receipt save envelope later.
    for(const record of job.cargo){
      const line=jobs.deliveryQuote(h.w,id).accepted.find(x=>x.id===record.id);
      assert.ok(line);
      assert.equal(jobs.deliver(h.w,id,{...line,generation:h.state.entities.get(record.id).occupantGeneration}).ok,true);
    }
  }
}
test('Quiet Relay is earned through surviving deliveries, not empty closure; locked acceptance spawns nothing',async()=>{
  const h=await nativeFixture();try{
    h.physics.ensureTemplates(h.w);h.step(3);const jobs=createWorkshopJobs({state:h.state,bus:h.bus,physics:h.physics});
    const before=h.state.entityList.length;assert.equal(jobs.accept(h.w,'relay').ok,false);assert.equal(h.state.entityList.length,before);
    h.w.jobs={needle:{settled:true,delivered:[]},kiln:{settled:true,delivered:[55]}};
    assert.equal(rigJobAvailability(h.w,'relay').ok,false);
    h.w.jobs.needle.delivered=[44];assert.equal(rigJobAvailability(h.w,'relay').ok,true);
  }finally{h.close();}
});
test('earned relay preserves prior originals, public offer, individual receipts and cold save restoration',async()=>{
 const h=await nativeFixture(),cold=await nativeFixture();try{
  h.physics.ensureTemplates(h.w);h.step(3);const system=createRigWorkshopSystem();system.init(h.sim.registry.ctx);
  const jobs=system.jobs;earnPriorOrders(h,jobs);
  system._showJobs();const offer=h.w.prompt.options.find(x=>x.id==='job:relay');assert.ok(offer);assert.match(offer.label,/Quiet Relay/);
  system.choose({promptId:h.w.prompt.id,revision:h.w.prompt.revision,choiceId:'job:relay'});
  assert.equal(h.w.prompt.options.find(x=>x.id==='accept').disabled,false);
  const priorIds=[...h.w.jobs.needle.cargoIds,...h.w.jobs.kiln.cargoIds];
  const accepted=jobs.accept(h.w,'relay');assert.equal(accepted.ok,true,accepted.reason);h.step(3);const job=accepted.job;
  assert.equal(job.cargo.length,2);assert.equal(job.obstacleIds.length,4);
  assert.ok(priorIds.every(id=>h.state.entities.get(id)?.data.rigWorkshopCargo.delivered));
  for(const [i,r] of job.cargo.entries()){
   const e=h.state.entities.get(r.id);assert.equal(e.mass,18);assert.equal(e.hullMax,90);
   e.pos={x:job.destination.x-30,z:job.destination.z+i*20};e.vel={x:0,z:0};e.angVel=0;
   r.travelled=200;r.collectedByRig=h.w.rigs[0].id;
  }
  h.player.pos={x:job.destination.x-90,z:job.destination.z};h.native.syncFromEntities(h.state.entityList);
  for(const record of job.cargo){const line=jobs.deliveryQuote(h.w).accepted.find(x=>x.id===record.id);assert.ok(line);
   assert.equal(jobs.deliver(h.w,'relay',{...line,generation:h.state.entities.get(record.id).occupantGeneration}).ok,true);}
  assert.equal(h.w.receipts.length,7);assert.equal(jobs.accept(h.w,'relay').ok,false);
  const saved=clone(captureRigWorkshop(h.state));const restored=restoreRigWorkshop(cold.state,saved,cold.physics);assert.equal(restored.ok,true,restored.reason);
  cold.step(3);assert.equal(cold.w.receipts.length,7);assert.equal(cold.w.jobs.relay.settled,true);
  assert.equal(createWorkshopJobs({state:cold.state,bus:cold.bus,physics:cold.physics}).accept(cold.w,'relay').ok,false);
  system.destroy();
 }finally{h.close();cold.close();}
});
test('native relay original travels to the gantry under rig restraint and pays its real condition once',async()=>{
 const h=await nativeFixture();try{
  h.physics.ensureTemplates(h.w);h.step(3);const jobs=createWorkshopJobs({state:h.state,bus:h.bus,physics:h.physics});earnPriorOrders(h,jobs);
  const accepted=jobs.accept(h.w,'relay');assert.equal(accepted.ok,true,accepted.reason);h.step(3);
  const job=accepted.job,rig=h.w.rigs[0],record=job.cargo[0],cargo=h.state.entities.get(record.id);
  const holder=rig.partIds.map(id=>h.state.entities.get(id)).find(e=>e.data.rigWorkshop.partType==='cradle');
  stageUnloadedRig(h,rig,holder,cargo);assert.equal(h.physics.captureCargo(h.w,rig.id,cargo.id).ok,true);h.step(3);
  // Take the authored wide route around the south side, then approach below the gantry.
  driveNativeRig(h,jobs,rig,{x:job.pickup.x+150,z:job.pickup.z-180},3600);
  driveNativeRig(h,jobs,rig,{x:job.destination.x,z:job.destination.z-180},9000);
  driveNativeRig(h,jobs,rig,job.destination,3600);
  h.player.pos={x:job.destination.x-90,z:job.destination.z};
  const q=jobs.deliveryQuote(h.w);assert.equal(q.ok,true,q.reason+JSON.stringify({pos:cargo.pos,vel:cargo.vel,root:h.state.entities.get(rig.partIds[0]).pos,dest:job.destination,pickup:job.pickup,travel:record.travelled}));assert.ok(record.travelled>=180);assert.ok(q.accepted.some(x=>x.id===cargo.id));
  const before=h.state.player.credits;const paid=jobs.deliver(h.w);assert.equal(paid.ok,true);assert.equal(h.state.player.credits-before,paid.amount);
  assert.equal(cargo.ownerId,job.receiverId);assert.equal(jobs.deliver(h.w).ok,false);
 }finally{h.close();}
});
