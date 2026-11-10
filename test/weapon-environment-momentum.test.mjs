import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner, createSg02CombatPhysicsPort } from '../src/core/sg02DynamicBodyOwner.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { deliverPhysicalImpulseDetailed } from '../src/combat/physicalEffects.js';
import { buildWeaponDamagePacket, applyProjectilePhysicalContact } from '../src/systems/weapons.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { WEAPONS } from '../src/data/weapons.js';

const DT = 1 / 60;
const pulse = WEAPONS.find(w => w.id === 'wpn_pulse_laser_m');
const concussion = WEAPONS.find(w => w.id === 'wpn_concussion_cannon_m');

function spawn(state, spec) {
  const entity = makeEntity({ id: allocateEntityId(state), alive: true, collides: true,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 16, mass: 16,
    hull: 1000, hullMax: 1000, drag: 0, data: {}, flags: {}, ...spec });
  state.entities.set(entity.id, entity);
  state.entityList.push(entity);
  return entity;
}

async function nativeHit({ mass, path = 'damage', def = pulse, type = 'payload', player = false,
  source, origin, sharedForce = false, repeatContact = false, steel = false }) {
  const state = createGameState(47);
  state.mode = 'flight';
  const target = spawn(state, { type, mass, team: 1, isPlayer: player,
    physicsBody: { dynamic: true, shape: 'ball', radius: 16, mass, ccd: true, material: 'payload' } });
  const shooter = spawn(state, { type: 'ship', team: 0, pos: { x: -500, z: 0 }, radius: 4, mass: 16 });
  if (steel) spawn(state, { type: 'station', pos: { x: 100, z: 0 }, radius: 2, mass: 1e6,
    physicsBody: { dynamic: false, shape: 'ball', radius: 2, mass: 1e6, material: 'station' } });
  state.playerId = player ? target.id : shooter.id;
  const bus = createBus(), hitstun = [], deliveries = [];
  bus.on('combat:hitstunImpulse', row => hitstun.push(row));
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  const port = createSg02CombatPhysicsPort(owner);
  const observedPort = { ...port, applyImpulse(input) {
    deliveries.push({ entityId: input.entityId, impulse: { ...input.impulse } });
    return port.applyImpulse(input);
  } };
  const helpers = { combatPhysics: observedPort };
  const kernel = createCombatKernel({ state, bus, helpers });
  try {
    owner.syncFromEntities(state.entityList);
    const packet = buildWeaponDamagePacket({ defId: def.id }, def, def.dmg, def.damageType,
      { x: 0, z: 0 });
    packet.hit.approach = { x: 1, z: 0 };
    if (source) packet.source = source;
    if (sharedForce) {
      assert.equal(deliverPhysicalImpulseDetailed(state, target, { x: pulse.impulsePerHit, z: 0 },
        { tag: 'force_test' }, { port: observedPort }).accepted, true);
    } else if (path === 'damage') {
      const result = kernel.routeDamage({ attackerId: shooter.id, targetId: target.id, packet, origin });
      assert.equal(result.impulseApplied, true, 'the real damage route accepted the physical hit');
    } else {
      const projectile = spawn(state, { type: 'projectile', ownerId: shooter.id, mass: 0.1,
        radius: 1, physicsBody: false, collides: false, pos: { x: -20, z: 0 }, vel: { x: 340, z: 0 },
        data: { kind: 'bullet', weaponId: def.id, damagePacket: packet } });
      const contact = { projectileId: projectile.id, targetId: target.id,
        ownerId: shooter.id, damagePacket: packet, pos: { x: 0, z: 0 } };
      applyProjectilePhysicalContact({ state, helpers, bus }, contact);
      assert.equal(contact.physicalDelivered, true);
      if (repeatContact) applyProjectilePhysicalContact({ state, helpers, bus }, { ...contact, physicalDelivered: false });
    }
    owner.step(DT, 1);
    const record = owner.records.get(target.id);
    const observed = { velocity: { ...target.vel }, position: { ...target.pos }, deliveries, hitstun,
      ccd: record.body.isCcdEnabled(), mass: record.spec.mass };
    observed.maxX = target.pos.x;
    observed.ccdDuringMotion = observed.ccd;
    for (let tick = 2; tick <= 61; tick++) {
      owner.syncFromEntities(state.entityList);
      observed.ccdDuringMotion ||= record.body.isCcdEnabled();
      owner.step(DT, tick);
      observed.maxX = Math.max(observed.maxX, target.pos.x);
    }
    observed.afterOneSecond = { velocity: { ...target.vel }, position: { ...target.pos } };
    return observed;
  } finally { kernel.dispose(); owner.dispose(); }
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < Math.max(1e-5, Math.abs(expected) * 1e-5),
    `${label}: ${actual} versus ${expected}`);
}

