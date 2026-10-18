import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSimulation } from '../src/core/sim.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { deserializeRecordsBag } from '../src/world/worldRecords.js';
import { insertFarActor, promoteFarActor, restoreFarActorTable, serializeFarActorTable } from '../src/world/farActorTable.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/anvil-legacy-shelf-record.json', import.meta.url), 'utf8'));
const roundTrip = value => JSON.parse(JSON.stringify(value));
const recordsOwner = { name: 'world', init({ state }) { this.state = state; }, upsertWorldRecord: world.upsertWorldRecord };

function restore(state) {
  state.mode = 'flight';
  state.simTime = fixture.simTime;
  // Continue restores the shelf before the durable records, so hydration belongs to promotion.
  restoreFarActorTable(state, roundTrip(fixture.farActors));
  state.world.records = deserializeRecordsBag(roundTrip(fixture.records));
}

function setup() {
  const sim = createSimulation({ seed: fixture.seed, systems: [recordsOwner] });
  restore(sim.state);
  return sim;
}

function rowFor(role) { return fixture.farActors.rows.find(row => row.route.role === role); }
function assertRecovered(entity, record) {
  assert.ok(entity);
  assert.deepEqual(entity.data.itinerary, record.itinerary, 'the saved shift and destination return');
  assert.deepEqual(entity.data.cargoManifest, record.cargoManifest, 'the exact finite load returns');
  assert.deepEqual(entity.propulsion, makeShipEntitySpec('ship_mule').propulsion, 'the worker has its Mule drive');
  assert.notEqual(entity.data.itinerary, record.itinerary);
  assert.notEqual(entity.data.cargoManifest, record.cargoManifest);
  assert.notEqual(entity.data.cargoManifest.lines, record.cargoManifest.lines);
}

for (const role of ['collector', 'receiver']) test(`legacy ${role} shelf restores its saved shift, Mule drive and cargo on Continue`, () => {
  const sim = setup();
  try {
    const row = rowFor(role), record = sim.state.world.records.byId[row.data.worldRecordId];
    assert.equal(row.data.itinerary, undefined, 'fixture came from the stripping first-parent producer');
    assert.equal(row.data.cargoManifest, undefined);
    const before = roundTrip(record);
    const entity = promoteFarActor(sim.state, row.id, sim.helpers);
    assertRecovered(entity, record);
    for (const key of ['pos', 'vel'])
      assert.deepEqual({ x: entity[key].x, z: entity[key].z }, row[key], `shelf ${key} stays authoritative`);
    for (const key of ['rot', 'angVel', 'hull', 'hullMax', 'shield', 'shieldMax'])
      assert.deepEqual(entity[key], row[key], `shelf ${key} stays authoritative`);
    assert.deepEqual(roundTrip(record), before, 'promotion does not rewrite the durable source');
    const captured = sim.registry.get('world').upsertWorldRecord(entity);
    assert.deepEqual(captured.itinerary, before.itinerary);
    assert.deepEqual(captured.cargoManifest, before.cargoManifest, 'recapture cannot erase the recovered load');
    entity.data.itinerary.sequence++;
    entity.data.cargoManifest.lines.push({ commodityId: 'uncommitted-probe', qty: 1 });
    assert.deepEqual(roundTrip(record), before, 'live work does not alias the source record');
  } finally { sim.dispose(); }
});

test('repeated promotion, recapture and re-shelving never duplicate the saved cargo', () => {
  const sim = setup();
  try {
    for (const row of fixture.farActors.rows) {
      const record = sim.state.world.records.byId[row.data.worldRecordId];
      let entity = promoteFarActor(sim.state, row.id, sim.helpers);
      assertRecovered(entity, record);
      assert.equal(promoteFarActor(sim.state, row.id, sim.helpers), entity, 'same live worker on a second promote');
      sim.registry.get('world').upsertWorldRecord(entity);
      insertFarActor(sim.state, entity, sim.state.simTime);
      sim.helpers.removeEntity(entity.id, { immediate: true, reason: 'virtualize' });
      restoreFarActorTable(sim.state, roundTrip(serializeFarActorTable(sim.state.world.farActors)));
      entity = promoteFarActor(sim.state, row.id, sim.helpers);
      assertRecovered(entity, record);
      assert.deepEqual(sim.registry.get('world').upsertWorldRecord(entity).cargoManifest, record.cargoManifest);
    }
    assert.equal(sim.state.entityList.filter(e => e.alive !== false).length, 2);
    assert.equal(sim.state.entityList.reduce((sum, e) => sum + (e.data.cargoManifest?.totalQty || 0), 0), 4);
  } finally { sim.dispose(); }
});

function assertRefusedThenRepaired(mutate, label) {
  const sim = setup();
  try {
    const row = rowFor('collector');
    mutate(sim.state, row);
    const before = roundTrip(sim.state.world.records);
    const entity = promoteFarActor(sim.state, row.id, sim.helpers);
    assert.ok(entity, `${label}: keep the existing shell-promotion behaviour`);
    assert.equal(entity.data.itinerary, undefined, `${label}: no partial itinerary recovery`);
    assert.equal(entity.data.cargoManifest, undefined, `${label}: no invented cargo`);
    assert.equal(entity.propulsion, undefined, `${label}: no invented hardware`);
    assert.deepEqual(roundTrip(sim.state.world.records), before, `${label}: durable source is untouched`);
    sim.helpers.removeEntity(entity.id, { immediate: true, reason: 'virtualize' });
    restore(sim.state);
    assertRecovered(promoteFarActor(sim.state, row.id, sim.helpers),
      sim.state.world.records.byId[row.data.worldRecordId]);
  } finally { sim.dispose(); }
}

