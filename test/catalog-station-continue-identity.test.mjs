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

for (const evidence of ['observations', 'lives', 'reports']) test(`equivalent aliases with distinct ${evidence} reject atomically, never overwrite earned identities`, async t => {
  const f = fixture(t, [], [world, save]), saver = f.sim.registry.get('save');
  const player = f.sim.spawn({ type: 'ship', isPlayer: true, hull: 100, hullMax: 100,
    data: { defId: 'ship_kestrel' } });
  f.state.playerId = player.id;
  const envelope = saver.serialize('evidence-bearing-alias');
  envelope.data.entities.persistent = [station(603), station(604)];
  const story = envelope.data.missions.story;
  story.titles ||= {};
  if (evidence === 'observations') story.titles.stuntWitnessing = { episodes: { root: { observers: {
    'entity:603': { id: 603, identity: 'entity:603', lifeId: 'first-life', sourceTicks: 6 },
    'entity:604': { id: 604, identity: 'entity:604', lifeId: 'second-life', payoffTicks: 7 },
  } } } };
  if (evidence === 'lives') envelope.data.stunts = { revision: 2, mode: 'adventure', evidence: { revision: 2, sequence: 2,
    lives: [['number:603', { id: 'first-life', entityId: 603 }], ['number:604', { id: 'second-life', entityId: 604 }]] } };
  if (evidence === 'reports') story.titles.stuntWitnessing = { reports: [
    { id: 'first-report', senderId: 603, receiverId: 604, receiverLife: 'second-life' },
    { id: 'second-report', senderId: 604, receiverId: 603, receiverLife: 'first-life' },
  ] };
  delete envelope.checksum;
  const before = JSON.stringify(envelope), oldEntities = [...f.state.entityList];
  let restoring = 0; f.sim.bus.on('save:restoring', () => restoring++);
  assert.equal(saver.loadEnvelope(envelope), false);
  assert.equal(await saver.loadEnvelopeFromString(JSON.stringify(envelope)), false);
  assert.equal(restoring, 0);
  assert.deepEqual(f.state.entityList, oldEntities);
  assert.equal(f.state.entities.get(player.id), player);
  assert.equal(JSON.stringify(envelope), before, 'the rejected input is not rewritten');
});

test('unrelated evidence does not prevent equivalent station alias recovery', () => {
  const data = { stunts: { evidence: { lives: [['number:99', { entityId: 99, id: 'unrelated-life' }]] } } };
  assert.equal(createCatalogStationRestore([station(603), station(604)], data).size, 1);
});

test('one referenced alias lineage remains recoverable, while later distinct alias evidence rejects', () => {
  const data = { stunts: { evidence: { lives: [['number:604', { entityId: 604, id: 'only-life' }]] } } };
  assert.equal(createCatalogStationRestore([station(603), station(604)], data).size, 1);
  data.stunts.evidence.lives.push(['number:605', { entityId: 605, id: 'second-life' }]);
  assert.throws(() => createCatalogStationRestore([station(603), station(604), station(605)], data), /ambiguous_catalog_station/);
});

import { createAuthoritativeRuntime } from '../src/runtime/createAuthoritativeRuntime.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { snapshotFeatureMaps, applyFeatureConfigToMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';
import { serializeStuntEvidence } from '../src/combat/stuntEvidence.js';
import { remapStuntReferences } from '../src/combat/stuntSaveReferences.js';

