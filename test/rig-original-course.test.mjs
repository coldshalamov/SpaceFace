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


test('ordinary guide menu chooses a lighter original and reads its current position', async () => {
  const h = await nativeFixture(); let system;
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    system = createRigWorkshopSystem(); system.init(h.sim.registry.ctx);
    const result = system.jobs.accept(h.w, 'kiln'); assert.equal(result.ok, true);
    h.step(2);
    const courses = [];
    h.bus.on('ui:setCourse', p => courses.push(p));
    const choose = id => { const p = h.w.prompt; return system.choose({ promptId: p.id, revision: p.revision, choiceId: id }); };
    system._showGuide(); choose('pickup');
    const light = h.state.entities.get(result.job.cargo[0].id);
    assert.ok(h.w.prompt.options.some(o => o.label.includes('190 t')));
    assert.ok(h.w.prompt.options.some(o => o.label.includes('266 t')));
    const line = system.jobs.remainingCourses(h.w).find(c => c.id === light.id);
    const credits = h.state.player.credits;
    // Navigation must resolve the moving original at action time, not stale menu position.
    light.pos.x += 13;
    choose(`original:${line.id}:${line.generation}`);
    assert.equal(courses.at(-1).targetEntityId, light.id);
    assert.deepEqual(courses.at(-1).pos, { ...light.pos });
    assert.equal(h.state.player.credits, credits);
    assert.equal(result.job.delivered.length, 0);
    assert.equal(light.data.rigWorkshopCargo.delivered, false);
  } finally { system?.destroy(); h.close(); }
});

test('selected course refuses paid, secured, replaced, missing and off-sector originals without fallback', async () => {
  const h = await nativeFixture();
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    let secured = false;
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus,
      physics: { ...h.physics, isCargoSecured: () => secured } });
    const result = jobs.accept(h.w, 'kiln'); assert.equal(result.ok, true); h.step(2);
    const line = jobs.remainingCourses(h.w)[0], record = result.job.cargo.find(c => c.id === line.id);
    const body = h.state.entities.get(line.id), courses = [];
    h.bus.on('ui:setCourse', p => courses.push(p));
    const rejected = () => { assert.equal(jobs.guide(h.w, 'pickup', line).ok, false); assert.equal(courses.length, 0); };
    secured = true; rejected(); secured = false;
    const owner = body.ownerId; body.ownerId = 999; rejected(); body.ownerId = owner;
    record.paid = true; rejected(); record.paid = false;
    const hull = body.hull; body.hull = 0; rejected(); body.hull = hull;
    body.alive = false; rejected(); body.alive = true;
    const token = body.data.rigWorkshopCargo.token;
    body.data.rigWorkshopCargo.token = 'replacement-token'; rejected();
    body.data.rigWorkshopCargo.token = token;
    body.occupantGeneration++; rejected(); body.occupantGeneration--;
    h.state.entities.delete(body.id); rejected(); h.state.entities.set(body.id, body);
    h.state.world.currentSectorId = 'elsewhere'; rejected();
    h.state.world.currentSectorId = result.job.sectorId;
    assert.equal(jobs.guide(h.w, 'pickup', line).ok, true);
    assert.equal(courses.length, 1);
  } finally { h.close(); }
});


test('cold restored work order courses select the restored original without reminting or paying', async () => {
  const h = await nativeFixture(), cold = await nativeFixture(); let system;
  try {
    h.physics.ensureTemplates(h.w); h.step(3);
    const jobs = createWorkshopJobs({ state: h.state, bus: h.bus, physics: h.physics });
    const accepted = jobs.accept(h.w, 'kiln'); assert.equal(accepted.ok, true); h.step(2);
    const before = jobs.remainingCourses(h.w).map(({ id, token, mass }) => ({ id, token, mass }));
    const saved = clone(captureRigWorkshop(h.state));
    const restored = restoreRigWorkshop(cold.state, saved, cold.physics);
    assert.equal(restored.ok, true, restored.reason); cold.step(3);
    system = createRigWorkshopSystem(); system.init(cold.sim.registry.ctx);
    const lines = system.jobs.remainingCourses(cold.w);
    assert.deepEqual(lines.map(({ id, token, mass }) => ({ id, token, mass })), before);
    const courses = []; cold.bus.on('ui:setCourse', p => courses.push(p));
    const line = lines[1], body = cold.state.entities.get(line.id);
    const count = cold.state.entityList.length, credits = cold.state.player.credits;
    system._showOriginalCourses();
    const p = cold.w.prompt;
    system.choose({ promptId: p.id, revision: p.revision, choiceId: `original:${line.id}:${line.generation}` });
    assert.equal(courses.at(-1).targetEntityId, body.id);
    assert.deepEqual(courses.at(-1).pos, { ...body.pos });
    assert.equal(cold.state.entities.get(line.id), body);
    assert.equal(cold.state.entityList.length, count);
    assert.equal(cold.state.player.credits, credits);
    assert.equal(cold.w.jobs.kiln.delivered.length, 0);
    assert.equal(cold.events.length, 0);
  } finally { system?.destroy(); h.close(); cold.close(); }
});
