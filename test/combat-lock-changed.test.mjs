import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { weapons } from '../src/systems/weapons.js';

function boot() {
  const bus = createBus();
  const entities = new Map();
  const entityList = [];
  const state = {
    mode: 'flight',
    tick: 1,
    simTime: 0,
    playerId: 1,
    player: { targetId: null, tether: { targetId: null } },
    meta: { seed: 17 },
    entities,
    entityList,
    combat: { beams: [], entities: {} },
    input: { fire: false, actions: {} },
  };
  let nextEntityId = 10;
  const player = {
    id: 1, type: 'ship', team: 0, alive: true, radius: 8,
    pos: { x: 80, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
    data: { weapons: [], combat: { targetId: null, lockTarget: null, lockProgress: 0 } },
    flags: {},
  };
  const hunter = {
    id: 2, type: 'ship', team: 1, alive: true, radius: 8,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    data: {
      weapons: [{ defId: 'wpn_test_lock', tracking: 'homing', lockTimeS: 0.01, _cooldown: 0, _heat: 0 }],
      combat: { targetId: 1, lockTarget: null, lockProgress: 0 },
    },
    flags: {},
  };
  entities.set(1, player);
  entities.set(2, hunter);
  entityList.push(player, hunter);
  const system = Object.create(weapons);
  system.init({
    state,
    bus,
    helpers: {
      hash32,
      mulberry32,
      getEntity: (id) => entities.get(id) || null,
      spawnEntity: (spec) => {
        const entity = { ...spec, id: nextEntityId++, alive: true };
        entities.set(entity.id, entity);
        entityList.push(entity);
        return entity;
      },
    },
  });
  return { bus, state, system, hunter };
}

function closestApproachDistance(projectile, target) {
  const rx = target.pos.x - projectile.pos.x;
  const rz = target.pos.z - projectile.pos.z;
  const vx = target.vel.x - projectile.vel.x;
  const vz = target.vel.z - projectile.vel.z;
  const vv = vx * vx + vz * vz;
  const t = vv > 1e-12 ? Math.max(0, -(rx * vx + rz * vz) / vv) : 0;
  return Math.hypot(rx + vx * t, rz + vz * t);
}

function physicalLaunchVelocity(angle, speed, shooterVelocity) {
  const dx = Math.cos(angle);
  const dz = Math.sin(angle);
  const along = shooterVelocity.x * dx + shooterVelocity.z * dz;
  const lateralSquared = Math.max(0,
    shooterVelocity.x ** 2 + shooterVelocity.z ** 2 - along ** 2);
  const worldSpeed = speed ** 2 > lateralSquared
    ? along + Math.sqrt(speed ** 2 - lateralSquared)
    : speed;
  return { x: dx * worldSpeed, z: dz * worldSpeed };
}

test('incoming missile lock emits combat:lockChanged so jump lock and the HUD alert can fire', () => {
  const { bus, state, system, hunter } = boot();
  const events = [];
  bus.on('combat:lockChanged', (p) => events.push(p));

  for (let i = 0; i < 8; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockProgress >= 1, true, 'lock completes across the 0.05s floor');
  assert.equal(hunter.data.combat.lockTarget, 1);
  assert.equal(events.length, 1, 'lock edge emits once');
  assert.deepEqual(events[0], { locked: true, targetId: 1, shooterId: 2 });

  system.update(1 / 60, state);
  assert.equal(events.length, 1, 'held lock does not re-emit');

  hunter.data.combat.targetId = null;
  hunter.rot = Math.PI;
  for (let i = 0; i < 8; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null);
  assert.equal(events.at(-1)?.locked, false, 'lost lock clears the alert / jump interdiction');
});

test('an out-of-range missile rack cannot lock the player or prevent a jump', () => {
  const { bus, state, system, hunter } = boot();
  const events = [];
  bus.on('combat:lockChanged', (p) => events.push(p));
  hunter.data.weapons = [{ defId: 'wpn_missile_rack_m', lockTimeS: 0.05, _cooldown: 0, _heat: 0 }];
  const player = state.entities.get(state.playerId);
  player.pos.x = 1000;
  for (let i = 0; i < 12; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null, 'a 280 WU rack cannot lock a target at 1000 WU');
  assert.equal(hunter.data.combat.lockProgress, 0);
  assert.equal(events.some((p) => p.locked), false, 'the unreachable rack cannot publish jump interdiction');
  player.pos.x = 280;
  for (let i = 0; i < 4; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockProgress, 1, 'the authored range boundary is reachable');
  player.pos.x = 281;
  for (let i = 0; i < 4; i++) system.update(1 / 60, state);
  assert.equal(hunter.data.combat.lockTarget, null, 'leaving range releases an acquired lock');
  assert.equal(events.at(-1)?.locked, false);
});

test('a short-range rack cannot lend its faster lock to a distant torpedo target', () => {
  const { state, system, hunter } = boot();
  hunter.data.weapons = [
    { defId: 'wpn_missile_rack_m', lockTimeS: 0.05, _cooldown: 0, _heat: 0 },
    { defId: 'wpn_torpedo_l', lockTimeS: 2.5, _cooldown: 0, _heat: 0 },
  ];
  state.entities.get(state.playerId).pos.x = 1000;
  for (let i = 0; i < 60; i++) system.update(1 / 60, state);
  assert.ok(Math.abs(hunter.data.combat.lockProgress - 0.4) < 1e-9,
    'only the torpedo can reach 1000 WU, so its 2.5s observation window governs the lock');
});

test('target-bound NPC fixed fire physically intercepts from the real muzzle', () => {
  const { state, system, hunter } = boot();
  hunter.data.defId = 'ship_hornet';
  hunter.pos.x = 0;
  hunter.pos.z = 0;
  hunter.vel.x = 0;
  hunter.vel.z = 24;
  const base = system._byId.get('wpn_pulse_laser_s');
  const def = { ...base, spreadDeg: 0 };
  const mount = { defId: def.id, slotIndex: 0, gimbalArc: Math.PI * 2, _cooldown: 0, _heat: 0 };
  const target = { id: 99, pos: { x: 120, z: 100 }, vel: { x: -30, z: 45 }, alive: true };
  const muzzle = system._muzzle(hunter, mount, 0);
  assert.ok(Math.hypot(muzzle.x - hunter.pos.x, muzzle.z - hunter.pos.z) > 0.5,
    'the real Hornet hardpoint is offset from the hull center');

  let spawned = null;
  const realSpawn = system._spawnProjectile;
  system._spawnProjectile = function (...args) {
    realSpawn.apply(this, args);
    spawned = state.entityList.at(-1);
  };
  system._serviceProjectileWeapon(hunter, mount, def, false, 100, 1 / 60, state, 0, target);
  assert.ok(spawned?.type === 'projectile', 'the normal weapon owner creates a live projectile');
  const physicalMiss = closestApproachDistance(spawned, target);
  const centerLead = system._leadAngle(hunter, target, def.projSpeed);
  const centerAimShot = {
    pos: system._muzzle(hunter, mount, centerLead),
    vel: physicalLaunchVelocity(centerLead, def.projSpeed, hunter.vel),
  };
  const centerLeadMiss = closestApproachDistance(centerAimShot, target);
  assert.ok(physicalMiss < 0.2, `spawned projectile misses the moving target by ${physicalMiss.toFixed(3)} WU`);
  assert.ok(centerLeadMiss > physicalMiss + 0.5,
    `hull-center lead misses by ${centerLeadMiss.toFixed(2)} WU versus ${physicalMiss.toFixed(3)} WU from the muzzle`);
});

test('target-bound NPC turrets physically intercept from the real muzzle', () => {
  const { state, system, hunter } = boot();
  hunter.data.defId = 'ship_hornet';
  hunter.vel.x = 0;
  hunter.vel.z = 24;
  const def = { ...system._byId.get('wpn_emp_disruptor_m'), spreadDeg: 0 };
  const mount = {
    defId: def.id, slotIndex: 2, facing: 'turret', tracking: 'auto_turret',
    gimbalArc: Math.PI * 2, _cooldown: 0, _heat: 0,
  };
  const target = { id: 99, pos: { x: 120, z: 100 }, vel: { x: -30, z: 45 }, alive: true };
  let spawned = null;
  const realSpawn = system._spawnProjectile;
  system._spawnProjectile = function (...args) {
    realSpawn.apply(this, args);
    spawned = state.entityList.at(-1);
  };
  system._serviceProjectileWeapon(hunter, mount, def, false, 100, 1 / 60, state, 0, target);
  assert.ok(spawned?.type === 'projectile', 'the normal weapon owner creates a live turret projectile');
  const physicalMiss = closestApproachDistance(spawned, target);
  assert.ok(physicalMiss < 0.2, `turret projectile misses the moving target by ${physicalMiss.toFixed(3)} WU`);
});

test('missile launch revalidates the target and each mount range before spending charge', () => {
  const { state, system, hunter } = boot();
  const target = state.entities.get(state.playerId);
  const shots = [];
  system._spawnProjectile = (_owner, _mount, _def, _dir, tgt) => shots.push(tgt.id);
  const def = system._byId.get('wpn_missile_rack_m');
  const mount = { defId: def.id, _cooldown: 0, _heat: 0 };
  hunter.data.combat.lockTarget = target.id;
  hunter.data.combat.lockProgress = 1;
  target.pos.x = 1000;
  const fire = (forcedTarget = null) => system._serviceProjectileWeapon(
    hunter, mount, def, false, 100, 1 / 60, state, 0, forcedTarget,
  );
  assert.equal(fire(), 100, 'a long-range rack lock does not let this 280 WU mount fire at 1000 WU');
  target.pos.x = 80;
  const other = { ...target, id: 3 };
  assert.equal(fire(other), 100, 'a lock on one contact cannot launch a round against another');
  assert.equal(shots.length, 0, 'refused launch spends neither a projectile nor a cooldown');
  assert.equal(fire(), 100 - def.energyCost, 'a valid in-range lock still fires');
  assert.deepEqual(shots, [target.id]);
});
