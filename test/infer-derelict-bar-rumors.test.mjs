// U6: the bar sells directions — each plated derelict has one authored rumor at its home
// berth, spoken until the pilot's own scan unlocks the plate (the discovery record retires
// the line). New game hears the pointer; met places stop selling it.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createGameState } from '../src/core/gameState.js';
import { generateContacts } from '../src/ui/station/barContacts.js';

const RUMOR_EXPECT = [
  { stationId: 'station_helios', sectorId: 'sector_helios_prime', poiId: 'poi_helios_whistle', word: /horn/i },
  { stationId: 'station_tethys', sectorId: 'sector_tethys_junction', poiId: 'poi_tethys_tally_rack', word: /pending/i },
  { stationId: 'station_forge', sectorId: 'sector_vesta_forge', poiId: 'poi_freighter', word: /Nineteen/i },
  { stationId: 'station_drift', sectorId: 'sector_pallas_drift', poiId: 'poi_pwreck', word: /inside/i },
];

test('a new game hears the derelict rumor at each home berth', () => {
  for (const { stationId, word } of RUMOR_EXPECT) {
    const state = createGameState(4242);
    const contacts = generateContacts(stationId, state);
    const host = contacts.find((c) => c && c.derelictRumorRef);
    assert.ok(host, `${stationId} stamps one rumor contact`);
    assert.match(host.line, word, `${stationId} rumor names its place: ${host.line}`);
    assert.ok(contacts.some((c) => c && c.role === 'barkeep'), 'the berth has a barkeep');
  }
});

test('first contact retires the rumor', () => {
  const { stationId, sectorId, poiId, word } = RUMOR_EXPECT[0];
  const state = createGameState(4242);
  state.world.discovery[sectorId] = { pois: { [poiId]: { t: 10 } } };
  const contacts = generateContacts(stationId, state);
  assert.equal(contacts.some((c) => c && c.derelictRumorRef === poiId), false,
    'the met place no longer sells the direction');
  assert.ok(!contacts.some((c) => c && c.line && word.test(c.line) && c.derelictRumorRef));
});

test('a station away from the site sells no derelict direction', () => {
  const state = createGameState(4242);
  const contacts = generateContacts('station_ceres', state);
  assert.equal(contacts.some((c) => c && c.derelictRumorRef), false);
});
