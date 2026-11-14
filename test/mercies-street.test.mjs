// test/mercies-street.test.mjs — headless checks for the 19 SMALL MERCIES town street-life
// plant modules (PL-273..PL-291): generosity with a bite for the greed/rejection branch.
//
// Every module is a standalone `plantsPl<id>` object with init(ctx)/update(dt,state)/destroy().
// The harness is a recording bus + a spec-spreading spawnEntity + a station fixture per town
// (station bodies are real entity-type 'station' records keyed by data.stationId, per
// src/data/sectorAnchors.js). No DOM, no Three.js, no wall clock: state.simTime is driven by
// hand. Tuning day = 240 s on every shared-clock plant (morning < 60, work 60..180, shift
// bell 180, night 180..240).
import test from 'node:test';
import assert from 'node:assert/strict';

import { anselsDishPlant, ANSELS_DISH_TUNING, sillPointFor, ANSEL_LINE, SCRAPE_LINE } from '../src/systems/plants/anselsDish.js';
import { coffeeHatchPlant, COFFEE_HATCH_TUNING, hatchPointFor, MUG_LINE, REFILL_LINE, CHARGE_LINE } from '../src/systems/plants/coffeeHatch.js';
import { tipJarPlant, TIP_JAR_TUNING, jarPointFor, WASH_LINE, MIN_LINE } from '../src/systems/plants/tipJar.js';
import { kidMechanicPlant, KID_MECHANIC_TUNING, fencePointFor, POINT_LINE, BRUSH_LINE } from '../src/systems/plants/kidMechanic.js';
import { secondChairPlant, SECOND_CHAIR_TUNING, chairRowFor, SERVED_LINE, HOG_LINE } from '../src/systems/plants/secondChair.js';
import { walkingLunchPlant, WALKING_LUNCH_TUNING, cartPointFor, shiftWasBad, OFFER_LINE, OFFER_FREE_LINE, GONE_LINE } from '../src/systems/plants/walkingLunch.js';
import { borrowedLadderPlant, BORROWED_LADDER_TUNING, hookPointFor, WITNESS_LINE } from '../src/systems/plants/borrowedLadder.js';
import { windowWarmerPlant, WINDOW_WARMER_TUNING, windowPointFor, warmerOpenAt } from '../src/systems/plants/windowWarmer.js';
import { looseBoltsPlant, LOOSE_BOLTS_TUNING, gatePointFor, boltSlotsFor } from '../src/systems/plants/looseBolts.js';
import { coatRackPlant, COAT_RACK_TUNING, rackPointFor, chalkFor, SWAPS } from '../src/systems/plants/coatRack.js';
import { gullDronePlant, GULL_DRONE_TUNING, gullPosAt, giftLabelFor } from '../src/systems/plants/gullDrone.js';
import { nightBellPlant, NIGHT_BELL_TUNING, bellPointFor, PALLET_LABEL } from '../src/systems/plants/nightBell.js';
import { farePoolPlant, FARE_POOL_TUNING, poolPointFor, skifferPointFor } from '../src/systems/plants/farePool.js';
import { overtimeMugPlant, OVERTIME_MUG_TUNING, linePointFor, MUG_LABEL, POURED_LINE } from '../src/systems/plants/overtimeMug.js';
import { chalkSeatPlant, CHALK_SEAT_TUNING, seatsFor, SERVED_LINE as SEAT_SERVED_LINE } from '../src/systems/plants/chalkSeat.js';
import { lanternLoanPlant, LANTERN_LOAN_TUNING, hookPointFor as lanternHookPointFor } from '../src/systems/plants/lanternLoan.js';
import { coveredWindowPlant, COVERED_WINDOW_TUNING, berthPointFor } from '../src/systems/plants/coveredWindow.js';
import { goodWordPlant, GOOD_WORD_TUNING, dockLayoutFor, WORD_LINE, FILLED_LINE, FAVOR_LINES } from '../src/systems/plants/goodWord.js';
import { theSamplerPlant, THE_SAMPLER_TUNING, stallPointFor, TASTE_LINE, QUEUE_LINE } from '../src/systems/plants/theSampler.js';

import { createBus as createCoreBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';

// ---------- harness ----------

function createBus() {
  const handlers = new Map();
  const log = [];
  return {
    log,
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      const set = handlers.get(type);
      return () => set.delete(fn);
    },
    emit(type, payload) {
      log.push({ type, payload });
      const set = handlers.get(type);
      if (set) for (const fn of [...set]) fn(payload);
    },
    count(type) { return handlers.get(type)?.size || 0; },
    types() { return [...handlers.keys()]; },
  };
}

function makeState(sectorId, overrides = {}) {
  const entities = new Map();
  const state = {
    mode: 'flight',
    simTime: 0,
    tick: 0,
    playerId: 'p1',
    entities,
    world: { currentSectorId: sectorId },
    meta: { seed: 1234 },
    story: { flags: {} },
    ...overrides,
  };
  entities.set(state.playerId, {
    id: state.playerId, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
    hull: 100, hullMax: 100, data: {},
  });
  return state;
}

function makeHelpers(state) {
  const spawned = [];
  const removed = [];
  const voice = [];
  let nextId = 100;
  const helpers = {
    spawned,
    removed,
    voice,
    spawnEntity(spec) {
      const ent = {
        ...structuredClone(spec),
        id: nextId++,
        alive: true,
        pos: { ...(spec.pos || { x: 0, z: 0 }) },
        data: structuredClone(spec.data || {}),
      };
      spawned.push(ent);
      if (state && state.entities) state.entities.set(ent.id, ent);
      return ent;
    },
    removeEntity(id) {
      removed.push(id);
      if (state && state.entities) state.entities.delete(id);
    },
    voiceSay(rec) { voice.push(rec); },
  };
  helpers.voice = { say(rec) { helpers.voiceSay(rec); } };
  return helpers;
}

function addStation(state, tuning) {
  const station = {
    id: tuning.stationId, alive: true, type: 'station',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    data: { stationId: tuning.stationId, stationTypeId: 'trade_hub', dockRadius: 72, sectorId: tuning.sectorId, size: 'M' },
  };
  state.entities.set(station.id, station);
  return station;
}

function harnessFor(plant, tuning, { simTime = 0 } = {}) {
  const state = makeState(tuning.sectorId);
  state.simTime = simTime;
  addStation(state, tuning);
  const bus = createBus();
  const helpers = makeHelpers(state);
  plant.init({ state, bus, helpers });
  return { state, bus, helpers, plant, tuning };
}

function popups(bus) {
  return bus.log.filter((e) => e.type === 'comms:popup').map((e) => e.payload);
}
function cues(bus, id = null) {
  return bus.log.filter((e) => e.type === 'audio:cue')
    .map((e) => e.payload)
    .filter((p) => id == null || p.id === id);
}
function eventsOf(bus, type) {
  return bus.log.filter((e) => e.type === type).map((e) => e.payload);
}
function ownedOf(h, stamp) {
  return h.helpers.spawned.filter((e) => e.data && e.data[stamp] === true);
}
function advanceWith(h, seconds, step = 0.5) {
  for (let t = 0; t < seconds - 1e-9; t += step) {
    h.state.simTime += step;
    h.state.tick += Math.round(step * 60);
    h.plant.update(step, h.state);
  }
}
function teleportPlayer(h, x, z, vel = { x: 0, z: 0 }) {
  const p = h.state.entities.get(h.state.playerId);
  p.pos.x = x;
  p.pos.z = z;
  p.vel.x = vel.x;
  p.vel.z = vel.z;
}
function assertNoListeners(bus) {
  const counts = bus.types().map((t) => bus.count(t));
  assert.deepEqual(counts, new Array(counts.length).fill(0), 'destroy must leave no listeners');
}
function impact(h, entId, impulse, bId = 'p1') {
  h.bus.emit('physics:impact', { aId: entId, bId, impulse });
}
function dock(h, inRange = true, shipId = 'p1') {
  const payload = { stationId: h.tuning.stationId, inRange };
  if (shipId != null) payload.shipId = shipId;
  h.bus.emit('dock:range', payload);
}

// ---------- lifecycle smoke ----------

