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


test('relay loads have distinct live identities, native inertia, condition sensitivity and cold-restored bodies', async () => {
  const h = await nativeFixture(), cold = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const jobs = createWorkshopJobs({state:h.state,bus:h.bus,physics:h.physics});
    // Unlock boundary fixture; this test does not claim prior-order traversal.
    h.w.jobs={needle:{settled:true,delivered:[1]},kiln:{settled:true,delivered:[2]}};
    assert.equal(jobs.accept(h.w,'relay').ok,true); h.step(3);
    // Only preserve real relay state in the persistence assertion below.
    delete h.w.jobs.needle; delete h.w.jobs.kiln;
    const job=h.w.jobs.relay, coil=h.state.entities.get(job.cargo[0].id), shell=h.state.entities.get(job.cargo[1].id);
    assert.match(coil.data.name,/Signal coil/); assert.match(shell.data.name,/Protective relay housing/);
    assert.equal(coil.mass,18); assert.equal(shell.mass,36);
    assert.equal(coil.hullMax,90); assert.equal(shell.hullMax,180);
    queuePhysicsImpulse(coil,{x:18,z:0}); queuePhysicsImpulse(shell,{x:18,z:0}); h.step();
    assert.ok(coil.vel.x>shell.vel.x*1.8,JSON.stringify([coil.vel,shell.vel]));
    const choices=jobs.remainingCourses(h.w);
    assert.ok(choices.some(c=>/Signal coil/.test(c.name)));
    assert.ok(choices.some(c=>/Protective relay housing/.test(c.name)));
    // Same physical hull loss removes twice the coil's relative integrity.
    coil.hull-=18; shell.hull-=18;
    assert.equal(coil.hull/coil.hullMax,0.8);assert.equal(shell.hull/shell.hullMax,0.9);
    const saved=clone(captureRigWorkshop(h.state));
    const r=restoreRigWorkshop(cold.state,saved,cold.physics);assert.equal(r.ok,true,r.reason);cold.step(3);
    const restored=cold.w.jobs.relay.cargo.map(c=>cold.state.entities.get(c.id));
    assert.deepEqual(restored.map(e=>[e.data.name,e.mass,e.hull,e.hullMax]),[coil,shell].map(e=>[e.data.name,e.mass,e.hull,e.hullMax]));
    assert.equal(cold.w.jobs.relay.cargo.length,2);assert.equal(cold.w.receipts.length,0);
  } finally {h.close();cold.close();}
});

test('accepted legacy relay saves keep their original equal loads and labels', async () => {
  const h=await nativeFixture(),cold=await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w);h.step(3);
    const jobs=createWorkshopJobs({state:h.state,bus:h.bus,physics:h.physics});
    h.w.jobs={needle:{settled:true,delivered:[1]},kiln:{settled:true,delivered:[2]}};
    assert.equal(jobs.accept(h.w,'relay').ok,true);h.step(3);
    delete h.w.jobs.needle;delete h.w.jobs.kiln;
    const saved=clone(captureRigWorkshop(h.state));
    // Historical accepted snapshot: prior authored relay had two identical
    // 18t/90HP originals. New definitions must never rebuild accepted bodies.
    const legacy=saved.bodies.filter(e=>e.data?.rigWorkshopRole==='cargo');
    assert.equal(legacy.length,2);
    for(const e of legacy){
      e.mass=18;e.hullMax=90;e.hull=72;
      e.physicsBody.mass=18;e.physicsBody.inertiaY=18*e.radius*e.radius*0.5;
      e.data.name=`The Quiet Relay · ${e.data.rigWorkshopCargo.token}`;
    }
    const before=legacy.map(e=>[e.id,e.data.name,e.mass,e.hull,e.hullMax]);
    const result=restoreRigWorkshop(cold.state,saved,cold.physics);assert.equal(result.ok,true,result.reason);cold.step(3);
    const actual=cold.w.jobs.relay.cargo.map(c=>cold.state.entities.get(c.id));
    assert.deepEqual(actual.map(e=>[e.id,e.data.name,e.mass,e.hull,e.hullMax]),before);
    assert.equal(cold.w.receipts.length,0);
  }finally{h.close();cold.close();}
});
