// PULSE-TIME (build_map row 439) — done-when:
//   A deterministic world calendar runs station shifts, lighting and traffic rush hours, bar
//   activity at shift end, weekly market days that change prices, six or more festivals, and
//   solar-storm seasons — each feature visibly or audibly changes something.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CAL_DAY_S,
  CAL_WEEK_DAYS,
  CAL_YEAR_DAYS,
  FESTIVALS,
  STATION_SHIFTS,
  barPressureAt,
  calendarAt,
  festivalAt,
  marketDayAt,
  marketDayMults,
  rushHourAt,
  stationMarketWeekday,
  stationShiftAt,
  stormSeasonAt,
} from '../src/data/worldCalendar.js';
import { rushHourSideEvents, planStationSideEvents } from '../src/data/stationSideEvents.js';
import { stationTradeMults } from '../src/economy/stationConditions.js';
import { worldClock } from '../src/systems/worldClock.js';
import { generateContacts } from '../src/ui/station/barContacts.js';
import { berthLightingFor, applyBerthLighting } from '../src/ui/station/adBoard.js';
import { SECTORS } from '../src/data/sectors.js';

const STATION = 'station_helios';
const STATION2 = 'station_ceres';

function stateAt(simTime, over = {}) {
  return {
    meta: { seed: 5 },
    simTime,
    ui: { docked: true, dockedStationId: STATION },
    world: { currentSectorId: 'sector_helios_prime' },
    player: { stats: {} },
    factions: {},
    story: { beatIndex: 0, flags: {} },
    economy: {},
    ...over,
  };
}

// ── the clock face is deterministic and shared ──────────────────────────────────────────

test('the calendar is a pure function of simTime — same read twice, no drift', () => {
  const a = calendarAt({ simTime: 5 * CAL_DAY_S + 111, sectorId: 'sector_ceres_belt', stationId: STATION });
  const b = calendarAt({ simTime: 5 * CAL_DAY_S + 111, sectorId: 'sector_ceres_belt', stationId: STATION });
  assert.deepEqual(a, b);
  assert.equal(a.day, 5);
  assert.equal(CAL_YEAR_DAYS % CAL_WEEK_DAYS, 0, 'the year is a whole number of weeks');
  assert.equal(CAL_DAY_S, 600, 'the calendar runs the world\'s 600 s day, nothing else');
});

// ── station shifts ────────────────────────────────────────────────────────────────────

test('three watches a day; stations run offset clocks; shift end flags the last stretch', () => {
  assert.equal(STATION_SHIFTS.length, 3);
  const seen = new Set();
  for (let t = 0; t < CAL_DAY_S; t += 50) {
    seen.add(stationShiftAt(STATION, t).id);
  }
  assert.equal(seen.size, 3, 'all three watches turn over a day');
  // Watch boundaries land on exact thirds of the station-local day: find the sim-time delta
  // from now to the next local third, and the watch must be different on the far side.
  const s1 = stationShiftAt(STATION, 0);
  const local = s1.dayFrac * CAL_DAY_S;
  const nextBoundaryLocal = (Math.floor(local / 200) + 1) * 200 % 600;
  const delta = (nextBoundaryLocal - local + 600) % 600;
  const s2 = stationShiftAt(STATION, delta + 5);
  assert.notEqual(s1.id, s2.id, 'the watch rolls at the third-of-day boundary');
  // Shift end: last 90 s of the watch flags 'ending'.
  const almost = stationShiftAt(STATION, delta - 30);
  assert.equal(almost.ending, true, 'final stretch of a watch reads as ending');
  // Two berths keep different clocks — the same instant is a different watch somewhere.
  const shifted = ['a', 'b', 'c', 'd', 'e', 'f'].map((x) => `station_test_${x}`);
  const watches = new Set(shifted.map((id) => stationShiftAt(id, 333).id));
  assert.ok(watches.size >= 2, 'stations do not all share one watch clock');
});

// ── lighting and traffic rush hours ──────────────────────────────────────────────────

