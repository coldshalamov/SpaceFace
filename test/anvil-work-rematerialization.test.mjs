import test from 'node:test';
import assert from 'node:assert/strict';
import { captureEntityRecord, spawnSpecFromRecord, RECORD_KIND } from '../src/world/worldRecords.js';
import { makeShipEntitySpec } from '../src/systems/ships.js';
import { PLANET_SITE } from '../src/data/planets.js';

function recordedWorker(role) {
  const canonical = makeShipEntitySpec('ship_mule', {
    team: 2, factionId: 'faction_mts', pos: { x: 14000, z: 6000 }, rot: 0.4,
    ai: { passive: true, archetype: 'passive' },
  });
  const entity = { ...canonical, id: 21, alive: true, vel: { x: 3, z: 8 }, angVel: 0.02,
    hull: 83, shield: 23, armorHp: 5,
    data: { ...canonical.data, worldRecordId: `anvil-restore-${role}`, named: true,
      itinerary: { kind: 'anvil_work', role, phase: role === 'collector' ? 'return' : 'receiving',
        sequence: 2, center: { x: 12000, z: 6000 }, deliveredQty: 4 },
      cargoManifest: { totalQty: 4, lines: [{ commodityId: PLANET_SITE.harvest.commodityShallow, qty: 4 }] } } };
  const record = captureEntityRecord(entity, { sectorId: PLANET_SITE.sectorId, kind: RECORD_KIND.CONVOY, tick: 720 });
  assert.ok(record);
  return { canonical, record };
}

for (const role of ['collector', 'receiver']) test(`restored Anvil ${role} keeps canonical Mule drive and physical dimensions`, () => {
  const { canonical, record } = recordedWorker(role);
  const spec = spawnSpecFromRecord(JSON.parse(JSON.stringify(record)));
  assert.equal(spec.mass, canonical.mass);
  assert.equal(spec.radius, canonical.radius);
  assert.equal(spec.flightClass, canonical.flightClass);
  assert.deepEqual(spec.flightModel, canonical.flightModel);
  assert.deepEqual(spec.propulsion, canonical.propulsion);
  assert.deepEqual(spec.data.derived, canonical.data.derived);
  assert.deepEqual(spec.data.weapons, []);
  assert.deepEqual(spec.data.fittings, canonical.data.fittings);
  assert.ok(spec.data.fittings.every(slot => slot === null));
});

for (const role of ['collector', 'receiver']) test(`Anvil ${role} hardware reconstruction preserves damage, motion and finite manifest`, () => {
  const { record } = recordedWorker(role);
  const before = JSON.stringify(record), spec = spawnSpecFromRecord(record);
  assert.equal(JSON.stringify(record), before);
  for (const key of ['pos', 'vel', 'rot', 'angVel', 'hull', 'hullMax', 'shield', 'shieldMax', 'armorHp', 'armorMax'])
    assert.deepEqual(spec[key], record[key], key);
  assert.deepEqual(spec.data.itinerary, record.itinerary);
  assert.deepEqual(spec.data.cargoManifest, record.cargoManifest);
  assert.equal(spec.data.worldRecordId, record.recordId);
});

test('Anvil hardware selection leaves unrelated durable ships on their existing shell path', () => {
  for (const change of [
    r => { r.itinerary.kind = 'ordinary_convoy'; },
    r => { r.itinerary.role = 'other'; },
    r => { r.sectorId = 'sector_ceres_orbit'; },
    r => { r.shipDefId = 'ship_kestrel'; },
    r => { r.kind = RECORD_KIND.NPC; },
  ]) {
    const { record } = recordedWorker('collector'); change(record);
    const spec = spawnSpecFromRecord(record);
    assert.equal(spec.mass, 20);
    assert.equal(spec.radius, 8);
    assert.equal(spec.propulsion, undefined);
  }
});

test('terminal Anvil records stay terminal during hardware reconstruction', () => {
  const { record } = recordedWorker('collector');
  record.alive = false; record.outcome = 'destroyed';
  assert.equal(spawnSpecFromRecord(record), null);
});
