// inf-pa-market-desk — WF-13: the station PA finally says what its own market just did.
//
// Before this unit the docked station's public address rang watch bells, cleared berth
// lanes, and recited standing notices on a loop — while the market it stood in starved,
// spiked, and settled without a word over its own speakers. This pins the market desk:
//   * an active shortage the world's news owner recorded for THIS station is the desk's
//     first voice, phrased for the berth and never borrowed from another station;
//   * otherwise the biggest listing move against a mid at least one watch old on the
//     desk's own price history speaks, with both a credits floor and a fraction gate —
//     a two-credit drift is weather, not news;
//   * no market, no history, a younger-than-a-watch reference, or nothing past the gates
//     leaves the desk silent — it never invents a market;
//   * the desk chime is a defined ambient recipe that renders real sources and carries
//     its accessibility caption;
//   * the presenter gives the desk one free PA slot per watch — chime, then line, then
//     the ordinary rotation resumes — and bay calls and louder voices still outrank it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const lifeDataUrl = new URL('../src/data/stationLife.js', import.meta.url);
const lifePresenterUrl = new URL('../src/ui/station/stationLife.js', import.meta.url);
const audioRecipesUrl = new URL('../src/data/audioRecipes.js', import.meta.url);
const captionsUrl = new URL('../src/ui/captions.js', import.meta.url);

const { stationMarketLine, MARKET_WATCH_S, MARKET_MOVE_MIN_CR } = await import(lifeDataUrl.href);
const { createStationLifePresenter } = await import(lifePresenterUrl.href);
const { RECIPES } = await import(audioRecipesUrl.href);
const captions = await import(captionsUrl.href);

const STATION = 'station_helios';
const CHIME = 'ambient_station_market_chime';

function baseState() {
  return { simTime: 4000, ui: { docked: true, dockedStationId: STATION } };
}

test('an active shortage at this station is the desk’s first voice, and only this station’s', () => {
  const state = baseState();
  state.worldNews = { starved: { [`${STATION}:cmdty_ore_iron`]: 'Iron Ore is starved at Helios Station.' } };
  const line = stationMarketLine(state, STATION);
  assert.ok(line, 'a starved listing speaks');
  assert.match(line.text, /Market desk: Iron Ore is starved at this berth\./);
  // Another station's shortage is not this desk's news.
  const other = stationMarketLine(state, 'station_elsewhere');
  assert.equal(other, null);
});

test('the biggest honest move against a watch-old mid speaks, with credits and direction', () => {
  const state = baseState();
  state.economy = { markets: { [STATION]: {
    cmdty_food: { lastMid: 115, history: [[state.simTime - (MARKET_WATCH_S + 40), 95], [state.simTime - 30, 113]] },
    cmdty_ore_iron: { lastMid: 15, history: [[state.simTime - (MARKET_WATCH_S + 40), 14], [state.simTime - 30, 14.6]] },
  } } };
  const observed = {stationId:STATION,asOf:state.simTime,comparisons:{
    cmdty_food:{current:115,reference:95,observedAt:state.simTime-240},
    cmdty_ore_iron:{current:15,reference:14,observedAt:state.simTime-240}}};
  const line = stationMarketLine(state, STATION, observed);
  assert.ok(line, 'a real move speaks');
  assert.match(line.text, /Market desk: Provisions is up 20 compared with 240 seconds ago\./);
});

test('a move below the credits floor or the fraction gate is weather, not news', () => {
  const state = baseState();
  state.economy = { markets: { [STATION]: {
    // 2 cr on a 100 cr board: under MARKET_MOVE_MIN_CR.
    cmdty_food: { lastMid: 102, history: [[state.simTime - (MARKET_WATCH_S + 40), 100], [state.simTime - 30, 101]] },
  } } };
  const observed={stationId:STATION,asOf:state.simTime,comparisons:{cmdty_food:{current:102,reference:100,observedAt:state.simTime-240}}};
  assert.equal(stationMarketLine(state, STATION, observed), null, 'a two-credit drift stays silent');
  state.economy.markets[STATION].cmdty_food = {
    lastMid: 106, history: [[state.simTime - (MARKET_WATCH_S + 40), 100], [state.simTime - 30, 105]],
  };
  observed.comparisons.cmdty_food.current=106;
  assert.equal(stationMarketLine(state, STATION, observed), null, 'six percent of the board is not a market move');
});

test('a market younger than a watch, or without history, leaves the desk wordless', () => {
  const state = baseState();
  state.economy = { markets: { [STATION]: {
    // Reference only 30 s old: the desk cannot claim "since the last bell" from scrap.
    cmdty_food: { lastMid: 130, history: [[state.simTime - 30, 100], [state.simTime - 10, 128]] },
  } } };
  assert.equal(stationMarketLine(state, STATION), null, 'a fresh board says nothing yet');
  delete state.economy.markets[STATION].cmdty_food.history;
  state.economy.markets[STATION].cmdty_food = { lastMid: 130 };
  assert.equal(stationMarketLine(state, STATION), null, 'no history, no claim');
  assert.equal(stationMarketLine(baseState(), STATION), null, 'no market at all, no claim');
  assert.equal(stationMarketLine(null, STATION), null);
});

