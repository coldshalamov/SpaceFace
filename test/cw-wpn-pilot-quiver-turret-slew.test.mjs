// CW-WPN - combat aim, turret traverse and recoil (INV-21 items 2 and 4; INV-22 item 7).
//
// 1) A pilot quiver instead of a perfect firing solution: an NPC mount's spread widens with the
//    pilot's temperament aim and with how fast the target crosses the line of fire. A stationary
//    target is still hit; a low-aim pilot firing at a crossing target visibly misses. The quiver is
//    a pure function, and one read feeds the launch round and the withhold gate.
// 2) A real turret slew: an enemy cradle carries its own bearing, converges at <= 1.5 rad/s and
//    releases only when the barrel is on the solution.
// 3) Recoil on the hull, never the camera: the Concussion S/M and Railgun author recoilImpulse and
//    the shot pushes the firing hull through the existing physical-impulse path.
//
// Everything below runs through the real `weapons` owner with the entity fields the game really
// writes (data.ai.combatDoctrineId, data.combat.targetId, data.intent, data.weapons).
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { hash32, mulberry32 } from '../src/core/rng.js';
import { solveLeadAngle } from '../src/combat/leadAngle.js';
import { WEAPONS } from '../src/data/weapons.js';
import {
  weapons,
  npcQuiverSpreadDeg,
  NPC_QUIVER_AIM_SCALE,
  NPC_QUIVER_FLOOR_DEG,
  NPC_QUIVER_LATERAL_DEG_PER_WU_S,
  NPC_QUIVER_LATERAL_MAX_DEG,
  TURRET_SLEW_RAD_S,
  TURRET_ON_SOLUTION_RAD,
} from '../src/systems/weapons.js';

const DT = 1 / 60;
const RAD = Math.PI / 180;
const defOf = (id) => WEAPONS.find((w) => w.id === id);

function rig({
  doctrine = 'interceptor_flyby', mass = 70, defId = 'wpn_pulse_laser_m',
  facing = 'front', targetPos = { x: 0, z: -260 }, targetVel = { x: 0, z: 0 },
  player = false, physics = false, seed = 4242,
} = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.entities.clear();
  state.entityList.length = 0;
  const shooter = {
    id: 1, type: 'ship', alive: true, flags: {}, team: player ? 0 : 1, cap: 1e6, radius: 16,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0, mass,
    data: {
      ai: { combatDoctrineId: doctrine },
      combat: { targetId: 2 },
      intent: { fire: true, aimAngle: 0 },
      weapons: [{
        defId, facing, facingAngle: 0,
        gimbalArc: facing === 'turret' ? Math.PI : 22 * RAD,
        muzzleOffset: [0.8, 0], _cooldown: 0, _heat: 0,
      }],
    },
  };
  if (physics) shooter.physicsBody = { mass, dynamic: true };
  const target = {
    id: 2, type: 'ship', alive: true, flags: {}, team: player ? 1 : 0, radius: 14,
    pos: { ...targetPos }, vel: { ...targetVel }, rot: 0, mass: 16, data: {},
  };
  state.entities.set(1, shooter);
  state.entities.set(2, target);
  state.entityList.push(shooter, target);
  state.playerId = player ? 1 : 99;
  state.player = { targetId: player ? 2 : null };
  if (player) {
    state.input.fire = true;
    state.input.aimAngle = Math.atan2(targetPos.z, targetPos.x);
  }
  const bus = createBus();
  const spawned = [];
  const helpers = {
    hash32, mulberry32,
    getEntity: (id) => state.entities.get(id) ?? null,
    spawnEntity: (spec) => {
      const e = { id: 1000 + spawned.length, alive: true, ...spec };
      spawned.push(e);
      return e;
    },
  };
  const system = Object.create(weapons);
  system.init({ state, bus, helpers });
  return { state, bus, system, shooter, target, spawned };
}

// Whether the round the game actually released would pass through the target, assuming the target
// keeps its velocity: closest approach against the target radius (a geometric hit test).
function shotHits(shot, radius, projSpeed) {
  const vx = Math.cos(shot.dir) * projSpeed;
  const vz = Math.sin(shot.dir) * projSpeed;
  const px = shot.targetPos.x - shot.origin.x;
  const pz = shot.targetPos.z - shot.origin.z;
  const rvx = shot.targetVel.x - vx;
  const rvz = shot.targetVel.z - vz;
  const vv = rvx * rvx + rvz * rvz;
  const t = vv > 0 ? -(px * rvx + pz * rvz) / vv : 0;
  if (!(t > 0)) return false;
  return Math.hypot(px + rvx * t, pz + rvz * t) <= radius;
}

