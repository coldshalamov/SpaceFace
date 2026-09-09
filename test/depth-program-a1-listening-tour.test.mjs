import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BAND_CHANNEL_BY_ID,
  TUNABLE_BAND_CHANNELS,
  bandSignalStrength,
  selectBandLine,
} from '../src/data/bandRadio.js';

const HOME_TOUR = Object.freeze({
  concord_bulletin: ['sector_helios_prime', 'faction_scn'],
  the_margin: ['sector_pallas_drift', 'faction_quiet'],
  the_static: ['sector_sker_haven', 'faction_reach'],
  ballad_line: ['sector_sker_haven', 'faction_reach'],
  choir_vespers: ['sector_veil_nebula', 'faction_choir'],
  fulfillment_routing: ['sector_helios_prime', 'faction_fulfillment'],
  numbers_station: ['sector_pallas_drift', 'faction_quiet'],
});

test('A1 listening tour resolves authored copy on every strong home-region carrier', () => {
  const log = TUNABLE_BAND_CHANNELS.map((channel, index) => {
    const [sectorId, factionId] = HOME_TOUR[channel.id] || [];
    assert.ok(sectorId && factionId, `${channel.id} needs a listening-tour home`);
    const signalStrength = bandSignalStrength(channel, {
      sectorId, factionId, stationFactionIds: [factionId], presenceFactionIds: [factionId],
      tier: 3, security: 0.55,
    });
    const line = selectBandLine(channel, { eventKeys: {}, reachRep: 0 }, 4701, index, sectorId);
    return { channelId: channel.id, sectorId, signalStrength, ident: channel.ident && channel.ident.text, line: line && line.text };
  });

  assert.equal(log.length, 7);
  assert.ok(log.every((row) => row.signalStrength >= 0.45), JSON.stringify(log));
  assert.ok(log.every((row) => row.ident && row.line), JSON.stringify(log));
  assert.equal(BAND_CHANNEL_BY_ID.landmark_bleed.tunable, false,
    'landmark bleed remains proximity-bound rather than an eighth tuner stop');
});