test('the desk chime is a defined recipe that renders real sources and carries its caption', async () => {
  const recipe = RECIPES.find((r) => r.id === CHIME);
  assert.ok(recipe, `${CHIME} is in the shipped RECIPES catalog`);
  assert.equal(recipe.type, 'oscillator');
  assert.equal(recipe.repeatCount, 2, 'two soft strikes — a counter bell, not one ping');
  const caption = captions.captionForGameplayRecipe(CHIME, recipe, null);
  assert.ok(caption, 'the chime carries an accessibility caption');
  assert.equal(caption.baseText, 'The market desk chimes.');
  assert.equal(caption.authored, true, 'the row is authored, not a family fallback');
  assert.equal(caption.event, 'station.market');
});

/** A manual-clock presenter harness: pumped 500 ms ticks, recorded receipts and cues. */
function presenterHarness(stateOverrides = {}) {
  let t = 0;
  let scheduled = [];
  const receipts = [];
  const cues = [];
  const state = { ...baseState(), ...stateOverrides };
  const ctx = {
    state,
    bus: {
      emit: (event, payload) => { if (event === 'audio:cue') cues.push(payload); },
      on() {}, off() {},
    },
  };
  const p = createStationLifePresenter(ctx, {
    now: () => t,
    setTimeout: (fn) => { scheduled.push(fn); return scheduled.length; },
    clearTimeout: () => {},
    receiptVisible: () => false,
    showReceipt: (...a) => receipts.push(a),
  });
  const pump = (ticks) => {
    for (let i = 0; i < ticks; i += 1) {
      t += 500;
      const run = scheduled;
      scheduled = [];
      for (const fn of run) fn();
    }
  };
  return { p, pump, receipts, cues, state };
}

test('the presenter gives the desk one free PA slot per watch, then the ordinary rotation resumes', () => {
  const state = baseState();
  state.worldNews = { starved: { [`${STATION}:cmdty_ore_iron`]: 'Iron Ore is starved at Helios Station.' } };
  const { p, pump, receipts, cues } = presenterHarness(state);
  p.show();
  pump(220); // ~110 s of docked time: entry bell, the desk's slot, then the ordinary rotation
  const deskReceipts = receipts.filter((r) => r[0] === 'Market desk');
  assert.equal(deskReceipts.length, 1, 'the desk speaks once per watch, not on a loop');
  assert.match(deskReceipts[0][1], /Market desk: Iron Ore is starved at this berth\./);
  assert.ok(cues.some((c) => c.id === CHIME), 'the desk chime answers before the line');
  assert.ok(receipts.filter((r) => r[0] === 'Public address').length > 0,
    'the ordinary rotation keeps the floor after the desk has spoken');
  p.dispose();
});

test('a berth with no market news never schedules the desk — the PA stays exactly as it was', () => {
  const { p, pump, receipts, cues } = presenterHarness({});
  p.show();
  pump(90);
  assert.equal(receipts.filter((r) => r[0] === 'Market desk').length, 0, 'no desk line without news');
  assert.equal(cues.some((c) => c.id === CHIME), false, 'no chime without news');
  assert.ok(receipts.length > 0, 'the ordinary PA rotation still runs');
  p.dispose();
});

test('a retired visit cannot install its late worker comparison into a reopened berth', async () => {
  let clock=0, pending=[], timers=[], receipts=[];
  const state=baseState();
  const presenter=createStationLifePresenter({state,bus:{on(){},off(){},emit(){}}},{
    now:()=>clock,setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){},
    showReceipt:(...args)=>receipts.push(args),
    request:()=>new Promise(resolve=>pending.push(resolve)),
  });
  presenter.show();await Promise.resolve();assert.equal(pending.length,1);
  presenter.hide();presenter.show();await Promise.resolve();assert.equal(pending.length,2);
  const dto=(delta)=>({result:{observedComparisons:{stationId:STATION,asOf:state.simTime,
    comparisons:{cmdty_food:{reference:100,current:100+delta,observedAt:state.simTime-200}}}}});
  pending[1](dto(30));await new Promise(resolve=>setImmediate(resolve));
  pending[0](dto(60));await new Promise(resolve=>setImmediate(resolve));
  for(let i=0;i<180;i++){clock+=500;const scheduled=timers;timers=[];for(const fn of scheduled)fn();}
  const desk=receipts.find(x=>x[0]==='Market desk');assert.ok(desk);assert.match(desk[1],/up 30/);assert.doesNotMatch(desk[1],/up 60/);
  presenter.dispose();
});

test('a comparison from a replaced worker cannot speak in the current berth', async () => {
  const {installSimCommandSink,uninstallSimCommandSink}=await import('../src/core/simLaneCommands.js');
  let clock=0, resolveRequest, timers=[], receipts=[];const state=baseState();
  installSimCommandSink(()=>{});
  const presenter=createStationLifePresenter({state,bus:{on(){},off(){},emit(){}}},{now:()=>clock,
    setTimeout:fn=>(timers.push(fn),timers.length),clearTimeout(){},showReceipt:(...args)=>receipts.push(args),
    request:()=>new Promise(resolve=>{resolveRequest=resolve;})});
  try {
    presenter.show();await Promise.resolve();installSimCommandSink(()=>{});
    resolveRequest({result:{observedComparisons:{stationId:STATION,asOf:state.simTime,
      comparisons:{cmdty_food:{reference:100,current:160,observedAt:state.simTime-200}}}}});
    await new Promise(resolve=>setImmediate(resolve));
    for(let i=0;i<180;i++){clock+=500;const scheduled=timers;timers=[];for(const fn of scheduled)fn();}
    assert.equal(receipts.some(x=>x[0]==='Market desk'),false);
  } finally {presenter.dispose();uninstallSimCommandSink();}
});