function aimRun({ doctrine, defId = 'wpn_pulse_laser_m', targetVel, ticks = 1200, seed = 4242 }) {
  const h = rig({ doctrine, defId, targetVel, seed });
  const { state, bus, system, shooter, target } = h;
  const projSpeed = defId === 'wpn_railgun_m' ? 700 : 340;
  const shots = [];
  bus.on('combat:fire', (p) => {
    if (p.ownerId !== shooter.id) return;
    shots.push({ dir: p.dir, origin: p.origin, targetPos: { ...target.pos }, targetVel: { ...target.vel } });
  });
  for (let tick = 0; tick < ticks; tick += 1) {
    const aim = solveLeadAngle(shooter, target, projSpeed);
    shooter.data.intent.aimAngle = aim;
    shooter.rot = aim;              // the AI keeps its nose on the solution; the mount still spreads
    state.tick = tick;
    state.simTime = tick * DT;
    system.update(DT, state);
    target.pos.x += target.vel.x * DT;
    target.pos.z += target.vel.z * DT;
  }
  const hits = shots.filter((s) => shotHits(s, target.radius, projSpeed)).length;
  return { shots, hits, frac: shots.length ? hits / shots.length : 0 };
}

function turretRun({ radius, speed, ticks = 1800, defId = 'wpn_autocannon_m' }) {
  const h = rig({ doctrine: 'capital_broadside', mass: 680, defId, facing: 'turret', targetPos: { x: radius, z: 0 } });
  const { state, bus, system, target } = h;
  let shots = 0;
  bus.on('combat:fire', () => { shots += 1; });
  const omega = speed / radius;
  for (let tick = 0; tick < ticks; tick += 1) {
    state.tick = tick;
    state.simTime = tick * DT;
    system.update(DT, state);
    const a = Math.atan2(target.pos.z, target.pos.x) + omega * DT;
    target.pos.x = radius * Math.cos(a);
    target.pos.z = radius * Math.sin(a);
    target.vel.x = -speed * Math.sin(a);
    target.vel.z = speed * Math.cos(a);
  }
  return shots;
}

// ---------------------------------------------------------------------------
// 1) the pilot quiver

test('CW-WPN quiver - aim and target crossing both widen the NPC spread; a standing target stays tight', () => {
  assert.equal(npcQuiverSpreadDeg(1.0, 1, 0), 1.0, 'a perfect-aim pilot adds nothing at a standing target');
  assert.ok(npcQuiverSpreadDeg(1.0, 0.35, 0) > 1.8, 'a low-aim pilot adds a real floor even on an authored-spread gun');
  assert.ok(npcQuiverSpreadDeg(0, 0.35, 0) > 0, 'a zero-spread gun (railgun) still gets a quiver');
  assert.ok(npcQuiverSpreadDeg(0.6, 0.35, 0) > npcQuiverSpreadDeg(0.6, 0.9, 0), 'lower aim is a wider cone');
  assert.ok(npcQuiverSpreadDeg(0.6, 0.9, 60) > npcQuiverSpreadDeg(0.6, 0.9, 0),
    'a crossing target is harder than a stationary one');
  assert.equal(
    npcQuiverSpreadDeg(0.6, 0.9, 9999),
    npcQuiverSpreadDeg(0.6, 0.9, NPC_QUIVER_LATERAL_MAX_DEG / NPC_QUIVER_LATERAL_DEG_PER_WU_S),
    'the crossing term is bounded',
  );
  assert.ok(NPC_QUIVER_AIM_SCALE > 0 && NPC_QUIVER_FLOOR_DEG > 0);
});

test('CW-WPN quiver - through the real owner a standing target is still hit and a crossing target is missed more by a low-aim pilot', () => {
  const still = aimRun({ doctrine: 'interceptor_flyby', targetVel: { x: 0, z: 0 } });
  assert.ok(still.shots.length >= 100, `sanity: the mount fired (${still.shots.length} shots)`);
  assert.ok(still.frac >= 0.95, `a standing target is still hit by a low-aim pilot (${still.frac.toFixed(2)})`);

  const marksmanStill = aimRun({ doctrine: 'ranged_disengager', targetVel: { x: 0, z: 0 } });
  assert.ok(marksmanStill.frac >= 0.95, `the marksman hits a standing target (${marksmanStill.frac.toFixed(2)})`);

  const crossing = { x: 60, z: 0 };
  const dodger = aimRun({ doctrine: 'interceptor_flyby', targetVel: crossing });
  const marksman = aimRun({ doctrine: 'ranged_disengager', targetVel: crossing });
  assert.ok(dodger.frac < 0.85, `a low-aim pilot misses a crossing target (${dodger.frac.toFixed(2)})`);
  assert.ok(marksman.frac >= 0.9, `a marksman still lands most of a crossing pass (${marksman.frac.toFixed(2)})`);
  assert.ok(marksman.frac - dodger.frac >= 0.15,
    `aim separates the hit fraction (marksman ${marksman.frac.toFixed(2)} vs dodger ${dodger.frac.toFixed(2)})`);
});

test('CW-WPN quiver - the railgun authors no spread and still gets a pilot quiver', () => {
  assert.equal(defOf('wpn_railgun_m').spreadDeg, undefined, 'the needle authors no spread (the old solution was exact)');
  const crossing = { x: 60, z: 0 };
  const dodger = aimRun({ doctrine: 'interceptor_flyby', defId: 'wpn_railgun_m', targetVel: crossing, ticks: 2400 });
  const marksman = aimRun({ doctrine: 'ranged_disengager', defId: 'wpn_railgun_m', targetVel: crossing, ticks: 2400 });
  assert.ok(dodger.shots.length >= 20, `sanity: the railgun fired (${dodger.shots.length} shots)`);
  assert.ok(marksman.frac - dodger.frac >= 0.1,
    `the zero-spread gun is not a perfect solution any more (marksman ${marksman.frac.toFixed(2)} vs dodger ${dodger.frac.toFixed(2)})`);
});

