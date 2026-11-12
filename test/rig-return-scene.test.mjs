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



import { workshopAftermath } from '../src/features/rigWorkshop/aftermath.js';

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
test('settled work board opens local receiving account and marks live paid originals without new reward',async()=>{
 const h=await nativeFixture();let system;
 try {const done=await settled(h);system=done.system;const {job}=done;
  const credits=h.state.player.credits,stock=h.w.stock,receipts=JSON.stringify(h.w.receipts),courses=[];
  h.bus.on('ui:setCourse',p=>courses.push(p));system._showJobs();
  assert.equal(h.w.prompt.options.find(o=>o.id==='job:kiln').disabled,false);
  choose(system,h,'job:kiln');assert.match(h.w.prompt.detail,/both thermal stores/);
  const original=h.state.entities.get(job.delivered[0]);original.pos.x+=4;
  choose(system,h,`received:${original.id}`);assert.equal(courses.at(-1).targetEntityId,original.id);
  assert.equal(courses.at(-1).pos.x,original.pos.x);
  for(let i=0;i<3;i++){system._showAftermath('kiln');choose(system,h,'read');}
  assert.equal(h.state.player.credits,credits);assert.equal(h.w.stock,stock);assert.equal(JSON.stringify(h.w.receipts),receipts);
  assert.equal(original.ownerId,job.receiverId);assert.equal(system.jobs.accept(h.w,'kiln').ok,false);
 }finally{system?.destroy();h.close();}
});
test('partial and empty outcomes stay truthful; remote contact and stale body cannot masquerade as a return',async()=>{
 for(const count of [0,1]){const h=await nativeFixture();let system;
 try{const done=await settled(h,count);system=done.system;
  const view=workshopAftermath(h.state,h.w,'kiln');assert.equal(view.outcome,count?'partial':'empty');
  system._showAftermath('kiln');assert.match(h.w.prompt.detail,count?/still blank/:/no delivered store/);
  const courses=[];h.bus.on('ui:setCourse',p=>courses.push(p));
  if(count){ const e=h.state.entities.get(done.job.delivered[0]);system._showAftermath('kiln');e.occupantGeneration++;
    choose(system,h,`received:${e.id}`);assert.equal(courses.length,0);
    e.occupantGeneration--;system._showAftermath('kiln');
    const oldPos={x:e.pos.x,z:e.pos.z}; e.pos.x+=1000;
    choose(system,h,`received:${e.id}`);assert.equal(courses.length,0);
    let absent=workshopAftermath(h.state,h.w,'kiln');assert.equal(absent.originals.length,0);assert.match(absent.detail,/no longer here intact/);
    e.pos.x=oldPos.x;e.pos.z=oldPos.z;system._showAftermath('kiln');
    h.player.pos.x+=1000;choose(system,h,`received:${e.id}`);assert.equal(courses.length,0);
    h.player.pos.x-=1000;
    e.hull=0;assert.equal(workshopAftermath(h.state,h.w,'kiln').originals.length,0);
  }
  h.state.world.currentSectorId='elsewhere';system._showAftermath('kiln');
  assert.match(h.w.prompt.detail,/Return to the original gantry/);assert.equal(h.w.prompt.options.find(o=>o.id==='read').disabled,true);
 }finally{system?.destroy();h.close();}}
});
test('completed account derives from cold-restored receipt and original identity, never respawns a settled job',async()=>{
 const h=await nativeFixture(),cold=await nativeFixture();let system,restoredSystem;
 try{const done=await settled(h,1);system=done.system;
  const snapshot=captureRigWorkshop(h.state);const r=restoreRigWorkshop(cold.state,snapshot,cold.physics);assert.equal(r.ok,true,r.reason);cold.step(3);
  restoredSystem=createRigWorkshopSystem();restoredSystem.init(cold.sim.registry.ctx);
  const count=cold.state.entityList.length,credits=cold.state.player.credits;
  const view=workshopAftermath(cold.state,cold.w,'kiln');assert.equal(view.outcome,'partial');assert.equal(view.originals.length,1);
  restoredSystem._showJobs();choose(restoredSystem,cold,'job:kiln');assert.equal(cold.w.prompt.options.some(o=>o.id==='accept'),false);
  assert.equal(cold.state.entityList.length,count);assert.equal(cold.state.player.credits,credits);
 }finally{system?.destroy();restoredSystem?.destroy();h.close();cold.close();}
});