test('ordinary weapon momentum reaches real Rapier bodies inversely to mass in both hit paths', async t => {
  const before = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = before; });
  for (const path of ['damage', 'physical-contact']) {
    for (const mass of [2, 16, 180, 800]) {
      const row = await nativeHit({ mass, path, repeatContact: true });
      assert.equal(row.deliveries.length, 1, `${path}/${mass}: one accepted hit`);
      near(row.deliveries[0].impulse.x, 126, `${path}/${mass}: fixed authored momentum`);
      near(row.velocity.x, 126 / mass, `${path}/${mass}: native delta-V`);
      near(row.velocity.z, 0, `${path}/${mass}: no transverse impulse`);
      assert.equal(row.hitstun.length, 1);
      near(row.hitstun[0].deltaV, 126 / mass, `${path}/${mass}: actual delivered hitstun velocity`);
      assert.ok(Object.values(row.afterOneSecond.velocity).every(Number.isFinite));
      assert.ok(Object.values(row.afterOneSecond.position).every(Number.isFinite));
      if (mass === 2) {
        assert.equal(row.ccdDuringMotion, false, `${path}: ordinary pulse remains below native CCD speed gate`);
        near(row.afterOneSecond.velocity.x, 63, `${path}: light debris keeps finite native motion`);
        assert.ok(row.afterOneSecond.position.x > 60, `${path}: CCD light body really travels`);
      }
    }
  }
});

test('an authored concussion hit launches 2t debris with native CCD and a real steel collision', async t => {
  const before = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = before; });
  for (const path of ['damage', 'physical-contact']) {
    const row = await nativeHit({ mass: 2, path, def: concussion, steel: true });
    near(row.velocity.x, 512, `${path}: uncapped authored launch velocity`);
    assert.equal(row.ccdDuringMotion, true, `${path}: existing native CCD activates during fast motion`);
    assert.ok(row.maxX < 100, `${path}: the body never crosses the steel collider (${row.maxX})`);
    assert.ok(row.afterOneSecond.position.x + 16 <= 98.1,
      `${path}: native contact settles the hull outside the steel face (${row.afterOneSecond.position.x})`);
    assert.ok(row.afterOneSecond.velocity.x <= 0
      && Math.abs(row.afterOneSecond.velocity.x) < row.velocity.x,
    `${path}: native steel removes incoming motion without adding bounce energy (${row.afterOneSecond.velocity.x})`);
    assert.ok(Object.values(row.afterOneSecond.position).every(Number.isFinite));
    t.diagnostic(`${path}: 2t launch=${row.velocity.x}, CCD=${row.ccdDuringMotion}, peakX=${row.maxX}, finalX=${row.afterOneSecond.position.x}, rebound=${row.afterOneSecond.velocity.x}`);
  }
});

test('concussion environmental override remains fixed 1024 momentum through both native hit paths', async t => {
  const before = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = before; });
  for (const path of ['damage', 'physical-contact']) {
    const row = await nativeHit({ mass: 180, path, def: concussion });
    near(row.deliveries[0].impulse.x, 1024, `${path}: explicit concussion momentum`);
    near(row.velocity.x, 1024 / 180, `${path}: concussion respects native mass`);
  }
});

test('legacy weapon identity is compatible while explicit nonweapon damage and shared Force stay normalized', async t => {
  const before = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = before; });
  const legacy = { weaponId: pulse.id, impulseProvenance: pulse.impulseProvenance };
  near((await nativeHit({ mass: 180, source: legacy })).velocity.x, 126 / 180, 'legacy weapon provenance');
  near((await nativeHit({ mass: 180, source: {}, origin: { kind: 'weapon', id: pulse.id } })).velocity.x,
    126 / 180, 'legacy weapon origin');
  const force = { ...legacy, kind: 'ability' };
  near((await nativeHit({ mass: 180, source: force, origin: { kind: 'weapon' } })).velocity.x,
    126 / 16, 'explicit ability source keeps normalization');
  near((await nativeHit({ mass: 180, sharedForce: true })).velocity.x, 126 / 16, 'shared Force default');
});

test('ship response and protected player response agree with their unchanged nonweapon control', async t => {
  const before = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  t.after(() => { COMBAT_FLAGS.weaponImpulseConsequences = before; });
  for (const player of [false, true]) {
    const weapon = await nativeHit({ mass: 16, type: 'ship', player });
    const control = await nativeHit({ mass: 16, type: 'ship', player, source: { kind: 'ability' } });
    near(weapon.velocity.x, control.velocity.x, `ship/player=${player}: unchanged native response`);
    if (player) assert.ok(weapon.velocity.x < 126 / 16, 'existing player impulse protection still applies');
    else near(weapon.velocity.x, 126 / 16, 'ordinary ship receives its existing authored impulse');
  }
});
