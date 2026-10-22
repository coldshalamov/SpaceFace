// Fingerprint: scatter / corridor swarm / sector_veil_nebula / suppression
// Seed 4242. The null corridor's dead pocket must answer where fauna actually fly.
import test from 'node:test';
import assert from 'node:assert/strict';
import { suppressionFieldAt, MACHINE_SITES } from '../src/data/precursorMachines.js';
import { sectorGlobalOrigin } from '../src/data/sectorCoordinates.js';

test('the veil null corridor suppresses fauna at their galactic position', () => {
  const state = { meta: { seed: 4242 }, world: { currentSectorId: 'sector_veil_nebula' } };
  const site = MACHINE_SITES.veil_null_corridor;
  assert.equal(state.world.currentSectorId, site.sectorId);
  const origin = sectorGlobalOrigin(site.sectorId);
  assert.ok(Math.hypot(origin.x, origin.z) > site.suppression.radius);
  const gx = site.center.x + origin.x;
  const gz = site.center.z + origin.z;
  const hit = suppressionFieldAt(state.world.currentSectorId, gx, gz);
  assert.equal(hit && hit.siteId, site.siteId);
  assert.equal(
    suppressionFieldAt(state.world.currentSectorId, site.center.x, site.center.z).siteId,
    site.siteId,
  );
  assert.equal(
    suppressionFieldAt(state.world.currentSectorId, gx + site.suppression.radius + 40, gz),
    null,
  );
});
