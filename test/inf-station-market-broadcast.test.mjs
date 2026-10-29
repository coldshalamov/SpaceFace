// The docked station's PA reads its own market shelf (seed: "station announcements tied to the
// live economy"). Proof: the projection names the actual bare/hot commodity and refuses to speak
// for desks that post no board; the broadcast tick says the market line on its bucket on the
// flight route (headless drive — the system's designed acceptance path).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stationMarketBroadcast, MARKET_BROADCAST_SOLD_OUT_STOCK, MARKET_BROADCAST_HIGH_DEMAND }
  from '../src/data/stationMarketBroadcast.js';
import { stationBroadcast } from '../src/systems/stationBroadcast.js';

const STATION_ID = 'station_test';

function makeState({ ironStock = 40, ironDemand = 1, fuelStock = 40, fuelDemand = 1, simTime = 2020 } = {}) {
  return {
    mode: 'flight',
    simTime,
    meta: { seed: 4242 },
    playerId: 'p',
    entities: new Map([['p', { id: 'p', alive: true, pos: { x: 0, z: 0 } }]]),
    entityIndex: { stations: [] },
    economy: { markets: { [STATION_ID]: {
      cmdty_ore_iron: { stock: ironStock, demandMult: ironDemand },
      cmdty_fuel_cells: { stock: fuelStock, demandMult: fuelDemand },
    } } },
  };
}

function makeStation(type = 'trade_hub') {
  return { id: 'st', type: 'station', alive: true, pos: { x: 100, z: 0 },
    data: { stationId: STATION_ID, stationTypeId: type } };
}

test('a sold-out good is named on the desk line', () => {
  const state = makeState({ ironStock: 0 });
  const fact = stationMarketBroadcast(state, makeStation(), 101);
  assert.ok(fact, 'a bare shelf must speak');
  assert.match(fact.text, /Iron Ore/, 'the line names the bare commodity');
  assert.equal(fact.id, `station:market:${STATION_ID}:cmdty_ore_iron:sold-out`);
});

test('high demand is named when the shelf is stocked', () => {
  const state = makeState({ ironDemand: 1.2 });
  const fact = stationMarketBroadcast(state, makeStation(), 101);
  assert.ok(fact);
  assert.match(fact.text, /Iron Ore/);
  assert.equal(fact.id, `station:market:${STATION_ID}:cmdty_ore_iron:demand`);
});

test('a quiet shelf says nothing', () => {
  assert.equal(stationMarketBroadcast(makeState(), makeStation(), 101), null);
});

test('a sold-out good outranks a hot one', () => {
  const state = makeState({ ironStock: 0, fuelDemand: 1.5 });
  for (let bucket = 0; bucket < 8; bucket++) {
    const fact = stationMarketBroadcast(state, makeStation(), bucket);
    assert.ok(fact);
    assert.equal(fact.id, `station:market:${STATION_ID}:cmdty_ore_iron:sold-out`,
      `bucket ${bucket}: the bare shelf outranks the hot one`);
  }
});

test('the blackmarket keeps no manifests and the perimeter post keeps its watch voice', () => {
  const state = makeState({ ironStock: 0 });
  assert.equal(stationMarketBroadcast(state, makeStation('blackmarket'), 101), null);
  assert.equal(stationMarketBroadcast(state, makeStation('military'), 101), null);
});

test('thresholds are the market screen readings', () => {
  assert.equal(MARKET_BROADCAST_SOLD_OUT_STOCK, 2);
  assert.equal(MARKET_BROADCAST_HIGH_DEMAND, 1.08);
});

test('the broadcast tick says the market line on its bucket on the flight route', () => {
  const state = makeState({ ironStock: 0, simTime: 2020 }); // bucket 101, 101 % 4 === 1
  const station = makeStation();
  state.entityIndex.stations.push(station);
  state.entities.set(station.id, station);

  const said = [];
  const ctx = {
    state,
    simLane: undefined,
    helpers: { voice: { say: (req) => { said.push(req); return 'v1'; } } },
    registry: { get: () => null },
    bus: { on: () => {}, off: () => {}, emit: () => {} },
  };
  stationBroadcast.init(ctx);
  try {
    stationBroadcast._tick();
    assert.equal(said.length, 1, `exactly one ambient line, got ${said.length}`);
    assert.match(said[0].text, /Iron Ore/);
    assert.match(said[0].text, /off the board/);
    assert.equal(said[0].priority, stationBroadcast.AMBIENT_PRIORITY ?? 1);
    // the validity closure re-derives the same fact while the shelf stays bare
    assert.equal(typeof said[0].valid, 'function');
    assert.equal(said[0].valid(), true);
    state.economy.markets[STATION_ID].cmdty_ore_iron.stock = 40;
    assert.equal(said[0].valid(), false, 'a restocked shelf invalidates the line');
  } finally {
    stationBroadcast.destroy();
  }
});

test('off its bucket the desk keeps its doctrine chatter', () => {
  const state = makeState({ ironStock: 0, simTime: 2060 }); // bucket 103, 103 % 4 === 3
  const station = makeStation();
  state.entityIndex.stations.push(station);
  state.entities.set(station.id, station);
  const said = [];
  const ctx = {
    state,
    helpers: { voice: { say: (req) => { said.push(req); return 'v2'; } } },
    registry: { get: () => null },
    bus: { on: () => {}, off: () => {}, emit: () => {} },
  };
  stationBroadcast.init(ctx);
  try {
    stationBroadcast._tick();
    assert.equal(said.length, 1);
    assert.doesNotMatch(said[0].text, /Market desk:/);
  } finally {
    stationBroadcast.destroy();
  }
});
