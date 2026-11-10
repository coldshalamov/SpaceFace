import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { npcJobsRuntime } from '../src/systems/npcJobsRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { traffic } from '../src/systems/traffic.js';
import { economy } from '../src/systems/economy.js';
import { cargo } from '../src/systems/cargo.js';
import { SECTORS } from '../src/data/sectors.js';
import { save as saveSystem } from '../src/save/saveSystem.js';
import { world } from '../src/systems/world.js';
import { lootShards, CIVILIAN_MANIFEST_PAYLOAD_TYPE } from '../src/systems/lootShards.js';
import { MASSLINE2_FLAGS } from '../src/data/featureFlags.js';
import { acceptSweeperPickup, bindSweeperPickup, resolveSweeperPickup, dispatchSweeperWork } from '../src/systems/scrapSweeperOps.js';

async function fixture({ pickupPos = { x: 16, z: 0 }, pickupVel = { x: 0, z: 0 } } = {}) {
  const sim = createSimulation({ seed: 427, systems: [physics] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.world.currentSectorId = 'sector_vesta_forge';
  const worker = sim.spawn({ type: 'ship', alive: true, collides: true, radius: 14, mass: 100,
    pos: { x: 0, z: 0 }, vel: { x: 1, z: 0 }, rot: 0,
    data: { trafficRole: 'sweeper', worldRecordId: 'sweeper:1', jobId: 'job:sweeper:1' } });
  const pickup = sim.spawn({ type: 'pickup', alive: true, collides: true, radius: 2, mass: 5,
    pos: pickupPos, vel: pickupVel, data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
  const entry = { entityId: worker.id, worldRecordId: 'sweeper:1', job: {
    id: 'job:sweeper:1', kind: 'salvor', sequence: 0,
    payload: { role: 'sweeper', targetId: pickup.id, extracted: false },
  } };
  const rec = { id: worker.id, worldRecordId: 'sweeper:1', manifest: null };
  state.traffic = { freighters: [rec] };
  const host = { state, helpers: { npcJobs: { get: id => id === entry.job.id ? entry : null } },
    _buildSalvorManifest(_entity, seq, pool, _source, workId) {
      return { manifestId: workId, lotId: workId, salvageSeq: seq, role: 'salvor',
        lines: Object.entries(pool).map(([commodityId, qty]) => ({ commodityId, qty })),
        totalQty: Object.values(pool).reduce((a, b) => a + b, 0) };
    },
    _setTrafficManifest(entity, row, manifest) { entity.data.cargoManifest = row.manifest = manifest; return true; },
  };
  assert.equal(bindSweeperPickup(state, entry, pickup), true);
  bus.on('pickup:collected', receipt => acceptSweeperPickup(host, receipt));
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  return { sim, state, bus, worker, pickup, entry, rec, host };
}

test('native physics collection transfers the contacted front pickup exactly once', async () => {
  const h = await fixture();
  try {
    for (let i = 0; i < 6 && h.pickup.alive; i++) h.sim.step(1 / 60);
    assert.equal(h.pickup.alive, false);
    assert.equal(h.rec.manifest.totalQty, 3);
    assert.deepEqual(h.rec.manifest.lines, [{ commodityId: 'cmdty_scrap_metal', qty: 3 }]);
    assert.equal(h.worker.data.cargoManifest, h.rec.manifest);
    assert.equal(h.entry.job.payload.extracted, true);
    const duplicate = { pickupId: h.pickup.id, collectorId: h.worker.id, kind: 'cargo',
      commodityId: 'cmdty_scrap_metal', amount: 3 };
    assert.equal(acceptSweeperPickup(h.host, duplicate), false);
    assert.equal(duplicate.acceptedAmount, 0);
    assert.equal(h.rec.manifest.totalQty, 3);
  } finally { h.sim.dispose(); }
});

test('the job motor flies to a live fragment and stops its timetable until actual collection', async () => {
  const sim = createSimulation({ seed: 427, systems: [npcJobsRuntime, flightV3, physics],
    updateOrder: [npcJobsRuntime, flightV3, physics] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3'; state.world.currentSectorId = 'sector_vesta_forge';
    const worker = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: -45, z: 0 }, rot: 0 }));
    Object.assign(worker.data, { trafficRole: 'sweeper', worldRecordId: 'sweeper:flight' });
    const pickup = sim.spawn({ type: 'pickup', collides: true, radius: 2, mass: 5,
      pos: { x: 0, z: 0 }, data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
    const runtime = sim.registry.get('npcJobsRuntime');
    const jobId = runtime.assign(worker, { kind: 'salvor', sectorId: state.world.currentSectorId,
      route: [{ id: 'yard:station_forge', pos: { x: -45, z: 0 } }, { id: `pickup:${pickup.id}`, pos: { x: 0, z: 0 } }],
      payload: { role: 'sweeper', targetId: pickup.id, extracted: false } });
    assert.ok(jobId);
    const entry = state.npcJobs.byId[jobId];
    assert.equal(bindSweeperPickup(state, entry, pickup), true);
    const rec = { id: worker.id, worldRecordId: worker.data.worldRecordId, manifest: null };
    state.traffic = { freighters: [rec] };
    const host = { state, helpers: { npcJobs: { get: id => state.npcJobs.byId[id] } },
      _buildSalvorManifest(_entity, seq, pool, _source, id) {
        return { manifestId: id, lotId: id, salvageSeq: seq, role: 'salvor',
          lines: Object.entries(pool).map(([commodityId, qty]) => ({ commodityId, qty })), totalQty: 3 };
      },
      _setTrafficManifest(entity, row, manifest) { entity.data.cargoManifest = row.manifest = manifest; return true; },
    };
    bus.on('pickup:collected', p => acceptSweeperPickup(host, p));
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    for (let i = 0; i < 1800 && pickup.alive; i++) sim.step(1 / 60);
    assert.equal(pickup.alive, false, `flight controller should collect: ${JSON.stringify({ worker: worker.pos, vel: worker.vel, pickup: pickup.pos, pv: pickup.vel, radius: worker.radius, intent: worker.data.intent, phase: entry.job.phase })}`);
    assert.equal(rec.manifest?.totalQty, 3);
    sim.step(1 / 60);
    assert.equal(entry.job.phase, 'return');
    // Isolate the kernel's already-reached yard approach: it must not restart the return leg.
    entry.job.phase = 'approach'; entry.job.routeIndex = 0; entry.job.progress = 0;
    sim.step(1 / 60);
    assert.equal(entry.job.phase, 'approach');
  } finally { sim.dispose(); }
});

test('side or fast contact is refused, and a recycled pickup id cannot replace the booking', async () => {
  const h = await fixture({ pickupPos: { x: 0, z: 15 } });
  try {
    for (let i = 0; i < 4; i++) h.sim.step(1 / 60);
    assert.equal(h.pickup.alive, true);
    assert.equal(h.rec.manifest, null);
    const original = h.pickup;
    const replacement = { ...original, data: { ...original.data } };
    h.state.entities.set(original.id, replacement);
    assert.equal(resolveSweeperPickup(h.state, h.entry), null);
    h.state.entities.set(original.id, original);
  } finally { h.sim.dispose(); }
  const fast = await fixture({ pickupPos: { x: 15, z: 0 }, pickupVel: { x: -20, z: 0 } });
  try {
    for (let i = 0; i < 4; i++) fast.sim.step(1 / 60);
    assert.equal(fast.pickup.alive, true);
    assert.equal(fast.rec.manifest, null);
  } finally { fast.sim.dispose(); }
});

test('a player taking the booked piece first sends the sweeper home empty', () => {
  const sim = createSimulation({ seed: 428, systems: [npcJobsRuntime] });
  const { state } = sim;
  try {
    state.mode = 'flight'; state.world.currentSectorId = 'sector_vesta_forge';
    const worker = sim.spawn(makeShipEntitySpec('ship_kestrel', { pos: { x: -45, z: 0 }, rot: 0 }));
    Object.assign(worker.data, { trafficRole: 'sweeper', worldRecordId: 'sweeper:beaten' });
    const pickup = sim.spawn({ type: 'pickup', collides: true, radius: 2, mass: 5,
      pos: { x: 0, z: 0 }, data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
    const runtime = sim.registry.get('npcJobsRuntime');
    const id = runtime.assign(worker, { kind: 'salvor', sectorId: state.world.currentSectorId,
      route: [{ id: 'yard:station_forge', pos: { x: -45, z: 0 } }, { id: `pickup:${pickup.id}`, pos: { x: 0, z: 0 } }],
      payload: { role: 'sweeper', targetId: pickup.id, extracted: false } });
    const entry = state.npcJobs.byId[id];
    assert.equal(bindSweeperPickup(state, entry, pickup), true);
    pickup.alive = false; // The canonical collection owner already consumed the piece.
    sim.step(1 / 60);
    assert.equal(entry.job.phase, 'return');
    assert.equal(entry.job.payload.sourceUnavailable, true);
    assert.equal(entry.job.payload.extracted, false);
    assert.ok(!(worker.data.cargoManifest?.totalQty > 0));
  } finally { sim.dispose(); }
});

test('ordinary traffic dispatch collects and delivers the same finite pickup through the real yard owner', async () => {
  const sim = createSimulation({ seed: 429, systems: [economy, npcJobsRuntime, traffic, flightV3, physics],
    updateOrder: [npcJobsRuntime, traffic, flightV3, physics] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3'; state.world.currentSectorId = 'sector_vesta_forge';
    state.world.sectors = Object.fromEntries(SECTORS.map(s => [s.id, s]));
    const yard = sim.spawn({ type: 'station', radius: 24, collides: true, pos: { x: -100, z: 0 },
      data: { stationId: 'station_forge', dockRadius: 45 } });
    const spec = makeShipEntitySpec('ship_kestrel', { pos: { x: -45, z: 0 }, rot: 0 });
    Object.assign(spec.data, { trafficRole: 'sweeper', worldRecordId: 'sweeper:actual', sectorId: 'sector_vesta_forge' });
    const worker = sim.spawn(spec);
    const pickup = sim.spawn({ type: 'pickup', collides: true, radius: 2, mass: 5, pos: { x: 0, z: 0 },
      data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
    const owner = sim.registry.get('traffic'), marketOwner = sim.registry.get('economy');
    owner._ensureState();
    const empty = owner._emptySalvorManifest(worker, 0);
    worker.data.cargoManifest = empty;
    state.traffic.freighters.push({ id: worker.id, role: 'sweeper', manifest: empty });
    marketOwner.ensureMarket('station_forge');
    const stock = state.economy.markets.station_forge.cmdty_scrap_metal.stock;
    const unloads = [];
    bus.on('salvage:npcUnload', payload => unloads.push(payload));
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    owner.update(1 / 60, state);
    assert.ok(worker.data.jobId, 'the ordinary traffic update dispatches the existing sweeper');
    for (let i = 0; i < 7200 && !unloads.length; i++) sim.step(1 / 60);
    assert.equal(pickup.alive, false, 'the world pickup was physically collected');
    assert.ok(unloads.length, `the carrier must reach the yard (position ${worker.pos.x}, job ${worker.data.jobId})`);
    assert.equal(unloads[0].lines[0].qty, 3);
    assert.equal(unloads[0].intakeResult?.ok, true);
    assert.equal(state.economy.markets.station_forge.cmdty_scrap_metal.stock, stock + 3);
    assert.equal(worker.data.cargoManifest.totalQty, 0);
    assert.equal(worker.data.jobId, undefined, 'accepted yard receipt closes the finite shift');
  } finally { sim.dispose(); }
});

test('a refused real yard intake retains the same hold and settles after service returns', async () => {
  const sim = createSimulation({ seed: 430, systems: [economy, npcJobsRuntime, traffic, flightV3, physics],
    updateOrder: [npcJobsRuntime, traffic, flightV3, physics] });
  const { state, bus } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3'; state.world.currentSectorId = 'sector_vesta_forge';
    state.world.sectors = Object.fromEntries(SECTORS.map(s => [s.id, s]));
    const yard = sim.spawn({ type: 'station', radius: 24, collides: true, pos: { x: -100, z: 0 },
      data: { stationId: 'station_forge', dockRadius: 45 } });
    const spec = makeShipEntitySpec('ship_kestrel', { pos: { x: -45, z: 0 }, rot: 0 });
    Object.assign(spec.data, { trafficRole: 'sweeper', worldRecordId: 'sweeper:refused', sectorId: 'sector_vesta_forge' });
    const worker = sim.spawn(spec);
    const pickup = sim.spawn({ type: 'pickup', collides: true, radius: 2, mass: 5, pos: { x: 0, z: 0 },
      data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
    const owner = sim.registry.get('traffic'), marketOwner = sim.registry.get('economy');
    owner._ensureState(); const empty = owner._emptySalvorManifest(worker, 0);
    worker.data.cargoManifest = empty;
    state.traffic.freighters.push({ id: worker.id, role: 'sweeper', manifest: empty });
    marketOwner.ensureMarket('station_forge');
    const market = state.economy.markets.station_forge, listing = market.cmdty_scrap_metal;
    const stock = listing.stock, unloads = [];
    bus.on('salvage:npcUnload', payload => unloads.push(payload));
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    assert.equal(dispatchSweeperWork(owner, [yard], state.world.currentSectorId), true);
    for (let i = 0; i < 3600 && pickup.alive; i++) sim.step(1 / 60);
    assert.equal(pickup.alive, false);
    const manifestId = worker.data.cargoManifest.manifestId;
    delete market.cmdty_scrap_metal;
    for (let i = 0; i < 7200 && !unloads.length; i++) sim.step(1 / 60);
    assert.equal(unloads[0]?.intakeResult?.ok, false);
    assert.equal(worker.data.cargoManifest.manifestId, manifestId);
    assert.equal(worker.data.cargoManifest.totalQty, 3);
    assert.equal(worker.data.cargoManifest.salvageIntakeHeld, true);
    assert.ok(worker.data.jobId, 'refusal retains the working job and its hold');
    market.cmdty_scrap_metal = listing;
    for (let i = 0; i < 3600 && worker.data.cargoManifest.totalQty; i++) sim.step(1 / 60);
    assert.equal(worker.data.cargoManifest.totalQty, 0);
    assert.equal(market.cmdty_scrap_metal.stock, stock + 3);
    assert.equal(worker.data.jobId, undefined);
  } finally { sim.dispose(); }
});

test('a loaded sweeper retains its exact cargo and return job through Continue', async () => {
  const sim = createSimulation({ seed: 431, systems: [world, economy, npcJobsRuntime, traffic, flightV3, physics, saveSystem],
    updateOrder: [npcJobsRuntime, traffic, flightV3, physics] });
  const { state } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3'; state.world.currentSectorId = 'sector_vesta_forge';
    state.world.sectors = Object.fromEntries(SECTORS.map(s => [s.id, s]));
    state.player.credits = 100; state.player.stats = {};
    state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
    const player = sim.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, pos: { x: -800, z: 0 }, rot: 0 }));
    state.playerId = player.id;
    sim.registry.get('world').enterSector('sector_vesta_forge');
    const yard = [...state.entities.values()].find(e => e.type === 'station' && e.data?.stationId === 'station_forge');
    assert.ok(yard);
    const spec = makeShipEntitySpec('ship_kestrel', { pos: { x: yard.pos.x + 120, z: yard.pos.z }, rot: 0 });
    Object.assign(spec.data, { trafficRole: 'sweeper', worldRecordId: 'sweeper:continue', sectorId: 'sector_vesta_forge' });
    const worker = sim.spawn(spec);
    const pickup = sim.spawn({ type: 'pickup', collides: true, radius: 2, mass: 5,
      pos: { x: yard.pos.x + 165, z: yard.pos.z },
      data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
    const owner = sim.registry.get('traffic'); owner._ensureState();
    const empty = owner._emptySalvorManifest(worker, 0); worker.data.cargoManifest = empty;
    state.traffic.freighters.push({ id: worker.id, role: 'sweeper', manifest: empty });
    sim.registry.get('economy').ensureMarket('station_forge');
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    assert.equal(dispatchSweeperWork(owner, [yard], state.world.currentSectorId), true);
    for (let i = 0; i < 3600 && pickup.alive; i++) sim.step(1 / 60);
    assert.equal(pickup.alive, false);
    sim.step(1 / 60);
    assert.equal(worker.data.cargoManifest.totalQty, 3);
    const identity = worker.data.cargoManifest.manifestId, jobId = worker.data.jobId;
    const save = sim.registry.get('save');
    const envelope = save.serialize('sweeper-mid-return');
    assert.equal(save.loadEnvelope(JSON.parse(JSON.stringify(envelope)), 'sweeper-mid-return'), true);
    const restored = [...state.entities.values()].find(e => e.data?.worldRecordId === 'sweeper:continue');
    assert.ok(restored);
    assert.equal(restored.data.cargoManifest.manifestId, identity);
    assert.equal(restored.data.cargoManifest.totalQty, 3);
    assert.equal(restored.data.jobId, jobId);
    assert.equal(state.npcJobs.byId[jobId].job.payload.extracted, true);
    assert.equal(state.npcJobs.byId[jobId].job.phase, 'return');
    const stock = state.economy.markets.station_forge.cmdty_scrap_metal.stock;
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    for (let i = 0; i < 7200 && restored.data.cargoManifest.totalQty; i++) sim.step(1 / 60);
    assert.equal(restored.data.cargoManifest.totalQty, 0, 'the resumed pilot reaches an accepting yard');
    assert.equal(state.economy.markets.station_forge.cmdty_scrap_metal.stock, stock + 3);
  } finally { sim.dispose(); }
});

test('destroying the loaded worker spills the same finite value into the ordinary cargo body', async () => {
  const prior = { enabled: MASSLINE2_FLAGS.enabled, lootShards: MASSLINE2_FLAGS.lootShards };
  MASSLINE2_FLAGS.enabled = true; MASSLINE2_FLAGS.lootShards = true;
  const sim = createSimulation({ seed: 432, systems: [economy, npcJobsRuntime, traffic, flightV3, physics, lootShards],
    updateOrder: [npcJobsRuntime, traffic, flightV3, physics] });
  const { state } = sim;
  try {
    state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3'; state.world.currentSectorId = 'sector_vesta_forge';
    state.world.sectors = Object.fromEntries(SECTORS.map(s => [s.id, s]));
    const yard = sim.spawn({ type: 'station', radius: 24, pos: { x: -100, z: 0 }, data: { stationId: 'station_forge', dockRadius: 45 } });
    const spec = makeShipEntitySpec('ship_kestrel', { pos: { x: -45, z: 0 }, rot: 0 });
    Object.assign(spec.data, { trafficRole: 'sweeper', worldRecordId: 'sweeper:lost', sectorId: 'sector_vesta_forge' });
    const worker = sim.spawn(spec);
    const pickup = sim.spawn({ type: 'pickup', collides: true, radius: 2, mass: 5, pos: { x: 0, z: 0 },
      data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3 } });
    const owner = sim.registry.get('traffic'); owner._ensureState();
    const empty = owner._emptySalvorManifest(worker, 0); worker.data.cargoManifest = empty;
    state.traffic.freighters.push({ id: worker.id, role: 'sweeper', manifest: empty });
    sim.registry.get('economy').ensureMarket('station_forge');
    assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
    assert.equal(dispatchSweeperWork(owner, [yard], state.world.currentSectorId), true);
    for (let i = 0; i < 3600 && pickup.alive; i++) sim.step(1 / 60);
    assert.equal(pickup.alive, false, JSON.stringify({ worker: worker.pos, velocity: worker.vel, job: worker.data.jobId,
      entry: state.npcJobs.byId[worker.data.jobId]?.job, pickup: pickup.pos }));
    assert.equal(worker.data.cargoManifest.totalQty, 3);
    worker.alive = false;
    sim.bus.emit('entity:killed', { id: worker.id, killerId: 999, type: 'ship',
      pos: { x: worker.pos.x, z: worker.pos.z }, targetHostileToPlayer: false });
    const bodies = state.entityList.filter(e => e.alive && e.type === 'payload'
      && e.data?.payloadType === CIVILIAN_MANIFEST_PAYLOAD_TYPE);
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0].data.salvagePool, { cmdty_scrap_metal: 3 });
  } finally { sim.dispose(); Object.assign(MASSLINE2_FLAGS, prior); }
});

function pickupOwnerFixture() {
  const sim = createSimulation({ seed: 429, systems: [economy, cargo, npcJobsRuntime, traffic, physics], updateOrder: [] });
  const { state, bus } = sim;
  state.mode = 'flight'; state.world.currentSectorId = 'sector_vesta_forge';
  state.settings.gameplay.physicsBackend = 'custom';
  const owner = sim.registry.get('traffic'), jobs = sim.registry.get('npcJobsRuntime');
  owner._ensureState(); sim.registry.get('economy').ensureMarket('station_forge');
  const yard = sim.spawn({ type: 'station', radius: 24, pos: { x: -100, z: 0 },
    data: { stationId: 'station_forge', dockRadius: 45 } });
  const spawnSweeper = key => {
    const hull = sim.spawn({ type: 'ship', team: 2, hull: 100, hullMax: 100, collides: true,
      radius: 14, mass: 100, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      data: { trafficRole: 'sweeper', worldRecordId: key } });
    const manifest = owner._emptySalvorManifest(hull, 0); hull.data.cargoManifest = manifest;
    state.traffic.freighters.push({ id: hull.id, role: 'sweeper', manifest });
    return hull;
  };
  const spawnPickup = (data = {}, pos = { x: 15, z: 0 }) => sim.spawn({ type: 'pickup', collides: true,
    radius: 2, mass: 5, pos, vel: { x: 0, z: 0 },
    data: { kind: 'cargo', commodityId: 'cmdty_scrap_metal', amount: 3, ...data } });
  // Stage an overlapping front contact, then use the actual physics receipt owner and listeners.
  const collect = (pickup, hull) => sim.registry.get('physics')._applyPickupCollection(pickup, hull, bus, state);
  return { sim, state, bus, owner, jobs, yard, spawnSweeper, spawnPickup, collect };
}

test('a borrowed Sweeper keeps its physical booking through a 58-second control lease and actual intake', () => {
  const h = pickupOwnerFixture();
  try {
    const worker = h.spawnSweeper('sweeper:borrowed'), pickup = h.spawnPickup();
    assert.equal(dispatchSweeperWork(h.owner, [h.yard], h.state.world.currentSectorId), true);
    const jobId = worker.data.jobId, entry = h.sim.helpers.npcJobs.get(jobId);
    const phase = entry.job.phase, progress = entry.job.progress;
    assert.equal(h.jobs.claimControl(jobId, { claimId: 'test:borrow', holder: 'test:controller' }).granted, true);
    worker.data.intent = { moveX: .4, moveZ: -.2, aimAngle: 1, brake: false, fire: false };
    const controllerIntent = { ...worker.data.intent };
    assert.equal(h.collect(pickup, worker), false, 'a borrowed hull cannot take custody');
    h.jobs.update(58, h.state); h.state.simTime += 58;
    assert.equal(entry.job.phase, phase, 'a lease cannot advance an uncollected physical timetable');
    assert.equal(entry.job.progress, progress);
    assert.deepEqual(worker.data.intent, controllerIntent, 'the real controller retains its intent');
    assert.equal(resolveSweeperPickup(h.state, entry), pickup);
    assert.equal(h.jobs.releaseControl(jobId, 'test:borrow').released, true);
    h.jobs.update(.1, h.state);
    assert.equal(h.collect(pickup, worker), true);
    assert.equal(pickup.alive, false); assert.equal(worker.data.cargoManifest.totalQty, 3);
    assert.equal(entry.job.payload.extracted, true);
    const stock = h.state.economy.markets.station_forge.cmdty_scrap_metal.stock, unloads = [];
    h.bus.on('salvage:npcUnload', p => unloads.push(p));
    h.jobs.update(.1, h.state);
    assert.equal(entry.job.phase, 'return');
    h.jobs.update(10, h.state);
    assert.equal(unloads.length, 0, 'the timetable cannot unload at the distant yard');
    assert.equal(worker.data.cargoManifest.totalQty, 3);
    // Stage the physical arrival; the existing runtime and yard owners settle the finite hold.
    worker.pos.x = h.yard.pos.x + 40; worker.pos.z = h.yard.pos.z;
    for (let i = 0; i < 100 && worker.data.jobId; i++) {
      h.state.simTime += .1; h.jobs.update(.1, h.state);
    }
    assert.equal(unloads.length, 1); assert.equal(unloads[0].intakeResult?.ok, true);
    assert.equal(worker.data.cargoManifest.totalQty, 0);
    assert.equal(h.state.economy.markets.station_forge.cmdty_scrap_metal.stock, stock + 3);
    assert.equal(worker.data.jobId, undefined, 'the active shift closes after real intake');
    h.jobs.update(.1, h.state); assert.equal(unloads.length, 1);
    h.spawnPickup({}, { x: worker.pos.x + 15, z: worker.pos.z });
    assert.equal(dispatchSweeperWork(h.owner, [h.yard], h.state.world.currentSectorId), true,
      'the finished borrowed shift cannot block the next booking');
  } finally { h.sim.dispose(); }
});

test('idle and busy Sweeper hulls preserve booked scrap and locked mission cargo at real pickup contact', () => {
  for (const busy of [false, true]) {
    const h = pickupOwnerFixture();
    try {
      const a = h.spawnSweeper('sweeper:booked'), b = h.spawnSweeper('sweeper:other');
      const booked = h.spawnPickup();
      assert.equal(dispatchSweeperWork(h.owner, [h.yard], h.state.world.currentSectorId), true);
      const entry = h.sim.helpers.npcJobs.get(a.data.jobId);
      if (busy) assert.ok(h.jobs.assign(b, { kind: 'miner', sectorId: h.state.world.currentSectorId,
        route: [{ id: 'home', pos: { ...h.yard.pos } }, { id: 'field', pos: { x: 30, z: 0 } }] }));
      const locked = h.spawnPickup({ missionId: 'mission:other-owner' });
      for (const pickup of [booked, locked]) {
        assert.equal(h.collect(pickup, b), false, busy ? 'busy Sweeper refuses' : 'idle Sweeper refuses');
        assert.equal(pickup.alive, true); assert.equal(pickup.data.amount, 3);
        assert.equal(a.data.cargoManifest.totalQty, 0); assert.equal(b.data.cargoManifest.totalQty, 0);
      }
      assert.equal(resolveSweeperPickup(h.state, entry), booked);
      assert.equal(h.collect(booked, a), true, 'another hull’s refusal does not block the booked owner');
      assert.equal(booked.alive, false); assert.equal(a.data.cargoManifest.totalQty, 3);
      assert.equal(locked.alive, true); assert.equal(locked.data.amount, 3);
      assert.equal(b.data.cargoManifest.totalQty, 0);
      assert.equal(h.state.player.cargo.items.cmdty_scrap_metal || 0, 0);
    } finally { h.sim.dispose(); }
  }
});

test('the Sweeper refusal guard preserves unrelated NPC and player collection semantics', () => {
  const h = pickupOwnerFixture();
  try {
    const npc = h.sim.spawn({ type: 'ship', radius: 14, pos: { x: 0, z: 0 }, data: { trafficRole: 'hauler' } });
    const npcPickup = h.spawnPickup();
    assert.equal(h.collect(npcPickup, npc), true, 'unrelated NPCs retain their existing collector contract');
    assert.equal(npcPickup.alive, false);
    const player = h.spawnSweeper('sweeper:player'); h.state.playerId = player.id;
    h.state.player.cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 100, capMass: 100 };
    const playerPickup = h.spawnPickup();
    assert.equal(h.collect(playerPickup, player), true, 'a player flying a Sweeper still uses the cargo owner');
    assert.equal(playerPickup.alive, false);
    assert.equal(h.state.player.cargo.items.cmdty_scrap_metal, 3);
    assert.equal(player.data.cargoManifest.totalQty, 0, 'the player pickup does not create an NPC manifest');
  } finally { h.sim.dispose(); }
});
