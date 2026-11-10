// inf-decant-quote (WF-14): the Decant key names the fuel it will move BEFORE the press. The
// repair-points law applied to the pilot's own pump verb: a short repair names the hull points
// the weld puts back, so a decant names the units the pour moves — and an unreachable pour
// names which refusal is coming (the paid pump's booked room, the tank remainder, a sealed
// manifest) instead of surprising the click. decantQuote is the pure pre-commit read;
// decantFuelCells resolves the same quote, so the promise and the pour agree by construction.
import assert from 'node:assert/strict';
import test from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { decantQuote, stationServices } from '../src/systems/stationServices.js';

function stateWith(extra = {}) {
  return {
    tick: 120,
    simTime: 2,
    mode: 'flight',
    playerId: 1,
    player: { heat: 0, cargo: { items: { cmdty_fuel_cells: 10 } } },
    meta: { seed: 4242 },
    settings: { video: {}, accessibility: { captions: false } },
    world: { currentSectorId: 'sector_helios', sectors: {} },
    fuel: { current: 20, max: 100 },
    ui: { docked: true, dockedStationId: 'station_helios' },
    ...extra,
  };
}

function yardFor(state) {
  const bus = createBus();
  const yard = Object.create(stationServices);
  yard.bus = bus;
  yard.state = state;
  yard.init({ state, bus });
  return { yard, bus };
}

test('the quote is the pour: cells, units and the tank-room cap, before anything moves', () => {
  const state = stateWith();
  const quote = decantQuote(state);
  assert.equal(quote.ok, true);
  assert.equal(quote.cells, 3, 'room 80 caps the pour at three whole cells');
  assert.equal(quote.units, 72, 'each cell is 24 fuel');
  assert.equal(quote.held, 10, 'the key still knows the hold carries more');
  // Nothing moved: a pure read leaves the tank and the hold exactly as they were.
  assert.equal(state.fuel.current, 20);
  assert.equal(state.player.cargo.items.cmdty_fuel_cells, 10);
});

test('the one-pass cap binds when the hold is deep and the tank is vast', () => {
  const state = stateWith({
    player: { heat: 0, cargo: { items: { cmdty_fuel_cells: 30 } } },
    fuel: { current: 0, max: 400 },
  });
  const quote = decantQuote(state);
  assert.equal(quote.ok, true);
  assert.equal(quote.cells, 8, 'one pass never takes more than eight cells');
  assert.equal(quote.units, 192);
});

test('the tank remainder caps the promise: room for two cells reads two cells', () => {
  const state = stateWith({ fuel: { current: 40, max: 100 } }); // room 60 -> floor(60/24) = 2
  const quote = decantQuote(state);
  assert.equal(quote.ok, true);
  assert.equal(quote.cells, 2);
  assert.equal(quote.units, 48);
});

test('a booked paid pump owns its room: the quote refuses before the press, naming the pump', () => {
  const state = stateWith({
    stationServices: {
      player: {
        stationId: 'station_helios',
        jobs: [{ id: 'j1', type: 'refuel', total: 90, applied: 30, status: 'active' }],
      },
    },
    fuel: { current: 50, max: 100 },
  });
  const quote = decantQuote(state);
  assert.equal(quote.ok, false);
  assert.equal(quote.reason, 'pump_owns_tank');
  assert.equal(quote.booked, 60, 'the pump owns the booked remainder');
  assert.equal(quote.left, 50);
  assert.equal(quote.cellUnits, 24);
});

test('a sealed manifest refuses with its own reason, distinct from an empty hold', () => {
  const sealed = stateWith({ story: { persistentCargo: ['cmdty_fuel_cells'] } });
  assert.equal(decantQuote(sealed).reason, 'cells_sealed');
  const empty = stateWith({ player: { heat: 0, cargo: { items: {} } } });
  assert.equal(decantQuote(empty).reason, 'no_cells');
});

test('the promise and the pour agree: quote units equal delivered units across states', () => {
  for (const [current, max, cells] of [[20, 100, 10], [40, 100, 10], [0, 96, 3], [30, 60, 12]]) {
    const state = stateWith({
      player: { heat: 0, cargo: { items: { cmdty_fuel_cells: cells } } },
      fuel: { current, max },
    });
    const { yard, bus } = yardFor(state);
    const poured = [];
    bus.on('service:decanted', (p) => poured.push(p));
    const quote = decantQuote(state);
    const result = yard.decantFuelCells();
    assert.equal(result.ok, quote.ok, `current ${current}/${max}, ${cells} cells`);
    assert.equal(result.units, quote.units, 'the verb moves exactly what the key promised');
    assert.deepEqual(poured, [{ cells: quote.cells, units: quote.units, stationId: 'station_helios' }]);
    yard.destroy();
  }
});

test('a refused press speaks the same refusal the key named, on the refusal voice', () => {
  const state = stateWith({ fuel: { current: 90, max: 100 } }); // room 10 < one cell
  const { yard, bus } = yardFor(state);
  const toasts = [];
  const cues = [];
  bus.on('toast', (p) => toasts.push(p));
  bus.on('audio:cue', (p) => cues.push(p));
  const quote = decantQuote(state);
  assert.equal(quote.ok, false);
  assert.equal(quote.reason, 'tank_room');
  const result = yard.decantFuelCells();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'tank_full', 'the verb keeps its legacy reason word');
  assert.equal(result.text, 'The tank has 10 left — a fuel cell needs 24.', 'the toast names the same why');
  assert.equal(toasts[0].audio, false, 'the refusal keeps its voice, not a toast tone');
  assert.deepEqual(cues, [{ id: 'service.decantRefused' }]);
  yard.destroy();
});

test('the departed-berth latch refuses the quote exactly like the verb', () => {
  const state = stateWith({ stationServices: { _departedLatch: true } });
  const quote = decantQuote(state);
  assert.equal(quote.reason, 'not_docked');
});
