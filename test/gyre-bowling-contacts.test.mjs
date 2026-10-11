import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { physics } from '../src/core/physics.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { environmentMaterials, addEnvironmentHeat, queueEnvironmentImpact } from '../src/systems/environmentMaterials.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { getCombatKernel } from '../src/combat/kernel.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { GYRE_SNARE as D } from '../src/data/gyreSnare.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

test('real field rocks gather, grow and bowl through several hulls with damage, knockback and pilot credit', async t => {
  const previous = { consequences: COMBAT_FLAGS.weaponImpulseConsequences, fling: COMBAT_FLAGS.tumbleFling };
  COMBAT_FLAGS.weaponImpulseConsequences = COMBAT_FLAGS.tumbleFling = true;
  const sim = createSimulation({ seed: 18122, bus: createBus(), systems: [gyreSnare, physics, environmentMaterials] });
  const { state } = sim;
  state.mode = 'flight'; state.input.actions = {};
  state.runtime = { ...state.runtime, profileId: 'production' };
  const ship = (x, z, team, mass) => sim.spawn({ type: 'ship', pos: { x, z }, vel: { x: 0, z: 0 },
    rot: 0, radius: 12, mass, collides: true, hull: 1200, hullMax: 1200, capMax: 100, team,
    physicsBody: { radius: 12, mass, inertiaY: mass * 100, dynamic: true, ccd: true },
    data: { combatProfileId: 'combat_profile_standard_ship', derived: { cap: 100 } } });
  const player = ship(0, 0, 0, 28); state.playerId = player.id; player.cap = 100;
  const records = [
    insertAsteroidFieldRock(state, { pos: { x: D.mawDist, z: 0 }, radius: 24 }),
    insertAsteroidFieldRock(state, { pos: { x: D.mawDist + 46, z: 14 }, radius: 20 }),
  ];
  const victims = [ship(500, -8, 1, 24), ship(625, 12, 1, 32), ship(750, -10, 1, 40)];
  const bystander = ship(650, 400, 1, 24);
  const kernel = getCombatKernel({ state, bus: sim.bus, helpers: sim.helpers });
  const registry = { get: id => id === 'combat' ? { kernel } : sim.registry.get(id) };
  const impacts = Object.create(collisionConsequences);
  const tumbles = Object.create(tumbleStates);
  for (const owner of [impacts, tumbles]) owner.init({ state, bus: sim.bus, helpers: sim.helpers, registry });
  const gyre = sim.registry.get('gyreSnare'); const physicsOwner = sim.registry.get('physics');
  const hit = []; const contacts = []; const tumbled = new Set(); const stages = [];
  for (const event of ['gyre:snagged', 'gyre:absorbed', 'gyre:launched', 'gyre:dropped', 'environment:fractured']) {
    sim.bus.on(event, p => stages.push({ event, ...p }));
  }
  sim.bus.on('combat:damage', p => { if (victims.some(v => v.id === p.targetId)) hit.push({ ...p }); });
  sim.bus.on('physics:impact', p => contacts.push({ ...p }));
  sim.bus.on('combat:tumbled', p => tumbled.add(p.victimId));
  const step = () => { kernel.prePhysics(SIM_DT); sim.step(); impacts.update(SIM_DT, state); tumbles.update(SIM_DT, state); };
  try {
    assert.equal(await physicsOwner.prepareBackend(state), true);
    state.input.actions.gyreSnare = true;
    for (let i = 0; i < 180 && gyre._rt.totalAbsorbed < 1; i++) step();
    assert.equal(gyre._rt.phase, 'holding');
    assert.equal(gyre._rt.totalAbsorbed, 1, 'both actual field records form one aggregate');
    const ball = state.entities.get(gyre._rt.coreId);
    assert.ok(ball.radius > 24, `aggregate radius grows (${ball.radius})`);
    assert.ok(records.every(r => r.id === ball.id || state.entities.get(r.id)?.alive !== true), 'meal retires');
    const radius = ball.radius, mass = ball.physicsBody.mass;
    state.input.actions.gyreSnare = false;
    let topSpeed = 0;
    for (let i = 0; i < 150; i++) {
      step(); topSpeed = Math.max(topSpeed, Math.hypot(ball.vel.x, ball.vel.z));
      if (victims.every(v => hit.some(p => p.targetId === v.id))) break;
    }
    assert.ok(topSpeed > D.launchSpeed * 0.7, `bowled at ${topSpeed}`);
    assert.equal(ball.alive, true, 'the energized aggregate survives its first strikes to keep bowling');
    for (const victim of victims) {
      assert.ok(contacts.some(p => p.aId === victim.id || p.bId === victim.id), `real contact on ${victim.id}`);
      assert.ok(victim.hull < 1150, `enemy ${victim.id} takes real crumple damage (${victim.hull})`);
      assert.ok(Math.hypot(victim.vel.x, victim.vel.z) > 40, `enemy ${victim.id} knocked away`);
      assert.ok(hit.some(p => p.targetId === victim.id && p.attackerId === player.id), `pilot credited for ${victim.id}`);
    }
    assert.ok(tumbled.size >= 2, 'multiple victims lose the helm');
    assert.equal(bystander.hull, 1200, 'off-axis hulls are outside the bowling corridor');
    assert.ok(!state.physicsRuntime.sg02Snapshot.some(p => p.id === bystander.id), 'threat admission does not wake the whole sector');
    assert.ok(stages.some(p => p.event === 'gyre:snagged') && stages.some(p => p.event === 'gyre:absorbed')
      && stages.some(p => p.event === 'gyre:launched'), 'every player-facing lifecycle beat is emitted');
    t.diagnostic(`seed18122: ${radius.toFixed(1)}WU/${mass.toFixed(0)}t clump, ${topSpeed.toFixed(1)}WU/s; hulls=${victims.map(v => v.hull.toFixed(0))}; speeds=${victims.map(v => Math.hypot(v.vel.x,v.vel.z).toFixed(1))}; tumbles=${tumbled.size}`);
  } finally {
    impacts.destroy(); tumbles.destroy(); sim.registry.get('environmentMaterials').destroy();
    physicsOwner._disableSg02DynamicAuthority();
    COMBAT_FLAGS.weaponImpulseConsequences = previous.consequences; COMBAT_FLAGS.tumbleFling = previous.fling;
  }
});

