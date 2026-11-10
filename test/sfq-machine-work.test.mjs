import test from 'node:test';
import assert from 'node:assert/strict';
import { MACHINE_SITES } from '../src/data/precursorMachines.js';
import { ensureAlienEcologyState } from '../src/data/alienEcologyState.js';
import { materializeMachineLayer, tickMachineLayer } from '../src/systems/precursorMachines.js';
import { tickSorterWork } from '../src/systems/machineWork.js';
import { serializeAlienEcologyState, deserializeAlienEcologyState } from '../src/systems/alienEcology.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { bootRealPath } from '../scripts/lib/bench/realPath.mjs';
import { mulberry32, hash32 } from '../src/core/rng.js';

function fixture(sectorId = 'sector_ashfall_reach') {
  const state = { meta: { seed: 4242 }, simTime: 0, playerId: 1,
    entities: new Map(), entityList: [], player: { cargo: { items: {}, capVolume: 500, capMass: 500 } },
    world: { currentSectorId: sectorId, sectors: {} } };
  const events = [];
  let id = 100;
  const world = { state, active: { dressing: [] }, registry: { get: () => null },
    _toGlobal: p => ({ ...p }), bus: { emit: (name, payload) => events.push({ name, payload }) },
    helpers: { mulberry32, hash32, spawnEntity(spec) {
      const entity = { ...spec, id: id++, alive: true, occupantGeneration: 1, pos: { ...spec.pos }, vel: spec.vel || { x: 0, z: 0 } };
      state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
    } } };
  materializeMachineLayer(world, { id: sectorId }, world.active);
  const machine = kind => state.entityList.find(e => e.data?.machine?.kind === kind);
  return { state, world, events, machine, step(dt) { state.simTime += dt; tickMachineLayer(world, dt); } };
}

test('B142 finite pylon repair pauses under obstruction and resumes saved partial work', () => {
  const f = fixture();
  for (let i = 0; i < 90; i++) f.step(0.1);
  let job = ensureAlienEcologyState(f.state).machineSites.ashfall_maintenance_scene.maintenance;
  assert.equal(job.integrity, 0.25); // floating clock reaches the first charge on the next tick
  f.step(0.1);
  assert.equal(job.integrity, 0.5);
  const site = MACHINE_SITES.ashfall_maintenance_scene;
  f.state.entities.set(1, { id: 1, alive: true, pos: { ...site.center }, radius: 10 });
  for (let i = 0; i < 100; i++) f.step(0.1);
  assert.equal(job.material, 2); assert.equal(job.paused, true);
  const saved = serializeAlienEcologyState(f.state);
  deserializeAlienEcologyState(f.state, saved);
  f.state.entities.delete(1);
  for (let i = 0; i < 190; i++) f.step(0.1);
  job = ensureAlienEcologyState(f.state).machineSites.ashfall_maintenance_scene.maintenance;
  assert.equal(job.completed, true); assert.equal(job.integrity, 1); assert.equal(job.material, 0);
  assert.equal(f.events.filter(e => e.name === 'machine:repairCompleted').length, 1);
  for (let i = 0; i < 100; i++) f.step(0.1);
  assert.equal(f.events.filter(e => e.name === 'machine:repairCompleted').length, 1);
});