for (const cold of [false, true]) for (const damaged of [false, true]) test(`actual ${cold ? 'cold asynchronous' : 'ready synchronous'} Continue preserves ${damaged ? 'damaged recoiled' : 'fresh'} native station witnesses through three cycles and leave/return`, async () => {
  const priorFeatures = snapshotFeatureMaps();
  let runtime;
  const create = () => {
    const r = createAuthoritativeRuntime({ profileId: 'production', nodeSafeOnly: true, seed: 47 });
    applyFeatureConfigToMaps(r.config.features); return r;
  };
  try {
    runtime = create();
    let state = runtime.state, owner = runtime.getSystem('world'), saver = runtime.getSystem('save'), native = runtime.getSystem('physics');
    state.mode = 'flight'; state.ui.screenStack = [];
    state.playerId = runtime.spawn(makeShipEntitySpec('ship_kestrel', { isPlayer: true, player: state.player, team: 0, pos: { x: 0, z: 0 } })).id;
    owner.enterSector('sector_vesta_forge');
    assert(await native.prepareBackend(state)); runtime.step(1 / 60);
    owner.relocatePlayerInSector({ x: -480, z: 16954, heading: 0 }, { reason: 'station-witness-regression' });
    const player = state.entities.get(state.playerId);
    assert(native._sg02.applyImpulse({ entityId: player.id, impulse: { x: player.mass * 5, z: 0 },
      provenance: { actorId: player.id }, tick: state.tick, reason: 'flight' }));
    runtime.step(1 / 60);
    const keys = ['station_forge', 'station_vesta_outlying_yard'];
    const carriers = () => keys.map(key => {
      const rows = state.entityList.filter(e => e.alive !== false && e.type === 'station' && e.data?.stationId === key);
      assert.equal(rows.length, 1, key); return rows[0];
    });
    const original = carriers();
    const observers = Object.values(state.story.titles.stuntWitnessing.episodes).flatMap(ep => Object.values(ep.observers));
    for (const entity of original) assert(observers.some(o => o.id === entity.id && o.lifeId), 'native impulse earns a real station witness');
    if (damaged) {
      original[0].hull -= 123; // Explicit damage fixture, not a claim of player-fired combat.
      queuePhysicsImpulse(original[0], { x: 8e6, z: 0 });
      runtime.runTicks(2);
      assert(original[0].physicsBody.anchorRecoil);
      assert.notEqual(original[0].pos.x, -480, 'the real native owner displaces the station');
    }
    // Nonempty transport fixture supplements the genuinely earned native observations.
    // It tests reference preservation, not report earning or delivery qualification.
    state.story.titles.stuntWitnessing.reports.push({ id: 'report:station-transport-fixture',
      rootId: Object.keys(state.story.titles.stuntWitnessing.episodes)[0], senderId: original[0].id,
      receiverId: original[1].id, receiverLife: observers.find(o => o.id === original[1].id).lifeId,
      sentTick: state.tick, deliveryTick: state.tick + 120 });
    let envelope = JSON.parse(JSON.stringify(saver.serialize('native-station-witness')));
    const stationIds = new Set(original.map(e => e.id));
    const lives = envelope.data.stunts.evidence.lives.filter(([, life]) => stationIds.has(life.entityId));
    assert.equal(lives.length, 2, 'both earned witness lives are saved');
    for (let cycle = 0; cycle < 3; cycle++) {
      if (cold) {
        runtime.dispose(); runtime = create();
        state = runtime.state; owner = runtime.getSystem('world'); saver = runtime.getSystem('save'); native = runtime.getSystem('physics');
      }
      const source = JSON.stringify(envelope);
      assert(cold ? await saver.loadEnvelopeFromString(source) : saver.loadEnvelope(envelope));
      assert(await native.prepareBackend(state));
      for (const entity of carriers()) {
        assert.equal(state.entities.get(entity.id), entity);
        assert(stationIds.has(entity.id));
        const saved = envelope.data.entities.persistent.find(row => row.id === entity.id);
        assert.equal(entity.hull, saved.hull);
        assert.deepEqual({ x: entity.pos.x, z: entity.pos.z }, saved.pos);
        if (saved.physicsBody?.anchorRecoil) assert.deepEqual(entity.physicsBody.anchorRecoil.rest, saved.physicsBody.anchorRecoil.rest);
        if (saved.activity) assert.deepEqual(entity.activity, saved.activity);
        assert(native._sg02.records.get(entity.id)?.body.isEnabled());
        assert.equal(state.world.sectorContents.sector_vesta_forge.stations.find(row => row.stationId === entity.data.stationId)?.id, entity.id);
      }
      const allRestoredLives = JSON.parse(JSON.stringify(serializeStuntEvidence(state))).lives;
      const lifeRemap = new Map();
      for (const [, oldLife] of envelope.data.stunts.evidence.lives) {
        const current = allRestoredLives.find(([, life]) => life.id === oldLife.id)?.[1];
        if (current) lifeRemap.set(String(oldLife.entityId), current.entityId);
      }
      const expectedWitness = remapStuntReferences(structuredClone(envelope.data.missions.story.titles.stuntWitnessing), lifeRemap);
      assert.deepEqual(state.story.titles.stuntWitnessing, expectedWitness, 'all observation counters, identities and reports survive with legitimate non-station body remaps');
      const restoredLives = allRestoredLives.filter(([, life]) => stationIds.has(life.entityId));
      assert.deepEqual(restoredLives, lives, 'life identities remain bound to the same bodies');
      assert.equal(JSON.stringify(envelope), source);
      envelope = JSON.parse(JSON.stringify(saver.serialize('native-station-witness')));
    }
    const retained = carriers();
    owner.enterSector('sector_helios_prime'); runtime.step(1 / 60);
    owner.enterSector('sector_vesta_forge'); runtime.step(1 / 60);
    assert(await native.prepareBackend(state));
    assert.deepEqual(carriers(), retained, 'sector return adopts the retained bodies');
    for (const entity of carriers()) {
      assert.equal(state.entities.get(entity.id), entity);
      assert(native._sg02.records.get(entity.id)?.body.isEnabled());
      assert.equal(state.world.sectorContents.sector_vesta_forge.stations.find(row => row.stationId === entity.data.stationId)?.id, entity.id);
    }
  } finally { runtime?.dispose(); restoreFeatureMaps(priorFeatures); }
});

for (const field of ['hull', 'pose', 'cargo', 'attachments', 'patch receipts']) test(`conflicting station ${field} rejects sync and async without changing outgoing state or input`, async t => {
  const f = fixture(t, [], [world, save]), saver = f.sim.registry.get('save');
  const player = f.sim.spawn({ type: 'ship', isPlayer: true, hull: 100, hullMax: 100, data: { defId: 'ship_kestrel' } });
  f.state.playerId = player.id;
  const envelope = saver.serialize('conflicting-station-control'), second = station(604);
  if (field === 'hull') second.hull--;
  if (field === 'pose') second.pos.x += 1e-8;
  if (field === 'cargo') second.cargo = { ore: 1 };
  if (field === 'attachments') second.attachments = [{ id: 'retained-fixture-attachment' }];
  if (field === 'patch receipts') second.data.receipts = [{ kind: 'patched', receiptId: 'different-earned-patch' }];
  envelope.data.entities.persistent = [station(), second]; delete envelope.checksum;
  const before = JSON.stringify(envelope), entities = [...f.state.entityList], epoch = f.state.world.enterSerial;
  let events = 0; f.sim.bus.on('save:restoring', () => events++);
  assert.equal(saver.loadEnvelope(envelope), false);
  assert.equal(await saver.loadEnvelopeFromString(before), false);
  assert.equal(events, 0); assert.equal(f.state.world.enterSerial, epoch);
  assert.deepEqual(f.state.entityList, entities); assert.equal(f.state.entities.get(player.id), player);
  assert.equal(JSON.stringify(envelope), before);
});
