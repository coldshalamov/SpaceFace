import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimHost } from '../scripts/lib/simWorkerHost.mjs';
import { createSimCommandRing, pushLaneCommand } from '../scripts/lib/simCommandChannel.mjs';
import { createBus } from '../src/core/eventBus.js';
import { crucibleSetupFor, crucibleLaunchConfig } from '../src/ui/crucibleLaunch.js';
import { requestSandboxGame } from '../src/ui/sandbox/sandboxSetup.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { compileSwarmOptic } from '../src/data/swarmOpticArenas.js';
import { swarmArena } from '../src/systems/swarmArena.js';

test('public draft preparation places its complete optic lattice clear of prior-fight native wrecks', async () => {
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: 4242,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url))) });
    const bus = createBus(); let opts;
    bus.on('game:new', value => { opts = structuredClone(value); });
    requestSandboxGame(bus, crucibleLaunchConfig(crucibleSetupFor({ starterId: 'ricochet_runner', ruleset: 'swarm', seed: 4242 }).value, 'swarm'));
    let tick = 0;
    const send = async (steps = 0, ...descriptors) => {
      const ring = createSimCommandRing();
      for (const descriptor of descriptors) pushLaneCommand(ring, descriptor);
      return lane.tick({ tick: ++tick, steps, ackEnd: init.initRebuild?.end ?? 0, commands: structuredClone(ring.drain()) });
    };
    await send(0, { kind: 'mode', mode: 'loading' }, { kind: 'rpc', id: 'arena', op: 'newGameBoot', args: { opts } });
    const state = lane.host.state;
    const arena = lane.host.registry.get('swarmArena');
    const machine = lane.host.registry.get('survivalRun');
    const native = lane.host.registry.get('physics')._sg02;
    const player = state.entities.get(state.playerId);
    state.run.wave = 1;
    // Surviving fragments lie just inside the next authored fuse cells, as in the live
    // round-two failure. Settling alone cannot fix the solver's subsequent overlap kick.
    const wrecks = [
      arena.helpers.spawnEntity({ type: 'wreck', radius: 4, mass: 20,
        pos: { x: player.pos.x + 2, z: player.pos.z + 195 }, vel: { x: -3.23, z: 14.48 }, data: {} }),
      arena.helpers.spawnEntity({ type: 'wreck', radius: 4, mass: 20,
        pos: { x: player.pos.x - 3, z: player.pos.z + 267 }, vel: { x: 16.55, z: 30.49 }, data: {} }),
    ];
    const poses = wrecks.map(entity => ({ ...entity.pos }));
    await send(0, { kind: 'mode', mode: 'flight' }, { kind: 'busEmit', emit: 'run:draftPickRequested', payload: { offerId: null } });
    machine.update(1 / 60, state);
    lane.host.bus.emit('run:waveIntroComplete', { wave: 2 });
    machine.update(1 / 60, state);
    assert.equal(state.run.phase, 'active');
    const layout = compileSwarmOptic(state.run.arenaId);
    const cells = arena._opticIds.map(id => state.entities.get(id));
    assert.equal(cells.length, layout.bodies.length, 'the full authored grammar is present');
    assert.deepEqual(cells.map(entity => entity.data.opticCell), layout.bodies.map(body => `${body.ix},${body.iz}`));
    const offsets = cells.map((entity, i) => ({ x: entity.pos.x - player.pos.x - layout.origin.x - layout.bodies[i].x,
      z: entity.pos.z - player.pos.z - layout.origin.z - layout.bodies[i].z }));
    assert.ok(offsets.every(offset => offset.x === offsets[0].x && offset.z === offsets[0].z), 'translation preserves every cell relationship');
    assert.ok(offsets[0].x !== 0 || offsets[0].z !== 0, 'the occupied authored origin must move');
    for (let i = 0; i < wrecks.length; i++) assert.deepEqual({ ...wrecks[i].pos }, poses[i], 'placement preserves earned debris positions');
    for (let step = 0; step < 4; step++) {
      await send(1);
      for (const entity of wrecks) {
        const velocity = native.records.get(entity.id).body.linvel();
        assert.ok(Math.hypot(velocity.x, velocity.z) < 1e-4, `native opening step ${step + 1} has no overlap launch`);
      }
    }
  } finally { lane.shutdown(); }
});

