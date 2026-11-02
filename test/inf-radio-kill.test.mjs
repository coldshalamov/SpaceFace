// inf-radio-kill (WF-13): the kill a player actually makes most often — a hostile wing
// downed in a running fight — now reaches the radio. The Margin investigates the receipt;
// The Static roasts or toasts it by standing. A kill by any other hull is somebody
// else's story, and the report airs once, then the band moves on.
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

const KILL = { event: 'entity:killed', killerId: 'player', targetHostileToPlayer: true, type: 'ship' };

function tuneMarginAndSpeakOnce(h) {
  h.bus.emit('band:tune', { channelId: 'the_margin', source: 'test' });
  h.system.update(0, h.state); // ident
  h.state.simTime += 60;
  h.system.update(0, h.state);
}

test('a player kill of a hostile wing opens the raider receipt and the Margin airs it once', () => {
  const h = makeHarness();
  assert.ok(BAND_EVENT_KEYS.includes('player.downed_raider'),
    'the raider key must be part of the runtime key set derived from the authored pack');

  tuneMarginAndSpeakOnce(h);
  assert.equal(h.voices.some((v) => /raider/i.test(v.text)), false,
    'no kill report before any kill');

  h.bus.emit('entity:killed', { ...KILL, id: 'npc_11' });
  assert.equal(h.state.bandRadio.eventKeys['player.downed_raider'], true, 'deed key opens');

  h.state.simTime += 60;
  h.system.update(0, h.state);
  const killLines = h.voices.filter((v) => /raider/i.test(v.text));
  assert.equal(killLines.length, 1, `exactly one kill report aired: ${JSON.stringify(h.voices)}`);
  assert.match(killLines[0].text, /Tessera/);
  assert.equal(killLines[0].channel, 'band');

  // The receipt is heard once; a second raider kill does not stack a second report.
  h.bus.emit('entity:killed', { ...KILL, id: 'npc_12' });
  h.state.simTime += 60;
  h.system.update(0, h.state);
  h.state.simTime += 60;
  h.system.update(0, h.state);
  assert.equal(h.voices.filter((v) => /raider/i.test(v.text)).length, 1,
    'the band moves on after one airing');
});

test('a kill by another hull never opens the receipt', () => {
  const h = makeHarness();
  tuneMarginAndSpeakOnce(h);
  h.bus.emit('entity:killed', { ...KILL, killerId: 'npc_patrol_3', id: 'npc_11' });
  assert.equal(h.state.bandRadio.eventKeys['player.downed_raider'], undefined);
  h.state.simTime += 60;
  h.system.update(0, h.state);
  assert.equal(h.voices.some((v) => /raider/i.test(v.text)), false,
    'a patrol kill is the bond office story, not the Tessera');
});

test('a non-hostile victim is not a raider kill', () => {
  const h = makeHarness();
  tuneMarginAndSpeakOnce(h);
  h.bus.emit('entity:killed', { ...KILL, targetHostileToPlayer: false, id: 'hauler_9' });
  assert.equal(h.state.bandRadio.eventKeys['player.downed_raider'], undefined);
});

test('deriveBandEventKeys contract: player hostile kill in, stranger kill and accident out', () => {
  const state = { playerId: 'player' };
  assert.deepEqual(deriveBandEventKeys('entity:killed', { killerId: 'player', targetHostileToPlayer: true }, state),
    ['player.downed_raider']);
  assert.deepEqual(deriveBandEventKeys('entity:killed', { killerId: 'npc_2', targetHostileToPlayer: true }, state), []);
  assert.deepEqual(deriveBandEventKeys('entity:killed', { killerId: 'player', targetHostileToPlayer: false }, state), []);
  assert.deepEqual(deriveBandEventKeys('entity:killed', {}, {}), []);
});

test('The Static answers the kill by standing: roast while hostile, toast while neutral', () => {
  const openKeys = { 'player.downed_raider': true };
  const staticChannel = BAND_CHANNEL_BY_ID.the_static;
  const killLinesFor = (rep) => eligibleBandLines(staticChannel, { eventKeys: openKeys, reachRep: rep })
    .filter((line) => line.eventKey === 'player.downed_raider');
  const neutral = killLinesFor(0);
  assert.equal(neutral.length, 1, 'neutral standing hears exactly one static kill line');
  assert.match(neutral[0].text, /Tessera/);

  const hostile = killLinesFor(-300);
  assert.equal(hostile.length, 1, 'hostile standing hears the roast, not the toast');
  assert.match(hostile[0].text, /one of ours/);

  const allied = killLinesFor(300);
  assert.equal(allied.length, 0, 'the Static stays out of an allied pilot kill report');
});
