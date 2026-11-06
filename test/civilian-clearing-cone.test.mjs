import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields, activeFieldSnapshot, fieldBodyProfile } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { FIELD_FLAGS, FIELD_DEFS } from '../src/data/fields.js';
import { fieldAffectsBody } from '../src/core/fields/fieldKernel.js';
import { planNpcFieldDeploy, CIVILIAN_CLEARING_TUNING } from '../src/ai/npcFieldDeploy.js';

function spawn(sim, type, x, z = 0, vx = 0, data = {}) {
  return sim.spawn({ type, alive: true, team: 2, radius: 3, mass: 12, collides: true,
    pos: { x, z }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0, hull: 1000, hullMax: 1000,
    flags: {}, data,
    physicsBody: { schemaVersion: 1, radius: 3, mass: 12, inertiaY: 24, dynamic: true,
      ccd: true, shape: 'ball', material: type === 'ship' ? 'ship' : 'debris', revision: 0 } });
}

async function boot({ coast = 0, playerCone = false, combatCone = false, adoptedScavenger = false } = {}) {
  const previous = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 4242, bus: createBus(),
    systems: [...(adoptedScavenger ? [npcJobsRuntime] : []), fields, physics],
    updateOrder: [fields, physics] });
  const state = sim.state;
  state.mode = 'flight'; state.input.actions = {};
  const player = spawn(sim, 'ship', playerCone ? 0 : -500, 0, coast);
  player.isPlayer = true; state.playerId = player.id;
  const owner = playerCone ? player : spawn(sim, 'ship', 0, 0, coast, combatCone
    ? { ai: { doctrine: 'scavenger', passive: false } }
    : adoptedScavenger ? { role: 'scavenger', sectorId: 'sector_vesta_forge',
      homeSectorId: 'sector_vesta_forge',
      ai: { doctrine: 'scavenger', archetype: 'reaver', passive: true } }
    : { trafficRole: 'salvor', role: 'salvor', ai: { archetype: 'fleeing_trader', passive: true } });
  const physicsSys = sim.registry.get('physics'), fieldsSys = sim.registry.get('fields');
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await physicsSys.prepareBackend(state), true);
  if (playerCone) state.input.actions.toggleClearingCone = true;
  return { sim, state, owner, fieldsSys,
    cleanup() {
      physicsSys._disableSg02DynamicAuthority(); sim.bus.clear();
      FIELD_FLAGS.enabled = previous;
    } };
}

test('civilian clearing moves one real workpiece without launching the belt or nearby ships', async t => {
  for (const coast of [0, 100]) {
    const ctx = await boot({ coast });
    try {
      const work = spawn(ctx.sim, 'wreck', 50, 0, coast, { majorDebris: true });
      const waiting = spawn(ctx.sim, 'payload', 80, 15, coast);
      const bystanders = [spawn(ctx.sim, 'ship', 90, -30, coast),
        spawn(ctx.sim, 'asteroid', 40, 16, coast), spawn(ctx.sim, 'asteroid', 70, -25, coast),
        spawn(ctx.sim, 'asteroid', 100, 40, coast)];
      let peakRelative = 0;
      for (let i = 0; i < 240; i++) {
        ctx.sim.step();
        peakRelative = Math.max(peakRelative, Math.hypot(work.vel.x - coast, work.vel.z));
        assert.ok(peakRelative <= CIVILIAN_CLEARING_TUNING.clearingSpeed + 0.1,
          'the tool approaches a clearing speed through force, never an accumulating launch');
        for (const e of [...bystanders, waiting]) {
          assert.ok(Math.hypot(e.vel.x - coast, e.vel.z) < 0.001,
            'only the selected workpiece receives industrial field force');
        }
      }
      const field = activeFieldSnapshot(ctx.state).find(f => f.sourceId === ctx.owner.id);
      assert.ok(field, 'the worker really deploys its existing cone tool');
      assert.equal(field.radius, 120);
      assert.equal(field.maxAffected, 1);
      assert.equal(field.filters.includeId, work.id);
      assert.equal(field.filters.includeGeneration, work.occupantGeneration);
      const cleared = work.pos.x - ctx.owner.pos.x - 50;
      assert.ok(cleared > 25, 'the bounded tool still performs useful visible work');
      assert.ok(work.vel.x > coast + 5, 'common cruising speed remains separate from local clearing');
      t.diagnostic(JSON.stringify({ coast, clearedWu: cleared, peakRelativeSpeed: peakRelative,
        finalStrength: field.strength, untouchedBystanders: bystanders.length }));
    } finally { ctx.cleanup(); }
  }
});