test('lifecycle: all 19 mercy plants boot, tick and tear down clean on the real bus and state', () => {
  const bus = createCoreBus();
  const state = createGameState('mercies-street');
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(String(args[1] || args[0]));
  const plants = [
    anselsDishPlant, coffeeHatchPlant, tipJarPlant, kidMechanicPlant, secondChairPlant,
    walkingLunchPlant, borrowedLadderPlant, windowWarmerPlant, looseBoltsPlant, coatRackPlant,
    gullDronePlant, nightBellPlant, farePoolPlant, overtimeMugPlant, chalkSeatPlant,
    lanternLoanPlant, coveredWindowPlant, goodWordPlant, theSamplerPlant,
  ];
  try {
    for (const plant of plants) plant.init({ state, bus, helpers: {} });
    for (const plant of plants) {
      plant.update(1 / 60, state);
      plant.update(1 / 60, state);
    }
    for (const plant of plants) plant.destroy();
  } finally {
    console.error = originalError;
  }
  assert.equal(errors.length, 0, `no lifecycle errors: ${errors.slice(0, 3).join(' | ')}`);
  for (const plant of plants) assert.equal(typeof plant.destroy, 'function');
});

// ---------- PL-273 Ansel's dish ----------

test('PL-273 positive: the dish is cooked nightly, eating it and ringing twice gets Ansel\u2019s exact thanks', () => {
  const h = harnessFor(anselsDishPlant, ANSELS_DISH_TUNING, { simTime: 185 }); // night band
  advanceWith(h, 1);
  assert.equal(ownedOf(h, 'plantsPl273Sill').length, 1, 'the sill stands');
  assert.equal(ownedOf(h, 'plantsPl273Bell').length, 1, 'the bell is by the sill');
  const dish = ownedOf(h, 'plantsPl273Dish')[0];
  assert.ok(dish, 'the dish is set on the sill, steaming');
  assert.equal(dish.data.swarmFloorPad.label, 'ANSEL\u2019S DISH');

  teleportPlayer(h, dish.pos.x, dish.pos.z);
  advanceWith(h, ANSELS_DISH_TUNING.eatS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl273:eaten').length, 1, 'you ate it');
  const bell = ownedOf(h, 'plantsPl273Bell')[0];
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  const thanks = popups(h.bus).find((p) => p.text === ANSEL_LINE);
  assert.ok(thanks, 'Ansel speaks');
  assert.equal(thanks.sender, ANSELS_DISH_TUNING.sender);
  assert.equal(eventsOf(h.bus, 'plants:pl273:thanks').length, 1);

  // Cooldown: thanks once per night.
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl273:thanks').length, 1, 'no second thanks');
  h.plant.destroy();
  assertNoListeners(h.bus);
  assert.equal(ownedOf(h, 'plantsPl273Sill').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the sill despawns on destroy');
});

test('PL-273 grind: one sustained knock is one tap — the two-tap thanks needs two real taps', () => {
  const h = harnessFor(anselsDishPlant, ANSELS_DISH_TUNING, { simTime: 185 }); // night band
  advanceWith(h, 1);
  const dish = ownedOf(h, 'plantsPl273Dish')[0];
  teleportPlayer(h, dish.pos.x, dish.pos.z);
  advanceWith(h, ANSELS_DISH_TUNING.eatS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl273:eaten').length, 1);
  const bell = ownedOf(h, 'plantsPl273Bell')[0];
  // One sustained bump (~0.2 s of contact frames): one tap, no thanks.
  impact(h, bell.id, 100);
  for (let i = 0; i < 4; i++) { h.state.simTime += 0.05; impact(h, bell.id, 100); }
  assert.equal(eventsOf(h.bus, 'plants:pl273:thanks').length, 0, 'one grind is not two taps');
  // Two spaced taps: the thanks lands, once.
  h.state.simTime += ANSELS_DISH_TUNING.tapCooldownS;
  impact(h, bell.id, 100);
  assert.equal(eventsOf(h.bus, 'plants:pl273:thanks').length, 1, 'two spaced taps thank');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-273 bite + leave: docking while it cools scrapes it (exact line); leaving means dawn recycles it quietly', () => {
  const h = harnessFor(anselsDishPlant, ANSELS_DISH_TUNING, { simTime: 185 });
  advanceWith(h, 1);
  const dish = ownedOf(h, 'plantsPl273Dish')[0];
  dock(h, true, 'p1');
  advanceWith(h, 1);
  assert.equal(h.state.entities.get(dish.id), undefined, 'the dish is gone into the recycler');
  const scrape = popups(h.bus).find((p) => p.text === SCRAPE_LINE);
  assert.ok(scrape, 'you watched him scrape it');
  assert.equal(eventsOf(h.bus, 'plants:pl273:scraped').length, 1);
  advanceWith(h, ANSELS_DISH_TUNING.dayLengthS); // next night
  assert.equal(ownedOf(h, 'plantsPl273Dish').filter((e) => h.state.entities.get(e.id)).length, 1,
    'a fresh dish the next night: the scrape was tonight\u2019s wound, not forever');

  // Leave it: dawn takes the dish back, no memory, no voice.
  const h2 = harnessFor(anselsDishPlant, ANSELS_DISH_TUNING, { simTime: 185 });
  advanceWith(h2, 1);
  dock(h2, true, null); // shipId-less UI re-emit is ignored
  advanceWith(h2, 1);
  assert.ok(ownedOf(h2, 'plantsPl273Dish')[0], 'a shipId-less dock is not an order');
  advanceWith(h2, ANSELS_DISH_TUNING.dayLengthS - 186 + 2); // cross dawn into the day
  assert.equal(ownedOf(h2, 'plantsPl273Dish').filter((e) => h2.state.entities.get(e.id)).length, 0,
    'an unclaimed dish is quietly recycled at dawn');
  assert.equal(popups(h2.bus).length, 0, 'leaving it is remembered by nobody');
  advanceWith(h2, ANSELS_DISH_TUNING.dayLengthS - 56); // the next night
  assert.equal(ownedOf(h2, 'plantsPl273Dish').filter((e) => h2.state.entities.get(e.id)).length, 1,
    'cooked again the next night: leaving it left no wound');
  h2.plant.destroy();
  assertNoListeners(h2.bus);
});

// ---------- PL-274 The coffee hatch ----------

test('PL-274 positive: first hull before the morning bell gets the mug; refills are free after', () => {
  const h = harnessFor(coffeeHatchPlant, COFFEE_HATCH_TUNING, { simTime: 10 }); // morning
  dock(h, true, 'p1');
  advanceWith(h, 1);
  const mug = ownedOf(h, 'plantsPl274Mug')[0];
  assert.ok(mug, 'the clip-on mug is yours');
  const hello = popups(h.bus)[0];
  assert.equal(hello.sender, COFFEE_HATCH_TUNING.sender);
  assert.equal(hello.text, MUG_LINE);
  assert.equal(mug.pos.x, 12, 'the mug rides the dash socket side');
  h.state.simTime += COFFEE_HATCH_TUNING.dayLengthS - 10;
  advanceWith(h, 2); // the next morning
  assert.equal(eventsOf(h.bus, 'plants:pl274:refill').length, 1, 'refills are free for mug-bearers');
  assert.ok(popups(h.bus).some((p) => p.text === REFILL_LINE));
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-274 bite: toss the mug and every hatch charges you; shipId-less docks are ignored', () => {
  const h = harnessFor(coffeeHatchPlant, COFFEE_HATCH_TUNING, { simTime: 10 });
  dock(h, true, 'p1');
  advanceWith(h, 1);
  const mug = ownedOf(h, 'plantsPl274Mug')[0];
  impact(h, mug.id, 120);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl274:toss').length, 1);
  assert.equal(h.state.story.flags.plantsPl274Tossed, true, 'the toss is a durable receipt');
  assert.equal(h.state.entities.get(mug.id), undefined);

  h.state.simTime += COFFEE_HATCH_TUNING.dayLengthS;
  dock(h, true, 'p1');
  advanceWith(h, 1);
  const charge = popups(h.bus).find((p) => p.text === CHARGE_LINE);
  assert.ok(charge, 'the hatch charges you now');
  assert.equal(eventsOf(h.bus, 'plants:pl274:charge').length, 1);
  const hatch = ownedOf(h, 'plantsPl274Hatch')[0];
  assert.equal(hatch.data.plantsPl274ChargesHull, 'p1', 'read-only receipt for the economy owner');

  // A shipId-less re-emit never claims the cup.
  const h2 = harnessFor(coffeeHatchPlant, COFFEE_HATCH_TUNING, { simTime: 10 });
  dock(h2, true, null);
  advanceWith(h2, 1);
  assert.equal(ownedOf(h2, 'plantsPl274Mug').length, 0, 'no mug without a hull id');
  h2.plant.destroy();
  assertNoListeners(h2.bus);
});

// ---------- PL-275 The tip jar ----------

test('PL-275 positive: a pod dropped in the jar arms the free pressure wash; the next dock is already washed', () => {
  const h = harnessFor(tipJarPlant, TIP_JAR_TUNING);
  advanceWith(h, 1);
  const jar = ownedOf(h, 'plantsPl275Jar')[0];
  const point = jarPointFor(h.state.entities.get(TIP_JAR_TUNING.stationId));
  assert.equal(jar.data.swarmFloorPad.label, 'TIP JAR');
  h.helpers.spawnEntity({
    type: 'payload', pos: { x: point.x + 10, z: point.z }, vel: { x: 0, z: 0 },
    radius: 3, mass: 2, data: { commodityId: 'cmdty_food', amount: 2 },
  });
  advanceWith(h, TIP_JAR_TUNING.depositS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl275:tip').length, 1, 'the tip lands in the jar');
  assert.ok(h.helpers.removed.length >= 1, 'the pod is consumed by the jar');
  dock(h, true, 'p1');
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl275:wash').length, 1, 'the wash was already done');
  assert.ok(popups(h.bus).some((p) => p.text === WASH_LINE));
  const player = h.state.entities.get('p1');
  assert.ok(Number.isFinite(player.data.plantsPl275WashedUntil), 'the hull carries the wash stamp');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-275 bite: fishing the coins back turns washes into minimum service, for you alone', () => {
  const h = harnessFor(tipJarPlant, TIP_JAR_TUNING);
  advanceWith(h, 1);
  const jar = ownedOf(h, 'plantsPl275Jar')[0];
  const point = jarPointFor(h.state.entities.get(TIP_JAR_TUNING.stationId));
  h.helpers.spawnEntity({
    type: 'payload', pos: { x: point.x + 10, z: point.z }, vel: { x: 0, z: 0 },
    radius: 3, mass: 2, data: { commodityId: 'cmdty_food', amount: 2 },
  });
  advanceWith(h, TIP_JAR_TUNING.depositS + 1);
  impact(h, jar.id, 120);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl275:fished').length, 1, 'you fished the coins back out');
  assert.equal(h.state.story.flags.plantsPl275Stingy, true);
  dock(h, true, 'p1');
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl275:wash').length, 0, 'no wash for fingers in the jar');
  assert.equal(eventsOf(h.bus, 'plants:pl275:minimum').length, 1, 'minimum service, for you alone');
  assert.ok(popups(h.bus).some((p) => p.text === MIN_LINE));
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-276 The kid mechanic ----------

test('PL-276 positive: the kid points at the seated-wrong coupling; two rings on Pip\u2019s bell seat it', () => {
  const h = harnessFor(kidMechanicPlant, KID_MECHANIC_TUNING, { simTime: 100 }); // work band
  advanceWith(h, 1);
  const kid = ownedOf(h, 'plantsPl276Kid')[0];
  assert.ok(kid, 'Pip watches from the fence');
  assert.equal(kid.data.callsign, 'Pip');
  const fence = fencePointFor(h.state.entities.get(KID_MECHANIC_TUNING.stationId));
  teleportPlayer(h, fence.x + 16, fence.z + 8);
  advanceWith(h, KID_MECHANIC_TUNING.fitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl276:point').length, 1, 'the kid points');
  assert.ok(popups(h.bus).some((p) => p.text === POINT_LINE), 'the exact pointer line');
  const loose = ownedOf(h, 'plantsPl276Loose')[0];
  assert.ok(loose, 'the coupling is physically loose');
  assert.equal(loose.data.swarmFloorPad.label, 'LOOSE COUPLING');
  const bell = ownedOf(h, 'plantsPl276Bell')[0];
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl276:thanks').length, 1, 'thanked by name');
  assert.equal(h.state.entities.get(loose.id), undefined, 'Pip seats the coupling');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-276 bite: brush them off and the next fit-out has no pointers and one looseness nobody mentions', () => {
  const h = harnessFor(kidMechanicPlant, KID_MECHANIC_TUNING, { simTime: 100 });
  advanceWith(h, 1);
  const fence = fencePointFor(h.state.entities.get(KID_MECHANIC_TUNING.stationId));
  teleportPlayer(h, fence.x + 16, fence.z + 8);
  advanceWith(h, KID_MECHANIC_TUNING.fitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl276:point').length, 1);
  teleportPlayer(h, fence.x + 400, fence.z + 400); // walk away, pointer hanging
  advanceWith(h, KID_MECHANIC_TUNING.brushWindowS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl276:brushed').length, 1, 'they noticed the brush-off');
  assert.ok(popups(h.bus).some((p) => p.text === BRUSH_LINE));
  assert.equal(h.state.story.flags.plantsPl276Brushed, true);

  // The next fit-out: no pointer, and a silent looseness.
  teleportPlayer(h, fence.x + 16, fence.z + 8);
  advanceWith(h, KID_MECHANIC_TUNING.fitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl276:point').length, 1, 'no pointer: one event total, the first');
  const silent = ownedOf(h, 'plantsPl276Loose').slice(-1)[0];
  assert.ok(silent, 'a looseness spawned anyway');
  assert.equal(silent.data.plantsPl276Silent, true, 'nobody mentions it');
  assert.equal(silent.data.swarmFloorPad, undefined, 'no label on the silent looseness');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-276 grind: one sustained bump on Pip\u2019s bell does not auto-complete the thanks', () => {
  const h = harnessFor(kidMechanicPlant, KID_MECHANIC_TUNING, { simTime: 100 }); // work band
  advanceWith(h, 1);
  const fence = fencePointFor(h.state.entities.get(KID_MECHANIC_TUNING.stationId));
  teleportPlayer(h, fence.x + 16, fence.z + 8);
  advanceWith(h, KID_MECHANIC_TUNING.fitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl276:point').length, 1);
  const loose = ownedOf(h, 'plantsPl276Loose')[0];
  const bell = ownedOf(h, 'plantsPl276Bell')[0];
  // One sustained bump (~0.2 s of contact frames): counted once, no completion.
  impact(h, bell.id, 100);
  for (let i = 0; i < 4; i++) { h.state.simTime += 0.05; impact(h, bell.id, 100); }
  assert.equal(eventsOf(h.bus, 'plants:pl276:thanks').length, 0, 'one grind is not two rings');
  assert.ok(h.state.entities.get(loose.id), 'the coupling is still loose');
  // Two spaced taps: the thanks lands once, and Pip seats the coupling.
  h.state.simTime += KID_MECHANIC_TUNING.ringCooldownS;
  impact(h, bell.id, 100);
  assert.equal(eventsOf(h.bus, 'plants:pl276:thanks').length, 1, 'thanked by name');
  assert.equal(h.state.entities.get(loose.id), undefined, 'Pip seats the coupling');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-277 The second chair ----------

test('PL-277 positive: sit in the second chair and the clerk serves you off-book, a beat faster', () => {
  const h = harnessFor(secondChairPlant, SECOND_CHAIR_TUNING, { simTime: 100 }); // work band
  advanceWith(h, 1);
  const row = chairRowFor(h.state.entities.get(SECOND_CHAIR_TUNING.stationId));
  assert.ok(ownedOf(h, 'plantsPl277Chair')[0], 'the second chair stands, never sat in');
  assert.ok(ownedOf(h, 'plantsPl277Queue')[0], 'the queue runs one window deep');
  teleportPlayer(h, row.chair.x, row.chair.z);
  advanceWith(h, SECOND_CHAIR_TUNING.sitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl277:served').length, 1, 'served anyway');
  const served = popups(h.bus).find((p) => p.text === SERVED_LINE);
  assert.ok(served, 'the off-book line');
  assert.ok(cues(h.bus, 'confirm').length >= 1);
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-277 bite: hog the chair daily and the clerk unbends the rule \u2014 the chair stays empty for good', () => {
  const h = harnessFor(secondChairPlant, SECOND_CHAIR_TUNING, { simTime: 100 });
  const row = chairRowFor(h.state.entities.get(SECOND_CHAIR_TUNING.stationId));
  teleportPlayer(h, row.chair.x, row.chair.z);
  for (let day = 0; day < 4; day += 1) {
    advanceWith(h, SECOND_CHAIR_TUNING.sitNeedS + 1); // a sit a day
    if (day < 3) {
      h.state.simTime += SECOND_CHAIR_TUNING.dayLengthS - SECOND_CHAIR_TUNING.sitNeedS - 1;
    }
  }
  assert.equal(eventsOf(h.bus, 'plants:pl277:hog').length, 1, 'the clerk stops bending the rule');
  assert.ok(popups(h.bus).some((p) => p.text === HOG_LINE));
  assert.equal(eventsOf(h.bus, 'plants:pl277:empty').length, 1, 'the chair stays empty for good');
  assert.equal(h.state.story.flags.plantsPl277ChairGone, true);
  h.state.simTime += SECOND_CHAIR_TUNING.dayLengthS;
  advanceWith(h, 2);
  assert.equal(ownedOf(h, 'plantsPl277Chair').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the chair never respawns');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-278 The walking lunch ----------

function firstFairDay() {
  for (let day = 0; day < 8; day += 1) {
    if (!shiftWasBad(day)) return day;
  }
  return 0;
}

test('PL-278 positive: still working at the bell, the unsold plate finds you \u2014 half price, or free on a bad shift', () => {
  const day = firstFairDay();
  const start = day * WALKING_LUNCH_TUNING.dayLengthS + WALKING_LUNCH_TUNING.dayLengthS * WALKING_LUNCH_TUNING.bellPhase + 1;
  const h = harnessFor(walkingLunchPlant, WALKING_LUNCH_TUNING, { simTime: start });
  teleportPlayer(h, 100, 0, { x: 20, z: 0 }); // inside the traffic shell, still working
  advanceWith(h, WALKING_LUNCH_TUNING.offerWindowS * 0.5);
  assert.ok(eventsOf(h.bus, 'plants:pl278:offer').length === 1, 'the vendor flags you down');
  assert.ok(popups(h.bus).some((p) => p.text === OFFER_LINE || p.text === OFFER_FREE_LINE));
  const plate = ownedOf(h, 'plantsPl278Plate')[0];
  assert.ok(plate, 'the plate is physical');
  assert.equal(plate.data.plantsPl278Holder, 'p1');
  advanceWith(h, WALKING_LUNCH_TUNING.eatS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl278:taken').length, 1, 'taken as offered');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-278 bite: knock the coin bowl free twice and the plate starts going to someone else', () => {
  const fair = [];
  for (let day = 0; day < 8 && fair.length < 2; day += 1) if (!shiftWasBad(day)) fair.push(day);
  const h = harnessFor(walkingLunchPlant, WALKING_LUNCH_TUNING);
  advanceWith(h, 1);
  const bowl = ownedOf(h, 'plantsPl278Bowl')[0];
  for (let i = 0; i < fair.length; i += 1) {
    h.state.simTime = fair[i] * WALKING_LUNCH_TUNING.dayLengthS + 10;
    advanceWith(h, 1);
    impact(h, bowl.id, 120);
    advanceWith(h, 1);
  }
  assert.equal(eventsOf(h.bus, 'plants:pl278:demand').length, 2, 'demanded free twice');
  assert.equal(eventsOf(h.bus, 'plants:pl278:gone').length, 1, 'the plate goes elsewhere');
  assert.ok(popups(h.bus).some((p) => p.text === GONE_LINE));
  assert.equal(h.state.story.flags.plantsPl278GoneElsewhere, true);

  // At the next bell the plate goes to a stranger hull, never to you.
  const bell = fair[fair.length - 1] * WALKING_LUNCH_TUNING.dayLengthS
    + WALKING_LUNCH_TUNING.dayLengthS * WALKING_LUNCH_TUNING.bellPhase + 1;
  h.state.simTime = bell;
  teleportPlayer(h, 100, 0, { x: 20, z: 0 });
  advanceWith(h, WALKING_LUNCH_TUNING.offerWindowS * 0.5);
  const stranger = ownedOf(h, 'plantsPl278Stranger')[0];
  assert.ok(stranger, 'a real stranger takes the plate');
  const plate = ownedOf(h, 'plantsPl278Plate').slice(-1)[0];
  assert.equal(plate.data.plantsPl278Holder, stranger.id, 'not yours');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-278 grind: knocking the coin bowl all shift demands once — one deny per day', () => {
  const day = firstFairDay();
  const h = harnessFor(walkingLunchPlant, WALKING_LUNCH_TUNING);
  advanceWith(h, 1);
  const bowl = ownedOf(h, 'plantsPl278Bowl')[0];
  h.state.simTime = day * WALKING_LUNCH_TUNING.dayLengthS + 10;
  advanceWith(h, 1);
  impact(h, bowl.id, 120);
  for (let i = 0; i < 6; i++) { h.state.simTime += 0.05; impact(h, bowl.id, 120); }
  assert.equal(eventsOf(h.bus, 'plants:pl278:demand').length, 1, 'one demand for the whole grind');
  assert.equal(popups(h.bus).filter((p) => p.text === 'Fine. Today it\u2019s free.').length, 1,
    'one deny popup, not per frame');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-279 The borrowed ladder ----------

test('PL-279 positive: borrow, need a hand and get one shove, return by the bell', () => {
  const h = harnessFor(borrowedLadderPlant, BORROWED_LADDER_TUNING, { simTime: 75 });
  advanceWith(h, 1);
  const hook = ownedOf(h, 'plantsPl279Hook')[0];
  const ladder = ownedOf(h, 'plantsPl279Ladder')[0];
  assert.equal(hook.data.swarmFloorPad.label, 'BORROW \u2014 BACK BY BELL');
  teleportPlayer(h, ladder.pos.x, ladder.pos.z);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl279:borrow').length, 1, 'borrowed');

  const point = hookPointFor(h.state.entities.get(BORROWED_LADDER_TUNING.stationId));
  teleportPlayer(h, point.x + 100, point.z + 60);
  const player = h.state.entities.get('p1');
  player.hull = 40;
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl279:hand').length, 1, 'the ladder is there when you need a hand');
  assert.ok(Math.hypot(player.vel.x, player.vel.z) > 1, 'a real shove toward the pier');
  player.hull = 100;

  teleportPlayer(h, point.x + 10, point.z);
  advanceWith(h, BORROWED_LADDER_TUNING.carryMinBeforeReturnS + 1); // carried long enough to count as a return
  assert.equal(eventsOf(h.bus, 'plants:pl279:returned').length, 1, 'back by the bell');
  h.state.simTime += BORROWED_LADDER_TUNING.dayLengthS;
  advanceWith(h, 1);
  assert.ok(ownedOf(h, 'plantsPl279Ladder').filter((e) => h.state.entities.get(e.id)).length === 1,
    'the ladder hangs again for the next hand');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-279 bite: keep it past the bell \u2014 the hook goes empty, the chain lends you nothing, and everyone sees', () => {
  const h = harnessFor(borrowedLadderPlant, BORROWED_LADDER_TUNING, { simTime: 75 });
  advanceWith(h, 1);
  const ladder = ownedOf(h, 'plantsPl279Ladder')[0];
  teleportPlayer(h, ladder.pos.x, ladder.pos.z);
  advanceWith(h, 1);
  const point = hookPointFor(h.state.entities.get(BORROWED_LADDER_TUNING.stationId));
  teleportPlayer(h, point.x + 100, point.z); // carried away from the hook
  advanceWith(h, BORROWED_LADDER_TUNING.dayLengthS * BORROWED_LADDER_TUNING.bellPhase - 75 + 2);
  assert.equal(eventsOf(h.bus, 'plants:pl279:kept').length, 1, 'kept past the bell');
  assert.equal(h.state.story.flags.plantsPl279Kept, true);
  const hook = ownedOf(h, 'plantsPl279Hook')[0];
  assert.equal(hook.data.swarmFloorPad.label, 'EMPTY HOOK', 'everyone sees the empty hook');
  advanceWith(h, 21);
  assert.ok(popups(h.bus).some((p) => p.text === WITNESS_LINE), 'a passer-by says what everyone is thinking');
  h.state.simTime += BORROWED_LADDER_TUNING.dayLengthS;
  advanceWith(h, 1);
  const player = h.state.entities.get('p1');
  player.hull = 30;
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl279:hand').length, 0, 'the chain-lend never fires again');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-280 The window warmer ----------

test('PL-280 positive: dock late inside the extra minute and the late clerk serves you', () => {
  const h = harnessFor(windowWarmerPlant, WINDOW_WARMER_TUNING, { simTime: 190 }); // night, window open
  advanceWith(h, 1);
  assert.ok(warmerOpenAt(h.state.simTime), 'the clerk is holding the window');
  assert.equal(eventsOf(h.bus, 'plants:pl280:open').length, 1, 'one window stays lit');
  dock(h, true, 'p1');
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl280:served').length, 1, 'served late');
  const served = popups(h.bus).find((p) => p.sender === WINDOW_WARMER_TUNING.sender);
  assert.ok(served, 'fines or fuel, either');
  const win = ownedOf(h, 'plantsPl280Window')[0];
  assert.equal(win.data.lampsFlashing, true);
  advanceWith(h, 10);
  assert.equal(eventsOf(h.bus, 'plants:pl280:served').length, 1, 'once per night');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-280 bite: keep them late twice and the window closes for good \u2014 the clerk remembers the hull', () => {
  const h = harnessFor(windowWarmerPlant, WINDOW_WARMER_TUNING, { simTime: 211 }); // night, just closed
  advanceWith(h, 1);
  const point = windowPointFor(h.state.entities.get(WINDOW_WARMER_TUNING.stationId));
  teleportPlayer(h, point.x + 10, point.z);
  advanceWith(h, WINDOW_WARMER_TUNING.loiterS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl280:late').length, 1, 'kept them late, night one');
  h.state.simTime = WINDOW_WARMER_TUNING.dayLengthS + 211; // the next night, closed again
  advanceWith(h, WINDOW_WARMER_TUNING.loiterS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl280:closed').length, 1, 'the window closes for good');
  const win = ownedOf(h, 'plantsPl280Window')[0];
  assert.equal(win.data.lampsFlashing, false, 'the lamp is out');
  assert.equal(win.data.swarmFloorPad.label, 'CLOSED \u2014 STAYED LATE');
  assert.equal(win.data.plantsPl280ClosedForHull, 'p1', 'the clerk remembers the hull');
  assert.equal(h.state.story.flags.plantsPl280ClosedForGood, true);
  dock(h, true, 'p1');
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl280:served').length, 0, 'no service ever again');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-281 The loose bolts box ----------

test('PL-281 positive: take a handful when you need them \u2014 cooldown-gated, and dawn refills quietly', () => {
  const h = harnessFor(looseBoltsPlant, LOOSE_BOLTS_TUNING);
  advanceWith(h, 1);
  const box = ownedOf(h, 'plantsPl281Box')[0];
  assert.equal(box.data.swarmFloorPad.label, 'FREE BOLTS');
  const point = gatePointFor(h.state.entities.get(LOOSE_BOLTS_TUNING.stationId));
  const slot = boltSlotsFor(point)[0];
  teleportPlayer(h, slot.x, slot.z);
  advanceWith(h, LOOSE_BOLTS_TUNING.takeCooldownS * 2 + 1);
  const player = h.state.entities.get('p1');
  assert.ok((player.data.plantsPl281Bolts || 0) >= 1, 'a handful, one bolt per beat');
  assert.equal(eventsOf(h.bus, 'plants:pl281:bolts').length, player.data.plantsPl281Bolts);
  const before = ownedOf(h, 'plantsPl281Bolt').filter((e) => h.state.entities.get(e.id)).length;
  assert.ok(before < LOOSE_BOLTS_TUNING.boltCount, 'the handful came off the gate');
  h.state.simTime += LOOSE_BOLTS_TUNING.dayLengthS; // dawn
  advanceWith(h, 1);
  assert.ok(ownedOf(h, 'plantsPl281Bolt').filter((e) => h.state.entities.get(e.id)).length
    >= LOOSE_BOLTS_TUNING.boltCount - (LOOSE_BOLTS_TUNING.boltCount - before),
  'refilled by nobody anyone can name');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-281 bite: drag the box home and the gate feels different \u2014 no chalk of FREE ever again', () => {
  const h = harnessFor(looseBoltsPlant, LOOSE_BOLTS_TUNING);
  advanceWith(h, 1);
  const box = ownedOf(h, 'plantsPl281Box')[0];
  const point = gatePointFor(h.state.entities.get(LOOSE_BOLTS_TUNING.stationId));
  box.pos.x = point.x + LOOSE_BOLTS_TUNING.keepRangeWu + 80; // dragged home
  box.pos.z = point.z;
  advanceWith(h, LOOSE_BOLTS_TUNING.keepS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl281:tookbox').length, 1, 'the box is yours now');
  assert.equal(h.state.story.flags.plantsPl281BoxGone, true);
  teleportPlayer(h, point.x + 80, point.z); // close enough to see the gate
  advanceWith(h, 1);
  assert.ok(popups(h.bus).length >= 1, 'a yard regular says the gate feels different');
  const boltCount = () => ownedOf(h, 'plantsPl281Bolt').filter((e) => h.state.entities.get(e.id)).length;
  assert.equal(boltCount(), 0, 'no bolts left at the gate');
  h.state.simTime += LOOSE_BOLTS_TUNING.dayLengthS;
  advanceWith(h, 1);
  assert.equal(boltCount(), 0, 'it stops refilling for good');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-282 The coat rack ----------

test('PL-282 positive: leave a spare and it is gone within a shift, replaced by what you lack', () => {
  const h = harnessFor(coatRackPlant, COAT_RACK_TUNING);
  advanceWith(h, 1);
  const point = rackPointFor(h.state.entities.get(COAT_RACK_TUNING.stationId));
  h.helpers.spawnEntity({
    type: 'payload', pos: { x: point.x + 15, z: point.z }, vel: { x: 0, z: 0 },
    radius: 3, mass: 2, data: { masslineTetherable: true },
  });
  advanceWith(h, COAT_RACK_TUNING.leaveS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl282:deposit').length, 1, 'the rack claims your spare');
  advanceWith(h, COAT_RACK_TUNING.shiftS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl282:swap').length, 1, 'replaced within a shift');
  const swap = ownedOf(h, 'plantsPl282Swap')[0];
  assert.ok(swap, 'the swap is physical');
  assert.ok(SWAPS.includes(swap.data.swarmFloorPad.label), 'closer to what you lack');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-282 bite: take two without leaving and the keeper chalks your hull \u2014 the rack goes picked-over', () => {
  const h = harnessFor(coatRackPlant, COAT_RACK_TUNING);
  advanceWith(h, 1);
  const point = rackPointFor(h.state.entities.get(COAT_RACK_TUNING.stationId));
  teleportPlayer(h, point.x, point.z);
  advanceWith(h, COAT_RACK_TUNING.takeCooldownS * 2 + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl282:chalked').length, 1, 'chalked');
  assert.ok(popups(h.bus).some((p) => p.sender === COAT_RACK_TUNING.sender));
  const player = h.state.entities.get('p1');
  assert.equal(player.data.plantsPl282Chalk, chalkFor('p1'), 'the chalk stamp is the handoff');
  const rack = ownedOf(h, 'plantsPl282Rack')[0];
  assert.equal(rack.data.swarmFloorPad.label, 'PICKED-OVER RACK', 'racks go picked-over for you');
  advanceWith(h, COAT_RACK_TUNING.shiftS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl282:swap').length, 0, 'no swaps for the chalked hull');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-283 The gull drone ----------

test('PL-283 positive: pass a gull close and one shiny thing drops \u2014 keeping it is quiet', () => {
  const h = harnessFor(gullDronePlant, GULL_DRONE_TUNING);
  advanceWith(h, 1);
  assert.equal(ownedOf(h, 'plantsPl283Gull').length, GULL_DRONE_TUNING.gullCount, 'the gulls fly the street');
  const radius = 72 * GULL_DRONE_TUNING.ringRadiusMult;
  const pos = gullPosAt(0, { x: 0, z: 0 }, h.state.simTime, radius);
  teleportPlayer(h, pos.x, pos.z);
  advanceWith(h, 1);
  const gift = ownedOf(h, 'plantsPl283Gift')[0];
  assert.ok(gift, 'one shiny thing drops on your deck');
  assert.ok(GULL_DRONE_TUNING.gifts.includes(gift.data.swarmFloorPad.label), 'a button, a ring, a charge cap');
  assert.ok(eventsOf(h.bus, 'plants:pl283:gift').length === 1);
  assert.equal(popups(h.bus).length, 0, 'it does not want anything: no voice, ever');
  teleportPlayer(h, gift.pos.x, gift.pos.z);
  advanceWith(h, GULL_DRONE_TUNING.keepS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl283:kept').length, 1, 'kept');
  const player = h.state.entities.get('p1');
  assert.ok(player.data.plantsPl283Gift, 'the gift rides with you');
  advanceWith(h, GULL_DRONE_TUNING.giftCdS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl283:gift').length, 1, 'cooldown: not a fountain');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-283 bite: shoot at gulls and this street\u2019s gulls will not gift you twice', () => {
  const h = harnessFor(gullDronePlant, GULL_DRONE_TUNING);
  advanceWith(h, 1);
  const radius = 72 * GULL_DRONE_TUNING.ringRadiusMult;
  const pos = gullPosAt(0, { x: 0, z: 0 }, h.state.simTime, radius);
  teleportPlayer(h, pos.x, pos.z);
  h.bus.emit('combat:fire', { ownerId: 'p1' });
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl283:shot').length, 1, 'the gulls felt that');
  assert.equal(h.state.story.flags.plantsPl283ShotGulls, true, 'gulls remember hulls');
  advanceWith(h, GULL_DRONE_TUNING.giftCdS + 5);
  assert.equal(eventsOf(h.bus, 'plants:pl283:gift').length, 0, 'no gift for your hull, ever again');
  assert.equal(ownedOf(h, 'plantsPl283Gull').filter((e) => h.state.entities.get(e.id)).length,
    GULL_DRONE_TUNING.gullCount, 'the gulls keep flying the street');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-284 The night bell ----------

test('PL-284 positive: ring when you need it and a pallet comes out inside a minute', () => {
  const h = harnessFor(nightBellPlant, NIGHT_BELL_TUNING, { simTime: 190 }); // night: you need it
  advanceWith(h, 1);
  const bell = ownedOf(h, 'plantsPl284Bell')[0];
  assert.equal(bell.data.swarmFloorPad.label, 'NIGHT BELL');
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl284:ring').length, 1, 'rung');
  advanceWith(h, NIGHT_BELL_TUNING.palletS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl284:pallet').length, 1, 'inside a minute');
  const pallet = ownedOf(h, 'plantsPl284Pallet')[0];
  assert.equal(pallet.data.swarmFloorPad.label, PALLET_LABEL, 'blanket, hot pack, no questions');
  teleportPlayer(h, pallet.pos.x, pallet.pos.z);
  advanceWith(h, NIGHT_BELL_TUNING.palletTakeS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl284:pallet').filter((e) => e.taken).length, 1, 'taken quietly');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-284 bite: ring it as a joke and the bell comes down for good', () => {
  const h = harnessFor(nightBellPlant, NIGHT_BELL_TUNING, { simTime: 190 });
  advanceWith(h, 1);
  const bell = ownedOf(h, 'plantsPl284Bell')[0];
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  impact(h, bell.id, 100); // the real ring
  advanceWith(h, 1);
  impact(h, bell.id, 100);
  advanceWith(h, 1);
  impact(h, bell.id, 100); // the joke ring, pallet still incoming
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl284:down').length, 1, 'the bell comes down');
  assert.equal(h.state.story.flags.plantsPl284BellDown, true);
  assert.equal(h.state.entities.get(bell.id), undefined, 'the bell is gone');
  const bracket = ownedOf(h, 'plantsPl284Bracket')[0];
  assert.equal(bracket.data.swarmFloorPad.label, 'BELL TAKEN DOWN');
  advanceWith(h, NIGHT_BELL_TUNING.palletS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl284:pallet').length, 0, 'the pallet stops coming');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-284 grind: one sustained bump is one ring — never a joke, and the bell stays up', () => {
  const h = harnessFor(nightBellPlant, NIGHT_BELL_TUNING, { simTime: 190 }); // night: you need it
  advanceWith(h, 1);
  const bell = ownedOf(h, 'plantsPl284Bell')[0];
  // A ~0.2 s grind re-fires physics:impact every contact frame.
  impact(h, bell.id, 100);
  for (let i = 0; i < 4; i++) { h.state.simTime += 0.05; impact(h, bell.id, 100); }
  assert.equal(eventsOf(h.bus, 'plants:pl284:ring').length, 0, 'one bump is not yet a ring');
  assert.equal(eventsOf(h.bus, 'plants:pl284:down').length, 0, 'no joke confiscation from one bump');
  assert.ok(h.state.entities.get(bell.id), 'the bell is still hanging');
  // A second ring after the beat completes once: the pallet is due, the bell stays up.
  h.state.simTime += NIGHT_BELL_TUNING.ringCooldownS;
  impact(h, bell.id, 100);
  assert.equal(eventsOf(h.bus, 'plants:pl284:ring').length, 1, 'exactly one ring');
  advanceWith(h, 0.5);
  assert.equal(eventsOf(h.bus, 'plants:pl284:down').length, 0);
  advanceWith(h, NIGHT_BELL_TUNING.palletS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl284:pallet').length, 1, 'the pallet still comes');
  assert.ok(h.state.entities.get(bell.id), 'the bell stays up');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-285 The fare pool ----------

test('PL-285 positive: tow the skiffer in and the pool marks you covered \u2014 the prepaid tow is real', () => {
  const h = harnessFor(farePoolPlant, FARE_POOL_TUNING);
  advanceWith(h, 1);
  const box = ownedOf(h, 'plantsPl285Box')[0];
  const point = poolPointFor(h.state.entities.get(FARE_POOL_TUNING.stationId));
  const skiffer = ownedOf(h, 'plantsPl285Skiffer')[0];
  assert.ok(skiffer, 'a stranded skiffer is out on the line');
  assert.ok(skiffer.hull < skiffer.hullMax);
  h.bus.emit('tether:attached', { actorId: 'p1', targetId: skiffer.id });
  skiffer.pos.x = point.x + 10; // brought inside the pool range on your line
  skiffer.pos.z = point.z;
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl285:covered').length, 1, 'the pool marks you covered');
  assert.ok(popups(h.bus).some((p) => p.sender === FARE_POOL_TUNING.sender));
  assert.equal(h.state.story.flags.plantsPl285Covered, true);
  assert.equal(box.data.swarmFloorPad.label, 'POOL: YOU ARE COVERED');
  assert.equal(h.state.entities.get(skiffer.id), undefined, 'the pool took the line');

  // The day your hull runs out out there: the prepaid tow, once.
  const player = h.state.entities.get('p1');
  player.hull = 15;
  advanceWith(h, 1);
  const tug = ownedOf(h, 'plantsPl285Tug')[0];
  assert.ok(tug, 'someone comes out for you');
  advanceWith(h, 20, 0.5); // the tug closes and shoves
  assert.equal(eventsOf(h.bus, 'plants:pl285:rescue').length, 1, 'towed in, prepaid');
  assert.ok(Math.hypot(player.vel.x, player.vel.z) > 1, 'a real line\u2019s pull');
  h.bus.emit('entity:killed', { id: 'p1' });
  assert.equal(eventsOf(h.bus, 'plants:pl285:rescueDue').length, 1,
    'the death/respawn owner receives the prepaid-tow receipt');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-285 bite: drop the line away from the pool and it forgets your hull, politely and forever', () => {
  const h = harnessFor(farePoolPlant, FARE_POOL_TUNING);
  advanceWith(h, 1);
  const skiffer = ownedOf(h, 'plantsPl285Skiffer')[0];
  h.bus.emit('tether:attached', { actorId: 'p1', targetId: skiffer.id });
  advanceWith(h, 1);
  h.bus.emit('tether:broken', { targetId: skiffer.id }); // dropped out on the line
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl285:dodged').length, 1, 'dodged a fare you owed');
  assert.ok(popups(h.bus).some((p) => p.sender === FARE_POOL_TUNING.sender));
  assert.equal(h.state.story.flags.plantsPl285Forgot, true);
  h.state.simTime += FARE_POOL_TUNING.dayLengthS;
  advanceWith(h, 1);
  assert.equal(ownedOf(h, 'plantsPl285Skiffer').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the pool sends no skiffer your way again');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-286 The overtime mug ----------

test('PL-286 positive: working past the bell, the foreman\u2019s drone brings a hot mug; drinking warms you', () => {
  const h = harnessFor(overtimeMugPlant, OVERTIME_MUG_TUNING, { simTime: 182 }); // overtime band
  teleportPlayer(h, 150, 0, { x: 20, z: 0 }); // still working
  advanceWith(h, 30, 0.5); // the drone climbs the line
  const mug = ownedOf(h, 'plantsPl286Mug')[0];
  assert.ok(mug, 'the mug is handed over, no charge');
  assert.equal(mug.data.swarmFloorPad.label, MUG_LABEL);
  assert.ok(eventsOf(h.bus, 'plants:pl286:mug').length === 1);
  teleportPlayer(h, mug.pos.x, mug.pos.z, { x: 20, z: 0 });
  advanceWith(h, OVERTIME_MUG_TUNING.drinkS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl286:drunk').length, 1, 'drunk');
  const player = h.state.entities.get('p1');
  assert.ok(Number.isFinite(player.data.plantsPl286WarmedUntil), 'the warm stamp');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-286 bite: pour it out twice and the drones remember who does not drink', () => {
  const h = harnessFor(overtimeMugPlant, OVERTIME_MUG_TUNING, { simTime: 182 });
  teleportPlayer(h, 150, 0, { x: 20, z: 0 });
  let mug = null;
  for (let i = 0; i < 80 && !mug; i += 1) {
    advanceWith(h, 0.5);
    mug = ownedOf(h, 'plantsPl286Mug').find((e) => h.state.entities.get(e.id));
  }
  assert.ok(mug, 'first overtime, first mug');
  impact(h, mug.id, 100); // pour it out to keep working
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl286:poured').length, 1, 'poured out to keep working');

  h.state.simTime = OVERTIME_MUG_TUNING.dayLengthS + 182; // the next overtime band
  teleportPlayer(h, 150, 0, { x: 20, z: 0 });
  mug = null;
  for (let i = 0; i < 80 && !mug; i += 1) {
    advanceWith(h, 0.5);
    mug = ownedOf(h, 'plantsPl286Mug').find((e) => h.state.entities.get(e.id));
  }
  assert.ok(mug, 'the drone tries once more');
  impact(h, mug.id, 100);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl286:poured').length, 2);
  assert.ok(popups(h.bus).some((p) => p.text === POURED_LINE), 'drones remember who does not drink');
  assert.equal(h.state.story.flags.plantsPl286NoMug, true);

  h.state.simTime = 2 * OVERTIME_MUG_TUNING.dayLengthS + 182;
  teleportPlayer(h, 150, 0, { x: 20, z: 0 });
  advanceWith(h, 30, 0.5);
  assert.equal(ownedOf(h, 'plantsPl286Mug').filter((e) => h.state.entities.get(e.id)).length, 0,
    'no drone comes to you again');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-287 The chalk seat ----------

test('PL-287 positive: sit anywhere else and the vendors serve your line first', () => {
  const h = harnessFor(chalkSeatPlant, CHALK_SEAT_TUNING);
  advanceWith(h, 1);
  const seats = seatsFor(h.state.entities.get(CHALK_SEAT_TUNING.stationId).pos);
  const reserved = ownedOf(h, 'plantsPl287Seat')[CHALK_SEAT_TUNING.reservedIndex];
  assert.equal(reserved.data.swarmFloorPad.label, 'RESERVED', 'one seat chalked, every day');
  teleportPlayer(h, seats[1].x, seats[1].z);
  advanceWith(h, CHALK_SEAT_TUNING.sitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl287:served').length, 1, 'your line first');
  assert.ok(popups(h.bus).some((p) => p.text === SEAT_SERVED_LINE));
  advanceWith(h, 20); // still sitting, but inside the served cooldown
  assert.equal(eventsOf(h.bus, 'plants:pl287:served').length, 1, 'cooldown: once per visit');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-287 bite: sit in the chalked seat \u2014 full price for a month, and the chalk does not fade', () => {
  const h = harnessFor(chalkSeatPlant, CHALK_SEAT_TUNING);
  advanceWith(h, 1);
  const seats = seatsFor(h.state.entities.get(CHALK_SEAT_TUNING.stationId).pos);
  teleportPlayer(h, seats[CHALK_SEAT_TUNING.reservedIndex].x, seats[CHALK_SEAT_TUNING.reservedIndex].z);
  advanceWith(h, CHALK_SEAT_TUNING.sitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl287:sat').length, 1);
  const player = h.state.entities.get('p1');
  const until = player.data.plantsPl287FullPriceUntil;
  assert.ok(Math.abs(until - (h.state.simTime + CHALK_SEAT_TUNING.monthS)) <= 1.5,
    'full price for a month from the moment you sat (economy owner reads this stamp)');
  teleportPlayer(h, seats[1].x, seats[1].z);
  advanceWith(h, CHALK_SEAT_TUNING.sitNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl287:served').length, 0, 'no favor at full price');
  assert.equal(eventsOf(h.bus, 'plants:pl287:fullPrice').length, 1);
  const reserved = ownedOf(h, 'plantsPl287Seat')[CHALK_SEAT_TUNING.reservedIndex];
  assert.equal(reserved.data.swarmFloorPad.label, 'RESERVED', 'the chalk does not fade');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-288 The lantern loan ----------

test('PL-288 positive: take it, bring it back lit, and the hook thanks you', () => {
  const h = harnessFor(lanternLoanPlant, LANTERN_LOAN_TUNING);
  advanceWith(h, 1);
  const lantern = ownedOf(h, 'plantsPl288Lantern')[0];
  assert.equal(ownedOf(h, 'plantsPl288Hook')[0].data.swarmFloorPad.label, 'TAKE \u2014 RETURN LIT');
  teleportPlayer(h, lantern.pos.x, lantern.pos.z);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl288:take').length, 1, 'taken');
  assert.equal(lantern.data.lampsFlashing, true, 'the flame is real');
  const point = lanternHookPointFor(h.state.entities.get(LANTERN_LOAN_TUNING.stationId));
  teleportPlayer(h, point.x + 10, point.z); // back while it still burns
  advanceWith(h, LANTERN_LOAN_TUNING.carryMinBeforeReturnS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl288:lit').length, 1, 'returned lit');
  h.state.simTime += 1;
  advanceWith(h, 1);
  assert.equal(ownedOf(h, 'plantsPl288Lantern').filter((e) => h.state.entities.get(e.id)).length, 1,
    'the loan re-arms for the next dark hold');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-288 bite: return it dead and lantern loans go dry for you by next bell', () => {
  const h = harnessFor(lanternLoanPlant, LANTERN_LOAN_TUNING);
  advanceWith(h, 1);
  const lantern = ownedOf(h, 'plantsPl288Lantern')[0];
  teleportPlayer(h, lantern.pos.x, lantern.pos.z);
  advanceWith(h, 1);
  const point0 = lanternHookPointFor(h.state.entities.get(LANTERN_LOAN_TUNING.stationId));
  teleportPlayer(h, point0.x + 100, point0.z); // carry it out on the job while it burns
  advanceWith(h, LANTERN_LOAN_TUNING.burnS + 1); // the oil runs out in your hands
  assert.equal(lantern.data.lampsFlashing, false, 'dead');
  const point = lanternHookPointFor(h.state.entities.get(LANTERN_LOAN_TUNING.stationId));
  teleportPlayer(h, point.x + 10, point.z);
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl288:dead').length, 1, 'returned dead');
  assert.equal(eventsOf(h.bus, 'plants:pl288:dry').length, 1);
  assert.equal(h.state.story.flags.plantsPl288Dry, true);
  assert.equal(h.state.entities.get(h.tuning.stationId).data.plantsPl288DryForHull, 'p1',
    'town-wide receipt on the station');
  h.state.simTime += LANTERN_LOAN_TUNING.dayLengthS; // next bell
  advanceWith(h, 1);
  const hook = ownedOf(h, 'plantsPl288Hook')[0];
  assert.equal(hook.data.swarmFloorPad.label, 'NO LANTERNS');
  assert.equal(ownedOf(h, 'plantsPl288Lantern').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the hook is dry');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-289 The covered window ----------

test('PL-289 positive: nap through the night and the walker plates your window; catch them to say thanks', () => {
  const h = harnessFor(coveredWindowPlant, COVERED_WINDOW_TUNING, { simTime: 185 }); // night
  advanceWith(h, 1);
  assert.ok(ownedOf(h, 'plantsPl289Berth')[0], 'the unlit public berth');
  const berth = berthPointFor(h.state.entities.get(COVERED_WINDOW_TUNING.stationId));
  teleportPlayer(h, berth.x, berth.z);
  advanceWith(h, COVERED_WINDOW_TUNING.napNeedS + 2);
  advanceWith(h, 38, 0.5); // the walker works their route toward the berth
  const plate = ownedOf(h, 'plantsPl289Plate')[0];
  assert.ok(plate, 'someone plated your window');
  assert.equal(plate.data.lampsFlashing, false, 'silent presence: no lamp, no voice');
  assert.equal(eventsOf(h.bus, 'plants:pl289:plated').length, 1);
  // Wake and catch the walker before the night ends: out of the berth zone, near their pause.
  teleportPlayer(h, berth.x + 28, berth.z);
  advanceWith(h, 6, 0.5);
  assert.equal(eventsOf(h.bus, 'plants:pl289:thanks').length, 1, 'thanked, if you catch them');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-289 bite: leave your trash in the berth and the walker routes past you for good', () => {
  const h = harnessFor(coveredWindowPlant, COVERED_WINDOW_TUNING, { simTime: 185 });
  advanceWith(h, 1);
  const berth = berthPointFor(h.state.entities.get(COVERED_WINDOW_TUNING.stationId));
  h.helpers.spawnEntity({
    type: 'payload', pos: { x: berth.x + 8, z: berth.z }, vel: { x: 0, z: 0 },
    radius: 3, mass: 2, data: { commodityId: 'cmdty_scrap', amount: 1 },
  });
  advanceWith(h, COVERED_WINDOW_TUNING.trashS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl289:trash').length, 1, 'trash noticed');
  assert.equal(h.state.story.flags.plantsPl289Trashed, true);
  assert.equal(ownedOf(h, 'plantsPl289Walker').filter((e) => h.state.entities.get(e.id)).length, 0,
    'the walker is gone from your route');
  teleportPlayer(h, berth.x, berth.z);
  advanceWith(h, COVERED_WINDOW_TUNING.dayLengthS, 0.5); // a full night in the berth
  assert.equal(eventsOf(h.bus, 'plants:pl289:plated').length, 0, 'no more covered windows');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-290 The good word ----------

test('PL-290 positive: hold the line for the dockhand and a berth opens up without being asked', () => {
  const h = harnessFor(goodWordPlant, GOOD_WORD_TUNING, { simTime: 120 });
  advanceWith(h, 1);
  assert.ok(ownedOf(h, 'plantsPl290Dockhand')[0], 'Rooks is on the dock face');
  const layout = dockLayoutFor(h.state.entities.get(GOOD_WORD_TUNING.stationId));
  teleportPlayer(h, layout.line.x, layout.line.z);
  advanceWith(h, GOOD_WORD_TUNING.holdNeedS + 1);
  const favor = eventsOf(h.bus, 'plants:pl290:favor');
  assert.equal(favor.length, 1, 'the favor was seen');
  assert.equal(favor[0].kind, 'hold');
  advanceWith(h, 1);
  assert.equal(eventsOf(h.bus, 'plants:pl290:berth').length, 1, 'a berth opens, unasked');
  assert.ok(popups(h.bus).some((p) => p.text === WORD_LINE));
  const reserved = ownedOf(h, 'plantsPl290Berth').find((b) => b.data.plantsPl290ReservedForYou);
  assert.ok(reserved, 'the berth is physically reserved');
  assert.equal(reserved.data.swarmFloorPad.label, 'OPEN \u2014 YOURS');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-290 favors: spotting the loose strap counts; three cold takes and the word stops traveling', () => {
  // Spotting a loose strap is its own favor.
  const h1 = harnessFor(goodWordPlant, GOOD_WORD_TUNING, { simTime: 0 });
  advanceWith(h1, GOOD_WORD_TUNING.strapEveryS + 1);
  const strap = ownedOf(h1, 'plantsPl290Strap')[0];
  assert.ok(strap, 'a strap works loose on the dockhand\u2019s line');
  impact(h1, strap.id, GOOD_WORD_TUNING.strapSpotImpulse + 10);
  advanceWith(h1, 1);
  assert.equal(eventsOf(h1.bus, 'plants:pl290:favor').length, 1);
  assert.equal(eventsOf(h1.bus, 'plants:pl290:favor')[0].kind, 'strap');
  h1.plant.destroy();
  assertNoListeners(h1.bus);

  // Cold takes: berths used, favors never given.
  const h = harnessFor(goodWordPlant, GOOD_WORD_TUNING, { simTime: 100 });
  advanceWith(h, 1);
  const layout = dockLayoutFor(h.state.entities.get(GOOD_WORD_TUNING.stationId));
  for (let take = 0; take < GOOD_WORD_TUNING.coldTakesForBite; take += 1) {
    teleportPlayer(h, layout.berths[0].x, layout.berths[0].z);
    advanceWith(h, GOOD_WORD_TUNING.takeS + 1);
    teleportPlayer(h, layout.berths[0].x + 200, layout.berths[0].z); // leave, come back cold
    advanceWith(h, 1);
  }
  assert.equal(eventsOf(h.bus, 'plants:pl290:cold').length, 3, 'the ledger counts cold takes');
  assert.equal(eventsOf(h.bus, 'plants:pl290:filled').length, 1, 'the word stops traveling');
  assert.ok(popups(h.bus).some((p) => p.text === FILLED_LINE));
  assert.equal(h.state.story.flags.plantsPl290WordCold, true);
  teleportPlayer(h, layout.berths[0].x, layout.berths[0].z);
  advanceWith(h, 1);
  assert.ok(ownedOf(h, 'plantsPl290Berth').some((b) => b.data.plantsPl290Filled && b.data.swarmFloorPad.label === 'FILLED'),
    'berths fill around you');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- PL-291 The sampler ----------

test('PL-291 positive: slow down once and the first taste is free', () => {
  const h = harnessFor(theSamplerPlant, THE_SAMPLER_TUNING);
  advanceWith(h, 1);
  const point = stallPointFor(h.state.entities.get(THE_SAMPLER_TUNING.stationId));
  teleportPlayer(h, point.x + 30, point.z);
  advanceWith(h, THE_SAMPLER_TUNING.tasteNeedS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl291:taste').length, 1, 'the first taste');
  assert.ok(popups(h.bus).some((p) => p.text === TASTE_LINE));
  const taste = ownedOf(h, 'plantsPl291Taste')[0];
  assert.ok(taste, 'the taste is physical');
  advanceWith(h, THE_SAMPLER_TUNING.eatS + 1);
  assert.equal(eventsOf(h.bus, 'plants:pl291:eaten').length, 1, 'eaten');
  advanceWith(h, 2);
  assert.equal(eventsOf(h.bus, 'plants:pl291:taste').length, 1, 'first taste only');
  h.plant.destroy();
  assertNoListeners(h.bus);
});

test('PL-291 bite: rush past daily and the day you stop, they point you to the back of the queue', () => {
  const h = harnessFor(theSamplerPlant, THE_SAMPLER_TUNING);
  const point = stallPointFor(h.state.entities.get(THE_SAMPLER_TUNING.stationId));
  for (let day = 0; day < THE_SAMPLER_TUNING.rushDaysForQueue; day += 1) {
    h.state.simTime = day * THE_SAMPLER_TUNING.dayLengthS + 10;
    teleportPlayer(h, point.x + 30, point.z, { x: 40, z: 0 }); // past the stall, in a hurry
    advanceWith(h, 1);
  }
  assert.equal(eventsOf(h.bus, 'plants:pl291:rush').length, 1, 'the stall counted, in silence, until now');
  teleportPlayer(h, point.x + 30, point.z);
  advanceWith(h, THE_SAMPLER_TUNING.queueWaitS + THE_SAMPLER_TUNING.tasteNeedS + 1);
  assert.ok(ownedOf(h, 'plantsPl291Queue').length === THE_SAMPLER_TUNING.queueCount,
    'the queue materializes ahead of you');
  const queue = popups(h.bus).find((p) => p.text === QUEUE_LINE);
  assert.ok(queue, 'the exact line: back of the queue you could have skipped');
  assert.equal(eventsOf(h.bus, 'plants:pl291:queue').length, 1);
  h.plant.destroy();
  assertNoListeners(h.bus);
});

// ---------- determinism smoke ----------

test('determinism: the same mercy scenario twice produces the same bus transcript, stamp for stamp', () => {
  const run = () => {
    const h = harnessFor(goodWordPlant, GOOD_WORD_TUNING, { simTime: 120 });
    advanceWith(h, GOOD_WORD_TUNING.holdNeedS + 2);
    advanceWith(h, 2);
    h.plant.destroy();
    return {
      log: h.bus.log.map((e) => JSON.stringify({ t: e.type, p: e.payload })),
      removed: [...h.helpers.removed].sort(),
      reserved: ownedOf(h, 'plantsPl290Berth').map((b) => b.data.plantsPl290ReservedForYou === true),
    };
  };
  const a = run();
  const b = run();
  assert.deepEqual(a, b, 'no Math.random, no Date.now: identical runs, identical worlds');
});
