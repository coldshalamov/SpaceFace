import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { weapons } from '../src/systems/weapons.js';
import { createAutoTargetRuntime, tickAutoTarget } from '../src/combat/autoTargetMode.js';
import { hash32, mulberry32 } from '../src/core/rng.js';

function fire({ heading = 0, auto = true, trigger = true, targetTeam = 1,
  shooterVel = { x: 152, z: 0 }, targetVel = { x: 35, z: 65 },
  targetPos = { x: -180, z: 90 }, projSpeed = 320, beam = false, turret = false, scheme = 'pilot' } = {}) {
  const state = createGameState(4242);
  state.settings.gameplay.controlScheme = scheme;
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  const player = { id: 1, type: 'ship', alive: true, flags: {}, team: 0, cap: 1000,
    radius: 14, pos: { x: 0, z: 0 }, vel: { ...shooterVel }, rot: heading, angVel: 0,
    mass: 1, data: { weapons: [{ defId: beam ? 'wpn_beam_laser_m' : 'wpn_pulse_laser_s',
      projSpeed, gimbalArc: Math.PI / 12, facingAngle: 0, muzzleOffset: [0.8, 0.4],
      ...(turret ? { facing: 'turret' } : {}), _cooldown: 0, _heat: 0 }] } };
  const target = { id: 2, type: 'ship', alive: true, flags: {}, team: targetTeam, radius: 6,
    pos: { ...targetPos }, vel: { ...targetVel }, rot: 0, mass: 1, data: { combat: { targetId: 1 } } };
  state.entities.set(1, player); state.entities.set(2, target);
  state.entityList.push(player, target);
  state.playerId = 1; state.player.targetId = 2;
  state.input.autoFire = auto;
  state.input.fire = trigger;
  state.input.aimAngle = Math.atan2(targetPos.z, targetPos.x);
  const spawned = [];
  const bus = createBus();
  const helpers = { hash32, mulberry32, getEntity: id => state.entities.get(id),
    spawnEntity: spec => { const e = { id: 100 + spawned.length, alive: true, ...spec };
      spawned.push(e); return e; } };
  const system = Object.create(weapons);
  system.init({ state, bus, helpers });
  if (auto) tickAutoTarget(state, 1 / 60, bus, createAutoTargetRuntime());
  system.update(1 / 60, state);
  return { state, player, target, spawned };
}

function closestApproach(shot, target) {
  const px = target.pos.x - shot.pos.x, pz = target.pos.z - shot.pos.z;
  const vx = target.vel.x - shot.vel.x, vz = target.vel.z - shot.vel.z;
  const t = -(px * vx + pz * vz) / (vx * vx + vz * vz);
  return { t, miss: Math.hypot(px + vx * t, pz + vz * t) };
}

for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
  for (const projSpeed of [320, 420, 700]) {
    test(`G leads from the actual muzzle independent of nose: yaw=${heading.toFixed(2)}, projectile=${projSpeed}`, () => {
      const { target, spawned } = fire({ heading, projSpeed });
      assert.equal(spawned.length, 1, 'a locked target does not starve the trigger outside the nose cone');
      const { miss, t } = closestApproach(spawned[0], target);
      assert.ok(t > 0 && t < spawned[0].ttl, `reachable intercept time ${t}`);
      assert.ok(miss < 0.05, `miss ${miss.toFixed(3)} WU despite constant-velocity target`);
    });
  }
}

test('classic manual fixed guns retain their cone; G without LMB does not fire', () => {
  const manual = fire({ auto: false, scheme: 'classic' });
  assert.equal(manual.spawned.length, 1);
  assert.ok(Math.abs(manual.spawned[0].rot) < Math.PI / 10);
  assert.equal(fire({ trigger: false }).spawned.length, 0);
});

test('Pilot manual fire follows the cursor behind the hull without selecting an auto target', () => {
  const manual = fire({ auto: false });
  assert.equal(manual.spawned.length, 1);
  assert.ok(Math.abs(manual.spawned[0].rot - Math.atan2(90, -180)) < 0.03);
  const zero = fire({ auto: false, heading: Math.PI, targetPos: { x: 180, z: 0 } });
  assert.ok(Math.abs(zero.spawned[0].rot) < 0.03, 'zero-radian aim is valid, not a missing value');
  const beam = fire({ auto: false, beam: true });
  const ray = beam.state.combat.beams[0];
  assert.ok(ray.to.x < ray.from.x, 'beams follow the same independent aim contract');
});

test('G also lets a turret bear behind the hull', () => {
  const { target, spawned } = fire({ turret: true });
  assert.equal(spawned.length, 1);
  assert.ok(closestApproach(spawned[0], target).miss < 0.05);
});

test('G hitscan aims at the current target from its actual muzzle, not the projectile lead', () => {
  const { state, target } = fire({ beam: true });
  assert.equal(state.combat.beams.length, 1);
  const ray = state.combat.beams[0];
  const vx = ray.to.x - ray.from.x, vz = ray.to.z - ray.from.z;
  const px = target.pos.x - ray.from.x, pz = target.pos.z - ray.from.z;
  assert.ok(Math.abs(px * vz - pz * vx) / Math.hypot(vx, vz) < 0.05);
});
