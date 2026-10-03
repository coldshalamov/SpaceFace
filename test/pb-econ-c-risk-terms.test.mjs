// PB-ECON-C (row 108) — SF-112/113: a contract's premium names the real complication it prices.
// Smuggling runs into a weir sector name the customs line; elevated-risk destinations name the
// sector's own thin patrol cover; quiet destinations carry no note. The dossier prints the note
// beside the risk band so the premium reads as attributable, not arbitrary.
import test from 'node:test';
import assert from 'node:assert/strict';

import { missions as missionsProto } from '../src/systems/missions.js';
import { missionDossierHtml } from '../src/ui/station/screens/contracts.js';
import { SECTORS } from '../src/data/sectors.js';

const riskNote = (typeId, destSectorId, sectorRisk) =>
  missionsProto._riskNoteFor(typeId, destSectorId, sectorRisk);

test('PB-ECON-C: a smuggling lane into a weir sector names the customs line', () => {
  const note = riskNote('smuggling_run', 'sector_tethys_junction', 2);
  assert.ok(note, 'the weir crossing produces a note');
  assert.match(note, /customs weir/i);
  assert.match(note, /Tethys Junction/);
});

test('PB-ECON-C: an elevated-risk destination names its own thin cover', () => {
  const scar = SECTORS.find((s) => s.id === 'sector_kepler_scar');
  assert.ok(scar, 'fixture sector exists');
  const tier = Math.round((1 - scar.security) * 5);
  const note = riskNote('cargo_delivery', 'sector_kepler_scar', tier);
  assert.ok(note, 'a dangerous destination produces a note');
  assert.match(note, /Kepler Scar/);
});

test('PB-ECON-C: a quiet destination gets no invented threat', () => {
  assert.equal(riskNote('cargo_delivery', 'sector_helios_prime', 0), null);
  assert.equal(riskNote('escort', 'sector_helios_prime', 1), null);
});

test('PB-ECON-C: the dossier prints the named cause beside the risk band', () => {
  const mission = {
    id: 'm1', type: 'smuggling_run', title: 'Smuggle 6u exotics to Scar Bazaar',
    factionId: 'faction_scn', stationId: 'station_helios', destStationId: 'station_kepler_scar',
    destSectorId: 'sector_tethys_junction', reward_cr: 4000, riskTier: 3, collateral_cr: 400,
    riskNote: 'the Tethys Junction customs weir scans this lane',
    params: { cmdtyId: 'cmdty_ore_iron', qty: 6 },
    clauses: [],
  };
  const state = {
    player: { credits: 0, cargo: { items: {} } },
    missions: { active: [] },
    factions: {}, world: {}, ui: {},
  };
  const html = missionDossierHtml(mission, state);
  assert.match(html, /customs weir scans this lane/, 'the named threat reaches the dossier');
});

test('PB-ECON-C: a contract without a priced complication keeps the plain risk sentence', () => {
  const mission = {
    id: 'm2', type: 'cargo_delivery', title: 'Haul 4u ore to Ceres',
    factionId: 'faction_scn', stationId: 'station_helios', destStationId: 'station_ceres',
    destSectorId: 'sector_ceres_belt', reward_cr: 1000, riskTier: 0,
    params: { cmdtyId: 'cmdty_ore_iron', qty: 4 },
    clauses: [],
  };
  const state = {
    player: { credits: 0, cargo: { items: {} } },
    missions: { active: [] },
    factions: {}, world: {}, ui: {},
  };
  const html = missionDossierHtml(mission, state);
  assert.match(html, /risk\./, 'the plain sentence ends after the tier word');
  assert.doesNotMatch(html, /customs weir|lawless|contested|patrol-thin/);
});
