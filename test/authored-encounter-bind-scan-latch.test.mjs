import test from 'node:test';
import assert from 'node:assert/strict';
import { mothlight, setMothlightBindScanLatchForBench } from '../src/systems/mothlight.js';
import { kilnback, setKilnbackBindScanLatchForBench } from '../src/systems/kilnback.js';
import { MOTHLIGHT } from '../src/data/mothlight.js';
import { KILNBACK } from '../src/data/kilnback.js';

// The mothlight/kilnback update() bind scans walked `state.entityList` every flight tick even
// in saves where the encounter never spawned. They now latch on shipLike/wrecks membership
// (the salvageActions quiet-latch shape): same scan, gated — wake on membership change or a
// 0.5 s rescan; an unversioned index falls back to always-scan. bind() calls are the
// observable: an already-bound carrier is re-offered on every real scan and skipped when the
// latch holds.

// The full ensureEntityIndex array set — bind() runs syncEntitySectorMembership, whose
// repairEntityIndex flips `ready` false when a volatile lane is missing, and a not-ready
// index is exactly the always-scan fallback this fixture must avoid.
function makeIndex() {
  const index = {
    __spacefaceEntityIndexV1: true,
    version: 1,
    laneVersions: { shipLike: 0, wrecks: 0 },
    laneEpoch: 0,
    ready: true,
    spatialStaticVersion: 0,
    spatialDynamicsVersion: 0,
    physicsStaticVersion: 0,
    physicsDynamicsVersion: 0,
    byStationId: new Map(),
    byWorldSiteId: new Map(),
    byActivityObjectSlotId: new Map(),
    byActivityActorSlotId: new Map(),
    capitalBossCast: new Set(),
    byWorldRecordId: new Map(),
    byWorldRecordIdCount: new Map(),
    bySectorId: new Map(),
    _indexedIds: new Set(),
    _sourceList: null,
    _sourceLength: -1,
  };
  for (const lane of ['ships', 'drones', 'shipLike', 'projectiles', 'pickups', 'payloads',
    'movables', 'stations', 'dockStations', 'gates', 'asteroids', 'mineables', 'wrecks',
    'fauna', 'fx', 'mines', 'vectorMines', 'snares', 'charges', 'bombs', 'statics',
    'damageables', 'aiShips', 'weaponShips', 'collidables', 'spatialStatics',
    'spatialDynamics', 'physicsBodies', 'physicsStatics', 'physicsDynamics',
    'radarContacts', 'radarAsteroids']) index[lane] = [];
  return index;
}

function makeState() {
  return {
    mode: 'flight',
    tick: 100,
    simTime: 10,
    playerId: 'player',
    entities: new Map(),
    entityList: [],
    entityIndex: makeIndex(),
    world: { currentSectorId: 'fixture_sector' },
    ui: {},
    run: {},
    settings: { gameplay: {} },
  };
}

function makeCarrier(state, lootTableId, id = 'carrier-1') {
  const e = {
    id, type: 'ship', alive: true, occupantGeneration: 1,
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
    radius: 10, mass: 100, hull: 50, flags: {},
    data: lootTableId ? { lootTableId } : {},
  };
  state.entityList.push(e);
  state.entities.set(id, e);
  return e;
}

function makeHost(system, state) {
  const host = Object.create(system);
  host.init({
    state,
    bus: { on: () => () => {}, emit() {} },
    helpers: {},
    registry: { get: () => null },
  });
  const binds = [];
  const origBind = host.bind;
  host.bind = function (...args) { binds.push(args[0]); return origBind.apply(this, args); };
  host.binds = binds;
  return host;
}

function tick(host, state) {
  state.tick++;
  state.simTime = state.tick / 60;
  host.update(1 / 60, state);
}

for (const [label, system, enemyId, setLatch] of [
  ['mothlight', mothlight, MOTHLIGHT.enemyId, setMothlightBindScanLatchForBench],
  ['kilnback', kilnback, KILNBACK.enemyId, setKilnbackBindScanLatchForBench],
]) {
  test(`${label}: bind scan latches on unchanged membership, wakes on ship/wreck bump`, () => {
    setLatch(true);
    const state = makeState();
    makeCarrier(state, enemyId);
    const host = makeHost(system, state);
    tick(host, state);
    assert.equal(host.binds.length, 1, 'first flight tick scans and binds the carrier');
    tick(host, state);
    assert.equal(host.binds.length, 1, 'unchanged membership holds the latch — no rescan');
    state.entityIndex.laneVersions.shipLike++;
    tick(host, state);
    assert.equal(host.binds.length, 2, 'ship membership change wakes the rescan');
    state.entityIndex.laneVersions.wrecks++;
    tick(host, state);
    assert.equal(host.binds.length, 3, 'wreck membership change wakes the rescan');
  });

  test(`${label}: silent post-spawn stamp is caught by the 30-tick rescan`, () => {
    setLatch(true);
    const state = makeState();
    const carrier = makeCarrier(state, null);
    const host = makeHost(system, state);
    tick(host, state);
    assert.equal(host.binds.length, 0);
    carrier.data.lootTableId = enemyId; // stamped with no spawn and no membership bump
    for (let i = 0; i < 29; i++) tick(host, state);
    assert.equal(host.binds.length, 0, 'still inside the 0.5 s rescan window');
    tick(host, state);
    assert.equal(host.binds.length, 1, 'the rescan services the silent stamp');
  });

  test(`${label}: unusable index never arms the latch`, () => {
    setLatch(true);
    const state = makeState();
    // A not-ready index (mid-repair, pre-build) answers -1/null — the always-scan fallback.
    state.entityIndex.ready = false;
    makeCarrier(state, enemyId);
    const host = makeHost(system, state);
    tick(host, state);
    tick(host, state);
    tick(host, state);
    assert.equal(host.binds.length, 3, 'no membership watch — every tick scans');
    assert.equal(host._bindScan, null);
  });

  test(`${label}: bench toggle restores always-scan`, () => {
    setLatch(false);
    try {
      const state = makeState();
      makeCarrier(state, enemyId);
      const host = makeHost(system, state);
      tick(host, state);
      tick(host, state);
      assert.equal(host.binds.length, 2, 'latch disabled — every tick scans');
    } finally {
      setLatch(true);
    }
  });
}
