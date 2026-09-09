import test from 'node:test';
import assert from 'node:assert/strict';

import { ONE_LOAD_CARGO_TYPES } from '../src/data/missions.js';
import { missions } from '../src/systems/missions.js';
import { missionPreflight } from '../src/ui/missionPreflight.js';
import {
  missionDossierHtml,
  missionDossierReadiness,
} from '../src/ui/station/screens/contracts.js';

function makeState({ capVolume = 12, usedVolume = 0 } = {}) {
  return {
    simTime: 0,
    playerId: 1,
    player: {
      credits: 10_000,
      cargo: { items: {}, usedVolume, usedMass: 0, capVolume, capMass: 100 },
    },
    missions: {
      active: [],
      config: { maxActive: 8, cruiseSpeedRef: 140 },
    },
    world: { currentSectorId: 'sector_helios_prime' },
    ui: { dockedStationId: 'station_helios' },
    entities: new Map(),
  };
}

function makeOffer(type, overrides = {}) {
  return {
    id: `parity_${type}`,
    type,
    params: { cmdtyId: 'cmdty_gas_hydrogen', qty: 2 },
    reward_cr: 900,
    collateral_cr: 400,
    riskTier: 1,
    destStationId: 'station_beltout',
    destSectorId: 'sector_ceres_belt',
    distance: 1200,
    title: `${type} parity offer`,
    ...overrides,
  };
}

test('station dossier and live accept preflight share the one-load free-hold gate', () => {
  const previousState = missions.state;
  try {
    assert.deepEqual(
      [...ONE_LOAD_CARGO_TYPES].sort(),
      ['cargo_delivery', 'salvage_retrieval', 'smuggling_run'],
    );

    for (const type of ONE_LOAD_CARGO_TYPES) {
      const state = makeState({ capVolume: 8, usedVolume: 6 });
      const offer = makeOffer(type);
      missions.state = state;

      const simPreflight = missions._acceptPreflight(offer);
      const sharedPreflight = missionPreflight(offer, state);
      const dossier = missionDossierReadiness(offer, state);

      assert.equal(simPreflight.ok, false, `${type} must fail the live free-hold gate`);
      assert.equal(sharedPreflight.blocker, simPreflight.reason, `${type} blocker wording must match the sim`);
      assert.equal(dossier.state, 'blocked', `${type} dossier must show BLOCKED`);
      assert.equal(dossier.canAccept, false, `${type} dossier must disable accept`);
      assert.equal(dossier.detail, simPreflight.reason, `${type} dossier must expose the live reason`);
    }
  } finally {
    missions.state = previousState;
  }
});

test('ordinary readiness warnings remain actionable when the live accept gate passes', () => {
  const previousState = missions.state;
  try {
    const state = makeState({ capVolume: 12, usedVolume: 0 });
    const offer = makeOffer('cargo_delivery', {
      id: 'parity_route_warning',
      destStationId: 'station_sker',
      destSectorId: 'sector_sker_haven',
      distance: 3500,
    });
    missions.state = state;

    const simPreflight = missions._acceptPreflight(offer);
    const sharedPreflight = missionPreflight(offer, state);
    const dossier = missionDossierReadiness(offer, state);

    assert.equal(simPreflight.ok, true);
    assert.equal(sharedPreflight.blocker, null);
    assert.match(sharedPreflight.warning || '', /route risk/i);
    assert.equal(dossier.state, 'caution');
    assert.equal(dossier.canAccept, true, 'a warning must not disable an otherwise valid accept');
  } finally {
    missions.state = previousState;
  }
});

test('first-trade cargo and route details use canonical footprint and route scope', () => {
  const state = makeState({ capVolume: 80 });
  const offer = makeOffer('cargo_delivery', {
    id: 'first_trade_fixture',
    factionId: 'faction_scn',
    reward_cr: 420,
    collateral_cr: 0,
    riskTier: 0,
    destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt',
    distance: 1800,
    title: 'First trade: 8u Fuel Cells to Ceres',
    params: { cmdtyId: 'cmdty_fuel_cells', qty: 8 },
    cargo: { cmdtyId: 'cmdty_fuel_cells', qty: 8, label: 'Fuel Cells' },
  });

  const html = missionDossierHtml(offer, state);
  assert.match(html, /Payload/, 'the dossier must show the first-trade manifest');
  assert.match(html, /Fuel Cells/, 'the dossier must resolve the cargo cmdtyId');
  assert.match(html, /Jump route: Ceres Belt/, 'the dossier must show shared route scope');
  assert.doesNotMatch(html, />in-sector</, 'the first-trade route must not fall back to in-sector');
});
