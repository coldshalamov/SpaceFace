import test from 'node:test';
import assert from 'node:assert/strict';
import { swarmArena } from '../src/systems/swarmArena.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec, writePhysicsBodyResponse } from '../src/core/physicsAuthority.js';
import { createRunState } from '../src/core/runState.js';
import { createSg02CombatPhysicsPort, createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';

test('between rounds a rock still flying from the last fight is stopped through the physics port', () => {
  const calls = [];
  const sys = Object.create(swarmArena);
  sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
  sys.state = {
    tick: 5,
    entities: new Map([
      [1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 150, z: -20 } }],
      [2, { id: 2, type: 'asteroid', alive: true, mass: 40, vel: { x: 1, z: 0 } }],
      [3, { id: 3, type: 'ship', alive: true, mass: 10, vel: { x: 200, z: 0 } }],
      [4, { id: 4, type: 'wreck', alive: true, radius: 12, vel: { x: 0, z: 75 } }],
    ]),
  };
  sys._settleRoom();
  assert.deepEqual(calls.map((c) => c.entityId), [1, 4], 'moving rocks and wrecks settle; ships keep their momentum');
  const m1 = resolvePhysicsBodySpec(sys.state.entities.get(1)).mass;
  const m4 = resolvePhysicsBodySpec(sys.state.entities.get(4)).mass;
  assert.deepEqual(calls[0].impulse, { x: -150 * m1, z: 20 * m1 }, 'sized on the solver body mass');
  assert.deepEqual(calls[1].impulse, { x: -0 * m4, z: -75 * m4 });
});

test('a later round settles the room again as it opens; the opener does not', () => {
  for (const [wave, expected] of [[2, [1]], [1, []]]) {
    const calls = [];
    const sys = Object.create(swarmArena);
    sys._lessonHoldS = null;
    sys.helpers = { combatPhysics: { applyImpulse: (input) => { calls.push(input); return true; } } };
    sys.state = {
      tick: 9,
      simTime: 44,
      run: Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), { phase: 'active', wave }),
      entities: new Map([[1, { id: 1, type: 'asteroid', alive: true, mass: 40, vel: { x: 16, z: 0 } }]]),
      entityList: [],
    };
    sys._onWaveStarted();
    assert.deepEqual(calls.map((c) => c.entityId), expected, `wave ${wave}`);
  }
});

test('later-wave settling uses actual native mass and publishes rest while queued field impulses survive', async () => {
  for (const massScale of [6, 1]) {
    const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
    try {
      const rock = { id: 448, occupantGeneration: 17, type: 'asteroid', alive: true, radius: 12, mass: 40,
        pos: { x: 0, z: 0 }, vel: { x: -5, z: -45 }, data: {} };
      const wreck = { id: 464, occupantGeneration: 18, type: 'wreck', alive: true, radius: 5, mass: 20,
        pos: { x: 200, z: 0 }, vel: { x: 42, z: 31 }, data: {} };
      const entities = [rock, wreck]; owner.syncFromEntities(entities);
      for (const entity of entities) writePhysicsBodyResponse(entity, { massScale, inertiaScale: massScale });
      owner.step(1 / 60, 1);
      for (const entity of entities) {
        const native = owner.records.get(entity.id);
        assert.ok(Math.abs(native.body.mass() / resolvePhysicsBodySpec(entity).mass - massScale) < 1e-5);
        assert.ok(Math.hypot(entity.vel.x, entity.vel.z) > 40);
        // This was already queued when the later-wave event landed after the physics slot.
        // Settling must not discard it or disable the field in the next ordinary solve.
        queuePhysicsImpulse(entity, { x: 0, z: native.body.mass() * 2 }, { kind: 'field', tick: 2 });
      }
      const sys = Object.create(swarmArena); sys._lessonHoldS = null;
      sys.helpers = { combatPhysics: createSg02CombatPhysicsPort(owner) };
      sys.state = { tick: 1, simTime: 56.23,
        run: Object.assign(createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), { phase: 'active', wave: 2 }),
        entities: new Map(entities.map((entity) => [entity.id, entity])), entityList: entities };
      sys._onWaveStarted();
      for (const entity of entities) {
        const native = owner.records.get(entity.id); const velocity = native.body.linvel();
        assert.ok(Math.hypot(velocity.x, velocity.z) < 1e-4, `native ${entity.type}, mass scale ${massScale}`);
        assert.ok(Math.hypot(entity.vel.x, entity.vel.z) < 1e-4, 'first active-wave mirror reflects actual native rest now');
        assert.equal(native.snapshot.vx, 0); assert.equal(native.snapshot.vz, 0);
        assert.ok(Math.abs(native.body.mass() / resolvePhysicsBodySpec(entity).mass - massScale) < 1e-5,
          'settling does not alter field mass response');
        writePhysicsBodyResponse(entity, { massScale, inertiaScale: massScale });
      }
      owner.step(1 / 60, 2);
      for (const entity of entities) assert.ok(Math.abs(entity.vel.z - 2) < 1e-4,
        'the queued field impulse still acts through the next native step');
    } finally { owner.dispose(); }
  }
});

test('native settling guards ships, fixed bodies, slow passive bodies and recycled lives', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const make = (id, type, x, vx) => ({ id, occupantGeneration: id + 10, type, alive: true,
      radius: 4, mass: 20, hull: 100, pos: { x, z: 0 }, vel: { x: vx, z: 0 }, data: {} });
    const ship = make(1, 'ship', 0, 40);
    const fixed = make(2, 'asteroid', 200, 0); fixed.physicsBody = { schemaVersion: 1, dynamic: false };
    const slow = make(3, 'wreck', 400, 2);
    const recycled = make(4, 'asteroid', 600, 40);
    owner.syncFromEntities([ship, fixed, slow, recycled]); owner.step(1 / 60, 1);
    const port = createSg02CombatPhysicsPort(owner);
    const input = (entity) => ({ entityId: entity.id, occupantGeneration: entity.occupantGeneration,
      minSpeed: 6, reason: 'swarm_round_settle' });
    assert.equal(port.settlePassiveBody(input(ship)), false);
    assert.equal(port.settlePassiveBody(input(fixed)), false);
    assert.equal(port.settlePassiveBody(input(slow)), false);
    assert.equal(port.settlePassiveBody({ ...input(recycled), occupantGeneration: 99 }), false);
    assert.equal(port.settlePassiveBody({ ...input(recycled), reason: 'unrelated' }), false);
    assert.ok(Math.abs(ship.vel.x - 40) < 1e-4); assert.ok(Math.abs(slow.vel.x - 2) < 1e-4);
    assert.ok(Math.abs(recycled.vel.x - 40) < 1e-4);
  } finally { owner.dispose(); }
});