async function adoptedWorkerFixture() {
  const ctx = await boot({ adoptedScavenger: true });
  ctx.state.world.currentSectorId = 'sector_vesta_forge';
  const work = spawn(ctx.sim, 'wreck', 50, 0, 0, {
    salvagePool: { cmdty_scrap_metal: 2 }, sectorId: 'sector_vesta_forge',
  });
  work.mass = 1800;
  work.physicsBody.mass = 1800;
  work.physicsBody.inertiaY = 3600;
  const jobs = ctx.sim.registry.get('npcJobsRuntime');
  assert.equal(jobs._adoptScavengerTractors(), 1, 'the real job owner adopts the ordinary scavenger');
  const entry = ctx.state.npcJobs.byId[ctx.owner.data.jobId];
  assert.equal(entry.job.kind, 'salvor');
  assert.equal(entry.entityRef, ctx.owner);
  assert.equal(entry.job.payload.targetId, work.id);
  assert.equal(ctx.owner.data.ai.doctrine, 'scavenger', 'adoption retains authored locomotion doctrine');
  return { ...ctx, work, entry };
}

test('a real adopted passive scavenger clears only its booked heavy workpiece through native physics', async () => {
  const ctx = await adoptedWorkerFixture();
  try {
    // Add closer material after booking: this job must not switch workpieces or drive bystanders.
    const waiting = spawn(ctx.sim, 'payload', 25, 7);
    const ship = spawn(ctx.sim, 'ship', 70, -20);
    const rock = spawn(ctx.sim, 'asteroid', 90, 25);
    for (let i = 0; i < 120; i++) {
      ctx.sim.step();
      assert.ok(Math.hypot(ctx.work.vel.x, ctx.work.vel.z) <= CIVILIAN_CLEARING_TUNING.clearingSpeed + 0.1);
      for (const body of [waiting, ship, rock]) assert.ok(Math.hypot(body.vel.x, body.vel.z) < 0.001);
    }
    const field = activeFieldSnapshot(ctx.state).find(f => f.sourceId === ctx.owner.id);
    assert.ok(field);
    assert.equal(field.radius, CIVILIAN_CLEARING_TUNING.radius);
    assert.ok(field.strength <= CIVILIAN_CLEARING_TUNING.strength);
    assert.equal(field.filters.includeId, ctx.work.id);
    assert.equal(field.filters.includeGeneration, ctx.work.occupantGeneration);
    assert.equal(field.maxAffected, 1);
    assert.ok(ctx.work.vel.x > 5, 'the real 1800t native body still receives useful clearing force');
    ctx.entry.job.phase = 'complete';
    const before = { ...ctx.work.vel };
    ctx.sim.step();
    assert.equal(activeFieldSnapshot(ctx.state).some(f => f.sourceId === ctx.owner.id), false,
      'completion retires the field before another force pass');
    assert.ok(Math.hypot(ctx.work.vel.x - before.x, ctx.work.vel.z - before.z) < 0.001);
    for (const body of [waiting, ship, rock]) assert.ok(Math.hypot(body.vel.x, body.vel.z) < 0.001);
  } finally { ctx.cleanup(); }
});

