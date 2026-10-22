import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { makeEntity } from '../src/core/entity.js';
import { createCombatKernel } from '../src/combat/kernel.js';
import { serializeCombatState, restoreCombatState } from '../src/combat/persistence.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { weaponBankReadiness } from '../src/systems/weapons.js';
import { composePlayerDriveAuthority } from '../src/core/flight/driveAuthority.js';
import { createPropulsionRuntime, stepPropulsion } from '../src/core/flight/propulsionKernel.js';
import { SHIPJACK_SHUTDOWN_STATUS_ID } from '../src/data/combatDefs.js';

function runtime() {
  const state = createGameState(4242), bus = createBus(), helpers = {};
  state.mode = 'flight';
  const actor = makeEntity(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player }));
  const target = makeEntity(makeShipEntitySpec('ship_wasp', { team: 1, pos: { x: 70, z: 0 } }));
  actor.id = 1; target.id = 2;
  actor.occupantGeneration = 1; target.occupantGeneration = 2;
  target.data.shipjackGeneration = 'prize:1';
  actor.cap = 100; target.shield = 0; target.armorHp = 0;
  target.flags.persistent = true;
  state.entities = new Map([[1, actor], [2, target]]); state.entityList = [actor, target]; state.playerId = 1;
  helpers.getEntity = id => state.entities.get(id);
  const kernel = createCombatKernel({ state, bus, helpers });
  return { state, bus, helpers, kernel, actor, target };
}

test('isolator is real drive damage and spends finite capacitor once; cooldown persists through canonical combat save', () => {
  const { state, helpers, kernel, actor, target } = runtime();
  const request = { actorId: 1, targetId: 2, generation: 'prize:1' };
  const before = actor.cap, health = target.hull;
  assert.equal(helpers.requestShipjackPulse(request).ok, true);
  assert.equal(actor.cap, before - 18);
  assert.equal(helpers.requestShipjackPulse(request).reason, 'tool_recharging');
  assert.equal(actor.cap, before - 18);
  const drive = state.combat.entities[2].subsystems.subsystem_drive;
  assert.equal(drive.health, 0);
  assert.equal(drive.destroyed, false, 'the disable is scheduled for the next simulation beat');
  state.tick = 1; state.simTime = 1 / 60; kernel.prePhysics(1 / 60);
  assert.equal(drive.destroyed, true);
  assert.equal(target.alive, true); assert.equal(target.collides, true);
  assert.ok(target.hull <= health, 'ion overflow is damage, never healing');
  const saved = serializeCombatState(state);
  restoreCombatState(state, JSON.parse(JSON.stringify(saved)), ref => ref.kind === 'player' ? 1 : Number(ref.saveId));
  assert.equal(helpers.requestShipjackPulse(request).reason, 'tool_recharging');
  kernel.dispose();
});

test('safe shutdown gates real force, torque and every weapon mount, preserves motion, then reboots on time', () => {
  const { state, helpers, kernel, target } = runtime();
  target.vel.set(13, 0, -2); target.angVel = 0.4;
  const pose = { pos: { ...target.pos }, vel: { ...target.vel }, rot: target.rot, angVel: target.angVel };
  const result = helpers.requestShipjackShutdown({ actorId: 1, targetId: 2, durationTicks: 360 });
  assert.equal(result.ok, true);
  state.tick = 1; state.simTime = 1 / 60; kernel.prePhysics(1 / 60);
  const rt = state.combat.entities[2];
  assert.ok(rt.statuses[SHIPJACK_SHUTDOWN_STATUS_ID]);
  const authority = composePlayerDriveAuthority(target.physicsBody?.thrusters, rt);
  assert.deepEqual(authority, { forward: 0, reverse: 0, strafe: 0, yaw: 0 });
  const profile = target.propulsion;
  const propulsion = stepPropulsion({ dt: 1 / 60, body: { ...target, inertia: target.mass * 40 },
    profile, input: { throttle: 1, strafe: 1, turn: 1, boost: true, assistMode: 'newtonian' },
    runtime: createPropulsionRuntime(profile), authority });
  assert.equal(propulsion.force.x, 0); assert.equal(propulsion.force.z, 0); assert.equal(propulsion.torque.y, 0);
  assert.equal(weaponBankReadiness({ subsystemId: 'subsystem_turret_0' }, rt).disabled, true);
  assert.deepEqual({ pos: { ...target.pos }, vel: { ...target.vel }, rot: target.rot, angVel: target.angVel }, pose);
  assert.equal(target.alive, true); assert.equal(target.collides, true);
  state.tick = result.rebootTick; state.simTime = state.tick / 60; kernel.prePhysics(1 / 60);
  assert.equal(rt.statuses[SHIPJACK_SHUTDOWN_STATUS_ID], undefined);
  assert.equal(composePlayerDriveAuthority(null, rt).forward, 1);
  assert.equal(weaponBankReadiness({}, rt).disabled, false);
  kernel.dispose();
});

test('shield, stale occupant, protected body and non-adventure reject acquisition tools without capacitor cost', () => {
  for (const reason of ['shield', 'generation', 'protected', 'swarm']) {
    const { state, helpers, kernel, actor, target } = runtime();
    if (reason === 'shield') target.shield = 4;
    if (reason === 'generation') target.data.shipjackGeneration = 'recycled:2';
    if (reason === 'protected') target.flags.invuln = true;
    if (reason === 'swarm') state.run.kind = 'survival';
    const cap = actor.cap;
    assert.equal(helpers.requestShipjackPulse({ actorId: 1, targetId: 2, generation: 'prize:1' }).ok, false, reason);
    assert.equal(actor.cap, cap, reason);
    kernel.dispose();
  }
});

test('authored derelict disables a genuine subsystem without changing hull or physical motion', () => {
  const { state, helpers, kernel, target } = runtime();
  target.vel.set(20, 0, 3); target.angVel = 0.8;
  const before = { hull: target.hull, vel: { ...target.vel }, spin: target.angVel };
  assert.equal(helpers.disableShipjackSubsystem({ entityId: 2, subsystemId: 'subsystem_drive' }).ok, true);
  state.tick = 1; kernel.prePhysics(1 / 60);
  assert.equal(state.combat.entities[2].subsystems.subsystem_drive.effectiveDisabled, true);
  assert.deepEqual({ hull: target.hull, vel: { ...target.vel }, spin: target.angVel }, before);
  assert.equal(target.alive, true); assert.equal(target.collides, true);
  kernel.dispose();
});
