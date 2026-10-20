import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { stampOccupantGeneration } from '../src/core/entity.js';
import { physics } from '../src/core/physics.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { queuePhysicsImpulse } from '../src/core/physicsAuthority.js';
import { world } from '../src/systems/world.js';
import { save } from '../src/save/saveSystem.js';
import {
  createCatalogStationRestore, spawnRestoredCatalogStation, restoredCatalogStation,
  isRestoredCatalogStation, restoredCatalogStationAnchor,
} from '../src/save/catalogStationRestore.js';

const sectorId = 'sector_ceres_belt', stationId = 'station_ceres';
const anchor = { x: -13388, z: 8812 };
function station(id = 603) {
  return { id, type: 'station', alive: true, pos: { x: anchor.x + 2, z: anchor.z + 1 },
    vel: { x: .1, z: .2 }, hull: 999900, hullMax: 1e6, flags: { persistent: true },
    homeSectorId: sectorId, data: { stationId, sectorId, homeSectorId: sectorId },
    physicsBody: { dynamic: false, mass: 1e6, radius: 34,
      anchorRecoil: { rest: { ...anchor }, x: 2, z: 1, vx: .1, vz: .2, settled: false } },
    activity: { simTier: 'S0_EXACT', pins: ['FIELD_DRIVEN'] } };
}
function fixture(t, rows = [station()], systems = [world]) {
  const sim = createSimulation({ seed: 804, systems, updateOrder: [] });
  t.after(() => sim.dispose());
  const state = sim.state, helpers = sim.registry.ctx.helpers;
  state.sessionEntityIdRemap = new Map();
  state.restoreEnvelopeStations = createCatalogStationRestore(rows);
  const saver = { state, helpers };
  return { sim, state, helpers, saver, rows };
}

test('catalog materialization and the persistent pass share the complete saved station carrier', t => {
  const f = fixture(t), active = { stations: [] }, owner = f.sim.registry.get('world');
  owner._spawnStations(f.state.world.sectors[sectorId], active, () => .5);
  const carried = restoredCatalogStation(f.state, f.rows[0]);
  assert.ok(carried); assert.equal(carried.id, 603); assert.equal(carried.hull, 999900);
  assert.deepEqual({ x: carried.pos.x, z: carried.pos.z }, f.rows[0].pos);
  assert.deepEqual(carried.physicsBody.anchorRecoil, f.rows[0].physicsBody.anchorRecoil);
  assert.deepEqual(carried.activity, f.rows[0].activity);
  assert.equal(Object.getOwnPropertyDescriptor(carried, 'activity').enumerable, false);
  assert.deepEqual(restoredCatalogStationAnchor(f.state, carried), anchor);
  assert.equal(active.stations.find(row => row.stationId === stationId).id, carried.id);
  const remap = new Map();
  save._spawnPersistentEntities.call(f.saver, f.rows, remap);
  assert.equal(f.state.entities.get(carried.id), carried, 'generic stale clear cannot remove the adopted life');
  assert.equal(remap.get('603'), carried.id);
  assert.equal(f.state.entityList.filter(e => e.alive && e.data?.stationId === stationId).length, 1);
});

test('identical saved aliases remap to one station, but conflicting snapshots fail closed', t => {
  const rows = [station(603), station(604)], f = fixture(t, rows);
  const carried = spawnRestoredCatalogStation(f.state, f.helpers, stationId, sectorId, anchor);
  const remap = new Map();
  save._spawnPersistentEntities.call(f.saver, rows, remap);
  assert.deepEqual([...remap], [['603', carried.id], ['604', carried.id]]);
  assert.equal(f.state.entityList.length, 1);
  const conflict = station(605); conflict.hull--;
  assert.throws(() => createCatalogStationRestore([rows[0], conflict]), /ambiguous_catalog_station/);
  const microscopicConflict = station(606); microscopicConflict.pos.x += 1e-8;
  assert.throws(() => createCatalogStationRestore([rows[0], microscopicConflict]), /ambiguous_catalog_station/,
    'duplicate snapshots compare exact values, not rounded replay hashes');
});

