import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { planMeal, applyMeal } from '../src/matter/aggregateCapture.js';
import { createCaptureLedger, memberRef, makeBody, mergeBodies } from '../src/matter/aggregateMass.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
const tuning = { absorbKnockPerMass: 3, absorbKnockFloor: 0.15, absorbKnockSpeedRef: 60 };
function body(id, mass, radius, x, z, vx, vz, w, inertia) {
  return { id, type: 'asteroid', alive: true, pos: { x, z }, vel: { x: vx, z: vz },
    radius, angVel: w, data: {}, collides: true,
    physicsBody: { schemaVersion: 1, mass, radius, inertiaY: inertia, dynamic: true,
      material: 'debris', contact: { angularDamping: 0 }, revision: 0 } };
}
function mealPlan(core, meal, authored = tuning) {
  const dx = core.pos.x - meal.pos.x, dz = core.pos.z - meal.pos.z;
  return planMeal(core, meal, { mass: core.physicsBody.mass, radius: core.radius },
    { dx, dz, dist: Math.hypot(dx, dz) }, authored, 60);
}
function capture(core, meal, plan) {
  const ledger = createCaptureLedger();
  const { ticket } = ledger.reserve(memberRef(meal), meal.physicsBody.mass);
  applyMeal({ ledger, helpers: { removeEntity: () => { meal.alive = false; } } }, core, meal, plan, ticket);
  return consumePhysicsCommand(core);
}
function snapshot(e) {
  return makeBody(e.physicsBody.mass, e.pos.x, e.pos.z, e.vel.x, e.vel.z,
    e.angVel, e.radius, e.physicsBody.inertiaY);
}

test('real capture carries linear momentum separately from the powered flinch', () => {
  const core = body(1, 60, 10, 0, 0, 4, 2, 0, 2400);
  const meal = body(2, 12, 5, 12, 0, -8, 7, 0, 120);
  const before = { x: 60 * 4 + 12 * -8, z: 60 * 2 + 12 * 7 };
  const plan = mealPlan(core, meal);
  const pos = { ...core.pos }, vel = { ...core.vel };
  const cmd = capture(core, meal, plan);
  const jx = cmd.impulses.reduce((sum, j) => sum + j.x, 0);
  const jz = cmd.impulses.reduce((sum, j) => sum + j.z, 0);
  close(plan.mass * vel.x + jx - plan.knockX, before.x);
  close(plan.mass * vel.z + jz - plan.knockZ, before.z);
  assert.deepEqual(core.pos, pos, 'capture cannot teleport a core to the barycenter');
  assert.deepEqual(core.vel, vel, 'the physics owner consumes impulses');
  assert.equal(meal.alive, false);
  assert.equal(core.physicsBody.mass, 72);
});

test('real capture transfers member spin and COM angular momentum with a separately bounded holder reaction', () => {
  for (const vz of [0.5, 8000]) {
    const core = body(1, 60, 10, 10, 4, 4, 2, 0.1, 2400);
    const meal = body(2, 12, 5, 22, 8, -8, vz, -0.7, 120);
    const merged = mergeBodies(snapshot(core), snapshot(meal));
    const plan = mealPlan(core, meal);
    const cmd = capture(core, meal, plan);
    const torque = cmd.torqueImpulses.reduce((sum, j) => sum + j.y, 0);
    assert.ok(Number.isFinite(plan.holderTorque), 'the active holder accounts for its reaction');
    close(plan.inertia * 0.1 + torque - plan.holderTorque, merged.I * merged.w);
    assert.ok(Math.abs(torque / plan.inertia) <= 0.5 + 1e-9, 'the authored holder still limits a railgun feed');
  }
});

test('capture momentum crosses the native membrane at the grown mass without direct velocity writes', async () => {
  const sim = createSimulation({ seed: 619, bus: createBus(), systems: [physics] });
  sim.state.mode = 'flight';
  sim.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ps = sim.registry.get('physics');
  assert.equal(await ps.prepareBackend(sim.state), true);
  try {
    const player = sim.spawn({ ...body(undefined, 28, 12, 0, 0, 0, 0, 0, 88), type: 'ship',
      flags: {}, hull: 200, hullMax: 200, data: { combatProfileId: 'combat_profile_standard_ship' } });
    sim.state.playerId = player.id;
    const core = sim.spawn(body(undefined, 60, 10, 150, 0, 4, 2, 0, 2400));
    // Materialize the original native body in the player's active physical neighborhood first.
    // Capture must rebuild that existing body, rather than spawning an untouched far-field record.
    sim.step();
    assert.ok(core.pos.x > 150, 'the native body actually advanced before capture');
    const meal = sim.spawn(body(undefined, 12, 5, core.pos.x + 12, core.pos.z, -8, 7, 0, 120));
    const plan = mealPlan(core, meal, { ...tuning, absorbKnockPerMass: 0, absorbKnockFloor: 0 });
    const ledger = createCaptureLedger();
    const { ticket } = ledger.reserve(memberRef(meal), 12);
    applyMeal({ ledger, helpers: sim.helpers }, core, meal, plan, ticket);
    close(core.vel.x, 4);
    sim.step();
    assert.ok(Math.abs(core.vel.x - 2) < 1e-5, `native vx=${core.vel.x}`);
    assert.ok(Math.abs(core.vel.z - 204 / 72) < 1e-5, `native vz=${core.vel.z}`);
    assert.ok(Math.abs(core.angVel - 600 / core.physicsBody.inertiaY) < 1e-5, `native spin=${core.angVel}`);
    assert.equal(sim.state.entities.has(meal.id), false);
  } finally { ps._disableSg02DynamicAuthority(); }
});
