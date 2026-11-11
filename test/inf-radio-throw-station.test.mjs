// inf-radio-throw-station (PL-52): throwing a ship into a station is the kind of dockside
// audacity the Static reports — "Whoever parked that in the dock: bold."
//
// Gated:
// - A thrown entity must be a ship (`entity.type === 'ship'`), not a rock, pod or wreck.
// - The collision target must be a station (`entity.type === 'station'`), not an asteroid, ship or gate.
// - The collision must happen within 5 seconds of the throw.
// - An ordinary unthrown collision opens nothing.
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

test('deriveBandEventKeys maps band:throwShipStation to player.throw_ship_station', () => {
  assert.ok(BAND_EVENT_KEYS.includes('player.throw_ship_station'),
    'the deed key must be in the runtime key set');
  assert.deepEqual(deriveBandEventKeys('band:throwShipStation', {}, {}), ['player.throw_ship_station']);
  assert.deepEqual(deriveBandEventKeys('entity:killed', {}, {}), []);
});

test('throwing a ship into a station opens the deed key and the Static airs it', () => {
  const h = makeHarness();
  tuneStatic(h);

  h.state.entities.set('station_main', {
    id: 'station_main', type: 'station', alive: true, pos: { x: 0, z: 0 }, data: { stationId: 'station_main' },
  });
  h.state.entities.set('victim_ship', {
    id: 'victim_ship', type: 'ship', alive: true, pos: { x: 50, z: 0 }, data: { role: 'hauler' },
  });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], undefined);

  // Player throws the victim ship
  const throwTime = h.state.simTime + 10;
  h.state.simTime = throwTime;
  h.bus.emit('massline:throw', { payloadId: 'victim_ship', payloadSpeed: 120 });

  // 2 seconds later, victim impacts the station
  h.state.simTime = throwTime + 2;
  h.bus.emit('physics:impact', { aId: 'victim_ship', bId: 'station_main', dp: 500 });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], true,
    'deed key opens when thrown ship hits station');

  // The Static rotates the line in
  h.state.simTime += 60;
  h.system.update(0, h.state);
  const heard = h.voices.filter((v) => /parked that in the dock/i.test(v.text));
  assert.equal(heard.length, 1, 'the Static reports the throw into the dock');
  assert.equal(heard[0].text, 'Whoever parked that in the dock: bold.');
});

test('non-ship thrown into station opens nothing', () => {
  const h = makeHarness();
  h.state.entities.set('station_main', {
    id: 'station_main', type: 'station', alive: true, pos: { x: 0, z: 0 }, data: { stationId: 'station_main' },
  });
  h.state.entities.set('asteroid_1', {
    id: 'asteroid_1', type: 'asteroid', alive: true, pos: { x: 50, z: 0 },
  });

  h.state.simTime = 10;
  h.bus.emit('massline:throw', { payloadId: 'asteroid_1', payloadSpeed: 120 });

  h.state.simTime = 12;
  h.bus.emit('physics:impact', { aId: 'asteroid_1', bId: 'station_main', dp: 500 });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], undefined,
    'throwing a rock does not count as parking a ship in the dock');
});

test('thrown ship hitting an asteroid opens nothing', () => {
  const h = makeHarness();
  h.state.entities.set('asteroid_1', {
    id: 'asteroid_1', type: 'asteroid', alive: true, pos: { x: 0, z: 0 },
  });
  h.state.entities.set('victim_ship', {
    id: 'victim_ship', type: 'ship', alive: true, pos: { x: 50, z: 0 }, data: { role: 'courier' },
  });

  h.state.simTime = 10;
  h.bus.emit('massline:throw', { payloadId: 'victim_ship', payloadSpeed: 120 });

  h.state.simTime = 12;
  h.bus.emit('physics:impact', { aId: 'victim_ship', bId: 'asteroid_1', dp: 500 });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], undefined,
    'hitting an asteroid is not hitting a station');
});

test('thrown ship hitting a jump gate opens nothing', () => {
  const h = makeHarness();
  h.state.entities.set('gate_helios', {
    id: 'gate_helios', type: 'station', alive: true, pos: { x: 0, z: 0 }, data: { isGate: true },
  });
  h.state.entities.set('victim_ship', {
    id: 'victim_ship', type: 'ship', alive: true, pos: { x: 50, z: 0 }, data: { role: 'miner' },
  });

  h.state.simTime = 10;
  h.bus.emit('massline:throw', { payloadId: 'victim_ship', payloadSpeed: 120 });

  h.state.simTime = 12;
  h.bus.emit('physics:impact', { aId: 'victim_ship', bId: 'gate_helios', dp: 500 });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], undefined,
    'a jump gate is not a dock');
});

test('unthrown ship colliding with station opens nothing', () => {
  const h = makeHarness();
  h.state.entities.set('station_main', {
    id: 'station_main', type: 'station', alive: true, pos: { x: 0, z: 0 }, data: { stationId: 'station_main' },
  });
  h.state.entities.set('cruising_ship', {
    id: 'cruising_ship', type: 'ship', alive: true, pos: { x: 50, z: 0 }, data: { role: 'hauler' },
  });

  h.state.simTime = 10;
  // No massline:throw!
  h.bus.emit('physics:impact', { aId: 'cruising_ship', bId: 'station_main', dp: 500 });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], undefined,
    'ordinary traffic bumps are not throws');
});

test('impact occurring too long after throw (> 5s) expires', () => {
  const h = makeHarness();
  h.state.entities.set('station_main', {
    id: 'station_main', type: 'station', alive: true, pos: { x: 0, z: 0 }, data: { stationId: 'station_main' },
  });
  h.state.entities.set('victim_ship', {
    id: 'victim_ship', type: 'ship', alive: true, pos: { x: 50, z: 0 }, data: { role: 'shuttle' },
  });

  h.state.simTime = 10;
  h.bus.emit('massline:throw', { payloadId: 'victim_ship', payloadSpeed: 120 });

  // 7 seconds later — throw has expired
  h.state.simTime = 17.5;
  h.bus.emit('physics:impact', { aId: 'victim_ship', bId: 'station_main', dp: 500 });

  assert.equal(h.state.bandRadio.eventKeys['player.throw_ship_station'], undefined,
    'contact past 5 seconds is too stale');
});

test('eligibleBandLines only shows the authored line when key is open', () => {
  const channel = BAND_CHANNEL_BY_ID.the_static;
  const lines = (keys) => eligibleBandLines(channel, { eventKeys: keys, reachRep: 0 })
    .filter((line) => line.eventKey === 'player.throw_ship_station');

  assert.equal(lines({}).length, 0, 'closed: line never rotates in');
  assert.equal(lines({ 'player.throw_ship_station': true }).length, 1, 'open: exactly 1 line');
  assert.equal(lines({ 'player.throw_ship_station': true })[0].text, 'Whoever parked that in the dock: bold.');
});
