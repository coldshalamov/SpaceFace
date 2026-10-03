import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SECTOR_PHYSICAL,
  HELIOS_SECTOR_ID,
  differingPhysical,
  sectorPhysical,
  asteroidMass,
  scaleBySector,
} from '../src/data/sectorPhysical.js';
import {
  SECTOR_COMPOSITIONS,
  sectorCompositionFor,
} from '../src/data/sectorCompositions.js';

describe('FB-032 — Seventeen frontier sectors stop inheriting Helios physics & arrangement', () => {
  const TOTAL_SECTORS = 24;

  it('SECTOR_PHYSICAL contains 24 sectors with frozen immutable rows', () => {
    const keys = Object.keys(SECTOR_PHYSICAL);
    assert.equal(keys.length, TOTAL_SECTORS, 'all 24 sectors present in SECTOR_PHYSICAL');
    for (const key of keys) {
      const row = SECTOR_PHYSICAL[key];
      assert.ok(Object.isFrozen(row), `${key} row is frozen`);
      assert.ok(Number.isFinite(row.rockMass) && row.rockMass > 0, `${key} rockMass > 0`);
      assert.ok(Number.isFinite(row.trafficSpeed) && row.trafficSpeed > 0, `${key} trafficSpeed > 0`);
      assert.ok(Number.isFinite(row.gravity) && row.gravity > 0, `${key} gravity > 0`);
      assert.ok(Number.isFinite(row.patrolResponse) && row.patrolResponse > 0, `${key} patrolResponse > 0`);
    }
  });

  it('SECTOR_COMPOSITIONS contains 24 sectors with non-null composition objects', () => {
    const keys = Object.keys(SECTOR_COMPOSITIONS);
    assert.equal(keys.length, TOTAL_SECTORS, 'all 24 sectors present in SECTOR_COMPOSITIONS');
    for (const key of keys) {
      const comp = sectorCompositionFor(key);
      assert.ok(comp, `composition found for ${key}`);
      assert.ok(typeof comp.name === 'string' && comp.name.length > 0, `${key} has a name`);
      assert.ok(typeof comp.intent === 'string' && comp.intent.length > 0, `${key} has intent`);
      assert.ok(typeof comp.motif === 'string' && comp.motif.length > 0, `${key} has motif`);
      assert.ok(typeof comp.fields === 'object' && comp.fields !== null, `${key} has fields object`);
    }
  });

  it('every non-Helios sector differs from Helios by exactly one physical ratio', () => {
    assert.deepEqual(differingPhysical(HELIOS_SECTOR_ID), [], 'Helios has 0 differing ratios from itself');

    const keys = Object.keys(SECTOR_PHYSICAL);
    for (const id of keys) {
      if (id === HELIOS_SECTOR_ID) continue;
      const diff = differingPhysical(id);
      assert.equal(diff.length, 1, `${id} must differ from Helios by exactly 1 physical ratio, got: [${diff.join(', ')}]`);
      const changedKey = diff[0];
      const ratio = sectorPhysical(id)[changedKey];
      assert.notEqual(ratio, 1, `${id}.${changedKey} must not equal 1`);
    }
  });

  it('scales simulation properties correctly using scaleBySector and asteroidMass', () => {
    const vestaMass = asteroidMass('sector_vesta_forge', 10);
    const heliosMass = asteroidMass('sector_helios_prime', 10);
    assert.equal(vestaMass, heliosMass * 2.2, 'Vesta asteroid mass scales by 2.2');

    const ceresPatrol = scaleBySector('sector_ceres_belt', 'patrolResponse', 100);
    assert.equal(ceresPatrol, 160, 'Ceres patrol response scales by 1.6');
  });
});
