import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { traffic } from '../src/systems/traffic.js';
import { fields } from '../src/systems/fields.js';
import { planetRuntime } from '../src/systems/planetRuntime.js';
import { spawnBudget } from '../src/systems/spawnBudget.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { world } from '../src/systems/world.js';
import { anvilWorkerRecordId } from '../src/systems/anvilWork.js';
import { insertFarActor, promoteFarActor, getFarActor } from '../src/world/farActorTable.js';
import { normalizeRecord } from '../src/world/worldRecords.js';
import { PLANET_FLAGS, PLANET_SITE } from '../src/data/planets.js';
import { FIELD_FLAGS } from '../src/data/fields.js';

// Controlled residency/custody contract tests. Their setup mutations do not constitute
// flown gameplay, native restoration, production Continue or whole-game acceptance.
const records = { name: 'world', init({ state }) { this.state = state; },
  upsertWorldRecord: world.upsertWorldRecord };
const trafficWork = { ...traffic, update(dt, state) { this._stepAnvilWork(dt, state); } };
function fixture() {
  const previous = [PLANET_FLAGS.enabled, FIELD_FLAGS.enabled];
  PLANET_FLAGS.enabled = true; FIELD_FLAGS.enabled = true;
  const sim = createSimulation({ seed: 424214,
    systems: [spawnBudget, records, trafficWork, fields, planetRuntime] });
  const state = sim.state;
  state.mode = 'flight'; state.world.currentSectorId = PLANET_SITE.sectorId;
  sim.step();
  const collector = state.entities.get(state.planet.witnessId);
  const receiver = state.entityList.find(e => e.data?.worldRecordId === anvilWorkerRecordId(state, 'receiver'));
  assert.ok(collector && receiver);
  return { sim, state, collector, receiver, owner: sim.registry.get('traffic'),
    close() { sim.dispose(); [PLANET_FLAGS.enabled, FIELD_FLAGS.enabled] = previous; } };
}
function shelf(t, entity) {
  const row = insertFarActor(t.state, entity, t.state.simTime, t.sim.helpers);
  t.sim.helpers.removeEntity(entity.id, { immediate: true, reason: 'virtualize' });
  t.sim.bus.flush(); // production's end-of-tick lifecycle drain releases the exact budget slot
  assert.equal(t.state.entities.has(entity.id), false);
  return row;
}

test('a healthy retained tender remains a flight waypoint without permitting remote custody transfer', () => {
  const t = fixture();
  try {
    const recordId = t.receiver.data.worldRecordId;
    shelf(t, t.receiver);
    const before = structuredClone(t.state.world.records.byId[recordId]);
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.collector.data.intent.brake, false);
    assert.ok(t.collector.data.intent.moveZ > 0);
    assert.equal(t.owner._transferAnvilLoad(t.collector, t.receiver), 0);
    assert.deepEqual(structuredClone(t.state.world.records.byId[recordId]), before);
    assert.equal(t.collector.data.itinerary.phase, 'outbound');
    t.collector.data.itinerary.phase = 'return';
    t.collector.pos.x = before.pos.x; t.collector.pos.z = before.pos.z;
    t.collector.vel.x = 0; t.collector.vel.z = 0;
    t.owner._stepAnvilWork(1 / 60, t.state);
    assert.equal(t.collector.data.itinerary.phase, 'return', 'a retained waypoint cannot count as physical arrival');
  } finally { t.close(); }
});

