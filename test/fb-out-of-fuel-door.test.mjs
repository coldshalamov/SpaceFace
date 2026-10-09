// FB-101 — a dry tank is a situation with a way out, not a soft lock. Broke at a real pump:
// the smallest fill files onto the note. Dry where no pump exists: one reserve per day, also
// on the note, announced with the figure it costs.
import assert from 'node:assert/strict';
import test from 'node:test';

import { economy } from '../src/systems/economy.js';
import { SECTORS } from '../src/data/sectors.js';

const REFUEL_SECTOR = SECTORS.find((s) => (s.stations || []).some(
  (st) => Array.isArray(st.services) && st.services.includes('refuel')));
const DRY_SECTOR = SECTORS.find((s) => !(s.stations || []).some(
  (st) => Array.isArray(st.services) && st.services.includes('refuel')));

function busCapture() {
  const subs = new Map();
  const events = [];
  return {
    events,
    on(ev, fn) { const l = subs.get(ev) || []; l.push(fn); subs.set(ev, l); },
    emit(ev, p) { events.push({ ev, p }); for (const fn of subs.get(ev) || []) fn(p); },
    of(ev) { return events.filter((e) => e.ev === ev); },
  };
}

function harness({ credits = 0, fuel = 0, fuelMax = 100, stations = [], docked = true } = {}) {
  const state = {
    player: { credits, cargo: { items: {} } },
    entities: new Map(),
    entityList: [],
    fuel: { current: fuel, max: fuelMax },
    meta: { seed: 7 },
    days: 4,
    factions: {},
    ui: { docked, dockedStationId: docked ? 'station_helios' : null },
    world: {
      currentSectorId: 'sector_test',
      activeSector: { stations },
    },
    content: {},
    simTime: 0,
  };
  const bus = busCapture();
  const econ = Object.create(economy);
  econ.state = state;
  econ.bus = bus;
  econ._registry = { get: () => null };
  econ._lastDockedStation = 'station_helios';
  return { state, bus, econ };
}

test('dry + broke at a refuel berth yields a minimum fill and a debt entry', () => {
  const { state, econ, bus } = harness({ credits: 0, fuel: 0 });
  econ.handleService({ type: 'refuel' });
  assert.ok(state.fuel.current > 0, 'the hardship fill landed');
  assert.ok(state.fuel.current <= 8, 'it is the minimum, not a free tank');
  assert.equal(state.player.debt, Math.round(state.fuel.current * 6), 'the unpaid fill is on the note');
  assert.equal(state.player.debtSinceDay, 4, 'the stale clock started today');
  assert.equal(bus.of('service:completed').filter((e) => e.p && e.p.type === 'refuel').length, 0,
    'the fill is a hardship grant, not a paid service');
});

test('dry in a station-less sector grants one reserve a day, filed as debt, announced', () => {
  const { state, econ, bus } = harness({ credits: 5000, fuel: 0, stations: [], docked: false });
  econ._onFuelEmpty({ sectorId: 'sector_test' });
  assert.ok(state.fuel.current > 0, 'the reserve landed');
  assert.equal(state.player.debt, Math.round(state.fuel.current * 6));
  assert.equal(bus.of('alert').length, 1, 'the door is announced');
  assert.match(bus.of('alert')[0].p.text, /debt/, 'the announce names the cost');
  econ._onFuelEmpty({ sectorId: 'sector_test' });
  assert.equal(bus.of('alert').length, 1, 'once per day — a second empty is not a second grant');
});

test('a sector with a real pump grants no free reserve', () => {
  const pumpStations = (REFUEL_SECTOR.stations || []).map((st) => ({ id: st.id, stationId: st.id }));
  const { state, econ, bus } = harness({ credits: 0, fuel: 0, stations: pumpStations, docked: false });
  econ._onFuelEmpty({ sectorId: REFUEL_SECTOR.id });
  assert.equal(state.fuel.current, 0, 'a pump in reach is the door already');
  assert.equal(state.player.debt || 0, 0, 'no debt filed');
  assert.equal(bus.of('alert').length, 0, 'nothing announced');
});

test('a dry tank at a berth is a refuel quote — docked empty never takes the reserve', () => {
  // fuel:empty while docked (a stray spend landing after dock) must not grant the
  // free-sector reserve — the berth's own hardship branch owns the docked door.
  const { state, econ, bus } = harness({ credits: 0, fuel: 0, stations: [], docked: true });
  econ._onFuelEmpty({ sectorId: 'sector_test' });
  assert.equal(state.fuel.current, 0, 'docked empty is a quote, not a rescue');
  assert.equal(state.player.debt || 0, 0);
  assert.equal(bus.of('alert').length, 0, 'the docked case does not announce the reserve');
});