test('unknown, wrong-sector, dead, non-station and gate labels cannot claim a catalog station', t => {
  for (const change of [
    { type: 'ship' }, { alive: false }, { homeSectorId: 'sector_helios_prime' },
    { data: { stationId, sectorId: 'sector_helios_prime' } },
    { data: { stationId: 'unknown_station' } }, { data: { stationId, isGate: true } },
  ]) {
    const row = { ...station(), ...change };
    assert.equal(createCatalogStationRestore([row]).size, 0);
  }
  const f = fixture(t);
  assert.equal(spawnRestoredCatalogStation(f.state, f.helpers, stationId, 'sector_helios_prime', anchor), null);
});

test('stale, removed, replaced or restamped carriers grant no adoption or cleanup exemption', t => {
  const f = fixture(t);
  const carried = spawnRestoredCatalogStation(f.state, f.helpers, stationId, sectorId, anchor);
  stampOccupantGeneration(f.state, carried);
  assert.equal(isRestoredCatalogStation(f.state, carried), false);
  assert.equal(restoredCatalogStationAnchor(f.state, carried), null);
  f.state.entities.delete(carried.id);
  assert.equal(restoredCatalogStation(f.state, f.rows[0]), null);
  f.state.entities.set(carried.id, { ...carried });
  assert.equal(isRestoredCatalogStation(f.state, carried), false);
});

test('an occupied saved number is not overwritten and non-station persistence stays unchanged', t => {
  const f = fixture(t);
  const foreign = f.sim.spawn({ id: 603, type: 'ship', flags: { persistent: true }, data: { marker: 'foreign' } });
  const carried = spawnRestoredCatalogStation(f.state, f.helpers, stationId, sectorId, anchor);
  assert.notEqual(carried.id, foreign.id); assert.equal(f.state.entities.get(603), foreign);
  const ordinary = { id: 900, type: 'ship', flags: { persistent: true }, data: { marker: 'ordinary' } };
  const remap = new Map();
  save._spawnPersistentEntities.call(f.saver, [...f.rows, ordinary], remap);
  assert.equal(remap.get('603'), carried.id);
  assert.equal(f.state.entities.get(900).data.marker, 'ordinary');
  assert.equal(f.state.entityList.filter(e => e.alive && e.type === 'station').length, 1);
});

for (const mode of ['sync', 'stepped']) for (const remote of [false, true]) for (const delayed of [false, true]) test(`${mode} ${delayed ? 'deferred-backend' : 'ready-backend'} native restore keeps one ${remote ? 'remote' : 'materialized'} displaced station and its authored rest across repeated Continue`, async t => {
  const f = fixture(t), system = Object.create(physics);
  f.state.mode = 'flight';
  system.init({ state: f.state, bus: f.sim.bus, helpers: f.helpers });
  system._sg02 = await createSg02DynamicBodyOwner({ publishTelemetry: false });
  t.after(() => system._sg02?.dispose());
  f.rows[0].pos = { ...anchor }; f.rows[0].vel = { x: 0, z: 0 };
  delete f.rows[0].physicsBody.anchorRecoil;
  let entity = spawnRestoredCatalogStation(f.state, f.helpers, stationId, sectorId, anchor);
  system._sg02.syncFromEntities([entity]);
  queuePhysicsImpulse(entity, { x: 8e6, z: 0 });
  for (let tick = 0; tick < 12; tick++) system._sg02.step(1 / 60);
  f.rows = save._serializeEntities.call(f.saver).persistent;
  const payload = system.serialize();
  assert.equal(payload.anchoredRecoil.length, 1);
  for (let cycle = 0; cycle < 3; cycle++) {
    f.helpers.removeEntity(entity.id, { immediate: true, reason: 'save_restore' });
    f.state.restoreEnvelopeStations = createCatalogStationRestore(f.rows);
    if (remote) {
      save._spawnPersistentEntities.call(f.saver, f.rows, f.state.sessionEntityIdRemap);
      entity = restoredCatalogStation(f.state, f.rows[0]);
    } else entity = spawnRestoredCatalogStation(f.state, f.helpers, stationId, sectorId, anchor);
    system.deserialize(structuredClone(payload), { deferNative: true });
    if (delayed) delete f.state.restoreEnvelopeStations;
    if (mode === 'sync') system.completeRestore({ entityIdRemap: f.state.sessionEntityIdRemap });
    else [...system.completeRestoreSteps({ entityIdRemap: f.state.sessionEntityIdRemap })];
    assert.deepEqual(entity.physicsBody.anchorRecoil.rest, anchor);
    assert.deepEqual({ x: entity.pos.x, z: entity.pos.z }, f.rows[0].pos);
    assert.equal(system._sg02.records.size, 1);
    assert.equal(system._sg02.records.get(entity.id).body.isKinematic(), true);
    assert.equal(f.state.entityList.filter(e => e.alive).length, 1);
    assert.deepEqual(f.state.physicsRuntime.nativeRestore, { mode: 'native', exact: true, reason: null });
  }
});

