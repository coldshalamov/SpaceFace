/**
 * Packet 05 — an off-centre hit by a thrown aggregate imparts real torque through the existing
 * physics membrane (queuePhysicsImpulse / queuePhysicsTorqueImpulse), never by animating an
 * unaffected collider. The solver's contact is frictionless by design (round colliders in vacuum),
 * so a normal force passes through both centres: without the grip law an off-centre hit moves a rock
 * and turns nothing. Concussion/tumble status stays with the damage owner; this is only the
 * impulse + torque.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { gyreSnare } from '../src/systems/gyreSnare.js';
import { physics } from '../src/core/physics.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';

async function strike(offsetZ, { ballSpeed = 200, ballMass = 300, rockMass = 60, launched = true } = {}) {
  const prev = COMBAT_FLAGS.weaponImpulseConsequences;
  COMBAT_FLAGS.weaponImpulseConsequences = true; // contact receipts are what the owner listens to
  const sim = createSimulation({ seed: 5, bus: createBus(), systems: [gyreSnare, physics] });
  const { state } = sim;
  state.mode = 'flight'; state.input.actions = {};
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  const ps = sim.registry.get('physics');
  assert.equal(await ps.prepareBackend(state), true);
  try {
    const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -100, z: 0 }, radius: 12, collides: true, vel: { x: 0, z: 0 }, rot: 0,
      hull: 200, hullMax: 200, physicsBody: { schemaVersion: 1, radius: 12, mass: 28, inertiaY: 88, dynamic: true, material: 'ship', revision: 0 }, data: {} });
    state.playerId = player.id;
    const mk = (x, z, m, r, vx, data) => sim.spawn({ type: 'asteroid', team: 9, pos: { x, z }, vel: { x: vx, z: 0 }, rot: 0, angVel: 0,
      radius: r, collides: true, hull: 400, hullMax: 400,
      physicsBody: { schemaVersion: 1, radius: r, mass: m, inertiaY: 0.4 * m * r * r, dynamic: true, ccd: true, material: 'debris', revision: 0 }, data });
    const ball = mk(0, 0, ballMass, 16, ballSpeed, launched ? { gyreLaunched: true, despawnAt: 99, gyreLaunchMeta: { holdUntilSim: 99 } } : {});
    const rock = mk(120, offsetZ, rockMass, 10, 0, {});
    for (let i = 0; i < 60; i++) sim.step();
    return { rock, ball };
  } finally {
    ps._disableSg02DynamicAuthority();
    COMBAT_FLAGS.weaponImpulseConsequences = prev;
  }
}

test('head-on: no lever arm, no spin', async () => {
  const { rock } = await strike(0);
  assert.ok(Math.abs(rock.angVel) < 0.02, `centred hit leaves the rock unspun (${rock.angVel})`);
  assert.ok(rock.vel.x > 50, 'but it is driven forward');
});

test('off-centre: the struck body spins, the sign follows the side, a graze is bounded', async () => {
  const up = await strike(6), down = await strike(-6), wide = await strike(14);
  assert.ok(Math.abs(up.rock.angVel) > 0.3, `a real graze turns the rock (${up.rock.angVel.toFixed(2)} rad/s)`);
  assert.ok(up.rock.angVel * down.rock.angVel < 0, 'opposite sides spin opposite ways');
  assert.ok(Math.abs(Math.abs(up.rock.angVel) - Math.abs(down.rock.angVel)) < 0.05, 'symmetric');
  assert.ok(Math.abs(wide.rock.angVel) <= 1.6 + 0.2, `bounded: a graze quickens, it does not wind up (${wide.rock.angVel.toFixed(2)})`);
  // The thrown mass answers: friction drags its skin the same sense, and by less (it is heavier).
  assert.ok(up.ball.angVel * up.rock.angVel > 0);
  assert.ok(Math.abs(up.ball.angVel) < Math.abs(up.rock.angVel));
  // Equal and opposite along the sliding direction: the rock gains the sideways speed the ball loses.
  assert.ok(up.rock.vel.z * up.ball.vel.z < 0);
});

test('an unthrown body grips nothing: only a launched aggregate carries the rough-rubble law', async () => {
  const { rock } = await strike(6, { launched: false });
  assert.ok(Math.abs(rock.angVel) < 0.02, `a plain rock striking a rock stays frictionless (${rock.angVel})`);
});