test('ambiguous durable identity refuses recovery and a unique repaired identity recovers', () => {
  assertRefusedThenRepaired((state, row) => {
    state.world.records.byId['duplicate-key'] = roundTrip(state.world.records.byId[row.data.worldRecordId]);
  }, 'two durable records with the same identity');
});

test('a missing exact record refuses recovery even with another Anvil worker, then recovers when restored', () => {
  assertRefusedThenRepaired((state, row) => {
    delete state.world.records.byId[row.data.worldRecordId];
  }, 'no exact record');
});

test('invalid durable workers refuse partial recovery and valid records recover', () => {
  for (const [label, mutate] of Object.entries({
    position: r => { r.pos.x = NaN; },
    dead: r => { r.alive = false; },
    destroyed: r => { r.outcome = 'destroyed'; },
    hull: r => { r.hull = 0; },
    kind: r => { r.kind = 'npc'; },
    sector: r => { r.sectorId = 'sector_ceres_belt'; },
    hullIdentity: r => { r.shipDefId = 'ship_kestrel'; },
    role: r => { r.itinerary.role = 'receiver'; },
    itinerary: r => { r.itinerary = null; },
    center: r => { r.itinerary.center.x = Infinity; },
    manifest: r => { r.cargoManifest = null; },
    total: r => { r.cargoManifest.totalQty = Infinity; },
    overCapacity: r => { r.cargoManifest.totalQty = r.cargoManifest.lines[0].qty = 13; },
    inconsistent: r => { r.cargoManifest.totalQty = 3; },
    negativeLine: r => { r.cargoManifest.lines[0].qty = -4; },
    malformedLine: r => { r.cargoManifest.lines = [null]; },
    commodity: r => { r.cargoManifest.lines[0].commodityId = 'other'; },
  })) assertRefusedThenRepaired((state, row) => mutate(state.world.records.byId[row.data.worldRecordId]), label);
});

test('modern shelf fields remain authoritative while a legacy neighbour recovers', () => {
  const sim = setup();
  try {
    const collector = sim.state.world.farActors.byId.get(rowFor('collector').id);
    const durable = sim.state.world.records.byId[collector.data.worldRecordId];
    collector.data.itinerary = { ...roundTrip(durable.itinerary), phase: 'collect', sequence: 7 };
    collector.data.cargoManifest = { ...roundTrip(durable.cargoManifest), totalQty: 2,
      lines: durable.cargoManifest.lines.map(line => ({ ...line, qty: 2 })) };
    const savedData = roundTrip(collector.data);
    const entity = promoteFarActor(sim.state, collector.id, sim.helpers);
    assert.deepEqual(entity.data.itinerary, savedData.itinerary);
    assert.deepEqual(entity.data.cargoManifest, savedData.cargoManifest);
    const receiver = rowFor('receiver');
    assertRecovered(promoteFarActor(sim.state, receiver.id, sim.helpers),
      sim.state.world.records.byId[receiver.data.worldRecordId]);
  } finally { sim.dispose(); }
});

test('a modern itinerary with missing cargo recovers only the missing manifest', () => {
  const sim = setup();
  try {
    const row = sim.state.world.farActors.byId.get(rowFor('collector').id);
    const record = sim.state.world.records.byId[row.data.worldRecordId];
    row.data.itinerary = { ...roundTrip(record.itinerary), sequence: 7 };
    const entity = promoteFarActor(sim.state, row.id, sim.helpers);
    assert.equal(entity.data.itinerary.sequence, 7);
    assert.deepEqual(entity.data.cargoManifest, record.cargoManifest);
  } finally { sim.dispose(); }
});

test('production worker spawn transport delivers the recovered itinerary and cargo to the main thread', async () => {
  const { createSimHost } = await import('../scripts/lib/simWorkerHost.mjs');
  const { createReadModel, applySpawnInfos } = await import('../scripts/lib/simReadModel.mjs');
  const lane = createSimHost();
  try {
    const init = await lane.init({ profile: 'production', seed: fixture.seed,
      scenarioContract: JSON.parse(readFileSync(new URL('../src/data/scenarios/47a.scenario.json', import.meta.url), 'utf8')) });
    const { state, sim } = lane.host;
    restore(state);
    for (const row of fixture.farActors.rows) promoteFarActor(state, row.id, sim.helpers);
    const reply = structuredClone(await lane.tick({ tick: 1, steps: 0, ackEnd: init.journalSequence }));
    const main = createReadModel();
    applySpawnInfos(main, reply.spawnInfos);
    for (const row of fixture.farActors.rows) {
      const shown = main.entities.get(row.id), record = state.world.records.byId[row.data.worldRecordId];
      assert.ok(shown, 'the real host publishes the promoted worker');
      assert.deepEqual(shown.data.itinerary, record.itinerary);
      assert.deepEqual(shown.data.cargoManifest, record.cargoManifest);
    }
  } finally { lane.shutdown(); }
});
