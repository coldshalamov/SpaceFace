import test from 'node:test';
import assert from 'node:assert/strict';

import { SECTORS } from '../src/data/sectors.js';
import { UNIQUE_WRECKS } from '../src/data/uniqueWrecks.js';
import {
  explorationDiscoveryPlates,
  galaxyExplorationSummary,
} from '../src/world/explorationJournal.js';

test('explorationDiscoveryPlates includes authoritatively fixed and salvaged unique wrecks', () => {
  const state = {
    simTime: 300,
    player: {
      uniqueWrecks: {
        bearings: {
          wreck_isc_vigilant: {
            wreckId: 'wreck_isc_vigilant',
            name: 'ISC Vigilant',
            sectorId: 'sector_veil_nebula',
            phase: 'fixed',
            fixedAtS: 120,
            heardAtS: 40,
          },
          wreck_choir_tender: {
            wreckId: 'wreck_choir_tender',
            name: 'Relief-Freighter Choir-Tender',
            sectorId: 'sector_helios_prime',
            phase: 'salvaged',
            choiceId: 'claim_hardware',
            outcome: 'claimed',
            fixedAtS: 80,
            salvagedAtS: 250,
          },
        },
        receipts: [
          { type: 'claim', wreckId: 'wreck_choir_tender', t: 250 },
        ],
      },
    },
    world: {
      discovery: {},
    },
  };

  const plates = explorationDiscoveryPlates(state);
  assert.equal(plates.length, 2);

  // Sorted by completedAt descending: Choir-Tender (250) then Vigilant (120)
  const tenderPlate = plates[0];
  assert.equal(tenderPlate.id, 'unique_wreck:wreck_choir_tender');
  assert.equal(tenderPlate.title, 'Relief-Freighter Choir-Tender');
  assert.equal(tenderPlate.sectorId, 'sector_helios_prime');
  assert.match(tenderPlate.meta, /Helios Prime · HISTORIC WRECK CLAIMED/);
  assert.match(tenderPlate.body, /Choir-Tender repair swarm and relief cargo entered your manifest/);
  assert.match(tenderPlate.body, /loss_choir_tender/);
  assert.match(tenderPlate.note, /CHOIR-TENDER RECOVERED/);
  assert.equal(tenderPlate.completedAt, 250);

  const vigilantPlate = plates[1];
  assert.equal(vigilantPlate.id, 'unique_wreck:wreck_isc_vigilant');
  assert.equal(vigilantPlate.title, 'ISC Vigilant');
  assert.equal(vigilantPlate.sectorId, 'sector_veil_nebula');
  assert.match(vigilantPlate.meta, /Veil Nebula · PHYSICALLY LOCATED/);
  assert.match(vigilantPlate.body, /Survey lock established at Veil nebula core/);
  assert.match(vigilantPlate.body, /ISC VIGILANT/);
  assert.equal(vigilantPlate.completedAt, 120);
});

test('galaxyExplorationSummary counts salvaged unique wrecks toward trophies', () => {
  const stateNoWrecks = {
    world: { discovery: {} },
  };
  const summaryEmpty = galaxyExplorationSummary(stateNoWrecks);
  assert.equal(summaryEmpty.trophies, 0);

  const stateWithWrecks = {
    player: {
      uniqueWrecks: {
        bearings: {
          wreck_isc_vigilant: {
            wreckId: 'wreck_isc_vigilant',
            phase: 'salvaged',
            outcome: 'claimed',
          },
          wreck_dmc_ironsong: {
            wreckId: 'wreck_dmc_ironsong',
            phase: 'salvaged',
            outcome: 'handed_over',
          },
          wreck_choir_tender: {
            wreckId: 'wreck_choir_tender',
            phase: 'fixed', // Not salvaged yet
          },
        },
      },
    },
    world: { discovery: {} },
  };

  const summary = galaxyExplorationSummary(stateWithWrecks);
  assert.equal(summary.trophies, 2, 'Exactly the 2 salvaged wrecks should count as trophies');
});

test('authored sector POIs carry rich discovery plates', () => {
  const helios = SECTORS.find((s) => s.id === 'sector_helios_prime');
  assert.ok(helios);

  const locker = helios.pois.find((p) => p.id === 'poi_helios_locker');
  assert.ok(locker, 'Bonded Cold Locker exists');
  assert.ok(locker.discoveryPlate, 'Bonded Cold Locker has discoveryPlate');
  assert.equal(locker.discoveryPlate.title, 'Bonded Cold Locker');
  assert.match(locker.discoveryPlate.body, /pressurized ore-sample locker/);

  const yard = helios.pois.find((p) => p.id === 'poi_helios_yard');
  assert.ok(yard, 'Outer Yard Derelict exists');
  assert.ok(yard.discoveryPlate, 'Outer Yard Derelict has discoveryPlate');
  assert.equal(yard.discoveryPlate.title, 'Outer Yard Decommission Frame');
  assert.match(yard.discoveryPlate.body, /early transport berth/);

  const haumea = SECTORS.find((s) => s.id === 'sector_haumea_rift');
  assert.ok(haumea);
  const fissure = haumea.pois.find((p) => p.id === 'poi_haumea_fissure');
  assert.ok(fissure, 'Haumea fissure exists');
  assert.ok(fissure.discoveryPlate, 'Haumea fissure has discoveryPlate');
  assert.equal(fissure.discoveryPlate.title, 'Haumea Ice Fissure Signal');
  assert.match(fissure.discoveryPlate.body, /deep thermal rift/);
});
