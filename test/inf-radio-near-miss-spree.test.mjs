// inf-radio-near-miss-spree (PL-54): Ten near misses in one minute prompts
// the Static's advisory — "Traffic advisory: there's one of those out today."
//
// Gated:
// - Must achieve 10 near misses with traffic within a 60-second window.
// - 9 or fewer near misses opens nothing.
// - 10 near misses spread over > 60s expires earlier passes and opens nothing.
// - Real event payloads with actual fields emitted by trafficNearMiss / nearMissPlant.
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

function makeRealNearMissPayload(i, simT) {
  return {
    entityId: `hauler_${i}`,
    role: 'hauler',
    hornClass: 'freight',
    step: 1,
    count: 1,
    horn: { id: 'horn_freight', rate: 1, gain: 0.8 },
    scrape: false,
    missWu: 14.5,
    relSpeed: 120,
    swerved: true,
    pos: { x: 100 + i * 10, z: 200 },
    stationEntityId: null,
    stationId: null,
    sectorId: 'sector_helios_prime',
    lineIndex: 42,
    t: simT,
  };
}

test('deriveBandEventKeys maps band:tenNearMisses to player.ten_near_misses', () => {
  assert.ok(BAND_EVENT_KEYS.includes('player.ten_near_misses'),
    'the deed key must be in the runtime key set');
  assert.deepEqual(deriveBandEventKeys('band:tenNearMisses', {}, {}), ['player.ten_near_misses']);
  assert.deepEqual(deriveBandEventKeys('traffic:nearMiss', {}, {}), []);
});

test('ten near misses in one minute opens the deed key and the Static airs the advisory once', () => {
  const h = makeHarness();
  tuneStatic(h);

  assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], undefined);

  // 10 near misses spaced 3 seconds apart (total span: 27 seconds, well inside 60s)
  let simTime = 10;
  for (let i = 1; i <= 10; i++) {
    simTime += 3;
    h.state.simTime = simTime;
    h.bus.emit('traffic:nearMiss', makeRealNearMissPayload(i, simTime));
    if (i < 10) {
      assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], undefined,
        `pass ${i} of 10 must not open the key early`);
    }
  }

  assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], true,
    'the 10th near miss within 60s opens player.ten_near_misses');

  // Rotate line in on the Static
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /traffic advisory/i.test(v.text));
  assert.equal(heard.length, 1, 'the Static reports the traffic advisory');
  assert.equal(heard[0].text, "Traffic advisory: there's one of those out today.");

  // Second update does not air it again (settled)
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heardAgain = h.voices.filter((v) => /traffic advisory/i.test(v.text));
  assert.equal(heardAgain.length, 1, 'does not repeat after being heard');
});

test('nine near misses in one minute does not open the deed key', () => {
  const h = makeHarness();
  tuneStatic(h);

  let simTime = 10;
  for (let i = 1; i <= 9; i++) {
    simTime += 3;
    h.state.simTime = simTime;
    h.bus.emit('traffic:nearMiss', makeRealNearMissPayload(i, simTime));
  }

  assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], undefined,
    '9 near misses does not reach the 10 threshold');

  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /traffic advisory/i.test(v.text));
  assert.equal(heard.length, 0, 'the Static does not air the advisory when key is shut');
});

test('ten near misses spread over > 60s expires earlier passes and does not open', () => {
  const h = makeHarness();
  tuneStatic(h);

  // 10 near misses spaced 10 seconds apart: t = 10, 20, 30, 40, 50, 60, 70, 80, 90, 100.
  // At t = 100, passes before t = 40 have expired (window is 60s), so only 7 passes remain.
  for (let i = 1; i <= 10; i++) {
    const simTime = i * 10;
    h.state.simTime = simTime;
    h.bus.emit('traffic:nearMiss', makeRealNearMissPayload(i, simTime));
    assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], undefined,
      `pass ${i} spread too far apart must not trigger`);
  }

  assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], undefined,
    'ten passes over 100 seconds never had 10 inside any 60-second span');
});

test('traffic:nearMissPlant events count toward the 10 near misses', () => {
  const h = makeHarness();
  tuneStatic(h);

  let simTime = 10;
  for (let i = 1; i <= 10; i++) {
    simTime += 2;
    h.state.simTime = simTime;
    h.bus.emit('traffic:nearMissPlant', {
      entityId: `civilian_${i}`,
      count: 1,
      barkText: "Lane's not yours, pal!",
      reported: false,
      pos: { x: 50, z: 50 },
      missWu: 12.0,
      clearanceWu: 5.0,
      relSpeed: 130,
      t: simTime,
    });
  }

  assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], true,
    'nearMissPlant events also count toward the 10 near misses');
});

test('one close pass heard by both the horn ladder and the plant counts once', () => {
  const h = makeHarness();
  tuneStatic(h);
  // Five passes, each raising traffic:nearMiss AND traffic:nearMissPlant for the same hull in the same tick.
  for (let i = 1; i <= 5; i++) {
    const simTime = 10 + i * 3;
    h.state.simTime = simTime;
    const horn = makeRealNearMissPayload(i, simTime);
    h.bus.emit('traffic:nearMiss', horn);
    h.bus.emit('traffic:nearMissPlant', {
      entityId: horn.entityId, count: 1, barkText: "Lane's not yours, pal!", reported: false,
      pos: { x: 50, z: 50 }, missWu: 12.0, clearanceWu: 5.0, relSpeed: 130, t: simTime,
    });
  }
  assert.equal(h.state.bandRadio.eventKeys['player.ten_near_misses'], undefined,
    'five passes are five near misses, not ten');
});

test('eligibleBandLines only shows the authored line when key is open', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.ten_near_misses');

  assert.equal(lines({}).length, 0, 'closed: line never rotates in');
  assert.equal(lines({ 'player.ten_near_misses': true }).length, 1, 'open: exactly 1 line');
  assert.equal(lines({ 'player.ten_near_misses': true })[0].text, "Traffic advisory: there's one of those out today.");
});