test('conflicting station identities release the restore scope before any entity clearing', t => {
  const f = fixture(t), saver = Object.create(save);
  saver.state = f.state; saver.bus = f.sim.bus; saver.helpers = f.helpers; saver.registry = f.sim.registry;
  const old = f.sim.spawn({ type: 'ship', data: { marker: 'outgoing-run' } });
  const conflict = station(604); conflict.pos.x++;
  const session = saver._openRestoreSession({ entities: { persistent: [station(), conflict] } }, 'test', {});
  assert.equal(session.openFailed, true); assert.match(session.error.message, /ambiguous_catalog_station/);
  assert.equal(f.state.entities.get(old.id), old, 'a contradictory save does not clear the outgoing entity');
  assert.equal(saver._restoring, false);
  assert.equal(f.state.restoreEnvelopeStations, undefined);
  assert.equal(f.state.restoreEnvelopeRecordIds, undefined);
});

test('conflicting imported station snapshots are rejected before sync or asynchronous restore side effects', async t => {
  const f = fixture(t, [], [world, save]), saver = f.sim.registry.get('save');
  const player = f.sim.spawn({ type: 'ship', isPlayer: true, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel' } });
  f.state.playerId = player.id;
  const envelope = saver.serialize('ambiguous-station-input');
  const conflicting = station(604); conflicting.hull--;
  envelope.data.entities.persistent = [station(), conflicting];
  delete envelope.checksum;
  let restoring = 0, transitions = 0;
  f.sim.bus.on('save:restoring', () => restoring++);
  saver.helpers.beginLoadedGameTransition = () => { transitions++; };
  const previousEpoch = f.state.world.enterSerial, previousSequence = saver._restoreSequence;
  assert.equal(saver.loadEnvelope(envelope), false);
  assert.equal(await saver.loadEnvelopeFromString(JSON.stringify(envelope)), false);
  assert.equal(restoring, 0); assert.equal(transitions, 0);
  assert.equal(f.state.world.enterSerial, previousEpoch);
  assert.equal(saver._restoreSequence, previousSequence);
  assert.equal(f.state.entities.get(player.id), player);
  assert.equal(f.state.entityList.length, 1);
});

test('ordinary sector demotion and re-promotion reuse the retained station after restore cleanup', t => {
  const f = fixture(t), owner = f.sim.registry.get('world');
  owner._setSectorTier(sectorId, 'FULL');
  const carried = restoredCatalogStation(f.state, f.rows[0]);
  assert.ok(carried);
  delete f.state.restoreEnvelopeStations;
  for (let cycle = 0; cycle < 3; cycle++) {
    owner._setSectorTier(sectorId, 'RECORD_ONLY');
    assert.equal(f.state.entities.get(carried.id), carried);
    owner._setSectorTier(sectorId, 'FULL');
    const live = f.state.entityList.filter(e => e.alive && e.type === 'station' && e.data?.stationId === stationId);
    assert.deepEqual(live, [carried]);
    assert.equal(f.state.world.sectorContents[sectorId].stations.find(row => row.stationId === stationId).id, carried.id);
    assert.deepEqual(carried.physicsBody.anchorRecoil.rest, anchor);
  }
});

test('ambiguous resident station identities refuse a third body instead of discarding either life', t => {
  const f = fixture(t);
  delete f.state.restoreEnvelopeStations;
  const first = f.sim.spawn(station(603)), second = f.sim.spawn(station(604));
  assert.throws(() => spawnRestoredCatalogStation(f.state, f.helpers, stationId, sectorId, anchor),
    /ambiguous_live_catalog_station/);
  assert.equal(f.state.entities.get(603), first); assert.equal(f.state.entities.get(604), second);
  assert.equal(f.state.entityList.length, 2);
});