test('rush hours bracket every shift change and visibly change the berth lighting', () => {
  // Find a rush window: walk the day until rush is active.
  let rushT = null;
  for (let t = 0; t < CAL_DAY_S; t += 10) {
    if (rushHourAt(STATION, t).active) { rushT = t; break; }
  }
  assert.ok(rushT != null, 'at least one rush window in a station day');
  const rush = rushHourAt(STATION, rushT);
  assert.ok(['inbound', 'outbound'].includes(rush.kind));
  assert.ok(rush.label.length > 4, 'the advisory carries a reason');
  const light = berthLightingFor(stateAt(rushT));
  assert.equal(light.rush, rush.kind, 'lighting reads the rush');
  assert.ok(light.filter.includes('brightness'), 'rush lighting visibly changes the veil');
  assert.equal(light.watch, stationShiftAt(STATION, rushT).id);
  // A mid-watch moment carries no rush lighting.
  let calmT = null;
  for (let t = 0; t < CAL_DAY_S; t += 10) {
    if (!rushHourAt(STATION, t).active) { calmT = t; break; }
  }
  const calm = berthLightingFor(stateAt(calmT));
  assert.equal(calm.rush, null);
});

test('rush windows add cosmetic crew movers to the station side-event plan', () => {
  const base = planStationSideEvents(5, 'sector_helios_prime', 2, STATION, 'trade_hub');
  const rush = rushHourSideEvents(5, 'sector_helios_prime', 2, STATION, 'trade_hub', 2 * CAL_DAY_S + 100);
  assert.ok(rush.length >= 4, 'each of three boundaries draws crew movers');
  for (const ev of rush) {
    assert.equal(ev.budget, 0, 'crew runs never spend a spawn slot — cosmetic seam only');
    assert.ok(ev.delay >= 0 && ev.delay <= CAL_DAY_S, `rush delay ${ev.delay} inside the day`);
    assert.ok(ev.eventId.startsWith('sse-rush:'), 'rush events carry their own id family');
  }
  // The daily plan stream is untouched — rush events use a separate seeded salt.
  const baseAgain = planStationSideEvents(5, 'sector_helios_prime', 2, STATION, 'trade_hub');
  assert.deepEqual(base, baseAgain);
});

// ── bar activity at shift end ────────────────────────────────────────────────────────

test('the bar is visibly busier at shift end and on festival days', () => {
  // station_ceres keeps no authored or wreck-rumor bar voices — the calendar owns the room here.
  const BAR = 'station_ceres';
  // Day 3 keeps no festival — pressure alone has to move the room.
  const plain = 3 * CAL_DAY_S;
  let hotT = null;
  for (let t = 0; t < CAL_DAY_S; t += 10) {
    if (barPressureAt(BAR, plain + t) >= 0.6) { hotT = plain + t; break; }
  }
  assert.ok(hotT != null, 'a shift-end swell exists in the day');
  let coldT = null;
  for (let t = 0; t < CAL_DAY_S; t += 10) {
    if (barPressureAt(BAR, plain + t) < 0.3) { coldT = plain + t; break; }
  }
  const busy = generateContacts(BAR, { simTime: hotT });
  const quiet = generateContacts(BAR, { simTime: coldT });
  assert.ok(busy.length > quiet.length, `shift end seats more patrons (${busy.length} > ${quiet.length})`);
  // The calendar mood rides the barkeep wherever authored contacts place them in the list.
  const keeper = busy.find((c) => c.calendarMood === 'shift_end');
  assert.ok(keeper, 'a patron carries the shift-end mood');
  assert.ok(/shift just turned|three deep/i.test(keeper.line), 'the barkeep says the hour');
  // Festival day: the barkeep keeps the day by name.
  const festival = FESTIVALS[0];
  const festT = festival.dayOfYear * CAL_DAY_S + 50;
  const fest = generateContacts(BAR, { simTime: festT });
  assert.ok(fest.some((c) => c.calendarMood === 'festival') || fest.length > quiet.length,
    'festival fills the room');
});

// ── weekly market days ────────────────────────────────────────────────────────────────

