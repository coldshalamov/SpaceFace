import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { createSimulation } from '../src/core/sim.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, queuePhysicsTorqueImpulse, readPhysicsTelemetry } from '../src/core/physicsAuthority.js';
import { economy } from '../src/systems/economy.js';
import * as THREE from 'three';
import { routeDigit, planSlotClaim } from '../src/ui/promptDeck.js';
import { resolvePlaceFileForEntity } from '../src/render/partsLibrary.js';
import { PART_LIST, partBodySpec } from '../src/features/rigWorkshop/parts.js';
import { createRigPhysicsAdapter } from '../src/features/rigWorkshop/physics.js';
import { createRigWorkshopSystem, freshRigWorkshop } from '../src/features/rigWorkshop/runtime.js';
import { createWorkshopJobs } from '../src/features/rigWorkshop/jobs.js';
import { createRigWorkshopRender, buildRigWorkshopBody } from '../src/features/rigWorkshop/render.js';
import { captureRigWorkshop, restoreRigWorkshop } from '../src/features/rigWorkshop/persistence.js';
import { rigWorkshopSavePlanEntry, captureRigWorkshopSaveSlot, restoreRigWorkshopSaveSlot } from '../src/features/rigWorkshop/integration.js';
import { createRigWorkshopView } from '../src/features/rigWorkshop/view.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics as productionPhysics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { tetherGameplay } from '../src/systems/tetherGameplay.js';
import { buildEntitySpawnSpec } from '../src/testing/lab/entityProfiles.js';
import {
  createRigWorkshopPresentation, rigWorkshopDecision, buildRigWorkshopReadModel,
} from '../src/features/rigWorkshop/presentation.js';

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


async function readyLoads(){
 const h=await nativeFixture();h.physics.ensureTemplates(h.w);h.step(3);
 const system=createRigWorkshopSystem();system.init(h.sim.registry.ctx);
 const jobs=system.jobs,accepted=jobs.accept(h.w,'needle');assert.equal(accepted.ok,true);h.step(3);
 const job=accepted.job;h.w.activeRigId=h.w.rigs[0].id;
 h.player.pos.x=job.destination.x-90;h.player.pos.z=job.destination.z;
 // Boundary fixture: native bodies admitted, prior transport ledger explicitly seeded.
 const loads=job.cargo.map((record,i)=>{
  const body=h.state.entities.get(record.id);body.pos.x=job.destination.x-30;body.pos.z=job.destination.z+(i-1)*20;
  body.vel.x=0;body.vel.z=0;body.angVel=0;record.collectedByRig=h.w.rigs[0].id;record.travelled=200;return body;
 });
 h.native.syncFromEntities(h.state.entityList);
 const choose=id=>{const p=h.w.prompt;return system.choose({promptId:p.id,revision:p.revision,choiceId:id});};
 return Object.assign(h,{system,jobs,job,loads,choose,finish(){system.destroy();h.close();}});
}
const handover=b=>`handover:${b.id}:${b.occupantGeneration}`;
test('actual field prompt hands over one named original at its current quote, leaves others and pays once under reentry',async()=>{
 const h=await readyLoads();let card;
 const ui=createRigWorkshopPresentation({state:h.state,bus:h.bus,getDeck:()=>({offerDecision(s){card=s;return true;},resolveDecision(){return true;}})});
 try{
  h.loads[1].hull=90;h.system._showField();card.onChoose('deliver');
  assert.ok(card.choices.length<=9);assert.ok(card.choices.some(c=>c.id==='back'));assert.ok(card.choices.some(c=>c.id==='close'));
  assert.match(card.choices.find(c=>c.id===handover(h.loads[1])).label,/117 cr/);
  const before=h.state.player.credits;let nested;
  h.bus.on('economy:grantCredits',()=>{nested=h.jobs.deliver(h.w,'needle',{id:h.loads[1].id,generation:h.loads[1].occupantGeneration,token:h.job.cargo[1].token,amount:117});});
  card.onChoose(handover(h.loads[1]));
  assert.equal(nested.ok,false);assert.equal(h.state.player.credits-before,117);
  assert.deepEqual(h.job.delivered,[h.loads[1].id]);assert.equal(h.loads[1].ownerId,h.job.receiverId);
  assert.equal(h.loads[0].ownerId,h.player.id);assert.equal(h.loads[2].ownerId,h.player.id);
  assert.equal(h.events.length,1);assert.equal(h.job.stage,'partial');
 }finally{ui.destroy();h.finish();}
});
test('changed price, generation, object, ownership, range and work order cannot commit stale named handover',async()=>{
 for(const mutate of [h=>h.loads[0].hull--,h=>h.loads[0].occupantGeneration++,h=>h.state.entities.set(h.loads[0].id,{...h.loads[0]}),h=>h.loads[0].ownerId=999,h=>h.loads[0].data.playerOwned=false,h=>h.loads[0].pos.x+=300,h=>h.w.activeJobId=null]){
  const h=await readyLoads();try{h.system._showDelivery();const id=handover(h.loads[0]);mutate(h);h.choose(id);
   assert.equal(h.events.length,0);assert.equal(h.job.delivered.length,0);
  }finally{h.finish();}
 }
});
test('Back leaves all originals; explicit bulk option retains existing total and fresh owner restore cannot repay selected cargo',async()=>{
 const h=await readyLoads(),cold=await nativeFixture();try{
  h.system._showDelivery();h.choose('back');assert.equal(h.events.length,0);
  h.system._showDelivery();h.w.activeJobId=null;h.choose('all');assert.equal(h.events.length,0);h.w.activeJobId='needle';
  h.system._showDelivery();h.choose(handover(h.loads[0]));
  const saved=clone(captureRigWorkshop(h.state));assert.equal(restoreRigWorkshop(cold.state,saved,cold.physics).ok,true);cold.step(3);
  const jobs=createWorkshopJobs({state:cold.state,bus:cold.bus,physics:cold.physics});
  cold.player.pos.x=cold.w.jobs.needle.destination.x-90;cold.player.pos.z=cold.w.jobs.needle.destination.z;
  assert.ok(!jobs.deliveryQuote(cold.w).accepted.some(c=>c.id===h.loads[0].id));assert.equal(cold.events.length,0);
  h.system._showDelivery();h.choose('all');assert.equal(h.job.delivered.length,3);assert.equal(h.job.paid,540);assert.equal(h.events.length,2);
 }finally{cold.close();h.finish();}
});
test('selected receipt releases an actual native restraint after physical transport and pays only that original',async()=>{
 const h=await nativeFixture();let system;try{
  h.physics.ensureTemplates(h.w);h.step(3);const rig=h.w.rigs[0];h.w.activeRigId=rig.id;
  system=createRigWorkshopSystem();system.init(h.sim.registry.ctx);const jobs=system.jobs;
  const {job}=jobs.accept(h.w,'needle');h.step(2);const cargo=h.state.entities.get(job.cargoIds[0]);
  const holder=rig.partIds.map(id=>h.state.entities.get(id)).find(e=>e.data.rigWorkshop.partType==='cradle');
  stageUnloadedRig(h,rig,holder,cargo);assert.equal(h.physics.captureCargo(h.w,rig.id,cargo.id).ok,true);jobs.update(h.w);
  driveNativeRig(h,jobs,rig,job.destination);driveNativeRig(h,jobs,rig,job.destination,1800);
  h.player.pos.x=job.destination.x-80;h.player.pos.z=job.destination.z+80;
  assert.ok(job.cargo[0].travelled>500);assert.equal(h.physics.isCargoSecured(h.w,rig.id,cargo.id),true);
  system._showDelivery();const prompt=h.w.prompt;
  let nested,closed,saved;
  h.bus.on('tether:broken',()=>{
   const other=createWorkshopJobs({state:h.state,bus:h.bus,physics:h.physics});
   nested=other.deliver(h.w,'needle',{id:cargo.id,generation:cargo.occupantGeneration,token:job.cargo[0].token,amount:180});
   closed=other.settlePartial(h.w);saved=clone(captureRigWorkshop(h.state));
  });
  assert.ok(prompt.options.some(c=>c.id===handover(cargo)));
  system.choose({promptId:prompt.id,revision:prompt.revision,choiceId:handover(cargo)});
  assert.deepEqual(job.delivered,[cargo.id]);assert.equal(h.physics.isCargoSecured(h.w,rig.id,cargo.id),false);
  assert.equal(cargo.ownerId,job.receiverId);assert.equal(h.events.length,1);assert.equal(job.cargo[1].paid,false);
  assert.equal(nested.ok,false);assert.equal(closed.ok,false);assert.equal(saved.workshop.jobs.needle.paid,0);
  const cold=await nativeFixture();try{
   assert.equal(restoreRigWorkshop(cold.state,saved,cold.physics).ok,true);cold.step(3);
   assert.equal(cold.w.jobs.needle.paid,0);assert.equal(cold.events.length,0);
   assert.equal(cold.w.jobs.needle.cargo[0].paid,false);
  }finally{cold.close();}

 }finally{system?.destroy();h.close();}
});