test('optic placement reads the real offset compound footprint rather than its tiny entity radius', async () => {
  const native = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  try {
    const wreck = { id: 2, occupantGeneration: 2, type: 'wreck', alive: true, collides: true,
      radius: 1, mass: 100, pos: { x: 90, z: 206 }, vel: { x: 0, z: 0 }, data: {},
      physicsBody: { schemaVersion: 1, radius: 1, mass: 100, dynamic: true, material: 'wreck',
        collisionProxyManifest: { schemaVersion: 1, id: 'test:offset-wreck', referenceRadius: 'radius',
          primitives: [{ kind: 'capsule', ax: -90, az: 0, bx: -70, bz: 0, r: 4 }] } } };
    native.syncFromEntities([wreck]);
    const state = { playerId: 1, simTime: 0, entities: new Map([[1, { id: 1, type: 'ship', alive: true,
      radius: 5, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } }], [2, wreck]]) };
    let nextId = 10;
    const sys = Object.create(swarmArena);
    sys.state = state; sys._opticIds = []; sys._opticAnchor = null;
    sys.registry = { get: id => id === 'physics' ? { _sg02: native } : null };
    sys.helpers = { spawnEntity: spec => {
      const entity = { ...spec, id: nextId++, occupantGeneration: nextId, alive: true };
      state.entities.set(entity.id, entity); return entity;
    } };
    sys._syncOpticLattice({ arenaId: 'helios_core' });
    const cells = sys._opticIds.map(id => state.entities.get(id));
    assert.equal(cells.length, compileSwarmOptic('helios_core').bodies.length);
    assert.ok(cells.every(entity => Math.hypot(entity.pos.x - 0, entity.pos.z - 206) > entity.radius + 4),
      'the offset capsule endpoint at (0,206), ninety units from its root, is kept clear');
    native.syncFromEntities([...state.entities.values()]);
    native.step(1 / 60, 1);
    assert.ok(Math.hypot(wreck.vel.x, wreck.vel.z) < 1e-4);
  } finally { native.dispose(); }
});

test('a fully occupied restamp keeps its old lattice coherent and retries once space opens', () => {
  const player = { id: 1, occupantGeneration: 1, type: 'ship', alive: true, radius: 5,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  const state = { playerId: 1, simTime: 0, entities: new Map([[1, player]]) };
  const sys = Object.create(swarmArena);
  sys.state = state; sys._opticIds = []; sys._opticAnchor = null; sys.registry = null;
  let nextId = 10;
  sys.helpers = { spawnEntity: spec => {
    const entity = { ...spec, id: nextId++, occupantGeneration: nextId, alive: true };
    state.entities.set(entity.id, entity); return entity;
  } };
  const run = { arenaId: 'helios_core' };
  sys._syncOpticLattice(run);
  const old = [...sys._opticIds]; const oldOrigin = { ...sys._opticAnchor };
  player.pos.x = 1200;
  const blocker = { id: 2, occupantGeneration: 2, type: 'asteroid', alive: true, collides: true,
    radius: 1000, pos: { x: 1200, z: 300 }, vel: { x: 0, z: 0 }, data: {} };
  state.entities.set(blocker.id, blocker);
  const births = nextId;
  for (let retry = 0; retry < 3; retry++) sys._syncOpticLattice(run);
  assert.equal(nextId, births, 'an obstructed preparation creates no repeated partial stamps');
  assert.deepEqual(sys._opticIds, old);
  assert.deepEqual(sys._opticAnchor, oldOrigin);
  for (const id of old) assert.equal(state.entities.get(id).data.despawnAt, undefined, 'the live old stamp is retained');
  blocker.alive = false;
  state.simTime = 12;
  sys._syncOpticLattice(run);
  const current = [...sys._opticIds];
  assert.equal(current.length, compileSwarmOptic(run.arenaId).bodies.length);
  assert.ok(current.every(id => !old.includes(id)));
  for (const id of old) assert.ok(state.entities.get(id).data.despawnAt > state.simTime, 'ordinary release begins only after replacement admission');
  const settledBirths = nextId;
  sys._syncOpticLattice(run);
  assert.equal(nextId, settledBirths, 'the admitted origin does not immediately trigger another restamp');
  assert.deepEqual(sys._opticIds, current);
});
