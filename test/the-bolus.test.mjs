import test from 'node:test';
import assert from 'node:assert/strict';
import { SECTORS } from '../src/data/sectors.js';
import { zonesForSector } from '../src/data/sectorZones.js';
import { differingPhysical } from '../src/data/sectorPhysical.js';
import {
  BOLUS_SECTOR_ID,
  planBolusLayout,
  bolusInCone,
  bolusIrisOpen,
  commitBolusLatch,
  bolusResolvedSpec,
} from '../src/data/theBolus.js';

const bolus = SECTORS.find((sector) => sector.id === BOLUS_SECTOR_ID);
const byId = new Map(SECTORS.map((sector) => [sector.id, sector]));

test('the Bolus is a real interior sector linked to Charon and Ashfall', () => {
  assert.ok(bolus, 'sector card is live');
  assert.equal(bolus.interiorHost, true);
  assert.equal(bolus.enemyDensity, 0);
  assert.equal(bolus.trafficPerMin, 0);
  assert.equal(bolus.worldRadius, 3200);
  assert.deepEqual(bolus.position, { x: 2, y: 10 });
  assert.deepEqual(bolus.neighbors, ['sector_charon_expanse', 'sector_ashfall_reach']);
  assert.ok(byId.get('sector_charon_expanse').neighbors.includes(BOLUS_SECTOR_ID));
  assert.ok(byId.get('sector_ashfall_reach').neighbors.includes(BOLUS_SECTOR_ID));
  const mouth = bolus.gates.find((gate) => gate.to === 'sector_charon_expanse');
  const cough = bolus.gates.find((gate) => gate.to === 'sector_ashfall_reach');
  assert.deepEqual(mouth.pos, { x: 0, z: -2624 });
  assert.deepEqual(cough.pos, { x: 2347, z: 1173 });
  const charon = byId.get('sector_charon_expanse');
  const ashfall = byId.get('sector_ashfall_reach');
  assert.deepEqual(charon.gates.find((gate) => gate.to === BOLUS_SECTOR_ID).pos, { x: 0, z: 3936 });
  assert.deepEqual(ashfall.gates.find((gate) => gate.to === BOLUS_SECTOR_ID).pos, { x: -4034, z: -2017 });
});

test('layout is deterministic, seeded, and fully populated', () => {
  const a = planBolusLayout(7);
  const b = planBolusLayout(7);
  const c = planBolusLayout(8);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map((row) => row.mass), c.map((row) => row.mass));
  assert.ok(a.length >= 70, `expected a full throat, got ${a.length}`);
  const roles = new Set(a.map((row) => row.role));
  for (const role of ['knob', 'tendon', 'tooth', 'tendril', 'louse', 'drum', 'valve', 'nerve', 'bezoar', 'floater', 'blister', 'hush', 'pleat', 'crook']) {
    assert.ok(roles.has(role), role);
  }
  assert.equal(a.filter((row) => row.role === 'knob').length, 14);
  assert.equal(a.filter((row) => row.dynamic && row.mass < 1800).length > 0, true);
  assert.ok(a.filter((row) => !row.dynamic).every((row) => row.mass >= 1800));
});

test('cone, iris, sample-once, and suture follow the room rules', () => {
  assert.equal(bolusInCone(0, 0, 0, 100, 0), true);
  assert.equal(bolusInCone(0, 0, 0, -50, 0), false);
  assert.equal(bolusInCone(0, 0, 0, 20, 80), false);
  assert.equal(bolusIrisOpen(0), false);
  assert.equal(bolusIrisOpen(3), true);
  assert.equal(bolusIrisOpen(8), false);
  const flags = {};
  const first = commitBolusLatch(flags, 'nerve', 'bolus_nerve', 3, 10);
  const second = commitBolusLatch(flags, 'nerve', 'bolus_nerve', 3, 20);
  assert.equal(first.cargo, 'cmdty_live_specimen');
  assert.equal(flags['bolus:sampled'], true);
  assert.equal(second, null);
  commitBolusLatch(flags, 'valve', 'bolus_valve_0', 1.2, 4);
  const valve = planBolusLayout(1).find((row) => row.key === 'bolus_valve_0');
  const sutured = bolusResolvedSpec(valve, flags);
  assert.equal(sutured.speciesId, 'bolus_suture');
  assert.equal(sutured.role, 'suture');
});

test('physical row, zones, and station are the throat and not a pirate belt', () => {
  assert.deepEqual(differingPhysical(BOLUS_SECTOR_ID), ['patrolResponse']);
  const zones = zonesForSector(BOLUS_SECTOR_ID);
  assert.equal(zones.length, 3);
  assert.ok(zones.every((zone) => zone.presence == null));
  assert.equal(bolus.stations[0].id, 'station_bolus_rib');
  assert.ok(bolus.stations[0].services.includes('repair'));
  assert.equal(bolus.palette.fogDensity, 0.0022);
});
