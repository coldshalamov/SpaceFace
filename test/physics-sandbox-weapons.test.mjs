import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { allocateEntityId, makeEntity } from '../src/core/entity.js';
import { createBus } from '../src/core/eventBus.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { GRAVITY_MARK_STATUS_ID } from '../src/data/combatDefs.js';
import { WEAPONS } from '../src/data/weapons.js';
import { buildWeaponDamagePacket, applyProjectilePhysicalContact, weapons } from '../src/systems/weapons.js';
import { opticBookFor, opticChildSpec, settleOpticContact } from '../src/combat/opticField.js';

const DT = 1 / 60;
function spawn(state, spec) {
  const body = makeEntity({ id: allocateEntityId(state), type: 'asteroid', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, alive: true, collides: true, radius: 30, hull: 100, hullMax: 100,
    data: {}, flags: {}, ...spec });
  state.entities.set(body.id, body); state.entityList.push(body); return body;
}
function world() { const state = createGameState(4242); state.mode = 'flight'; state.playerId = -1; return state; }
function speed(body) { return Math.hypot(body.vel.x, body.vel.z); }
function step(state, owner, count = 1, before) {
  for (let i = 0; i < count; i++) { state.tick++; state.simTime = state.tick * DT;
    before?.(); owner.syncFromEntities(state.entityList); owner.step(DT); }
}

test('concussion launches production-mass arena rocks without making them weapon HP targets', async () => {
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  for (const radius of [16, 30, 44]) {
    const state = world(); const rock = spawn(state, { radius });
    assert.ok(resolvePhysicsBodySpec(rock).mass >= 0.25 * radius ** 3);
    const shooter = spawn(state, { type: 'ship', radius: 4, mass: 16, pos: { x: -150, z: 0 } });
    const kernel = createCombatKernel({ state, bus: createBus(), helpers: {} });
    const def = WEAPONS.find(w => w.id === 'wpn_concussion_cannon_m');
    const packet = buildWeaponDamagePacket({ defId: def.id }, def, def.dmg, def.damageType,
      { x: -radius, z: 0 });
    packet.hit.approach = { x: 1, z: 0 };
    const result = kernel.routeDamage({ attackerId: shooter.id, targetId: rock.id, packet });
    assert.equal(result.reason, 'target_not_damageable'); assert.equal(result.impulseApplied, true);
    assert.equal(rock.hull, 100);
    const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
    try { step(state, owner); assert.ok(speed(rock) >= 35 && speed(rock) <= 65, `radius ${radius}: ${speed(rock)}`); }
    finally { owner.dispose(); kernel.dispose(); }
  }
});

test('IFF rejects damage while allowing physical contact and Gravity Marker status reaches rocks', () => {
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const state = world();
  const shooter = spawn(state, { type: 'ship', mass: 16, radius: 4, team: 1 });
  const friend = spawn(state, { type: 'ship', mass: 16, radius: 4, team: 1, pos: { x: 100, z: 0 } });
  const rock = spawn(state, { pos: { x: 200, z: 0 } });
  const kernel = createCombatKernel({ state, bus: createBus(), helpers: {} });
  try {
    const cannon = WEAPONS.find(w => w.id === 'wpn_concussion_cannon_m');
    const friendHit = kernel.routeDamage({ attackerId: shooter.id, targetId: friend.id,
      packet: buildWeaponDamagePacket({ defId: cannon.id }, cannon, cannon.dmg, 'kinetic') });
    assert.equal(friendHit.reason, 'friendly_fire'); assert.equal(friend.hull, 100);
    const mark = WEAPONS.find(w => w.id === 'wpn_gravity_marker_s');
    kernel.routeDamage({ attackerId: shooter.id, targetId: rock.id,
      packet: buildWeaponDamagePacket({ defId: mark.id }, mark, mark.dmg, mark.damageType) });
    state.tick++; kernel.prePhysics(DT);
    assert.ok(state.combat.entities[rock.id].statuses[GRAVITY_MARK_STATUS_ID]);
    assert.equal(state.combat.entities[rock.id].multipliers.fieldCoupling, 3);
    state.tick += 361; kernel.prePhysics(DT);
    assert.equal(state.combat.entities[rock.id].statuses[GRAVITY_MARK_STATUS_ID], undefined);
  } finally { kernel.dispose(); }
});