test('native release callback changing cargo life or custody cannot receive a payment for the new occupant',async()=>{
 for(const mutate of [b=>b.occupantGeneration++,b=>b.ownerId=999]){
  const h=await nativeFixture();let system;try{
   h.physics.ensureTemplates(h.w);h.step(3);const rig=h.w.rigs[0];h.w.activeRigId=rig.id;
   system=createRigWorkshopSystem();system.init(h.sim.registry.ctx);const jobs=system.jobs;
   const {job}=jobs.accept(h.w,'needle');h.step(2);const cargo=h.state.entities.get(job.cargoIds[0]);
   const holder=rig.partIds.map(id=>h.state.entities.get(id)).find(e=>e.data.rigWorkshop.partType==='cradle');
   stageUnloadedRig(h,rig,holder,cargo);assert.equal(h.physics.captureCargo(h.w,rig.id,cargo.id).ok,true);jobs.update(h.w);
   driveNativeRig(h,jobs,rig,job.destination);driveNativeRig(h,jobs,rig,job.destination,1800);
   h.player.pos.x=job.destination.x-80;h.player.pos.z=job.destination.z+80;
   let calls=0;h.bus.on('tether:broken',()=>{calls++;mutate(cargo);});
   system._showDelivery();const p=h.w.prompt;
   system.choose({promptId:p.id,revision:p.revision,choiceId:handover(cargo)});
   assert.equal(calls,1);assert.equal(h.events.length,0);assert.equal(job.paid,0);assert.deepEqual(job.delivered,[]);
   assert.equal(cargo.data.rigWorkshopCargo.delivered,false);assert.equal(rig.cargoIds.includes(cargo.id),false);
  }finally{system?.destroy();h.close();}
 }
});
