// inf-radio-lost-search (PL-59): Losing a search while wanted prompts
// the Static's quip — "Concord would like a word with a certain rope."
//
// Gated:
// - Must be wanted (previousValue >= threshold || wasWanted || previousLevel >= 1).
// - Reason must be losing the search ('escaped heat radius' or 'broke the sweep').
// - Other heat drops (bounty paid, fence scrub, breaking net) open nothing.
// - Unwanted suspicion drops open nothing.
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

function makeRealHeatChangedPayload({
  value = 0,
  previousValue = 0.20,
  level = 0,
  tier = 'none',
  reason = 'escaped heat radius',
  wanted = false,
  wantedCrossed = true,
  threshold = 0.15,
} = {}) {
  const packet = {
    value,
    previousValue,
    level,
    tier,
    escape: level > 0 ? 'leave_search_zone' : null,
    zone: {
      active: level > 0,
      level,
      radius: level > 0 ? 1200 : 0,
      x: 0,
      z: 0,
      sectorId: 'sector_helios_prime',
      outsideS: 0,
      clearAfterS: 5,
    },
    reason,
    wanted,
    wantedCrossed,
    incident: null,
    suspicion: value <= 0 ? 0 : Math.min(1, value / threshold),
    threshold,
  };
  Object.defineProperty(packet, 'previousLevel', {
    value: previousValue >= threshold ? 1 : 0,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return packet;
}

test('BAND_EVENT_KEYS includes player.lost_wanted_search', () => {
  assert.ok(BAND_EVENT_KEYS.includes('player.lost_wanted_search'),
    'event key is registered in BAND_EVENT_KEYS');
});

test('authored Static line is present and only eligible when key is open', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.lost_wanted_search');

  assert.equal(lines({}).length, 0, 'closed: line never rotates in');
  const openLines = lines({ 'player.lost_wanted_search': true });
  assert.equal(openLines.length, 1, 'open: exactly 1 matching line');
  assert.equal(openLines[0].text, 'Concord would like a word with a certain rope.',
    'exact authored line from plant row PL-59');
});

test('escaped heat radius while wanted opens deed key', () => {
  const h = makeHarness();
  tuneStatic(h);

  const payload = makeRealHeatChangedPayload({
    value: 0,
    previousValue: 0.25,
    reason: 'escaped heat radius',
    wanted: false,
    wantedCrossed: true,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], true,
    'deed key opens when losing search while wanted');

  // Static speaks the quip
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /Concord would like a word with a certain rope/i.test(v.text));
  assert.equal(heard.length, 1, 'the Static airs the Concord quip');
  assert.equal(heard[0].text, 'Concord would like a word with a certain rope.');

  // Once aired, the deed line settles and does not repeat
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heardAgain = h.voices.filter((v) => /Concord would like a word with a certain rope/i.test(v.text));
  assert.equal(heardAgain.length, 1, 'line does not repeat once heard');

  // A repeat event does not re-air the settled deed
  h.bus.emit('heat:changed', payload);
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heardThird = h.voices.filter((v) => /Concord would like a word with a certain rope/i.test(v.text));
  assert.equal(heardThird.length, 1, 'repeat event does not re-air settled deed');
});

test('breaking sweep contact while wanted opens deed key', () => {
  const h = makeHarness();
  const payload = makeRealHeatChangedPayload({
    value: 0.20,
    previousValue: 0.35,
    level: 1,
    tier: 'scan',
    reason: 'broke the sweep',
    wanted: true,
    wantedCrossed: false,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], true,
    'breaking a sweep while wanted is losing a search');
});

test('heat drop from paying a bounty does NOT open deed key', () => {
  const h = makeHarness();
  const payload = makeRealHeatChangedPayload({
    value: 0,
    previousValue: 0.25,
    reason: 'bounty paid',
    wanted: false,
    wantedCrossed: true,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], undefined,
    'paying off the bounty is settlement, not losing a search');
});

test('heat drop from fence scrub does NOT open deed key', () => {
  const h = makeHarness();
  const payload = makeRealHeatChangedPayload({
    value: 0,
    previousValue: 0.20,
    reason: 'fence scrub',
    wanted: false,
    wantedCrossed: true,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], undefined,
    'fence scrub is not losing a search');
});

test('breaking a nets checkpoint does NOT open deed key', () => {
  const h = makeHarness();
  const payload = makeRealHeatChangedPayload({
    value: 0.20,
    previousValue: 0.50,
    reason: 'broke wanted net',
    wanted: true,
    wantedCrossed: false,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], undefined,
    'ramming a checkpoint is breaking a net, not losing a search');
});

test('heat spike from a crime does NOT open deed key', () => {
  const h = makeHarness();
  const payload = makeRealHeatChangedPayload({
    value: 0.28,
    previousValue: 0,
    level: 1,
    tier: 'scan',
    reason: 'piracy kill',
    wanted: true,
    wantedCrossed: true,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], undefined,
    'raising heat is not losing a search');
});

test('dropping heat when NOT wanted (suspicion decay) does NOT open deed key', () => {
  const h = makeHarness();
  const payload = makeRealHeatChangedPayload({
    value: 0,
    previousValue: 0.05,
    level: 0,
    tier: 'none',
    reason: 'escaped heat radius',
    wanted: false,
    wantedCrossed: false,
    threshold: 0.15,
  });

  h.bus.emit('heat:changed', payload);
  assert.equal(h.state.bandRadio.eventKeys['player.lost_wanted_search'], undefined,
    'suspicion decay is not losing a search while wanted');
});
