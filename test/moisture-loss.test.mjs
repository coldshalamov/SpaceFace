import test from 'node:test';
import assert from 'node:assert/strict';
import { createMoistureLoss, MOISTURE_LOSS } from '../src/systems/moistureLoss.js';
import { createBus } from '../src/core/eventBus.js';
import { save } from '../src/save/saveSystem.js';
import { COMMODITIES } from '../src/data/commodities.js';
import { PRODUCTION_INIT_ORDER, PRODUCTION_UPDATE_ORDER, getDeclaredSystemClock } from '../src/runtime/authoritativeSystemManifest.js';

const LIT = 'sector_helios_prime';       // insolation 1.0
const DIM = 'sector_charon_expanse';     // insolation 0.15
const DARK = 'sector_unmapped';          // unlisted = dark
const ICE_MASS = COMMODITIES.find((c) => c.id === 'cmdty_ice_water').massPerU;

function fixture({ sector = LIT, ice = 10, volatiles = 0, iron = 0, docked = false, flagDocked = false } = {}) {
  const bus = createBus(), events = [];
  const cargo = { items: {}, usedVolume: 0, usedMass: 0, capVolume: 500, capMass: 500 };
  const put = (id, qty) => {
    if (!qty) return;
    const def = COMMODITIES.find((c) => c.id === id);
    cargo.items[id] = qty;
    cargo.usedVolume += qty * def.volPerU;
    cargo.usedMass += qty * def.massPerU;
  };
  put('cmdty_ice_water', ice); put('cmdty_volatiles', volatiles); put('cmdty_ore_iron', iron);
  const state = {
    simTime: 0, tick: 0, mode: 'flight', run: { kind: 'adventure' }, playerId: 1,
    world: { currentSectorId: sector }, ui: { docked },
    player: { cargo }, story: { flags: {} },
    entities: new Map([[1, { id: 1, alive: true, flags: { docked: flagDocked } }]]),
  };
  for (const t of ['comms:popup', 'moisture:loss', 'cargo:changed']) bus.on(t, (p) => events.push([t, p]));
  const system = createMoistureLoss();
  system.init({ state, bus });
  const run = (seconds) => { for (let t = 0; t < seconds * 2; t++) { state.simTime += 0.5; system.update(0.5, state); } };
  return { bus, state, cargo, system, events, run };
}

test('registered in both orders on the calendar clock — a seconds-scale drip', () => {
  assert.equal(PRODUCTION_INIT_ORDER.filter((x) => x === 'moistureLoss').length, 1);
  assert.equal(PRODUCTION_UPDATE_ORDER.filter((x) => x === 'moistureLoss').length, 1);
  assert.equal(getDeclaredSystemClock('moistureLoss'), 'calendar');
  assert.ok(PRODUCTION_UPDATE_ORDER.indexOf('moistureLoss') > PRODUCTION_UPDATE_ORDER.indexOf('fragileCargo'),
    'settles after the cargo cluster so removeCargo sees the same-tick hold');
});

test('ice vents at the authored rate in full sun — mass and volume stay honest', () => {
  const f = fixture({ ice: 10 });
  const mass0 = f.cargo.usedMass;
  f.run(MOISTURE_LOSS.secondsPerUnit - 1);
  assert.equal(f.cargo.items.cmdty_ice_water, 10, 'under a unit of progress vents nothing');
  f.run(2);
  assert.equal(f.cargo.items.cmdty_ice_water, 9, 'one unit sublimated at the authored rate');
  assert.equal(f.cargo.usedMass, mass0 - ICE_MASS);
  const losses = f.events.filter(([t]) => t === 'moisture:loss');
  assert.equal(losses.length, 1);
  assert.equal(losses[0][1].remaining, 9);
  assert.equal(losses[0][1].sectorId, LIT);
});

