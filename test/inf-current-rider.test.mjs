// Rider: real field, combat and flight owners, with no renderer or native/GPU route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation, SIM_DT } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { createDamageRouter, scalarHitToDamagePacket } from '../src/combat/damage.js';
import { createCombatCatalog } from '../src/combat/runtime.js';
import { FIELD_FLAGS } from '../src/data/fields.js';
import { SWARM_AFFIXES, swarmAffixFor } from '../src/data/swarmThreats.js';
import { fields } from '../src/systems/fields.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { physics } from '../src/core/physics.js';
import { swarmElites, affixHash } from '../src/systems/swarmElites.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { MILL_ARENA_ID } from '../src/systems/asteroidMillArena.js';

function fixture(t, fieldSpec = {}, native = false) {
  const prior = FIELD_FLAGS.enabled;
  FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 1, systems: native
    ? [flightV3, fields, physics, swarmElites] : [flightV3, fields, swarmElites] });
  t.after(() => { sim.dispose(); FIELD_FLAGS.enabled = prior; });
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 1 }),
    phase: 'active', wave: 30, arenaId: MILL_ARENA_ID };
  const body = sim.spawn({ type: 'ship', team: 1, pos: { x: 100, z: 0 }, vel: { x: 0, z: 0 },
    hull: 100, hullMax: 100, armorHp: 0, armorMax: 0, shield: 0, shieldMax: 0,
    radius: 10, mass: 20, thrust: 42, collides: true,
    physicsBody: { schemaVersion: 1, dynamic: true, radius: 10, mass: 20, inertiaY: 90, revision: 1 },
    data: { runCohort: 'survival', runRole: 'elite', runWave: 30, swarmAffix: 'rider',
      intent: { throttle: 1, strafe: 0, turn: 0, assistMode: 'newtonian' } } });
  body.data.swarmRideNextAt = 0;
  const fieldOwner = sim.registry.get('fields');
  fieldOwner.registerExternal({ id: 'rider-test-well', kind: 'well', center: { x: 0, z: 0 },
    radius: 500, strength: 1000, damping: 0, ...fieldSpec });
  const route = createDamageRouter({ state, bus, catalog: createCombatCatalog(), helpers: {} }, { schedule() {} });
  return { sim, state, body, fieldOwner, elites: sim.registry.get('swarmElites'),
    flight: sim.registry.get('flight'), route, bus };
}

function start(h) {
  h.sim.step(SIM_DT);
  assert.ok(h.fieldOwner.readAcceptedFieldAcceleration(h.body, {}), 'real field owner admitted force');
  assert.ok(h.body.data.swarmRide, 'rider consumes accepted force after the field pass');
}
function command(h) {
  h.flight._stepCraft(h.body, { throttle: 1, strafe: 0, turn: 0.6, assistMode: 'newtonian' }, SIM_DT, h.state, false);
  return consumePhysicsCommand(h.body)?.control;
}

test('real field acceptance gates riding; zero, excluded, aged and replaced receipts cannot drive it', t => {
  const h = fixture(t);
  start(h);
  assert.equal(h.body.thrust, 42, 'fitted thrust is never rewritten');
  const first = h.state.tick;
  h.state.tick = first + 1;
  h.elites._ridePass(h.state, h.state.run);
  assert.ok(h.body.data.swarmRide, 'the immediately preceding owner pass is valid');
  h.state.tick = first + 2;
  h.elites._ridePass(h.state, h.state.run);
  assert.equal(h.body.data.swarmRide, undefined, 'older feedback ends the ride');
  h.state.tick = first;
  h.body.data.swarmRideNextAt = 0;
  const old = h.body.occupantGeneration;
  h.body.occupantGeneration = old + 1;
  h.elites._ridePass(h.state, h.state.run);
  assert.equal(h.body.data.swarmRide, undefined, 'receipt belongs to the prior life');
  h.body.occupantGeneration = old;
  h.fieldOwner.unregisterExternal('rider-test-well');
  h.fieldOwner.registerExternal({ id: 'excluded', kind: 'well', center: { x: 0, z: 0 }, radius: 500,
    strength: 1000, damping: 0, filters: { excludeId: h.body.id } });
  h.sim.step(SIM_DT);
  assert.equal(h.fieldOwner.readAcceptedFieldAcceleration(h.body, {}), null);
  assert.equal(h.body.data.swarmRide, undefined, 'geometric membership is insufficient');
  h.fieldOwner.unregisterExternal('excluded');
  h.fieldOwner.registerExternal({ id: 'zero', kind: 'well', center: { x: 0, z: 0 }, radius: 500, strength: 0, damping: 0 });
  h.sim.step(SIM_DT);
  assert.equal(h.body.data.swarmRide, undefined, 'zero field force cannot start a ride');
});

