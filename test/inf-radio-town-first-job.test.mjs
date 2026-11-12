// inf-radio-town-first-job (PL-60): You finish a town's first job prompts
// the Static's acknowledgment — "Helios Prime says thanks, whoever you are."
//
// Gated:
// - Triggered by completing a town's authored first job (such as Helios Prime's
//   "The Empty Plinth": lw_helios_empty_plinth, or an explicit townFirstJob flag).
// - Unrelated mission completions (patrol, courier, bounty, etc.) open nothing.
// - Real event payloads with actual fields emitted by lanternWardStory / missions.
// - Once aired, the deed line settles and does not repeat.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
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
    entities: new Map(),
  };
  const registry = { get: (name) => (name === 'voiceArbiter' ? { queue } : null) };
  const helpers = { voice: { say(message) { voices.push(structuredClone(message)); return true; } } };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers, registry });
  system.newGame();
  return { bus, voices, queue, state, system };
}

function tuneStatic(h) {
  h.bus.emit('band:tune', { channelId: 'the_static', source: 'test' });
  h.system.update(0, h.state); // ident
  h.state.simTime += 60;
  h.system.update(0, h.state);
}

test('BAND_EVENT_KEYS includes player.town_first_job', () => {
  assert.ok(BAND_EVENT_KEYS.includes('player.town_first_job'),
    'event key is registered in BAND_EVENT_KEYS');
});

test('authored Static line is present and only eligible when key is open', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.town_first_job');

  assert.equal(lines({}).length, 0, 'closed: line never rotates in');
  const openLines = lines({ 'player.town_first_job': true });
  assert.equal(openLines.length, 1, 'open: exactly 1 line');
  assert.equal(openLines[0].text, 'Helios Prime says thanks, whoever you are.');
});

test('completing Helios Prime first job (The Empty Plinth) opens deed key and Static airs the line once', () => {
  const h = makeHarness();
  tuneStatic(h);

  assert.equal(h.state.bandRadio.eventKeys['player.town_first_job'], undefined);

  // Exact payload emitted by src/missions/lanternWardStory.js line 84
  h.state.simTime = 120;
  h.bus.emit('mission:completed', {
    missionId: 'lw_helios_empty_plinth',
    type: 'lw_helios_empty_plinth',
    reward: 180,
    factionId: null,
    repMult: 0,
  });

  assert.equal(h.state.bandRadio.eventKeys['player.town_first_job'], true,
    'completing The Empty Plinth opens player.town_first_job');

  // Rotate line in on the Static
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /says thanks, whoever you are/i.test(v.text));
  assert.equal(heard.length, 1, 'the Static airs the town first job thanks');
  assert.equal(heard[0].text, 'Helios Prime says thanks, whoever you are.');

  // Settled: subsequent updates do not air it again
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heardAgain = h.voices.filter((v) => /says thanks, whoever you are/i.test(v.text));
  assert.equal(heardAgain.length, 1, 'line does not repeat after being aired');
});

test('mission:completed with townFirstJob flag opens deed key', () => {
  const h = makeHarness();
  tuneStatic(h);

  assert.equal(h.state.bandRadio.eventKeys['player.town_first_job'], undefined);

  h.state.simTime = 50;
  h.bus.emit('mission:completed', {
    missionId: 'm_town_opening_01',
    type: 'cargo_delivery',
    factionId: 'faction_scn',
    repMult: 1,
    townFirstJob: true,
  });

  assert.equal(h.state.bandRadio.eventKeys['player.town_first_job'], true,
    'townFirstJob: true opens player.town_first_job');
});

test('ordinary unrelated mission completions do NOT open player.town_first_job', () => {
  const h = makeHarness();
  tuneStatic(h);

  const missions = [
    { missionId: 'm_101', type: 'cargo_delivery', factionId: 'faction_mts', repMult: 1 },
    { missionId: 'm_102', type: 'bounty_kill', factionId: 'faction_reach', repMult: 1.2 },
    { missionId: 'm_103', type: 'patrol_clear', factionId: 'faction_scn', repMult: 1 },
    { missionId: 'm_104', type: 'salvage_retrieval', factionId: 'faction_free', repMult: 0.8 },
    { missionId: 'm_105', type: 'escort', factionId: 'faction_mts', repMult: 1.5 },
  ];

  for (const payload of missions) {
    h.bus.emit('mission:completed', payload);
    assert.equal(h.state.bandRadio.eventKeys['player.town_first_job'], undefined,
      `ordinary ${payload.type} mission completion must not open town first job key`);
  }

  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /says thanks, whoever you are/i.test(v.text));
  assert.equal(heard.length, 0, 'the Static does not air the line when key is shut');
});

test('unrelated non-mission events do NOT open player.town_first_job', () => {
  const h = makeHarness();
  tuneStatic(h);

  h.bus.emit('dock:docked', { stationId: 'station_helios', at: 10 });
  h.bus.emit('physics:impact', { aId: 'player', bId: 'station_helios', dp: 50 });
  h.bus.emit('entity:killed', { entityId: 'drone_1', killerId: 'player' });

  assert.equal(h.state.bandRadio.eventKeys['player.town_first_job'], undefined,
    'non-mission events must not open town first job key');
});