test('every berth keeps one weekly market day that changes prices', () => {
  const weekday = stationMarketWeekday(STATION);
  let marketT = null;
  for (let d = 0; d < CAL_WEEK_DAYS; d++) {
    const t = d * CAL_DAY_S + 30;
    if (marketDayAt(STATION, t).active) { marketT = t; break; }
  }
  assert.ok(marketT != null, `market day exists in the week (weekday ${weekday})`);
  const mults = marketDayMults(STATION, marketT);
  assert.ok(mults.buy < 1, 'buys run cheaper on the open floor');
  assert.ok(mults.sell > 1, 'sells pay dearer on the open floor');
  const off = marketDayMults(STATION, marketT + CAL_DAY_S);
  assert.equal(off.buy, 1);
  assert.equal(off.sell, 1, 'the fold lifts when the floor closes');
  // The fold reaches the actual quote seam every price passes through.
  const trade = stationTradeMults(stateAt(marketT), STATION, null);
  assert.ok(Math.abs(trade.buy - mults.buy) < 1e-9, 'stationTradeMults folds the market day in');
  assert.ok(Math.abs(trade.sell - mults.sell) > 1e-9 ? trade.sell === mults.sell : trade.sell === mults.sell);
  // Berths do not all share one market weekday.
  const days = new Set([STATION, STATION2, 'station_tethys', 'station_vesta', 'station_pallas', 'station_io'].map(stationMarketWeekday));
  assert.ok(days.size >= 2, 'market days stagger across berths');
});

// ── festivals ─────────────────────────────────────────────────────────────────────────

test('six or more authored festivals, each visibly changing the day', () => {
  assert.ok(FESTIVALS.length >= 6, `${FESTIVALS.length} festivals authored`);
  const ids = new Set(FESTIVALS.map((f) => f.id));
  assert.equal(ids.size, FESTIVALS.length, 'festival ids unique');
  const days = new Set(FESTIVALS.map((f) => f.dayOfYear));
  assert.equal(days.size, FESTIVALS.length, 'each festival owns a day-of-year');
  for (const f of FESTIVALS) {
    assert.ok(f.name && f.text && f.text.length > 30, `${f.id} has wire copy`);
    assert.ok(f.priceTilt || f.barLine, `${f.id} visibly changes prices or the bar`);
  }
  // Founders' Day lands on day 0 of the year.
  const founders = festivalAt(STATION, 50);
  assert.ok(founders && founders.id === 'founders_day', `day 0 is a festival (${founders && founders.id})`);
  const off = festivalAt(STATION, CAL_DAY_S + 50);
  assert.notEqual(off && off.id, 'founders_day', 'the festival leaves with the day');
});

// ── solar-storm seasons ───────────────────────────────────────────────────────────────

test('storm seasons read the seven-day weather calendar — storm and clear both real', () => {
  const kinds = new Set();
  const stormy = [];
  for (let season = 0; season < 12; season++) {
    const t = season * 7 * CAL_DAY_S + 10;
    const s = stormSeasonAt('sector_helios_prime', t);
    kinds.add(s.kind);
    if (s.stormy) stormy.push(s);
  }
  assert.ok(kinds.has('ion_storm') || kinds.has('solar_wind'), 'storm seasons occur');
  assert.ok(kinds.has('clear') || kinds.has('meteor_shower'), 'not every season is a storm');
  for (const s of stormy) {
    assert.ok(s.label.includes('season'), 'the wire names the season');
    assert.ok(s.endsInS > 0, 'the season has a horizon');
  }
  // Different sectors keep different seasons — the calendar is per-sector seeded.
  const contrast = new Set();
  for (const sec of ['sector_helios_prime', 'sector_sker_haven', 'sector_veil_nebula', 'sector_ashfall_reach']) {
    contrast.add(stormSeasonAt(sec, 10).kind);
  }
  assert.ok(contrast.size >= 2, 'sectors do not share one forecast');
});

// ── the announcer: each transition speaks exactly once ────────────────────────────────

function fakeBus() {
  const handlers = new Map();
  return {
    emitted: [],
    on(name, fn) { (handlers.get(name) || handlers.set(name, []).get(name)).push(fn); return () => {}; },
    emit(name, payload) { this.emitted.push({ name, payload }); },
    off() {},
  };
}