test('a live mixed-material small-rock feed stays cohesive while gathering', async t => {
  const sim = createSimulation({ seed: 18124, bus: createBus(), systems: [gyreSnare, physics, environmentMaterials] });
  const { state } = sim; state.mode = 'flight'; state.input.actions = { gyreSnare: true };
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    radius: 12, mass: 28, collides: true, cap: 100, hull: 1000, hullMax: 1000, data: { derived: { cap: 100 } } });
  state.playerId = player.id;
  const rocks = [[200, 0, 8, 16, 'rock'], [220, -35, 12, 24, 'metal'], [245, 40, 16, 32, 'crystal']].map(
    ([x, z, radius, mass, material]) => sim.spawn({ type: 'asteroid', pos: { x, z }, vel: { x: 0, z: 0 }, radius,
      physicsBody: { radius, mass, dynamic: true }, collides: true, hull: 1000, hullMax: 1000,
      data: { material, typeId: 'ast_rocky' } }));
  const physicsOwner = sim.registry.get('physics'); const gyre = sim.registry.get('gyreSnare');
  try {
    assert.equal(await physicsOwner.prepareBackend(state), true);
    for (let i = 0; i < 90 && gyre._rt.totalAbsorbed < 2; i++) sim.step();
    assert.equal(gyre._rt.phase, 'holding');
    assert.equal(gyre._rt.totalAbsorbed, 2, 'all three loose bodies remain available to grow the clump');
    assert.equal(state.entities.get(gyre._rt.coreId).alive, true);
    assert.equal(gyre._rt.clumpMass, 72);
    assert.equal(rocks.filter(r => r.alive).length, 1);
    t.diagnostic(`mixed rock/metal/crystal feed: ${gyre._rt.clumpMass}t clump after ${state.tick}ticks, no premature rupture`);
  } finally {
    sim.registry.get('environmentMaterials').destroy(); physicsOwner._disableSg02DynamicAuthority();
  }
});

test('Gyre cohesion ends with its field lease and never prevents a thermal rupture', () => {
  const sim = createSimulation({ seed: 18123, bus: createBus(), systems: [environmentMaterials] });
  const { state } = sim; state.mode = 'flight'; state.simTime = 1;
  const ball = sim.spawn({ type: 'asteroid', radius: 20, collides: true, pos: { x: 200, z: 0 },
    vel: { x: 200, z: 0 }, physicsBody: { radius: 20, mass: 1000, impactDamageScale: 8 },
    data: { material: 'crystal', gyreLaunched: true, despawnAt: 10, gyreLaunchMeta: { holdUntilSim: 10 } } });
  assert.equal(queueEnvironmentImpact(state, ball, 400), false, 'energized flight survives a hard impact');
  state.simTime = 10;
  assert.equal(queueEnvironmentImpact(state, ball, 400), true, 'expired field releases normal fracture');
  state.materialReactions = []; ball.data.materialCondition.pending = false;
  state.simTime = 1;
  assert.equal(addEnvironmentHeat(state, ball, 60), true);
  sim.registry.get('environmentMaterials').update(SIM_DT, state);
  assert.equal(ball.alive, false, 'crystal heat still ruptures an energized aggregate');
  const shards = state.entityList.filter(e => e.alive && e.data?.materialFragment);
  assert.equal(shards.length, 4);
  assert.ok(shards.every(e => !e.data.gyreLaunched && !e.data.gyreLaunchMeta && !e.data.gyreCore),
    'a rupture cannot clone armed Gyre balls or their clump visuals');
  sim.registry.get('environmentMaterials').destroy();
});
