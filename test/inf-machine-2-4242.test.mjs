// Fingerprint: spare / sealed growth / sector_veil_nebula / ecology
// Seed 4242. The containment core stays live; only the seal annulus is dead.
import test from 'node:test';
import assert from 'node:assert/strict';
import { suppressionFieldAt, MACHINE_SITES } from '../src/data/precursorMachines.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

test('the veil containment core does not suppress the sealed growth', () => {
  const state = { meta: { seed: 4242 }, world: { currentSectorId: 'sector_veil_nebula' } };
  const site = MACHINE_SITES.veil_containment_ring;
  assert.equal(site.sectorId, state.world.currentSectorId);
  assert.ok(site.suppression.inner > 0 && site.suppression.inner < site.suppression.radius);
  const origin = sectorGlobalOrigin(site.sectorId);
  const localHole = suppressionFieldAt(site.sectorId, site.center.x, site.center.z);
  const globalHole = suppressionFieldAt(
    site.sectorId, site.center.x + origin.x, site.center.z + origin.z,
  );
  assert.equal(localHole, null);
  assert.equal(globalHole, null);
  const band = site.suppression.inner + 60;
  assert.ok(band < site.suppression.radius);
  assert.equal(
    suppressionFieldAt(site.sectorId, site.center.x + band, site.center.z).siteId,
    site.siteId,
  );
  assert.equal(
    suppressionFieldAt(site.sectorId, site.center.x + origin.x + band, site.center.z + origin.z).siteId,
    site.siteId,
  );
});