test('CW-WPN quiver - the same seed fires the same shots and the same hit fraction', () => {
  const a = aimRun({ doctrine: 'interceptor_flyby', targetVel: { x: 60, z: 0 }, ticks: 600 });
  const b = aimRun({ doctrine: 'interceptor_flyby', targetVel: { x: 60, z: 0 }, ticks: 600 });
  assert.deepEqual(a.shots.map((s) => s.dir), b.shots.map((s) => s.dir), 'deterministic on the weapons stream');
  assert.equal(a.frac, b.frac);
});

// ---------------------------------------------------------------------------
// 2) the turret slew

test('CW-WPN turret - a cradle 90 degrees off the bore traverses at <= 1.5 rad/s and fires only on solution', () => {
  const h = rig({
    doctrine: 'capital_broadside', mass: 680, defId: 'wpn_autocannon_m',
    facing: 'turret', targetPos: { x: 0, z: 260 },
  });
  const { state, bus, system, shooter } = h;
  let shots = 0;
  bus.on('combat:fire', () => { shots += 1; });
  const mount = shooter.data.weapons[0];
  for (let tick = 0; tick < 3; tick += 1) {
    state.tick = tick;
    state.simTime = tick * DT;
    system.update(DT, state);
  }
  assert.equal(shots, 0, 'the barrel cannot snap onto a target 90 degrees off the bore');
  assert.ok(Math.abs(mount._turretAngle) <= TURRET_SLEW_RAD_S * DT * 3 + 1e-9,
    `three ticks move at most three times the slew limit (${(mount._turretAngle / RAD).toFixed(2)} deg)`);
  assert.ok(Math.abs(mount._turretAngle) > 0, 'the cradle is moving, not frozen');
  for (let tick = 3; tick < 120; tick += 1) {
    state.tick = tick;
    state.simTime = tick * DT;
    system.update(DT, state);
  }
  assert.ok(shots >= 3, `once the barrel is on the solution the gun fires (${shots} shots)`);
  assert.ok(Math.abs(Math.abs(mount._turretAngle) - Math.PI / 2) < 1e-6, 'it parked on the aim');
  assert.ok(TURRET_ON_SOLUTION_RAD > 0 && TURRET_SLEW_RAD_S <= 1.5);
});

test('CW-WPN turret - a knife-range orbit out-turns the battery; a standing hull is still punished', () => {
  const standing = turretRun({ radius: 260, speed: 0.001 });
  const knifeOrbit = turretRun({ radius: 70, speed: 100 });
  assert.ok(standing >= 90, `a point-blank standing target eats the battery (${standing} shots)`);
  assert.ok(knifeOrbit < standing * 0.5,
    `a 1.43 rad/s orbit keeps the cradle off the solution (${knifeOrbit} vs ${standing} shots)`);
});

// ---------------------------------------------------------------------------
// 3) recoil on the hull

test('CW-WPN recoil - Concussion S/M and Railgun author recoilImpulse; the shot moves the firing hull backward', () => {
  assert.equal(defOf('wpn_concussion_cannon_s').recoilImpulse, 180);
  assert.equal(defOf('wpn_concussion_cannon_m').recoilImpulse, 320);
  assert.equal(defOf('wpn_railgun_m').recoilImpulse, 140);

  for (const [defId, expected] of [['wpn_concussion_cannon_m', 320], ['wpn_railgun_m', 140]]) {
    const h = rig({
      player: true, physics: true, defId,
      targetPos: { x: 0, z: -260 }, targetVel: { x: 40, z: 0 },
    });
    h.state.tick = 0;
    h.state.simTime = 0;
    h.system.update(DT, h.state);
    const command = consumePhysicsCommand(h.shooter);
    assert.ok(command && command.impulses.length >= 1, `${defId}: the shot queued a physical impulse on the shooter`);
    const recoil = command.impulses.find((i) => i.provenance && i.provenance.tag === 'weapon_recoil');
    assert.ok(recoil, `${defId}: the impulse is the weapon recoil`);
    assert.equal(recoil.provenance.weaponId, defId);
    const magnitude = Math.hypot(recoil.x, recoil.z);
    assert.ok(Math.abs(magnitude - expected) < expected * 0.01,
      `${defId}: the full ${expected} impulse reaches the hull (${magnitude.toFixed(1)})`);
    const dir = Math.atan2(recoil.z, recoil.x);
    // The round left along the aim (-z); recoil points the other way (+z).
    assert.ok(Math.cos(dir - Math.PI / 2) > 0.99,
      `${defId}: the hull is pushed opposite the shot (${(dir / RAD).toFixed(1)} deg)`);
  }
});