test('B143 a real Rapier body travels to the cradle and the field then releases', { timeout: 120000 }, async () => {
  let world;
  const machineTick = { name: 'machineWorkFixture', init(ctx) {
    world = { state: ctx.state, bus: ctx.bus, registry: { get: () => null },
      _toGlobal: p => ({ ...p }), helpers: { mulberry32, hash32, spawnEntity: spec => ctx.helpers.spawnEntity(spec) } };
  }, update(dt) { tickMachineLayer(world, dt); } };
  const site = MACHINE_SITES.pallas_empty_foundry;
  const host = await bootRealPath({ seed: 4242, systems: [machineTick, 'physics'],
    hulls: [{ hullId: 'ship_kestrel', isPlayer: true, pos: { x: site.center.x, z: site.center.z - 1000 } }],
    bounds: { center: site.center, radius: 2000, hardRadius: 2400 } });
  try {
    host.state.world.currentSectorId = site.sectorId;
    // Isolate the relocation owner after the native foundry's mail, repair and
    // custody decision. The full acquisition sequence is exercised separately.
    ensureAlienEcologyState(host.state).machineSites[site.siteId] = {
      courierToken: { status: 'delivered', destSiteId: site.siteId, receiptId: 'foundry-accepted' },
      courierReceiver: { stored: 1, acceptedReceipts: { 'foundry-accepted': 1 } },
      maintenance: { completed: true, integrity: 1, material: 0 },
      jurisdiction: { status: 'resolved', choice: 'construction' },
    };
    const frame = host.runtime.spawn({ type: 'machine', pos: { ...site.center }, vel: { x: 0, z: 0 },
      physicsBody: false, homeSectorId: site.sectorId, radius: 26, data: { machine: {
        kind: 'mason', siteId: site.siteId, t: 0, sweepT: 0, phase: 0, anchor: { ...site.center } } } });
    // Use the runtime's exact spawn authority, avoiding a fixture integration model.
    world.helpers.spawnEntity = spec => host.runtime.spawn(spec);
    host.step(1);
    const body = host.state.entityList.find(e => e.data?.machineWorkpiece === site.siteId);
    assert.ok(body); const start = body.pos.x;
    host.step(3000);
    assert.equal(host.proof().backend, 'rapier-dynamic');
    assert.ok(body.pos.x - start > 400, `physical travel ${body.pos.x - start}; ${JSON.stringify({ body: body.physicsBody, vel: body.vel, proof: host.proof(), job: ensureAlienEcologyState(host.state).machineSites[site.siteId].masonry })}`);
    assert.equal(ensureAlienEcologyState(host.state).machineSites[site.siteId].masonry.status, 'placed');
    assert.equal(body.alive, true); assert.ok(frame);
    consumePhysicsCommand(body); host.step(1);
    assert.equal(consumePhysicsCommand(body)?.impulses.length || 0, 0, 'completed machine applies no more field');
  } finally { host.dispose(); }
});

test('B144 staging protects custody/story/tether targets and preserves the reclaimed manifest', () => {
  const f = fixture('sector_pallas_belt');
  const sorter = f.world.helpers.spawnEntity({ type: 'machine', pos: { x: 0, z: 0 }, data: {
    machine: { siteId: 'pallas_empty_foundry', anchor: { x: 0, z: 0 } } } });
  const bodies = [
    { ownerId: 'civilian' }, { missionId: 'rescue' }, { worldRecordId: 'durable_wreck' },
    { missionPinned: true }, { missionTag: 'tow_recovery' }, { markerId: 'player-loss-wreck' },
    { salvageSourceKey: 'authored-wreck' }, {},
  ].map(data => f.world.helpers.spawnEntity({ type: 'wreck', pos: { x: 30, z: 0 }, mass: 2,
    physicsBody: { dynamic: true, mass: 2 }, data: { ...data, salvagePool: { cmdty_alloys: 4 } } }));
  tickSorterWork(f.world, sorter, 0.1, bodies);
  const loose = bodies.at(-1);
  assert.equal(sorter.data.machine.collectId, loose.id);
  assert.ok(consumePhysicsCommand(loose).impulses.length > 0);
  f.state.simTime = 21;
  tickSorterWork(f.world, sorter, 0.1, bodies);
  assert.equal(loose.alive, true); assert.equal(loose.data.machineProcessed, true);
  assert.deepEqual(loose.data.salvagePool, { cmdty_alloys: 4 });
  assert.ok(bodies.slice(0, -1).every(e => !e.data.machineClaimedBy && e.alive));
  const newBody = f.world.helpers.spawnEntity({ type: 'wreck', pos: { x: 20, z: 0 }, data: {} });
  f.state.combat = { attachments: { byId: { rope: { state: 'active', targetId: newBody.id, ownerId: 1 } } } };
  tickSorterWork(f.world, sorter, 0.1, [newBody]);
  assert.equal(sorter.data.machine.collectId, null);
});