test('missile splash physically reaches scenery and delivers once at a direct impact', async () => {
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const state = world(); const direct = spawn(state, { pos: { x: 0, z: 0 }, radius: 16 });
  const nearby = spawn(state, { pos: { x: 36, z: 0 }, radius: 16 });
  const def = WEAPONS.find(w => w.id === 'wpn_missile_rack_m');
  const projectile = spawn(state, { type: 'projectile', radius: 1, mass: 0.1, pos: { x: -16, z: 0 }, vel: { x: 320, z: 0 },
    data: { kind: 'missile', weaponId: def.id, damage: def.dmg, damageType: def.damageType,
      splashRadius: def.splashRadius, splashDmg: def.splashDmg,
      damagePacket: buildWeaponDamagePacket({ defId: def.id }, def, def.dmg, def.damageType) } });
  const host = { state, helpers: {} };
  const payload = { projectileId: projectile.id, targetId: direct.id, pos: { x: -16, z: 0 }, damagePacket: projectile.data.damagePacket };
  applyProjectilePhysicalContact(host, payload); applyProjectilePhysicalContact(host, { ...payload });
  projectile.alive = false;
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  try { step(state, owner); assert.ok(speed(nearby) > 0.5, `splash speed ${speed(nearby)}`);
    assert.ok(speed(direct) < 15, 'direct contact is not doubled by splash'); }
  finally { owner.dispose(); }
});

test('Vector Mine and Wellhead act on real large rocks', async () => {
  COMBAT_FLAGS.weaponImpulseConsequences = true;
  const state = world(); const rock = spawn(state, { pos: { x: 60, z: 0 } });
  const mine = spawn(state, { type: 'vectormine', radius: 2, pos: { x: 0, z: 0 }, physicsBody: false });
  const host = { helpers: {}, bus: createBus() };
  const owner = await createSg02DynamicBodyOwner({ fixedDt: DT, publishTelemetry: false });
  try {
    weapons._detonateVectorMine.call(host, mine, { blastRadius: 150, impulse: 756, provenance: 'vector_mine_pulse' }, state);
    step(state, owner); assert.ok(speed(rock) >= 30, `Vector Mine ${speed(rock)}`);
    const before = rock.vel.x;
    step(state, owner, 30, () => weapons._tickGravityWell.call(host, mine, { pull: 62, blastRadius: 200, provenance: 'gravity_well_pull' }, state, DT));
    assert.ok(rock.vel.x < before, 'Wellhead bends the moving rock');
  } finally { owner.dispose(); }
});

test('metal reflects kinetic bolts in its moving frame and children preserve the four-bounce budget', () => {
  const metal = { id: 2, pos: { x: 0, z: 0 }, radius: 16, vel: { x: 10, z: 0 }, data: { opticMaterial: 'metal' } };
  const projectile = { id: 1, type: 'projectile', alive: true, radius: 1, pos: { x: -16, z: 0 }, vel: { x: 100, z: 0 },
    data: { kind: 'bullet', damageType: 'kinetic', spawnPos: { x: -50, z: 0 }, maxDistance: 1600 } };
  const book = opticBookFor(new Map(), 'test');
  for (let i = 0; i < 4; i++) {
    projectile.vel.x = 100;
    const result = settleOpticContact(projectile, metal, { normal: { x: -1, z: 0 } }, book);
    assert.equal(result.kind, 'reflect'); assert.equal(projectile.vel.x, -80);
  }
  assert.equal(settleOpticContact(projectile, metal, { normal: { x: -1, z: 0 } }, book).reason, 'material_budget');
  const child = opticChildSpec(projectile, { familyId: 'test', generation: 1, heading: 0, x: 0, z: 0 });
  assert.equal(child.data.materialBouncesRemaining, 0);
});
