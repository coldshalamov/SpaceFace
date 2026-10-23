// SEED-PC-02 — a station broadcast names a hull that is actually in the sector.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  stationBroadcast,
  STATION_BROADCASTS,
  CADENCE_S,
} from '../src/systems/stationBroadcast.js';

const SEED = 4242;
const PLAYER_NAME = 'PLAYER-ONE';
const HULL_NAME = 'MOTH-4';
const FAR_NAME = 'FAR-9';

function world(stationTypeId) {
  const player = {
    id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    data: { callsign: PLAYER_NAME },
  };
  const station = {
    id: 2, type: 'station', alive: true, pos: { x: 80, z: 0 },
    data: { stationId: 'desk_test', stationTypeId, factionId: 'faction_free' },
  };
  const hull = {
    id: 3, type: 'ship', alive: true, pos: { x: 140, z: 20 },
    homeSectorId: 'sector_here',
    data: { callsign: HULL_NAME, trafficRole: 'hauler', trafficLabel: 'Hauler' },
  };
  const far = {
    id: 4, type: 'ship', alive: true, pos: { x: 160, z: 20 },
    homeSectorId: 'sector_elsewhere',
    data: { callsign: FAR_NAME, trafficRole: 'hauler', trafficLabel: 'Hauler' },
  };
  const sayCalls = [];
  const state = {
    mode: 'flight',
    simTime: 0,
    playerId: 1,
    meta: { seed: SEED },
    world: { currentSectorId: 'sector_here' },
    entities: new Map([[1, player], [2, station], [3, hull], [4, far]]),
    entityList: [player, station, hull, far],
    entityIndex: { stations: [station] },
    onboarding: null,
  };
  const ctx = {
    bus: { on() {}, off() {}, emit() {} },
    state,
    helpers: { voice: { say(msg) { sayCalls.push(msg); return true; } } },
    registry: { get() { return null; } },
  };
  return { ctx, state, sayCalls, hull };
}

test('every station desk can name a live in-sector hull on seed 4242', () => {
  for (const stationTypeId of Object.keys(STATION_BROADCASTS)) {
    const lines = STATION_BROADCASTS[stationTypeId].lines;
    assert.ok(lines.some((line) => line.includes('{callsign}') || line.includes('{role}')),
      `${stationTypeId} has no hull token`);
    const { ctx, state, sayCalls, hull } = world(stationTypeId);
    stationBroadcast.init(ctx);
    stationBroadcast.newGame();
    let named = null;
    for (let step = 0; step < 48 && !named; step++) {
      state.simTime = step * CADENCE_S;
      stationBroadcast._lastSayAt = -Infinity;
      stationBroadcast._tick();
      const last = sayCalls[sayCalls.length - 1];
      if (last && last.text.includes(HULL_NAME)) named = last;
    }
    stationBroadcast.destroy();
    assert.ok(named, `${stationTypeId} never named ${HULL_NAME}`);
    assert.equal(named.channel, 'ambient');
    assert.equal(state.entities.get(hull.id).data.callsign, HULL_NAME);
    assert.equal(named.text.includes(PLAYER_NAME), false, 'the desk addressed the player');
    assert.equal(named.text.includes(FAR_NAME), false, 'the desk named a hull from another sector');
    assert.equal(/\byou\b/i.test(named.text), false, 'the naming line addressed someone directly');
  }
});
