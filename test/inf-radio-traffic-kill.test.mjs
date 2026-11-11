// inf-radio-traffic-kill (PL-55): getting killed by TRAFFIC — a civilian hull — is the
// joke the Static makes: "Lane lights exist. Just saying." A hostile's kill or a
// hazard's is a different story and opens nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createBus } from '../src/core/eventBus.js';
import { bandRadio, deriveBandEventKeys } from '../src/systems/bandRadio.js';
import { BAND_EVENT_KEYS, eligibleBandLines, BAND_CHANNEL_BY_ID } from '../src/data/bandRadio.js';

function makeHarness(seed = 47) {
  const bus = createBus();
  const voices = [];
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
  const registry = { get: () => null };
  const helpers = { voice: { say(message) { voices.push(structuredClone(message)); return true; } } };
  const system = Object.create(bandRadio);
  system.init({ state, bus, helpers, registry });
  system.newGame();
  return { bus, voices, state, system };
}

test('death by a civilian hull opens the traffic report; anything else opens nothing', () => {
  const h = makeHarness();
  assert.ok(BAND_EVENT_KEYS.includes('player.killed_by_traffic'));

  h.state.entities.set('hauler_9', { id: 'hauler_9', type: 'ship', team: 2, data: { role: 'hauler' } });
  h.state.entities.set('raider_9', { id: 'raider_9', type: 'ship', team: 4, data: { ai: { archetype: 'corsair_raider' } } });

  h.bus.emit('player:death', { killerId: 'raider_9', context: 'combat' });
  assert.equal(h.state.bandRadio.eventKeys['player.killed_by_traffic'], undefined,
    'a hostile kill is the Margin\u2019s story, not this joke');

  h.bus.emit('player:death', { killerId: null, context: 'collision' });
  assert.equal(h.state.bandRadio.eventKeys['player.killed_by_traffic'], undefined,
    'a hazard has no traffic to blame');

  h.bus.emit('player:death', { killerId: 'hauler_9', context: 'collision' });
  assert.equal(h.state.bandRadio.eventKeys['player.killed_by_traffic'], true,
    'run down by a hauler — traffic killed you');
});

test('the authored line airs once the key opens and not before', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.killed_by_traffic');
  assert.equal(lines({}).length, 0);
  assert.equal(lines({ 'player.killed_by_traffic': true }).length, 1);
  assert.equal(lines({ 'player.killed_by_traffic': true })[0].text, 'Lane lights exist. Just saying.');
});

test('a killer that already despawned does not count as traffic', () => {
  assert.deepEqual(
    deriveBandEventKeys('player:death', { killerId: 'ghost_1' }, { entities: new Map() }), [],
    'unknown contact stays the unknown-contact story');
});
