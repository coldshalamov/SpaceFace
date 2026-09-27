// WF-06 — honest market events: a spontaneous economy alert must name a good the
// station actually trades, and its type must follow the world the player can see.
//
// Before this unit rollSpontaneousEvent picked the commodity uniformly across all
// ~45 listings (most of them 'none'-role goods the station neither makes nor
// wants) and the type uniformly across shortage/boom/blockade/piracy, so a
// peaceful core sector could declare a blockade and a mining berth could "boom"
// Quantum Cores it has never stocked. The market-news dock card invites the
// player to trade the event ("buy elsewhere and sell high here") — the roll has
// to be believable before that invitation is honest.
//
// Proves, all on fixed seeds (4242 / 17700):
//   1. industry match — boom lands on produce-role lines, shortage/blockade on
//      consume-role lines, whenever the station hosts them;
//   2. blockade stays reachable through the production-weighted roll (the
//      pq-177.00 "blockade is not test-only" law) on seed 17700;
//   3. war weighting — a factions-owned war record raises blockade rolls vs the
//      same seed stream at peace;
//   4. security weighting — a lawless sector rolls more piracy than a core one.
//
// Run: node test/wf06-honest-market-events.test.mjs

import assert from 'node:assert/strict';
import test from 'node:test';

import { createSimulation } from '../src/core/sim.js';
import { economy } from '../src/systems/economy.js';
import { SECTORS } from '../src/data/sectors.js';

const SEED = 4242;

function withEconomy(seed, check) {
  const sim = createSimulation({ seed, systems: [economy], updateOrder: [] });
  try {
    const econ = sim.registry.get('economy');
    return check(econ, sim.state, sim);
  } finally {
    sim.dispose();
    economy._instance = null;
  }
}

/** Hand-build one warm market with known roles so the roll has a fixed playground. */
function warmMarket(state, stationId, produceIds, consumeIds, noneIds) {
  state.economy.markets[stationId] = {};
  const market = state.economy.markets[stationId];
  const mk = (id, role) => {
    market[id] = {
      stock: 100, equilibrium: 100, baseEq: 100, role,
      lastMid: 10, lastBuy: 11, lastSell: 9, eventMods: [],
      demandMult: 1, demandDrivers: [],
    };
  };
  for (const id of produceIds) mk(id, 'produce');
  for (const id of consumeIds) mk(id, 'consume');
  for (const id of noneIds) mk(id, 'none');
  return market;
}

/** Roll the production scheduler N times and classify what fired.
 *  Fired events are drained after every roll so the per-station event cap
 *  (MAX_EVENTS_PER_STATION = 3) never throttles a long batch — ageEvents only
 *  runs inside econTick, which these focused batches do not drive. */
function rollMany(econ, state, n) {
  const fired = [];
  for (let i = 0; i < n; i++) {
    const before = state.economy.econEvents.length;
    econ.rollSpontaneousEvent(state);
    if (state.economy.econEvents.length > before) {
      fired.push(state.economy.econEvents[state.economy.econEvents.length - 1]);
    }
    state.economy.econEvents.length = 0;
  }
  return fired;
}

test('spontaneous booms and shortages name the station industry, not a random shelf', () => {
  withEconomy(SEED, (econ, state) => {
    state.meta.seed = SEED;
    econ.resetRng();
    warmMarket(
      state,
      'station_helios',
      ['cmdty_regocrete', 'cmdty_food', 'cmdty_control_unit'], // produce-role lines
      ['cmdty_ore_iron', 'cmdty_medical'],                     // consume-role lines
      ['cmdty_gem_diamond', 'cmdty_stolen_goods'], // none-role noise the old roll could hit
    );
    const fired = rollMany(econ, state, 300);
    assert.ok(fired.length > 40, `the scheduler should fire often (got ${fired.length}/300 rolls)`);
    for (const ev of fired) {
      const role = state.economy.markets[ev.stationId][ev.commodityId].role;
      if (ev.type === 'boom') {
        assert.equal(role, 'produce', `${ev.type} fired on ${ev.commodityId} (role ${role}) — a surplus alert must name something the station makes`);
      } else if (ev.type === 'shortage' || ev.type === 'blockade') {
        assert.equal(role, 'consume', `${ev.type} fired on ${ev.commodityId} (role ${role}) — a supply alert must name something the station needs`);
      }
    }
    const types = new Set(fired.map((ev) => ev.type));
    for (const expected of ['shortage', 'boom', 'piracy', 'blockade']) {
      assert.ok(types.has(expected), `type ${expected} never fired in 300 production rolls`);
    }
  });
});

