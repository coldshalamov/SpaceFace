import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bombScenario } from './helpers/bombScenario.mjs';
import { BOMB_DEFS, BOMB_DRIFT, BOMB_IDS } from '../src/data/bombs.js';
import { integrateBombDrift, sweptBombContact, bombSurfaceFalloff, bombFieldEnvelope, fillBombViscosityImpulse } from '../src/combat/bombDynamics.js';
import { consumePhysicsCommand, shouldSyncPhysicsBodyEntity, queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { PRODUCTION_UPDATE_ORDER } from '../src/runtime/authoritativeSystemManifest.js';
import { readBombBayModel, readRailModel } from '../src/ui/powerRail.js';
import { GAMEPAD_DEFAULT_BINDINGS, gamepadShareAllowed } from '../src/systems/gamepad.js';
import { TAUGHT_FLIGHT_ACTIONS } from '../src/systems/input.js';

const DT = 1 / 60;
function near(a, b, tolerance = 1e-9) { assert.ok(Math.abs(a - b) <= tolerance, `${a} ≈ ${b}`); }
function openField(t, id = 'bomb_goo') {
  const bomb = t.drop(id);
  t.tick(31);
  t.system.commandDetonate(t.player.id);
  t.tick(11);
  assert.equal(bomb.data.phase, 'field');
  return bomb;
}

 test('analytic drift has the zero-drag limit and a timestep-partition oracle', () => {
  const one = {}, many = { x: 1, z: 2, vx: 80, vz: -12 };
  integrateBombDrift(one, 1, 2, 80, -12, 3, BOMB_DRIFT.dragPerS);
  for (let i = 0; i < 180; i++) integrateBombDrift(many, many.x, many.z, many.vx, many.vz, DT, BOMB_DRIFT.dragPerS);
  for (const key of ['x', 'z', 'vx', 'vz']) near(one[key], many[key]);
  integrateBombDrift(one, 1, 2, 80, -12, 3, 0);
  assert.deepEqual(one, { x: 241, z: -34, vx: 80, vz: -12 });
  assert.throws(() => integrateBombDrift(one, 0, 0, 1, 0, -1, 0), RangeError);
});

 test('the relative sweep catches crossings, tangencies and arming-boundary cases', () => {
  near(sweptBombContact(-100, 0, 100, 0, 10), 0.45);
  near(sweptBombContact(-100, 10, 100, 10, 10), 0.5);
  assert.equal(sweptBombContact(-100, 0, 100, 0, 10, 0.6), Infinity, 'crossed while safe');
  near(sweptBombContact(-100, 0, 100, 0, 10, 0.48), 0.48);
  assert.equal(sweptBombContact(100, 0, 100, 0, 10), Infinity);
  assert.equal(sweptBombContact(NaN, 0, 1, 0, 10), Infinity);
});

 test('drift bombs stay out of Rapier and keep bomb-owned kinematics, but join the spatial-dynamic layer so the projectile-sweep hash follows them', () => {
  const t = bombScenario({ velocity: { x: 80, z: 0 } });
  try {
    const bomb = t.drop(), x = bomb.pos.x;
    assert.equal(shouldSyncPhysicsBodyEntity(bomb), false);
    assert.equal(bomb.physicsBody, false);
    assert.equal(t.state.entityIndex.physicsBodies.includes(bomb), false);
    assert.equal(t.state.entityIndex.movables.includes(bomb), true, 'kinematic interp + sweep hash');
    assert.equal(t.state.entityIndex.collidables.includes(bomb), true, 'projectile-sweep proxy');
    t.tick(); near(bomb.prevPos.x, x);
    const x2 = bomb.pos.x; assert.ok(x2 > x, 'the live index actually advances the bomb'); t.tick(); near(bomb.prevPos.x, x2);
    t.player.vel.x = -300;
    t.tick(); assert.ok(bomb.vel.x > 0, 'the bomb does not follow a later turn or velocity change');
  } finally { t.close(); }
});

 test('a fast hostile crossing trips a swept fuze even with both endpoints outside', () => {
  const t = bombScenario();
  try {
    const bomb = t.drop(); t.tick(31);
    t.spawn({ pos: { x: bomb.pos.x - 100, z: 0 }, vel: { x: 12000, z: 0 }, radius: 0 });
    t.tick();
    assert.equal(bomb.data.phase, 'warning');
    assert.equal(t.events('detonated').length, 0);
    assert.equal(t.events('primed')[0].trigger, 'proximity');
    t.tick(11); assert.equal(t.events('detonated').length, 1);
  } finally { t.close(); }
});

 test('remote command leaves safe bombs, enemy bombs and live fields alone; is idempotent', () => {
  const t = bombScenario();
  try {
    const own = t.drop(), enemy = t.spawn({ pos: { x: 2000, z: 0 } });
    const hostile = t.drop('bomb_frag', enemy);
    assert.equal(t.system.commandDetonate(t.player.id), 0, 'safe fuze cannot be bypassed');
    t.tick(31);
    assert.equal(t.system.commandDetonate(t.player.id), 1);
    assert.equal(t.system.commandDetonate(t.player.id), 0);
    assert.equal(own.data.phase, 'warning'); assert.equal(hostile.data.phase, 'drift');
    t.tick(11); assert.equal(t.events('detonated').length, 1);
    assert.equal(t.system._detonate(own, own.data, t.state, 'command'), false);
    t.state.bombs.cooldowns = {}; t.state.bombs.cooldownUntil = 0;
    const field = openField(t);
    assert.equal(t.system.commandDetonate(t.player.id), 0);
    assert.equal(field.data.phase, 'field');
  } finally { t.close(); }
});

 test('the shared R edge reaches bombs before charges consume it and is never stolen', () => {
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('bombs') < PRODUCTION_UPDATE_ORDER.indexOf('impulseCharges'));
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('bombs') < PRODUCTION_UPDATE_ORDER.indexOf('physics'));
  const t = bombScenario();
  try {
    const bomb = t.drop(); t.tick(31); t.press('chargeDetonate'); t.tick();
    assert.equal(bomb.data.phase, 'warning');
    assert.equal(t.state.input.actions.chargeDetonate, true, 'the charge owner still receives the edge');
  } finally { t.close(); }
});

 test('mixed payloads share a short release latch, not the singularity cooldown', () => {
  const t = bombScenario();
  try {
    const slug = t.drop('bomb_singularity');
    assert.equal(t.drop('bomb_concussion'), null, 'mechanical latch blocks immediate cross-payload spam');
    t.tick(22);
    assert.ok(t.drop('bomb_concussion'), 'can stage a shove while the slug is still on cooldown');
    t.tick(22);
    assert.equal(t.drop('bomb_singularity'), null, 'cycling does not reset a payload cooldown');
    assert.equal(slug.alive, true);
  } finally { t.close(); }
});

 test('the deployed cap refuses a drop without deleting traps or charging cooldown', () => {
  const t = bombScenario();
  try {
    for (let i = 0; i < 6; i++) { assert.ok(t.drop(BOMB_IDS[i])); t.tick(22); }
    const until = t.state.bombs.cooldownUntil;
    assert.equal(t.drop('bomb_anchor'), null);
    assert.equal(t.events('denied').at(-1).reason, 'bay_full');
    assert.equal(t.state.bombs.cooldownUntil, until);
    assert.equal(t.state.entityList.filter(e => e.alive && e.type === 'bomb').length, 6);
  } finally { t.close(); }
});

 test('a refused physics impulse creates no shove or hitstun receipt', () => {
  const t = bombScenario({ acceptImpulse: false });
  try {
    const bomb = t.drop('bomb_concussion');
    t.spawn({ pos: { x: bomb.pos.x + 20, z: 0 } }); t.tick(43);
    assert.ok(t.impulses.length > 0, 'delivery was attempted');
    assert.equal(t.events('detonated')[0].shoves.length, 0);
    assert.equal(t.hits.length, 0);
  } finally { t.close(); }
});

 test('surface falloff includes large hulls; loose dynamic mass shoves but static rock does not', () => {
  near(bombSurfaceFalloff(140, 30, 130), 1 - 110 / 130);
  const t = bombScenario();
  try {
    const bomb = t.drop('bomb_concussion');
    const chunk = t.spawn({ type: 'asteroid', data: { isChunk: true }, pos: { x: bomb.pos.x + 30, z: 0 }, radius: 4 });
    const rock = t.spawn({ type: 'asteroid', pos: { x: bomb.pos.x + 30, z: 20 }, radius: 4 });
    t.tick(31); t.system.commandDetonate(t.player.id); t.tick(11);
    assert.ok(t.impulses.some(p => p.entityId === chunk.id));
    assert.ok(!t.impulses.some(p => p.entityId === rock.id));
    assert.equal(t.damage.length, 0, 'collision damage, not direct damage, is the concussion payoff');
  } finally { t.close(); }
});

 test('station damage is not accidentally excluded by the shipLike index', () => {
  const t = bombScenario();
  try {
    const bomb = t.drop();
    const station = t.spawn({ type: 'station', pos: { x: bomb.pos.x + 150, z: 0 }, radius: 90 });
    t.tick(31); t.system.commandDetonate(t.player.id); t.tick(11);
    assert.ok(t.damage.some(p => p.targetId === station.id));
  } finally { t.close(); }
});

 test('goo queues frame-relative damping without writing velocity or commanding reverse motion', () => {
  const t = bombScenario();
  try {
    const bomb = openField(t);
    const victim = t.spawn({ pos: { x: bomb.pos.x, z: 0 }, vel: { x: 80, z: 0 } });
    const before = { ...victim.vel }; t.tick();
    assert.deepEqual({ ...victim.vel }, before, 'only the solver writes motion');
    const command = consumePhysicsCommand(victim);
    assert.equal(command.control, null); assert.equal(command.impulses.length, 1);
    assert.ok(command.impulses[0].x < 0);
    const scratch = {};
    assert.ok(fillBombViscosityImpulse(scratch, { x: 0.1, z: 0 }, { x: 0, z: 0 }, 8, 10, 2.4));
    assert.ok(Math.abs(scratch.x / 8) <= 0.1);
  } finally { t.close(); }
});

 test('overlapping goo fields do not multiply the per-tick brake past the reference frame', () => {
  const t = bombScenario();
  try {
    const first = openField(t), second = t.spawn({ type: 'bomb', physicsBody: false, pos: first.pos,
      vel: { x: 0, z: 0 }, data: { ...first.data, ownerId: 99 }, radius: 1 });
    const victim = t.spawn({ pos: { x: first.pos.x, z: 0 }, vel: { x: 0.1, z: 0 } });
    t.tick();
    const impulses = consumePhysicsCommand(victim).impulses;
    assert.equal(impulses.length, 2);
    const dv = impulses.reduce((sum, p) => sum + p.x / victim.mass, 0);
    near(dv, -0.1 * -Math.expm1(-BOMB_DEFS.bomb_goo.field.dragPerS * DT), 1e-8);
    assert.equal(second.alive, true);
  } finally { t.close(); }
});

 test('goo rupture slows the moving cloud, while the capsule keeps the release drift law', () => {
  const t = bombScenario({ velocity: { x: 100, z: 0 } });
  try {
    const bomb = openField(t), before = bomb.vel.x;
    t.tick(60);
    near(bomb.vel.x, before * Math.exp(-BOMB_DEFS.bomb_goo.field.driftDragPerS), 1e-8);
  } finally { t.close(); }
});

 test('singularity decays, uses dt, and never pulls after expiry or collapses on sector cleanup', () => {
  near(bombFieldEnvelope(1.4, 0, 2.8, 0.25), 0.625);
  assert.equal(bombFieldEnvelope(2.8, 0, 2.8, 0.25), 0);
  const t = bombScenario();
  try {
    const bomb = openField(t, 'bomb_singularity');
    const victim = t.spawn({ pos: { x: bomb.pos.x + 20, z: 0 } });
    t.tick(); const early = Math.abs(consumePhysicsCommand(victim).impulses[0].x);
    t.tick(90); consumePhysicsCommand(victim); t.tick();
    const late = Math.abs(consumePhysicsCommand(victim).impulses[0].x);
    assert.ok(late < early * 0.7);
    t.bus.emit('sector:exit', {});
    assert.equal(t.events('fieldEnded').length, 1);
    assert.ok(!t.events('detonated').some(p => p.trigger === 'collapse'));
    t.tick(); assert.equal(consumePhysicsCommand(victim), null);
  } finally { t.close(); }
});

 test('the new Havoc shove contains a real tangential component at unchanged total impulse', () => {
  const t = bombScenario();
  try {
    const bomb = t.drop('bomb_scrambler');
    const target = t.spawn({ pos: { x: bomb.pos.x + 20, z: 0 }, radius: 0 });
    t.tick(43);
    const shove = t.impulses.find(p => p.entityId === target.id).impulse;
    assert.ok(shove.x > 0 && shove.z > 0);
    near(Math.hypot(shove.x, shove.z), 520 * (1 - 20 / 82));
  } finally { t.close(); }
});

 test('HUD exposes live payload, readiness, occupancy and armed remote availability', () => {
  const t = bombScenario();
  try {
    t.state.bombs.selectedId = 'bomb_singularity'; t.drop('bomb_singularity');
    assert.equal(readBombBayModel(t.state, 0).state, 'cooling');
    t.tick(31);
    const bay = readBombBayModel(t.state, t.state.simTime);
    assert.equal(bay.name, 'Pull'); assert.equal(bay.deployed, 1); assert.equal(bay.armedCount, 1);
    assert.equal(readRailModel(t.state, t.state.simTime)[2].state, 'armed');
    t.state.bombs.selectedId = 'bomb_concussion';
    assert.equal(readBombBayModel(t.state, t.state.simTime).state, 'ready');
    // PQ-205.03: save:loaded sweeps live bomb entities only — the owner deserializer restores
    // the rack bag; the event itself never resets selection or payload cooldowns.
    t.bus.emit('save:loaded', {});
    assert.equal(t.state.bombs.selectedId, 'bomb_concussion');
    assert.ok(t.state.bombs.cooldowns.bomb_singularity > 0, 'payload cooldowns survive the load boundary');
  } finally { t.close(); }
});

 test('keyboard teaching, controller mapping and rebind settings cover all three bay verbs', () => {
  for (const action of ['dropBomb', 'cycleBomb', 'chargeDetonate']) assert.ok(TAUGHT_FLIGHT_ACTIONS.includes(action));
  assert.deepEqual(GAMEPAD_DEFAULT_BINDINGS.chargeDetonate, ['dDown']);
  assert.equal(gamepadShareAllowed('chargeDetonate', 'fire'), false);
  assert.equal(gamepadShareAllowed('chargeDetonate', 'tabPrev'), true);
  const settings = readFileSync(new URL('../src/ui/screens/settings.js', import.meta.url), 'utf8');
  for (const action of ['dropBomb', 'cycleBomb', 'chargeDetonate']) assert.ok(settings.includes(`${action}: '`) && settings.includes(`'${action}'`));
});

 test('all eight definitions travel through the same lifecycle, damage and cleanup path', () => {
  for (const id of BOMB_IDS) {
    const t = bombScenario();
    try {
      const def = BOMB_DEFS[id];
      assert.ok(def.cooldownS > BOMB_DRIFT.releaseIntervalS && def.fuzeS > BOMB_DRIFT.armS);
      const bomb = t.drop(id); t.spawn({ pos: { x: bomb.pos.x + 10, z: 0 } });
      t.tick(43);
      assert.equal(t.events('detonated').length, 1, id);
      assert.equal(t.events('detonated')[0].payloadId, id);
      assert.equal(bomb.alive, Boolean(def.field), id);
      t.system.releaseAll('test_exit');
      assert.equal(bomb.alive, false, id);
    } finally { t.close(); }
  }
});

 test('the production Rapier owner applies goo braking with the real status mass response', async () => {
  const t = bombScenario();
  const solver = await createSg02DynamicBodyOwner({ fixedDt: DT, quantum: 1e-5 });
  try {
    const bomb = openField(t);
    t.player.pos.set(2000, 0, 0);
    const victim = t.spawn({ pos: { x: bomb.pos.x, z: 0 }, vel: { x: 80, z: 0 }, radius: 1 });
    const kernel = createCombatKernel({ state: t.state, bus: t.bus, helpers: {}, registry: { get: () => null } });
    t.helpers.routeCombatDamage = req => kernel.routeDamage(req);
    // Land the same goo status packet the bomb uses, then let the existing kernel write response.
    kernel.routeDamage({ attackerId: t.player.id, targetId: victim.id,
      packet: { channels: { kinetic: 0, thermal: 0, ion: 0, plasma: 0, phase: 0 }, statuses: [{ id: 'status_goo', stacks: 2 }], penetration: 0, heat: 0,
        flags: { ignoreFriendlyFire: true, allowAnyTarget: true } }, origin: { kind: 'bomb', id: bomb.id } });
    solver.syncFromEntities(t.state.entityIndex.physicsBodies);
    const initial = victim.vel.x;
    for (let i = 0; i < 60; i++) {
      t.state.tick++; t.state.simTime += DT;
      kernel.prePhysics(DT);
      t.system.update(DT, t.state);
      solver.syncFromEntities(t.state.entityIndex.physicsBodies);
      solver.step(DT); kernel.postPhysics();
    }
    assert.ok(victim.vel.x > 0 && victim.vel.x < initial * 0.3, `real velocity reduced: ${initial} -> ${victim.vel.x}`);
    assert.ok(t.state.combat.entities[String(victim.id)].physicsResponse.massScale > 1);
    assert.equal(bomb.physicsBody, false, 'solver never enrolls or replaces bomb kinematics');
  } finally { solver.dispose(); t.close(); }
});
