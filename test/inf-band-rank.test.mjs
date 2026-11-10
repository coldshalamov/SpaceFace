// inf-band-rank (WF-09): finishing a career ladder is a rank the world's institutions print
// tickets for — the audio caption said "Rank attained." and the ledger noted it, but the band,
// which reads every other deed the Tessera does, never mentioned it. Now the Margin reads the
// receipt: one authored line per career (hauler / hunter / prospector), aired once when the
// ladder kernel's completion receipt opens the key, then the band moves on. An unknown career
// id is nobody's rank and stays off the band.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { VoiceQueue } from '../src/ui/voiceArbiter.js';
import { bandRadio, deriveBandEventKeys } from '../src/systems/bandRadio.js';
import { BAND_EVENT_KEYS, eligibleBandLines, BAND_CHANNEL_BY_ID } from '../src/data/bandRadio.js';

function makeHarness(seed = 47) {
  const bus = createBus();
  const voices = [];
  const queue = { active: null, pending: [] };
  const state = {
    meta: { seed }, simTime: 0, mode: 'flight', ui: { docked: false }, playerId: 'player',
    world: {
      currentSectorId: 'sector_helios_prime',
      sectors: {
        sector_helios_prime: {
          id: 'sector_helios_prime', factionId: 'faction_scn', tier: 0, security: 0.98,
          stations: [{ factionId: 'faction_scn' }],
        },
      },
    },
    factions: { faction_reach: { rep: 0 } },
  };
  const registry = { get: (name) => name === 'voiceArbiter' ? { queue } : null };
  const helpers = { voice: { say(message) { voices.push(structuredClone(message)); return true; } } };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers, registry });
  system.newGame();
  return { bus, voices, queue, state, system };
}

function tuneMarginAndSpeakOnce(h) {
  h.bus.emit('band:tune', { channelId: 'the_margin', source: 'test' });
  h.system.update(0, h.state); // ident
  h.state.simTime += 60;
  h.system.update(0, h.state);
}

test('the three rank keys are part of the runtime key set derived from the authored pack', () => {
  for (const key of ['player.rank_hauler', 'player.rank_hunter', 'player.rank_prospector']) {
    assert.ok(BAND_EVENT_KEYS.includes(key), `${key} must be derived from the authored band pack`);
  }
});

test('completing the hauler ladder opens the rank receipt and the Margin airs it once', () => {
  const h = makeHarness();
  tuneMarginAndSpeakOnce(h);
  assert.equal(h.voices.some((v) => /hauler board/i.test(v.text)), false,
    'no rank report before any ladder completes');

  h.bus.emit('career:ladder:completed', { careerId: 'hauler', receiptId: 'ladder_done:hauler', nonBinding: true });
  assert.equal(h.state.bandRadio.eventKeys['player.rank_hauler'], true, 'rank key opens');

  h.state.simTime += 60;
  h.system.update(0, h.state);
  const rankLines = h.voices.filter((v) => /hauler board/i.test(v.text));
  assert.equal(rankLines.length, 1, `exactly one rank report aired: ${JSON.stringify(h.voices)}`);
  assert.match(rankLines[0].text, /Tessera/);
  assert.equal(rankLines[0].channel, 'band');

  // The receipt is heard once; the same key never re-airs in this save.
  h.state.simTime += 60;
  h.system.update(0, h.state);
  h.state.simTime += 60;
  h.system.update(0, h.state);
  assert.equal(h.voices.filter((v) => /hauler board/i.test(v.text)).length, 1,
    'the band moves on after one airing');
});

test('each career reads its own rank line — hunter and prospector are not interchangeable', () => {
  const h = makeHarness();
  tuneMarginAndSpeakOnce(h);
  h.bus.emit('career:ladder:completed', { careerId: 'hunter', receiptId: 'ladder_done:hunter', nonBinding: true });
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const hunterLines = h.voices.filter((v) => /hunter's ladder|hunter'.s ladder/i.test(v.text) || /guild/i.test(v.text));
  assert.equal(hunterLines.length, 1, `the hunter rank airs the hunter line: ${JSON.stringify(h.voices)}`);
  assert.equal(h.voices.some((v) => /hauler board/i.test(v.text)), false,
    'the hauler line never airs for a hunter completion');
  assert.equal(h.voices.some((v) => /prospect|stake|seam/i.test(v.text)), false,
    'the prospector line never airs for a hunter completion');

  const h2 = makeHarness();
  tuneMarginAndSpeakOnce(h2);
  h2.bus.emit('career:ladder:completed', { careerId: 'prospector', receiptId: 'ladder_done:prospector', nonBinding: true });
  h2.state.simTime += 60;
  h2.system.update(0, h2.state);
  const prospectorLines = h2.voices.filter((v) => /prospect|stake/i.test(v.text));
  assert.equal(prospectorLines.length, 1, `the prospector rank airs the prospector line: ${JSON.stringify(h2.voices)}`);
});

test('an unknown career id is nobody’s rank — no key, no report', () => {
  const h = makeHarness();
  tuneMarginAndSpeakOnce(h);
  h.bus.emit('career:ladder:completed', { careerId: 'smuggler', receiptId: 'ladder_done:smuggler', nonBinding: true });
  assert.equal(h.state.bandRadio.eventKeys['player.rank_smuggler'], undefined);
  assert.deepEqual(deriveBandEventKeys('career:ladder:completed', { careerId: '' }, h.state), []);
  h.state.simTime += 60;
  h.system.update(0, h.state);
  assert.equal(h.voices.some((v) => /rank|ticket|board|ladder/i.test(v.text)), false,
    'nothing airs for an unknown career');
});

test('deriveBandEventKeys contract: ladder completions map career id to rank key', () => {
  const state = { playerId: 'player' };
  assert.deepEqual(deriveBandEventKeys('career:ladder:completed', { careerId: 'hauler' }, state),
    ['player.rank_hauler']);
  assert.deepEqual(deriveBandEventKeys('career:ladder:completed', { careerId: 'hunter' }, state),
    ['player.rank_hunter']);
  assert.deepEqual(deriveBandEventKeys('career:ladder:completed', { careerId: 'prospector' }, state),
    ['player.rank_prospector']);
  assert.deepEqual(deriveBandEventKeys('career:ladder:completed', {}, state), []);
  assert.deepEqual(deriveBandEventKeys('career:ladder:completed', { careerId: 'nope' }, state), []);
});

test('the rank lines sit on the Margin channel and are event-gated, not open rotation', () => {
  const margin = BAND_CHANNEL_BY_ID.the_margin;
  const rankLine = (key) => eligibleBandLines(margin, { eventKeys: { [key]: true }, reachRep: 0 })
    .filter((line) => line.eventKey === key);
  for (const key of ['player.rank_hauler', 'player.rank_hunter', 'player.rank_prospector']) {
    const lines = rankLine(key);
    assert.equal(lines.length, 1, `${key} has exactly one authored line`);
    assert.match(lines[0].text, /Tessera/);
    // closed without the key: a rank is a receipt, not ambience
    const withoutKey = eligibleBandLines(margin, { eventKeys: {}, reachRep: 0 })
      .filter((line) => line.eventKey === key);
    assert.equal(withoutKey.length, 0, `${key} must not air without the receipt`);
  }
});
