import test from 'node:test';
import assert from 'node:assert/strict';
import { getRegionalEcologyProfile } from '../src/data/regionalEcology.js';

const SEED = 4242;

test('4242: Helios reports the Memorial Array anomaly instead of a clear hazard line', () => {
  const state = { meta: { seed: SEED }, world: { currentSectorId: 'sector_helios_prime' } };
  const helios = getRegionalEcologyProfile(state.world.currentSectorId);
  const ceres = getRegionalEcologyProfile('sector_ceres_belt');
  assert.equal(state.meta.seed, SEED);
  assert.equal(helios.familyId, 'civic_core');
  assert.ok(helios.hazards.types.includes('anomaly'));
  assert.equal(helios.familyId, 'civic_core');
  assert.ok(ceres.hazards.types.includes('dense_asteroid'));
  assert.equal(ceres.familyId, 'industrial_belt');
  assert.equal(getRegionalEcologyProfile('sector_tethys_junction').familyId, 'salvage_frontier');
});