test('no melt while docked, in the dark, or on a dim leg at the authored rate', () => {
  const docked = fixture({ docked: true });
  docked.run(MOISTURE_LOSS.secondsPerUnit * 2);
  assert.equal(docked.cargo.items.cmdty_ice_water, 10, 'the berth shades the hold');
  const dark = fixture({ sector: DARK });
  dark.run(MOISTURE_LOSS.secondsPerUnit * 2);
  assert.equal(dark.cargo.items.cmdty_ice_water, 10, 'unlisted sectors are dark');
  assert.equal(dark.cargo.moisture, undefined, 'no drip, no key — untouched saves stay identical');
  // Charon light is thin: one unit takes ~8x the full-sun span.
  const dim = fixture({ sector: DIM });
  dim.run(MOISTURE_LOSS.secondsPerUnit * 3);
  assert.equal(dim.cargo.items.cmdty_ice_water, 10, 'outer dark barely sweats');
});

test('iron does not melt and the drip never takes the hold below zero', () => {
  const f = fixture({ ice: 2, iron: 50 });
  const ironMass = f.cargo.items.cmdty_ore_iron;
  f.run(MOISTURE_LOSS.secondsPerUnit * 3);
  assert.equal(f.cargo.items.cmdty_ore_iron, ironMass, 'ore is not ice');
  assert.equal(f.cargo.items.cmdty_ice_water ?? 0, 0, 'the hold can run dry');
  const losses = f.events.filter(([t]) => t === 'moisture:loss');
  assert.equal(losses.length, 2, 'exactly the units aboard vent — no phantom units');
  assert.ok(f.cargo.usedMass >= 0 && f.cargo.usedVolume >= 0);
});

test('entry warning fires once per visit; first-loss line once; loss events per unit', () => {
  const f = fixture({ ice: 5 });
  f.bus.emit('sector:enter', {});
  const warns = () => f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'moisture:warn');
  assert.equal(warns().length, 1, 'one warning on entry with ice aboard');
  f.run(MOISTURE_LOSS.secondsPerUnit + 1);
  assert.equal(warns().length, 1, 'no warning stream while the drip runs');
  const lossLines = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'moisture:loss');
  assert.equal(lossLines.length, 1, 'first-loss line noted once per visit');
  f.bus.emit('sector:enter', {});
  assert.equal(warns().length, 2, 'a new visit re-arms the warning');
});

test('partial progress rides the save envelope and keeps dripping after restore', () => {
  const f = fixture({ ice: 10 });
  f.run(MOISTURE_LOSS.secondsPerUnit * 0.6); // 0.6 of the way to the next vented unit
  assert.ok(f.cargo.moisture.cmdty_ice_water > 0.5 && f.cargo.moisture.cmdty_ice_water < 0.7);
  const blob = save._serializeCargo.call({ state: f.state });
  assert.ok(blob.moisture && blob.moisture.cmdty_ice_water > 0, 'fraction serializes');
  const g = fixture({ ice: 10 });
  save._restoreCargo.call({ state: g.state }, blob);
  const sys2 = createMoistureLoss();
  sys2.init({ state: g.state, bus: g.bus });
  g.run(MOISTURE_LOSS.secondsPerUnit * 0.5); // only ~0.4 more progress needed
  assert.equal(g.cargo.items.cmdty_ice_water, 9, 'restored fraction completes the vent');
});

test('a save that never melted leaves no key; game:newGame clears the accumulator', () => {
  const clean = fixture({ ice: 0 });
  const blob = save._serializeCargo.call({ state: clean.state });
  assert.equal(blob.moisture, undefined, 'old saves stay byte-identical');
  const f = fixture({ ice: 5 });
  f.run(MOISTURE_LOSS.secondsPerUnit * 0.4);
  assert.ok(f.cargo.moisture);
  f.bus.emit('game:newGame', {});
  assert.equal(f.cargo.moisture, undefined, 'new run starts dry');
});