test('missing, destroyed, occupied and malformed retained tenders keep the collector stopped', () => {
  const malformedRows = { 'manifest-null': null, 'manifest-number': 42,
    'manifest-string': 'bad row', 'manifest-boolean': true, 'manifest-array': [] };
  for (const invalid of ['missing', 'dead', 'hull', 'busy', 'identity', 'manifest', 'position',
    ...Object.keys(malformedRows)]) {
    const t = fixture();
    try {
      const id = t.receiver.data.worldRecordId;
      shelf(t, t.receiver);
      const rec = t.state.world.records.byId[id];
      if (invalid === 'missing') delete t.state.world.records.byId[id];
      if (invalid === 'dead') rec.alive = false;
      if (invalid === 'hull') rec.hull = 0;
      if (invalid === 'busy') rec.jobId = 'another-owner';
      if (invalid === 'identity') rec.itinerary.role = 'collector';
      if (invalid === 'manifest') rec.cargoManifest.totalQty = 1;
      if (invalid === 'position') rec.pos.x = NaN;
      if (Object.hasOwn(malformedRows, invalid)) {
        rec.cargoManifest.lines = [malformedRows[invalid]];
        // These shapes survive the real save-record normalizer. The traffic owner must
        // refuse them before reading a line's commodity or quantity.
        const normalized = normalizeRecord(JSON.parse(JSON.stringify(rec)), id);
        assert.deepEqual(normalized.cargoManifest.lines, [malformedRows[invalid]]);
        t.state.world.records.byId[id] = normalized;
      }
      t.owner._stepAnvilWork(1 / 60, t.state);
      assert.equal(t.collector.data.intent.brake, true, invalid);
      assert.equal(t.collector.data.intent.moveZ, 0, invalid);
    } finally { t.close(); }
  }
});

for (const role of ['collector', 'receiver']) test(`far promotion preserves ${role} custody, drive, damage and budget refusal`, () => {
  const t = fixture();
  try {
    const e = t[role], budget = t.sim.helpers.spawnBudget, requester = `orchard-test:${role}`;
    assert.equal(budget.request(1, requester), 1); assert.equal(budget.bindEntity(e.id, requester), true);
    e.hull -= 13; e.shield -= 7; e.armorHp = 0; e.cap = 2;
    e.data.cargoManifest.lines = [{ commodityId: PLANET_SITE.harvest.commodityShallow, qty: 4 }];
    e.data.cargoManifest.totalQty = 4;
    e.data.propulsionRuntime = { energySpent: 8, heat: 0.2 };
    t.sim.registry.get('world').upsertWorldRecord(e);
    const before = structuredClone({ itinerary: e.data.itinerary, manifest: e.data.cargoManifest,
      body: e.physicsBody, runtime: e.data.propulsionRuntime, pos: e.pos, vel: e.vel });
    const row = shelf(t, e);
    assert.equal(budget.current(), 0);
    assert.deepEqual(row.data.itinerary, before.itinerary);
    assert.deepEqual(row.data.cargoManifest, before.manifest);
    assert.equal(budget.request(budget.available(), 'other-crews'), budget.max());
    assert.equal(promoteFarActor(t.state, row.id, t.sim.helpers), null);
    assert.equal(getFarActor(t.state, row.id), row);
    assert.equal(budget.current(), budget.max());
    budget.release('other-crews');
    const restored = promoteFarActor(t.state, row.id, t.sim.helpers);
    assert.ok(restored); assert.equal(budget.current(), 1);
    assert.equal(budget.ownerForEntity(restored.id), requester);
    assert.equal(getFarActor(t.state, row.id), null);
    const canonical = makeShipEntitySpec('ship_mule');
    assert.deepEqual(restored.propulsion, canonical.propulsion);
    assert.deepEqual(restored.data.fittings, canonical.data.fittings);
    assert.deepEqual(restored.data.weapons, canonical.data.weapons);
    assert.deepEqual(restored.data.propulsionRuntime, before.runtime);
    assert.deepEqual(restored.data.itinerary, before.itinerary);
    assert.deepEqual(restored.data.cargoManifest, before.manifest);
    assert.deepEqual(structuredClone(restored.pos), before.pos);
    assert.deepEqual(structuredClone(restored.vel), before.vel);
    assert.equal(restored.hull, e.hull); assert.equal(restored.shield, e.shield);
    assert.equal(restored.armorHp, 0); assert.equal(restored.cap, 2);
    assert.deepEqual(restored.physicsBody, before.body);
    const rec = t.sim.registry.get('world').upsertWorldRecord(restored);
    assert.deepEqual(rec.itinerary, before.itinerary); assert.deepEqual(rec.cargoManifest, before.manifest);
    assert.equal(t.state.entityList.filter(x => x.alive !== false && x.data?.worldRecordId === rec.recordId).length, 1);
  } finally { t.close(); }
});
