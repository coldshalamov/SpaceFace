// inf-radio-line-class (PL-56): the Line going up a class is the kind of lane news the
// Static reports — "New rope in the lanes. Mind your cargo." The lineProgression owner
// only emits line:classChanged when the ladder moves up, so the report opens once, airs
// once, and nothing else in the game can print it.
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
  };
  const registry = { get: (name) => name === 'voiceArbiter' ? { queue } : null };
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

const CLASS_UP = { classIndex: 3, classId: 'class_iii', label: 'III', fullControlMassT: 400, tonnageLoggedT: 900 };

test('a class-up opens the Static report and the radio airs it once', () => {
  const h = makeHarness();
  assert.ok(BAND_EVENT_KEYS.includes('player.line_class_up'),
    'the class-up key must be part of the runtime key set derived from the authored pack');

  tuneStatic(h);
  assert.equal(h.voices.some((v) => /new rope/i.test(v.text)), false,
    'no rope report before any class-up');

  h.bus.emit('line:classChanged', CLASS_UP);
  assert.equal(h.state.bandRadio.eventKeys['player.line_class_up'], true, 'deed key opens');

  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /new rope/i.test(v.text));
  assert.equal(heard.length, 1, 'the Static reports the new Line exactly once');

  h.state.simTime += 120;
  h.system.update(0, h.state);
  h.system.update(0, h.state);
  assert.equal(h.voices.filter((v) => /new rope/i.test(v.text)).length, 1, 'it does not repeat');
});

test('the class-up line stays off the rotation until the key opens', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.line_class_up');
  assert.equal(lines({}).length, 0, 'unopened: the report never rotates in');
  assert.equal(lines({ 'player.line_class_up': true }).length, 1,
    'open: exactly the authored line — "New rope in the lanes. Mind your cargo."');
});

test('only the class-up event derives the key', () => {
  assert.deepEqual(deriveBandEventKeys('line:classChanged', CLASS_UP, {}), ['player.line_class_up']);
  assert.deepEqual(deriveBandEventKeys('entity:killed', CLASS_UP, {}), [],
    'an unrelated event with a class-shaped payload opens nothing');
});