test('persistent (story-locked) ice cannot vent — accumulator resets, no churn', () => {
  const f = fixture({ ice: 3 });
  f.state.story.persistentCargo = ['cmdty_ice_water'];
  f.run(MOISTURE_LOSS.secondsPerUnit * 2);
  assert.equal(f.cargo.items.cmdty_ice_water, 3, 'locked freight survives the sun');
  assert.ok(f.cargo.moisture.cmdty_ice_water >= 0 && f.cargo.moisture.cmdty_ice_water < 1,
    'failed vents reset to 0 then re-accumulate — never bank a phantom unit');
  assert.equal(f.events.filter(([t]) => t === 'moisture:loss').length, 0);
});

test('a sim-side dock flag shades the hold even without the ui latch', () => {
  // combat.js sets player entity flags.docked on dock:docked independently of the
  // ui.docked lane write — fragileCargo checks both, and so does the drip.
  const f = fixture({ flagDocked: true });
  f.run(MOISTURE_LOSS.secondsPerUnit * 2);
  assert.equal(f.cargo.items.cmdty_ice_water, 10, 'berthed hull stays in the shade');
  assert.equal(f.cargo.moisture, undefined, 'no drip accrued while berthed');
  f.bus.emit('sector:enter', {});
  assert.equal(f.events.filter(([t]) => t === 'comms:popup').length, 0, 'no warning while berthed');
});

test('a lot that leaves the hold takes its fraction — a fresh lot starts dry', () => {
  const f = fixture({ ice: 10 });
  f.run(MOISTURE_LOSS.secondsPerUnit * 0.6);
  assert.ok(f.cargo.moisture.cmdty_ice_water > 0.5, 'accumulator primed');
  // Sell the whole stack (any out-path works: sale, jettison, parked swap).
  delete f.cargo.items.cmdty_ice_water;
  f.bus.emit('cargo:changed', {});
  assert.equal(f.cargo.moisture, undefined, 'the sweat died with the lot');
  // A different lot bought later inherits nothing.
  f.cargo.items.cmdty_ice_water = 5;
  f.run(MOISTURE_LOSS.secondsPerUnit * 0.2);
  assert.ok(f.cargo.moisture.cmdty_ice_water > 0.15 && f.cargo.moisture.cmdty_ice_water < 0.25,
    'fresh ice starts at zero — no phantom head start');
});

test('a line vented dry drops its accumulator key, not a stale remainder', () => {
  const f = fixture({ ice: 1 });
  f.run(MOISTURE_LOSS.secondsPerUnit + 2);
  assert.equal(f.cargo.items.cmdty_ice_water ?? 0, 0);
  assert.equal(f.cargo.moisture, undefined, 'nothing aboard, nothing to accumulate');
});

test('re-init on the same instance retires the old listener set', () => {
  const f = fixture({ ice: 5 });
  const bus2 = createBus();
  const events2 = [];
  bus2.on('comms:popup', (p) => events2.push(p));
  f.system.init({ state: f.state, bus: bus2 });
  f.bus.emit('sector:enter', {});
  assert.equal(f.events.filter(([t]) => t === 'comms:popup').length, 0,
    'the retired bus hears nothing after re-init');
  bus2.emit('sector:enter', {});
  assert.equal(events2.length, 1, 'the live bus warns once');
});

test('a hold already sweating warns warm on re-entry', () => {
  const f = fixture({ ice: 10 });
  f.run(MOISTURE_LOSS.secondsPerUnit * 0.6); // first in-sector update files the cold line
  f.bus.emit('sector:enter', {});
  const warns = f.events.filter(([t, p]) => t === 'comms:popup' && p.id === 'moisture:warn');
  assert.equal(warns.length, 2, 'cold on arrival, warm on the return leg');
  assert.ok(warns[1][1].text.includes('never stopped sweating'), 'partly-melted hold gets the warm line');
});

test('destroy unsubscribes and survives double teardown', () => {
  const f = fixture({ ice: 5 });
  f.system.destroy();
  f.system.destroy();
  f.bus.emit('sector:enter', {});
  assert.equal(f.events.length, 0, 'dead system stays silent');
});
