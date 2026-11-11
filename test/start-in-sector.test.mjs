import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveStartSectorId } from '../src/systems/world.js';
import { SECTORS } from '../src/data/sectors.js';

test('resolveStartSectorId handles canonical sector IDs', () => {
  for (const sector of SECTORS) {
    assert.equal(resolveStartSectorId(sector.id), sector.id);
  }
});

test('resolveStartSectorId handles packet examples', () => {
  assert.equal(resolveStartSectorId('sector_vesta_forge'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('sector_ceres_belt'), 'sector_ceres_belt');
  assert.equal(resolveStartSectorId('tethys'), 'sector_tethys_junction');
  assert.equal(resolveStartSectorId('helios_core'), 'sector_helios_prime');
});

test('resolveStartSectorId handles short names and profile aliases', () => {
  assert.equal(resolveStartSectorId('vesta_forge'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('vesta'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('ceres_belt'), 'sector_ceres_belt');
  assert.equal(resolveStartSectorId('ceres'), 'sector_ceres_belt');
  assert.equal(resolveStartSectorId('pallas_drift'), 'sector_pallas_drift');
  assert.equal(resolveStartSectorId('pallas'), 'sector_pallas_drift');
  assert.equal(resolveStartSectorId('sker_haven'), 'sector_sker_haven');
  assert.equal(resolveStartSectorId('sker'), 'sector_sker_haven');
  assert.equal(resolveStartSectorId('io_reach'), 'sector_io_reach');
  assert.equal(resolveStartSectorId('fringe'), 'sector_io_reach');
  assert.equal(resolveStartSectorId('veil_nebula'), 'sector_veil_nebula');
  assert.equal(resolveStartSectorId('anomaly'), 'sector_veil_nebula');
  assert.equal(resolveStartSectorId('the_bolus'), 'sector_the_bolus');
  assert.equal(resolveStartSectorId('viscera'), 'sector_the_bolus');
  assert.equal(resolveStartSectorId('charon_expanse'), 'sector_charon_expanse');
  assert.equal(resolveStartSectorId('ashfall_reach'), 'sector_ashfall_reach');
});

test('resolveStartSectorId trims whitespace and ignores case', () => {
  assert.equal(resolveStartSectorId('  TETHYS  '), 'sector_tethys_junction');
  assert.equal(resolveStartSectorId('SECTOR_VESTA_FORGE'), 'sector_vesta_forge');
  assert.equal(resolveStartSectorId('\tHelios_Core\n'), 'sector_helios_prime');
});

test('resolveStartSectorId returns null for invalid or missing inputs', () => {
  assert.equal(resolveStartSectorId(''), null);
  assert.equal(resolveStartSectorId('   '), null);
  assert.equal(resolveStartSectorId(null), null);
  assert.equal(resolveStartSectorId(undefined), null);
  assert.equal(resolveStartSectorId(12345), null);
  assert.equal(resolveStartSectorId({}), null);
  assert.equal(resolveStartSectorId('not_a_real_sector'), null);
  assert.equal(resolveStartSectorId('sector_does_not_exist'), null);
});