test('a station with no matching line still trades the event (fallback, never silence)', () => {
  withEconomy(SEED, (econ, state) => {
    state.meta.seed = SEED;
    econ.resetRng();
    // A bare exchange with only 'none'-role listings must not starve the event feed.
    warmMarket(state, 'station_ceres', [], [], ['cmdty_ore_copper', 'cmdty_electronics']);
    const fired = rollMany(econ, state, 200);
    assert.ok(fired.length > 20, `fallback keeps events firing (got ${fired.length}/200 rolls)`);
    for (const ev of fired) {
      assert.ok(state.economy.markets[ev.stationId][ev.commodityId], 'event names a real listing');
    }
  });
});

test('the blockade kind stays reachable through the production roll (pq-177.00 law)', () => {
  // The pinned pq-177-00-ticker test drives the production scheduler on seed 17700
  // and waits for a spontaneous blockade. World-weighting must not silence the kind
  // in a peaceful sector: prove it still fires on that exact seed and horizon.
  withEconomy(17700, (econ, state) => {
    state.meta.seed = 17700;
    econ.resetRng();
    econ.newGame();
    assert.ok(Object.keys(state.economy.markets).length > 0, 'home sector markets are warm');
    const fired = rollMany(econ, state, 60); // 3600 s horizon at ~90 s cadence
    assert.ok(
      fired.some((ev) => ev.type === 'blockade'),
      `no spontaneous blockade in 60 production rolls on seed 17700 (got types: `
      + `${fired.map((ev) => ev.type).join(',') || 'none'})`,
    );
  });
});

test('a factions-owned war record bubbles blockade alerts on the contested lane', () => {
  withEconomy(SEED, (econ, state) => {
    state.meta.seed = SEED;
    econ.resetRng();
    warmMarket(state, 'station_helios',
      ['cmdty_regocrete', 'cmdty_food'],
      ['cmdty_ore_iron', 'cmdty_medical'], []);
    // Peace: Helios Prime has a contested pair but no factions system owns a record.
    const peace = rollMany(econ, state, 400).filter((ev) => ev.type === 'blockade').length;
    // War: the same seed stream, the factions-owned pair at open war.
    econ.resetRng();
    state.economy.econEvents.length = 0;
    state.conflicts = {
      'faction_reach:faction_scn': { state: 'war', tension: 100, momentum: 0 },
    };
    const war = rollMany(econ, state, 400).filter((ev) => ev.type === 'blockade').length;
    assert.ok(
      war > peace,
      `war pressure must raise blockade rolls (war ${war} vs peace ${peace} of 400)`,
    );
    assert.ok(peace > 0, 'blockade stays possible in peace (pq-177 reachability)');
  });
});

test('piracy follows the sector security the chart already shows', () => {
  const lawless = SECTORS.filter((s) => Number.isFinite(s.security) && s.security <= 0.35)
    .sort((a, b) => a.security - b.security)[0];
  const lawlessStation = lawless && (lawless.stations || [])[0];
  assert.ok(lawlessStation, 'the galaxy authors a low-security sector');
  withEconomy(SEED, (econ, state) => {
    state.meta.seed = SEED;
    econ.resetRng();
    warmMarket(state, 'station_helios',
      ['cmdty_regocrete'], ['cmdty_ore_iron'], []);
    const core = rollMany(econ, state, 400).filter((ev) => ev.type === 'piracy').length;

    econ.resetRng();
    state.economy.econEvents.length = 0;
    // Re-home the same playground into the lawless sector: same market, same draws,
    // only the sector's security differs.
    const market = state.economy.markets.station_helios;
    delete state.economy.markets.station_helios;
    state.economy.markets[lawlessStation.id] = market;
    const rough = rollMany(econ, state, 400).filter((ev) => ev.type === 'piracy').length;

    assert.ok(
      rough > core,
      `a lawless sector must roll more piracy than a 0.98-security core (rough ${rough} vs core ${core} of 400)`,
    );
  });
});
