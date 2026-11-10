import test from 'node:test';
import assert from 'node:assert/strict';

import { latestLossLine } from '../src/systems/lossLedger.js';

function book(sectorId, sectorName, entry) {
  return {
    meta: { seed: 4242 },
    world: { sectors: { [sectorId]: { name: sectorName } } },
    lossLedger: { bySector: { [sectorId]: [entry] }, entries: [entry], seed: 4242 },
  };
}

test('a loss headline names the house that lost the hull, seed 4242', () => {
  const helix = book('sector_dione_lane', 'Dione Lane', {
    factionId: 'faction_helix', kind: 'ship', t: 80,
  });
  assert.equal(
    latestLossLine(helix, 'sector_dione_lane'),
    'A Helix ship went dark near Dione Lane.',
  );

  const archive = book('sector_pallas_drift', 'Pallas Drift', {
    factionId: 'faction_archive', kind: 'outpost', t: 80,
  });
  assert.equal(
    latestLossLine(archive, 'sector_pallas_drift'),
    'An Archive outpost was raided near Pallas Drift.',
  );

  const quiet = book('sector_nyx_march', 'Nyx March', {
    factionId: 'faction_quiet', kind: 'ship', t: 80,
  });
  assert.equal(
    latestLossLine(quiet, 'sector_nyx_march'),
    'A Quiet ship went dark near Nyx March.',
  );

  const drift = book('sector_ceres_belt', 'Ceres Belt', {
    factionId: 'faction_drift', kind: 'trader', t: 80,
  });
  assert.equal(
    latestLossLine(drift, 'sector_ceres_belt'),
    'A Drift hauler went dark near Ceres Belt.',
  );

  const unknown = book('sector_dione_lane', 'Dione Lane', {
    factionId: 'faction_nobody', kind: 'ship', t: 80,
  });
  assert.equal(
    latestLossLine(unknown, 'sector_dione_lane'),
    'A ship went dark near Dione Lane.',
  );
});
