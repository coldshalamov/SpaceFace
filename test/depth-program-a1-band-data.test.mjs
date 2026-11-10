import assert from 'node:assert/strict';
import test from 'node:test';

import * as bandData from '../src/data/bandRadio.js';

test('Band catalogue retains the canonical V2 eight-bed baseline with seven tuner channels', () => {
  assert.ok(Array.isArray(bandData.BAND_CHANNELS), 'BAND_CHANNELS export must exist');
  assert.ok(Array.isArray(bandData.TUNABLE_BAND_CHANNELS), 'TUNABLE_BAND_CHANNELS export must exist');
  assert.equal(bandData.BAND_CHANNELS.length, 8);
  assert.equal(bandData.TUNABLE_BAND_CHANNELS.length, 7);
  const lineIds = bandData.BAND_CHANNELS.flatMap((channel) => channel.lines.map((line) => line.id));
  assert.ok(lineIds.length >= 64, 'the shipped 64-line corpus may grow but cannot silently shrink');
  assert.equal(new Set(lineIds).size, lineIds.length, 'Band line ids remain globally unique');
  assert.equal(bandData.BAND_CHANNEL_BY_ID.landmark_bleed.contextual, true);
  assert.equal(bandData.BAND_CHANNEL_BY_ID.landmark_bleed.tunable, false);
  assert.equal(Object.isFrozen(bandData.BAND_CHANNELS), true);
});

test('Band signal model makes home regions stronger without hiding fringe reception', () => {
  assert.equal(typeof bandData.bandSignalStrength, 'function');
  const concord = bandData.BAND_CHANNEL_BY_ID.concord_bulletin;
  const core = bandData.bandSignalStrength(concord, {
    sectorId: 'sector_helios_prime', factionId: 'faction_scn', tier: 0, security: 0.98,
    stationFactionIds: ['faction_scn'],
  });
  const fringe = bandData.bandSignalStrength(concord, {
    sectorId: 'sector_sker_haven', factionId: 'faction_reach', tier: 3, security: 0.08,
    stationFactionIds: ['faction_reach'],
  });
  assert.ok(core > fringe, `core ${core} should exceed fringe ${fringe}`);
  assert.ok(fringe > 0, 'a weak carrier remains tunable on the fringe');
  assert.ok(core <= 1 && fringe <= 1);
});

test('Band copy eligibility honors event deeds, Reach reputation, and bearing ownership', () => {
  assert.equal(typeof bandData.eligibleBandLines, 'function');
  const margin = bandData.BAND_CHANNEL_BY_ID.the_margin;
  const before = bandData.eligibleBandLines(margin, { eventKeys: {}, reachRep: 0 });
  const after = bandData.eligibleBandLines(margin, {
    eventKeys: { 'player.break_blockade': true }, reachRep: 0,
  });
  assert.equal(before.some((line) => line.id === 'margin_01'), false);
  assert.equal(after.some((line) => line.id === 'margin_01'), true);

  const staticChannel = bandData.BAND_CHANNEL_BY_ID.the_static;
  const hostile = bandData.eligibleBandLines(staticChannel, { eventKeys: {}, reachRep: -500 });
  assert.equal(hostile.some((line) => line.id === 'static_01'), true);
  assert.equal(hostile.some((line) => line.id === 'static_08'), false);

  const numbers = bandData.BAND_CHANNEL_BY_ID.numbers_station;
  const ordinary = bandData.eligibleBandLines(numbers, { eventKeys: {}, reachRep: 0 });
  assert.equal(ordinary.some((line) => line.role === 'unique_wreck_bearing'), false,
    'the canonical-bearing line is root-integration-owned');
});

test('Band content pick and landmark bleed are deterministic and source-bound', () => {
  assert.equal(typeof bandData.selectBandLine, 'function');
  assert.equal(typeof bandData.resolveLandmarkBleed, 'function');
  const channel = bandData.BAND_CHANNEL_BY_ID.ballad_line;
  const context = { eventKeys: {}, reachRep: 0 };
  const a = bandData.selectBandLine(channel, context, 47, 9, 'sector_ceres_belt');
  const b = bandData.selectBandLine(channel, context, 47, 9, 'sector_ceres_belt');
  assert.deepEqual(a, b);

  const quiessence = bandData.resolveLandmarkBleed({ landmark_quiessence: 0.82 });
  assert.equal(quiessence.sourceId, 'landmark_quiessence');
  assert.equal(quiessence.silence, false);
  assert.ok(quiessence.lines.every((line) => line.sourceId === 'landmark_quiessence'));
  const hush = bandData.resolveLandmarkBleed({ planet_hush: 0.9 });
  assert.equal(hush.sourceId, 'planet_hush');
  assert.equal(hush.silence, true);

  const obelisk = bandData.resolveLandmarkBleed({ resonance_obelisk: 0.7 });
  assert.equal(obelisk.sourceId, 'resonance_obelisk', 'the Veil obelisk pulses its ident carrier in falloff');
  assert.equal(obelisk.silence, false);
  assert.ok(obelisk.ident && obelisk.ident.text.length > 0, 'the obelisk ident carrier is authored');
  assert.ok(obelisk.lines.length >= 4 && obelisk.lines.every((line) => line.sourceId === 'resonance_obelisk'));
  assert.equal(bandData.resolveLandmarkBleed({ resonance_obelisk: 0.3 }), null,
    'below the falloff threshold the obelisk stays silent');
  assert.equal(bandData.resolveLandmarkBleed({ planet_hush: 0.9, resonance_obelisk: 0.9 }).sourceId, 'planet_hush',
    'the Hush silence outranks any ident carrier');
});