test('adopted civilian policy requires the current reciprocal same-sector passive job binding', async () => {
  const ctx = await adoptedWorkerFixture();
  try {
    const { owner, entry, state } = ctx;
    assert.equal(planNpcFieldDeploy(owner, state).industrial, true);
    owner.data.trafficRole = 'scavengers';
    assert.equal(planNpcFieldDeploy(owner, state).industrial, true, 'the plural traffic alias uses the same real assignment');
    delete owner.data.trafficRole;
    const cases = [
      ['unassigned', () => { delete owner.data.jobId; }, () => { owner.data.jobId = entry.job.id; }],
      ['wrong entity id', () => { entry.entityId = 99999; }, () => { entry.entityId = owner.id; }],
      ['reused actor id', () => { entry.entityRef = { ...owner }; }, () => { entry.entityRef = owner; }],
      ['replaced map actor', () => { state.entities.set(owner.id, { ...owner }); }, () => { state.entities.set(owner.id, owner); }],
      ['wrong stable actor', () => { entry.worldRecordId += ':stale'; }, () => { entry.worldRecordId = owner.data.worldRecordId; }],
      ['wrong job id', () => { entry.job.id += ':stale'; }, () => { entry.job.id = owner.data.jobId; }],
      ['wrong sector', () => { entry.sectorId = 'elsewhere'; }, () => { entry.sectorId = owner.data.sectorId; }],
      ['wrong actor sector', () => { owner.data.sectorId = 'elsewhere'; }, () => { owner.data.sectorId = entry.sectorId; }],
      ['virtual job', () => { entry.job.materialized = false; }, () => { entry.job.materialized = true; }],
      ['completed job', () => { entry.job.phase = 'complete'; }, () => { entry.job.phase = 'commission'; }],
      ['corrupt job', () => { entry.job.corrupt = true; }, () => { entry.job.corrupt = false; }],
    ];
    for (const [name, change, restore] of cases) {
      change();
      const plan = planNpcFieldDeploy(owner, state);
      assert.equal(plan.industrial, true, name);
      assert.equal(plan.action, 'off', `${name} cannot arm a combat cone`);
      assert.equal(plan.reason, 'no_workpiece', name);
      restore();
    }
    owner.data.ai.passive = false;
    assert.equal(planNpcFieldDeploy(owner, state).reason, 'loose_mass', 'a real combat actor keeps its full cone');
    owner.data.ai.passive = true;
    delete owner.data.jobId;
    delete owner.data.jobKind;
    assert.equal(planNpcFieldDeploy(owner, state).reason, 'loose_mass', 'an unassigned combat-doctrine scavenger keeps its full cone');
    owner.data.jobId = entry.job.id;
    owner.data.jobKind = 'salvor';
    entry._salvorBookedTarget = { id: ctx.work.id, entity: ctx.work };
    assert.equal(planNpcFieldDeploy(owner, state, {
      targetId: ctx.work.id, targetGeneration: ctx.work.occupantGeneration + 1,
    }).action, 'off', 'a stale deployed target generation cannot be reused');
    state.entities.set(ctx.work.id, { ...ctx.work, occupantGeneration: ctx.work.occupantGeneration + 1 });
    const waiting = spawn(ctx.sim, 'payload', 25, 7);
    assert.equal(planNpcFieldDeploy(owner, state).action, 'off', 'a recycled booked target cannot redirect the cone');
    state.entities.set(ctx.work.id, ctx.work);
    ctx.work.pos.x = 500;
    assert.equal(planNpcFieldDeploy(owner, state).action, 'off', 'an out-of-reach workpiece cannot redirect force to the waiting body');
    assert.ok(waiting.alive);
  } finally { ctx.cleanup(); }
});

test('ordinary salvor and sweeper aliases retain the bounded civilian policy', () => {
  for (const role of ['salvor', 'salvors', 'sweeper', 'sweepers']) {
    const owner = { id: 1, type: 'ship', pos: { x: 0, z: 0 }, rot: 0,
      data: { trafficRole: role, ai: { passive: true } } };
    const work = { id: 2, type: 'wreck', pos: { x: 50, z: 0 }, vel: { x: 0, z: 0 } };
    assert.equal(planNpcFieldDeploy(owner, { entityList: [owner, work] }).industrial, true, role);
  }
});

test('already-fast loose mass keeps its earned velocity without a civilian field adding to it', async () => {
  const ctx = await boot();
  try {
    const work = spawn(ctx.sim, 'wreck', 50, 0, 60);
    for (let i = 0; i < 60; i++) ctx.sim.step();
    assert.ok(Math.abs(work.vel.x - 60) < 0.001);
    assert.equal(activeFieldSnapshot(ctx.state).some(f => f.sourceId === ctx.owner.id), false);
  } finally { ctx.cleanup(); }
});

test('player and combat-scavenger cones retain their full physical targeting and strength', async () => {
  for (const options of [{ playerCone: true }, { combatCone: true }]) {
    const ctx = await boot(options);
    try {
      spawn(ctx.sim, 'wreck', 50, -10); // a real loose body admits the combat NPC tool
      const rock = spawn(ctx.sim, 'asteroid', 65, 20);
      const hull = spawn(ctx.sim, 'ship', 90, -25);
      for (let i = 0; i < 60; i++) ctx.sim.step();
      const field = activeFieldSnapshot(ctx.state).find(f => f.sourceId === ctx.owner.id);
      assert.ok(field);
      assert.equal(field.radius, FIELD_DEFS.cone.radius);
      assert.equal(field.strength, FIELD_DEFS.cone.strength);
      assert.equal(field.filters.includeId, undefined);
      assert.ok(Math.hypot(rock.vel.x, rock.vel.z) > 20, 'a combat/player cone still throws real rock');
      assert.ok(Math.hypot(hull.vel.x, hull.vel.z) > 20, 'a combat/player cone still pushes a hull');
    } finally { ctx.cleanup(); }
  }
});