test('B144 a rematerialized sorter releases an orphaned frame claim without losing salvage custody', () => {
  const f = fixture('sector_pallas_belt');
  const spawnSorter = () => f.world.helpers.spawnEntity({ type: 'machine', pos: { x: 0, z: 0 },
    data: { machine: { kind: 'debris_sorter', siteId: 'pallas_empty_foundry', anchor: { x: 0, z: 0 } } } });
  const old = spawnSorter();
  const body = f.world.helpers.spawnEntity({ type: 'wreck', pos: { x: 30, z: 0 },
    homeSectorId: 'sector_pallas_belt', physicsBody: { dynamic: true, mass: 2 },
    data: { salvagePool: { cmdty_alloys: 4 }, provenance: { origin: 'loose-hull' } } });
  tickSorterWork(f.world, old, 0.1, [body]);
  assert.equal(body.data.machineClaimedBy, old.id);
  f.state.entities.delete(old.id); old.alive = false;
  const fresh = spawnSorter();
  tickSorterWork(f.world, fresh, 0.1, [body]);
  assert.equal(fresh.data.machine.collectId, body.id);
  assert.equal(body.data.machineClaimedBy, fresh.id);
  assert.deepEqual(body.data.salvagePool, { cmdty_alloys: 4 });
  assert.deepEqual(body.data.provenance, { origin: 'loose-hull' });
  const competitor = spawnSorter();
  tickSorterWork(f.world, competitor, 0.1, [body]);
  assert.equal(competitor.data.machine.collectId, undefined, 'a live frame keeps its active claim');
  const foreign = f.world.helpers.spawnEntity({ type: 'wreck', homeSectorId: 'sector_veil_nebula',
    pos: { x: 10, z: 0 }, data: { salvagePool: { cmdty_alloys: 1 } } });
  tickSorterWork(f.world, competitor, 0.1, [foreign]);
  assert.equal(competitor.data.machine.collectId, undefined, 'the sorter stays in its own sector');
});

test('B146 hold names its geometry and interrupted motion names the cause', () => {
  const f = fixture('sector_sker_haven'), site = MACHINE_SITES.sker_quiet_dock;
  const player = { id: 1, alive: true, pos: { ...site.center }, vel: { x: 0, z: 0 } };
  f.state.entities.set(1, player);
  f.step(1);
  assert.ok(f.events.some(e => e.name === 'comms:log' && /RADIUS 500.*SPEED BELOW 8/.test(e.payload.text)));
  player.vel.x = 9; f.step(1);
  assert.ok(f.events.some(e => e.name === 'comms:log' && e.payload.text.includes('SPEED ABOVE HOLD LIMIT')));
  assert.equal(ensureAlienEcologyState(f.state).machineSites[site.siteId].holdT, 0);
});

test('B149 purge grace starts in range, cancels on escape and restarts on reentry', () => {
  const f = fixture('sector_veil_nebula'), executor = f.machine('executor');
  ensureAlienEcologyState(f.state).machineProtocol = 'revoked';
  const player = { id: 1, alive: true, pos: { x: executor.pos.x + 100, z: executor.pos.z }, vel: { x: 9, z: 0 } };
  f.state.entities.set(1, player); f.state.player.cargo.items.cmdty_spore_catalyst = 2;
  executor.data.machine.sweepT = 999;
  f.step(0.1);
  assert.equal(f.state.player.cargo.items.cmdty_spore_catalyst, 2);
  for (let i = 0; i < 300; i++) f.step(0.1);
  player.pos.x += 5000; f.step(0.1);
  assert.equal(executor.data.machine.sweepT, 0);
  player.pos = { x: executor.pos.x + 100, z: executor.pos.z };
  for (let i = 0; i < 300; i++) f.step(0.1);
  assert.equal(f.state.player.cargo.items.cmdty_spore_catalyst, 2);
  for (let i = 0; i < 301; i++) f.step(0.1);
  assert.equal(f.state.player.cargo.items.cmdty_spore_catalyst, undefined);
  assert.equal(ensureAlienEcologyState(f.state).machineSites.veil_exception_chamber.lastEnforcement.scrubbed, 2);
});