test('accepted field force moves the drive-cut rider through the native physics owner', async t => {
  const h = fixture(t, {}, true);
  assert.equal(await h.sim.registry.get('physics').prepareBackend(h.state), true);
  start(h);
  const initialX = h.body.pos.x;
  for (let i = 0; i < 12; i++) h.sim.step(SIM_DT);
  assert.ok(h.body.data.swarmRide);
  assert.ok(h.body.pos.x < initialX, 'the native solve carries the rider into the well');
});

test('V3 cuts only the current NPC translation and preserves yaw and fitted thrust', t => {
  const h = fixture(t);
  // Before the field pass, the ordinary NPC has thrust and yaw.
  const normal = command(h);
  assert.ok(Math.hypot(normal.force.x, normal.force.z) > 0);
  start(h);
  const riding = command(h);
  assert.equal(Math.hypot(riding.force.x, riding.force.z), 0);
  assert.notEqual(riding.torque.y, 0, 'yaw authority remains available');
  const life = h.body.occupantGeneration;
  h.body.occupantGeneration = life + 1;
  const replacement = command(h);
  assert.ok(Math.hypot(replacement.force.x, replacement.force.z) > 0, 'a stale life cannot cut the drive');
  h.body.occupantGeneration = life;
  h.state.run.ruleset = 'scored';
  const otherMode = command(h);
  assert.ok(Math.hypot(otherMode.force.x, otherMode.force.z) > 0, 'other modes keep normal propulsion');
  h.state.run.ruleset = 'swarm';
  h.body.thrust = 99; // fitting changes during a ride are owned elsewhere
  h.elites._endRide(h.body, h.body.data, 'test', h.state.tick);
  assert.equal(h.body.thrust, 99, 'ride end does not restore stale fitting data');
  const restored = command(h);
  assert.ok(Math.hypot(restored.force.x, restored.force.z) > 0);
});

test('leaving active combat clears the local ride and its old cooldown', t => {
  const h = fixture(t);
  start(h);
  h.state.run.phase = 'draft';
  h.elites.update(SIM_DT);
  assert.equal(h.body.data.swarmRide, undefined);
  assert.equal(h.body.data.swarmRideNextAt, undefined);
});

test('canonical armor, shield and hull damage each interrupt once; refused and stale receipts do not', t => {
  const h = fixture(t);
  start(h);
  noteSwarmPilotAction(h.state);
  h.bus.emit('combat:damage', { targetId: h.body.id, targetGeneration: h.body.occupantGeneration - 1, applied: 10 });
  h.bus.emit('combat:damage', { targetId: h.body.id, applied: 0 });
  assert.ok(h.body.data.swarmRide);
  h.body.flags.invuln = true;
  const packet = scalarHitToDamagePacket({ damage: 10, damageType: 'kinetic' });
  assert.equal(h.route({ targetId: h.body.id, packet }).ok, false);
  assert.ok(h.body.data.swarmRide);
  h.body.flags.invuln = false;
  for (const layer of ['armor', 'shield', 'hull']) {
    h.body.hull = 100; h.body.armorHp = layer === 'armor' ? 100 : 0;
    h.body.armorMax = layer === 'armor' ? 100 : 0;
    h.body.shield = layer === 'shield' ? 100 : 0; h.body.shieldMax = h.body.shield;
    h.body.data.swarmRideNextAt = 0;
    h.elites._ridePass(h.state, h.state.run);
    assert.ok(h.body.data.swarmRide);
    const result = h.route({ targetId: h.body.id, packet });
    assert.ok(result[`${layer}Damage`] > 0, `${layer} took real damage: ${JSON.stringify(result)}`);
    assert.equal(h.body.data.swarmRide, undefined);
    const cooldown = h.body.data.swarmRideNextAt;
    h.bus.emit('combat:damage', { targetId: h.body.id, applied: 1 });
    assert.equal(h.body.data.swarmRideNextAt, cooldown, 'duplicate cannot end the ride twice');
  }
  h.bus.emit('run:ended');
  assert.equal(h.body.data.swarmRideNextAt, undefined, 'the old run cannot keep its cooldown');
});

test('stamping keeps Rider restricted to law rooms, deterministically', t => {
  const h = fixture(t);
  let ordinal = 0;
  while (swarmAffixFor(affixHash(1, 30, ordinal)) !== 'rider') ordinal++;
  const make = arenaId => {
    const body = { id: 900, alive: true, pos: { x: 0, z: 0 }, data: { runCohort: 'survival', runRole: 'elite', runWave: 30 } };
    h.elites._affixOrdinal = ordinal;
    h.elites._stampAffix(h.state, { ...h.state.run, arenaId }, body, 21);
    return body.data.swarmAffix;
  };
  assert.equal(make(MILL_ARENA_ID), 'rider');
  assert.notEqual(make('helios_core'), 'rider');
  assert.ok(SWARM_AFFIXES.some(row => row.id === 'rider'));
});
