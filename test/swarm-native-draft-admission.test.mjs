import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { applyEntityVitals, applySpawnInfos, createReadModel } from '../scripts/lib/simReadModel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec, writePhysicsBodyResponse } from '../src/core/physicsAuthority.js';

test('public later-round draft launch settles newborn native passives before the first active mirror', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const bus = createBus(); let opts;
    bus.on('game:new', value => { opts = structuredClone(value); });
    const setup = crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242 }).value;
    requestSandboxGame(bus, crucibleLaunchConfig(setup, 'swarm'));
    const mirror = createReadModel(); let tick = 0;
    const send = async (...descriptors) => {
      const ring = createSimCommandRing();
      for (const descriptor of descriptors) pushLaneCommand(ring, descriptor);
      const reply = await lane.tick({ tick: ++tick, steps: 0, ackEnd: init.initRebuild?.end ?? 0,
        commands: structuredClone(ring.drain()) });
      applySpawnInfos(mirror, reply.spawnInfos);
      applyEntityVitals(mirror, reply.entityVitals);
      return reply;
    };
    await send({ kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'arena', op: 'newGameBoot', args: { opts } });
    const state = lane.host.state;
    const arena = lane.host.registry.get('swarmArena');
    const machine = lane.host.registry.get('survivalRun');
    const owner = lane.host.registry.get('physics')._sg02;
    assert.equal(state.run.phase, 'draft');
    // Arrange a later-round paused shop. A kill/fracture after the previous physics slot can
    // leave its newly spawned debris without a native body until the next ordinary solve.
    state.run.wave = 2;
    const player = state.entities.get(state.playerId);
    const entities = [
      arena.helpers.spawnEntity({ type: 'asteroid', radius: 12, mass: 40,
        pos: { x: player.pos.x + 660, z: player.pos.z + 57 }, vel: { x: 73.07, z: -.42 }, data: {} }),
      arena.helpers.spawnEntity({ type: 'wreck', radius: 12, mass: 40,
        pos: { x: player.pos.x + 900, z: player.pos.z + 150 }, vel: { x: 65.02, z: 7.84 }, data: {} }),
    ];
    await send();
    for (const entity of entities) {
      assert.equal(owner.records.has(entity.id), false, 'the newborn has not crossed a physics slot');
      assert.ok(Math.hypot(mirror.entities.get(entity.id).vel.x, mirror.entities.get(entity.id).vel.z) > 60);
    }
    await send({ kind: 'mode', mode: 'flight' },
      { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    // Drive the actual phase owner and its real intro-completion receipt before a physical
    // solve, matching the public draft -> opening boundary's post-physics ordering.
    machine.update(1 / 60, state);
    assert.equal(state.run.phase, 'wave_intro');
    lane.host.bus.emit('run:waveIntroComplete', { wave: 3 });
    machine.update(1 / 60, state);
    assert.equal(state.run.phase, 'active');
    assert.equal(state.run.wave, 3);
    const opening = await send();
    for (const entity of entities) {
      const native = owner.records.get(entity.id);
      assert.ok(native, 'opening admission creates the canonical native body now');
      assert.equal(native.entity, entity);
      assert.ok(Math.hypot(native.body.linvel().x, native.body.linvel().z) < 1e-4);
      assert.ok(Math.hypot(entity.vel.x, entity.vel.z) < 1e-4);
      assert.equal(native.snapshot.vx, 0); assert.equal(native.snapshot.vz, 0);
      assert.ok(opening.entityVitals.some(row => row[0] === entity.id && Math.hypot(row[1].vx, row[1].vz) < 1e-4),
        'the first active reply changes the previously moving velocity');
      assert.equal(mirror.entities.get(entity.id).vel.x, entity.vel.x);
      assert.equal(mirror.entities.get(entity.id).vel.z, entity.vel.z);
    }
  } finally { lane.shutdown(); }
});

test('single-passive admission requires the current live identity and preserves queued field response', async () => {
  const owner = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const make = (id, type, x, vx = 40) => ({ id, occupantGeneration: id + 10, type, alive: true,
      radius: 4, mass: 20, pos: { x, z: 0 }, vel: { x: vx, z: 0 }, data: {} });
    const rock = make(1, 'asteroid', 0);
    const wreck = make(2, 'wreck', 200);
    const ship = make(3, 'ship', 400);
    const fixed = make(4, 'asteroid', 600); fixed.physicsBody = { schemaVersion: 1, dynamic: false };
    const disabled = make(5, 'wreck', 800); disabled.physicsBody = false;
    const slow = make(6, 'asteroid', 1000, 2);
    const entities = new Map([rock, wreck, ship, fixed, disabled, slow].map(entity => [entity.id, entity]));
    const input = entity => ({ entityId: entity.id, occupantGeneration: entity.occupantGeneration,
      entity, entities, minSpeed: 6, reason: 'swarm_round_settle' });
    assert.equal(owner.settlePassiveBody({ ...input(rock), entity: { ...rock } }), false, 'a detached/stale object is not admission authority');
    assert.equal(owner.settlePassiveBody({ ...input(rock), occupantGeneration: 99 }), false);
    assert.equal(owner.settlePassiveBody({ ...input(rock), occupantGeneration: undefined }), false, 'new admission requires an explicit matching life');
    assert.equal(owner.settlePassiveBody({ ...input(rock), entities: undefined }), false, 'new admission requires the live entity map');
    assert.equal(owner.settlePassiveBody({ ...input(rock), reason: 'unrelated' }), false);
    for (const entity of [ship, fixed, disabled, slow]) assert.equal(owner.settlePassiveBody(input(entity)), false);
    assert.equal(owner.records.size, 0, 'refused inputs cannot create native bodies');
    for (const entity of [rock, wreck]) {
      const mass = resolvePhysicsBodySpec(entity).mass;
      writePhysicsBodyResponse(entity, { massScale: 6, inertiaScale: 6 });
      queuePhysicsImpulse(entity, { x: 0, z: mass * 6 * 2 }, { kind: 'field', tick: 2 });
      assert.equal(owner.settlePassiveBody(input(entity)), true);
      assert.ok(Math.hypot(entity.vel.x, entity.vel.z) < 1e-4);
      assert.equal(owner.records.get(entity.id).snapshot.vx, 0);
    }
    owner.step(1 / 60, 2);
    for (const entity of [rock, wreck]) {
      assert.ok(Math.abs(owner.records.get(entity.id).body.mass() / resolvePhysicsBodySpec(entity).mass - 6) < 1e-5);
      assert.ok(Math.abs(entity.vel.z - 2) < 1e-4, 'the pending field impulse and mass response still act in the next solve');
    }
  } finally { owner.dispose(); }
});