test('work selection has stable ties, retains its current life, and ignores unsuitable material', () => {
  const owner = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: { trafficRole: 'sweeper', ai: { passive: true } } };
  const work = id => ({ id, occupantGeneration: id + 10, type: 'wreck', alive: true,
    pos: { x: 50, z: id === 8 ? -5 : 5 }, vel: { x: 0, z: 0 }, data: {} });
  const a = work(8), b = work(9);
  const unsuitable = [
    { ...work(2), type: 'asteroid', pos: { x: 25, z: 0 } },
    { ...work(3), type: 'ship', pos: { x: 25, z: 0 } },
    { ...work(4), pos: { x: -25, z: 0 } },
    { ...work(5), pos: { x: 25, z: 0 }, physicsBody: { dynamic: false } },
  ];
  const state = { entityList: [...unsuitable, b, a] };
  assert.equal(planNpcFieldDeploy(owner, state).massId, a.id);
  state.entityList.reverse();
  assert.equal(planNpcFieldDeploy(owner, state).massId, a.id, 'entity enumeration cannot change a tie');
  assert.equal(planNpcFieldDeploy(owner, state, { targetId: b.id, targetGeneration: b.occupantGeneration }).massId, b.id,
    'a still-valid workpiece does not get abandoned for a slightly closer candidate');
  assert.equal(planNpcFieldDeploy(owner, state, { targetId: b.id, targetGeneration: 999 }).massId, a.id,
    'a recycled id does not inherit the previous workpiece lease');
});

test('industrial filters preserve target identity through save remaps and reject a recycled life', async () => {
  const ctx = await boot();
  try {
    const work = spawn(ctx.sim, 'wreck', 50);
    for (let i = 0; i < 8; i++) ctx.sim.step();
    const saved = ctx.fieldsSys.serialize();
    const newOwner = { ...ctx.owner, id: 800, occupantGeneration: 901 };
    const newWork = { ...work, id: 801, occupantGeneration: 902 };
    ctx.state.entities.set(800, newOwner); ctx.state.entities.set(801, newWork);
    const remap = new Map([[String(ctx.owner.id), 800], [String(work.id), 801]]);
    ctx.fieldsSys.deserialize(saved, remap);
    const field = ctx.fieldsSys.serialize().fields.find(f => f.sourceId === newOwner.id);
    assert.equal(field.filters.includeId, 801);
    assert.equal(field.filters.includeGeneration, 902);
    assert.equal(field.filters.excludeId, 800);
    assert.equal(ctx.state.fields.npcFields[800].targetId, 801);
    assert.equal(ctx.state.fields.npcFields[800].targetGeneration, 902);
    assert.equal(fieldAffectsBody(field, fieldBodyProfile(newWork, ctx.state)), true);
    assert.equal(fieldAffectsBody(field, fieldBodyProfile({ ...newWork, occupantGeneration: 903 }, ctx.state)), false,
      'an intervening replacement cannot receive a stale workpiece field');
  } finally { ctx.cleanup(); }
});

test('legacy saved civilian cones adopt selective work before the next force pass', async () => {
  const ctx = await boot();
  try {
    const work = spawn(ctx.sim, 'wreck', 50);
    for (let i = 0; i < 8; i++) ctx.sim.step();
    const saved = ctx.fieldsSys.serialize();
    for (const field of saved.fields) {
      field.radius = FIELD_DEFS.cone.radius; field.strength = FIELD_DEFS.cone.strength;
      field.filters = { excludeId: ctx.owner.id }; field.maxAffected = Infinity;
    }
    const old = saved.npcFields[ctx.owner.id];
    delete old.industrial; delete old.targetId; delete old.targetGeneration;
    ctx.fieldsSys.deserialize(saved);
    ctx.sim.step();
    const field = activeFieldSnapshot(ctx.state).find(f => f.sourceId === ctx.owner.id);
    assert.equal(field.radius, CIVILIAN_CLEARING_TUNING.radius);
    assert.equal(field.filters.includeId, work.id);
    assert.ok(field.strength <= CIVILIAN_CLEARING_TUNING.strength);
  } finally { ctx.cleanup(); }
});

test('a legacy saved civilian cone retires immediately when no safe workpiece remains', async () => {
  const ctx = await boot();
  try {
    const work = spawn(ctx.sim, 'wreck', 50);
    for (let i = 0; i < 8; i++) ctx.sim.step();
    const saved = ctx.fieldsSys.serialize();
    for (const field of saved.fields) {
      field.radius = FIELD_DEFS.cone.radius; field.strength = FIELD_DEFS.cone.strength;
      field.filters = { excludeId: ctx.owner.id }; field.maxAffected = Infinity;
    }
    const old = saved.npcFields[ctx.owner.id];
    delete old.industrial; delete old.targetId; delete old.targetGeneration;
    work.vel.x = 60;
    ctx.fieldsSys.deserialize(saved);
    ctx.sim.step();
    assert.equal(activeFieldSnapshot(ctx.state).some(f => f.sourceId === ctx.owner.id), false,
      'the old deployment hold cannot turn an off work intent into an untargeted field');
    assert.equal(ctx.state.fields.npcFields[ctx.owner.id], undefined);
  } finally { ctx.cleanup(); }
});
