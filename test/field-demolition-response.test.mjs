import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createBus } from '../src/core/eventBus.js';
import { fields } from '../src/systems/fields.js';
import { physics } from '../src/core/physics.js';
import { tumbleStates } from '../src/systems/tumbleStates.js';
import { collisionConsequences } from '../src/systems/collisionConsequences.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { COMBAT_FLAGS } from '../src/data/featureFlags.js';
import { readRecentImpulseProvenance } from '../src/combat/impulseKernel.js';
import { readTumbleStatus } from '../src/combat/tumbleStatus.js';

for (const kind of ['cone', 'repulsor']) test(`${kind} tumbles a light hull, spins rubble and preserves collision credit without a journal`, async () => {
  const previous = { fields: FIELD_FLAGS.enabled, consequences: COMBAT_FLAGS.weaponImpulseConsequences, fling: COMBAT_FLAGS.tumbleFling };
  FIELD_FLAGS.enabled = COMBAT_FLAGS.weaponImpulseConsequences = COMBAT_FLAGS.tumbleFling = true;
  const sim = createSimulation({ seed: 7721, bus: createBus(), systems: [fields, physics] });
  const { state } = sim;
  state.mode = 'flight'; state.input.actions = {};
  const hull = (x, z, mass, team) => sim.spawn({ type: 'ship', pos: { x, z }, vel: { x: 0, z: 0 },
    radius: 6, mass, team, collides: true, hull: 200, hullMax: 200, combatSpeed: 120,
    physicsBody: { mass, radius: 6, inertiaY: 60, dynamic: true },
    data: { combatProfileId: 'combat_profile_standard_ship', intent: { fire: true, moveX: -1, moveZ: 0 } } });
  const player = hull(0, 0, 28, 0); state.playerId = player.id;
  const victim = hull(65, 10, 16, 1);
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 110, z: -25 }, radius: 16,
    vel: { x: 0, z: 0 }, collides: true, data: {} });
  const fieldsSys = sim.registry.get('fields'); const physicsSys = sim.registry.get('physics');
  const tumbles = Object.create(tumbleStates);
  tumbles.init({ state, bus: sim.bus, helpers: sim.helpers,
    registry: { get: name => name === 'combat' ? { kernel: fieldsSys._combatKernel } : null } });
  let didTumble = false;
  sim.bus.on('combat:tumbled', p => { if (p.victimId === victim.id) didTumble = true; });
  try {
    assert.equal(await physicsSys.prepareBackend(state), true);
    state.input.actions[kind === 'cone' ? 'toggleClearingCone' : 'deployRepulsor'] = true;
    for (let i = 0; i < 60; i++) {
      sim.step(); fieldsSys._combatKernel.prePhysics(SIM_DT); tumbles.update(SIM_DT, state);
    }
    assert.ok(didTumble, `light hull must lose its helm under ${kind}`);
    assert.ok(victim.vel.x > 20, `hull leaves the cone at ${victim.vel.x}`);
    assert.ok(Math.abs(rock.angVel) > 0.05, `loose rock rotates at ${rock.angVel}`);
    assert.equal(readRecentImpulseProvenance(rock, state.tick)?.actorId, player.id);
    assert.equal(readTumbleStatus(state, player), null);
    assert.equal(player.angVel, 0);
  } finally {
    tumbles.destroy(); physicsSys._disableSg02DynamicAuthority();
    FIELD_FLAGS.enabled = previous.fields; COMBAT_FLAGS.weaponImpulseConsequences = previous.consequences; COMBAT_FLAGS.tumbleFling = previous.fling;
  }
});

test('a cone-launched rock hits a hull through real contacts and causes player-attributed crumple damage', async (t) => {
  const previous = { fields: FIELD_FLAGS.enabled, consequences: COMBAT_FLAGS.weaponImpulseConsequences };
  FIELD_FLAGS.enabled = COMBAT_FLAGS.weaponImpulseConsequences = true;
  const sim = createSimulation({ seed: 7722, bus: createBus(), systems: [fields, physics] });
  const { state } = sim; state.mode = 'flight'; state.input.actions = {};
  const player = sim.spawn({ type: 'ship', radius: 6, mass: 28, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, collides: true, hull: 200, hullMax: 200, team: 0, data: {} });
  state.playerId = player.id;
  const rock = sim.spawn({ type: 'asteroid', radius: 16, pos: { x: 70, z: 0 },
    vel: { x: 0, z: 0 }, collides: true, data: {} });
  const victim = sim.spawn({ type: 'ship', radius: 10, mass: 16, pos: { x: 350, z: 0 },
    vel: { x: 0, z: 0 }, collides: true, hull: 500, hullMax: 500, team: 1,
    data: { combatProfileId: 'combat_profile_standard_ship' } });
  const fieldsSys = sim.registry.get('fields'); const physicsSys = sim.registry.get('physics');
  const impacts = Object.create(collisionConsequences);
  impacts.init({ state, bus: sim.bus, helpers: sim.helpers,
    registry: { get: name => name === 'combat' ? { kernel: fieldsSys._combatKernel } : null } });
  const damage = [];
  sim.bus.on('combat:damage', p => { if (p.targetId === victim.id) damage.push(p); });
  try {
    assert.equal(await physicsSys.prepareBackend(state), true);
    state.input.actions.toggleClearingCone = true;
    for (let i = 0; i < 240 && victim.hull === 500; i++) {
      fieldsSys._combatKernel.prePhysics(SIM_DT); sim.step(); impacts.update(SIM_DT, state);
    }
    assert.ok(rock.pos.x > 250, 'the rock traveled out of the clearing field');
    assert.ok(victim.hull < 450, `the physical collision must crumple the hull (remaining ${victim.hull})`);
    assert.ok(damage.some(p => p.attackerId === player.id), 'the shove owns the eventual impact');
    t.diagnostic(`seed7722: rock x=${rock.pos.x.toFixed(1)} WU, speed=${Math.hypot(rock.vel.x, rock.vel.z).toFixed(1)} WU/s; hull500→${victim.hull.toFixed(1)} at ${state.simTime.toFixed(2)}s; actor=${player.id}`);
  } finally {
    impacts.destroy(); physicsSys._disableSg02DynamicAuthority();
    FIELD_FLAGS.enabled = previous.fields; COMBAT_FLAGS.weaponImpulseConsequences = previous.consequences;
  }
});