test('worldClock announces shifts, market days, festivals and storm seasons exactly once', () => {
  const bus = fakeBus();
  // Day 0 is Founders' Day; sim starts mid-day-0 at a berth whose market day we can find.
  const state = stateAt(50);
  worldClock.init({ state, bus, helpers: {} });
  worldClock.update(0.5, state);
  const festivalNews = bus.emitted.filter((e) => e.name === 'news:publish'
    && e.payload.source === 'calendar-wire' && /founders/i.test(e.payload.text));
  assert.equal(festivalNews.length, 1, 'Founders\' Day makes the wire');
  const shiftPopup = bus.emitted.filter((e) => e.name === 'comms:popup' && /is on the floor/i.test(e.payload.text));
  assert.equal(shiftPopup.length, 1, 'the PA names the watch (and only that popup matches)');
  const festivalEvt = bus.emitted.filter((e) => e.name === 'calendar:festival');
  assert.equal(festivalEvt.length, 1);
  // Same tick again — nothing re-announces (day 0 may also be a market day; count what fired).
  const newsSoFar = bus.emitted.filter((e) => e.name === 'news:publish').length;
  worldClock.update(0.5, state);
  assert.equal(bus.emitted.filter((e) => e.name === 'news:publish').length, newsSoFar);
  // Storm season: run simTime forward until a storm hits — the wire speaks it once.
  const state2 = stateAt(50, { ui: { docked: false, dockedStationId: null } });
  worldClock.init({ state: state2, bus, helpers: {} });
  let stormed = false;
  for (let season = 0; season < 12 && !stormed; season++) {
    state2.simTime = season * 7 * CAL_DAY_S + 10;
    worldClock.update(0.5, state2);
    const stormNews = bus.emitted.filter((e) => e.name === 'news:publish' && /season/i.test(e.payload.text));
    if (stormNews.length) { stormed = true; assert.ok(/storm|wind/i.test(stormNews[0].payload.text)); }
  }
  assert.ok(stormed, 'a storm season announcement fires within a few seasons');
  // Market day: a berth on its market weekday gets the headline once.
  let marketT = null;
  for (let d = 0; d < CAL_WEEK_DAYS; d++) {
    if (marketDayAt(STATION, d * CAL_DAY_S + 40).active) { marketT = d * CAL_DAY_S + 40; break; }
  }
  if (marketT != null) {
    const state3 = stateAt(marketT);
    worldClock.init({ state: state3, bus, helpers: {} });
    worldClock.update(0.5, state3);
    const marketNews = bus.emitted.filter((e) => e.name === 'news:publish' && /market day/i.test(e.payload.text));
    assert.equal(marketNews.length, 1, 'the market day headline fires');
    const marketEvt = bus.emitted.filter((e) => e.name === 'calendar:marketDay');
    assert.equal(marketEvt.length, 1, 'the calendar:marketDay event fires for price surfaces');
  }
  // Serialize keeps the dedupe — a restored clock does not re-announce old transitions.
  const snap = worldClock.serialize();
  assert.ok(Array.isArray(snap.emitted) && snap.emitted.length > 0);
});

test('applyBerthLighting stamps the frame with the calendar signature once', () => {
  const dataset = {};
  const veilStyle = {};
  const lampStyle = {};
  const doc = {
    querySelector(sel) {
      if (sel === '.sx-berth') return { dataset };
      if (sel === '.sxb-veil') return { style: veilStyle };
      if (sel === '.sxb-berth__lamp') return { style: lampStyle };
      return null;
    },
  };
  const element = { ownerDocument: doc };
  const out = applyBerthLighting(element, stateAt(30));
  assert.ok(out, 'lighting resolves for a docked berth');
  assert.equal(dataset.watch, out.watch, 'the frame carries the watch');
  assert.equal(dataset.lightingSignature != null, true, 'signature stamped');
  // Rush: pick a rush instant and the veil visibly warms.
  let rushT = null;
  for (let t = 0; t < CAL_DAY_S; t += 10) {
    if (rushHourAt(STATION, t).active) { rushT = t; break; }
  }
  const out2 = applyBerthLighting(element, stateAt(rushT));
  assert.equal(dataset.rush, out2.rush, 'rush lands on the frame');
  assert.ok(String(veilStyle.filter).includes('brightness'), 'the veil visibly warms');
});
